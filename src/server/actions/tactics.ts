"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import { db } from "@/db";
import {
  agents,
  maps,
  ROLE_GROUPS,
  ROUND_TYPES,
  TACTIC_OBJECT_KINDS,
  TACTIC_SIDES,
  tacticObjects,
  tactics,
  tacticSlots,
  tacticStages,
  type Member,
  type Tactic,
} from "@/db/schema";
import { requireMember } from "@/lib/auth";
import { createLogger, errorMeta } from "@/lib/logger";
import { canEditTactic, canManageSharedTactics, EDIT_DENIED_MESSAGE, SHARED_DENIED_MESSAGE } from "@/lib/tactics/permissions";
import { LAYER_HUES, MAX_FREEHAND_POINTS, MAX_OBJECTS_PER_STAGE, MAX_STAGES } from "@/lib/tactics/types";
import type { ActionResult } from "./auth";

/**
 * 전술 보드 서버 액션 (3단계).
 * 권한(기획서 4절 표 + 전술가 티어): 열람·복제는 모든 멤버, 수정·삭제는 작성자와 관리자, 공통 전술은 전술가도.
 * 판정은 src/lib/tactics/permissions.ts 의 순수 함수 하나로 모아 화면과 액션이 어긋나지 않게 한다.
 * 보드 저장은 "단계의 객체 목록을 통째로 교체"한다 — 객체 단위 CRUD보다 단순하고,
 * 마지막 저장이 이기는(last-write-wins) 기획서 전제와 맞는다.
 */
const log = createLogger("tactics");

const idSchema = z.string().uuid();
const nameSchema = z.string().trim().min(1, "전술 이름을 입력하세요").max(40, "40자 이내로 적어주세요");
const tagsSchema = z
  .string()
  .default("")
  .transform((s) =>
    [...new Set(s.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 8).map((t) => t.slice(0, 16)),
  );

function fieldErrorsOf(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) out[String(issue.path[0] ?? "form")] = issue.message;
  return out;
}

function parseJson(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function revalidateTactic(tactic: Pick<Tactic, "id" | "mapId">) {
  const map = await db.select({ slug: maps.slug }).from(maps).where(eq(maps.id, tactic.mapId)).get();
  if (map) revalidatePath(`/tactics/${map.slug}`);
  revalidatePath(`/tactics/board/${tactic.id}`);
  revalidatePath("/squad");
  // 랜딩의 "오늘의 스쿼드"는 맵별 공통 전술 수를 보여주므로 함께 갱신한다
  revalidatePath("/");
}

type Editable = { error: string; tactic?: undefined } | { error?: undefined; tactic: Tactic };

/** 작성자·관리자(공통 전술은 전술가 포함)만 통과. */
async function loadEditableTactic(tacticId: string, me: Member): Promise<Editable> {
  const tactic = await db.select().from(tactics).where(eq(tactics.id, tacticId)).get();
  if (!tactic) return { error: "전술을 찾을 수 없습니다" };
  if (!canEditTactic(tactic, me)) return { error: EDIT_DENIED_MESSAGE };
  return { tactic };
}

/** 체크박스 값("on"/"1"/"true") → boolean. 체크 안 하면 FormData에 키가 없으므로 null도 false. */
const checkboxSchema = z.preprocess((v) => v === "on" || v === "1" || v === "true" || v === true, z.boolean());
/** 우선도: 빈 문자열/누락 = 0(미지정), 1~20. */
const prioritySchema = z.preprocess((v) => (v === "" || v === null || v === undefined ? 0 : Number(v)), z.number().int().min(0).max(20, "우선도는 1~20 사이로 적어주세요"));

// ---------------------------------------------------------------------------
// 생성 · 메타 수정 · 삭제 · 복제
// ---------------------------------------------------------------------------
const createSchema = z.object({
  mapId: idSchema,
  name: nameSchema,
  side: z.enum(TACTIC_SIDES),
  roundType: z.enum(ROUND_TYPES),
  tags: tagsSchema,
  isShared: checkboxSchema,
  priority: prioritySchema,
});

export async function createTacticAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const parsed = createSchema.safeParse({
    mapId: formData.get("mapId"),
    name: formData.get("name"),
    side: formData.get("side"),
    roundType: formData.get("roundType") ?? "any",
    tags: formData.get("tags") ?? "",
    isShared: formData.get("isShared"),
    priority: formData.get("priority"),
  });
  if (!parsed.success) return { ok: false, error: "입력을 확인하세요", fieldErrors: fieldErrorsOf(parsed.error) };
  const v = parsed.data;
  // 공통 전술·우선도는 전술가 이상만. 화면에서 숨겨도 서버에서 다시 막는다.
  if ((v.isShared || v.priority > 0) && !canManageSharedTactics(me)) return { ok: false, error: SHARED_DENIED_MESSAGE };
  const id = randomUUID();
  let slug: string;
  try {
    const map = await db.select({ slug: maps.slug }).from(maps).where(eq(maps.id, v.mapId)).get();
    if (!map) return { ok: false, error: "맵을 찾을 수 없습니다" };
    slug = map.slug;
    // 레이어 색조: 그 맵에 있는 전술 수로 돌려가며 배정 (겹쳐보기에서 구분되도록)
    const existing = await db.select({ id: tactics.id }).from(tactics).where(eq(tactics.mapId, v.mapId));
    const layerHue = (existing.length % LAYER_HUES.length) + 1;
    await db.batch([
      db.insert(tactics).values({ id, mapId: v.mapId, name: v.name, side: v.side, roundType: v.roundType, tags: v.tags, authorId: me.id, layerHue, isShared: v.isShared, priority: v.isShared ? v.priority : 0 }),
      db.insert(tacticStages).values({ id: randomUUID(), tacticId: id, seq: 1, name: "셋업" }),
      // 슬롯 5개를 비어 있는 채로 만들어 두어 편집 화면에서 바로 역할을 채우게 한다
      db.insert(tacticSlots).values([1, 2, 3, 4, 5].map((slotNo) => ({ id: randomUUID(), tacticId: id, slotNo }))),
    ]);
    log.info("tactic created", { tacticId: id, by: me.id, mapId: v.mapId, isShared: v.isShared, priority: v.priority });
  } catch (err) {
    log.error("create tactic failed", errorMeta(err));
    return { ok: false, error: "전술 생성 중 오류가 났습니다" };
  }
  revalidatePath(`/tactics/${slug}`);
  revalidatePath("/");
  redirect(`/tactics/board/${id}`);
}

const metaSchema = createSchema.omit({ mapId: true }).extend({ tacticId: idSchema });

export async function updateTacticMetaAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const parsed = metaSchema.safeParse({
    tacticId: formData.get("tacticId"),
    name: formData.get("name"),
    side: formData.get("side"),
    roundType: formData.get("roundType") ?? "any",
    tags: formData.get("tags") ?? "",
    isShared: formData.get("isShared"),
    priority: formData.get("priority"),
  });
  if (!parsed.success) return { ok: false, error: "입력을 확인하세요", fieldErrors: fieldErrorsOf(parsed.error) };
  const v = parsed.data;
  try {
    const loaded = await loadEditableTactic(v.tacticId, me);
    if (loaded.error !== undefined) return { ok: false, error: loaded.error };
    // 공통 여부·우선도를 바꾸는 것은 전술가 이상만. 일반 멤버(작성자)는 기존 값을 유지한다.
    const manage = canManageSharedTactics(me);
    const isShared = manage ? v.isShared : loaded.tactic.isShared;
    const priority = manage ? (isShared ? v.priority : 0) : loaded.tactic.priority;
    await db
      .update(tactics)
      .set({ name: v.name, side: v.side, roundType: v.roundType, tags: v.tags, isShared, priority, updatedAt: new Date().toISOString() })
      .where(eq(tactics.id, v.tacticId));
    await revalidateTactic(loaded.tactic);
    return { ok: true };
  } catch (err) {
    log.error("update tactic meta failed", errorMeta(err));
    return { ok: false, error: "저장 중 오류가 났습니다" };
  }
}

export async function deleteTacticAction(formData: FormData): Promise<void> {
  const me = await requireMember();
  const tacticId = idSchema.parse(formData.get("tacticId"));
  const loaded = await loadEditableTactic(tacticId, me);
  if (loaded.error !== undefined) {
    log.warn("delete tactic refused", { tacticId, by: me.id, reason: loaded.error });
    return;
  }
  const map = await db.select({ slug: maps.slug }).from(maps).where(eq(maps.id, loaded.tactic.mapId)).get();
  await db.delete(tactics).where(eq(tactics.id, tacticId)); // 단계·객체·슬롯은 cascade
  log.warn("tactic deleted", { tacticId, by: me.id });
  revalidatePath("/squad");
  redirect(map ? `/tactics/${map.slug}` : "/tactics");
}

/** 복제 — 누구나 "내 버전으로 고쳐보기" (기획서 4절 권한 표). 작성자는 복제한 사람. 복제본은 항상 개인 전술(isShared=false). */
export async function duplicateTacticAction(formData: FormData): Promise<void> {
  const me = await requireMember();
  const tacticId = idSchema.parse(formData.get("tacticId"));
  const src = await db.select().from(tactics).where(eq(tactics.id, tacticId)).get();
  if (!src) return;
  const [stageRows, slotRows, existing] = await Promise.all([
    db.select().from(tacticStages).where(eq(tacticStages.tacticId, tacticId)),
    db.select().from(tacticSlots).where(eq(tacticSlots.tacticId, tacticId)),
    db.select({ id: tactics.id }).from(tactics).where(eq(tactics.mapId, src.mapId)),
  ]);
  const stageIds = stageRows.map((s) => s.id);
  const allObjects = stageIds.length ? await db.select().from(tacticObjects).where(inArray(tacticObjects.stageId, stageIds)) : [];

  const newId = randomUUID();
  const stageIdMap = new Map(stageRows.map((s) => [s.id, randomUUID()]));
  // 객체 간 연결(cast ↔ 핑)도 새 id로 옮긴다
  const objectIdMap = new Map(allObjects.map((o) => [o.id, randomUUID()]));
  const now = new Date().toISOString();

  const rest: BatchItem<"sqlite">[] = [];
  if (stageRows.length) {
    rest.push(db.insert(tacticStages).values(stageRows.map((s) => ({ id: stageIdMap.get(s.id)!, tacticId: newId, seq: s.seq, name: s.name, memo: s.memo }))));
  }
  if (slotRows.length) {
    rest.push(
      db.insert(tacticSlots).values(
        slotRows.map((s) => ({
          id: randomUUID(),
          tacticId: newId,
          slotNo: s.slotNo,
          roleGroup: s.roleGroup,
          agentId: s.agentId,
          description: s.description,
          positionHint: s.positionHint,
          fixedMemberId: s.fixedMemberId,
        })),
      ),
    );
  }
  if (allObjects.length) {
    rest.push(
      db.insert(tacticObjects).values(
        allObjects.map((o) => ({
          ...o,
          id: objectIdMap.get(o.id)!,
          stageId: stageIdMap.get(o.stageId)!,
          linkedObjectId: o.linkedObjectId ? (objectIdMap.get(o.linkedObjectId) ?? null) : null,
        })),
      ),
    );
  }
  await db.batch([
    db.insert(tactics).values({
      id: newId,
      mapId: src.mapId,
      side: src.side,
      roundType: src.roundType,
      name: `${src.name} (복제)`.slice(0, 40),
      tags: src.tags,
      authorId: me.id,
      layerHue: (existing.length % LAYER_HUES.length) + 1,
      isShared: false,
      priority: 0,
      createdAt: now,
      updatedAt: now,
    }),
    ...rest,
  ]);
  log.info("tactic duplicated", { from: tacticId, to: newId, by: me.id });
  await revalidateTactic(src);
  redirect(`/tactics/board/${newId}`);
}

// ---------------------------------------------------------------------------
// 단계(stage) — 추가(이전 단계 복사) · 이름 · 삭제
// ---------------------------------------------------------------------------
export async function addStageAction(formData: FormData): Promise<void> {
  const me = await requireMember();
  const tacticId = idSchema.parse(formData.get("tacticId"));
  const copyFrom = idSchema.nullable().parse(formData.get("copyFrom") || null);
  const loaded = await loadEditableTactic(tacticId, me);
  if (loaded.error !== undefined) return;
  const stageRows = await db.select().from(tacticStages).where(eq(tacticStages.tacticId, tacticId));
  if (stageRows.length >= MAX_STAGES) return;
  const seq = (stageRows.reduce((m, s) => Math.max(m, s.seq), 0) ?? 0) + 1;
  const newStageId = randomUUID();
  // 새 단계는 이전 단계를 복사해 시작한다 (기획서 4절 "동작")
  const source = copyFrom ? await db.select().from(tacticObjects).where(eq(tacticObjects.stageId, copyFrom)) : [];
  const idMap = new Map(source.map((o) => [o.id, randomUUID()]));
  await db.insert(tacticStages).values({ id: newStageId, tacticId, seq, name: `단계 ${seq}` });
  if (source.length) {
    await db.insert(tacticObjects).values(
      source.map((o) => ({
        ...o,
        id: idMap.get(o.id)!,
        stageId: newStageId,
        linkedObjectId: o.linkedObjectId ? (idMap.get(o.linkedObjectId) ?? null) : null,
      })),
    );
  }
  await db.update(tactics).set({ updatedAt: new Date().toISOString() }).where(eq(tactics.id, tacticId));
  await revalidateTactic(loaded.tactic);
}

const stageMetaSchema = z.object({
  stageId: idSchema,
  name: z.string().trim().max(20, "20자 이내").default(""),
  memo: z.string().trim().max(200, "200자 이내").default(""),
});

export async function updateStageMetaAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const parsed = stageMetaSchema.safeParse({ stageId: formData.get("stageId"), name: formData.get("name") ?? "", memo: formData.get("memo") ?? "" });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인하세요" };
  const stage = await db.select().from(tacticStages).where(eq(tacticStages.id, parsed.data.stageId)).get();
  if (!stage) return { ok: false, error: "단계를 찾을 수 없습니다" };
  const loaded = await loadEditableTactic(stage.tacticId, me);
  if (loaded.error !== undefined) return { ok: false, error: loaded.error };
  await db.update(tacticStages).set({ name: parsed.data.name, memo: parsed.data.memo }).where(eq(tacticStages.id, stage.id));
  await revalidateTactic(loaded.tactic);
  return { ok: true };
}

export async function deleteStageAction(formData: FormData): Promise<void> {
  const me = await requireMember();
  const stageId = idSchema.parse(formData.get("stageId"));
  const stage = await db.select().from(tacticStages).where(eq(tacticStages.id, stageId)).get();
  if (!stage) return;
  const loaded = await loadEditableTactic(stage.tacticId, me);
  if (loaded.error !== undefined) return;
  const count = await db.select({ id: tacticStages.id }).from(tacticStages).where(eq(tacticStages.tacticId, stage.tacticId));
  if (count.length <= 1) return; // 마지막 단계는 지울 수 없다
  await db.delete(tacticStages).where(eq(tacticStages.id, stageId));
  await revalidateTactic(loaded.tactic);
}

// ---------------------------------------------------------------------------
// 보드 저장 — 단계의 객체 목록 통째 교체
// ---------------------------------------------------------------------------
const unit = z.number().min(-0.5).max(1.5); // 맵 밖으로 조금 나가는 것은 허용(드래그 여유), 그 이상은 거부
const pointSchema = z.object({ x: unit, y: unit });
const objectSchema = z.object({
  id: idSchema,
  kind: z.enum(TACTIC_OBJECT_KINDS),
  x: unit,
  y: unit,
  // 자유 그리기가 가장 많은 점을 쓴다(클릭 경로는 MAX_PATH_POINTS, 편집기가 제한)
  points: z.array(pointSchema).max(MAX_FREEHAND_POINTS).default([]),
  radius: z.number().min(0.002).max(0.5).nullable().default(null),
  angle: z.number().min(5).max(360).nullable().default(null),
  length: z.number().min(0.005).max(1.5).nullable().default(null),
  rotation: z.number().min(-360).max(360).default(0),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
  label: z.string().trim().max(40).default(""),
  memo: z.string().trim().max(200).default(""),
  slotNo: z.number().int().min(1).max(5).nullable().default(null),
  team: z.enum(["ally", "enemy"]).nullable().default(null),
  casterAgentId: idSchema.nullable().default(null),
  abilityKey: z.string().trim().max(8).nullable().default(null),
  linkedObjectId: idSchema.nullable().default(null),
  externalUrl: z.string().trim().url("올바른 링크가 아닙니다").max(300).nullable().default(null),
  sortOrder: z.number().int().min(0).default(0),
});
const saveStageSchema = z.object({
  stageId: idSchema,
  objects: z.array(objectSchema).max(MAX_OBJECTS_PER_STAGE, `객체는 단계당 ${MAX_OBJECTS_PER_STAGE}개까지입니다`),
});

export type SaveStageResult = ActionResult & { savedAt?: string };

export async function saveStageAction(_prev: SaveStageResult | null, formData: FormData): Promise<SaveStageResult> {
  const me = await requireMember();
  const parsed = saveStageSchema.safeParse({ stageId: formData.get("stageId"), objects: parseJson(formData.get("objects")) });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "보드 데이터가 올바르지 않습니다" };
  const v = parsed.data;
  try {
    const stage = await db.select().from(tacticStages).where(eq(tacticStages.id, v.stageId)).get();
    if (!stage) return { ok: false, error: "단계를 찾을 수 없습니다" };
    const loaded = await loadEditableTactic(stage.tacticId, me);
    if (loaded.error !== undefined) return { ok: false, error: loaded.error };

    // 외부 키 검증: 시전 요원은 마스터에 있어야 하고, 연결 대상은 같은 저장 묶음 안에 있어야 한다
    const casterIds = [...new Set(v.objects.map((o) => o.casterAgentId).filter((x): x is string => Boolean(x)))];
    if (casterIds.length) {
      const found = await db.select({ id: agents.id }).from(agents).where(eq(agents.isActive, true));
      const ok = new Set(found.map((a) => a.id));
      if (casterIds.some((id) => !ok.has(id))) return { ok: false, error: "알 수 없는 요원이 있습니다" };
    }
    const ids = new Set(v.objects.map((o) => o.id));
    if (ids.size !== v.objects.length) return { ok: false, error: "객체 id가 중복됩니다" };
    const objects = v.objects.map((o, i) => ({
      ...o,
      stageId: v.stageId,
      sortOrder: i,
      linkedObjectId: o.linkedObjectId && ids.has(o.linkedObjectId) ? o.linkedObjectId : null,
    }));

    const now = new Date().toISOString();
    await db.batch([
      db.delete(tacticObjects).where(eq(tacticObjects.stageId, v.stageId)),
      ...(objects.length ? [db.insert(tacticObjects).values(objects)] : []),
      db.update(tactics).set({ updatedAt: now }).where(eq(tactics.id, stage.tacticId)),
    ]);
    log.info("stage saved", { stageId: v.stageId, tacticId: stage.tacticId, by: me.id, objects: objects.length });
    await revalidateTactic(loaded.tactic);
    return { ok: true, savedAt: now };
  } catch (err) {
    log.error("save stage failed", errorMeta(err));
    return { ok: false, error: "저장 중 오류가 났습니다" };
  }
}

// ---------------------------------------------------------------------------
// 슬롯 저장 — 5개 통째 교체
// ---------------------------------------------------------------------------
const slotSchema = z.object({
  slotNo: z.number().int().min(1).max(5),
  roleGroup: z.enum(ROLE_GROUPS).nullable().default(null),
  agentId: idSchema.nullable().default(null),
  description: z.string().trim().max(40).default(""),
  positionHint: z.string().trim().max(20).default(""),
  fixedMemberId: idSchema.nullable().default(null),
});
const saveSlotsSchema = z.object({ tacticId: idSchema, slots: z.array(slotSchema).length(5, "슬롯은 5개여야 합니다") });

export async function saveSlotsAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const parsed = saveSlotsSchema.safeParse({ tacticId: formData.get("tacticId"), slots: parseJson(formData.get("slots")) });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "슬롯 데이터가 올바르지 않습니다" };
  const v = parsed.data;
  if (new Set(v.slots.map((s) => s.slotNo)).size !== 5) return { ok: false, error: "슬롯 번호가 중복됩니다" };
  try {
    const loaded = await loadEditableTactic(v.tacticId, me);
    if (loaded.error !== undefined) return { ok: false, error: loaded.error };
    await db.batch([
      db.delete(tacticSlots).where(eq(tacticSlots.tacticId, v.tacticId)),
      db.insert(tacticSlots).values(v.slots.map((s) => ({ id: randomUUID(), tacticId: v.tacticId, ...s }))),
      db.update(tactics).set({ updatedAt: new Date().toISOString() }).where(eq(tactics.id, v.tacticId)),
    ]);
    await revalidateTactic(loaded.tactic);
    return { ok: true };
  } catch (err) {
    log.error("save slots failed", errorMeta(err));
    return { ok: false, error: "저장 중 오류가 났습니다" };
  }
}

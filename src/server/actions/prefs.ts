"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { maps, memberMapPreferences, members } from "@/db/schema";
import { requireMember } from "@/lib/auth";
import { createLogger, errorMeta } from "@/lib/logger";
import type { ActionResult } from "./auth";

const log = createLogger("prefs");

/** 빈 문자열은 "선택 안 함"으로 간주해 null로 바꾼다. */
const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .pipe(z.string().uuid().nullable());

const prefSchema = z
  .object({
    mapId: z.string().uuid(),
    agent1Id: optionalId,
    agent2Id: optionalId,
    agent3Id: optionalId,
    attackPosition: z.string().trim().max(60, "60자 이내로 적어주세요").default(""),
    defensePosition: z.string().trim().max(60, "60자 이내로 적어주세요").default(""),
    confidence: z.coerce.number().int().min(1).max(5),
    memo: z.string().trim().max(200, "200자 이내로 적어주세요").default(""),
  })
  .superRefine((v, ctx) => {
    // 같은 요원을 두 순위에 넣는 것은 막는다 (편성 점수가 중복 계산됨)
    const ids = [v.agent1Id, v.agent2Id, v.agent3Id].filter((x): x is string => Boolean(x));
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["agent1Id"], message: "같은 요원을 두 번 고를 수 없습니다" });
    }
    if (!v.agent1Id && (v.agent2Id || v.agent3Id)) {
      ctx.addIssue({ code: "custom", path: ["agent1Id"], message: "1순위부터 채워주세요" });
    }
  });

/**
 * 내 선호 저장 (upsert). 본인 것만 저장할 수 있다 — memberId는 폼에서 받지 않고
 * 세션에서 꺼낸다. 폼 값으로 받으면 남의 선호를 덮어쓸 수 있기 때문.
 */
export async function saveMyPreferenceAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await requireMember();

  const parsed = prefSchema.safeParse({
    mapId: formData.get("mapId"),
    agent1Id: formData.get("agent1Id") ?? undefined,
    agent2Id: formData.get("agent2Id") ?? undefined,
    agent3Id: formData.get("agent3Id") ?? undefined,
    attackPosition: formData.get("attackPosition") ?? "",
    defensePosition: formData.get("defensePosition") ?? "",
    confidence: formData.get("confidence"),
    memo: formData.get("memo") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { ok: false, error: "입력을 확인하세요", fieldErrors };
  }
  const v = parsed.data;

  try {
    // 참조 무결성은 FK가 지켜주지만, 사용자에게 보여줄 메시지를 위해 맵 존재는 미리 확인
    const map = await db.select({ id: maps.id, slug: maps.slug }).from(maps).where(eq(maps.id, v.mapId)).get();
    if (!map) return { ok: false, error: "맵을 찾을 수 없습니다" };

    const now = new Date().toISOString();
    await db
      .insert(memberMapPreferences)
      .values({
        id: randomUUID(),
        memberId: me.id,
        mapId: v.mapId,
        agent1Id: v.agent1Id,
        agent2Id: v.agent2Id,
        agent3Id: v.agent3Id,
        attackPosition: v.attackPosition,
        defensePosition: v.defensePosition,
        confidence: v.confidence,
        memo: v.memo,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [memberMapPreferences.memberId, memberMapPreferences.mapId],
        set: {
          agent1Id: v.agent1Id,
          agent2Id: v.agent2Id,
          agent3Id: v.agent3Id,
          attackPosition: v.attackPosition,
          defensePosition: v.defensePosition,
          confidence: v.confidence,
          memo: v.memo,
          updatedAt: now,
        },
      });

    log.info("preference saved", { memberId: me.id, mapId: v.mapId });
    revalidatePath(`/prefs/${map.slug}`);
    revalidatePath("/prefs");
    return { ok: true };
  } catch (err) {
    log.error("preference save failed", { memberId: me.id, ...errorMeta(err) });
    return { ok: false, error: "저장 중 오류가 났습니다. 잠시 후 다시 시도하세요" };
  }
}

const sensSchema = z.object({
  dpi: z.coerce.number().int().min(100).max(32000).nullable(),
  sens: z.coerce.number().min(0.01).max(10).nullable(),
});

/** 내 감도(DPI·sens) 저장. 비워서 제출하면 null로 지운다. */
export async function saveMySensitivityAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const raw = {
    dpi: formData.get("dpi") === "" ? null : formData.get("dpi"),
    sens: formData.get("sens") === "" ? null : formData.get("sens"),
  };
  const parsed = sensSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "DPI는 100~32000, 감도는 0.01~10 사이로 입력하세요" };
  try {
    await db
      .update(members)
      .set({ dpi: parsed.data.dpi, sens: parsed.data.sens, updatedAt: new Date().toISOString() })
      .where(eq(members.id, me.id));
    revalidatePath("/prefs");
    return { ok: true };
  } catch (err) {
    log.error("sensitivity save failed", { memberId: me.id, ...errorMeta(err) });
    return { ok: false, error: "저장 중 오류가 났습니다" };
  }
}

const crosshairSchema = z.string().trim().max(200, "200자 이내로 입력하세요");

/** 내 크로스헤어 코드 저장 (4단계 유틸). 형식 검증은 하지 않는다 — 게임이 받아 주는 문자열이면 된다. */
export async function saveMyCrosshairAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const parsed = crosshairSchema.safeParse(formData.get("crosshairCode") ?? "");
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인하세요" };
  try {
    await db.update(members).set({ crosshairCode: parsed.data, updatedAt: new Date().toISOString() }).where(eq(members.id, me.id));
    revalidatePath("/tools");
    return { ok: true };
  } catch (err) {
    log.error("crosshair save failed", { memberId: me.id, ...errorMeta(err) });
    return { ok: false, error: "저장 중 오류가 났습니다" };
  }
}

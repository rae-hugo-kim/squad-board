"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  agents,
  maps,
  MATCH_RESULTS,
  members,
  sessionMatches,
  sessionMatchPlayers,
  sessionParticipants,
  sessions,
  type Member,
  type SessionMatch,
} from "@/db/schema";
import { requireAdmin, requireMember } from "@/lib/auth";
import { isValidDateString } from "@/lib/date";
import { createLogger, errorMeta } from "@/lib/logger";
import { composeSquads, MAX_PARTICIPANTS, TEAM_SIZE } from "@/lib/squad/compose";
import { loadComposeInput } from "@/server/queries/squad";
import type { ActionResult } from "./auth";

/**
 * 세션 기록 서버 액션 (기획서 6절).
 *
 * 권한 규칙 (기획서 "스냅샷 확정: 확정 후에는 관리자만 수정"):
 *   - 세션·경기 생성, 미확정 경기 수정·확정: 모든 멤버
 *   - 확정된 경기 수정·확정 해제, 세션 삭제: 관리자
 * 모든 액션은 첫 줄에서 requireMember()/requireAdmin()으로 호출자를 확정한다.
 */
const log = createLogger("sessions");

const dateSchema = z.string().refine(isValidDateString, "날짜는 YYYY-MM-DD 형식이어야 합니다");
const idSchema = z.string().uuid();
const idListSchema = z.array(idSchema).min(1, "참가자를 1명 이상 고르세요").max(MAX_PARTICIPANTS, `참가자는 최대 ${MAX_PARTICIPANTS}명입니다`);
const memoSchema = z.string().trim().max(300, "300자 이내로 적어주세요").default("");
const scoreSchema = z.coerce.number().int().min(0).max(99).nullable();
/** 빈 문자열은 "미입력"(null) */
const emptyToNull = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : v);

function fieldErrorsOf(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) out[String(issue.path[0] ?? "form")] = issue.message;
  return out;
}

function revalidateSessions(sessionId?: string) {
  revalidatePath("/sessions");
  revalidatePath("/sessions/stats");
  if (sessionId) revalidatePath(`/sessions/${sessionId}`);
}

/** 참가자 id 목록이 모두 활성 멤버인지 확인하고 Member 행을 돌려준다. */
async function loadActiveMembers(ids: string[]): Promise<Member[] | null> {
  const rows = await db
    .select()
    .from(members)
    .where(and(inArray(members.id, ids), eq(members.isActive, true)));
  return rows.length === new Set(ids).size ? rows : null;
}

// ---------------------------------------------------------------------------
// 세션 생성 (수동) — 날짜 + 참가자 + 메모
// ---------------------------------------------------------------------------
const createSessionSchema = z.object({ date: dateSchema, memo: memoSchema, memberIds: idListSchema });

export async function createSessionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const parsed = createSessionSchema.safeParse({
    date: formData.get("date"),
    memo: formData.get("memo") ?? "",
    memberIds: formData.getAll("memberIds"),
  });
  if (!parsed.success) return { ok: false, error: "입력을 확인하세요", fieldErrors: fieldErrorsOf(parsed.error) };

  const sessionId = randomUUID();
  try {
    const found = await loadActiveMembers(parsed.data.memberIds);
    if (!found) return { ok: false, error: "참가자 목록에 활성 상태가 아닌 멤버가 있습니다" };
    await insertSession(sessionId, parsed.data.date, parsed.data.memo, me.id, parsed.data.memberIds);
    log.info("session created", { sessionId, by: me.id, participants: parsed.data.memberIds.length });
  } catch (err) {
    log.error("create session failed", errorMeta(err));
    return { ok: false, error: "세션 생성 중 오류가 났습니다" };
  }
  revalidateSessions(sessionId);
  redirect(`/sessions/${sessionId}`);
}

async function insertSession(id: string, date: string, memo: string, createdBy: string, memberIds: string[]) {
  // libsql 클라이언트는 트랜잭션을 지원하지만, 두 insert 사이에 실패하면 세션만 남는 정도라
  // 소모임 규모에서는 batch로 충분하다. 실패 시 사용자가 다시 만들면 된다.
  await db.batch([
    db.insert(sessions).values({ id, date, memo, createdBy }),
    db.insert(sessionParticipants).values([...new Set(memberIds)].map((memberId) => ({ sessionId: id, memberId }))),
  ]);
}

// ---------------------------------------------------------------------------
// 편성 확정 → 세션 + 1경기 생성 (기획서 5절 "확정 버튼을 누르면 Session에 기록")
// ---------------------------------------------------------------------------
const slotSchema = z.object({
  memberId: idSchema,
  agentId: idSchema.nullable(),
  position: z.string().trim().max(120).default(""),
});
const fromSquadSchema = z
  .object({
    date: dateSchema,
    mapId: idSchema,
    slots: z.array(slotSchema).min(1, "슬롯이 비어 있습니다").max(TEAM_SIZE, `한 경기 출전은 최대 ${TEAM_SIZE}명입니다`),
    bench: z.array(idSchema).default([]),
  })
  .superRefine((v, ctx) => {
    const agentIds = v.slots.map((s) => s.agentId).filter((x): x is string => Boolean(x));
    if (new Set(agentIds).size !== agentIds.length) ctx.addIssue({ code: "custom", path: ["slots"], message: "같은 요원이 두 번 들어 있습니다" });
    const memberIds = [...v.slots.map((s) => s.memberId), ...v.bench];
    if (new Set(memberIds).size !== memberIds.length) ctx.addIssue({ code: "custom", path: ["slots"], message: "같은 멤버가 두 번 들어 있습니다" });
  });

function parseJsonField(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function createSessionFromSquadAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const parsed = fromSquadSchema.safeParse({
    date: formData.get("date"),
    mapId: formData.get("mapId"),
    slots: parseJsonField(formData.get("slots")),
    bench: parseJsonField(formData.get("bench")) ?? [],
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인하세요", fieldErrors: fieldErrorsOf(parsed.error) };
  const v = parsed.data;

  const sessionId = randomUUID();
  try {
    const allIds = [...v.slots.map((s) => s.memberId), ...v.bench];
    const [found, map, agentRows] = await Promise.all([
      loadActiveMembers(allIds),
      db.select({ id: maps.id }).from(maps).where(eq(maps.id, v.mapId)).get(),
      db.select({ id: agents.id }).from(agents),
    ]);
    if (!found) return { ok: false, error: "참가자 목록에 활성 상태가 아닌 멤버가 있습니다" };
    if (!map) return { ok: false, error: "맵을 찾을 수 없습니다" };
    const agentIds = new Set(agentRows.map((a) => a.id));
    if (v.slots.some((s) => s.agentId && !agentIds.has(s.agentId))) return { ok: false, error: "알 수 없는 요원이 있습니다" };

    const matchId = randomUUID();
    await insertSession(sessionId, v.date, "", me.id, allIds);
    await db.batch([
      db.insert(sessionMatches).values({ id: matchId, sessionId, seq: 1, mapId: v.mapId, result: null }),
      db.insert(sessionMatchPlayers).values(
        v.slots.map((s) => ({ id: randomUUID(), matchId, memberId: s.memberId, agentId: s.agentId, position: s.position })),
      ),
    ]);
    log.info("session created from squad", { sessionId, matchId, by: me.id, slots: v.slots.length, bench: v.bench.length });
  } catch (err) {
    log.error("create session from squad failed", errorMeta(err));
    return { ok: false, error: "세션 생성 중 오류가 났습니다" };
  }
  revalidateSessions(sessionId);
  revalidatePath("/squad");
  redirect(`/sessions/${sessionId}`);
}

// ---------------------------------------------------------------------------
// 세션 수정·삭제
// ---------------------------------------------------------------------------
const updateSessionSchema = z.object({ sessionId: idSchema, date: dateSchema, memo: memoSchema, memberIds: idListSchema });

export async function updateSessionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const parsed = updateSessionSchema.safeParse({
    sessionId: formData.get("sessionId"),
    date: formData.get("date"),
    memo: formData.get("memo") ?? "",
    memberIds: formData.getAll("memberIds"),
  });
  if (!parsed.success) return { ok: false, error: "입력을 확인하세요", fieldErrors: fieldErrorsOf(parsed.error) };
  const v = parsed.data;
  try {
    const found = await loadActiveMembers(v.memberIds);
    if (!found) return { ok: false, error: "참가자 목록에 활성 상태가 아닌 멤버가 있습니다" };
    const existing = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, v.sessionId)).get();
    if (!existing) return { ok: false, error: "세션을 찾을 수 없습니다" };
    // 참가자는 통째로 바꾼다. 이미 경기에 들어간 멤버의 스냅샷(session_match_players)은 그대로 남는다.
    await db.batch([
      db.update(sessions).set({ date: v.date, memo: v.memo, updatedAt: new Date().toISOString() }).where(eq(sessions.id, v.sessionId)),
      db.delete(sessionParticipants).where(eq(sessionParticipants.sessionId, v.sessionId)),
      db.insert(sessionParticipants).values([...new Set(v.memberIds)].map((memberId) => ({ sessionId: v.sessionId, memberId }))),
    ]);
    log.info("session updated", { sessionId: v.sessionId, by: me.id });
    revalidateSessions(v.sessionId);
    return { ok: true };
  } catch (err) {
    log.error("update session failed", errorMeta(err));
    return { ok: false, error: "저장 중 오류가 났습니다" };
  }
}

export async function deleteSessionAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = idSchema.parse(formData.get("sessionId"));
  // FK cascade로 참가자·경기·스냅샷이 함께 지워진다.
  await db.delete(sessions).where(eq(sessions.id, id));
  log.warn("session deleted", { sessionId: id, by: me.id });
  revalidateSessions();
  redirect("/sessions");
}

// ---------------------------------------------------------------------------
// 경기 추가 — 맵 + 출전 멤버(≤5). 요원·포지션은 편성기로 미리 채운다.
// ---------------------------------------------------------------------------
const addMatchSchema = z.object({
  sessionId: idSchema,
  mapId: idSchema,
  playerIds: z.array(idSchema).min(1, "출전 멤버를 1명 이상 고르세요").max(TEAM_SIZE, `출전은 최대 ${TEAM_SIZE}명입니다`),
});

export async function addMatchAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const parsed = addMatchSchema.safeParse({
    sessionId: formData.get("sessionId"),
    mapId: formData.get("mapId"),
    playerIds: formData.getAll("playerIds"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인하세요", fieldErrors: fieldErrorsOf(parsed.error) };
  const v = parsed.data;
  try {
    const [session, participants, map] = await Promise.all([
      db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, v.sessionId)).get(),
      db.select({ memberId: sessionParticipants.memberId }).from(sessionParticipants).where(eq(sessionParticipants.sessionId, v.sessionId)),
      db.select({ id: maps.id }).from(maps).where(eq(maps.id, v.mapId)).get(),
    ]);
    if (!session) return { ok: false, error: "세션을 찾을 수 없습니다" };
    if (!map) return { ok: false, error: "맵을 찾을 수 없습니다" };
    const participantIds = new Set(participants.map((p) => p.memberId));
    if (v.playerIds.some((id) => !participantIds.has(id))) return { ok: false, error: "출전 멤버는 세션 참가자 중에서 골라야 합니다" };

    // 초기값: 이 맵 선호로 편성기를 돌려 중복 없는 요원 배정을 받는다 (경기 추가 시 입력 부담을 줄이기 위함).
    const input = await loadComposeInput(v.mapId, v.playerIds);
    const slots = composeSquads({ members: input.members, agents: input.agents, limit: 1 }).compositions[0]?.slots ?? [];
    const slotByMember = new Map(slots.map((s) => [s.memberId, s]));

    const seqRow = await db.select({ seq: max(sessionMatches.seq) }).from(sessionMatches).where(eq(sessionMatches.sessionId, v.sessionId)).get();
    const matchId = randomUUID();
    await db.batch([
      db.insert(sessionMatches).values({ id: matchId, sessionId: v.sessionId, seq: (seqRow?.seq ?? 0) + 1, mapId: v.mapId, result: null }),
      db.insert(sessionMatchPlayers).values(
        v.playerIds.map((memberId) => {
          const s = slotByMember.get(memberId);
          return {
            id: randomUUID(),
            matchId,
            memberId,
            agentId: s?.agentId ?? null,
            position: s ? [s.attackPosition, s.defensePosition].filter(Boolean).join(" / ") : "",
          };
        }),
      ),
      db.update(sessions).set({ updatedAt: new Date().toISOString() }).where(eq(sessions.id, v.sessionId)),
    ]);
    log.info("match added", { sessionId: v.sessionId, matchId, by: me.id, players: v.playerIds.length });
    revalidateSessions(v.sessionId);
    return { ok: true };
  } catch (err) {
    log.error("add match failed", errorMeta(err));
    return { ok: false, error: "경기 추가 중 오류가 났습니다" };
  }
}

// ---------------------------------------------------------------------------
// 경기 수정 — 결과·스코어·메모 + 멤버별 요원·포지션·K/D/A
// ---------------------------------------------------------------------------
const statSchema = z.coerce.number().int().min(0).max(200).nullable();
const playerUpdateSchema = z.object({
  playerId: idSchema,
  agentId: idSchema.nullable(),
  position: z.string().trim().max(120, "120자 이내").default(""),
  kills: statSchema,
  deaths: statSchema,
  assists: statSchema,
  memo: z.string().trim().max(120, "120자 이내").default(""),
});
const updateMatchSchema = z
  .object({
    matchId: idSchema,
    result: z.enum(MATCH_RESULTS).nullable(),
    scoreAlly: scoreSchema,
    scoreEnemy: scoreSchema,
    memo: memoSchema,
    players: z.array(playerUpdateSchema),
  })
  .superRefine((v, ctx) => {
    const ids = v.players.map((p) => p.agentId).filter((x): x is string => Boolean(x));
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["players"], message: "한 경기에 같은 요원이 둘일 수 없습니다" });
    if ((v.scoreAlly === null) !== (v.scoreEnemy === null)) ctx.addIssue({ code: "custom", path: ["scoreAlly"], message: "스코어는 아군·적군을 함께 입력하세요" });
  });

/** 폼 필드 이름 규약: p_<playerId>_<field>. 멤버 행 수가 가변이라 접두사로 묶어 읽는다. */
function collectPlayers(formData: FormData): unknown[] {
  const ids = formData.getAll("playerIds").map(String);
  return ids.map((playerId) => ({
    playerId,
    agentId: emptyToNull(formData.get(`p_${playerId}_agentId`)),
    position: formData.get(`p_${playerId}_position`) ?? "",
    kills: emptyToNull(formData.get(`p_${playerId}_kills`)),
    deaths: emptyToNull(formData.get(`p_${playerId}_deaths`)),
    assists: emptyToNull(formData.get(`p_${playerId}_assists`)),
    memo: formData.get(`p_${playerId}_memo`) ?? "",
  }));
}

type EditableMatch = { error: string; match?: undefined } | { error?: undefined; match: SessionMatch };

/** 확정된 경기는 관리자만 손댈 수 있다. 통과하면 경기 행을 돌려준다. */
async function loadEditableMatch(matchId: string, me: Member): Promise<EditableMatch> {
  const match = await db.select().from(sessionMatches).where(eq(sessionMatches.id, matchId)).get();
  if (!match) return { error: "경기를 찾을 수 없습니다" };
  if (match.isConfirmed && me.role !== "admin") return { error: "확정된 경기는 관리자만 수정할 수 있습니다" };
  return { match };
}

export async function updateMatchAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await requireMember();
  const parsed = updateMatchSchema.safeParse({
    matchId: formData.get("matchId"),
    result: emptyToNull(formData.get("result")),
    scoreAlly: emptyToNull(formData.get("scoreAlly")),
    scoreEnemy: emptyToNull(formData.get("scoreEnemy")),
    memo: formData.get("memo") ?? "",
    players: collectPlayers(formData),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인하세요", fieldErrors: fieldErrorsOf(parsed.error) };
  const v = parsed.data;
  try {
    const loaded = await loadEditableMatch(v.matchId, me);
    if (loaded.error !== undefined) return { ok: false, error: loaded.error };
    const existing = await db.select({ id: sessionMatchPlayers.id }).from(sessionMatchPlayers).where(eq(sessionMatchPlayers.matchId, v.matchId));
    const existingIds = new Set(existing.map((p) => p.id));
    if (v.players.some((p) => !existingIds.has(p.playerId))) return { ok: false, error: "경기에 없는 멤버 행이 포함되어 있습니다" };

    const now = new Date().toISOString();
    await db.batch([
      db
        .update(sessionMatches)
        .set({ result: v.result, scoreAlly: v.scoreAlly, scoreEnemy: v.scoreEnemy, memo: v.memo, updatedAt: now })
        .where(eq(sessionMatches.id, v.matchId)),
      ...v.players.map((p) =>
        db
          .update(sessionMatchPlayers)
          .set({ agentId: p.agentId, position: p.position, kills: p.kills, deaths: p.deaths, assists: p.assists, memo: p.memo })
          .where(eq(sessionMatchPlayers.id, p.playerId)),
      ),
    ]);
    log.info("match updated", { matchId: v.matchId, by: me.id, result: v.result });
    revalidateSessions(loaded.match.sessionId);
    return { ok: true };
  } catch (err) {
    log.error("update match failed", errorMeta(err));
    return { ok: false, error: "저장 중 오류가 났습니다" };
  }
}

// ---------------------------------------------------------------------------
// 확정 / 확정 해제 / 삭제 — <form action>으로 직접 호출하는 단순 액션
// ---------------------------------------------------------------------------
export async function confirmMatchAction(formData: FormData): Promise<void> {
  const me = await requireMember();
  const matchId = idSchema.parse(formData.get("matchId"));
  const match = await db.select().from(sessionMatches).where(eq(sessionMatches.id, matchId)).get();
  if (!match || match.isConfirmed) return;
  if (!match.result) {
    // 화면에서 결과 없는 경기는 확정 버튼을 비활성화하지만, 직접 호출에 대비해 서버도 거른다.
    log.warn("confirm refused: no result", { matchId, by: me.id });
    return;
  }
  const now = new Date().toISOString();
  await db.update(sessionMatches).set({ isConfirmed: true, confirmedAt: now, updatedAt: now }).where(eq(sessionMatches.id, matchId));
  log.info("match confirmed", { matchId, by: me.id });
  revalidateSessions(match.sessionId);
}

export async function unconfirmMatchAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const matchId = idSchema.parse(formData.get("matchId"));
  const match = await db.select().from(sessionMatches).where(eq(sessionMatches.id, matchId)).get();
  if (!match) return;
  await db
    .update(sessionMatches)
    .set({ isConfirmed: false, confirmedAt: null, updatedAt: new Date().toISOString() })
    .where(eq(sessionMatches.id, matchId));
  log.info("match unconfirmed", { matchId, by: me.id });
  revalidateSessions(match.sessionId);
}

export async function deleteMatchAction(formData: FormData): Promise<void> {
  const me = await requireMember();
  const matchId = idSchema.parse(formData.get("matchId"));
  const loaded = await loadEditableMatch(matchId, me);
  if (loaded.error !== undefined) {
    log.warn("delete refused", { matchId, by: me.id, reason: loaded.error });
    return;
  }
  await db.delete(sessionMatches).where(eq(sessionMatches.id, matchId)); // 스냅샷 행은 cascade
  log.warn("match deleted", { matchId, by: me.id });
  revalidateSessions(loaded.match.sessionId);
}

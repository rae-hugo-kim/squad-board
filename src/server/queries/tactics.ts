import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  maps,
  members,
  sessionMatches,
  sessionMatchTactics,
  tacticObjects,
  tactics,
  tacticSlots,
  tacticStages,
  type Agent,
  type GameMap,
  type MatchResult,
  type Tactic,
  type TacticObject,
  type TacticSlot,
  type TacticStage,
} from "@/db/schema";
import type { ComposeTactic } from "@/lib/squad/compose";

/**
 * 전술 보드 조회 (3단계). 전술 1건 = 레이어 1장이고, 단계(stage)마다 객체 목록을 통째로 읽는다.
 * 세션 조회와 같은 이유로 조인 대신 메모리에서 묶는다 (소모임 규모).
 */

export type AuthorLite = { id: string; nickname: string; color: string } | null;

export type TacticListItem = {
  tactic: Tactic;
  author: AuthorLite;
  stageCount: number;
  objectCount: number;
  slotsFilled: number;
};

export type StageWithObjects = TacticStage & { objects: TacticObject[] };

export type TacticDetail = {
  tactic: Tactic;
  map: GameMap;
  author: AuthorLite;
  stages: StageWithObjects[];
  slots: TacticSlot[];
};

async function loadAuthors(ids: Array<string | null>): Promise<Map<string, NonNullable<AuthorLite>>> {
  const clean = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (clean.length === 0) return new Map();
  const rows = await db.select({ id: members.id, nickname: members.nickname, color: members.color }).from(members).where(inArray(members.id, clean));
  return new Map(rows.map((m) => [m.id, m]));
}

/** 맵의 전술 목록 — 최근 수정 순. 필터(진영·라운드·태그)는 화면에서 건다(수십 건 규모). */
export async function listTacticsForMap(mapId: string): Promise<TacticListItem[]> {
  const rows = await db.select().from(tactics).where(eq(tactics.mapId, mapId)).orderBy(desc(tactics.updatedAt));
  if (rows.length === 0) return [];
  const ids = rows.map((t) => t.id);
  const [stageRows, slotRows, authors] = await Promise.all([
    db.select({ id: tacticStages.id, tacticId: tacticStages.tacticId }).from(tacticStages).where(inArray(tacticStages.tacticId, ids)),
    db.select().from(tacticSlots).where(inArray(tacticSlots.tacticId, ids)),
    loadAuthors(rows.map((t) => t.authorId)),
  ]);
  const stageIds = stageRows.map((s) => s.id);
  const objectRows = stageIds.length
    ? await db.select({ stageId: tacticObjects.stageId }).from(tacticObjects).where(inArray(tacticObjects.stageId, stageIds))
    : [];
  const stageToTactic = new Map(stageRows.map((s) => [s.id, s.tacticId]));
  const objectCount = new Map<string, number>();
  for (const o of objectRows) {
    const t = stageToTactic.get(o.stageId);
    if (t) objectCount.set(t, (objectCount.get(t) ?? 0) + 1);
  }
  return rows.map((tactic) => ({
    tactic,
    author: tactic.authorId ? (authors.get(tactic.authorId) ?? null) : null,
    stageCount: stageRows.filter((s) => s.tacticId === tactic.id).length,
    objectCount: objectCount.get(tactic.id) ?? 0,
    slotsFilled: slotRows.filter((s) => s.tacticId === tactic.id && (s.roleGroup || s.agentId)).length,
  }));
}

export async function getTacticDetail(tacticId: string): Promise<TacticDetail | null> {
  const tactic = await db.select().from(tactics).where(eq(tactics.id, tacticId)).get();
  if (!tactic) return null;
  const [map, stageRows, slotRows, authors] = await Promise.all([
    db.select().from(maps).where(eq(maps.id, tactic.mapId)).get(),
    db.select().from(tacticStages).where(eq(tacticStages.tacticId, tacticId)).orderBy(asc(tacticStages.seq)),
    db.select().from(tacticSlots).where(eq(tacticSlots.tacticId, tacticId)).orderBy(asc(tacticSlots.slotNo)),
    loadAuthors([tactic.authorId]),
  ]);
  if (!map) return null;
  const stageIds = stageRows.map((s) => s.id);
  const objectRows = stageIds.length
    ? await db.select().from(tacticObjects).where(inArray(tacticObjects.stageId, stageIds)).orderBy(asc(tacticObjects.sortOrder))
    : [];
  return {
    tactic,
    map,
    author: tactic.authorId ? (authors.get(tactic.authorId) ?? null) : null,
    stages: stageRows.map((s) => ({ ...s, objects: objectRows.filter((o) => o.stageId === s.id) })),
    slots: slotRows,
  };
}

/** 겹쳐보기용 — 여러 전술의 상세를 한 번에. 존재하지 않는 id는 건너뛴다. */
export async function getTacticsForOverlay(ids: string[]): Promise<TacticDetail[]> {
  const details = await Promise.all([...new Set(ids)].map((id) => getTacticDetail(id)));
  return details.filter((d): d is TacticDetail => Boolean(d));
}

export type TacticLite = Pick<Tactic, "id" | "name" | "side" | "roundType" | "layerHue">;

/** 선택 상자용 가벼운 목록 (편성기·경기 편집기) */
export async function listTacticsLite(mapId: string): Promise<TacticLite[]> {
  return db
    .select({ id: tactics.id, name: tactics.name, side: tactics.side, roundType: tactics.roundType, layerHue: tactics.layerHue })
    .from(tactics)
    .where(eq(tactics.mapId, mapId))
    .orderBy(asc(tactics.side), asc(tactics.name));
}

/** 편성기 입력용 — 전술 슬롯을 순수 함수가 받는 형태로 */
export async function loadComposeTactics(ids: string[]): Promise<ComposeTactic[]> {
  const clean = [...new Set(ids)];
  if (clean.length === 0) return [];
  const [rows, slotRows] = await Promise.all([
    db.select({ id: tactics.id, name: tactics.name }).from(tactics).where(inArray(tactics.id, clean)),
    db.select().from(tacticSlots).where(inArray(tacticSlots.tacticId, clean)),
  ]);
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    slots: slotRows
      .filter((s) => s.tacticId === t.id)
      .map((s) => ({
        slotNo: s.slotNo,
        roleGroup: s.roleGroup,
        agentId: s.agentId,
        description: s.description,
        positionHint: s.positionHint,
        fixedMemberId: s.fixedMemberId,
      })),
  }));
}

export async function listAgentsWithAbilities(): Promise<Agent[]> {
  return db.select().from(agents).where(eq(agents.isActive, true)).orderBy(asc(agents.sortOrder));
}

// ---------------------------------------------------------------------------
// 통계: 전술별 승률 (기획서 6절 "맵별 — 자주 쓴 전술과 그 전술의 승률")
// ---------------------------------------------------------------------------
export type TacticRecord = { tactic: TacticLite & { mapId: string }; matches: number; record: Record<MatchResult, number>; winRate: number };

export async function getTacticStats(): Promise<TacticRecord[]> {
  const [links, matchRows, tacticRows] = await Promise.all([
    db.select().from(sessionMatchTactics),
    db.select({ id: sessionMatches.id, result: sessionMatches.result }).from(sessionMatches),
    db
      .select({ id: tactics.id, name: tactics.name, side: tactics.side, roundType: tactics.roundType, layerHue: tactics.layerHue, mapId: tactics.mapId })
      .from(tactics),
  ]);
  const resultByMatch = new Map(matchRows.map((m) => [m.id, m.result]));
  const acc = new Map<string, TacticRecord>();
  for (const t of tacticRows) acc.set(t.id, { tactic: t, matches: 0, record: { win: 0, loss: 0, draw: 0 }, winRate: 0 });
  for (const l of links) {
    const result = resultByMatch.get(l.matchId);
    const cur = acc.get(l.tacticId);
    if (!cur || !result) continue;
    cur.matches += 1;
    cur.record[result] += 1;
  }
  return [...acc.values()]
    .filter((t) => t.matches > 0)
    .map((t) => {
      const decided = t.record.win + t.record.loss;
      return { ...t, winRate: decided ? Math.round((t.record.win / decided) * 100) : 0 };
    })
    .sort((a, b) => b.matches - a.matches || a.tactic.name.localeCompare(b.tactic.name));
}

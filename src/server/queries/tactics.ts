import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
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

export type TacticLite = Pick<Tactic, "id" | "name" | "side" | "roundType" | "layerHue" | "isShared" | "priority" | "updatedAt">;

const liteColumns = {
  id: tactics.id,
  name: tactics.name,
  side: tactics.side,
  roundType: tactics.roundType,
  layerHue: tactics.layerHue,
  isShared: tactics.isShared,
  priority: tactics.priority,
  updatedAt: tactics.updatedAt,
};

/** 선택 상자용 가벼운 목록 (편성기·경기 편집기). 공통 전술이 먼저 온다. */
export async function listTacticsLite(mapId: string): Promise<TacticLite[]> {
  return db.select(liteColumns).from(tactics).where(eq(tactics.mapId, mapId)).orderBy(desc(tactics.isShared), asc(tactics.side), asc(tactics.name));
}

/**
 * 우선도 순으로 정렬한 공통 전술 ("오늘의 스쿼드" 후보). priority 1이 맨 앞, 0(미지정)은 맨 뒤, 같으면 최근 수정 순.
 * 정렬은 메모리에서 한다 — "0은 가장 뒤" 규칙을 SQL 한 줄로 쓰기보다 읽기 쉽다.
 */
export function sortByPriority<T extends Pick<TacticLite, "priority" | "updatedAt">>(items: T[]): T[] {
  const rank = (p: number) => (p > 0 ? p : Number.MAX_SAFE_INTEGER);
  return [...items].sort((a, b) => rank(a.priority) - rank(b.priority) || b.updatedAt.localeCompare(a.updatedAt));
}

export async function listSharedTacticsLite(mapId: string): Promise<TacticLite[]> {
  const rows = await db.select(liteColumns).from(tactics).where(and(eq(tactics.mapId, mapId), eq(tactics.isShared, true)));
  return sortByPriority(rows);
}

/** 맵별 공통 전술 수 (랜딩의 맵 선택 상자에 "공통 전술 N개"로 표시) */
export async function countSharedTacticsByMap(): Promise<Map<string, number>> {
  const rows = await db.select({ mapId: tactics.mapId }).from(tactics).where(eq(tactics.isShared, true));
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.mapId, (out.get(r.mapId) ?? 0) + 1);
  return out;
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
    db.select({ ...liteColumns, mapId: tactics.mapId }).from(tactics),
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

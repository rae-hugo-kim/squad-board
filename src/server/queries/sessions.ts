import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  maps,
  members,
  sessionMatches,
  sessionMatchPlayers,
  sessionParticipants,
  sessions,
  type Agent,
  type GameMap,
  type MatchResult,
  type Session,
  type SessionMatch,
  type SessionMatchPlayer,
} from "@/db/schema";

/**
 * 세션 기록 조회 함수 모음 (기획서 6절 "조회 화면").
 *
 * 소모임 규모(세션 수백 건, 경기 수천 건 이하)를 전제로, 조인 대신 "필요한 표를 통째로 읽고
 * 메모리에서 묶는" 방식을 쓴다. 코드가 단순하고 SQLite 왕복이 적다. 규모가 커지면 그때 집계 SQL로 바꾼다.
 */

export type MemberLite = { id: string; nickname: string; color: string };

export type SessionSummary = {
  session: Session;
  participants: MemberLite[];
  matchCount: number;
  record: Record<MatchResult, number>;
  /** 결과 미입력 경기 수 */
  pendingCount: number;
  confirmedCount: number;
};

export type MatchPlayerRow = SessionMatchPlayer & { member: MemberLite; agent: Agent | null };
export type MatchRow = SessionMatch & { map: GameMap; players: MatchPlayerRow[] };

export type SessionDetail = {
  session: Session;
  participants: MemberLite[];
  matches: MatchRow[];
};

function emptyRecord(): Record<MatchResult, number> {
  return { win: 0, loss: 0, draw: 0 };
}

async function loadMemberLiteMap(ids?: string[]): Promise<Map<string, MemberLite>> {
  const rows =
    ids && ids.length === 0
      ? []
      : await db
          .select({ id: members.id, nickname: members.nickname, color: members.color })
          .from(members)
          .where(ids ? inArray(members.id, ids) : undefined);
  return new Map(rows.map((m) => [m.id, m]));
}

/** 날짜별 목록 — 최근 세션이 위. 참가자·경기 수·승패 요약을 함께 돌려준다. */
export async function listSessions(): Promise<SessionSummary[]> {
  const [sessionRows, partRows, matchRows] = await Promise.all([
    db.select().from(sessions).orderBy(desc(sessions.date), desc(sessions.createdAt)),
    db.select().from(sessionParticipants),
    db
      .select({ sessionId: sessionMatches.sessionId, result: sessionMatches.result, isConfirmed: sessionMatches.isConfirmed })
      .from(sessionMatches),
  ]);
  const memberMap = await loadMemberLiteMap();

  return sessionRows.map((session) => {
    const participants = partRows
      .filter((p) => p.sessionId === session.id)
      .map((p) => memberMap.get(p.memberId))
      .filter((m): m is MemberLite => Boolean(m))
      .sort((a, b) => a.nickname.localeCompare(b.nickname));
    const mine = matchRows.filter((m) => m.sessionId === session.id);
    const record = emptyRecord();
    for (const m of mine) if (m.result) record[m.result] += 1;
    return {
      session,
      participants,
      matchCount: mine.length,
      record,
      pendingCount: mine.filter((m) => !m.result).length,
      confirmedCount: mine.filter((m) => m.isConfirmed).length,
    };
  });
}

/** 세션 상세 — 경기와 경기별 멤버 스냅샷까지 한 번에. 없으면 null. */
export async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) return null;

  const [partRows, matchRows, mapRows, agentRows] = await Promise.all([
    db.select().from(sessionParticipants).where(eq(sessionParticipants.sessionId, sessionId)),
    db.select().from(sessionMatches).where(eq(sessionMatches.sessionId, sessionId)).orderBy(asc(sessionMatches.seq)),
    db.select().from(maps),
    db.select().from(agents),
  ]);
  const matchIds = matchRows.map((m) => m.id);
  const playerRows = matchIds.length
    ? await db.select().from(sessionMatchPlayers).where(inArray(sessionMatchPlayers.matchId, matchIds))
    : [];

  // 참가자 + (혹시 참가자 목록에서 빠졌지만 경기엔 있는) 멤버까지 한 번에 읽는다.
  const memberIds = [...new Set([...partRows.map((p) => p.memberId), ...playerRows.map((p) => p.memberId)])];
  const memberMap = await loadMemberLiteMap(memberIds);
  const mapById = new Map(mapRows.map((m) => [m.id, m]));
  const agentById = new Map(agentRows.map((a) => [a.id, a]));

  const participants = partRows
    .map((p) => memberMap.get(p.memberId))
    .filter((m): m is MemberLite => Boolean(m))
    .sort((a, b) => a.nickname.localeCompare(b.nickname));

  const matches: MatchRow[] = matchRows.flatMap((m) => {
    const map = mapById.get(m.mapId);
    if (!map) return []; // FK가 restrict라 일어나지 않지만, 타입을 위해 방어
    const players = playerRows
      .filter((p) => p.matchId === m.id)
      .map((p) => ({
        ...p,
        member: memberMap.get(p.memberId) ?? { id: p.memberId, nickname: "(알 수 없음)", color: "#5f6b76" },
        agent: p.agentId ? (agentById.get(p.agentId) ?? null) : null,
      }))
      .sort((a, b) => a.member.nickname.localeCompare(b.member.nickname));
    return [{ ...m, map, players }];
  });

  return { session, participants, matches };
}

// ---------------------------------------------------------------------------
// 통계 (멤버별 · 맵별). 확정 여부와 무관하게 "결과가 입력된" 모든 경기를 센다 —
// 확정은 "수정 잠금"이지 "집계 포함" 스위치가 아니다. 결과 없는 경기(편성만 한 상태)는 제외.
// ---------------------------------------------------------------------------

export type MapRecord = { map: GameMap; matches: number; record: Record<MatchResult, number>; winRate: number };

export type MemberStats = {
  member: MemberLite & { isActive: boolean };
  sessionCount: number;
  matches: number;
  record: Record<MatchResult, number>;
  winRate: number;
  perMap: MapRecord[];
  topAgents: Array<{ agent: Agent; count: number; wins: number }>;
  recent: Array<{ matchId: string; date: string; map: GameMap; result: MatchResult; agent: Agent | null; kda: string }>;
  kda: { kills: number; deaths: number; assists: number; counted: number };
};

function winRate(record: Record<MatchResult, number>): number {
  const decided = record.win + record.loss;
  return decided === 0 ? 0 : Math.round((record.win / decided) * 100);
}

function formatKda(p: { kills: number | null; deaths: number | null; assists: number | null }): string {
  if (p.kills == null && p.deaths == null && p.assists == null) return "";
  return `${p.kills ?? "-"}/${p.deaths ?? "-"}/${p.assists ?? "-"}`;
}

/** 결과가 확정된 경기만 묶는다. result가 null인 경기는 통계 대상이 아니다. */
type DecidedMatch = SessionMatch & { result: MatchResult };
type JoinedPlayer = SessionMatchPlayer & { match: DecidedMatch; session: Session };

async function loadJoinedPlayers(): Promise<{ joined: JoinedPlayer[]; mapById: Map<string, GameMap>; agentById: Map<string, Agent> }> {
  const [playerRows, matchRows, sessionRows, mapRows, agentRows] = await Promise.all([
    db.select().from(sessionMatchPlayers),
    db.select().from(sessionMatches),
    db.select().from(sessions),
    db.select().from(maps),
    db.select().from(agents),
  ]);
  const matchById = new Map(matchRows.map((m) => [m.id, m]));
  const sessionById = new Map(sessionRows.map((s) => [s.id, s]));
  const joined = playerRows.flatMap((p) => {
    const match = matchById.get(p.matchId);
    const session = match ? sessionById.get(match.sessionId) : undefined;
    return match && match.result && session ? [{ ...p, match: { ...match, result: match.result }, session }] : [];
  });
  return { joined, mapById: new Map(mapRows.map((m) => [m.id, m])), agentById: new Map(agentRows.map((a) => [a.id, a])) };
}

function buildPerMap(rows: JoinedPlayer[], mapById: Map<string, GameMap>): MapRecord[] {
  const acc = new Map<string, MapRecord>();
  for (const r of rows) {
    const map = mapById.get(r.match.mapId);
    if (!map) continue;
    const cur = acc.get(map.id) ?? { map, matches: 0, record: emptyRecord(), winRate: 0 };
    cur.matches += 1;
    cur.record[r.match.result] += 1;
    acc.set(map.id, cur);
  }
  return [...acc.values()]
    .map((m) => ({ ...m, winRate: winRate(m.record) }))
    .sort((a, b) => b.matches - a.matches || a.map.sortOrder - b.map.sortOrder);
}

function buildTopAgents(rows: JoinedPlayer[], agentById: Map<string, Agent>): MemberStats["topAgents"] {
  const acc = new Map<string, { agent: Agent; count: number; wins: number }>();
  for (const r of rows) {
    const agent = r.agentId ? agentById.get(r.agentId) : undefined;
    if (!agent) continue;
    const cur = acc.get(agent.id) ?? { agent, count: 0, wins: 0 };
    cur.count += 1;
    if (r.match.result === "win") cur.wins += 1;
    acc.set(agent.id, cur);
  }
  return [...acc.values()].sort((a, b) => b.count - a.count || a.agent.sortOrder - b.agent.sortOrder).slice(0, 5);
}

/** 멤버별 통계. 경기 기록이 한 건이라도 있는 멤버만 돌려준다 (비활성 포함 — 과거 기록 보존). */
export async function getMemberStats(): Promise<MemberStats[]> {
  const { joined, mapById, agentById } = await loadJoinedPlayers();
  const memberRows = await db
    .select({ id: members.id, nickname: members.nickname, color: members.color, isActive: members.isActive })
    .from(members);

  return memberRows
    .map((member) => {
      const mine = joined
        .filter((r) => r.memberId === member.id)
        .sort((a, b) => b.session.date.localeCompare(a.session.date) || b.match.seq - a.match.seq);
      const record = emptyRecord();
      const kda = { kills: 0, deaths: 0, assists: 0, counted: 0 };
      for (const r of mine) {
        record[r.match.result] += 1;
        if (r.kills != null || r.deaths != null || r.assists != null) {
          kda.kills += r.kills ?? 0;
          kda.deaths += r.deaths ?? 0;
          kda.assists += r.assists ?? 0;
          kda.counted += 1;
        }
      }
      return {
        member,
        sessionCount: new Set(mine.map((r) => r.session.id)).size,
        matches: mine.length,
        record,
        winRate: winRate(record),
        perMap: buildPerMap(mine, mapById),
        topAgents: buildTopAgents(mine, agentById),
        recent: mine.slice(0, 10).flatMap((r) => {
          const map = mapById.get(r.match.mapId);
          if (!map) return [];
          return [
            {
              matchId: r.match.id,
              date: r.session.date,
              map,
              result: r.match.result,
              agent: r.agentId ? (agentById.get(r.agentId) ?? null) : null,
              kda: formatKda(r),
            },
          ];
        }),
        kda,
      };
    })
    .filter((s) => s.matches > 0)
    .sort((a, b) => b.matches - a.matches || a.member.nickname.localeCompare(b.member.nickname));
}

/** 맵별 통계 — 경기 단위(멤버 중복 없이). 전술별 승률은 3단계에서 붙인다. */
export async function getMapStats(): Promise<MapRecord[]> {
  const [matchRows, mapRows] = await Promise.all([db.select().from(sessionMatches), db.select().from(maps)]);
  const acc = new Map<string, MapRecord>();
  for (const map of mapRows) acc.set(map.id, { map, matches: 0, record: emptyRecord(), winRate: 0 });
  for (const m of matchRows) {
    const cur = acc.get(m.mapId);
    if (!cur || !m.result) continue;
    cur.matches += 1;
    cur.record[m.result] += 1;
  }
  return [...acc.values()]
    .map((m) => ({ ...m, winRate: winRate(m.record) }))
    .sort((a, b) => b.matches - a.matches || a.map.sortOrder - b.map.sortOrder);
}

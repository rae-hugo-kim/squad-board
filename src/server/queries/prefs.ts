import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, maps, memberMapPreferences, members, type Agent, type GameMap, type Member } from "@/db/schema";

/**
 * 선호 DB 조회 함수 모음.
 * 화면(서버 컴포넌트)은 DB를 직접 만지지 않고 이 함수들을 통해 읽는다 —
 * 쿼리가 한 곳에 모여 있어야 스키마가 바뀔 때 고칠 곳이 분명하다.
 */

export async function listMaps(): Promise<GameMap[]> {
  return db.select().from(maps).orderBy(asc(maps.sortOrder));
}

export async function getMapBySlug(slug: string): Promise<GameMap | undefined> {
  return db.select().from(maps).where(eq(maps.slug, slug)).get();
}

export async function listActiveAgents(): Promise<Agent[]> {
  return db.select().from(agents).where(eq(agents.isActive, true)).orderBy(asc(agents.sortOrder));
}

export async function listActiveMembers(): Promise<Member[]> {
  return db.select().from(members).where(eq(members.isActive, true)).orderBy(asc(members.nickname));
}

/** 한 맵의 선호 행. 멤버별로 agent1~3가 Agent 객체로 풀려 있다. */
export type PreferenceRow = {
  member: Member;
  pref: {
    agent1: Agent | null;
    agent2: Agent | null;
    agent3: Agent | null;
    attackPosition: string;
    defensePosition: string;
    confidence: number;
    memo: string;
    updatedAt: string;
  } | null;
};

export async function listPreferencesForMap(mapId: string): Promise<PreferenceRow[]> {
  const [memberList, agentList, prefs] = await Promise.all([
    listActiveMembers(),
    listActiveAgents(),
    db.select().from(memberMapPreferences).where(eq(memberMapPreferences.mapId, mapId)),
  ]);
  const agentById = new Map(agentList.map((a) => [a.id, a]));
  const prefByMember = new Map(prefs.map((p) => [p.memberId, p]));

  return memberList.map((member) => {
    const p = prefByMember.get(member.id);
    return {
      member,
      pref: p
        ? {
            agent1: p.agent1Id ? (agentById.get(p.agent1Id) ?? null) : null,
            agent2: p.agent2Id ? (agentById.get(p.agent2Id) ?? null) : null,
            agent3: p.agent3Id ? (agentById.get(p.agent3Id) ?? null) : null,
            attackPosition: p.attackPosition,
            defensePosition: p.defensePosition,
            confidence: p.confidence,
            memo: p.memo,
            updatedAt: p.updatedAt,
          }
        : null,
    };
  });
}

export async function getMyPreference(memberId: string, mapId: string) {
  return db
    .select()
    .from(memberMapPreferences)
    .where(and(eq(memberMapPreferences.memberId, memberId), eq(memberMapPreferences.mapId, mapId)))
    .get();
}

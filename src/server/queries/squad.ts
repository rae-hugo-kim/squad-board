import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { agents, memberMapPreferences, members } from "@/db/schema";
import type { ComposeAgent, ComposeMember } from "@/lib/squad/compose";

/**
 * 편성기 입력 조립 — DB 행을 순수 함수(compose.ts)가 받는 형태로 바꾼다.
 * 비활성 멤버는 참가자로 받지 않는다(입장 목록에도 없는 사람).
 */
export async function loadComposeInput(
  mapId: string,
  memberIds: string[],
): Promise<{ members: ComposeMember[]; agents: ComposeAgent[] }> {
  if (memberIds.length === 0) return { members: [], agents: [] };
  const [memberRows, prefRows, agentRows] = await Promise.all([
    db
      .select({ id: members.id, nickname: members.nickname })
      .from(members)
      .where(and(inArray(members.id, memberIds), eq(members.isActive, true))),
    db
      .select()
      .from(memberMapPreferences)
      .where(and(eq(memberMapPreferences.mapId, mapId), inArray(memberMapPreferences.memberId, memberIds))),
    db
      .select({ id: agents.id, nameKo: agents.nameKo, roleGroup: agents.roleGroup })
      .from(agents)
      .where(eq(agents.isActive, true)),
  ]);
  const prefByMember = new Map(prefRows.map((p) => [p.memberId, p]));
  return {
    members: memberRows.map((m) => {
      const p = prefByMember.get(m.id);
      return {
        id: m.id,
        nickname: m.nickname,
        pref: p
          ? {
              agentIds: [p.agent1Id, p.agent2Id, p.agent3Id],
              confidence: p.confidence,
              attackPosition: p.attackPosition,
              defensePosition: p.defensePosition,
            }
          : null,
      };
    }),
    agents: agentRows,
  };
}

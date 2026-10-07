import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { composeSquads, tacticFeasibility } from "@/lib/squad/compose";
import { lineupQuery, parseLineupParam } from "@/lib/squad/lineup";
import { canEditTactic, canManageSharedTactics } from "@/lib/tactics/permissions";
import { listActiveMembers } from "@/server/queries/prefs";
import { loadComposeInput } from "@/server/queries/squad";
import { getTacticDetail, listAgentsWithAbilities, listSharedTacticsLite, loadComposeTactics, type TacticDetail } from "@/server/queries/tactics";
import { BoardEditor } from "@/components/tactic-board/board-editor";
import type { LineupData } from "@/components/tactic-board/lineup-panel";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string | string[] }> };

/**
 * ?m=<멤버 id,...> 가 있으면 "오늘의 라인업"을 계산한다 — 이 전술의 슬롯에 참가자를 배치한 상위 조합과,
 * 같은 맵의 다른 공통 전술 각각의 실행 가능 여부. 전술 데이터는 바꾸지 않는다(조회 시점 뷰).
 */
async function buildLineup(detail: TacticDetail, memberIds: string[], activeMembers: Array<{ id: string; nickname: string; color: string }>): Promise<LineupData | null> {
  const ids = memberIds.filter((id) => activeMembers.some((m) => m.id === id));
  if (ids.length === 0) return null;
  const [input, shared] = await Promise.all([loadComposeInput(detail.map.id, ids), listSharedTacticsLite(detail.map.id)]);
  const tacticIds = [...new Set([detail.tactic.id, ...shared.map((t) => t.id)])];
  const composeTactics = await loadComposeTactics(tacticIds);
  const mine = composeTactics.find((t) => t.id === detail.tactic.id);
  if (!mine) return null;
  const { compositions } = composeSquads({ members: input.members, agents: input.agents, tactics: [mine], limit: 1 });
  const composition = compositions[0];
  if (!composition) return null;
  const q = lineupQuery(ids);
  const alternatives = shared
    .filter((t) => t.id !== detail.tactic.id)
    .map((t) => {
      const ct = composeTactics.find((c) => c.id === t.id);
      // 참가자 전체를 후보로 한 빠른 판정 — 상위 조합 기준 판정은 그 보드로 들어가면 다시 계산한다
      const fz = ct ? tacticFeasibility(ct, input.members, input.agents) : { feasible: true, reasons: [] };
      return { id: t.id, name: t.name, priority: t.priority, feasible: fz.feasible, reasons: fz.reasons, href: `/tactics/board/${t.id}?${q}` };
    });
  const squadHref = `/squad?${new URLSearchParams([["map", detail.map.slug], ...ids.map((id) => ["m", id] as [string, string]), ["t", detail.tactic.id]])}`;
  return {
    members: activeMembers.filter((m) => ids.includes(m.id)).map((m) => ({ id: m.id, nickname: m.nickname, color: m.color })),
    agents: input.agents,
    composition,
    alternatives,
    squadHref,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const d = await getTacticDetail(id);
  return { title: d ? `${d.tactic.name} · ${d.map.nameKo}` : "전술" };
}

/** 전술 보드 편집기 페이지. 서버가 상세를 읽어 클라이언트 편집기에 넘긴다. 작성자·관리자만 편집. */
export default async function TacticBoardPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireMember();
  const detail = await getTacticDetail(id);
  if (!detail) notFound();
  const [agentList, memberList] = await Promise.all([listAgentsWithAbilities(), listActiveMembers()]);
  const canEdit = canEditTactic(detail.tactic, me);
  const lineupIds = parseLineupParam(sp.m);
  const lineup = lineupIds.length ? await buildLineup(detail, lineupIds, memberList) : null;

  return (
    <BoardEditor
      // key에 updatedAt을 넣지 않는다 — 저장 직후 리마운트되어 편집 상태·"저장됨" 표시가 사라진다 (2단계 인수인계의 함정).
      // 단계 수가 바뀔 때(추가·삭제)만 서버 상태로 다시 맞춘다.
      key={`${detail.tactic.id}-${detail.stages.length}`}
      tactic={{
        id: detail.tactic.id,
        name: detail.tactic.name,
        side: detail.tactic.side,
        roundType: detail.tactic.roundType,
        tags: detail.tactic.tags,
        layerHue: detail.tactic.layerHue,
        isShared: detail.tactic.isShared,
        priority: detail.tactic.priority,
        mapSlug: detail.map.slug,
        mapNameKo: detail.map.nameKo,
        mapNameEn: detail.map.nameEn,
        mapImage: detail.map.imagePath,
        callouts: detail.map.callouts,
        unitsPerBoard: detail.map.unitsPerBoard,
      }}
      author={detail.author ? { nickname: detail.author.nickname } : null}
      stages={detail.stages.map((s) => ({
        id: s.id,
        seq: s.seq,
        name: s.name,
        memo: s.memo,
        objects: s.objects.map((o) => ({
          id: o.id,
          kind: o.kind,
          x: o.x,
          y: o.y,
          points: o.points,
          radius: o.radius,
          angle: o.angle,
          length: o.length,
          rotation: o.rotation,
          color: o.color,
          label: o.label,
          memo: o.memo,
          slotNo: o.slotNo,
          team: o.team,
          casterAgentId: o.casterAgentId,
          abilityKey: o.abilityKey,
          linkedObjectId: o.linkedObjectId,
          externalUrl: o.externalUrl,
          sortOrder: o.sortOrder,
        })),
      }))}
      slots={detail.slots.map((s) => ({
        slotNo: s.slotNo,
        roleGroup: s.roleGroup,
        agentId: s.agentId,
        description: s.description,
        positionHint: s.positionHint,
        fixedMemberId: s.fixedMemberId,
      }))}
      agents={agentList.map((a) => ({ id: a.id, slug: a.slug, nameKo: a.nameKo, roleGroup: a.roleGroup, abilities: a.abilities, iconUrl: a.iconUrl }))}
      members={memberList.map((m) => ({ id: m.id, nickname: m.nickname }))}
      canEdit={canEdit}
      canManageShared={canManageSharedTactics(me)}
      lineup={lineup}
    />
  );
}

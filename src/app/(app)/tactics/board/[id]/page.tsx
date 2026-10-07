import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { listActiveMembers } from "@/server/queries/prefs";
import { getTacticDetail, listAgentsWithAbilities } from "@/server/queries/tactics";
import { BoardEditor } from "@/components/tactic-board/board-editor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const d = await getTacticDetail(id);
  return { title: d ? `${d.tactic.name} · ${d.map.nameKo}` : "전술" };
}

/** 전술 보드 편집기 페이지. 서버가 상세를 읽어 클라이언트 편집기에 넘긴다. 작성자·관리자만 편집. */
export default async function TacticBoardPage({ params }: Props) {
  const { id } = await params;
  const me = await requireMember();
  const detail = await getTacticDetail(id);
  if (!detail) notFound();
  const [agentList, memberList] = await Promise.all([listAgentsWithAbilities(), listActiveMembers()]);
  const canEdit = detail.tactic.authorId === me.id || me.role === "admin";

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
        mapSlug: detail.map.slug,
        mapNameKo: detail.map.nameKo,
        mapNameEn: detail.map.nameEn,
        mapImage: detail.map.imagePath,
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
      agents={agentList.map((a) => ({ id: a.id, nameKo: a.nameKo, roleGroup: a.roleGroup, abilities: a.abilities }))}
      members={memberList.map((m) => ({ id: m.id, nickname: m.nickname }))}
      canEdit={canEdit}
    />
  );
}

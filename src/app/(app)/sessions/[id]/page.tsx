import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { formatDateKo } from "@/lib/date";
import { deleteSessionAction } from "@/server/actions/sessions";
import { listActiveAgents, listActiveMembers, listMaps } from "@/server/queries/prefs";
import { getSessionDetail } from "@/server/queries/sessions";
import { listTacticsLite } from "@/server/queries/tactics";
import { MemberAvatar } from "@/components/result-badge";
import { AddMatchForm } from "./add-match-form";
import { MatchEditor } from "./match-editor";
import { SessionEditForm } from "./session-edit-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await getSessionDetail(id);
  return { title: detail ? `세션 ${detail.session.date}` : "세션" };
}

/**
 * 세션 상세 — "날짜 → 경기 → 멤버" 3단 기록의 입력 화면 (기획서 6절 입력 흐름 2~4).
 * 좌: 경기 편집기 목록. 우: 경기 추가 + 세션 정보 수정 + (관리자) 삭제.
 */
export default async function SessionDetailPage({ params }: Props) {
  const { id } = await params;
  const me = await requireMember();
  const detail = await getSessionDetail(id);
  if (!detail) notFound();

  const [mapList, agentList, memberList] = await Promise.all([listMaps(), listActiveAgents(), listActiveMembers()]);
  const { session, participants, matches } = detail;
  // 경기 맵별 전술 목록 (사용 전술 선택용). 맵마다 한 번만 읽는다.
  const mapIdsInUse = [...new Set(matches.map((m) => m.mapId))];
  const tacticsByMap = new Map(await Promise.all(mapIdsInUse.map(async (id) => [id, await listTacticsLite(id)] as const)));
  const record = { win: 0, loss: 0, draw: 0 };
  for (const m of matches) if (m.result) record[m.result] += 1;
  const isAdmin = me.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/sessions" className="text-sm text-secondary no-underline hover:text-primary">
          ← 세션 기록
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-wide">
          <span className="font-mono">{session.date}</span>
          <span className="ml-2 text-xl text-secondary">{formatDateKo(session.date)}</span>
        </h1>
        <span className="font-mono text-sm">
          <span className="text-success">{record.win}승</span> <span className="text-danger">{record.loss}패</span>
          {record.draw ? <span className="text-secondary"> {record.draw}무</span> : null}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {participants.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-sm border border-line bg-raised px-2 py-0.5 text-xs">
              <MemberAvatar nickname={p.nickname} color={p.color} size={5} />
              {p.nickname}
            </span>
          ))}
        </div>
      </div>
      {session.memo ? <p className="-mt-3 text-sm text-secondary">{session.memo}</p> : null}

      <div className="flex flex-col gap-6 lg:flex-row">
        <section className="flex min-w-0 flex-1 flex-col gap-4">
          {matches.length === 0 ? (
            <div className="card p-8 text-center text-sm text-secondary">아직 경기가 없습니다. 오른쪽에서 경기를 추가하세요.</div>
          ) : (
            matches.map((m) => (
              <MatchEditor
                key={m.id}
                isAdmin={isAdmin}
                agents={agentList.map((a) => ({ id: a.id, nameKo: a.nameKo, roleGroup: a.roleGroup }))}
                tacticOptions={(tacticsByMap.get(m.mapId) ?? []).map((t) => ({ id: t.id, name: t.name, side: t.side }))}
                match={{
                  id: m.id,
                  seq: m.seq,
                  mapNameKo: m.map.nameKo,
                  mapNameEn: m.map.nameEn,
                  result: m.result,
                  scoreAlly: m.scoreAlly,
                  scoreEnemy: m.scoreEnemy,
                  memo: m.memo,
                  isConfirmed: m.isConfirmed,
                  updatedAt: m.updatedAt,
                  tacticIds: m.tactics.map((t) => t.tacticId),
                  tacticBindings: m.tactics,
                  players: m.players.map((p) => ({
                    id: p.id,
                    member: p.member,
                    agentId: p.agentId,
                    position: p.position,
                    kills: p.kills,
                    deaths: p.deaths,
                    assists: p.assists,
                    memo: p.memo,
                  })),
                }}
              />
            ))
          )}
        </section>

        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[320px]">
          <AddMatchForm
            key={`${session.updatedAt}-${matches.length}`}
            sessionId={session.id}
            maps={mapList.map((m) => ({ id: m.id, nameKo: m.nameKo, inPool: m.inPool }))}
            participants={participants}
          />
          <SessionEditForm
            key={session.id}
            sessionId={session.id}
            date={session.date}
            memo={session.memo}
            participantIds={participants.map((p) => p.id)}
            members={memberList.map((m) => ({ id: m.id, nickname: m.nickname, color: m.color }))}
          />
          {isAdmin ? (
            <form action={deleteSessionAction} className="card flex items-center justify-between p-4">
              <input type="hidden" name="sessionId" value={session.id} />
              <span className="text-xs text-secondary">세션과 경기 기록을 모두 지웁니다 (관리자)</span>
              <button type="submit" className="btn-danger min-h-9 px-3 text-xs">
                세션 삭제
              </button>
            </form>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

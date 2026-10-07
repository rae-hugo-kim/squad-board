import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { formatDateKo, todayInSeoul } from "@/lib/date";
import { listActiveMembers } from "@/server/queries/prefs";
import { listSessions } from "@/server/queries/sessions";
import { MemberAvatar } from "@/components/result-badge";
import { NewSessionForm } from "./new-session-form";

export const metadata: Metadata = { title: "세션 기록" };
export const dynamic = "force-dynamic";

/** 날짜별 세션 목록 (기획서 6절 "날짜별"). 우측에 수동 생성 폼. */
export default async function SessionsPage() {
  await requireMember();
  const [list, memberList] = await Promise.all([listSessions(), listActiveMembers()]);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <section className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-3xl font-bold tracking-wide">세션 기록</h1>
          <span className="text-xs text-secondary">{list.length}회</span>
          <Link href="/sessions/stats" className="ml-auto text-sm text-secondary hover:text-primary">
            멤버별 · 맵별 통계 →
          </Link>
        </div>

        {list.length === 0 ? (
          <div className="card p-8 text-center text-sm text-secondary">
            아직 기록이 없습니다. <Link href="/squad">스쿼드 편성</Link>에서 조합을 확정하거나 오른쪽에서 세션을 만드세요.
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-base text-xs text-secondary">
                <tr>
                  <th className="px-4 py-2.5 text-left font-normal">날짜</th>
                  <th className="px-3 py-2.5 text-left font-normal">참가자</th>
                  <th className="px-3 py-2.5 text-left font-normal">경기</th>
                  <th className="px-3 py-2.5 text-left font-normal">전적</th>
                  <th className="px-3 py-2.5 text-left font-normal">메모</th>
                </tr>
              </thead>
              <tbody>
                {list.map(({ session, participants, matchCount, record, pendingCount, confirmedCount }) => (
                  <tr key={session.id} className="border-t border-line hover:bg-raised/40">
                    <td className="px-4 py-3 font-mono">
                      <Link href={`/sessions/${session.id}`} className="font-bold text-primary no-underline hover:text-accent">
                        {session.date}
                      </Link>
                      <span className="ml-2 text-xs text-secondary">{formatDateKo(session.date)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap items-center gap-1">
                        {participants.map((p) => (
                          <span key={p.id} className="inline-flex items-center gap-1 text-xs" title={p.nickname}>
                            <MemberAvatar nickname={p.nickname} color={p.color} size={5} />
                          </span>
                        ))}
                        <span className="ml-1 text-xs text-secondary">{participants.length}명</span>
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {matchCount}경기
                      {confirmedCount ? <span className="ml-1 text-success">확정 {confirmedCount}</span> : null}
                      {pendingCount ? <span className="ml-1 text-muted">미입력 {pendingCount}</span> : null}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      <span className="text-success">{record.win}승</span> <span className="text-danger">{record.loss}패</span>
                      {record.draw ? <span className="text-secondary"> {record.draw}무</span> : null}
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-3 text-[13px] text-secondary">{session.memo || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <aside className="w-full shrink-0 lg:w-[340px]">
        <NewSessionForm members={memberList.map((m) => ({ id: m.id, nickname: m.nickname, color: m.color }))} defaultDate={todayInSeoul()} />
      </aside>
    </div>
  );
}

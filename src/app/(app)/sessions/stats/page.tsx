import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { getMapStats, getMemberStats } from "@/server/queries/sessions";
import { getTacticStats } from "@/server/queries/tactics";
import { TACTIC_SIDE_LABELS } from "@/lib/tactics/types";
import { MemberAvatar, ResultBadge } from "@/components/result-badge";
import { RoleDot } from "@/components/role-dot";

export const metadata: Metadata = { title: "통계" };
export const dynamic = "force-dynamic";

function RateBar({ rate, matches }: { rate: number; matches: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-2 w-20 rounded-sm bg-raised">
        <span className="block h-2 rounded-sm bg-success" style={{ width: `${matches ? rate : 0}%` }} />
      </span>
      <span className="font-mono text-xs">{matches ? `${rate}%` : "—"}</span>
    </span>
  );
}

/**
 * 멤버별 · 맵별 통계 (기획서 6절 조회 화면). 조합별 승률은 데이터가 쌓인 뒤 추가한다.
 * 결과가 입력된 경기만 집계한다 — 승률 = 승 / (승 + 패), 무승부는 분모에서 제외.
 */
export default async function StatsPage() {
  await requireMember();
  const [memberStats, mapStats, tacticStats] = await Promise.all([getMemberStats(), getMapStats(), getTacticStats()]);
  const played = mapStats.filter((m) => m.matches > 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-baseline gap-3">
        <Link href="/sessions" className="text-sm text-secondary no-underline hover:text-primary">
          ← 세션 기록
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-wide">통계</h1>
        <span className="text-xs text-secondary">결과가 입력된 경기 기준 · 승률 = 승 / (승+패)</span>
      </div>

      <section>
        <h2 className="mb-3 font-display text-2xl font-bold tracking-wide">맵별</h2>
        {played.length === 0 ? (
          <div className="card p-6 text-sm text-secondary">아직 결과가 입력된 경기가 없습니다.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-base text-xs text-secondary">
                <tr>
                  <th className="px-4 py-2.5 text-left font-normal">맵</th>
                  <th className="px-3 py-2.5 text-left font-normal">경기</th>
                  <th className="px-3 py-2.5 text-left font-normal">전적</th>
                  <th className="px-3 py-2.5 text-left font-normal">승률</th>
                </tr>
              </thead>
              <tbody>
                {played.map((m) => (
                  <tr key={m.map.id} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <span className="font-display text-lg font-bold uppercase tracking-wider">{m.map.nameEn}</span>
                      <span className="ml-2 text-xs text-secondary">{m.map.nameKo}</span>
                    </td>
                    <td className="px-3 py-2.5 font-mono">{m.matches}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      <span className="text-success">{m.record.win}승</span> <span className="text-danger">{m.record.loss}패</span>
                      {m.record.draw ? <span className="text-secondary"> {m.record.draw}무</span> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <RateBar rate={m.winRate} matches={m.record.win + m.record.loss} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-2xl font-bold tracking-wide">전술별</h2>
        {tacticStats.length === 0 ? (
          <div className="card p-6 text-sm text-secondary">경기에 사용한 전술을 기록하면 전술별 승률이 여기에 쌓입니다.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-base text-xs text-secondary">
                <tr>
                  <th className="px-4 py-2.5 text-left font-normal">전술</th>
                  <th className="px-3 py-2.5 text-left font-normal">맵</th>
                  <th className="px-3 py-2.5 text-left font-normal">경기</th>
                  <th className="px-3 py-2.5 text-left font-normal">전적</th>
                  <th className="px-3 py-2.5 text-left font-normal">승률</th>
                </tr>
              </thead>
              <tbody>
                {tacticStats.map((t) => {
                  const map = mapStats.find((m) => m.map.id === t.tactic.mapId)?.map;
                  return (
                    <tr key={t.tactic.id} className="border-t border-line">
                      <td className="px-4 py-2.5">
                        <Link href={`/tactics/board/${t.tactic.id}`} className="font-medium text-primary no-underline hover:text-accent">
                          {t.tactic.name}
                        </Link>
                        <span className={`ml-2 text-xs ${t.tactic.side === "attack" ? "text-side-attack" : "text-side-defense"}`}>{TACTIC_SIDE_LABELS[t.tactic.side]}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-secondary">{map?.nameKo ?? "—"}</td>
                      <td className="px-3 py-2.5 font-mono">{t.matches}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        <span className="text-success">{t.record.win}승</span> <span className="text-danger">{t.record.loss}패</span>
                        {t.record.draw ? <span className="text-secondary"> {t.record.draw}무</span> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <RateBar rate={t.winRate} matches={t.record.win + t.record.loss} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-2xl font-bold tracking-wide">멤버별</h2>
        {memberStats.length === 0 ? (
          <div className="card p-6 text-sm text-secondary">아직 멤버별 기록이 없습니다.</div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {memberStats.map((s) => (
              <article key={s.member.id} className={`card p-5 ${s.member.isActive ? "" : "opacity-70"}`}>
                <header className="mb-3 flex flex-wrap items-center gap-3">
                  <MemberAvatar nickname={s.member.nickname} color={s.member.color} size={7} />
                  <span className="text-lg font-bold">{s.member.nickname}</span>
                  {!s.member.isActive ? <span className="badge border border-line text-muted">비활성</span> : null}
                  <span className="text-xs text-secondary">
                    참가 {s.sessionCount}회 · {s.matches}경기
                  </span>
                  <span className="ml-auto font-mono text-xs">
                    <span className="text-success">{s.record.win}승</span> <span className="text-danger">{s.record.loss}패</span>
                    {s.record.draw ? <span className="text-secondary"> {s.record.draw}무</span> : null}
                  </span>
                  <RateBar rate={s.winRate} matches={s.record.win + s.record.loss} />
                </header>

                <div className="grid gap-4 text-xs md:grid-cols-2">
                  <div>
                    <div className="mb-1.5 font-bold text-secondary">맵별 승률</div>
                    <ul className="flex flex-col gap-1">
                      {s.perMap.map((m) => (
                        <li key={m.map.id} className="flex items-center justify-between gap-2">
                          <span>
                            {m.map.nameKo} <span className="text-muted">{m.matches}경기</span>
                          </span>
                          <RateBar rate={m.winRate} matches={m.record.win + m.record.loss} />
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="mb-1.5 font-bold text-secondary">자주 쓴 요원</div>
                    {s.topAgents.length ? (
                      <ul className="flex flex-col gap-1">
                        {s.topAgents.map((a) => (
                          <li key={a.agent.id} className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5">
                              <RoleDot role={a.agent.roleGroup} />
                              {a.agent.nameKo}
                            </span>
                            <span className="font-mono">
                              {a.count}회 · {a.wins}승
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted">요원 기록 없음</p>
                    )}
                    {s.kda.counted ? (
                      <p className="mt-2 font-mono text-secondary">
                        K/D/A 합계 {s.kda.kills}/{s.kda.deaths}/{s.kda.assists} ({s.kda.counted}경기)
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 text-xs font-bold text-secondary">최근 {s.recent.length}경기</div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.recent.map((r) => (
                      <span key={r.matchId} className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-raised px-2 py-1 text-xs" title={`${r.date} ${r.map.nameKo}${r.kda ? ` · ${r.kda}` : ""}`}>
                        <ResultBadge result={r.result} />
                        <span className="font-mono text-secondary">{r.date.slice(5)}</span>
                        <span>{r.map.nameKo}</span>
                        {r.agent ? <span className="text-secondary">{r.agent.nameKo}</span> : null}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

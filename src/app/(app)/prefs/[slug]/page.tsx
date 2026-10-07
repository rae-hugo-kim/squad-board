import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { ROLE_LABELS } from "@/db/seed-data";
import { ROLE_GROUPS, type RoleGroup } from "@/db/schema";
import { getMapBySlug, getMyPreference, listActiveAgents, listMaps, listPreferencesForMap } from "@/server/queries/prefs";
import { RoleDot } from "@/components/role-dot";
import { AgentIcon } from "@/components/agent-icon";
import { MyPreferenceForm } from "./my-preference-form";
import { SensitivityForm } from "./sensitivity-form";
import { RolePreferenceForm } from "./role-preference-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const map = await getMapBySlug(slug);
  return { title: map ? `멤버 선호 · ${map.nameKo}` : "멤버 선호" };
}

/**
 * 맵별 멤버 선호 화면.
 * 좌: 맵 탭 + 멤버×선호 매트릭스 + 역할군 커버리지/주의
 * 우: 내 선호 편집(본인만) + 감도
 */
export default async function PrefsMapPage({ params }: Props) {
  const { slug } = await params;
  const me = await requireMember();
  const map = await getMapBySlug(slug);
  if (!map) notFound();

  const [allMaps, rows, agentList, mine] = await Promise.all([
    listMaps(),
    listPreferencesForMap(map.id),
    listActiveAgents(),
    getMyPreference(me.id, map.id),
  ]);

  // 역할군 커버리지: 1순위 기준 인원 수
  const coverage: Record<RoleGroup, number> = { duelist: 0, initiator: 0, controller: 0, sentinel: 0 };
  for (const r of rows) if (r.pref?.agent1) coverage[r.pref.agent1.roleGroup] += 1;
  const filled = rows.filter((r) => r.pref).length;
  const missing = rows.filter((r) => !r.pref).map((r) => r.member.nickname);
  const thinRoles = ROLE_GROUPS.filter((g) => coverage[g] <= 1);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* 좌측 */}
      <section className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-wide">
            멤버 선호 · <span className="uppercase">{map.nameEn}</span>
          </h1>
          <nav className="flex flex-wrap gap-1" aria-label="맵 선택">
            {allMaps.map((m) => {
              const active = m.id === map.id;
              return (
                <Link
                  key={m.id}
                  href={`/prefs/${m.slug}`}
                  className={`rounded-sm border px-2.5 py-1 text-xs no-underline ${
                    active
                      ? "border-accent bg-accent-subtle font-bold text-primary"
                      : m.inPool
                        ? "border-line text-secondary hover:text-primary"
                        : "border-line text-muted hover:text-secondary"
                  }`}
                  title={m.inPool ? undefined : "현재 맵 풀 밖"}
                >
                  {m.nameKo}
                </Link>
              );
            })}
          </nav>
          <span className="ml-auto text-xs text-secondary">
            {rows.length}명 · 입력 {filled}명
          </span>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-base text-xs text-secondary">
              <tr>
                <th className="px-4 py-2.5 text-left font-normal">멤버</th>
                <th className="px-3 py-2.5 text-left font-normal">선호 역할군</th>
                <th className="px-3 py-2.5 text-left font-normal">1순위</th>
                <th className="px-3 py-2.5 text-left font-normal">2순위</th>
                <th className="px-3 py-2.5 text-left font-normal">3순위</th>
                <th className="px-3 py-2.5 text-left font-normal">공격 포지션</th>
                <th className="px-3 py-2.5 text-left font-normal">수비 포지션</th>
                <th className="px-3 py-2.5 text-left font-normal">자신감</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ member, pref }) => {
                const isMe = member.id === me.id;
                const agentCell = (a: { nameKo: string; roleGroup: RoleGroup; iconUrl: string | null } | null) =>
                  a ? (
                    <span className="inline-flex items-center gap-1.5">
                      {a.iconUrl ? <AgentIcon agent={a} size={22} /> : <RoleDot role={a.roleGroup} />}
                      {a.nameKo}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  );
                return (
                  <tr
                    key={member.id}
                    className={`border-t border-line ${isMe ? "bg-accent-subtle/60" : ""} ${pref ? "" : "text-secondary"}`}
                  >
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 font-medium">
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-base"
                          style={{ background: member.color }}
                          aria-hidden
                        >
                          {member.nickname.slice(0, 1).toUpperCase()}
                        </span>
                        {member.nickname}
                        {isMe ? <span className="text-[10px] text-accent">나</span> : null}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {member.rolePreference.length ? (
                        <span className="inline-flex flex-wrap items-center gap-1">
                          {member.rolePreference.slice(0, 3).map((g, i) => (
                            <span key={g} className="inline-flex items-center gap-1" style={{ color: ROLE_LABELS[g].cssVar }}>
                              {i > 0 ? <span className="text-muted">›</span> : null}
                              {ROLE_LABELS[g].ko}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {pref ? (
                      <>
                        <td className="px-3 py-3">{agentCell(pref.agent1)}</td>
                        <td className="px-3 py-3">{agentCell(pref.agent2)}</td>
                        <td className="px-3 py-3">{agentCell(pref.agent3)}</td>
                        <td className="px-3 py-3 text-[13px]">{pref.attackPosition || <span className="text-muted">—</span>}</td>
                        <td className="px-3 py-3 text-[13px]">{pref.defensePosition || <span className="text-muted">—</span>}</td>
                        <td className="px-3 py-3">
                          <span
                            className="font-mono"
                            style={{
                              color:
                                pref.confidence >= 4 ? "var(--success)" : pref.confidence === 3 ? "var(--warning)" : "var(--text-secondary)",
                            }}
                          >
                            {pref.confidence}
                          </span>
                        </td>
                      </>
                    ) : (
                      <td colSpan={6} className="px-3 py-3 text-xs italic text-muted">
                        아직 입력 안 함
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="card p-4">
            <div className="mb-3 text-xs text-secondary">역할군 커버리지 (1순위 기준)</div>
            <div className="flex flex-col gap-2 text-xs">
              {ROLE_GROUPS.map((g) => (
                <div key={g} className="flex items-center gap-3">
                  <div className="w-14" style={{ color: ROLE_LABELS[g].cssVar }}>
                    {ROLE_LABELS[g].ko}
                  </div>
                  <div className="h-2 flex-1 rounded-sm bg-raised">
                    <div
                      className="h-2 rounded-sm"
                      style={{
                        width: `${rows.length ? Math.min(100, (coverage[g] / rows.length) * 100) : 0}%`,
                        background: ROLE_LABELS[g].cssVar,
                      }}
                    />
                  </div>
                  <div className="w-5 font-mono">{coverage[g]}</div>
                </div>
              ))}
            </div>
          </div>
          <div
            className={`rounded-md border p-4 ${thinRoles.length ? "border-warning bg-warning/5" : "border-line bg-surface"}`}
          >
            <div className={`mb-1.5 text-xs font-bold ${thinRoles.length ? "text-warning" : "text-secondary"}`}>편성 주의</div>
            {thinRoles.length ? (
              <p className="text-[13px]">
                {thinRoles.map((g) => ROLE_LABELS[g].ko).join(", ")} 1순위가 {thinRoles.length === 1 ? "한 명 이하" : "각각 한 명 이하"}
                입니다. 해당 멤버가 불참하면 그 역할 슬롯이 빕니다.
              </p>
            ) : (
              <p className="text-[13px] text-secondary">모든 역할군에 1순위 선호가 2명 이상 있습니다.</p>
            )}
            {missing.length ? (
              <p className="mt-1.5 text-xs text-secondary">{missing.join(", ")} — 선호 미입력, 편성 점수에서 제외됩니다.</p>
            ) : null}
          </div>
        </div>
      </section>

      {/* 우측 */}
      <aside className="w-full shrink-0 lg:w-[340px]">
        <div className="card flex flex-col gap-5 p-5">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-wide">
              내 선호 편집 · <span className="uppercase">{map.nameEn}</span>
            </h2>
            <p className="text-xs text-secondary">본인만 수정할 수 있습니다</p>
          </div>
          <MyPreferenceForm
            key={map.id}
            mapId={map.id}
            agents={agentList.map((a) => ({ id: a.id, nameKo: a.nameKo, roleGroup: a.roleGroup }))}
            initial={
              mine
                ? {
                    agent1Id: mine.agent1Id ?? "",
                    agent2Id: mine.agent2Id ?? "",
                    agent3Id: mine.agent3Id ?? "",
                    attackPosition: mine.attackPosition,
                    defensePosition: mine.defensePosition,
                    confidence: mine.confidence,
                    memo: mine.memo,
                  }
                : null
            }
          />
          <div className="border-t border-line pt-4">
            <RolePreferenceForm initial={me.rolePreference} />
          </div>
          <div className="border-t border-line pt-4">
            <SensitivityForm dpi={me.dpi} sens={me.sens} />
          </div>
        </div>
      </aside>
    </div>
  );
}

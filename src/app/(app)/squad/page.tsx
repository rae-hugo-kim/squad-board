import type { Metadata } from "next";
import { requireMember } from "@/lib/auth";
import { todayInSeoul } from "@/lib/date";
import { composeSquads, DEFAULT_RULES, MAX_PARTICIPANTS, TEAM_SIZE, type Composition } from "@/lib/squad/compose";
import { ROLE_LABELS } from "@/db/seed-data";
import { ROLE_GROUPS } from "@/db/schema";
import { listActiveMembers, listMaps } from "@/server/queries/prefs";
import { loadComposeInput } from "@/server/queries/squad";
import { listTacticsLite, loadComposeTactics } from "@/server/queries/tactics";
import { ROUND_TYPE_LABELS, TACTIC_SIDE_LABELS } from "@/lib/tactics/types";
import { MemberAvatar } from "@/components/result-badge";
import { CompositionCard } from "./composition-card";

export const metadata: Metadata = { title: "스쿼드 편성" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ map?: string; m?: string | string[]; t?: string | string[] }> };

function toList(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * 스쿼드 편성기 (기획서 5절).
 * 입력은 GET 폼(맵 + 참가자 체크) → URL에 남아 공유·새로고침이 자연스럽다. 계산은 서버에서 한다.
 * 결과 카드는 클라이언트 컴포넌트로, 요원을 바꾸면 같은 점수 함수로 즉시 다시 채점한다.
 * 3단계: 이 맵의 전술을 고르면 슬롯 점수(+2/슬롯, 포지션 힌트 +1)가 더해지고, 확정 시 슬롯 바인딩이 경기에 기록된다.
 */
export default async function SquadPage({ searchParams }: Props) {
  await requireMember();
  const sp = await searchParams;
  const [allMaps, memberList] = await Promise.all([listMaps(), listActiveMembers()]);
  const poolMaps = allMaps.filter((m) => m.inPool);
  const selectedMap = allMaps.find((m) => m.slug === sp.map) ?? poolMaps[0] ?? allMaps[0];
  const selectedIds = new Set(toList(sp.m).filter((id) => memberList.some((m) => m.id === id)));
  const asked = toList(sp.m).length > 0;
  const tacticList = selectedMap ? await listTacticsLite(selectedMap.id) : [];
  const selectedTacticIds = toList(sp.t).filter((id) => tacticList.some((t) => t.id === id));
  const composeTactics = selectedTacticIds.length ? await loadComposeTactics(selectedTacticIds) : [];

  let compositions: Composition[] = [];
  let evaluatedTeams = 0;
  let error: string | null = null;
  let input: Awaited<ReturnType<typeof loadComposeInput>> = { members: [], agents: [] };
  if (asked && selectedMap && selectedIds.size > 0) {
    if (selectedIds.size > MAX_PARTICIPANTS) {
      error = `참가자는 최대 ${MAX_PARTICIPANTS}명까지 계산할 수 있습니다 (현재 ${selectedIds.size}명)`;
    } else {
      input = await loadComposeInput(selectedMap.id, [...selectedIds]);
      const out = composeSquads({ members: input.members, agents: input.agents, tactics: composeTactics });
      compositions = out.compositions;
      evaluatedTeams = out.evaluatedTeams;
    }
  }

  const ruleText = ROLE_GROUPS.filter((g) => (DEFAULT_RULES.minByRole[g] ?? 0) > 0)
    .map((g) => `${ROLE_LABELS[g].ko} ${DEFAULT_RULES.minByRole[g]}명 이상`)
    .join(", ");

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="w-full shrink-0 lg:w-[320px]">
        <form method="get" action="/squad" className="card flex flex-col gap-5 p-5">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-wide">스쿼드 편성</h1>
            <p className="text-xs text-secondary">오늘 참가자를 고르면 맵 선호를 바탕으로 조합을 추천합니다</p>
          </div>

          <div>
            <label htmlFor="map" className="label">
              맵
            </label>
            <select id="map" name="map" defaultValue={selectedMap?.slug} className="input">
              {allMaps.map((m) => (
                <option key={m.id} value={m.slug}>
                  {m.nameKo}
                  {m.inPool ? "" : " (풀 밖)"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="label">
              참가자 <span className="text-muted">(최대 {MAX_PARTICIPANTS}명)</span>
            </div>
            {memberList.length === 0 ? (
              <p className="text-sm text-secondary">활성 멤버가 없습니다. 관리 메뉴에서 멤버를 추가하세요.</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {memberList.map((m) => (
                  <label
                    key={m.id}
                    className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-line bg-raised px-2.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-subtle"
                  >
                    <input type="checkbox" name="m" value={m.id} defaultChecked={selectedIds.has(m.id)} className="accent-[var(--accent)]" />
                    <MemberAvatar nickname={m.nickname} color={m.color} size={5} />
                    <span className="truncate">{m.nickname}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="label">
              전술 <span className="text-muted">(선택 — 슬롯 적합 +2, 포지션 힌트 +1)</span>
            </div>
            {tacticList.length === 0 ? (
              <p className="text-xs text-muted">
                이 맵의 전술이 없습니다. <a href={`/tactics/${selectedMap?.slug ?? ""}`}>전술 보드</a>에서 만들 수 있습니다.
              </p>
            ) : (
              <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
                {tacticList.map((t) => (
                  <label key={t.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-line bg-raised px-2.5 text-xs has-[:checked]:border-accent has-[:checked]:bg-accent-subtle">
                    <input type="checkbox" name="t" value={t.id} defaultChecked={selectedTacticIds.includes(t.id)} className="accent-[var(--accent)]" />
                    <span className="truncate">{t.name}</span>
                    {t.isShared ? <span className="whitespace-nowrap text-info">공통{t.priority > 0 ? ` ${t.priority}` : ""}</span> : null}
                    <span className="ml-auto whitespace-nowrap text-muted">
                      {TACTIC_SIDE_LABELS[t.side]} · {ROUND_TYPE_LABELS[t.roundType]}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md border border-line bg-base p-3 text-xs text-secondary">
            <div className="mb-1 font-bold text-primary">규칙</div>
            <p>같은 요원 중복 금지 · {ruleText}</p>
            <p className="mt-1">점수: 1순위 +3 / 2순위 +2 / 3순위 +1, 자신감 +0~2, 전술 슬롯 +2/슬롯</p>
          </div>

          <button type="submit" className="btn-primary" disabled={memberList.length === 0}>
            조합 계산
          </button>
        </form>
      </aside>

      <section className="min-w-0 flex-1">
        {!asked ? (
          <div className="card p-8 text-center text-sm text-secondary">
            왼쪽에서 맵과 오늘 참가자를 고른 뒤 <span className="font-bold text-primary">조합 계산</span>을 누르세요.
          </div>
        ) : error ? (
          <div className="rounded-md border border-warning bg-warning/5 p-4 text-sm">{error}</div>
        ) : selectedIds.size === 0 ? (
          <div className="rounded-md border border-warning bg-warning/5 p-4 text-sm">참가자를 1명 이상 고르세요.</div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-baseline gap-3">
              <h2 className="font-display text-2xl font-bold tracking-wide">
                추천 조합 · <span className="uppercase">{selectedMap?.nameEn}</span>
              </h2>
              <span className="text-xs text-secondary">
                참가 {selectedIds.size}명
                {selectedIds.size > TEAM_SIZE ? ` · ${evaluatedTeams}개 5인 조합 중 상위 ${compositions.length}개` : ""}
              </span>
            </div>
            <div className="flex flex-col gap-4">
              {compositions.map((c, i) => (
                <CompositionCard
                  key={c.slots.map((s) => s.memberId).join(",")}
                  index={i}
                  composition={c}
                  members={input.members}
                  agents={input.agents}
                  tactics={composeTactics}
                  mapId={selectedMap!.id}
                  mapName={selectedMap!.nameKo}
                  defaultDate={todayInSeoul()}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { MAX_PARTICIPANTS } from "@/lib/squad/compose";
import { lineupQuery, parseLineupParam } from "@/lib/squad/lineup";
import { chooseTodayTactic } from "@/lib/squad/today";
import { createLogger } from "@/lib/logger";
import { listActiveMembers, listMaps } from "@/server/queries/prefs";
import { loadComposeInput } from "@/server/queries/squad";
import { listSharedTacticsLite, loadComposeTactics } from "@/server/queries/tactics";

export const metadata: Metadata = { title: "오늘의 전술 고르는 중" };
export const dynamic = "force-dynamic";

const log = createLogger("today");

type Props = { searchParams: Promise<{ map?: string; m?: string | string[] }> };

/**
 * /today — 랜딩 폼의 목적지. 화면은 없고 "어느 보드로 갈지"만 정해 리다이렉트한다.
 * 우선도 순 공통 전술 중 오늘 참가자로 실행 가능한 첫 전술 → /tactics/board/<id>?m=... (라인업이 채워진 보드).
 * 공통 전술이 없거나 입력이 비면 안내를 보여준다 (리다이렉트 루프 대신).
 */
export default async function TodayPage({ searchParams }: Props) {
  await requireMember();
  const sp = await searchParams;
  const [allMaps, memberList] = await Promise.all([listMaps(), listActiveMembers()]);
  const map = allMaps.find((m) => m.slug === sp.map);
  if (!map) redirect(`/?${new URLSearchParams({ error: "맵을 고르세요" })}`);
  const ids = parseLineupParam(sp.m).filter((id) => memberList.some((m) => m.id === id));
  if (ids.length === 0) redirect(`/?${new URLSearchParams({ error: "참가자를 1명 이상 체크하세요" })}`);
  if (ids.length > MAX_PARTICIPANTS) redirect(`/?${new URLSearchParams({ error: `참가자는 최대 ${MAX_PARTICIPANTS}명까지 계산할 수 있습니다 (현재 ${ids.length}명)` })}`);

  const shared = await listSharedTacticsLite(map.id);
  if (shared.length === 0) {
    return (
      <div className="card mx-auto max-w-lg p-6 text-sm">
        <h1 className="font-display text-2xl font-bold tracking-wide">{map.nameKo}에 공통 전술이 없습니다</h1>
        <p className="mt-2 text-secondary">전술가가 전술 보드에서 &quot;공통 전술&quot;로 만들면 오늘의 스쿼드가 자동으로 고릅니다. 지금은 편성만 계산할 수 있습니다.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/squad?${new URLSearchParams([["map", map.slug], ...ids.map((id) => ["m", id] as [string, string])])}`} className="btn-primary no-underline">
            이 참가자로 편성 계산
          </Link>
          <Link href={`/tactics/${map.slug}`} className="btn-secondary no-underline">
            {map.nameKo} 전술 보드
          </Link>
          <Link href="/" className="btn-secondary no-underline">
            ← 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  const [input, composeTactics] = await Promise.all([loadComposeInput(map.id, ids), loadComposeTactics(shared.map((t) => t.id))]);
  // 우선도 순서는 shared 목록의 순서 — compose용 슬롯 데이터에 priority를 붙여 같은 순서로 넘긴다
  const ordered = shared.flatMap((s) => {
    const t = composeTactics.find((c) => c.id === s.id);
    return t ? [{ ...t, priority: s.priority }] : [];
  });
  const pick = chooseTodayTactic({ tactics: ordered, members: input.members, agents: input.agents });
  if (!pick) redirect(`/?${new URLSearchParams({ error: "편성을 계산할 수 없습니다 (참가자가 모두 비활성이거나 데이터가 없음)" })}`);
  log.info("today tactic picked", { mapId: map.id, tacticId: pick.tactic.id, feasible: pick.feasible, skipped: pick.skipped.length, participants: ids.length });
  redirect(`/tactics/board/${pick.tactic.id}?${lineupQuery(ids)}`);
}

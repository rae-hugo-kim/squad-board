import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { formatDateKo, todayInSeoul } from "@/lib/date";
import { MAX_PARTICIPANTS, TEAM_SIZE } from "@/lib/squad/compose";
import { MemberAvatar } from "@/components/result-badge";
import { MapSelection } from "@/components/map-selection";
import { listActiveMembers, listMaps } from "@/server/queries/prefs";
import { countSharedTacticsByMap } from "@/server/queries/tactics";

export const metadata: Metadata = { title: "홈 · 오늘의 스쿼드" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string }> };

/**
 * 호발동 랜딩과 "오늘의 스쿼드".
 * 참가자를 체크하고 맵을 고르면 /today 가 그 맵의 공통 전술 중 실행 가능한 것을 우선도 순으로 골라
 * 멤버 라인업이 채워진 보드로 바로 보낸다. 편성 결과를 비교하고 싶으면 같은 입력으로 편성기(/squad)로 간다.
 * GET 폼이라 URL에 선택이 남고, JS 없이도 동작한다.
 */
export default async function HomePage({ searchParams }: Props) {
  const me = await requireMember();
  const sp = await searchParams;
  const [memberList, allMaps, sharedCount] = await Promise.all([listActiveMembers(), listMaps(), countSharedTacticsByMap()]);
  const poolMaps = allMaps.filter((m) => m.inPool);
  const mapsToShow = poolMaps.length ? poolMaps : allMaps;
  const today = todayInSeoul();
  // 기본 맵: 공통 전술이 있는 첫 풀 맵 (없으면 첫 풀 맵)
  const defaultMap = mapsToShow.find((m) => (sharedCount.get(m.id) ?? 0) > 0) ?? mapsToShow[0];
  const totalShared = [...sharedCount.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-6">
      <section className="home-hero">
        <p className="eyebrow">HOIDOIHO VALORANT</p>
        <h1>호발동</h1>
      </section>

      <MapSelection maps={allMaps} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-4xl font-bold tracking-wide">오늘의 스쿼드</h2>
          <p className="text-sm text-secondary">
            <span className="font-mono">{today}</span> {formatDateKo(today)} · 참가자를 체크하고 맵을 고르면 공통 전술 보드로 바로 갑니다
          </p>
        </div>
        <span className="text-xs text-secondary">
          안녕하세요, <b className="text-primary">{me.nickname}</b>
        </span>
      </div>

      {sp.error ? <div className="rounded-md border border-warning bg-warning/5 p-3 text-sm">{sp.error}</div> : null}

      <form method="get" action="/today" className="card flex flex-col gap-5 p-5" data-today-form>
        <div>
          <div className="label">
            오늘 참가자 <span className="text-muted">({TEAM_SIZE}명 기준 · 최대 {MAX_PARTICIPANTS}명, 넘으면 로테이션 안)</span>
          </div>
          {memberList.length === 0 ? (
            <p className="text-sm text-secondary">활성 멤버가 없습니다. 관리 메뉴에서 멤버를 추가하세요.</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
              {memberList.map((m) => (
                <label
                  key={m.id}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-line bg-raised px-2.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-subtle"
                >
                  <input type="checkbox" name="m" value={m.id} defaultChecked={m.id === me.id} className="accent-[var(--accent)]" />
                  <MemberAvatar nickname={m.nickname} color={m.color} size={5} />
                  <span className="truncate">{m.nickname}</span>
                  {m.role !== "member" ? <span className="ml-auto font-mono text-[10px] text-muted">{m.role === "admin" ? "admin" : "tact"}</span> : null}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label htmlFor="map" className="label">
              맵 <span className="text-muted">(괄호 = 공통 전술 수)</span>
            </label>
            <select id="map" name="map" defaultValue={defaultMap?.slug} className="input">
              {mapsToShow.map((m) => (
                <option key={m.id} value={m.slug}>
                  {m.nameKo} ({sharedCount.get(m.id) ?? 0})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={memberList.length === 0 || !defaultMap}>
              공통 전술 보드로 →
            </button>
            <button type="submit" formAction="/squad" className="btn-secondary" disabled={memberList.length === 0}>
              편성 계산만
            </button>
          </div>
        </div>

        <p className="text-xs text-muted">
          공통 전술은 전술가가 만들고 우선도를 매깁니다. 오늘 참가자의 요원 폭으로 실행할 수 없는 전술은 우선도와 상관없이 건너뛰고(포기), 실행 가능한
          첫 전술의 슬롯에 선호·숙련 기준으로 멤버를 배치합니다.
          {totalShared === 0 ? (
            <>
              {" "}
              아직 공통 전술이 없습니다 — 전술가가 <Link href="/tactics">전술 보드</Link>에서 &quot;공통 전술&quot;로 만들면 여기서 바로 열립니다.
            </>
          ) : null}
        </p>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/prefs" className="card p-4 no-underline hover:border-line-strong">
          <div className="font-display text-xl font-bold tracking-wide">멤버 선호</div>
          <p className="text-xs text-secondary">맵별 선호 요원·포지션·자신감과 선호 역할군을 입력합니다</p>
        </Link>
        <Link href="/tactics" className="card p-4 no-underline hover:border-line-strong">
          <div className="font-display text-xl font-bold tracking-wide">전술 보드</div>
          <p className="text-xs text-secondary">맵별 전술을 그리고 공통 전술에 우선도를 매깁니다</p>
        </Link>
        <Link href="/sessions" className="card p-4 no-underline hover:border-line-strong">
          <div className="font-display text-xl font-bold tracking-wide">세션 기록</div>
          <p className="text-xs text-secondary">오늘 경기 결과를 적고 통계를 봅니다</p>
        </Link>
      </div>
    </div>
  );
}

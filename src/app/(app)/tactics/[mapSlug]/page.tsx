import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RoundType, TacticSide } from "@/db/schema";
import { mapImagePath } from "@/db/seed-data";
import { requireMember } from "@/lib/auth";
import { layerColor, ROUND_TYPE_LABELS, ROUND_TYPE_ORDER, TACTIC_SIDE_LABELS, TACTIC_SIDE_ORDER } from "@/lib/tactics/types";
import { canEditTactic, canManageSharedTactics } from "@/lib/tactics/permissions";
import { EXTERNAL_TOOLS } from "@/lib/tools/external-links";
import { deleteTacticAction, duplicateTacticAction } from "@/server/actions/tactics";
import { getMapBySlug, listMaps } from "@/server/queries/prefs";
import { listTacticsForMap } from "@/server/queries/tactics";
import { NewTacticForm } from "./new-tactic-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ mapSlug: string }>; searchParams: Promise<{ side?: string; round?: string; tag?: string }> };

/** 우선도 정렬 키: 1이 맨 앞, 0(미지정)은 맨 뒤 */
const priorityRank = (p: number) => (p > 0 ? p : Number.MAX_SAFE_INTEGER);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mapSlug } = await params;
  const map = await getMapBySlug(mapSlug);
  return { title: map ? `전술 보드 · ${map.nameKo}` : "전술 보드" };
}

/**
 * 맵별 전술 목록 (기획서 4절 "맵 선택 → 전술 목록(진영·라운드 유형·태그로 필터) → 전술 열기").
 * 겹쳐보기는 체크박스 GET 폼으로 ids를 모아 /overlay 로 보낸다.
 */
export default async function TacticListPage({ params, searchParams }: Props) {
  const { mapSlug } = await params;
  const sp = await searchParams;
  const me = await requireMember();
  const map = await getMapBySlug(mapSlug);
  if (!map) notFound();
  const [allMaps, items] = await Promise.all([listMaps(), listTacticsForMap(map.id)]);

  const side = TACTIC_SIDE_ORDER.includes(sp.side as TacticSide) ? (sp.side as TacticSide) : null;
  const round = ROUND_TYPE_ORDER.includes(sp.round as RoundType) ? (sp.round as RoundType) : null;
  const tag = sp.tag?.trim() || null;
  const filtered = items
    .filter((i) => (!side || i.tactic.side === side) && (!round || i.tactic.roundType === round) && (!tag || i.tactic.tags.includes(tag)))
    // 공통 전술(우선도 순)을 위로, 그다음 개인 전술(최근 수정 순)
    .sort((a, b) => Number(b.tactic.isShared) - Number(a.tactic.isShared) || (a.tactic.isShared ? priorityRank(a.tactic.priority) - priorityRank(b.tactic.priority) : 0));
  const allTags = [...new Set(items.flatMap((i) => i.tactic.tags))].sort();
  const filterHref = (patch: Partial<{ side: string | null; round: string | null; tag: string | null }>) => {
    const q = new URLSearchParams();
    const s = patch.side === undefined ? side : patch.side;
    const r = patch.round === undefined ? round : patch.round;
    const t = patch.tag === undefined ? tag : patch.tag;
    if (s) q.set("side", s);
    if (r) q.set("round", r);
    if (t) q.set("tag", t);
    const qs = q.toString();
    return `/tactics/${map.slug}${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <section className="min-w-0 flex-1">
        <header className="map-detail__header page-intro">
          <p className="eyebrow">MAP DETAIL</p>
          <h1>{map.nameEn}</h1>
          <p className="map-detail__name-ko">{map.nameKo} · 전술 보드</p>
        </header>
        <div className="map-detail__board mb-6">
          {/* 공식 CDN 이미지 또는 기존 로컬 맵 에셋을 그대로 사용한다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={map.imagePath || mapImagePath(map.slug)}
            alt={`${map.nameKo} 탑다운 맵`}
            className="map-detail__minimap"
          />
        </div>
        <div className="mb-4">
          <nav className="flex flex-wrap gap-1" aria-label="맵 선택">
            {allMaps.map((m) => (
              <Link
                key={m.id}
                href={`/tactics/${m.slug}`}
                className={`rounded-sm border px-2.5 py-1 text-xs no-underline ${m.id === map.id ? "border-accent bg-accent-subtle font-bold text-primary" : m.inPool ? "border-line text-secondary hover:text-primary" : "border-line text-muted"}`}
              >
                {m.nameKo}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-secondary">필터</span>
          <Link href={filterHref({ side: null })} className={`rounded-sm border px-2 py-1 no-underline ${!side ? "border-accent text-primary" : "border-line text-secondary"}`}>
            전체 진영
          </Link>
          {TACTIC_SIDE_ORDER.map((s) => (
            <Link key={s} href={filterHref({ side: s })} className={`rounded-sm border px-2 py-1 no-underline ${side === s ? "border-accent text-primary" : "border-line text-secondary"}`}>
              {TACTIC_SIDE_LABELS[s]}
            </Link>
          ))}
          <span className="mx-1 text-muted">|</span>
          <Link href={filterHref({ round: null })} className={`rounded-sm border px-2 py-1 no-underline ${!round ? "border-accent text-primary" : "border-line text-secondary"}`}>
            모든 라운드
          </Link>
          {ROUND_TYPE_ORDER.map((r) => (
            <Link key={r} href={filterHref({ round: r })} className={`rounded-sm border px-2 py-1 no-underline ${round === r ? "border-accent text-primary" : "border-line text-secondary"}`}>
              {ROUND_TYPE_LABELS[r]}
            </Link>
          ))}
          {allTags.length ? <span className="mx-1 text-muted">|</span> : null}
          {allTags.map((t) => (
            <Link key={t} href={filterHref({ tag: tag === t ? null : t })} className={`rounded-sm border px-2 py-1 no-underline ${tag === t ? "border-accent text-primary" : "border-line text-secondary"}`}>
              #{t}
            </Link>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="card p-8 text-center text-sm text-secondary">
            {items.length === 0 ? "아직 이 맵의 전술이 없습니다. 오른쪽에서 첫 전술을 만드세요." : "필터에 맞는 전술이 없습니다."}
          </div>
        ) : (
          <form method="get" action={`/tactics/${map.slug}/overlay`}>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-base text-xs text-secondary">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-normal" title="겹쳐보기에 포함">
                      겹침
                    </th>
                    <th className="px-3 py-2.5 text-left font-normal">전술</th>
                    <th className="px-3 py-2.5 text-left font-normal">진영 · 라운드</th>
                    <th className="px-3 py-2.5 text-left font-normal">태그</th>
                    <th className="px-3 py-2.5 text-left font-normal">작성</th>
                    <th className="px-3 py-2.5 text-left font-normal">구성</th>
                    <th className="px-3 py-2.5 text-right font-normal">동작</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(({ tactic, author, stageCount, objectCount, slotsFilled }) => {
                    const canEdit = canEditTactic(tactic, me);
                    return (
                      <tr key={tactic.id} className="border-t border-line">
                        <td className="px-3 py-2.5">
                          <input type="checkbox" name="ids" value={tactic.id} className="accent-[var(--accent)]" aria-label={`${tactic.name} 겹쳐보기`} />
                        </td>
                        <td className="px-3 py-2.5">
                          <Link href={`/tactics/board/${tactic.id}`} className="inline-flex items-center gap-2 font-medium text-primary no-underline hover:text-accent">
                            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: layerColor(tactic.layerHue) }} aria-hidden />
                            {tactic.name}
                          </Link>
                          {tactic.isShared ? (
                            <span className="ml-2 badge bg-info/15 text-info" title="전술가 공통 전술 — 오늘의 스쿼드 후보">
                              공통{tactic.priority > 0 ? ` · 우선 ${tactic.priority}` : ""}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          <span className={tactic.side === "attack" ? "text-side-attack" : "text-side-defense"}>{TACTIC_SIDE_LABELS[tactic.side]}</span>
                          <span className="text-secondary"> · {ROUND_TYPE_LABELS[tactic.roundType]}</span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-secondary">{tactic.tags.map((t) => `#${t}`).join(" ") || "—"}</td>
                        <td className="px-3 py-2.5 text-xs">{author?.nickname ?? "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-secondary">
                          단계 {stageCount} · 객체 {objectCount} · 슬롯 {slotsFilled}/5
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="inline-flex gap-1">
                            <Link href={`/tactics/board/${tactic.id}`} className="btn-secondary min-h-8 px-2 text-xs no-underline">
                              {canEdit ? "편집" : "열기"}
                            </Link>
                            <button type="submit" formAction={duplicateTacticAction} name="tacticId" value={tactic.id} className="btn-secondary min-h-8 px-2 text-xs">
                              복제
                            </button>
                            {canEdit ? (
                              <button type="submit" formAction={deleteTacticAction} name="tacticId" value={tactic.id} className="btn-danger min-h-8 px-2 text-xs">
                                삭제
                              </button>
                            ) : null}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button type="submit" className="btn-secondary min-h-9 px-3 text-xs">
                체크한 전술 겹쳐보기
              </button>
              <span className="text-xs text-muted">같은 맵의 전술을 색조별로 한 화면에 올립니다 (투명도 조절)</span>
            </div>
          </form>
        )}
      </section>

      <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[340px]">
        <NewTacticForm mapId={map.id} canManageShared={canManageSharedTactics(me)} />
        <div className="card p-4 text-sm">
          <div className="mb-2 font-bold">외부 라인업 사이트</div>
          <ul className="flex flex-col gap-1.5 text-xs">
            {EXTERNAL_TOOLS.map((t) => (
              <li key={t.name} className="flex items-start justify-between gap-2">
                <a href={t.url} target="_blank" rel="noreferrer noopener" className="text-info">
                  {t.name} ↗
                </a>
                <span className="text-right text-secondary">{t.role}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">라인업 영상은 복제하지 않고, 보드의 스킬 핑에 링크로 붙입니다.</p>
        </div>
      </aside>
    </div>
  );
}

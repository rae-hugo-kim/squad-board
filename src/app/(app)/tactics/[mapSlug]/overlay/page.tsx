import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { getMapBySlug, listActiveAgents } from "@/server/queries/prefs";
import { getTacticsForOverlay } from "@/server/queries/tactics";
import { OverlayViewer } from "@/components/tactic-board/overlay-viewer";

export const metadata: Metadata = { title: "겹쳐보기" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ mapSlug: string }>; searchParams: Promise<{ ids?: string | string[] }> };

/** 겹쳐보기 — ?ids=a&ids=b 로 받은 전술을 한 보드에 올린다. 다른 맵의 전술은 건너뛴다. */
export default async function OverlayPage({ params, searchParams }: Props) {
  const { mapSlug } = await params;
  const sp = await searchParams;
  await requireMember();
  const map = await getMapBySlug(mapSlug);
  if (!map) notFound();
  const ids = (Array.isArray(sp.ids) ? sp.ids : sp.ids ? [sp.ids] : []).filter((s) => /^[0-9a-f-]{36}$/.test(s));
  const [details, agentList] = await Promise.all([getTacticsForOverlay(ids), listActiveAgents()]);
  const sameMap = details.filter((d) => d.tactic.mapId === map.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/tactics/${map.slug}`} className="text-sm text-secondary no-underline hover:text-primary">
          ← {map.nameKo} 전술 목록
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-wide">
          겹쳐보기 · <span className="uppercase">{map.nameEn}</span>
        </h1>
        <span className="text-xs text-secondary">{sameMap.length}개 전술</span>
      </div>
      {sameMap.length === 0 ? (
        <div className="card p-8 text-center text-sm text-secondary">겹쳐볼 전술을 목록에서 체크한 뒤 다시 시도하세요.</div>
      ) : (
        <OverlayViewer
          mapImage={map.imagePath}
          mapNameEn={map.nameEn}
          callouts={map.callouts}
          tactics={sameMap.map((d) => ({
            id: d.tactic.id,
            name: d.tactic.name,
            side: d.tactic.side,
            roundType: d.tactic.roundType,
            layerHue: d.tactic.layerHue,
            stages: d.stages.map((s) => ({ id: s.id, seq: s.seq, name: s.name, objects: s.objects })),
          }))}
          agents={agentList.map((a) => ({ id: a.id, nameKo: a.nameKo, roleGroup: a.roleGroup, iconUrl: a.iconUrl, abilities: a.abilities }))}
        />
      )}
    </div>
  );
}

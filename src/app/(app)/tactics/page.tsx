import type { Metadata } from "next";
import { MapSelection } from "@/components/map-selection";
import { listMaps } from "@/server/queries/prefs";

export const metadata: Metadata = { title: "맵별 전술" };
export const dynamic = "force-dynamic";

/** 실제 등록된 모든 맵의 전술 보드를 선택한다. */
export default async function TacticsIndex() {
  const maps = await listMaps();

  return (
    <div className="flex flex-col gap-6">
      <header className="page-intro">
        <p className="eyebrow">TACTICS</p>
        <h1>전술 보드</h1>
        <p className="page-description">맵별 전술을 그리고 공통 전술에 우선도를 매깁니다.</p>
      </header>
      <MapSelection maps={maps} />
    </div>
  );
}

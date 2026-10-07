import Link from "next/link";
import type { GameMap } from "@/db/schema";
import { mapImagePath } from "@/db/seed-data";

function MapCard({ map }: { map: GameMap }) {
  return (
    <Link className="map-card" href={`/tactics/${map.slug}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="map-card__image"
        src={map.splashUrl || map.imagePath || mapImagePath(map.slug)}
        alt={`${map.nameKo} ${map.splashUrl ? "전경" : "미니맵"}`}
        loading="lazy"
      />
      <span className="map-card__content">
        <strong className="map-card__name">{map.nameEn}</strong>
        <span className="map-card__name-ko">{map.nameKo}</span>
      </span>
    </Link>
  );
}

export function MapSelection({ maps }: { maps: GameMap[] }) {
  const rotationMaps = maps.filter((map) => map.inPool);

  return (
    <section className="map-selection" aria-labelledby="map-selection-title">
      <div className="map-selection__intro">
        <p className="section-label">MAP SELECT</p>
        <h2 id="map-selection-title">맵 선택</h2>
        <p>맵을 선택해 요원 조합과 전술 보드를 확인하세요.</p>
      </div>
      <div className="map-groups">
        <section className="map-group" aria-labelledby="rotation-maps-title">
          <div className="map-group__heading">
            <h3 id="rotation-maps-title">현재 맵 로테이션</h3>
            <span>{rotationMaps.length} MAPS</span>
          </div>
          {rotationMaps.length ? (
            <div className="map-card-grid">
              {rotationMaps.map((map) => <MapCard key={map.id} map={map} />)}
            </div>
          ) : (
            <p className="map-status">현재 로테이션에 등록된 맵이 없습니다.</p>
          )}
        </section>
        <section className="map-group" aria-labelledby="all-maps-title">
          <div className="map-group__heading">
            <h3 id="all-maps-title">전체 맵</h3>
            <span>{maps.length} MAPS</span>
          </div>
          {maps.length ? (
            <div className="map-card-grid">
              {maps.map((map) => <MapCard key={map.id} map={map} />)}
            </div>
          ) : (
            <p className="map-status">등록된 맵이 없습니다. 맵 마스터 데이터를 동기화하세요.</p>
          )}
        </section>
      </div>
    </section>
  );
}

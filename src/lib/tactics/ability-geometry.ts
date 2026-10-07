import type { AbilityKind, TacticObjectKind } from "@/db/schema";

/**
 * 스킬 실제 크기 — 게임 세계 좌표(1m = 100유닛) ↔ 보드 비율(0~1) 환산과 스킬별 기본 크기 표. 순수 모듈.
 *
 * 왜 필요한가: 보드 좌표는 맵 폭 대비 비율이라 "연막 반경 4.5%" 같은 값은 맵마다 다른 실제 크기가 된다.
 * 공식 미니맵 데이터의 xMultiplier 역수(= 미니맵 폭이 몇 유닛인지, maps.units_per_board)를 알면 미터로 지정한 크기를
 * 맵마다 올바른 비율로 바꿀 수 있다. 값이 없는 맵(동기화 전)은 DEFAULT_UNITS_PER_BOARD로 근사한다.
 *
 * 수치 출처(2026-10-07 조사)
 * - 오멘 어둠의 장막 반경 4.1m (Fandom 위키, 게임 파일 확인값), 브림스톤 하늘 연막 4.15m (패치 노트: 410 → 415유닛)
 * - 바이퍼 독구름·독사의 송곳니 반경 4.5m (공식 위키 "Same size as Snake Bite")
 * - 세이지 방벽 구슬: 4분절 벽, 시전 거리 15m(패치 11.08) — 전체 길이 공식 수치는 못 찾아 10m로 두고 보드에서 조절
 * - 그 외 "추정" 표시는 공식 수치 미확인. 보드의 길이·반경 핸들로 맞추면 된다.
 */

/** 공식 데이터가 없을 때의 미니맵 폭(유닛). 어센트 xMultiplier 0.00007 → 약 14,286유닛(≈143m) 기준. */
export const DEFAULT_UNITS_PER_BOARD = 14286;
export const UNITS_PER_METER = 100;

export function metersToBoard(meters: number, unitsPerBoard: number | null | undefined): number {
  const u = unitsPerBoard && unitsPerBoard > 0 ? unitsPerBoard : DEFAULT_UNITS_PER_BOARD;
  return (meters * UNITS_PER_METER) / u;
}

export function boardToMeters(fraction: number, unitsPerBoard: number | null | undefined): number {
  const u = unitsPerBoard && unitsPerBoard > 0 ? unitsPerBoard : DEFAULT_UNITS_PER_BOARD;
  return (fraction * u) / UNITS_PER_METER;
}

export type AbilityShape = "circle" | "wall" | "sector" | "point";

export type AbilityGeometry = {
  shape: AbilityShape;
  /** 원형 범위 반경(m) */
  radiusM?: number;
  /** 벽 길이(m) */
  lengthM?: number;
  /** 부채꼴 각(도) */
  angleDeg?: number;
  /** 공식 확인 여부. false면 추정값 — 화면에서 "추정"으로 표시한다 */
  confirmed: boolean;
};

/** 스킬별 기하 (키: "<요원 slug>:<c|q|e|x>"). 표에 없으면 스킬 유형 기본값(DEFAULT_BY_KIND). */
export const ABILITY_GEOMETRY: Record<string, AbilityGeometry> = {
  // 연막 (원형)
  "omen:e": { shape: "circle", radiusM: 4.1, confirmed: true },
  "brimstone:e": { shape: "circle", radiusM: 4.15, confirmed: true },
  "viper:q": { shape: "circle", radiusM: 4.5, confirmed: true },
  "astra:e": { shape: "circle", radiusM: 4.1, confirmed: false },
  "clove:q": { shape: "circle", radiusM: 4.1, confirmed: false },
  "harbor:q": { shape: "circle", radiusM: 3.5, confirmed: false },
  "jett:c": { shape: "circle", radiusM: 3, confirmed: false },
  "cypher:q": { shape: "circle", radiusM: 2.5, confirmed: false },
  // 몰리 (원형)
  "viper:c": { shape: "circle", radiusM: 4.5, confirmed: true },
  "brimstone:q": { shape: "circle", radiusM: 3, confirmed: false },
  "phoenix:c": { shape: "circle", radiusM: 3, confirmed: false },
  "killjoy:c": { shape: "circle", radiusM: 3, confirmed: false },
  "kayo:c": { shape: "circle", radiusM: 3.5, confirmed: false },
  "clove:c": { shape: "circle", radiusM: 3, confirmed: false },
  "gekko:c": { shape: "circle", radiusM: 3.5, confirmed: false },
  // 벽 (선형)
  "sage:c": { shape: "wall", lengthM: 10, confirmed: false },
  "viper:e": { shape: "wall", lengthM: 20, confirmed: false },
  "harbor:e": { shape: "wall", lengthM: 15, confirmed: false },
  "harbor:c": { shape: "wall", lengthM: 15, confirmed: false },
  "phoenix:e": { shape: "wall", lengthM: 8, confirmed: false },
  "neon:c": { shape: "wall", lengthM: 20, confirmed: false },
  "deadlock:e": { shape: "wall", lengthM: 6, confirmed: false },
  // 정보 (부채꼴) — 범위는 맵·높이에 따라 달라 추정
  "sova:e": { shape: "sector", radiusM: 12, angleDeg: 360, confirmed: false },
  "fade:q": { shape: "sector", radiusM: 10, angleDeg: 360, confirmed: false },
  "cypher:e": { shape: "sector", radiusM: 15, angleDeg: 70, confirmed: false },
  "killjoy:e": { shape: "sector", radiusM: 18, angleDeg: 180, confirmed: false },
};

/** 스킬 유형별 기본 크기 (표에 없는 스킬). 연막 4.1m는 가장 흔한 연막 크기. */
export const DEFAULT_BY_KIND: Partial<Record<AbilityKind, AbilityGeometry>> = {
  smoke: { shape: "circle", radiusM: 4.1, confirmed: false },
  molly: { shape: "circle", radiusM: 3, confirmed: false },
  recon: { shape: "sector", radiusM: 12, angleDeg: 70, confirmed: false },
  flash: { shape: "point", confirmed: false },
  trap: { shape: "point", confirmed: false },
};

/** 요원·키로 기하를 찾는다. 표 → 유형 기본값 → point. */
export function geometryFor(agentSlug: string | null | undefined, key: string | null | undefined, kind: AbilityKind): AbilityGeometry {
  if (agentSlug && key) {
    const hit = ABILITY_GEOMETRY[`${agentSlug}:${key}`];
    if (hit) return hit;
  }
  return DEFAULT_BY_KIND[kind] ?? { shape: "point", confirmed: false };
}

/** 스킬 유형 → 보드 객체 종류. 벽형 스킬은 유형(연막/설치형)과 무관하게 wall 객체로 놓는다. */
export function objectKindForAbility(agentSlug: string | null | undefined, key: string | null | undefined, kind: AbilityKind): TacticObjectKind {
  if (geometryFor(agentSlug, key, kind).shape === "wall") return "wall";
  switch (kind) {
    case "smoke":
    case "flash":
    case "trap":
    case "molly":
    case "recon":
      return kind;
    default:
      return "cast";
  }
}

/** 종류별 기본 크기(보드 비율). 기하 표의 미터 값을 맵 스케일로 환산한다. */
export function defaultSizeFor(
  kind: TacticObjectKind,
  geometry: AbilityGeometry | null,
  unitsPerBoard: number | null | undefined,
): { radius: number | null; angle: number | null; length: number | null } {
  const g = geometry ?? KIND_FALLBACK[kind] ?? null;
  const radiusM = g?.radiusM ?? null;
  const lengthM = g?.lengthM ?? null;
  const isArea = kind === "smoke" || kind === "molly" || kind === "recon";
  return {
    radius: isArea ? metersToBoard(radiusM ?? 4.1, unitsPerBoard) : null,
    angle: kind === "recon" ? (g?.angleDeg ?? 70) : null,
    length: kind === "wall" ? metersToBoard(lengthM ?? 10, unitsPerBoard) : null,
  };
}

/** 시전 요원 없이 놓는 일반 핑의 종류별 기본 크기 */
const KIND_FALLBACK: Partial<Record<TacticObjectKind, AbilityGeometry>> = {
  smoke: DEFAULT_BY_KIND.smoke,
  molly: DEFAULT_BY_KIND.molly,
  recon: DEFAULT_BY_KIND.recon,
  wall: { shape: "wall", lengthM: 10, confirmed: false },
};

/** 화면 표기용: 0.0287 → "4.1 m" */
export function formatMeters(fraction: number | null | undefined, unitsPerBoard: number | null | undefined): string {
  if (fraction == null) return "—";
  return `${boardToMeters(fraction, unitsPerBoard).toFixed(1)} m`;
}

/**
 * 감도 계산 (기획서 7절).
 *
 * 발로란트는 감도 1에서 마우스 1카운트당 0.07° 회전한다(yaw). 그래서 360° 회전에 필요한 카운트 = 360 / (0.07 × sens),
 * 거리로는 (360 / (0.07 × sens)) / DPI 인치. eDPI = DPI × sens 는 이 회전 거리의 역수에 비례한다.
 * 브라우저 테스트는 수평 시야각 103°를 캔버스 폭에 대응시켜 "카운트 → 화면 px"를 같은 비율로 맞춘다.
 * 3D 투영이 없어 완전한 재현은 아니며, "내 감도 범위를 좁히는 도구"로 위치시킨다.
 */
export const YAW_DEG_PER_COUNT = 0.07;
export const HORIZONTAL_FOV_DEG = 103;

export function edpi(dpi: number, sens: number): number {
  return Math.round(dpi * sens * 10) / 10;
}

/** 360° 회전에 필요한 마우스 이동 거리(cm) */
export function cmPer360(dpi: number, sens: number): number {
  const counts = 360 / (YAW_DEG_PER_COUNT * sens);
  return Math.round((counts / dpi) * 2.54 * 10) / 10;
}

/** 캔버스 폭(px)에서 마우스 1카운트가 옮기는 화면 px */
export function pxPerCount(canvasWidth: number, sens: number): number {
  return (canvasWidth / HORIZONTAL_FOV_DEG) * YAW_DEG_PER_COUNT * sens;
}

/**
 * 이분 탐색 한 단계: 두 후보(A=1/3 지점, B=2/3 지점)를 테스트한 뒤 더 나은 쪽으로 구간을 좁힌다.
 * A가 낫다면 [low, B], B가 낫다면 [A, high]. 5~6회면 구간이 (2/3)^n으로 줄어 충분히 좁아진다.
 */
export function candidates(low: number, high: number): { a: number; b: number } {
  return { a: round3(low + (high - low) / 3), b: round3(low + ((high - low) * 2) / 3) };
}

export function narrow(low: number, high: number, aBetter: boolean): { low: number; high: number } {
  const { a, b } = candidates(low, high);
  return aBetter ? { low, high: b } : { low: a, high };
}

export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * 테스트 점수. 플릭(초당 명중 수, 2/s를 만점으로)과 트래킹(표적 위 시간 비율)을 반반 섞는다.
 * 비교용 상대 점수라 절대값에 의미를 두지 않는다.
 */
export function compositeScore(flick: { hits: number; seconds: number; misses: number }, tracking: { onTargetFraction: number }): number {
  const hitsPerSec = flick.seconds > 0 ? flick.hits / flick.seconds : 0;
  const flickScore = Math.min(1, hitsPerSec / 2) * Math.max(0.5, 1 - flick.misses * 0.05);
  return Math.round((flickScore * 0.5 + Math.min(1, Math.max(0, tracking.onTargetFraction)) * 0.5) * 1000) / 1000;
}

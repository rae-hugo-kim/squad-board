import type { Point } from "@/db/schema";

/**
 * 보드 도형 기하 — 순수 함수. 보드 좌표계는 viewBox 0~1000 (저장은 0~1, 렌더 시 ×1000).
 */
export const BOARD = 1000;

export type View = { scale: number; tx: number; ty: number };
export const DEFAULT_VIEW: View = { scale: 1, tx: 0, ty: 0 };
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 6;

/** 화면 픽셀 → 보드 좌표(0~1). svg의 CTM과 현재 view(translate·scale)를 역변환한다. */
export function clientToBoard(svg: SVGSVGElement, clientX: number, clientY: number, view: View): Point {
  const rect = svg.getBoundingClientRect();
  // viewBox가 정사각형이고 preserveAspectRatio 기본(meet)이므로 짧은 변 기준으로 맞춰진다
  const size = Math.min(rect.width, rect.height);
  const offsetX = (rect.width - size) / 2;
  const offsetY = (rect.height - size) / 2;
  const vx = ((clientX - rect.left - offsetX) / size) * BOARD;
  const vy = ((clientY - rect.top - offsetY) / size) * BOARD;
  return { x: (vx - view.tx) / view.scale / BOARD, y: (vy - view.ty) / view.scale / BOARD };
}

/** 커서 위치를 고정점으로 확대·축소 */
export function zoomAt(view: View, factor: number, anchor: Point): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  const ax = anchor.x * BOARD;
  const ay = anchor.y * BOARD;
  // anchor(보드 좌표)가 화면에서 같은 자리에 머물도록 tx/ty를 보정
  const screenX = ax * view.scale + view.tx;
  const screenY = ay * view.scale + view.ty;
  return { scale, tx: screenX - ax * scale, ty: screenY - ay * scale };
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** 부채꼴 path (정보 스킬). angle = 벌어진 각(도), rotation = 중심 방향(도, 0 = 위쪽). */
export function sectorPath(cx: number, cy: number, r: number, angleDeg: number, rotationDeg: number): string {
  const a = Math.min(359.9, Math.max(1, angleDeg));
  const start = ((rotationDeg - a / 2 - 90) * Math.PI) / 180;
  const end = ((rotationDeg + a / 2 - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  const large = a > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

/** 별 꼭짓점 (섬광·중요 거점) */
export function starPoints(cx: number, cy: number, outer: number, inner: number, n = 5): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const ang = (Math.PI / n) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(ang)).toFixed(1)},${(cy + r * Math.sin(ang)).toFixed(1)}`);
  }
  return pts.join(" ");
}

/** 경로 끝 화살촉 (마지막 두 점 방향) */
export function arrowHead(points: Point[], size: number): string | null {
  if (points.length < 2) return null;
  const a = points[points.length - 2];
  const b = points[points.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const base = { x: b.x - ux * size, y: b.y - uy * size };
  const left = { x: base.x + px * (size * 0.6), y: base.y + py * (size * 0.6) };
  const right = { x: base.x - px * (size * 0.6), y: base.y - py * (size * 0.6) };
  return `${b.x.toFixed(1)},${b.y.toFixed(1)} ${left.x.toFixed(1)},${left.y.toFixed(1)} ${right.x.toFixed(1)},${right.y.toFixed(1)}`;
}

/** 점과 폴리라인의 최소 거리 (경로 선택 판정) */
export function distanceToPolyline(p: Point, pts: Point[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const l2 = abx * abx + aby * aby || 1e-9;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2));
    const qx = a.x + t * abx;
    const qy = a.y + t * aby;
    best = Math.min(best, Math.hypot(p.x - qx, p.y - qy));
  }
  return best;
}

export function translatePoints(pts: Point[], dx: number, dy: number): Point[] {
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

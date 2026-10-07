"use client";

import type { RoleGroup } from "@/db/schema";
import { ROLE_LABELS } from "@/db/seed-data";
import { arrowHead, BOARD, sectorPath, starPoints } from "@/lib/tactics/geometry";
import { ALLY_COLOR, ENEMY_COLOR, OBJECT_META, type BoardObject } from "@/lib/tactics/types";

export type AgentLite = { id: string; nameKo: string; roleGroup: RoleGroup };

/**
 * 객체 종류별 SVG 도형 (기획서 4절 표). 좌표는 0~1 → ×1000.
 * `hue`가 있으면(겹쳐보기) 테두리·경로 색을 레이어 색조로 바꾼다. 연막은 채움이 본체라 투명도만 유지한다.
 */
export function ObjectShape({
  obj,
  agentById,
  hue,
  selected,
  scale,
}: {
  obj: BoardObject;
  agentById: Map<string, AgentLite>;
  hue?: string | null;
  selected?: boolean;
  /** 현재 확대 배율 — 선 두께·글자를 화면에서 일정하게 보이도록 나눈다 */
  scale: number;
}) {
  const cx = obj.x * BOARD;
  const cy = obj.y * BOARD;
  const meta = OBJECT_META[obj.kind];
  const base = obj.color ?? meta.color;
  const stroke = hue ?? base;
  const sw = 2 / scale;
  const fontSize = 13 / scale;
  const labelY = cy + 24 / scale;

  const label =
    obj.label && obj.kind !== "note" && obj.kind !== "timing" ? (
      <text x={cx} y={labelY} textAnchor="middle" fontSize={fontSize} fill="#ece8e1" stroke="#0a1017" strokeWidth={3 / scale} paintOrder="stroke" fontFamily="Pretendard, sans-serif">
        {obj.label}
      </text>
    ) : null;

  const selectionRing = selected ? <circle cx={cx} cy={cy} r={22 / scale} fill="none" stroke="#ff4655" strokeWidth={sw} strokeDasharray={`${4 / scale} ${3 / scale}`} /> : null;

  switch (obj.kind) {
    case "agent": {
      const team = obj.team ?? "ally";
      const fill = hue ?? (team === "enemy" ? ENEMY_COLOR : ALLY_COLOR);
      const agent = obj.casterAgentId ? agentById.get(obj.casterAgentId) : undefined;
      const text = agent ? agent.nameKo.slice(0, 2) : obj.slotNo ? String(obj.slotNo) : team === "enemy" ? "E" : "?";
      const r = 14 / scale;
      return (
        <g>
          {selectionRing}
          <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#0a1017" strokeWidth={sw} />
          {agent ? <circle cx={cx + r * 0.75} cy={cy - r * 0.75} r={4 / scale} fill={ROLE_LABELS[agent.roleGroup].cssVar} stroke="#0a1017" strokeWidth={1 / scale} /> : null}
          <text x={cx} y={cy + 4.5 / scale} textAnchor="middle" fontSize={11 / scale} fontWeight={700} fill="#0a1017" fontFamily="Pretendard, sans-serif">
            {text}
          </text>
          {obj.slotNo && agent ? (
            <text x={cx} y={cy - 18 / scale} textAnchor="middle" fontSize={10 / scale} fill="#9da6ae" fontFamily="JetBrains Mono, monospace">
              #{obj.slotNo}
            </text>
          ) : null}
          {label}
        </g>
      );
    }
    case "smoke": {
      const r = (obj.radius ?? 0.045) * BOARD;
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill={hue ? `${hue}55` : base} stroke={stroke} strokeWidth={sw} />
          {selected ? <circle cx={cx} cy={cy} r={r + 4 / scale} fill="none" stroke="#ff4655" strokeWidth={sw} strokeDasharray={`${4 / scale} ${3 / scale}`} /> : null}
          {label}
        </g>
      );
    }
    case "molly": {
      const r = (obj.radius ?? 0.03) * BOARD;
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill={`${hue ?? "#ff7a2e"}33`} stroke={stroke} strokeWidth={sw} strokeDasharray={`${5 / scale} ${3 / scale}`} />
          <polygon points={`${cx},${cy - 9 / scale} ${cx + 6 / scale},${cy + 5 / scale} ${cx - 6 / scale},${cy + 5 / scale}`} fill={stroke} />
          {selected ? <circle cx={cx} cy={cy} r={r + 4 / scale} fill="none" stroke="#ff4655" strokeWidth={sw} strokeDasharray={`${4 / scale} ${3 / scale}`} /> : null}
          {label}
        </g>
      );
    }
    case "recon": {
      const r = (obj.radius ?? 0.12) * BOARD;
      return (
        <g>
          <path d={sectorPath(cx, cy, r, obj.angle ?? 70, obj.rotation)} fill={`${hue ?? "#5ac8fa"}2e`} stroke={stroke} strokeWidth={sw} />
          <circle cx={cx} cy={cy} r={5 / scale} fill={stroke} />
          {selectionRing}
          {label}
        </g>
      );
    }
    case "flash":
      return (
        <g>
          {selectionRing}
          <polygon points={starPoints(cx, cy, 13 / scale, 6 / scale)} fill={hue ?? base} stroke="#0a1017" strokeWidth={1 / scale} />
          {label}
        </g>
      );
    case "trap": {
      const s = 9 / scale;
      return (
        <g>
          {selectionRing}
          <rect x={cx - s} y={cy - s} width={s * 2} height={s * 2} fill={hue ?? base} stroke="#0a1017" strokeWidth={1 / scale} />
          <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} fill="#0a1017" />
          {label}
        </g>
      );
    }
    case "cast": {
      const s = 8 / scale;
      return (
        <g>
          {selectionRing}
          <polygon points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`} fill={hue ?? base} stroke="#0a1017" strokeWidth={1 / scale} />
          {label}
        </g>
      );
    }
    case "objective":
      return (
        <g>
          {selectionRing}
          <polygon points={starPoints(cx, cy, 16 / scale, 7 / scale)} fill="none" stroke={hue ?? base} strokeWidth={sw * 1.2} />
          {label}
        </g>
      );
    case "danger": {
      const s = 14 / scale;
      return (
        <g>
          {selectionRing}
          <polygon points={`${cx},${cy - s} ${cx + s},${cy + s * 0.8} ${cx - s},${cy + s * 0.8}`} fill={hue ?? base} stroke="#0a1017" strokeWidth={1 / scale} />
          <text x={cx} y={cy + s * 0.55} textAnchor="middle" fontSize={13 / scale} fontWeight={700} fill="#0a1017">
            !
          </text>
          {label}
        </g>
      );
    }
    case "note": {
      const text = obj.label || "메모";
      const w = Math.max(40, text.length * 7.5 + 16) / scale;
      const h = 22 / scale;
      return (
        <g>
          <path d={`M ${cx - w / 2} ${cy - h} h ${w} v ${h} h ${-(w / 2 - 6 / scale)} l ${-6 / scale} ${8 / scale} l ${-2 / scale} ${-8 / scale} h ${-(w / 2 - 2 / scale)} z`} fill="#1a2733" stroke={hue ?? base} strokeWidth={sw * 0.75} />
          <text x={cx} y={cy - h / 2 + 4.5 / scale} textAnchor="middle" fontSize={fontSize} fill="#ece8e1" fontFamily="Pretendard, sans-serif">
            {text}
          </text>
          {selected ? <rect x={cx - w / 2 - 3 / scale} y={cy - h - 3 / scale} width={w + 6 / scale} height={h + 14 / scale} fill="none" stroke="#ff4655" strokeWidth={sw} strokeDasharray={`${4 / scale} ${3 / scale}`} /> : null}
        </g>
      );
    }
    case "timing": {
      const text = obj.label || "0:00";
      const w = Math.max(28, text.length * 7 + 10) / scale;
      const h = 16 / scale;
      return (
        <g>
          <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={2 / scale} fill={hue ?? "#ece8e1"} />
          <text x={cx} y={cy + 4 / scale} textAnchor="middle" fontSize={10 / scale} fontWeight={700} fill="#0a1017" fontFamily="JetBrains Mono, monospace">
            {text}
          </text>
          {selected ? <rect x={cx - w / 2 - 3 / scale} y={cy - h / 2 - 3 / scale} width={w + 6 / scale} height={h + 6 / scale} fill="none" stroke="#ff4655" strokeWidth={sw} strokeDasharray={`${4 / scale} ${3 / scale}`} /> : null}
        </g>
      );
    }
    case "path_ally":
    case "path_enemy_expected":
    case "path_enemy_actual": {
      if (obj.points.length < 2) return null;
      const pts = obj.points.map((p) => ({ x: p.x * BOARD, y: p.y * BOARD }));
      const color = hue ?? (obj.kind === "path_ally" ? ALLY_COLOR : ENEMY_COLOR);
      const dash = obj.kind === "path_enemy_expected" ? `${6 / scale} ${4 / scale}` : undefined;
      const head = arrowHead(pts, 12 / scale);
      const first = pts[0];
      return (
        <g>
          {selected ? <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#ff4655" strokeWidth={(2 + 6) / scale} strokeOpacity={0.35} strokeLinejoin="round" /> : null}
          <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color} strokeWidth={sw} strokeDasharray={dash} strokeLinejoin="round" strokeLinecap="round" />
          {head ? <polygon points={head} fill={color} /> : null}
          {obj.slotNo ? (
            <text x={first.x} y={first.y - 6 / scale} fontSize={10 / scale} fill={color} fontFamily="JetBrains Mono, monospace">
              #{obj.slotNo}
            </text>
          ) : null}
          {obj.label ? (
            <text x={pts[pts.length - 1].x} y={pts[pts.length - 1].y + 18 / scale} textAnchor="middle" fontSize={fontSize} fill="#ece8e1" stroke="#0a1017" strokeWidth={3 / scale} paintOrder="stroke" fontFamily="Pretendard, sans-serif">
              {obj.label}
            </text>
          ) : null}
        </g>
      );
    }
    default:
      return null;
  }
}

/** cast(시전 위치) ↔ 연결된 핑을 잇는 선. 두 객체가 같은 단계에 있을 때만 그린다. */
export function LinkLine({ from, to, hue, scale }: { from: BoardObject; to: BoardObject; hue?: string | null; scale: number }) {
  return (
    <line
      x1={from.x * BOARD}
      y1={from.y * BOARD}
      x2={to.x * BOARD}
      y2={to.y * BOARD}
      stroke={hue ?? "#ece8e1"}
      strokeWidth={1 / scale}
      strokeDasharray={`${3 / scale} ${3 / scale}`}
      opacity={0.7}
    />
  );
}

"use client";

import type { Ability, RoleGroup } from "@/db/schema";
import { ROLE_LABELS } from "@/db/seed-data";
import { arrowHead, BOARD, sectorHandle, sectorPath, starPoints, wallEndpoints } from "@/lib/tactics/geometry";
import { ALLY_COLOR, ENEMY_COLOR, OBJECT_META, type BoardObject } from "@/lib/tactics/types";

export type AgentLite = { id: string; nameKo: string; roleGroup: RoleGroup; iconUrl?: string | null; abilities?: Ability[] };
/** 오늘의 라인업에서 슬롯에 바인딩된 멤버 (src/lib/squad/lineup.ts SlotMember와 같은 모양) */
export type SlotMemberLite = { memberId: string; nickname: string; agentId: string | null };

/** 스킬 핑 중앙에 올리는 공식 스킬 아이콘 배지. 아이콘이 없으면 아무것도 그리지 않는다(도형만). */
function AbilityBadge({ obj, agentById, cx, cy, scale }: { obj: BoardObject; agentById: Map<string, AgentLite>; cx: number; cy: number; scale: number }) {
  const agent = obj.casterAgentId ? agentById.get(obj.casterAgentId) : undefined;
  const ability = agent?.abilities?.find((a) => a.key === obj.abilityKey);
  const url = ability?.iconUrl;
  if (!url) return null;
  const r = 11 / scale;
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={r} fill="#0a1017" stroke="#ece8e1" strokeWidth={1 / scale} opacity={0.9} />
      <image href={url} x={cx - r * 0.72} y={cy - r * 0.72} width={r * 1.44} height={r * 1.44} preserveAspectRatio="xMidYMid meet" />
    </g>
  );
}

/**
 * 객체 종류별 SVG 도형 (기획서 4절 표). 좌표는 0~1 → ×1000.
 * `hue`가 있으면(겹쳐보기) 테두리·경로 색을 레이어 색조로 바꾼다. 연막은 채움이 본체라 투명도만 유지한다.
 */
export function ObjectShape({
  obj,
  agentById,
  slotMembers,
  hue,
  selected,
  scale,
}: {
  obj: BoardObject;
  agentById: Map<string, AgentLite>;
  slotMembers?: Record<number, SlotMemberLite>;
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
      // 라인업이 있으면 슬롯 토큰에 그 슬롯을 맡은 멤버의 요원을 보여준다 (토큰에 요원이 지정되어 있지 않을 때)
      const bound = obj.slotNo && team === "ally" ? slotMembers?.[obj.slotNo] : undefined;
      const agent = obj.casterAgentId ? agentById.get(obj.casterAgentId) : bound?.agentId ? agentById.get(bound.agentId) : undefined;
      const text = agent ? agent.nameKo.slice(0, 2) : obj.slotNo ? String(obj.slotNo) : team === "enemy" ? "E" : "?";
      const nameTag = bound ? (
        <text x={cx} y={labelY} textAnchor="middle" fontSize={fontSize} fontWeight={700} fill="#ece8e1" stroke="#0a1017" strokeWidth={3 / scale} paintOrder="stroke" fontFamily="Pretendard, sans-serif" data-lineup-name>
          {bound.nickname}
        </text>
      ) : null;
      const labelNode = bound && obj.label ? (
        <text x={cx} y={labelY + 13 / scale} textAnchor="middle" fontSize={11 / scale} fill="#9da6ae" stroke="#0a1017" strokeWidth={3 / scale} paintOrder="stroke" fontFamily="Pretendard, sans-serif">
          {obj.label}
        </text>
      ) : label;
      const r = 14 / scale;
      const clipId = `clip-${obj.id}`;
      return (
        <g>
          {selectionRing}
          {agent?.iconUrl ? (
            <>
              <defs>
                <clipPath id={clipId}>
                  <circle cx={cx} cy={cy} r={r} />
                </clipPath>
              </defs>
              <circle cx={cx} cy={cy} r={r + 2.5 / scale} fill={fill} />
              <image href={agent.iconUrl} x={cx - r} y={cy - r} width={r * 2} height={r * 2} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
            </>
          ) : (
            <>
              <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#0a1017" strokeWidth={sw} />
              {agent ? <circle cx={cx + r * 0.75} cy={cy - r * 0.75} r={4 / scale} fill={ROLE_LABELS[agent.roleGroup].cssVar} stroke="#0a1017" strokeWidth={1 / scale} /> : null}
              <text x={cx} y={cy + 4.5 / scale} textAnchor="middle" fontSize={11 / scale} fontWeight={700} fill="#0a1017" fontFamily="Pretendard, sans-serif">
                {text}
              </text>
            </>
          )}
          {obj.slotNo ? (
            <text x={cx} y={cy - 18 / scale} textAnchor="middle" fontSize={10 / scale} fill="#9da6ae" fontFamily="JetBrains Mono, monospace">
              #{obj.slotNo}
            </text>
          ) : null}
          {nameTag}
          {labelNode}
        </g>
      );
    }
    case "smoke": {
      const r = (obj.radius ?? 0.045) * BOARD;
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill={hue ? `${hue}55` : base} stroke={stroke} strokeWidth={sw} />
          <AbilityBadge obj={obj} agentById={agentById} cx={cx} cy={cy} scale={scale} />
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
          <AbilityBadge obj={obj} agentById={agentById} cx={cx} cy={cy} scale={scale} />
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
          <AbilityBadge obj={obj} agentById={agentById} cx={cx} cy={cy} scale={scale} />
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
          <AbilityBadge obj={obj} agentById={agentById} cx={cx} cy={cy} scale={scale} />
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
          <AbilityBadge obj={obj} agentById={agentById} cx={cx} cy={cy} scale={scale} />
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
          <AbilityBadge obj={obj} agentById={agentById} cx={cx} cy={cy} scale={scale} />
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
    case "wall": {
      // 벽형 스킬: 중심·길이·회전으로 양 끝점을 구해 굵은 선으로. 분절 눈금 4개(세이지 방벽처럼)로 길이감을 준다.
      const [a, b] = wallEndpoints({ x: cx, y: cy }, (obj.length ?? 0.07) * BOARD, obj.rotation);
      const color = hue ?? base;
      const w = Math.max(5 / scale, 6);
      const ticks = [0.25, 0.5, 0.75].map((t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }));
      const nx = -(b.y - a.y);
      const ny = b.x - a.x;
      const nl = Math.hypot(nx, ny) || 1;
      const tx = (nx / nl) * (w * 0.9);
      const ty = (ny / nl) * (w * 0.9);
      return (
        <g>
          {selected ? <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ff4655" strokeWidth={w + 8 / scale} strokeOpacity={0.35} strokeLinecap="round" /> : null}
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0a1017" strokeWidth={w + 2 / scale} strokeLinecap="round" />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={w} strokeLinecap="round" opacity={0.9} />
          {ticks.map((t, i) => (
            <line key={i} x1={t.x - tx} y1={t.y - ty} x2={t.x + tx} y2={t.y + ty} stroke="#0a1017" strokeWidth={1.2 / scale} opacity={0.7} />
          ))}
          <AbilityBadge obj={obj} agentById={agentById} cx={cx} cy={cy} scale={scale} />
          {label}
        </g>
      );
    }
    case "draw": {
      // 자유 그리기: 화살촉 없는 부드러운 선. 색은 견본에서 고른 값(없으면 흰색).
      if (obj.points.length < 2) return null;
      const pts = obj.points.map((p) => `${(p.x * BOARD).toFixed(1)},${(p.y * BOARD).toFixed(1)}`).join(" ");
      const color = hue ?? obj.color ?? base;
      return (
        <g>
          {selected ? <polyline points={pts} fill="none" stroke="#ff4655" strokeWidth={(3 + 6) / scale} strokeOpacity={0.35} strokeLinejoin="round" strokeLinecap="round" /> : null}
          <polyline points={pts} fill="none" stroke={color} strokeWidth={3 / scale} strokeLinejoin="round" strokeLinecap="round" />
          {obj.label ? (
            <text x={obj.points[0].x * BOARD} y={obj.points[0].y * BOARD - 6 / scale} fontSize={fontSize} fill="#ece8e1" stroke="#0a1017" strokeWidth={3 / scale} paintOrder="stroke" fontFamily="Pretendard, sans-serif">
              {obj.label}
            </text>
          ) : null}
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

export type HandleKind = "radius" | "dir" | "end-a" | "end-b";

/**
 * 선택한 객체의 조절 핸들 (편집 가능할 때만). 연막·몰리 = 반경, 정보 스킬 = 방향·반경, 벽 = 양 끝(길이·회전).
 * 핸들은 화면 크기가 일정하도록 scale로 나눈다. pointerdown은 편집기가 받아 드래그 모드를 바꾼다.
 */
export function ObjectHandles({ obj, scale, onPointerDown }: { obj: BoardObject; scale: number; onPointerDown: (e: React.PointerEvent<SVGCircleElement>, handle: HandleKind) => void }) {
  const cx = obj.x * BOARD;
  const cy = obj.y * BOARD;
  const r = 7 / scale;
  const dot = (handle: HandleKind, x: number, y: number, title: string) => (
    <circle
      key={handle}
      cx={x}
      cy={y}
      r={r}
      fill="#ece8e1"
      stroke="#ff4655"
      strokeWidth={2 / scale}
      style={{ cursor: handle === "radius" ? "ew-resize" : "grab" }}
      data-handle={handle}
      onPointerDown={(e) => onPointerDown(e, handle)}
    >
      <title>{title}</title>
    </circle>
  );
  if (obj.kind === "smoke" || obj.kind === "molly") {
    const rr = (obj.radius ?? 0.03) * BOARD;
    return <g data-handles>{dot("radius", cx + rr, cy, "드래그해 반경 조절")}</g>;
  }
  if (obj.kind === "recon") {
    const h = sectorHandle({ x: cx, y: cy }, (obj.radius ?? 0.08) * BOARD, obj.rotation);
    return (
      <g data-handles>
        <line x1={cx} y1={cy} x2={h.x} y2={h.y} stroke="#ff4655" strokeWidth={1 / scale} strokeDasharray={`${3 / scale} ${3 / scale}`} pointerEvents="none" />
        {dot("dir", h.x, h.y, "드래그해 방향·범위 조절")}
      </g>
    );
  }
  if (obj.kind === "wall") {
    const [a, b] = wallEndpoints({ x: cx, y: cy }, (obj.length ?? 0.07) * BOARD, obj.rotation);
    return (
      <g data-handles>
        {dot("end-a", a.x, a.y, "드래그해 길이·회전 조절")}
        {dot("end-b", b.x, b.y, "드래그해 길이·회전 조절")}
      </g>
    );
  }
  return null;
}

"use client";

import { forwardRef, useEffect, useRef, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import type { MapCallout, Point } from "@/db/schema";
import { BOARD, type View } from "@/lib/tactics/geometry";
import { OBJECT_META, type BoardObject } from "@/lib/tactics/types";
import { LinkLine, ObjectHandles, ObjectShape, type AgentLite, type HandleKind, type SlotMemberLite } from "./object-shapes";

export type BoardLayer = {
  id: string;
  objects: BoardObject[];
  /** 겹쳐보기 색조. null이면 종류별 기본 색 */
  hue: string | null;
  opacity: number;
};

type Props = {
  mapImage: string | null;
  /** 공식 콜아웃 라벨 (assets:sync). showCallouts일 때만 그린다 */
  callouts?: MapCallout[];
  showCallouts?: boolean;
  layers: BoardLayer[];
  agentById: Map<string, AgentLite>;
  /** 오늘의 라인업: 슬롯 번호 → 멤버·요원. 슬롯 토큰에 이름과 요원 아이콘을 얹는다 */
  slotMembers?: Record<number, SlotMemberLite>;
  view: View;
  selectedId?: string | null;
  /** 그리는 중인 경로 (편집기) */
  draftPoints?: Point[];
  draftKind?: BoardObject["kind"] | null;
  onCanvasPointerDown?: (e: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (e: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: ReactPointerEvent<SVGSVGElement>) => void;
  onObjectPointerDown?: (e: ReactPointerEvent<SVGGElement>, obj: BoardObject) => void;
  /** 선택 객체의 조절 핸들(반경·방향·벽 끝) — 있으면 편집 가능한 상태로 보고 핸들을 그린다 */
  onHandlePointerDown?: (e: ReactPointerEvent<SVGCircleElement>, obj: BoardObject, handle: HandleKind) => void;
  onWheel?: (e: ReactWheelEvent<SVGSVGElement>) => void;
  onDoubleClick?: () => void;
  cursor?: string;
  className?: string;
};

/**
 * 보드 SVG — 맵 이미지 위에 레이어(전술)별 객체를 그린다. 편집기·겹쳐보기·PNG 내보내기가 공유한다.
 * 상호작용 핸들러는 모두 선택적이라 읽기 전용으로도 쓸 수 있다.
 * viewBox는 1000×1000 고정이고 확대·이동은 안쪽 <g transform>으로 처리한다 (좌표 변환이 단순해진다).
 */
export const BoardSvg = forwardRef<SVGSVGElement, Props>(function BoardSvg(
  { mapImage, callouts, showCallouts, layers, agentById, slotMembers, view, selectedId, draftPoints, draftKind, onCanvasPointerDown, onPointerMove, onPointerUp, onObjectPointerDown, onHandlePointerDown, onWheel, onDoubleClick, cursor, className },
  ref,
) {
  const inner = useRef<SVGSVGElement | null>(null);
  const setRefs = (el: SVGSVGElement | null) => {
    inner.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };
  // 휠 확대 중 페이지가 같이 스크롤되는 문제: React의 onWheel은 passive로 붙어 preventDefault가 듣지 않는다.
  // 요소에 non-passive 네이티브 리스너를 직접 달아 기본 동작(스크롤)만 막고, 확대 로직은 onWheel이 그대로 받는다.
  useEffect(() => {
    const el = inner.current;
    if (!el || !onWheel) return;
    const block = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", block, { passive: false });
    return () => el.removeEventListener("wheel", block);
  }, [onWheel]);
  const selectedObj = selectedId && onHandlePointerDown ? layers.flatMap((l) => l.objects).find((o) => o.id === selectedId) : undefined;
  return (
    <svg
      ref={setRefs}
      viewBox={`0 0 ${BOARD} ${BOARD}`}
      className={className ?? "h-full w-full touch-none select-none"}
      style={{ background: "var(--bg-canvas)", cursor: cursor ?? "default", overscrollBehavior: "contain" }}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      data-board
    >
      <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
        {mapImage ? <image href={mapImage} x={0} y={0} width={BOARD} height={BOARD} preserveAspectRatio="xMidYMid meet" /> : <rect width={BOARD} height={BOARD} fill="#0a1017" />}
        {showCallouts && callouts?.length ? (
          <g pointerEvents="none" opacity={0.85}>
            {callouts.map((c, i) => (
              <text
                key={`${c.name}-${i}`}
                x={c.x * BOARD}
                y={c.y * BOARD}
                textAnchor="middle"
                fontSize={11 / view.scale}
                fill="#9da6ae"
                stroke="#0a1017"
                strokeWidth={2.5 / view.scale}
                paintOrder="stroke"
                fontFamily="Pretendard, sans-serif"
              >
                {c.name}
              </text>
            ))}
          </g>
        ) : null}
        {layers.map((layer) => {
          const byId = new Map(layer.objects.map((o) => [o.id, o]));
          // 연막·몰리·정보 범위(면)를 먼저, 그 위에 점·토큰·경로를 그려 토큰이 가려지지 않게 한다
          const areas = layer.objects.filter((o) => OBJECT_META[o.kind].hasRadius);
          const rest = layer.objects.filter((o) => !OBJECT_META[o.kind].hasRadius);
          return (
            <g key={layer.id} opacity={layer.opacity} data-layer={layer.id}>
              {areas.map((o) => (
                <g key={o.id} data-object={o.id} onPointerDown={onObjectPointerDown ? (e) => onObjectPointerDown(e, o) : undefined} style={{ cursor: onObjectPointerDown ? "move" : undefined }}>
                  <ObjectShape obj={o} agentById={agentById} slotMembers={slotMembers} hue={layer.hue} selected={o.id === selectedId} scale={view.scale} />
                </g>
              ))}
              {layer.objects
                .filter((o) => o.kind === "cast" && o.linkedObjectId && byId.has(o.linkedObjectId))
                .map((o) => (
                  <LinkLine key={`link-${o.id}`} from={o} to={byId.get(o.linkedObjectId!)!} hue={layer.hue} scale={view.scale} />
                ))}
              {rest.map((o) => (
                <g key={o.id} data-object={o.id} onPointerDown={onObjectPointerDown ? (e) => onObjectPointerDown(e, o) : undefined} style={{ cursor: onObjectPointerDown ? "move" : undefined }}>
                  <ObjectShape obj={o} agentById={agentById} slotMembers={slotMembers} hue={layer.hue} selected={o.id === selectedId} scale={view.scale} />
                </g>
              ))}
            </g>
          );
        })}
        {selectedObj ? <ObjectHandles obj={selectedObj} scale={view.scale} onPointerDown={(e, handle) => onHandlePointerDown!(e, selectedObj, handle)} /> : null}
        {draftPoints && draftPoints.length > 0 ? (
          <g pointerEvents="none">
            <polyline
              points={draftPoints.map((p) => `${p.x * BOARD},${p.y * BOARD}`).join(" ")}
              fill="none"
              stroke={draftKind === "draw" ? "#ece8e1" : draftKind === "path_ally" ? "#2ee6d6" : "#ff8a3d"}
              strokeWidth={(draftKind === "draw" ? 3 : 2) / view.scale}
              strokeDasharray={draftKind === "draw" ? undefined : `${4 / view.scale} ${4 / view.scale}`}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {draftKind !== "draw"
              ? draftPoints.map((p, i) => <circle key={i} cx={p.x * BOARD} cy={p.y * BOARD} r={4 / view.scale} fill="#ece8e1" />)
              : null}
          </g>
        ) : null}
      </g>
    </svg>
  );
});

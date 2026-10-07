"use client";

import { useMemo, useRef, useState, type WheelEvent as ReactWheelEvent } from "react";
import type { Ability, MapCallout, RoleGroup } from "@/db/schema";
import { clientToBoard, DEFAULT_VIEW, zoomAt, type View } from "@/lib/tactics/geometry";
import { layerColor, ROUND_TYPE_LABELS, TACTIC_SIDE_LABELS, type BoardObject } from "@/lib/tactics/types";
import type { RoundType, TacticSide } from "@/db/schema";
import { BoardSvg } from "./board-svg";
import { exportBoardPng } from "./export-png";

export type OverlayTactic = {
  id: string;
  name: string;
  side: TacticSide;
  roundType: RoundType;
  layerHue: number;
  stages: Array<{ id: string; seq: number; name: string; objects: BoardObject[] }>;
};

/**
 * 겹쳐보기 (기획서 4절): 같은 맵 위에 여러 전술을 각자의 색조로 동시에 그린다.
 * 전술마다 보여줄 단계를 고를 수 있고, 투명도 슬라이더는 첫 전술을 제외한 레이어에 적용된다 (기본 0.55).
 */
export function OverlayViewer({
  mapImage,
  mapNameEn,
  callouts,
  tactics,
  agents,
}: {
  mapImage: string | null;
  mapNameEn: string;
  callouts: MapCallout[];
  tactics: OverlayTactic[];
  agents: Array<{ id: string; nameKo: string; roleGroup: RoleGroup; iconUrl?: string | null; abilities?: Ability[] }>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [opacity, setOpacity] = useState(0.55);
  const [showCallouts, setShowCallouts] = useState(false);
  const [visible, setVisible] = useState<Set<string>>(() => new Set(tactics.map((t) => t.id)));
  const [stageByTactic, setStageByTactic] = useState<Record<string, string>>(() => Object.fromEntries(tactics.map((t) => [t.id, t.stages[0]?.id ?? ""])));
  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const layers = tactics
    .filter((t) => visible.has(t.id))
    .map((t, i) => ({
      id: t.id,
      objects: t.stages.find((s) => s.id === stageByTactic[t.id])?.objects ?? [],
      hue: layerColor(t.layerHue),
      opacity: i === 0 ? 1 : opacity,
    }));

  const onWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const p = clientToBoard(svgRef.current, e.clientX, e.clientY, view);
    setView((v) => zoomAt(v, e.deltaY < 0 ? 1.15 : 1 / 1.15, p));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="card aspect-square overflow-hidden">
        <BoardSvg ref={svgRef} mapImage={mapImage} callouts={callouts} showCallouts={showCallouts} layers={layers} agentById={agentById} view={view} onWheel={onWheel} />
      </div>
      <aside className="card flex flex-col gap-4 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-bold">레이어 {tactics.length}개</span>
          <div className="flex gap-1">
            <button type="button" onClick={() => setView(DEFAULT_VIEW)} className="btn-secondary min-h-8 px-2 text-xs">
              {Math.round(view.scale * 100)}%
            </button>
            {callouts.length ? (
              <button type="button" onClick={() => setShowCallouts((v) => !v)} className={`min-h-8 rounded-sm border px-2 text-xs ${showCallouts ? "border-accent bg-accent-subtle" : "border-line text-secondary"}`}>
                콜아웃
              </button>
            ) : null}
            <button type="button" onClick={() => svgRef.current && exportBoardPng(svgRef.current, `${mapNameEn}-overlay.png`)} className="btn-secondary min-h-8 px-2 text-xs">
              PNG 저장
            </button>
          </div>
        </div>
        <label className="block">
          <span className="label">
            겹침 투명도 <span className="font-mono text-muted">{Math.round(opacity * 100)}%</span>
          </span>
          <input type="range" min={10} max={100} step={5} value={opacity * 100} onChange={(e) => setOpacity(Number(e.target.value) / 100)} className="w-full accent-[var(--accent)]" />
        </label>
        <ul className="flex flex-col gap-2">
          {tactics.map((t) => (
            <li key={t.id} className="rounded-md border border-line bg-base p-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={visible.has(t.id)}
                  onChange={() =>
                    setVisible((prev) => {
                      const next = new Set(prev);
                      if (next.has(t.id)) next.delete(t.id);
                      else next.add(t.id);
                      return next;
                    })
                  }
                  className="accent-[var(--accent)]"
                />
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: layerColor(t.layerHue) }} aria-hidden />
                <span className="font-medium">{t.name}</span>
                <span className="ml-auto text-[11px] text-secondary">
                  {TACTIC_SIDE_LABELS[t.side]} · {ROUND_TYPE_LABELS[t.roundType]}
                </span>
              </label>
              {t.stages.length > 1 ? (
                <select value={stageByTactic[t.id]} onChange={(e) => setStageByTactic((p) => ({ ...p, [t.id]: e.target.value }))} className="input mt-1.5 py-1 text-xs" aria-label={`${t.name} 단계`}>
                  {t.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.seq}. {s.name || `단계 ${s.seq}`}
                    </option>
                  ))}
                </select>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">각 전술의 테두리와 경로가 레이어 색으로 바뀝니다. 휠로 확대.</p>
      </aside>
    </div>
  );
}

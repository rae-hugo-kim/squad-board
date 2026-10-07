"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import Link from "next/link";
import type { MapCallout, Point, RoleGroup, RoundType, TacticObjectKind, TacticSide } from "@/db/schema";
import { ROLE_LABELS } from "@/db/seed-data";
import { AbilityIcon, AgentIcon } from "@/components/agent-icon";
import { slotMembersOf } from "@/lib/squad/lineup";
import { defaultSizeFor, formatMeters, geometryFor, objectKindForAbility } from "@/lib/tactics/ability-geometry";
import {
  angleDeg,
  appendIfFar,
  clamp01,
  clientToBoard,
  DEFAULT_VIEW,
  distanceToPolyline,
  sectorRotationTo,
  translatePoints,
  wallEndpoints,
  zoomAt,
  type View,
} from "@/lib/tactics/geometry";
import {
  DRAW_COLORS,
  layerColor,
  MAX_FREEHAND_POINTS,
  MAX_OBJECTS_PER_STAGE,
  MAX_PATH_POINTS,
  MAX_STAGES,
  MIN_DRAW_STEP,
  OBJECT_KIND_ORDER,
  OBJECT_META,
  ROUND_TYPE_LABELS,
  TACTIC_SIDE_LABELS,
  type BoardObject,
} from "@/lib/tactics/types";
import { addStageAction, deleteStageAction, deleteTacticAction, duplicateTacticAction, saveStageAction, updateStageMetaAction, type SaveStageResult } from "@/server/actions/tactics";
import { BoardSvg } from "./board-svg";
import { exportBoardPng } from "./export-png";
import { LineupPanel, type LineupData } from "./lineup-panel";
import type { HandleKind } from "./object-shapes";
import { PropertiesPanel, type AgentWithAbilities } from "./properties-panel";
import { SlotsEditor, type SlotDraft } from "./slots-editor";
import { TacticMetaForm } from "./tactic-meta-form";

export type EditorStage = { id: string; seq: number; name: string; memo: string; objects: BoardObject[] };

type Props = {
  tactic: {
    id: string;
    name: string;
    side: TacticSide;
    roundType: RoundType;
    tags: string[];
    layerHue: number;
    isShared: boolean;
    priority: number;
    mapSlug: string;
    mapNameKo: string;
    mapNameEn: string;
    mapImage: string | null;
    callouts: MapCallout[];
    /** 미니맵 폭이 게임 세계 몇 유닛인지 (스킬 실제 크기 환산). 없으면 기본값 */
    unitsPerBoard: number | null;
  };
  author: { nickname: string } | null;
  stages: EditorStage[];
  slots: SlotDraft[];
  agents: AgentWithAbilities[];
  members: Array<{ id: string; nickname: string }>;
  canEdit: boolean;
  /** 전술가·관리자 — 공통 전술 여부·우선도를 바꿀 수 있다 */
  canManageShared: boolean;
  /** 오늘의 라인업(?m=) — 있으면 패널을 보여주고 슬롯 토큰에 멤버 이름·요원을 얹는다 */
  lineup?: LineupData | null;
};

type Tool = "select" | TacticObjectKind;
/** 드래그 상태: 객체 이동 또는 핸들(반경·방향·벽 끝) 조절 */
type Drag =
  | { mode: "move"; id: string; start: Point; origin: Point; originPoints: Point[] }
  | { mode: "handle"; id: string; handle: HandleKind; origin: BoardObject }
  | null;
/** 자유 그리기 진행 상태. keepTool = Shift를 누른 채 시작해 그린 뒤에도 도구를 유지 */
type Drawing = { points: Point[]; keepTool: boolean } | null;

/** 요원 격자 아래의 일반 도구. 스킬 핑은 요원의 스킬 아이콘에서 고르므로 여기엔 요원 미지정 핑만 둔다. */
const PALETTE: Array<{ group: string; kinds: TacticObjectKind[] }> = [
  { group: "일반 스킬 핑 (요원 미지정)", kinds: ["smoke", "flash", "trap", "molly", "recon", "wall", "cast"] },
  { group: "표식", kinds: ["objective", "danger", "note", "timing"] },
  { group: "경로 (클릭으로 점 찍기)", kinds: ["path_ally", "path_enemy_expected", "path_enemy_actual"] },
];
const ROLE_ORDER: RoleGroup[] = ["duelist", "initiator", "controller", "sentinel"];

const AUTOSAVE_MS = 2500;

function newId(): string {
  return crypto.randomUUID();
}

/**
 * 전술 보드 편집기 (기획서 4절 "동작", Valoplant식 조작).
 *
 * 상태 모델: 단계별 객체 목록을 클라이언트에서 통째로 들고 있다가, 바뀐 단계만 서버 액션으로
 * "통째 교체" 저장한다(saveStageAction). 자동 임시 저장(2.5초 디바운스) + 명시적 저장 버튼.
 *
 * 입력 규약
 * - 요원·스킬·표식을 고르고 맵을 클릭하면 놓이고, 놓은 직후 "선택/이동"으로 돌아온다 (Shift+클릭이면 같은 도구 유지).
 *   그래서 놓자마자 끌어 옮기거나 핸들을 잡아 돌리는 흐름이 끊기지 않는다.
 * - 선택 도구: 객체 클릭 = 선택, 드래그 = 이동, 핸들 드래그 = 반경(연막·몰리)·방향(정보)·길이와 회전(벽), Delete = 삭제.
 * - 경로: 클릭마다 점 추가, 더블클릭/Enter로 완성. 자유 그리기(D): 누른 채 끌면 선이 그려지고 떼면 완성.
 * - 휠 = 커서 기준 확대(페이지는 스크롤되지 않음), 스페이스+드래그(또는 가운데 버튼) = 이동. V = 선택, D = 그리기, Esc = 취소.
 * - 스킬 크기는 미터 기준(1m = 100유닛)으로 맵 스케일(unitsPerBoard)에 맞춰 환산된다 (ability-geometry.ts).
 * 읽기 전용(권한 없음)이면 추가·이동·삭제가 막히고 보기·확대·내보내기만 된다.
 */
export function BoardEditor({ tactic, author, stages: initialStages, slots, agents, members, canEdit, canManageShared, lineup }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [stages, setStages] = useState<EditorStage[]>(initialStages);
  const [stageId, setStageId] = useState<string>(initialStages[0]?.id ?? "");
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [agentTool, setAgentTool] = useState<{ slotNo: number | null; team: "ally" | "enemy"; agentId: string | null }>({ slotNo: 1, team: "ally", agentId: null });
  /** 요원 스킬 아이콘에서 고른 스킬 — 다음에 놓는 스킬 핑에 시전 요원·스킬이 미리 채워진다 */
  const [abilityTool, setAbilityTool] = useState<{ casterAgentId: string; abilityKey: string } | null>(null);
  const [drawColor, setDrawColor] = useState<string>(DRAW_COLORS[0]);
  const [showCallouts, setShowCallouts] = useState(true);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [draft, setDraft] = useState<Point[]>([]);
  const [drawing, setDrawing] = useState<Drawing>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [pan, setPan] = useState<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [saveState, setSaveState] = useState<{ status: "idle" | "saving" | "saved" | "error"; at?: string; message?: string }>({ status: "idle" });
  const [, startTransition] = useTransition();
  const [stageMetaResult, setStageMetaResult] = useState<string | null>(null);

  const stage = stages.find((s) => s.id === stageId) ?? stages[0];
  const objects = useMemo(() => stage?.objects ?? [], [stage]);
  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const agentById = useMemo(
    () => new Map(agents.map((a) => [a.id, { id: a.id, nameKo: a.nameKo, roleGroup: a.roleGroup as RoleGroup, iconUrl: a.iconUrl, abilities: a.abilities }])),
    [agents],
  );
  const paletteAgent = agentTool.agentId ? agents.find((a) => a.id === agentTool.agentId) : undefined;
  const readOnly = !canEdit;
  const slotMembers = useMemo(() => (lineup ? slotMembersOf(lineup.composition, tactic.id) : undefined), [lineup, tactic.id]);
  const unitsPerBoard = tactic.unitsPerBoard;

  // ----- 객체 변경 (항상 새 배열을 만든다 — 불변 업데이트) -----
  const updateObjects = useCallback(
    (fn: (prev: BoardObject[]) => BoardObject[]) => {
      if (!stage) return;
      setStages((prev) => prev.map((s) => (s.id === stage.id ? { ...s, objects: fn(s.objects) } : s)));
      setDirty((prev) => new Set(prev).add(stage.id));
    },
    [stage],
  );

  /** 지금 고른 스킬의 기하(크기 표) — 요원 slug·키로 찾는다 */
  const currentGeometry = useCallback(() => {
    if (!abilityTool) return null;
    const agent = agents.find((a) => a.id === abilityTool.casterAgentId);
    const ability = agent?.abilities.find((ab) => ab.key === abilityTool.abilityKey);
    if (!agent || !ability) return null;
    return geometryFor(agent.slug, ability.key, ability.kind);
  }, [abilityTool, agents]);

  const addObject = useCallback(
    (kind: TacticObjectKind, at: Point, points: Point[] = []) => {
      if (objects.length >= MAX_OBJECTS_PER_STAGE) return;
      const meta = OBJECT_META[kind];
      const size = defaultSizeFor(kind, meta.isAbility ? currentGeometry() : null, unitsPerBoard);
      const obj: BoardObject = {
        id: newId(),
        kind,
        x: clamp01(at.x),
        y: clamp01(at.y),
        points,
        radius: size.radius,
        angle: size.angle,
        length: size.length,
        rotation: 0,
        color: kind === "draw" ? drawColor : null,
        label: kind === "timing" ? "0:00" : "",
        memo: "",
        slotNo: kind === "agent" ? agentTool.slotNo : null,
        team: kind === "agent" ? agentTool.team : null,
        // 요원 토큰은 격자에서 고른 요원을, 스킬 핑은 스킬 아이콘에서 고른 시전 요원·스킬을 미리 채운다
        casterAgentId: kind === "agent" ? agentTool.agentId : abilityTool && meta.isAbility ? abilityTool.casterAgentId : null,
        abilityKey: kind !== "agent" && abilityTool && meta.isAbility ? abilityTool.abilityKey : null,
        linkedObjectId: null,
        externalUrl: null,
        sortOrder: objects.length,
      };
      updateObjects((prev) => [...prev, obj]);
      setSelectedId(obj.id);
    },
    [objects.length, agentTool, abilityTool, drawColor, unitsPerBoard, currentGeometry, updateObjects],
  );

  const patchSelected = (patch: Partial<BoardObject>) => {
    if (!selected) return;
    updateObjects((prev) => prev.map((o) => (o.id === selected.id ? { ...o, ...patch } : o)));
  };
  const deleteSelected = useCallback(() => {
    if (!selected || readOnly) return;
    updateObjects((prev) => prev.filter((o) => o.id !== selected.id).map((o) => (o.linkedObjectId === selected.id ? { ...o, linkedObjectId: null } : o)));
    setSelectedId(null);
  }, [selected, readOnly, updateObjects]);

  /** 놓은 뒤 선택 도구로 복귀 (Shift면 유지) — 바로 끌어 옮기거나 핸들을 잡을 수 있게 */
  const backToSelect = (keepTool: boolean) => {
    if (!keepTool) setTool("select");
  };

  // ----- 저장 -----
  const saveStage = useCallback(
    (sid: string) => {
      const target = stages.find((s) => s.id === sid);
      if (!target || readOnly) return;
      const fd = new FormData();
      fd.set("stageId", sid);
      fd.set("objects", JSON.stringify(target.objects));
      setSaveState({ status: "saving" });
      startTransition(async () => {
        const res: SaveStageResult = await saveStageAction(null, fd);
        if (res.ok) {
          setDirty((prev) => {
            const next = new Set(prev);
            next.delete(sid);
            return next;
          });
          setSaveState({ status: "saved", at: res.savedAt });
        } else {
          setSaveState({ status: "error", message: res.error });
        }
      });
    },
    [stages, readOnly],
  );
  const saveAll = useCallback(() => {
    for (const sid of dirty) saveStage(sid);
  }, [dirty, saveStage]);

  // 자동 임시 저장: 변경 후 일정 시간 입력이 없으면 저장
  useEffect(() => {
    if (readOnly || dirty.size === 0) return;
    const t = setTimeout(saveAll, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [dirty, stages, readOnly, saveAll]);

  // 저장 안 한 채 떠나기 경고
  useEffect(() => {
    if (dirty.size === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // ----- 키보드 -----
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
        e.preventDefault();
        setSpaceDown(true);
      }
      if (isTyping(e.target)) return;
      if (e.key === "Escape") {
        setDraft([]);
        setDrawing(null);
        setSelectedId(null);
        setTool("select");
      }
      if (!readOnly && !e.ctrlKey && !e.metaKey) {
        if (e.key === "v" || e.key === "V") setTool("select");
        if (e.key === "d" || e.key === "D") {
          setTool("draw");
          setDraft([]);
          setSelectedId(null);
        }
      }
      if (e.key === "Enter" && draft.length >= 2 && tool !== "select" && OBJECT_META[tool].isPath) {
        addObject(tool, draft[0], draft);
        setDraft([]);
        setTool("select");
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        deleteSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveAll();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [draft, tool, selected, readOnly, addObject, deleteSelected, saveAll]);

  // ----- 포인터 -----
  const boardPoint = (e: { clientX: number; clientY: number }): Point | null => (svgRef.current ? clientToBoard(svgRef.current, e.clientX, e.clientY, view) : null);

  const onCanvasPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button === 1 || spaceDown) {
      setPan({ x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty });
      return;
    }
    if (e.button !== 0) return;
    const p = boardPoint(e);
    if (!p) return;
    if (tool === "select") {
      // 경로는 얇아서 <g> 클릭이 잘 안 잡힌다 — 가까운 경로를 거리로 찾아 선택한다
      const near = objects.filter((o) => OBJECT_META[o.kind].isPath).find((o) => distanceToPolyline(p, o.points) < 0.012 / view.scale);
      setSelectedId(near?.id ?? null);
      if (near && !readOnly) setDrag({ mode: "move", id: near.id, start: p, origin: { x: near.x, y: near.y }, originPoints: near.points });
      return;
    }
    if (readOnly) return;
    const meta = OBJECT_META[tool];
    if (meta.freehand) {
      // 자유 그리기 시작 — 포인터를 캡처해 보드 밖으로 나가도 move/up을 받는다
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrawing({ points: [{ x: clamp01(p.x), y: clamp01(p.y) }], keepTool: e.shiftKey });
      setSelectedId(null);
      return;
    }
    if (meta.isPath) {
      setDraft((d) => (d.length >= MAX_PATH_POINTS ? d : [...d, { x: clamp01(p.x), y: clamp01(p.y) }]));
      return;
    }
    addObject(tool, p);
    backToSelect(e.shiftKey);
  };

  const onObjectPointerDown = (e: ReactPointerEvent<SVGGElement>, obj: BoardObject) => {
    if (tool !== "select" || e.button !== 0 || spaceDown) return;
    e.stopPropagation();
    setSelectedId(obj.id);
    const p = boardPoint(e);
    if (p && !readOnly) setDrag({ mode: "move", id: obj.id, start: p, origin: { x: obj.x, y: obj.y }, originPoints: obj.points });
  };

  const onHandlePointerDown = (e: ReactPointerEvent<SVGCircleElement>, obj: BoardObject, handle: HandleKind) => {
    if (readOnly || e.button !== 0) return;
    e.stopPropagation();
    setDrag({ mode: "handle", id: obj.id, handle, origin: obj });
  };

  /** 핸들 드래그: 반경 / 부채꼴 방향·반경 / 벽 끝점(반대쪽 끝 고정 → 중심·길이·회전 재계산) */
  const applyHandle = (d: Extract<Drag, { mode: "handle" }>, p: Point): Partial<BoardObject> => {
    const o = d.origin;
    const center = { x: o.x, y: o.y };
    const dist = Math.hypot(p.x - o.x, p.y - o.y);
    const clampR = (r: number) => Math.min(0.5, Math.max(0.002, r));
    switch (d.handle) {
      case "radius":
        return { radius: clampR(dist) };
      case "dir":
        return { rotation: sectorRotationTo(center, p), radius: clampR(dist) };
      case "end-a":
      case "end-b": {
        const [a, b] = wallEndpoints(center, o.length ?? 0.07, o.rotation);
        const fixed = d.handle === "end-a" ? b : a;
        const moving = { x: clamp01(p.x), y: clamp01(p.y) };
        const length = Math.min(1.5, Math.max(0.005, Math.hypot(moving.x - fixed.x, moving.y - fixed.y)));
        const rotation = d.handle === "end-a" ? angleDeg(moving, fixed) : angleDeg(fixed, moving);
        return { x: (moving.x + fixed.x) / 2, y: (moving.y + fixed.y) / 2, length, rotation };
      }
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (pan) {
      const rect = svgRef.current?.getBoundingClientRect();
      const size = rect ? Math.min(rect.width, rect.height) : 1;
      const k = 1000 / size;
      setView((v) => ({ ...v, tx: pan.tx + (e.clientX - pan.x) * k, ty: pan.ty + (e.clientY - pan.y) * k }));
      return;
    }
    if (drawing) {
      const p = boardPoint(e);
      if (!p) return;
      setDrawing((d) => (d ? { ...d, points: appendIfFar(d.points, { x: clamp01(p.x), y: clamp01(p.y) }, MIN_DRAW_STEP, MAX_FREEHAND_POINTS) } : d));
      return;
    }
    if (drag) {
      const p = boardPoint(e);
      if (!p) return;
      if (drag.mode === "handle") {
        const patch = applyHandle(drag, p);
        updateObjects((prev) => prev.map((o) => (o.id === drag.id ? { ...o, ...patch } : o)));
        return;
      }
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      updateObjects((prev) =>
        prev.map((o) =>
          o.id === drag.id
            ? { ...o, x: clamp01(drag.origin.x + dx), y: clamp01(drag.origin.y + dy), points: translatePoints(drag.originPoints, dx, dy) }
            : o,
        ),
      );
    }
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    setPan(null);
    setDrag(null);
    if (drawing) {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      if (drawing.points.length >= 2) addObject("draw", drawing.points[0], drawing.points);
      setDrawing(null);
      backToSelect(drawing.keepTool);
    }
  };
  const onWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    const p = boardPoint(e);
    if (!p) return;
    setView((v) => zoomAt(v, e.deltaY < 0 ? 1.15 : 1 / 1.15, p));
  };
  const finishDraft = () => {
    if (tool !== "select" && OBJECT_META[tool].isPath && draft.length >= 2) {
      addObject(tool, draft[0], draft);
      setTool("select");
    }
    setDraft([]);
  };

  // ----- 단계 메타 -----
  const submitStageMeta = (fd: FormData) => {
    startTransition(async () => {
      const res = await updateStageMetaAction(null, fd);
      setStageMetaResult(res.ok ? "저장했습니다." : res.error);
      if (res.ok && stage) {
        setStages((prev) => prev.map((s) => (s.id === stage.id ? { ...s, name: String(fd.get("name") ?? ""), memo: String(fd.get("memo") ?? "") } : s)));
      }
    });
  };

  const pickTool = (next: Tool) => {
    setTool(next);
    setDraft([]);
    setDrawing(null);
    setSelectedId(null);
  };

  const cursor = pan || spaceDown ? "grab" : tool === "select" ? "default" : "crosshair";
  const hue = layerColor(tactic.layerHue);

  /** 보드 위 안내 칩 — 지금 도구로 무엇을 하면 되는지 */
  const hint = (() => {
    if (readOnly) return "열람만 가능 — 휠 확대, 스페이스+드래그 이동, PNG 저장";
    if (tool === "select") return selected ? `${OBJECT_META[selected.kind].label} 선택됨 — 드래그로 이동, 핸들로 조절, Delete 삭제` : "선택 / 이동 — 객체를 클릭·드래그. V 선택, D 그리기";
    const meta = OBJECT_META[tool];
    if (meta.freehand) return "자유 그리기 — 누른 채 끌어 그리고 떼면 완성 (Shift: 계속 그리기)";
    if (meta.isPath) return `${meta.label} — 클릭으로 점 찍기, 더블클릭/Enter 완성 (${draft.length}점)`;
    const abilityName = (() => {
      if (!abilityTool) return null;
      const a = agents.find((x) => x.id === abilityTool.casterAgentId);
      const ab = a?.abilities.find((x) => x.key === abilityTool.abilityKey);
      return a && ab ? `${a.nameKo} · ${ab.nameKo}` : null;
    })();
    const g = meta.isAbility ? currentGeometry() : null;
    const sizeNote = g?.radiusM ? ` 반경 ${g.radiusM}m${g.confirmed ? "" : "(추정)"}` : g?.lengthM ? ` 길이 ${g.lengthM}m${g.confirmed ? "" : "(추정)"}` : "";
    return `${abilityName ?? meta.label}${sizeNote} — 맵을 클릭해 배치, 놓으면 선택 모드로 (Shift: 연속 배치)`;
  })();

  return (
    <div className="flex flex-col gap-4">
      {/* 상단 바 */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/tactics/${tactic.mapSlug}`} className="text-sm text-secondary no-underline hover:text-primary">
          ← {tactic.mapNameKo} 전술 목록
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-wide">
          <span className="mr-2 inline-block h-4 w-4 rounded-sm align-middle" style={{ background: hue }} aria-hidden />
          {tactic.name}
        </h1>
        <span className={`badge ${tactic.side === "attack" ? "bg-side-attack/15 text-side-attack" : "bg-side-defense/15 text-side-defense"}`}>{TACTIC_SIDE_LABELS[tactic.side]}</span>
        <span className="badge border border-line text-secondary">{ROUND_TYPE_LABELS[tactic.roundType]}</span>
        {tactic.isShared ? (
          <span className="badge bg-info/15 text-info" title="전술가 공통 전술 — 오늘의 스쿼드 후보">
            공통{tactic.priority > 0 ? ` · 우선 ${tactic.priority}` : ""}
          </span>
        ) : null}
        {tactic.tags.map((t) => (
          <span key={t} className="text-xs text-muted">
            #{t}
          </span>
        ))}
        <span className="text-xs text-secondary">작성 {author?.nickname ?? "(알 수 없음)"}</span>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {readOnly ? <span className="badge border border-line text-muted">읽기 전용 — 복제해서 내 버전으로 고칠 수 있습니다</span> : null}
          {!readOnly && tactic.isShared ? <span className="text-muted">공통 전술 — 전술가 모두가 함께 고칩니다</span> : null}
          {!readOnly ? (
            <span className={saveState.status === "error" ? "text-accent-hover" : dirty.size ? "text-warning" : "text-secondary"} data-save-state={saveState.status}>
              {saveState.status === "saving" ? "저장 중…" : saveState.status === "error" ? `저장 실패: ${saveState.message}` : dirty.size ? "변경됨 (자동 저장 대기)" : saveState.at ? `저장됨 ${new Date(saveState.at).toLocaleTimeString("ko-KR")}` : "변경 없음"}
            </span>
          ) : null}
          {!readOnly ? (
            <button type="button" onClick={saveAll} className="btn-primary min-h-9 px-3 text-xs" disabled={dirty.size === 0}>
              저장 (Ctrl+S)
            </button>
          ) : null}
          <button type="button" onClick={() => svgRef.current && exportBoardPng(svgRef.current, `${tactic.mapNameEn}-${tactic.name}-${stage?.name || stage?.seq}.png`)} className="btn-secondary min-h-9 px-3 text-xs">
            PNG 저장
          </button>
          <button type="button" onClick={() => setView(DEFAULT_VIEW)} className="btn-secondary min-h-9 px-3 text-xs" title="확대 초기화" data-zoom>
            {Math.round(view.scale * 100)}%
          </button>
          {tactic.callouts.length ? (
            <button type="button" onClick={() => setShowCallouts((v) => !v)} className={`min-h-9 rounded-sm border px-3 text-xs ${showCallouts ? "border-accent bg-accent-subtle" : "border-line text-secondary"}`} aria-pressed={showCallouts}>
              콜아웃
            </button>
          ) : null}
          <form action={duplicateTacticAction}>
            <input type="hidden" name="tacticId" value={tactic.id} />
            <button type="submit" className="btn-secondary min-h-9 px-3 text-xs">
              복제
            </button>
          </form>
          {!readOnly ? (
            <form action={deleteTacticAction} onSubmit={(e) => (confirm("이 전술을 삭제할까요? 단계와 객체가 모두 지워집니다.") ? undefined : e.preventDefault())}>
              <input type="hidden" name="tacticId" value={tactic.id} />
              <button type="submit" className="btn-danger min-h-9 px-3 text-xs">
                삭제
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {lineup ? <LineupPanel lineup={lineup} slots={slots} tacticName={tactic.name} /> : null}

      {/* 단계 탭 */}
      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="단계">
        {stages.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === stage?.id}
            onClick={() => {
              setStageId(s.id);
              setSelectedId(null);
              setDraft([]);
              setDrawing(null);
            }}
            className={`rounded-sm border px-3 py-1.5 text-sm ${s.id === stage?.id ? "border-accent bg-accent-subtle font-bold" : "border-line text-secondary hover:text-primary"}`}
          >
            {s.seq}. {s.name || `단계 ${s.seq}`}
            {dirty.has(s.id) ? <span className="ml-1 text-warning">●</span> : null}
          </button>
        ))}
        {!readOnly && stages.length < MAX_STAGES ? (
          <form action={addStageAction} className="inline">
            <input type="hidden" name="tacticId" value={tactic.id} />
            <input type="hidden" name="copyFrom" value={stage?.id ?? ""} />
            <button type="submit" className="btn-secondary min-h-8 px-3 text-xs" title="현재 단계를 복사해 새 단계를 만듭니다">
              + 단계 추가
            </button>
          </form>
        ) : null}
        <span className="ml-auto text-xs text-muted">
          객체 {objects.length}개 · 휠 확대 · 스페이스+드래그 이동 · V 선택 · D 그리기 · Delete 삭제
          {unitsPerBoard ? "" : " · 맵 스케일 미동기화(기본값으로 크기 환산)"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[188px_minmax(0,1fr)_300px]">
        {/* 팔레트 */}
        {/* 팔레트·속성 패널은 화면 높이 안에서 자체 스크롤한다 — 요원 격자 때문에 길어져도 보드가 화면 밖으로 밀리지 않도록 */}
        <aside className="card flex max-h-[calc(100vh-7rem)] flex-col gap-3 overflow-y-auto p-3 text-sm lg:sticky lg:top-4" data-palette>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => pickTool("select")}
              className={`rounded-sm border px-2 py-1.5 text-left text-xs ${tool === "select" ? "border-accent bg-accent-subtle text-primary" : "border-line text-secondary hover:text-primary"} disabled:opacity-50`}
              disabled={readOnly}
              aria-pressed={tool === "select"}
              data-tool="select"
            >
              선택 / 이동 <span className="font-mono text-[10px] text-muted">V</span>
            </button>
            <button
              type="button"
              onClick={() => pickTool("draw")}
              className={`rounded-sm border px-2 py-1.5 text-left text-xs ${tool === "draw" ? "border-accent bg-accent-subtle text-primary" : "border-line text-secondary hover:text-primary"} disabled:opacity-50`}
              disabled={readOnly}
              aria-pressed={tool === "draw"}
              data-tool="draw"
            >
              자유 그리기 <span className="font-mono text-[10px] text-muted">D</span>
            </button>
          </div>
          {tool === "draw" ? (
            <div className="flex flex-wrap gap-1" aria-label="그리기 색">
              {DRAW_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDrawColor(c)}
                  className={`h-6 w-6 rounded-full border-2 ${drawColor === c ? "border-primary" : "border-transparent"}`}
                  style={{ background: c }}
                  title={c}
                  aria-pressed={drawColor === c}
                  data-draw-color={c}
                />
              ))}
            </div>
          ) : null}

          {/* 요원 격자 — Valoplant처럼 요원을 고르고 맵을 클릭해 토큰을 놓는다 */}
          <div>
            <div className="label">요원</div>
            {ROLE_ORDER.map((g) => (
              <div key={g} className="mb-1.5">
                <div className="mb-0.5 text-[10px]" style={{ color: ROLE_LABELS[g].cssVar }}>
                  {ROLE_LABELS[g].ko}
                </div>
                <div className="flex flex-wrap gap-1" aria-label={ROLE_LABELS[g].ko}>
                  {agents
                    .filter((a) => a.roleGroup === g)
                    .map((a) => {
                      const active = tool === "agent" && agentTool.agentId === a.id;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          disabled={readOnly}
                          title={a.nameKo}
                          data-agent={a.id}
                          onClick={() => {
                            setAgentTool((t) => ({ ...t, agentId: a.id }));
                            setAbilityTool(null);
                            pickTool("agent");
                          }}
                          className={`rounded-full p-0.5 ${active ? "bg-accent" : paletteAgent?.id === a.id ? "bg-raised" : "hover:bg-raised"} disabled:opacity-50`}
                        >
                          <AgentIcon agent={a} size={30} />
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
            <button
              type="button"
              disabled={readOnly}
              onClick={() => {
                setAgentTool((t) => ({ ...t, agentId: null }));
                setAbilityTool(null);
                pickTool("agent");
              }}
              className={`mt-1 w-full rounded-sm border px-2 py-1 text-left text-xs ${tool === "agent" && !agentTool.agentId ? "border-accent bg-accent-subtle" : "border-line text-secondary"}`}
              data-tool="agent"
            >
              슬롯 토큰 (요원 미정)
            </button>
          </div>

          {tool === "agent" || paletteAgent ? (
            <div className="rounded-md border border-line bg-base p-2 text-xs">
              <div className="label">
                {paletteAgent ? (
                  <span className="inline-flex items-center gap-1.5">
                    <AgentIcon agent={paletteAgent} size={18} /> {paletteAgent.nameKo}
                  </span>
                ) : (
                  "새 토큰 설정"
                )}
              </div>
              <div className="mb-1 flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setAgentTool((a) => ({ ...a, slotNo: n }))} className={`h-7 w-7 rounded-sm border font-mono ${agentTool.slotNo === n ? "border-accent bg-accent-subtle" : "border-line text-secondary"}`}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={() => setAgentTool((a) => ({ ...a, team: "ally" }))} className={`flex-1 rounded-sm border px-1 py-1 ${agentTool.team === "ally" ? "border-ally text-ally" : "border-line text-secondary"}`}>
                  아군
                </button>
                <button type="button" onClick={() => setAgentTool((a) => ({ ...a, team: "enemy", slotNo: null }))} className={`flex-1 rounded-sm border px-1 py-1 ${agentTool.team === "enemy" ? "border-enemy text-enemy" : "border-line text-secondary"}`}>
                  적군
                </button>
              </div>
              {paletteAgent && paletteAgent.abilities.length ? (
                <div className="mt-2">
                  <div className="label">스킬 핑 — 아이콘을 고르고 맵을 클릭</div>
                  <div className="flex gap-1">
                    {paletteAgent.abilities.map((ab) => {
                      const kind = objectKindForAbility(paletteAgent.slug, ab.key, ab.kind);
                      const g = geometryFor(paletteAgent.slug, ab.key, ab.kind);
                      const active = abilityTool?.casterAgentId === paletteAgent.id && abilityTool.abilityKey === ab.key && tool === kind;
                      const sizeNote = g.radiusM ? ` · 반경 ${g.radiusM}m` : g.lengthM ? ` · 길이 ${g.lengthM}m` : "";
                      return (
                        <button
                          key={ab.key}
                          type="button"
                          disabled={readOnly}
                          title={`${ab.key.toUpperCase()} ${ab.nameKo} · ${OBJECT_META[kind].label}${sizeNote}${sizeNote && !g.confirmed ? "(추정)" : ""}`}
                          data-ability={`${paletteAgent.id}:${ab.key}`}
                          onClick={() => {
                            setAbilityTool({ casterAgentId: paletteAgent.id, abilityKey: ab.key });
                            pickTool(kind);
                          }}
                          className={`flex flex-col items-center gap-0.5 rounded-sm border p-1 ${active ? "border-accent bg-accent-subtle" : "border-line hover:bg-raised"} disabled:opacity-50`}
                        >
                          <AbilityIcon ability={ab} size={22} />
                          <span className="font-mono text-[10px] text-secondary">{ab.key.toUpperCase()}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {PALETTE.map((g) => (
            <div key={g.group}>
              <div className="label">{g.group}</div>
              <div className="grid grid-cols-1 gap-1">
                {g.kinds.map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={readOnly}
                    onClick={() => {
                      setAbilityTool(null);
                      pickTool(k);
                    }}
                    className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 text-left text-xs ${tool === k && !abilityTool ? "border-accent bg-accent-subtle text-primary" : "border-line text-secondary hover:text-primary"} disabled:opacity-50`}
                    data-tool={k}
                    aria-pressed={tool === k && !abilityTool}
                  >
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: OBJECT_META[k].color }} aria-hidden />
                    {OBJECT_META[k].label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {tool !== "select" && OBJECT_META[tool].isPath && !OBJECT_META[tool].freehand ? (
            <div className="rounded-md border border-line bg-base p-2 text-xs text-secondary">
              클릭으로 점을 찍고 <b className="text-primary">더블클릭</b> 또는 Enter로 완성 ({draft.length}점)
              {draft.length >= 2 ? (
                <button type="button" onClick={finishDraft} className="btn-primary mt-2 min-h-8 w-full text-xs">
                  경로 완성
                </button>
              ) : null}
            </div>
          ) : null}
        </aside>

        {/* 캔버스 */}
        <div className="card relative aspect-square min-w-0 self-start overflow-hidden" style={{ minWidth: 0, overscrollBehavior: "contain" }}>
          <BoardSvg
            ref={svgRef}
            mapImage={tactic.mapImage}
            callouts={tactic.callouts}
            showCallouts={showCallouts}
            layers={[{ id: tactic.id, objects, hue: null, opacity: 1 }]}
            agentById={agentById}
            slotMembers={slotMembers}
            view={view}
            selectedId={selectedId}
            draftPoints={drawing ? drawing.points : draft}
            draftKind={drawing ? "draw" : tool === "select" ? null : tool}
            onCanvasPointerDown={onCanvasPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onObjectPointerDown={onObjectPointerDown}
            onHandlePointerDown={readOnly ? undefined : onHandlePointerDown}
            onWheel={onWheel}
            onDoubleClick={finishDraft}
            cursor={cursor}
          />
          <div className="pointer-events-none absolute left-2 top-2 max-w-[80%] rounded-sm border border-line bg-base/85 px-2 py-1 text-[11px] text-secondary backdrop-blur-sm" data-tool-hint>
            {hint}
          </div>
        </div>

        {/* 우측 패널 */}
        <aside className="card flex max-h-[calc(100vh-7rem)] flex-col gap-4 overflow-y-auto p-4 lg:sticky lg:top-4">
          {selected ? (
            <PropertiesPanel
              obj={selected}
              objects={objects}
              agents={agents}
              unitsPerBoard={unitsPerBoard}
              readOnly={readOnly}
              onChange={patchSelected}
              onDelete={deleteSelected}
              onBringToFront={() => updateObjects((prev) => [...prev.filter((o) => o.id !== selected.id), selected])}
            />
          ) : (
            <>
              <div>
                <div className="mb-2 text-sm font-bold">단계 {stage?.seq}</div>
                <form action={submitStageMeta} className="flex flex-col gap-2 text-sm">
                  <input type="hidden" name="stageId" value={stage?.id ?? ""} />
                  <fieldset disabled={readOnly} className="contents">
                    <label className="block">
                      <span className="label">단계 이름 (예: 셋업 / 실행 / 플랜트 후)</span>
                      <input name="name" key={`${stage?.id}-name`} defaultValue={stage?.name ?? ""} maxLength={20} className="input py-1.5" />
                    </label>
                    <label className="block">
                      <span className="label">단계 메모</span>
                      <textarea name="memo" key={`${stage?.id}-memo`} defaultValue={stage?.memo ?? ""} rows={2} maxLength={200} className="input resize-none py-1.5" />
                    </label>
                  </fieldset>
                  {!readOnly ? (
                    <div className="flex items-center gap-2">
                      <button type="submit" className="btn-secondary min-h-8 px-3 text-xs">
                        단계 저장
                      </button>
                      {stageMetaResult ? <span className="text-xs text-secondary">{stageMetaResult}</span> : null}
                    </div>
                  ) : null}
                </form>
                {!readOnly && stages.length > 1 ? (
                  <form action={deleteStageAction} className="mt-2" onSubmit={(e) => (confirm("이 단계를 삭제할까요?") ? undefined : e.preventDefault())}>
                    <input type="hidden" name="stageId" value={stage?.id ?? ""} />
                    <button type="submit" className="btn-danger min-h-8 px-3 text-xs">
                      이 단계 삭제
                    </button>
                  </form>
                ) : null}
              </div>
              {!readOnly ? (
                <div className="border-t border-line pt-4">
                  <div className="mb-2 text-sm font-bold">전술 정보</div>
                  <TacticMetaForm
                    tacticId={tactic.id}
                    initial={{ name: tactic.name, side: tactic.side, roundType: tactic.roundType, tags: tactic.tags, isShared: tactic.isShared, priority: tactic.priority }}
                    canManageShared={canManageShared}
                  />
                </div>
              ) : null}
              <p className="text-xs text-muted">
                객체를 클릭하면 여기에 속성이 표시됩니다. 범례: {OBJECT_KIND_ORDER.length}종 객체 — 팔레트 참고. 스킬 크기는 미터 기준
                {unitsPerBoard ? `(이 맵 폭 ≈ ${formatMeters(1, unitsPerBoard)})` : "(맵 스케일 기본값)"}.
              </p>
            </>
          )}
        </aside>
      </div>

      <SlotsEditor tacticId={tactic.id} initial={slots} agents={agents} members={members} readOnly={readOnly} />
    </div>
  );
}

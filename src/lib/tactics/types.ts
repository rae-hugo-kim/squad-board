import type { AbilityKind, RoundType, TacticObjectKind, TacticSide } from "@/db/schema";

/**
 * 전술 보드 상수 — 클라이언트에서도 쓰므로 schema.ts에서는 타입만 가져온다
 * (값을 import하면 drizzle-orm이 클라이언트 번들에 들어간다. 2단계 인수인계 참고).
 */

export const TACTIC_SIDE_LABELS: Record<TacticSide, string> = { attack: "공격", defense: "수비" };
export const TACTIC_SIDE_ORDER: TacticSide[] = ["attack", "defense"];

export const ROUND_TYPE_LABELS: Record<RoundType, string> = { pistol: "피스톨", eco: "에코", fullbuy: "풀바이", any: "공통" };
export const ROUND_TYPE_ORDER: RoundType[] = ["pistol", "eco", "fullbuy", "any"];

/** 겹쳐보기 색조 (globals.css --layer-N). hue 1~8 → 색 */
export const LAYER_HUES = ["#ff4655", "#2ee6d6", "#ffc857", "#7b8cff", "#4fd98a", "#ff8a3d", "#c77dff", "#ece8e1"];
export const layerColor = (hue: number) => LAYER_HUES[(Math.max(1, hue) - 1) % LAYER_HUES.length];

export type ObjectMeta = {
  label: string;
  /** 기본 색(디자인 토큰 값). 겹쳐보기에서는 레이어 색조로 바뀐다. */
  color: string;
  /** 경로형(점 목록)인지 */
  isPath: boolean;
  /** 반경을 가지는지 (연막·몰리) */
  hasRadius: boolean;
  /** 부채꼴(정보 스킬)인지 */
  hasAngle: boolean;
  /** 시전 요원·스킬을 고르는 스킬 핑인지 */
  isAbility: boolean;
  /** 팔레트 그룹 */
  group: "token" | "ability" | "mark" | "path";
  /** 기본으로 매칭되는 스킬 유형 (팔레트에서 요원 스킬 목록을 걸러 보여줄 때) */
  abilityKind?: AbilityKind;
};

export const OBJECT_META: Record<TacticObjectKind, ObjectMeta> = {
  agent: { label: "요원 토큰", color: "#2ee6d6", isPath: false, hasRadius: false, hasAngle: false, isAbility: false, group: "token" },
  smoke: { label: "연막", color: "rgba(170,190,210,0.45)", isPath: false, hasRadius: true, hasAngle: false, isAbility: true, group: "ability", abilityKind: "smoke" },
  flash: { label: "섬광", color: "#fff07a", isPath: false, hasRadius: false, hasAngle: false, isAbility: true, group: "ability", abilityKind: "flash" },
  trap: { label: "설치형", color: "#c77dff", isPath: false, hasRadius: false, hasAngle: false, isAbility: true, group: "ability", abilityKind: "trap" },
  molly: { label: "몰리", color: "#ff7a2e", isPath: false, hasRadius: true, hasAngle: false, isAbility: true, group: "ability", abilityKind: "molly" },
  recon: { label: "정보 스킬", color: "#5ac8fa", isPath: false, hasRadius: true, hasAngle: true, isAbility: true, group: "ability", abilityKind: "recon" },
  cast: { label: "스킬 시전 위치", color: "#ece8e1", isPath: false, hasRadius: false, hasAngle: false, isAbility: false, group: "ability" },
  objective: { label: "중요 거점", color: "#ffc857", isPath: false, hasRadius: false, hasAngle: false, isAbility: false, group: "mark" },
  danger: { label: "위험 지점", color: "#ff4655", isPath: false, hasRadius: false, hasAngle: false, isAbility: false, group: "mark" },
  note: { label: "자유 메모", color: "#9da6ae", isPath: false, hasRadius: false, hasAngle: false, isAbility: false, group: "mark" },
  timing: { label: "타이밍 라벨", color: "#ece8e1", isPath: false, hasRadius: false, hasAngle: false, isAbility: false, group: "mark" },
  path_ally: { label: "아군 이동 경로", color: "#2ee6d6", isPath: true, hasRadius: false, hasAngle: false, isAbility: false, group: "path" },
  path_enemy_expected: { label: "상대 예상 동선", color: "#ff8a3d", isPath: true, hasRadius: false, hasAngle: false, isAbility: false, group: "path" },
  path_enemy_actual: { label: "상대 실제 동선", color: "#ff8a3d", isPath: true, hasRadius: false, hasAngle: false, isAbility: false, group: "path" },
};

export const OBJECT_KIND_ORDER = Object.keys(OBJECT_META) as TacticObjectKind[];

/** 기본 반경(맵 폭 대비). 연막 ≈ 맵의 4.5%, 몰리 3%, 정보 스킬 부채꼴 12% */
export const DEFAULT_RADIUS: Partial<Record<TacticObjectKind, number>> = { smoke: 0.045, molly: 0.03, recon: 0.12 };
export const DEFAULT_ANGLE = 70;

export const ENEMY_COLOR = "#ff8a3d";
export const ALLY_COLOR = "#2ee6d6";

/** 편집기가 다루는 객체 형태. DB 행(TacticObject)과 같은 필드이되 id는 클라이언트에서 미리 발급한다. */
export type BoardObject = {
  id: string;
  kind: TacticObjectKind;
  x: number;
  y: number;
  points: Array<{ x: number; y: number }>;
  radius: number | null;
  angle: number | null;
  rotation: number;
  color: string | null;
  label: string;
  memo: string;
  slotNo: number | null;
  team: "ally" | "enemy" | null;
  casterAgentId: string | null;
  abilityKey: string | null;
  linkedObjectId: string | null;
  externalUrl: string | null;
  sortOrder: number;
};

export const MAX_OBJECTS_PER_STAGE = 300;
export const MAX_STAGES = 8;
export const MAX_PATH_POINTS = 60;

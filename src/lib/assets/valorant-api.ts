import type { Ability, AbilityKind, MapCallout, RoleGroup } from "@/db/schema";

/**
 * 공식 에셋 변환 — 순수 함수 (네트워크 없음).
 *
 * 출처: valorant-api.com — Riot 게임 클라이언트 데이터를 그대로 미러하는 공개 API로, 팬 사이트들이 공식 아이콘·미니맵을
 * 가져다 쓰는 사실상 표준 경로다. 이미지 URL은 media.valorant-api.com (Riot 원본 에셋). 비상업 팬 프로젝트 범위에서
 * 사용하며, 화면 하단에 Riot 고지를 둔다.
 *
 * 네트워크 호출은 src/db/sync-assets.ts 가 하고, 이 파일은 응답 → DB 행 변환만 맡아 고정 응답으로 테스트한다.
 */

export const API_BASE = "https://valorant-api.com/v1";

export type ApiRole = { uuid: string; displayName: string };
export type ApiAbility = { slot: string; displayName: string; description?: string | null; displayIcon: string | null };
export type ApiAgent = {
  uuid: string;
  displayName: string;
  displayIcon: string | null;
  fullPortrait?: string | null;
  isPlayableCharacter?: boolean;
  role: ApiRole | null;
  abilities: ApiAbility[];
};
export type ApiMap = {
  uuid: string;
  displayName: string;
  tacticalDescription: string | null;
  displayIcon: string | null;
  splash?: string | null;
  listViewIcon?: string | null;
  xMultiplier: number;
  yMultiplier: number;
  xScalarToAdd: number;
  yScalarToAdd: number;
  callouts: Array<{ regionName: string; superRegionName: string; location: { x: number; y: number } }> | null;
};

/** 영어 역할군 이름 → 우리 역할군 */
export const ROLE_BY_EN: Record<string, RoleGroup> = {
  Duelist: "duelist",
  Initiator: "initiator",
  Controller: "controller",
  Sentinel: "sentinel",
};

/** API 슬롯 → 게임 키. Grenade = C, Ability1 = Q, Ability2 = E, Ultimate = X. Passive는 핑 대상이 아니라 뺀다. */
export const ABILITY_KEY_BY_SLOT: Record<string, "c" | "q" | "e" | "x"> = {
  Grenade: "c",
  Ability1: "q",
  Ability2: "e",
  Ultimate: "x",
};
const KEY_ORDER = ["c", "q", "e", "x"] as const;

/** "KAY/O" → "kayo", "Brimstone" → "brimstone" */
export function slugify(nameEn: string): string {
  return nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export type AgentRow = {
  uuid: string;
  slug: string;
  nameEn: string;
  nameKo: string;
  roleGroup: RoleGroup | null;
  iconUrl: string | null;
  portraitUrl: string | null;
  abilities: Ability[];
};

/**
 * 요원 변환. 영어 응답에서 slug·역할군을, 한국어 응답에서 표시 이름을 얻는다.
 * 스킬 유형(연막/섬광/…)은 API에 없으므로 호출 측이 (slug 기준) 수기 표에서 넘겨준다 — 모르면 "other".
 */
export function mapAgent(en: ApiAgent, ko: ApiAgent | undefined, kindOf: (key: string) => AbilityKind): AgentRow {
  const koAbilityBySlot = new Map((ko?.abilities ?? []).map((a) => [a.slot, a]));
  const abilities: Ability[] = en.abilities
    .filter((a) => ABILITY_KEY_BY_SLOT[a.slot])
    .map((a) => {
      const key = ABILITY_KEY_BY_SLOT[a.slot];
      return {
        key,
        nameKo: koAbilityBySlot.get(a.slot)?.displayName || a.displayName,
        kind: kindOf(key),
        iconUrl: a.displayIcon ?? null,
        description: koAbilityBySlot.get(a.slot)?.description ?? a.description ?? null,
      };
    })
    .sort((a, b) => KEY_ORDER.indexOf(a.key as (typeof KEY_ORDER)[number]) - KEY_ORDER.indexOf(b.key as (typeof KEY_ORDER)[number]));
  return {
    uuid: en.uuid,
    slug: slugify(en.displayName),
    nameEn: en.displayName,
    nameKo: ko?.displayName || en.displayName,
    roleGroup: en.role ? (ROLE_BY_EN[en.role.displayName] ?? null) : null,
    iconUrl: en.displayIcon ?? null,
    portraitUrl: en.fullPortrait ?? null,
    abilities,
  };
}

/** 게임 좌표 → 미니맵 0~1. 게임의 x/y축이 이미지와 바뀌어 있어 y에 xMultiplier를 곱한다 (공식 데이터의 변환 규약). */
export function calloutToBoard(map: Pick<ApiMap, "xMultiplier" | "yMultiplier" | "xScalarToAdd" | "yScalarToAdd">, loc: { x: number; y: number }) {
  return { x: loc.y * map.xMultiplier + map.xScalarToAdd, y: loc.x * map.yMultiplier + map.yScalarToAdd };
}

export type MapRow = {
  uuid: string;
  slug: string;
  nameEn: string;
  nameKo: string;
  imagePath: string;
  splashUrl: string | null;
  listIconUrl: string | null;
  callouts: MapCallout[];
  /** 미니맵 전체 폭 = 게임 세계 몇 유닛인지 (1m = 100유닛). xMultiplier 역수. 값이 없거나 0이면 null. */
  unitsPerBoard: number | null;
};

/**
 * 미니맵 폭이 게임 세계 몇 유닛인지. 공식 변환은 minimap = world × xMultiplier + scalar 이므로 폭 1(0~1) = 1/|xMultiplier| 유닛.
 * 예: xMultiplier 0.00007 → 약 14,286유닛(≈143m). 스킬 범위를 실제 미터로 그릴 때 쓴다.
 */
export function unitsPerBoardOf(map: Pick<ApiMap, "xMultiplier">): number | null {
  const m = Math.abs(map.xMultiplier);
  if (!Number.isFinite(m) || m <= 0) return null;
  return Math.round(1 / m);
}

/** 맵 변환. 경쟁 맵(tacticalDescription 있음)이고 미니맵이 있을 때만. 사격장·연습장·TDM 맵은 null. */
export function mapMap(en: ApiMap, ko: ApiMap | undefined): MapRow | null {
  if (!en.tacticalDescription || !en.displayIcon) return null;
  return {
    uuid: en.uuid,
    slug: slugify(en.displayName),
    nameEn: en.displayName,
    nameKo: ko?.displayName || en.displayName,
    imagePath: en.displayIcon,
    splashUrl: en.splash ?? null,
    listIconUrl: en.listViewIcon ?? null,
    unitsPerBoard: unitsPerBoardOf(en),
    callouts: (en.callouts ?? []).map((c) => {
      const p = calloutToBoard(en, c.location);
      return { name: c.regionName, region: c.superRegionName, x: Math.round(p.x * 10000) / 10000, y: Math.round(p.y * 10000) / 10000 };
    }),
  };
}

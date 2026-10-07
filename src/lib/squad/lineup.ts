import type { Composition } from "./compose";

/**
 * "오늘의 라인업" URL·표시 유틸 — 순수 함수. /today(리다이렉트), 보드 페이지(?m=), 라인업 패널이 공유한다.
 * 보드 URL은 /tactics/board/<id>?m=<id1>,<id2>,... — 쉼표 구분이라 10명이어도 짧고, 전술 데이터는 건드리지 않는다
 * (라인업은 조회 시점에 계산하는 뷰이지 저장물이 아니다).
 */
const UUID_RE = /^[0-9a-f-]{36}$/i;

/** ?m=a,b&m=c 형태를 모두 받아 중복·형식 불량을 뺀 id 목록으로 */
export function parseLineupParam(v: string | string[] | undefined): string[] {
  if (!v) return [];
  const flat = (Array.isArray(v) ? v : [v]).flatMap((s) => s.split(",")).map((s) => s.trim()).filter((s) => UUID_RE.test(s));
  return [...new Set(flat)];
}

export function lineupQuery(memberIds: string[]): string {
  return new URLSearchParams({ m: memberIds.join(",") }).toString();
}

export type SlotMember = { memberId: string; nickname: string; agentId: string | null };

/** 전술 슬롯 번호 → 바인딩된 멤버와 그 멤버가 이 조합에서 맡은 요원. 보드 토큰(slotNo)에 이름·요원을 얹을 때 쓴다. */
export function slotMembersOf(composition: Composition, tacticId: string): Record<number, SlotMember> {
  const fit = composition.tacticFits.find((f) => f.tacticId === tacticId);
  if (!fit) return {};
  const out: Record<number, SlotMember> = {};
  for (const [slotNo, memberId] of Object.entries(fit.bindings)) {
    const slot = composition.slots.find((s) => s.memberId === memberId);
    if (slot) out[Number(slotNo)] = { memberId, nickname: slot.nickname, agentId: slot.agentId };
  }
  return out;
}

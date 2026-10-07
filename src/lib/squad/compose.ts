import type { RoleGroup } from "@/db/schema";
import { ROLE_LABELS } from "@/db/seed-data";

// schema.ts에서 값(ROLE_GROUPS)을 import하면 drizzle-orm이 클라이언트 번들에 딸려 온다 —
// 이 모듈은 브라우저에서도 실행되므로 타입만 가져오고 역할군 목록은 라벨 표에서 얻는다.
const ROLE_GROUPS = Object.keys(ROLE_LABELS) as RoleGroup[];

/**
 * 스쿼드 편성기 — 순수 함수 모듈 (기획서 5절).
 *
 * 이 파일은 DB·Next.js에 의존하지 않는다. 그래서
 *   - node:test로 바로 단위 테스트할 수 있고 (compose.test.ts),
 *   - 서버 액션과 클라이언트 컴포넌트(수동 조정 시 재계산) 양쪽에서 같은 코드를 쓴다.
 *
 * 알고리즘 (제약 → 점수 → 상위 N):
 *   1. 참가자가 팀 정원(5)을 넘으면 5명 조합(C(N,5))을 모두 후보로 둔다 = 로테이션 안.
 *   2. 각 조합에서 멤버마다 선택지(1·2·3순위 요원, 또는 미배정)를 깊이 우선 탐색으로 조합한다.
 *      같은 요원 중복은 탐색 중 가지치기(하드 제약).
 *   3. 역할군 최소 규칙을 만족하는 배정 중 최고 점수를 고른다. 만족하는 배정이 없으면
 *      규칙을 무시한 최고 점수 배정을 경고와 함께 돌려준다 — 빈 결과보다 "왜 안 되는지"가 유용하다.
 *   4. 조합 전체를 (규칙 충족 → 점수 → 미배정 수 → 벤치 이름) 순으로 정렬해 상위 limit개.
 *
 * 전술 슬롯(3단계): 선택한 전술마다 슬롯(요구 역할군/요원) ↔ 멤버 최적 매칭을 비트마스크 DP로 구해
 *   채운 슬롯당 +2, 슬롯의 포지션 힌트가 멤버 선호 포지션에 들어 있으면 +1을 더한다.
 *
 * 규모: 참가자 ≤ 10, 선택지 ≤ 4 → 조합 252 × 배정 ≤ 4^5 = 1024 → 약 26만 번 평가. 전술 1개당 평가마다
 *   슬롯 DP 5×32×5 = 800번 → 10명·전술 1개가 약 2억 연산으로 1초 안팎. 소모임 규모에서는 충분하다.
 */

export const TEAM_SIZE = 5;
/** 참가자 상한. 조합 수(C(N,5))가 급증하므로 소모임 규모에 맞춰 묶는다. */
export const MAX_PARTICIPANTS = 10;

/** 선호 순위별 점수 (기획서 5절 표). index 0 = 1순위. */
export const RANK_POINTS = [3, 2, 1] as const;
/** 선호 역할군 순위별 가산점. 배정된 요원의 역할군이 멤버의 선호 역할군 1·2·3순위와 맞을 때. */
export const ROLE_RANK_POINTS = [1.5, 1, 0.5] as const;
/** 맵 선호가 없는 멤버에게 선호 역할군(1순위) 요원을 후보로 줄 때 몇 명까지 (탐색량 제한) */
export const ROLE_FALLBACK_AGENTS = 3;
/** 전술 슬롯 1개 충족 +2, 포지션 힌트 일치 +1 */
export const SLOT_POINTS = 2;
export const POSITION_POINTS = 1;

export type ComposeAgent = { id: string; nameKo: string; roleGroup: RoleGroup; iconUrl?: string | null };

export type ComposePreference = {
  /** 1~3순위 요원 id. 비어 있으면 null. */
  agentIds: [string | null, string | null, string | null];
  /** 1~5 */
  confidence: number;
  attackPosition: string;
  defensePosition: string;
};

export type ComposeMember = {
  id: string;
  nickname: string;
  /** 선호 역할군 1~3순위 (프로필 단위, 맵과 무관). 비어 있을 수 있다. */
  rolePreference: RoleGroup[];
  /** 이 맵의 선호. 미입력이면 null → 선호 역할군 요원 후보 또는 미배정. */
  pref: ComposePreference | null;
};

export type ComposeSlot = {
  slotNo: number;
  roleGroup: RoleGroup | null;
  agentId: string | null;
  description: string;
  positionHint: string;
  fixedMemberId: string | null;
};

export type ComposeTactic = { id: string; name: string; slots: ComposeSlot[] };

export type ComposeRules = {
  teamSize: number;
  /** 역할군별 최소 인원. 비어 있으면 제약 없음. */
  minByRole: Partial<Record<RoleGroup, number>>;
};

/** 기획서 기본값: 전략가 1 이상, 척후대 1 이상. 관리자 설정은 후순위. */
export const DEFAULT_RULES: ComposeRules = {
  teamSize: TEAM_SIZE,
  minByRole: { controller: 1, initiator: 1 },
};

export type SlotAssignment = {
  memberId: string;
  nickname: string;
  agentId: string | null;
  /** 몇 순위 선호 요원이었는지. 선호 밖·미배정이면 null. */
  rank: 1 | 2 | 3 | null;
  /** 배정 요원의 역할군이 선호 역할군 몇 순위와 맞는지. 불일치·미배정이면 null. */
  roleRank: 1 | 2 | 3 | null;
  /** 선호 요원 점수 + 자신감 보정 + 선호 역할군 가산점. */
  points: number;
  attackPosition: string;
  defensePosition: string;
};

export type TacticFit = {
  tacticId: string;
  name: string;
  /** 슬롯 번호 → 멤버 id */
  bindings: Record<number, string>;
  filled: number;
  total: number;
  points: number;
  unfilled: Array<{ slotNo: number; description: string }>;
  /**
   * 이 팀의 요원 폭(선호 1~3순위·선호 역할군)으로 설정된 슬롯을 전부 채울 수 있는지. 점수와 무관한 판정 —
   * 우선도가 높아도 false면 "포기"해야 하는 조합이다 (tacticFeasibility 참고).
   */
  feasible: boolean;
  /** 실행 불가 사유 (사람이 읽는 문장). feasible이면 빈 배열. */
  infeasibleReasons: string[];
};

export type Composition = {
  slots: SlotAssignment[];
  /** 이 조합에서 쉬는 멤버 id (참가자 > 정원일 때). */
  bench: string[];
  emptySlots: number;
  /** 선호 점수 + 전술 슬롯 점수 합계 */
  score: number;
  roleCount: Record<RoleGroup, number>;
  meetsRules: boolean;
  tacticFits: TacticFit[];
  /** 사람이 읽는 근거 (긍정). */
  reasons: string[];
  /** 사람이 읽는 주의 (부정). */
  warnings: string[];
};

export type ComposeInput = {
  members: ComposeMember[];
  agents: ComposeAgent[];
  rules?: ComposeRules;
  /** 선택한 전술 (슬롯 점수). 비우면 선호 점수만. */
  tactics?: ComposeTactic[];
  /** 돌려줄 조합 수. 기본 3. */
  limit?: number;
};

export type ComposeOutput = {
  compositions: Composition[];
  /** 평가한 5인 조합 수 (화면에 "N개 조합 중"으로 표시). */
  evaluatedTeams: number;
};

type Option = { agentId: string | null; rank: 1 | 2 | 3 | null; roleRank: 1 | 2 | 3 | null; points: number };

/** 자신감 1~5 → 0~2점. 선호 요원을 받았을 때만 더한다. */
export function confidenceBonus(confidence: number): number {
  const c = Math.min(5, Math.max(1, Math.round(confidence)));
  return (c - 1) / 2;
}

/** 요원의 역할군이 멤버 선호 역할군 몇 순위인지 (1~3, 없으면 null)와 그 가산점 */
function roleMatch(member: ComposeMember, agentId: string | null, agentById: Map<string, ComposeAgent>): { roleRank: 1 | 2 | 3 | null; points: number } {
  const agent = agentId ? agentById.get(agentId) : undefined;
  if (!agent) return { roleRank: null, points: 0 };
  const idx = member.rolePreference.slice(0, 3).indexOf(agent.roleGroup);
  return idx < 0 ? { roleRank: null, points: 0 } : { roleRank: (idx + 1) as 1 | 2 | 3, points: ROLE_RANK_POINTS[idx] };
}

/**
 * 멤버 한 명의 선택지 목록 + "미배정". 요원 마스터에 없는 id는 건너뛴다.
 * - 맵 선호가 있으면 1~3순위 요원 (요원 점수 + 자신감 + 역할군 가산점)
 * - 맵 선호가 없고 선호 역할군만 있으면 1순위 역할군 요원 몇 명을 후보로 (역할군 가산점만) — 그래야 역할군 규칙을
 *   채울 수 있고, 어떤 요원인지는 사용자가 카드에서 바꾼다
 */
function optionsFor(member: ComposeMember, agentById: Map<string, ComposeAgent>, allAgents: ComposeAgent[]): Option[] {
  const out: Option[] = [];
  const hasAgentPref = Boolean(member.pref && member.pref.agentIds.some((id) => id && agentById.has(id)));
  if (member.pref && hasAgentPref) {
    const bonus = confidenceBonus(member.pref.confidence);
    member.pref.agentIds.forEach((id, i) => {
      if (id && agentById.has(id)) {
        const rm = roleMatch(member, id, agentById);
        out.push({ agentId: id, rank: (i + 1) as 1 | 2 | 3, roleRank: rm.roleRank, points: RANK_POINTS[i] + bonus + rm.points });
      }
    });
  } else if (member.rolePreference.length) {
    const top = member.rolePreference[0];
    for (const a of allAgents.filter((x) => x.roleGroup === top).slice(0, ROLE_FALLBACK_AGENTS)) {
      out.push({ agentId: a.id, rank: null, roleRank: 1, points: ROLE_RANK_POINTS[0] });
    }
  }
  out.push({ agentId: null, rank: null, roleRank: null, points: 0 });
  return out;
}

function emptyRoleCount(): Record<RoleGroup, number> {
  return { duelist: 0, initiator: 0, controller: 0, sentinel: 0 };
}

function countRoles(agentIds: Array<string | null>, agentById: Map<string, ComposeAgent>): Record<RoleGroup, number> {
  const count = emptyRoleCount();
  for (const id of agentIds) {
    const a = id ? agentById.get(id) : undefined;
    if (a) count[a.roleGroup] += 1;
  }
  return count;
}

function rulesSatisfied(roleCount: Record<RoleGroup, number>, rules: ComposeRules): boolean {
  return ROLE_GROUPS.every((g) => roleCount[g] >= (rules.minByRole[g] ?? 0));
}

/** n개 중 k개 조합을 인덱스 배열로 열거한다 (사전순 → 결정적). */
function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const walk = (start: number) => {
    if (cur.length === k) {
      out.push([...cur]);
      return;
    }
    for (let i = start; i <= n - (k - cur.length); i++) {
      cur.push(i);
      walk(i + 1);
      cur.pop();
    }
  };
  walk(0);
  return out;
}

// ---------------------------------------------------------------------------
// 전술 슬롯 매칭
// ---------------------------------------------------------------------------

/** 슬롯 하나에 (멤버, 배정 요원)이 맞는지와 점수. 0이면 안 맞는다. */
function slotFitPoints(slot: ComposeSlot, member: ComposeMember, agentId: string | null, agentById: Map<string, ComposeAgent>): number {
  if (!agentId) return 0;
  if (slot.fixedMemberId && slot.fixedMemberId !== member.id) return 0;
  const agent = agentById.get(agentId);
  if (!agent) return 0;
  const fits = slot.agentId ? slot.agentId === agentId : slot.roleGroup ? agent.roleGroup === slot.roleGroup : true;
  if (!fits) return 0;
  let points = SLOT_POINTS;
  const hint = slot.positionHint.trim().toLowerCase();
  if (hint && member.pref) {
    const text = `${member.pref.attackPosition} ${member.pref.defensePosition}`.toLowerCase();
    if (text.includes(hint)) points += POSITION_POINTS;
  }
  return points;
}

/**
 * 슬롯 ↔ 멤버 최대 가중 매칭. 슬롯·멤버 모두 ≤ 5이므로 "사용한 멤버 비트마스크" DP(2^5)로 정확히 푼다.
 * fit[s][m] = 슬롯 s에 멤버 m을 넣을 때 점수(0 = 불가).
 */
function bestSlotBinding(fit: number[][]): { points: number; choice: number[] } {
  const S = fit.length;
  const M = fit[0]?.length ?? 0;
  type Path = { points: number; choice: number[] };
  // 동점이면 "앞 슬롯부터 채운" 경로를 고른다 — 슬롯 1이 보통 핵심 역할이고, 결과가 결정적이어야 하기 때문.
  const better = (a: Path, b: Path | undefined): boolean => {
    if (!b) return true;
    if (a.points !== b.points) return a.points > b.points;
    const aFilled = a.choice.filter((c) => c >= 0).length;
    const bFilled = b.choice.filter((c) => c >= 0).length;
    if (aFilled !== bFilled) return aFilled > bFilled;
    return a.choice.findIndex((c) => c < 0) > b.choice.findIndex((c) => c < 0);
  };
  // layer[mask] = 슬롯을 순서대로 처리하며 mask(쓴 멤버 집합)별 최선 경로
  let layer = new Map<number, Path>([[0, { points: 0, choice: [] }]]);
  for (let s = 0; s < S; s++) {
    const next = new Map<number, Path>();
    for (const [mask, cur] of layer) {
      for (let m = 0; m < M; m++) {
        if (mask & (1 << m) || fit[s][m] <= 0) continue;
        const cand: Path = { points: cur.points + fit[s][m], choice: [...cur.choice, m] };
        if (better(cand, next.get(mask | (1 << m)))) next.set(mask | (1 << m), cand);
      }
      const skip: Path = { points: cur.points, choice: [...cur.choice, -1] };
      if (better(skip, next.get(mask))) next.set(mask, skip);
    }
    layer = next;
  }
  let best: Path | undefined;
  for (const v of layer.values()) if (better(v, best)) best = v;
  return best ?? { points: 0, choice: [] };
}

/** 아무것도 적지 않은 슬롯(역할군·요원·설명·고정 멤버 모두 없음)은 "미사용"으로 보고 점수·충족 수에서 뺀다. */
export function isConfiguredSlot(slot: ComposeSlot): boolean {
  return Boolean(slot.roleGroup || slot.agentId || slot.description.trim() || slot.fixedMemberId);
}

function fitTactic(
  tactic: ComposeTactic,
  team: ComposeMember[],
  agentIds: Array<string | null>,
  agentById: Map<string, ComposeAgent>,
): TacticFit {
  const slots = tactic.slots.filter(isConfiguredSlot).sort((a, b) => a.slotNo - b.slotNo);
  const fit = slots.map((slot) => team.map((m, i) => slotFitPoints(slot, m, agentIds[i], agentById)));
  const { points, choice } = bestSlotBinding(fit);
  const bindings: Record<number, string> = {};
  const unfilled: TacticFit["unfilled"] = [];
  slots.forEach((slot, i) => {
    if (choice[i] >= 0) bindings[slot.slotNo] = team[choice[i]].id;
    else unfilled.push({ slotNo: slot.slotNo, description: slot.description || slotLabel(slot, agentById) });
  });
  return {
    tacticId: tactic.id,
    name: tactic.name,
    bindings,
    filled: slots.length - unfilled.length,
    total: slots.length,
    points: Math.max(0, points),
    unfilled,
    // 탐색 중(searchTeam)에는 점수만 필요하므로 실행 가능성은 결과를 만들 때(withFeasibility) 한 번만 붙인다
    feasible: true,
    infeasibleReasons: [],
  };
}

/** 팀 확정 뒤 전술마다 실행 가능성을 한 번 계산해 붙인다 (배정과 무관한 판정이라 탐색 밖에서 한다). */
function withFeasibility(fits: TacticFit[], tactics: ComposeTactic[], team: ComposeMember[], agentById: Map<string, ComposeAgent>): TacticFit[] {
  const agents = [...agentById.values()];
  return fits.map((f) => {
    const t = tactics.find((x) => x.id === f.tacticId);
    const fz = t ? tacticFeasibility(t, team, agents) : { feasible: true, reasons: [] };
    return { ...f, feasible: fz.feasible, infeasibleReasons: fz.reasons };
  });
}

/** 멤버가 낼 수 있는 요원 id 집합 — optionsFor와 같은 기준(맵 선호 1~3순위, 없으면 선호 역할군 1순위 요원 후보). */
function candidateAgentIds(member: ComposeMember, agentById: Map<string, ComposeAgent>, allAgents: ComposeAgent[]): string[] {
  return optionsFor(member, agentById, allAgents)
    .map((o) => o.agentId)
    .filter((id): id is string => Boolean(id));
}

function agentFitsSlot(slot: ComposeSlot, agent: ComposeAgent): boolean {
  return slot.agentId ? slot.agentId === agent.id : slot.roleGroup ? agent.roleGroup === slot.roleGroup : true;
}

export type Feasibility = { feasible: boolean; reasons: string[] };

/**
 * 전술 실행 가능성 — 점수와 별개의 하드 판정.
 *
 * 질문: 이 멤버들의 요원 폭으로 설정된 슬롯을 전부, 요원 겹침 없이 채울 수 있는가?
 * 편성 점수(DP)는 선호 점수와 슬롯 점수를 합산해 최적화하므로 "채울 수는 있지만 점수가 낮은" 배정을 지나칠 수 있다.
 * 그래서 여기서는 (슬롯 → 멤버 → 요원) 깊이 우선 탐색으로 "존재하는지"만 본다. 슬롯·멤버 ≤ 5(후보는 참가자 전체 ≤ 10),
 * 멤버당 요원 ≤ 4라 탐색량은 작다.
 *
 * 사유는 두 단계로 적는다: (1) 후보가 한 명도 없는 슬롯 — 가장 유용한 설명, (2) 후보는 있지만 겹쳐서 동시에 못 채움.
 */
export function tacticFeasibility(tactic: ComposeTactic, members: ComposeMember[], agents: ComposeAgent[]): Feasibility {
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const slots = tactic.slots.filter(isConfiguredSlot).sort((a, b) => a.slotNo - b.slotNo);
  if (slots.length === 0) return { feasible: true, reasons: [] };
  const reasons: string[] = [];

  // 같은 특정 요원을 두 슬롯이 요구하면 요원 중복 금지 규칙상 불가
  const wanted = slots.map((s) => s.agentId).filter((x): x is string => Boolean(x));
  const dupAgent = wanted.find((id, i) => wanted.indexOf(id) !== i);
  if (dupAgent) reasons.push(`슬롯 두 개가 같은 요원(${agentById.get(dupAgent)?.nameKo ?? dupAgent})을 요구함`);

  // 슬롯별 후보 (멤버, 요원) 쌍
  const candidates = slots.map((slot) =>
    members.flatMap((m) =>
      slot.fixedMemberId && slot.fixedMemberId !== m.id
        ? []
        : candidateAgentIds(m, agentById, agents)
            .map((id) => agentById.get(id))
            .filter((a): a is ComposeAgent => Boolean(a) && agentFitsSlot(slot, a!))
            .map((a) => ({ memberId: m.id, agentId: a.id })),
    ),
  );
  slots.forEach((slot, i) => {
    if (candidates[i].length === 0) reasons.push(`슬롯 ${slot.slotNo}(${slot.description || slotLabel(slot, agentById)}): 맡을 수 있는 멤버 없음`);
  });
  if (reasons.length) return { feasible: false, reasons };

  const usedMembers = new Set<string>();
  const usedAgents = new Set<string>();
  const dfs = (i: number): boolean => {
    if (i === slots.length) return true;
    for (const c of candidates[i]) {
      if (usedMembers.has(c.memberId) || usedAgents.has(c.agentId)) continue;
      usedMembers.add(c.memberId);
      usedAgents.add(c.agentId);
      if (dfs(i + 1)) return true;
      usedMembers.delete(c.memberId);
      usedAgents.delete(c.agentId);
    }
    return false;
  };
  if (dfs(0)) return { feasible: true, reasons: [] };
  return { feasible: false, reasons: [`슬롯 ${slots.length}개를 동시에 채울 멤버·요원 조합이 없음 (후보가 겹침)`] };
}

function slotLabel(slot: ComposeSlot, agentById?: Map<string, ComposeAgent>): string {
  if (slot.roleGroup) return ROLE_LABELS[slot.roleGroup].ko;
  if (slot.agentId) return agentById?.get(slot.agentId)?.nameKo ?? `요원 ${slot.agentId}`;
  return "아무나";
}

function tacticPoints(fits: TacticFit[]): number {
  return fits.reduce((sum, f) => sum + f.points, 0);
}

// ---------------------------------------------------------------------------
// 팀 탐색
// ---------------------------------------------------------------------------

type TeamSearch = { best: Option[] | null; bestScore: number; bestAny: Option[] | null; bestAnyScore: number };

/**
 * 한 팀(멤버 배열)에 대한 최적 배정. 깊이 우선 탐색으로 요원 중복을 가지치기하며,
 * 규칙 충족 최고점(best)과 규칙 무시 최고점(bestAny)을 동시에 추적한다.
 * 점수 = 선호 점수 합 + (전술이 있으면) 슬롯 점수.
 */
function searchTeam(team: ComposeMember[], agentById: Map<string, ComposeAgent>, rules: ComposeRules, tactics: ComposeTactic[]): TeamSearch {
  const allAgents = [...agentById.values()];
  const options = team.map((m) => optionsFor(m, agentById, allAgents));
  const state: TeamSearch = { best: null, bestScore: -1, bestAny: null, bestAnyScore: -1 };
  const chosen: Option[] = [];
  const used = new Set<string>();

  const visit = (depth: number, prefScore: number) => {
    if (depth === team.length) {
      const agentIds = chosen.map((o) => o.agentId);
      const roleCount = countRoles(agentIds, agentById);
      const score = prefScore + (tactics.length ? tacticPoints(tactics.map((t) => fitTactic(t, team, agentIds, agentById))) : 0);
      if (score > state.bestAnyScore) {
        state.bestAnyScore = score;
        state.bestAny = [...chosen];
      }
      if (rulesSatisfied(roleCount, rules) && score > state.bestScore) {
        state.bestScore = score;
        state.best = [...chosen];
      }
      return;
    }
    for (const opt of options[depth]) {
      if (opt.agentId && used.has(opt.agentId)) continue;
      if (opt.agentId) used.add(opt.agentId);
      chosen.push(opt);
      visit(depth + 1, prefScore + opt.points);
      chosen.pop();
      if (opt.agentId) used.delete(opt.agentId);
    }
  };
  visit(0, 0);
  return state;
}

function toSlots(team: ComposeMember[], picked: Option[]): SlotAssignment[] {
  return team.map((m, i) => ({
    memberId: m.id,
    nickname: m.nickname,
    agentId: picked[i].agentId,
    rank: picked[i].rank,
    roleRank: picked[i].roleRank,
    points: picked[i].points,
    attackPosition: m.pref?.attackPosition ?? "",
    defensePosition: m.pref?.defensePosition ?? "",
  }));
}

type DescribeInput = {
  slots: SlotAssignment[];
  roleCount: Record<RoleGroup, number>;
  rules: ComposeRules;
  members: ComposeMember[];
  agentById: Map<string, ComposeAgent>;
  bench: string[];
  emptySlots: number;
  duplicates: string[];
  tacticFits: TacticFit[];
};

/** 근거·경고 문장 생성. 점수 계산과 분리해 두어 문구를 바꿔도 로직 테스트가 깨지지 않는다. */
function describe(d: DescribeInput): { reasons: string[]; warnings: string[] } {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const nick = (id: string) => d.members.find((m) => m.id === id)?.nickname ?? id;

  const firstPicks = d.slots.filter((s) => s.rank === 1).length;
  if (firstPicks > 0) reasons.push(`1순위 요원 그대로 ${firstPicks}명`);
  const lower = d.slots.filter((s) => s.rank === 2 || s.rank === 3);
  if (lower.length) reasons.push(`${lower.map((s) => `${s.nickname} ${s.rank}순위`).join(", ")}`);
  const roleHits = d.slots.filter((s) => s.roleRank !== null).length;
  if (roleHits > 0) reasons.push(`선호 역할군 일치 ${roleHits}명`);
  reasons.push(ROLE_GROUPS.map((g) => `${ROLE_LABELS[g].ko} ${d.roleCount[g]}`).join(" · "));

  for (const f of d.tacticFits) {
    if (f.filled === f.total && f.total > 0) reasons.push(`전술 ${f.name}: 슬롯 ${f.filled}/${f.total} 충족 — 그대로 실행 가능`);
    else if (f.total > 0) reasons.push(`전술 ${f.name}: 슬롯 ${f.filled}/${f.total} 충족`);
    // 빈 슬롯은 "무엇이 비었는지", 실행 불가는 "왜 채울 수 없는지" — 둘 다 적어야 포기 판단이 선다
    for (const u of f.unfilled) warnings.push(`전술 ${f.name}: 슬롯 ${u.slotNo}(${u.description}) 비어 있음 — 수정 필요`);
    if (!f.feasible) warnings.push(`전술 ${f.name}: 참가자 요원 폭으로 실행 불가 — 포기 권고 (${f.infeasibleReasons.join("; ")})`);
  }

  for (const g of ROLE_GROUPS) {
    const min = d.rules.minByRole[g] ?? 0;
    if (d.roleCount[g] < min) warnings.push(`${ROLE_LABELS[g].ko} ${d.roleCount[g]}명 — 규칙(${min}명 이상) 미달`);
  }
  for (const s of d.slots) {
    const m = d.members.find((x) => x.id === s.memberId);
    const hasAgentPref = Boolean(m?.pref?.agentIds.some(Boolean));
    if (!hasAgentPref && s.agentId && s.roleRank) {
      warnings.push(`${s.nickname}: 맵 선호 미입력 — 선호 역할군(${ROLE_LABELS[d.agentById.get(s.agentId)!.roleGroup].ko})으로 ${d.agentById.get(s.agentId)?.nameKo} 배정, 요원을 확인하세요`);
    } else if (!hasAgentPref) warnings.push(`${s.nickname}: 이 맵 선호 미입력 — 요원을 직접 정하세요`);
    else if (!s.agentId) warnings.push(`${s.nickname}: 선호 요원이 모두 겹쳐 배정 못 함`);
    else if (s.rank === null) warnings.push(`${s.nickname}: 선호 밖 요원(${d.agentById.get(s.agentId)?.nameKo ?? s.agentId})`);
  }
  if (d.duplicates.length) warnings.push(`요원 중복: ${d.duplicates.map((id) => d.agentById.get(id)?.nameKo ?? id).join(", ")}`);
  if (d.emptySlots > 0) warnings.push(`빈 슬롯 ${d.emptySlots}개 — 참가자가 정원보다 적습니다`);
  if (d.bench.length) reasons.push(`벤치: ${d.bench.map(nick).join(", ")}`);
  return { reasons, warnings };
}

function buildComposition(
  team: ComposeMember[],
  picked: Option[],
  meetsRules: boolean,
  allMembers: ComposeMember[],
  agentById: Map<string, ComposeAgent>,
  rules: ComposeRules,
  tactics: ComposeTactic[],
): Composition {
  const slots = toSlots(team, picked);
  const teamIds = new Set(team.map((m) => m.id));
  const bench = allMembers.filter((m) => !teamIds.has(m.id)).map((m) => m.id);
  const emptySlots = Math.max(0, rules.teamSize - team.length);
  const agentIds = slots.map((s) => s.agentId);
  const roleCount = countRoles(agentIds, agentById);
  const tacticFits = withFeasibility(
    tactics.map((t) => fitTactic(t, team, agentIds, agentById)),
    tactics,
    team,
    agentById,
  );
  const score = slots.reduce((sum, s) => sum + s.points, 0) + tacticPoints(tacticFits);
  const { reasons, warnings } = describe({ slots, roleCount, rules, members: allMembers, agentById, bench, emptySlots, duplicates: [], tacticFits });
  return { slots, bench, emptySlots, score, roleCount, meetsRules, tacticFits, reasons, warnings };
}

function compareCompositions(a: Composition, b: Composition): number {
  if (a.meetsRules !== b.meetsRules) return a.meetsRules ? -1 : 1;
  if (a.score !== b.score) return b.score - a.score;
  const aEmpty = a.slots.filter((s) => !s.agentId).length;
  const bEmpty = b.slots.filter((s) => !s.agentId).length;
  if (aEmpty !== bEmpty) return aEmpty - bEmpty;
  return a.slots
    .map((s) => s.memberId)
    .sort()
    .join(",")
    .localeCompare(b.slots.map((s) => s.memberId).sort().join(","));
}

/**
 * 오늘 참가자와 맵 선호(그리고 선택한 전술)로 상위 조합을 계산한다.
 * @throws RangeError 참가자가 MAX_PARTICIPANTS를 넘으면 (호출 측이 미리 검증하는 것이 원칙).
 */
export function composeSquads(input: ComposeInput): ComposeOutput {
  const rules = input.rules ?? DEFAULT_RULES;
  const tactics = input.tactics ?? [];
  const limit = input.limit ?? 3;
  if (input.members.length > MAX_PARTICIPANTS) {
    throw new RangeError(`참가자는 최대 ${MAX_PARTICIPANTS}명까지 계산할 수 있습니다 (현재 ${input.members.length}명)`);
  }
  // 입력 순서와 무관하게 같은 결과가 나오도록 id로 정렬한 사본을 쓴다.
  const members = [...input.members].sort((a, b) => a.id.localeCompare(b.id));
  const agentById = new Map(input.agents.map((a) => [a.id, a]));

  const teams: ComposeMember[][] =
    members.length <= rules.teamSize
      ? [members]
      : combinations(members.length, rules.teamSize).map((idx) => idx.map((i) => members[i]));

  const compositions = teams.map((team) => {
    const found = searchTeam(team, agentById, rules, tactics);
    const picked = found.best ?? found.bestAny ?? team.map(() => ({ agentId: null, rank: null, roleRank: null, points: 0 }) as Option);
    return buildComposition(team, picked, found.best !== null, members, agentById, rules, tactics);
  });

  compositions.sort(compareCompositions);
  return { compositions: compositions.slice(0, limit), evaluatedTeams: teams.length };
}

/**
 * 사용자가 요원을 수동으로 바꿨을 때 같은 기준으로 다시 채점한다.
 * assignment에 없는 멤버는 미배정으로 본다. 중복 요원은 규칙 위반(meetsRules=false)으로 표시만 하고 막지 않는다 —
 * 화면에서 즉시 피드백을 주고, 저장 시점에 서버가 다시 검증한다.
 */
export function evaluateAssignment(input: {
  members: ComposeMember[];
  agents: ComposeAgent[];
  assignment: Record<string, string | null>;
  rules?: ComposeRules;
  tactics?: ComposeTactic[];
}): Composition {
  const rules = input.rules ?? DEFAULT_RULES;
  const tactics = input.tactics ?? [];
  const agentById = new Map(input.agents.map((a) => [a.id, a]));
  const members = [...input.members].sort((a, b) => a.id.localeCompare(b.id));

  const picked: Option[] = members.map((m) => {
    const agentId = input.assignment[m.id] ?? null;
    if (!agentId || !agentById.has(agentId)) return { agentId: null, rank: null, roleRank: null, points: 0 };
    const rm = roleMatch(m, agentId, agentById);
    const rankIdx = m.pref ? m.pref.agentIds.indexOf(agentId) : -1;
    if (rankIdx < 0) return { agentId, rank: null, roleRank: rm.roleRank, points: rm.points };
    return { agentId, rank: (rankIdx + 1) as 1 | 2 | 3, roleRank: rm.roleRank, points: RANK_POINTS[rankIdx] + confidenceBonus(m.pref!.confidence) + rm.points };
  });

  const ids = picked.map((p) => p.agentId).filter((x): x is string => Boolean(x));
  const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  const slots = toSlots(members, picked);
  const agentIds = picked.map((p) => p.agentId);
  const roleCount = countRoles(ids, agentById);
  const emptySlots = Math.max(0, rules.teamSize - members.length);
  const meetsRules = duplicates.length === 0 && rulesSatisfied(roleCount, rules);
  const tacticFits = withFeasibility(
    tactics.map((t) => fitTactic(t, members, agentIds, agentById)),
    tactics,
    members,
    agentById,
  );
  const score = picked.reduce((sum, p) => sum + p.points, 0) + tacticPoints(tacticFits);
  const { reasons, warnings } = describe({ slots, roleCount, rules, members, agentById, bench: [], emptySlots, duplicates, tacticFits });
  return { slots, bench: [], emptySlots, score, roleCount, meetsRules, tacticFits, reasons, warnings };
}

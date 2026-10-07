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
 * 규모: 참가자 ≤ 10, 선택지 ≤ 4 → 조합 252 × 배정 ≤ 4^5 = 1024 → 약 26만 번 평가. 서버에서 수십 ms.
 */

export const TEAM_SIZE = 5;
/** 참가자 상한. 조합 수(C(N,5))가 급증하므로 소모임 규모에 맞춰 묶는다. */
export const MAX_PARTICIPANTS = 10;

/** 선호 순위별 점수 (기획서 5절 표). index 0 = 1순위. */
export const RANK_POINTS = [3, 2, 1] as const;

export type ComposeAgent = { id: string; nameKo: string; roleGroup: RoleGroup };

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
  /** 이 맵의 선호. 미입력이면 null → 요원 없이 0점으로 참가. */
  pref: ComposePreference | null;
};

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
  /** 몇 순위 선호였는지. 선호 밖·미배정이면 null. */
  rank: 1 | 2 | 3 | null;
  /** 선호 순위 점수 + 자신감 보정. */
  points: number;
  attackPosition: string;
  defensePosition: string;
};

export type Composition = {
  slots: SlotAssignment[];
  /** 이 조합에서 쉬는 멤버 id (참가자 > 정원일 때). */
  bench: string[];
  emptySlots: number;
  score: number;
  roleCount: Record<RoleGroup, number>;
  meetsRules: boolean;
  /** 사람이 읽는 근거 (긍정). */
  reasons: string[];
  /** 사람이 읽는 주의 (부정). */
  warnings: string[];
};

export type ComposeInput = {
  members: ComposeMember[];
  agents: ComposeAgent[];
  rules?: ComposeRules;
  /** 돌려줄 조합 수. 기본 3. */
  limit?: number;
};

export type ComposeOutput = {
  compositions: Composition[];
  /** 평가한 5인 조합 수 (화면에 "N개 조합 중"으로 표시). */
  evaluatedTeams: number;
};

type Option = { agentId: string | null; rank: 1 | 2 | 3 | null; points: number };

/** 자신감 1~5 → 0~2점. 선호 요원을 받았을 때만 더한다. */
export function confidenceBonus(confidence: number): number {
  const c = Math.min(5, Math.max(1, Math.round(confidence)));
  return (c - 1) / 2;
}

/** 멤버 한 명의 선택지 목록. 순위 요원 + "미배정". 요원 마스터에 없는 id는 건너뛴다. */
function optionsFor(member: ComposeMember, agentById: Map<string, ComposeAgent>): Option[] {
  const out: Option[] = [];
  if (member.pref) {
    const bonus = confidenceBonus(member.pref.confidence);
    member.pref.agentIds.forEach((id, i) => {
      if (id && agentById.has(id)) {
        out.push({ agentId: id, rank: (i + 1) as 1 | 2 | 3, points: RANK_POINTS[i] + bonus });
      }
    });
  }
  out.push({ agentId: null, rank: null, points: 0 });
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

type TeamSearch = { best: Option[] | null; bestScore: number; bestAny: Option[] | null; bestAnyScore: number };

/**
 * 한 팀(멤버 배열)에 대한 최적 배정. 깊이 우선 탐색으로 요원 중복을 가지치기하며,
 * 규칙 충족 최고점(best)과 규칙 무시 최고점(bestAny)을 동시에 추적한다.
 */
function searchTeam(team: ComposeMember[], agentById: Map<string, ComposeAgent>, rules: ComposeRules): TeamSearch {
  const options = team.map((m) => optionsFor(m, agentById));
  const state: TeamSearch = { best: null, bestScore: -1, bestAny: null, bestAnyScore: -1 };
  const chosen: Option[] = [];
  const used = new Set<string>();

  const visit = (depth: number, score: number) => {
    if (depth === team.length) {
      const roleCount = countRoles(
        chosen.map((o) => o.agentId),
        agentById,
      );
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
      visit(depth + 1, score + opt.points);
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
    points: picked[i].points,
    attackPosition: m.pref?.attackPosition ?? "",
    defensePosition: m.pref?.defensePosition ?? "",
  }));
}

/** 근거·경고 문장 생성. 점수 계산과 분리해 두어 문구를 바꿔도 로직 테스트가 깨지지 않는다. */
function describe(
  slots: SlotAssignment[],
  roleCount: Record<RoleGroup, number>,
  rules: ComposeRules,
  members: ComposeMember[],
  agentById: Map<string, ComposeAgent>,
  bench: string[],
  emptySlots: number,
  duplicates: string[],
): { reasons: string[]; warnings: string[] } {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const nick = (id: string) => members.find((m) => m.id === id)?.nickname ?? id;

  const firstPicks = slots.filter((s) => s.rank === 1).length;
  if (firstPicks > 0) reasons.push(`1순위 요원 그대로 ${firstPicks}명`);
  const lower = slots.filter((s) => s.rank === 2 || s.rank === 3);
  if (lower.length) reasons.push(`${lower.map((s) => `${s.nickname} ${s.rank}순위`).join(", ")}`);
  reasons.push(ROLE_GROUPS.map((g) => `${ROLE_LABELS[g].ko} ${roleCount[g]}`).join(" · "));

  for (const g of ROLE_GROUPS) {
    const min = rules.minByRole[g] ?? 0;
    if (roleCount[g] < min) warnings.push(`${ROLE_LABELS[g].ko} ${roleCount[g]}명 — 규칙(${min}명 이상) 미달`);
  }
  for (const s of slots) {
    const m = members.find((x) => x.id === s.memberId);
    if (!m?.pref) warnings.push(`${s.nickname}: 이 맵 선호 미입력 — 요원을 직접 정하세요`);
    else if (!s.agentId) warnings.push(`${s.nickname}: 선호 요원이 모두 겹쳐 배정 못 함`);
    else if (s.rank === null) warnings.push(`${s.nickname}: 선호 밖 요원(${agentById.get(s.agentId)?.nameKo ?? s.agentId})`);
  }
  if (duplicates.length) warnings.push(`요원 중복: ${duplicates.map((id) => agentById.get(id)?.nameKo ?? id).join(", ")}`);
  if (emptySlots > 0) warnings.push(`빈 슬롯 ${emptySlots}개 — 참가자가 정원보다 적습니다`);
  if (bench.length) reasons.push(`벤치: ${bench.map(nick).join(", ")}`);
  return { reasons, warnings };
}

function buildComposition(
  team: ComposeMember[],
  picked: Option[],
  meetsRules: boolean,
  allMembers: ComposeMember[],
  agentById: Map<string, ComposeAgent>,
  rules: ComposeRules,
): Composition {
  const slots = toSlots(team, picked);
  const teamIds = new Set(team.map((m) => m.id));
  const bench = allMembers.filter((m) => !teamIds.has(m.id)).map((m) => m.id);
  const emptySlots = Math.max(0, rules.teamSize - team.length);
  const roleCount = countRoles(
    slots.map((s) => s.agentId),
    agentById,
  );
  const score = slots.reduce((sum, s) => sum + s.points, 0);
  const { reasons, warnings } = describe(slots, roleCount, rules, allMembers, agentById, bench, emptySlots, []);
  return { slots, bench, emptySlots, score, roleCount, meetsRules, reasons, warnings };
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
 * 오늘 참가자와 맵 선호로 상위 조합을 계산한다.
 * @throws RangeError 참가자가 MAX_PARTICIPANTS를 넘으면 (호출 측이 미리 검증하는 것이 원칙).
 */
export function composeSquads(input: ComposeInput): ComposeOutput {
  const rules = input.rules ?? DEFAULT_RULES;
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
    const found = searchTeam(team, agentById, rules);
    const picked = found.best ?? found.bestAny ?? team.map(() => ({ agentId: null, rank: null, points: 0 }) as Option);
    return buildComposition(team, picked, found.best !== null, members, agentById, rules);
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
}): Composition {
  const rules = input.rules ?? DEFAULT_RULES;
  const agentById = new Map(input.agents.map((a) => [a.id, a]));
  const members = [...input.members].sort((a, b) => a.id.localeCompare(b.id));

  const picked: Option[] = members.map((m) => {
    const agentId = input.assignment[m.id] ?? null;
    if (!agentId || !agentById.has(agentId)) return { agentId: null, rank: null, points: 0 };
    const rankIdx = m.pref ? m.pref.agentIds.indexOf(agentId) : -1;
    if (rankIdx < 0) return { agentId, rank: null, points: 0 };
    return { agentId, rank: (rankIdx + 1) as 1 | 2 | 3, points: RANK_POINTS[rankIdx] + confidenceBonus(m.pref!.confidence) };
  });

  const ids = picked.map((p) => p.agentId).filter((x): x is string => Boolean(x));
  const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  const slots = toSlots(members, picked);
  const roleCount = countRoles(ids, agentById);
  const emptySlots = Math.max(0, rules.teamSize - members.length);
  const meetsRules = duplicates.length === 0 && rulesSatisfied(roleCount, rules);
  const score = picked.reduce((sum, p) => sum + p.points, 0);
  const { reasons, warnings } = describe(slots, roleCount, rules, members, agentById, [], emptySlots, duplicates);
  return { slots, bench: [], emptySlots, score, roleCount, meetsRules, reasons, warnings };
}

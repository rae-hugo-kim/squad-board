import { composeSquads, tacticFeasibility, type ComposeAgent, type ComposeMember, type ComposeTactic, type Composition } from "./compose";

/**
 * "오늘의 스쿼드" — 랜딩에서 참가자·맵을 고르면 공통 전술 중 하나를 골라 보드로 보낸다 (순수 함수).
 *
 * 규칙
 * 1. 후보는 우선도 순으로 정렬된 공통 전술 목록(호출 측이 sortByPriority로 정렬해 넘긴다).
 * 2. 참가자 전체를 후보 풀로 한 빠른 실행 가능성 검사(tacticFeasibility)를 먼저 한다 — 전원으로도 못 채우는 전술은
 *    어떤 5인 조합으로도 못 채우므로 편성 계산 없이 건너뛴다(포기). 10명 × 전술 여러 개를 매번 완전 탐색하면 느리다.
 * 3. 통과한 첫 전술로 편성을 계산하고, 상위 조합에서도 실행 가능하면 확정. (5인 부분집합에서는 불가할 수 있으므로 다시 확인.)
 * 4. 전부 불가면 우선도 1위 전술을 "포기 권고" 표시와 함께 돌려준다 — 빈 화면보다 "왜 안 되는지"가 유용하다.
 */
export type TodayTactic<T extends ComposeTactic> = T & { priority: number };

export type TodayPick<T extends ComposeTactic> = {
  tactic: TodayTactic<T>;
  composition: Composition;
  /** 상위 조합 기준 실행 가능 여부. false면 포기 권고. */
  feasible: boolean;
  /** 건너뛴(실행 불가) 전술과 사유 — 화면에서 "포기한 전술"로 보여준다 */
  skipped: Array<{ tactic: TodayTactic<T>; reasons: string[] }>;
};

export function chooseTodayTactic<T extends ComposeTactic>(input: {
  tactics: TodayTactic<T>[];
  members: ComposeMember[];
  agents: ComposeAgent[];
}): TodayPick<T> | null {
  if (input.tactics.length === 0 || input.members.length === 0) return null;
  const skipped: TodayPick<T>["skipped"] = [];
  for (const tactic of input.tactics) {
    const quick = tacticFeasibility(tactic, input.members, input.agents);
    if (!quick.feasible) {
      skipped.push({ tactic, reasons: quick.reasons });
      continue;
    }
    const { compositions } = composeSquads({ members: input.members, agents: input.agents, tactics: [tactic], limit: 1 });
    const top = compositions[0];
    const fit = top?.tacticFits[0];
    if (top && fit?.feasible) return { tactic, composition: top, feasible: true, skipped };
    skipped.push({ tactic, reasons: fit?.infeasibleReasons.length ? fit.infeasibleReasons : ["상위 5인 조합에서 슬롯을 채우지 못함"] });
  }
  // 전부 포기 — 우선도 1위를 보여주되 포기 권고
  const first = input.tactics[0];
  const { compositions } = composeSquads({ members: input.members, agents: input.agents, tactics: [first], limit: 1 });
  const top = compositions[0];
  if (!top) return null;
  return { tactic: first, composition: top, feasible: false, skipped: skipped.filter((s) => s.tactic.id !== first.id) };
}

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composeSquads,
  evaluateAssignment,
  DEFAULT_RULES,
  MAX_PARTICIPANTS,
  type ComposeAgent,
  type ComposeMember,
} from "./compose";

/**
 * 편성기 단위 테스트 — 기획서 5절(제약 → 점수 → 상위 3개)을 고정한다.
 * 실행: npm test
 */

// 요원 픽스처: 역할군별 2~3명. id는 slug와 같게 둬서 읽기 쉽게 한다.
const A = (id: string, roleGroup: ComposeAgent["roleGroup"]): ComposeAgent => ({ id, nameKo: id, roleGroup });
const agents: ComposeAgent[] = [
  A("jett", "duelist"),
  A("raze", "duelist"),
  A("reyna", "duelist"),
  A("sova", "initiator"),
  A("skye", "initiator"),
  A("omen", "controller"),
  A("brimstone", "controller"),
  A("cypher", "sentinel"),
  A("killjoy", "sentinel"),
];

function member(
  id: string,
  prefs: [string | null, string | null, string | null] | null,
  confidence = 3,
): ComposeMember {
  return {
    id,
    nickname: id.toUpperCase(),
    pref: prefs ? { agentIds: prefs, confidence, attackPosition: `${id}-atk`, defensePosition: `${id}-def` } : null,
  };
}

test("1순위가 모두 다르면 전원 1순위 요원을 받고 점수는 3점 + 자신감 보정의 합이다", () => {
  const members = [
    member("a", ["jett", null, null], 5),
    member("b", ["sova", null, null], 3),
    member("c", ["omen", null, null], 1),
    member("d", ["cypher", null, null], 3),
    member("e", ["raze", null, null], 3),
  ];
  const { compositions } = composeSquads({ members, agents });
  assert.equal(compositions.length, 1);
  const top = compositions[0];
  const byMember = Object.fromEntries(top.slots.map((s) => [s.memberId, s]));
  assert.equal(byMember.a.agentId, "jett");
  assert.equal(byMember.c.agentId, "omen");
  // 자신감 5 → +2, 3 → +1, 1 → +0. 선호 3점 × 5명 = 15, 보정 2+1+0+1+1 = 5
  assert.equal(top.score, 20);
  assert.equal(top.meetsRules, true);
  assert.deepEqual(top.bench, []);
});

test("같은 요원을 1순위로 둔 두 명 중 한 명은 2순위로 밀리고, 총점이 최대가 되게 배정한다", () => {
  const members = [
    member("a", ["jett", null, null], 3), // 대안이 없다 → jett을 못 받으면 미배정(0점)
    member("b", ["jett", "reyna", null], 3), // 대안이 있다 → reyna(2점)로 밀리는 쪽이 총점이 크다
    member("c", ["omen", null, null], 3),
    member("d", ["sova", null, null], 3),
    member("e", ["cypher", null, null], 3),
  ];
  const { compositions } = composeSquads({ members, agents });
  const top = compositions[0];
  const byMember = Object.fromEntries(top.slots.map((s) => [s.memberId, s]));
  assert.equal(byMember.a.agentId, "jett");
  assert.equal(byMember.b.agentId, "reyna");
  assert.equal(byMember.b.rank, 2);
  const ids = top.slots.map((s) => s.agentId);
  assert.equal(new Set(ids).size, ids.length, "요원 중복 없음");
});

test("역할군 최소 규칙(전략가 1 이상)은 점수보다 우선한다", () => {
  // 전략가(omen)는 e의 3순위에만 있다. 규칙이 없으면 e는 1순위 killjoy를 받는 게 점수가 높다.
  const members = [
    member("a", ["jett", null, null]),
    member("b", ["raze", null, null]),
    member("c", ["sova", null, null]),
    member("d", ["cypher", null, null]),
    member("e", ["killjoy", "skye", "omen"]),
  ];
  const withRule = composeSquads({ members, agents }).compositions[0];
  assert.equal(withRule.meetsRules, true);
  assert.equal(withRule.slots.find((s) => s.memberId === "e")?.agentId, "omen");
  assert.equal(withRule.roleCount.controller, 1);

  const noRule = composeSquads({ members, agents, rules: { ...DEFAULT_RULES, minByRole: {} } }).compositions[0];
  assert.equal(noRule.slots.find((s) => s.memberId === "e")?.agentId, "killjoy");
});

test("규칙을 만족하는 배정이 하나도 없으면 최고 점수 배정을 경고와 함께 돌려준다", () => {
  const members = [
    member("a", ["jett", null, null]),
    member("b", ["raze", null, null]),
    member("c", ["reyna", null, null]),
    member("d", ["cypher", null, null]),
    member("e", ["killjoy", null, null]),
  ];
  const top = composeSquads({ members, agents }).compositions[0];
  assert.equal(top.meetsRules, false);
  assert.ok(top.warnings.some((w) => w.includes("전략가")), `전략가 부족 경고: ${top.warnings.join(" | ")}`);
  assert.ok(top.warnings.some((w) => w.includes("척후대")));
});

test("선호를 입력하지 않은 멤버는 요원 없이 0점으로 들어가고 경고가 붙는다", () => {
  const members = [
    member("a", ["jett", null, null]),
    member("b", ["sova", null, null]),
    member("c", ["omen", null, null]),
    member("d", ["cypher", null, null]),
    member("e", null),
  ];
  const top = composeSquads({ members, agents }).compositions[0];
  const e = top.slots.find((s) => s.memberId === "e");
  assert.equal(e?.agentId, null);
  assert.equal(e?.points, 0);
  assert.ok(top.warnings.some((w) => w.includes("E") && w.includes("선호")));
});

test("참가자가 5명 미만이면 있는 인원만 배정하고 빈 슬롯 수를 알려준다", () => {
  const members = [member("a", ["jett", null, null]), member("b", ["omen", null, null]), member("c", ["sova", null, null])];
  const top = composeSquads({ members, agents }).compositions[0];
  assert.equal(top.slots.length, 3);
  assert.equal(top.emptySlots, 2);
  assert.ok(top.warnings.some((w) => w.includes("빈 슬롯 2")));
});

test("참가자가 5명을 넘으면 로테이션(벤치) 안을 최대 3개까지, 서로 다른 조합으로 제시한다", () => {
  const members = [
    member("a", ["jett", null, null], 5),
    member("b", ["raze", null, null], 4),
    member("c", ["sova", null, null], 3),
    member("d", ["omen", null, null], 3),
    member("e", ["cypher", null, null], 3),
    member("f", ["skye", null, null], 2),
    member("g", ["brimstone", null, null], 1),
  ];
  const { compositions } = composeSquads({ members, agents });
  assert.equal(compositions.length, 3);
  for (const c of compositions) {
    assert.equal(c.slots.length, 5);
    assert.equal(c.bench.length, 2);
  }
  const keys = compositions.map((c) => c.slots.map((s) => s.memberId).sort().join(","));
  assert.equal(new Set(keys).size, 3, "조합이 서로 달라야 한다");
  // 점수 내림차순
  assert.ok(compositions[0].score >= compositions[1].score && compositions[1].score >= compositions[2].score);
});

test("같은 입력이면 항상 같은 순서로 같은 결과를 낸다 (결정적)", () => {
  const members = [
    member("a", ["jett", "raze", null]),
    member("b", ["jett", "reyna", null]),
    member("c", ["sova", "skye", null]),
    member("d", ["omen", null, null]),
    member("e", ["cypher", null, null]),
    member("f", ["killjoy", null, null]),
  ];
  const r1 = composeSquads({ members, agents });
  const r2 = composeSquads({ members: [...members].reverse(), agents });
  assert.deepEqual(
    r1.compositions.map((c) => c.slots.map((s) => `${s.memberId}:${s.agentId}`).sort()),
    r2.compositions.map((c) => c.slots.map((s) => `${s.memberId}:${s.agentId}`).sort()),
  );
});

test("참가자 상한을 넘기면 계산하지 않고 RangeError를 던진다", () => {
  const members = Array.from({ length: MAX_PARTICIPANTS + 1 }, (_, i) => member(`m${i}`, ["jett", null, null]));
  assert.throws(() => composeSquads({ members, agents }), RangeError);
});

test("evaluateAssignment: 선호 밖 요원으로 바꾸면 0점이 되고, 중복 요원은 규칙 위반으로 표시한다", () => {
  const members = [
    member("a", ["jett", null, null], 3),
    member("b", ["sova", null, null], 3),
    member("c", ["omen", null, null], 3),
    member("d", ["cypher", null, null], 3),
    member("e", ["raze", null, null], 3),
  ];
  const ok = evaluateAssignment({
    members,
    agents,
    assignment: { a: "jett", b: "sova", c: "omen", d: "cypher", e: "raze" },
  });
  assert.equal(ok.score, 20);
  assert.equal(ok.meetsRules, true);

  const swapped = evaluateAssignment({
    members,
    agents,
    assignment: { a: "jett", b: "sova", c: "omen", d: "cypher", e: "killjoy" }, // e의 선호 밖
  });
  const e = swapped.slots.find((s) => s.memberId === "e");
  assert.equal(e?.points, 0);
  assert.equal(e?.rank, null);
  assert.equal(swapped.score, 16);

  const dup = evaluateAssignment({
    members,
    agents,
    assignment: { a: "jett", b: "sova", c: "omen", d: "cypher", e: "jett" },
  });
  assert.equal(dup.meetsRules, false);
  assert.ok(dup.warnings.some((w) => w.includes("중복")));
});

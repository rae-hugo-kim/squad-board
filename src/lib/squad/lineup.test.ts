import { test } from "node:test";
import assert from "node:assert/strict";
import { lineupQuery, parseLineupParam, slotMembersOf } from "./lineup";
import type { Composition } from "./compose";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("parseLineupParam: 쉼표·반복 파라미터를 모두 받고 중복·형식 불량은 버린다", () => {
  assert.deepEqual(parseLineupParam(`${A},${B}`), [A, B]);
  assert.deepEqual(parseLineupParam([A, `${B},${A}`, "not-an-id"]), [A, B]);
  assert.deepEqual(parseLineupParam(undefined), []);
  assert.equal(lineupQuery([A, B]), `m=${encodeURIComponent(`${A},${B}`)}`);
  assert.deepEqual(parseLineupParam(new URLSearchParams(lineupQuery([A, B])).get("m")!), [A, B], "왕복");
});

test("slotMembersOf: 전술 바인딩(슬롯 → 멤버)에 그 멤버의 요원을 붙인다", () => {
  const composition = {
    slots: [
      { memberId: A, nickname: "Rae", agentId: "omen", rank: 1, roleRank: null, points: 3, attackPosition: "", defensePosition: "" },
      { memberId: B, nickname: "Min", agentId: null, rank: null, roleRank: null, points: 0, attackPosition: "", defensePosition: "" },
    ],
    tacticFits: [{ tacticId: "t", name: "T", bindings: { 1: A, 3: B }, filled: 2, total: 2, points: 4, unfilled: [], feasible: true, infeasibleReasons: [] }],
  } as unknown as Composition;
  assert.deepEqual(slotMembersOf(composition, "t"), { 1: { memberId: A, nickname: "Rae", agentId: "omen" }, 3: { memberId: B, nickname: "Min", agentId: null } });
  assert.deepEqual(slotMembersOf(composition, "other"), {});
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditTactic, canManageSharedTactics } from "./permissions";

/** 전술 권한 — 개인 전술은 작성자·관리자, 공통 전술은 전술가도. 실행: npm test */

const personal = { authorId: "author", isShared: false };
const shared = { authorId: "author", isShared: true };

test("개인 전술: 작성자와 관리자만 수정, 전술가·일반은 불가", () => {
  assert.equal(canEditTactic(personal, { id: "author", role: "member" }), true);
  assert.equal(canEditTactic(personal, { id: "x", role: "admin" }), true);
  assert.equal(canEditTactic(personal, { id: "x", role: "tactician" }), false);
  assert.equal(canEditTactic(personal, { id: "x", role: "member" }), false);
});

test("공통 전술: 전술가도 수정할 수 있고 일반 멤버는 여전히 불가", () => {
  assert.equal(canEditTactic(shared, { id: "x", role: "tactician" }), true);
  assert.equal(canEditTactic(shared, { id: "x", role: "admin" }), true);
  assert.equal(canEditTactic(shared, { id: "x", role: "member" }), false);
  assert.equal(canEditTactic(shared, { id: "author", role: "member" }), true, "작성자는 티어와 무관하게 수정");
});

test("작성자가 없는(탈퇴) 전술도 관리자는 수정할 수 있다", () => {
  assert.equal(canEditTactic({ authorId: null, isShared: false }, { id: "x", role: "admin" }), true);
  assert.equal(canEditTactic({ authorId: null, isShared: false }, { id: "x", role: "member" }), false);
});

test("공통 전술 관리 권한은 전술가 이상", () => {
  assert.equal(canManageSharedTactics({ role: "admin" }), true);
  assert.equal(canManageSharedTactics({ role: "tactician" }), true);
  assert.equal(canManageSharedTactics({ role: "member" }), false);
});

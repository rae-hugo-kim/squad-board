import { test } from "node:test";
import assert from "node:assert/strict";
import { candidates, cmPer360, compositeScore, edpi, narrow, pxPerCount } from "./sens";

test("eDPI = DPI × 감도, 360° 거리는 eDPI에 반비례한다", () => {
  assert.equal(edpi(800, 0.32), 256);
  const a = cmPer360(800, 0.32);
  const b = cmPer360(1600, 0.32);
  assert.ok(Math.abs(a / b - 2) < 0.01, `${a} vs ${b}`);
  // 800 × 0.32: 360/(0.07×0.32) = 16071 카운트 → /800 인치 × 2.54 ≈ 51.0cm
  assert.equal(a, 51);
});

test("캔버스 px/카운트는 감도에 비례한다", () => {
  assert.ok(Math.abs(pxPerCount(1030, 0.5) / pxPerCount(1030, 0.25) - 2) < 1e-9);
});

test("이분 탐색: A가 나으면 상한을 B로, B가 나으면 하한을 A로 좁힌다", () => {
  const { a, b } = candidates(0.2, 0.8);
  assert.equal(a, 0.4);
  assert.equal(b, 0.6);
  assert.deepEqual(narrow(0.2, 0.8, true), { low: 0.2, high: 0.6 });
  assert.deepEqual(narrow(0.2, 0.8, false), { low: 0.4, high: 0.8 });
  // 5회 반복하면 구간이 (2/3)^5 ≈ 13%로 줄어든다
  let r = { low: 0.2, high: 0.8 };
  for (let i = 0; i < 5; i++) r = narrow(r.low, r.high, i % 2 === 0);
  assert.ok(r.high - r.low < 0.6 * 0.14);
});

test("점수: 더 빨리 맞추고 더 오래 따라가면 높다, 0~1 범위", () => {
  const fast = compositeScore({ hits: 8, seconds: 4, misses: 0 }, { onTargetFraction: 0.8 });
  const slow = compositeScore({ hits: 8, seconds: 10, misses: 4 }, { onTargetFraction: 0.4 });
  assert.ok(fast > slow);
  assert.ok(fast <= 1 && slow >= 0);
});

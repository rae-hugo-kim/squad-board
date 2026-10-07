import { test } from "node:test";
import assert from "node:assert/strict";
import { boardToMeters, DEFAULT_UNITS_PER_BOARD, defaultSizeFor, formatMeters, geometryFor, metersToBoard, objectKindForAbility } from "./ability-geometry";

/** 스킬 실제 크기 환산 — 실행: npm test */

test("미터 ↔ 보드 비율: 1m = 100유닛, 어센트(14286유닛) 기준 오멘 연막 4.1m ≈ 2.87%", () => {
  const r = metersToBoard(4.1, 14286);
  assert.ok(Math.abs(r - 0.0287) < 0.0005, String(r));
  assert.ok(Math.abs(boardToMeters(r, 14286) - 4.1) < 1e-9, "왕복");
  // 스케일이 없으면 기본값으로 근사
  assert.equal(metersToBoard(1, null), metersToBoard(1, DEFAULT_UNITS_PER_BOARD));
  assert.equal(metersToBoard(1, 0), metersToBoard(1, DEFAULT_UNITS_PER_BOARD));
  // 더 넓은 맵(유닛 수가 크면)에서는 같은 미터가 더 작은 비율
  assert.ok(metersToBoard(4.1, 16949) < metersToBoard(4.1, 12820));
  assert.equal(formatMeters(r, 14286), "4.1 m");
  assert.equal(formatMeters(null, 14286), "—");
});

test("geometryFor: 표에 있으면 그 값, 없으면 스킬 유형 기본값, 둘 다 없으면 점", () => {
  assert.deepEqual(geometryFor("omen", "e", "smoke"), { shape: "circle", radiusM: 4.1, confirmed: true });
  assert.equal(geometryFor("sage", "c", "trap").shape, "wall");
  assert.equal(geometryFor("unknown", "q", "smoke").radiusM, 4.1, "유형 기본값");
  assert.equal(geometryFor(null, null, "molly").radiusM, 3);
  assert.equal(geometryFor(null, null, "heal").shape, "point");
});

test("objectKindForAbility: 벽형 스킬은 유형과 무관하게 wall, 나머지는 유형 그대로, 이동·치유·궁극기는 cast", () => {
  assert.equal(objectKindForAbility("sage", "c", "trap"), "wall");
  assert.equal(objectKindForAbility("viper", "e", "smoke"), "wall");
  assert.equal(objectKindForAbility("viper", "q", "smoke"), "smoke");
  assert.equal(objectKindForAbility("omen", "c", "move"), "cast");
  assert.equal(objectKindForAbility(null, null, "flash"), "flash");
  assert.equal(objectKindForAbility(null, null, "ult"), "cast");
});

test("defaultSizeFor: 연막·몰리·정보는 반경, 정보는 각도, 벽은 길이 — 모두 맵 스케일로 환산", () => {
  const u = 14286;
  const smoke = defaultSizeFor("smoke", geometryFor("brimstone", "e", "smoke"), u);
  assert.ok(Math.abs(boardToMeters(smoke.radius!, u) - 4.15) < 1e-9);
  assert.equal(smoke.angle, null);
  assert.equal(smoke.length, null);
  const wall = defaultSizeFor("wall", geometryFor("sage", "c", "trap"), u);
  assert.ok(Math.abs(boardToMeters(wall.length!, u) - 10) < 1e-9);
  assert.equal(wall.radius, null);
  const recon = defaultSizeFor("recon", null, u);
  assert.equal(recon.angle, 70);
  assert.ok(recon.radius! > 0);
  const flash = defaultSizeFor("flash", null, u);
  assert.deepEqual(flash, { radius: null, angle: null, length: null });
  // 시전 요원 없는 일반 벽 핑도 기본 10m
  assert.ok(Math.abs(boardToMeters(defaultSizeFor("wall", null, u).length!, u) - 10) < 1e-9);
});

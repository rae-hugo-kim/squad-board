import { test } from "node:test";
import assert from "node:assert/strict";
import { calloutToBoard, mapAgent, mapMap, slugify, ROLE_BY_EN, ABILITY_KEY_BY_SLOT, unitsPerBoardOf } from "./valorant-api";

/**
 * 공식 에셋 API(valorant-api.com, Riot 게임 데이터 미러) 응답 → 우리 DB 행 변환. 네트워크 없이 고정 응답으로 검사한다.
 */
const agentEn = {
  uuid: "add6443a-41bd-e414-f6ad-e58d267f4e95",
  displayName: "Jett",
  displayIcon: "https://media.valorant-api.com/agents/add6443a/displayicon.png",
  fullPortrait: "https://media.valorant-api.com/agents/add6443a/fullportrait.png",
  isPlayableCharacter: true,
  role: { uuid: "r1", displayName: "Duelist" },
  abilities: [
    { slot: "Ability1", displayName: "Updraft", description: "", displayIcon: "https://media.valorant-api.com/agents/add6443a/abilities/ability1/displayicon.png" },
    { slot: "Ability2", displayName: "Tailwind", description: "", displayIcon: "https://media.valorant-api.com/agents/add6443a/abilities/ability2/displayicon.png" },
    { slot: "Grenade", displayName: "Cloudburst", description: "", displayIcon: "https://media.valorant-api.com/agents/add6443a/abilities/grenade/displayicon.png" },
    { slot: "Ultimate", displayName: "Blade Storm", description: "", displayIcon: "https://media.valorant-api.com/agents/add6443a/abilities/ultimate/displayicon.png" },
    { slot: "Passive", displayName: "Drift", description: "", displayIcon: null },
  ],
};
const agentKo = {
  ...agentEn,
  displayName: "제트",
  role: { uuid: "r1", displayName: "타격대" },
  abilities: agentEn.abilities.map((a) => ({ ...a, displayName: `${a.displayName}-ko` })),
};

test("요원: 영어 이름으로 slug·역할군, 한국어 이름, 슬롯 → c/q/e/x, 아이콘 URL, 패시브 제외", () => {
  const seedKind = { c: "smoke", q: "move", e: "move", x: "ult" } as const;
  const row = mapAgent(agentEn, agentKo, (key) => seedKind[key as keyof typeof seedKind] ?? "other");
  assert.equal(row.slug, "jett");
  assert.equal(row.nameEn, "Jett");
  assert.equal(row.nameKo, "제트");
  assert.equal(row.roleGroup, "duelist");
  assert.equal(row.iconUrl, agentEn.displayIcon);
  assert.deepEqual(
    row.abilities.map((a) => [a.key, a.kind, a.nameKo]),
    [
      ["c", "smoke", "Cloudburst-ko"],
      ["q", "move", "Updraft-ko"],
      ["e", "move", "Tailwind-ko"],
      ["x", "ult", "Blade Storm-ko"],
    ],
  );
  assert.ok(row.abilities.every((a) => a.iconUrl?.endsWith("displayicon.png")));
});

test("요원: slug는 영문 이름을 소문자·영숫자로 (KAY/O → kayo), 모르는 역할군은 null", () => {
  assert.equal(slugify("KAY/O"), "kayo");
  assert.equal(slugify("Brimstone"), "brimstone");
  const row = mapAgent({ ...agentEn, role: { uuid: "x", displayName: "Mystery" } }, agentKo, () => "other");
  assert.equal(row.roleGroup, null);
  assert.equal(ROLE_BY_EN.Controller, "controller");
  assert.equal(ABILITY_KEY_BY_SLOT.Grenade, "c");
});

const mapEn = {
  uuid: "7eaecc1b-4337-bbf6-6ab9-04b8f06b3319",
  displayName: "Ascent",
  tacticalDescription: "A/B Sites",
  displayIcon: "https://media.valorant-api.com/maps/7eaecc1b/displayicon.png",
  splash: "https://media.valorant-api.com/maps/7eaecc1b/splash.png",
  listViewIcon: "https://media.valorant-api.com/maps/7eaecc1b/listviewicon.png",
  xMultiplier: 0.00007,
  yMultiplier: -0.00007,
  xScalarToAdd: 0.813895,
  yScalarToAdd: 0.573242,
  callouts: [
    { regionName: "Garden", superRegionName: "A", location: { x: -2000, y: 4000 } },
    { regionName: "Spawn", superRegionName: "Attacker Side", location: { x: 0, y: 0 } },
  ],
};

test("맵: 콜아웃 좌표는 게임 x/y를 바꿔 넣는다 — 미니맵 x = y×xMultiplier + xScalarToAdd, y = x×yMultiplier + yScalarToAdd", () => {
  const p = calloutToBoard(mapEn, { x: -2000, y: 4000 });
  assert.ok(Math.abs(p.x - (4000 * 0.00007 + 0.813895)) < 1e-9);
  assert.ok(Math.abs(p.y - (-2000 * -0.00007 + 0.573242)) < 1e-9);
});

test("맵: 경쟁 맵(tacticalDescription 있음)만, 미니맵·스플래시·콜아웃을 DB 행으로", () => {
  const row = mapMap(mapEn, { ...mapEn, displayName: "어센트" });
  assert.ok(row);
  assert.equal(row!.slug, "ascent");
  assert.equal(row!.nameKo, "어센트");
  assert.equal(row!.imagePath, mapEn.displayIcon);
  assert.equal(row!.callouts.length, 2);
  assert.equal(row!.callouts[0].name, "Garden");
  assert.equal(row!.callouts[0].region, "A");
  assert.equal(mapMap({ ...mapEn, tacticalDescription: null }, mapEn), null, "사격장 등 비경쟁 맵은 제외");
  assert.equal(mapMap({ ...mapEn, displayIcon: null }, mapEn), null, "미니맵이 없으면 제외");
});

test("맵: 미니맵 폭의 게임 유닛 수는 xMultiplier 역수 (0.00007 → 14286), 값이 없으면 null", () => {
  assert.equal(unitsPerBoardOf(mapEn), 14286);
  assert.equal(unitsPerBoardOf({ xMultiplier: -0.00007 }), 14286, "부호는 축 방향일 뿐이라 절댓값");
  assert.equal(unitsPerBoardOf({ xMultiplier: 0 }), null);
  assert.equal(unitsPerBoardOf({ xMultiplier: Number.NaN }), null);
  assert.equal(mapMap(mapEn, undefined)!.unitsPerBoard, 14286);
});

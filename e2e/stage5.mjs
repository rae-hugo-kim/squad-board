// 실행 전제: e2e/stage1~4.mjs 를 같은 DB에서 먼저 실행한 상태(멤버 Rae·Minseo·Jin·Yuna·Hoon, Rae의 어센트 선호 오멘/브림스톤,
//            Rae의 어센트 개인 전술 "A 러시 v2"), 서버 3100 포트. 시드가 전술가 3명(알파카·벵거·오르페브르)을 만들어 둔다.
// npm run e2e && npm run e2e:stage2 && npm run e2e:stage3 && npm run e2e:stage4 && npm run e2e:stage5
// 5단계 흐름 E2E: 랜딩(오늘의 스쿼드) → 전술가 티어 → 공통 전술·우선도 → 권한 → 오늘의 참가자 → 공통 전술 보드 자동 이동(라인업·포기)
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const PASS = process.env.E2E_PASSCODE ?? "valo1234";
const ADMIN_PASS = process.env.E2E_ADMIN_PASSCODE ?? PASS;
const passFor = (nickname) => (nickname === "Rae" ? ADMIN_PASS : PASS);

const shots = process.env.E2E_SHOTS ?? "e2e/shots";
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("dialog", (d) => d.accept());

function check(cond, label) { console.log(`${cond ? "PASS" : "FAIL"} ${label}`); if (!cond) process.exitCode = 1; }

async function logoutIfNeeded() {
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  if (!page.url().includes("/login")) {
    await page.click("button:has-text('나가기')");
    await page.waitForURL(/\/login/);
  }
}
async function login(nickname) {
  await logoutIfNeeded();
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill("#passcode", passFor(nickname));
  await page.click(`label:has-text('${nickname}')`);
  await page.click("button[type=submit]");
  await page.waitForURL(`${BASE}/`);
}
async function boardPoint(fx, fy) {
  await page.locator("svg[data-board]").scrollIntoViewIfNeeded();
  const box = await page.locator("svg[data-board]").boundingBox();
  const size = Math.min(box.width, box.height);
  return { x: box.x + (box.width - size) / 2 + size * fx, y: box.y + (box.height - size) / 2 + size * fy };
}
async function clickBoard(fx, fy) {
  const p = await boardPoint(fx, fy);
  await page.mouse.click(p.x, p.y);
}
/** 슬롯 n에 역할군(과 설명)을 넣고 저장 */
async function saveSlots(spec) {
  for (const [n, s] of Object.entries(spec)) {
    await page.selectOption(`select[aria-label='슬롯 ${n} 역할군']`, s.role);
    if (s.desc) await page.fill(`input[aria-label='슬롯 ${n} 설명']`, s.desc);
  }
  await page.click("button:has-text('슬롯 저장')");
  await page.waitForSelector("form:has(button:has-text('슬롯 저장')) >> text=저장했습니다");
}

// ----- 랜딩: 로그인 후 "오늘의 스쿼드" -----
await login("Rae");
check((await page.locator("h1:has-text('오늘의 스쿼드')").count()) === 1, "로그인 후 랜딩(오늘의 스쿼드)");
check((await page.locator("nav a:has-text('오늘의 스쿼드')").count()) === 1, "네비에 '오늘의 스쿼드'");
check(await page.locator("[data-today-form] input[name=m][value]").first().isChecked() || (await page.locator("[data-today-form] input[name=m]:checked").count()) === 1, "본인이 기본 체크");
await page.screenshot({ path: `${shots}/11-landing.png` });

// ----- 전술가 티어: 시드 3명 + 관리 화면에서 Minseo 승격 -----
await page.goto(`${BASE}/admin`);
await page.waitForLoadState("networkidle");
for (const n of ["알파카", "벵거", "오르페브르"]) {
  const row = page.locator("tbody tr", { hasText: n });
  check((await row.count()) === 1 && (await row.locator("select[name=role]").inputValue()) === "tactician", `시드 전술가 ${n}`);
}
const minseoRow = page.locator("tbody tr", { hasText: "Minseo" });
await minseoRow.locator("select[name=role]").selectOption("tactician");
await minseoRow.locator("button:has-text('적용')").click();
await page.waitForFunction(() => [...document.querySelectorAll("tbody tr")].some((tr) => tr.textContent.includes("Minseo") && tr.querySelector("select[name=role]")?.value === "tactician"));
check(true, "Minseo → 전술가 승격");

// 랜딩에서는 공통 전술이 없으면 안내 페이지로
await page.goto(`${BASE}/`);
await page.waitForLoadState("networkidle");
for (const n of ["Rae", "Minseo", "Jin", "Yuna", "Hoon"]) await page.check(`[data-today-form] label:has-text('${n}') input[name=m]`);
await page.selectOption("[data-today-form] select[name=map]", "ascent");
await page.click("[data-today-form] button:has-text('공통 전술 보드로')");
await page.waitForURL(/\/today\?/);
await page.waitForLoadState("networkidle");
check((await page.locator("h1:has-text('공통 전술이 없습니다')").count()) === 1, "공통 전술 없음 → 안내 + 편성 계산 링크");
check((await page.locator("a:has-text('이 참가자로 편성 계산')").count()) === 1, "안내에 편성 계산 링크");

// ----- 전술가가 공통 전술을 만든다 (우선도 2, 슬롯 1 전략가만 → 오늘 참가자로 실행 가능) -----
await login("Minseo");
check((await page.locator("header >> text=tactician").count()) === 1, "네비에 tactician 표시");
await page.goto(`${BASE}/tactics/ascent`);
await page.waitForLoadState("networkidle");
check((await page.locator("input[name=isShared]").count()) === 1, "전술가에게 '공통 전술' 체크 표시");
check(!(await page.locator("input[name=isShared]").isChecked()), "공통 전술은 기본 해제(명시적 선택)");
await page.fill("input[name=name]", "공통 A 셋업");
await page.check("input[name=isShared]");
await page.fill("input[name=priority]", "2");
await page.click("button:has-text('전술 만들기')");
await page.waitForURL(/\/tactics\/board\/[0-9a-f-]{36}$/);
await page.waitForLoadState("networkidle");
const sharedUrl = page.url();
const sharedId = sharedUrl.split("/").pop();
check((await page.locator("h1 ~ .badge:has-text('공통 · 우선 2'), .badge:has-text('공통 · 우선 2')").count()) >= 1, "보드 헤더에 '공통 · 우선 2' 배지");
// 슬롯 1 전략가 토큰을 놓아 라인업 이름이 토큰에 얹히는지 뒤에서 확인한다
await page.click("[data-tool=agent]");
await clickBoard(0.5, 0.5);
await page.waitForSelector("[data-save-state=saved]", { timeout: 10000 });
await saveSlots({ 1: { role: "controller", desc: "A 연막" } });
check(true, "공통 전술 슬롯 1(전략가) 저장");

// 전술가는 남의 개인 전술은 못 고친다
await page.goto(`${BASE}/tactics/ascent`);
await page.waitForLoadState("networkidle");
check((await page.locator("tbody tr:has-text('공통 A 셋업') .badge:has-text('공통')").count()) === 1, "목록에 공통 배지");
check((await page.locator("tbody tr").first().innerText()).includes("공통 A 셋업"), "공통 전술이 목록 맨 위");
await page.locator("tbody tr:has-text('A 러시 v2') a:has-text('열기')").click();
await page.waitForURL(/\/tactics\/board\/[0-9a-f-]{36}$/);
await page.waitForLoadState("networkidle");
check((await page.locator("text=읽기 전용").count()) === 1, "전술가도 남의 개인 전술은 읽기 전용");

// 두 번째 공통 전술: 우선도 1, 전략가 2명 필요 → 오늘 참가자(전략가 선호 Rae 1명)로는 실행 불가 → 포기
await page.goto(`${BASE}/tactics/ascent`);
await page.waitForLoadState("networkidle");
await page.fill("input[name=name]", "더블 연막 (우선 1)");
await page.check("input[name=isShared]");
await page.fill("input[name=priority]", "1");
await page.click("button:has-text('전술 만들기')");
await page.waitForURL(/\/tactics\/board\/[0-9a-f-]{36}$/);
await page.waitForLoadState("networkidle");
const doubleId = page.url().split("/").pop();
await saveSlots({ 1: { role: "controller", desc: "A 연막" }, 2: { role: "controller", desc: "B 연막" } });
check(true, "우선도 1 공통 전술(전략가 2명) 저장");

// ----- 권한: 일반 멤버는 공통 전술 읽기 전용, 공통 체크 없음. 관리자는 수정 가능 -----
await login("Jin");
await page.goto(sharedUrl);
await page.waitForLoadState("networkidle");
check((await page.locator("text=읽기 전용").count()) === 1, "일반 멤버: 공통 전술 읽기 전용");
await page.goto(`${BASE}/tactics/ascent`);
await page.waitForLoadState("networkidle");
check((await page.locator("input[name=isShared]").count()) === 0, "일반 멤버: 공통 전술 체크 없음");
await login("Rae");
await page.goto(sharedUrl);
await page.waitForLoadState("networkidle");
check((await page.locator("text=읽기 전용").count()) === 0 && (await page.locator("button:has-text('저장 (Ctrl+S)')").count()) === 1, "관리자: 다른 전술가의 공통 전술 수정 가능");
check((await page.locator("form:has(button:has-text('정보 저장')) input[name=isShared]").count()) === 1, "전술 정보 폼에 공통·우선도 입력");

// ----- 오늘의 스쿼드: 참가자 5명 + 어센트 → 실행 불가(우선 1)는 포기하고 우선 2 공통 전술 보드로 -----
await page.goto(`${BASE}/`);
await page.waitForLoadState("networkidle");
check((await page.locator("[data-today-form] select[name=map] option[value=ascent]").innerText()).includes("(2)"), "맵 선택에 공통 전술 수 (2)");
for (const n of ["Rae", "Minseo", "Jin", "Yuna", "Hoon"]) await page.check(`[data-today-form] label:has-text('${n}') input[name=m]`);
await page.selectOption("[data-today-form] select[name=map]", "ascent");
await page.click("[data-today-form] button:has-text('공통 전술 보드로')");
await page.waitForURL(new RegExp(`/tactics/board/${sharedId}\\?m=`));
await page.waitForLoadState("networkidle");
check(true, "우선도 1(실행 불가)을 건너뛰고 우선도 2 공통 전술 보드로 이동");
check((await page.locator("[data-lineup] h2:has-text('오늘의 라인업')").count()) === 1, "라인업 패널 표시");
check((await page.locator("[data-lineup] .badge:has-text('실행 가능')").count()) === 1, "라인업: 실행 가능 배지");
const slot1 = await page.locator("[data-lineup-slot='1']").innerText();
check(slot1.includes("Rae") && slot1.includes("오멘"), `슬롯 1 → Rae(오멘) (${slot1.replace(/\s+/g, " ")})`);
// SVG <text>는 HTMLElement가 아니라 innerText가 없다 → textContent
check((await page.locator("svg[data-board] [data-lineup-name]").textContent()) === "Rae", "보드 슬롯 1 토큰에 멤버 이름(Rae)");
const alt = page.locator("[data-lineup] a:has-text('더블 연막')");
check((await alt.count()) === 1 && (await alt.getAttribute("title")).includes("실행 불가"), "다른 공통 전술(우선 1)은 실행 불가로 표시");
check((await page.locator("[data-lineup] a:has-text('이 편성으로 세션 시작')").getAttribute("href")).includes(`t=${sharedId}`), "세션 시작 링크가 편성기로 (참가자·전술 유지)");
await page.screenshot({ path: `${shots}/12-lineup-board.png` });

// 포기 권고: 실행 불가 전술 보드를 같은 참가자로 열면 포기 배지
await alt.click();
await page.waitForURL(new RegExp(`/tactics/board/${doubleId}\\?m=`));
await page.waitForLoadState("networkidle");
check((await page.locator("[data-lineup] .badge:has-text('포기 권고')").count()) === 1, "실행 불가 전술: 포기 권고 배지");
check((await page.locator("[data-lineup-slot='2']").innerText()).includes("빈 슬롯"), "채우지 못한 슬롯 2 표시");

// 편성기 카드에도 실행 불가(포기) 표시
await page.goto(`${BASE}/squad?map=ascent&m=` + (await page.evaluate(() => new URLSearchParams(location.search).get("m"))).split(",").join("&m=") + `&t=${doubleId}`);
await page.waitForLoadState("networkidle");
check((await page.locator("article [data-tactic-fit=infeasible] .badge:has-text('포기 권고')").count()) === 1, "편성기 카드: 실행 불가 — 포기 권고");

// 입력 검증: 참가자 없이 /today → 랜딩으로 되돌아오며 안내
await page.goto(`${BASE}/today?map=ascent`);
await page.waitForURL(/\/\?error=/);
await page.waitForLoadState("networkidle");
check((await page.locator("text=참가자를 1명 이상 체크하세요").count()) === 1, "참가자 없음 → 랜딩 안내");

check(errors.length === 0, `브라우저 콘솔 에러 없음 (${errors.length})`);
if (errors.length) console.log(errors);
await browser.close();

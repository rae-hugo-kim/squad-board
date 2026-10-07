// 실행 전제: e2e/stage1~5.mjs 를 같은 DB에서 먼저 실행한 상태(관리자 Rae), 서버 3100 포트.
// npm run e2e && … && npm run e2e:stage5 && npm run e2e:stage6
// 6단계 보드 조작 E2E: 배치 후 선택 모드 자동 복귀(Shift로 연속) → 스킬 실제 크기(미터) → 반경 핸들 → 벽(세이지 방벽) 길이·회전 핸들
//                    → 자유 그리기 → 휠 확대가 페이지를 스크롤하지 않음 → 저장·새로고침 유지
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const PASS = process.env.E2E_PASSCODE ?? "valo1234";
const ADMIN_PASS = process.env.E2E_ADMIN_PASSCODE ?? PASS;

const shots = process.env.E2E_SHOTS ?? "e2e/shots";
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("dialog", (d) => d.accept());

function check(cond, label) { console.log(`${cond ? "PASS" : "FAIL"} ${label}`); if (!cond) process.exitCode = 1; }

async function login(nickname) {
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  if (!page.url().includes("/login")) {
    await page.click("button:has-text('나가기')");
    await page.waitForURL(/\/login/);
  }
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill("#passcode", nickname === "Rae" ? ADMIN_PASS : PASS);
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
async function dragBy(locator, dx, dy) {
  const b = await locator.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
}
const objectCount = () => page.locator("svg[data-board] [data-object]").count();
const pressed = (sel) => page.locator(sel).getAttribute("aria-pressed");

await login("Rae");
await page.goto(`${BASE}/tactics/bind`);
await page.waitForLoadState("networkidle");
await page.fill("input[name=name]", "보드 조작");
await page.click("button:has-text('전술 만들기')");
await page.waitForURL(/\/tactics\/board\/[0-9a-f-]{36}$/);
await page.waitForLoadState("networkidle");
const boardUrl = page.url();
check((await page.locator("[data-tool-hint]").innerText()).includes("선택 / 이동"), "보드 위 도구 안내 칩");

// 배치 후 선택 모드 자동 복귀
await page.click("[data-tool=smoke]");
check((await pressed("[data-tool=smoke]")) === "true", "연막 도구 선택");
await clickBoard(0.3, 0.3);
check((await objectCount()) === 1, "연막 배치");
check((await pressed("[data-tool=select]")) === "true" && (await pressed("[data-tool=smoke]")) === "false", "배치 후 '선택 / 이동'으로 자동 복귀");
check((await page.locator("[data-tool-hint]").innerText()).includes("연막 선택됨"), "안내 칩: 연막 선택됨");
check((await page.locator("[data-radius-m]").innerText()) === "4.1 m", "요원 미지정 연막 기본 반경 4.1 m (미터 표기)");

// 반경 핸들 드래그 → 반경 증가
await dragBy(page.locator("[data-handle=radius]"), 40, 0);
const r1 = parseFloat(await page.locator("[data-radius-m]").innerText());
check(r1 > 4.1, `반경 핸들 드래그로 반경 증가 (${r1} m)`);
check((await objectCount()) === 1, "핸들 드래그는 새 객체를 만들지 않음");

// Shift+클릭이면 같은 도구 유지
await page.click("[data-tool=flash]");
// page.mouse.click은 modifiers를 받지 않으므로 키보드로 Shift를 누른 채 클릭한다
await page.keyboard.down("Shift");
await clickBoard(0.6, 0.3);
await page.keyboard.up("Shift");
check((await objectCount()) === 2 && (await pressed("[data-tool=flash]")) === "true", "Shift+클릭: 섬광 배치 후 도구 유지");
await clickBoard(0.7, 0.3);
check((await objectCount()) === 3 && (await pressed("[data-tool=select]")) === "true", "일반 클릭: 배치 후 선택 모드");

// 바이퍼 Q(독구름) → 반경 4.5 m (공식 수치)
const viperId = await page.locator("[data-agent]", { has: page.locator("[title='바이퍼']") }).first().getAttribute("data-agent");
await page.click(`[data-agent="${viperId}"]`);
await page.click(`[data-ability="${viperId}:q"]`);
check((await page.locator("[data-tool-hint]").innerText()).includes("4.5m"), "안내 칩에 스킬 기준 반경 4.5m");
await clickBoard(0.5, 0.5);
check((await objectCount()) === 4 && (await page.locator("[data-radius-m]").innerText()) === "4.5 m", "바이퍼 독구름 반경 4.5 m");

// 세이지 C(방벽 구슬) → 벽 객체, 길이 10 m, 끝 핸들로 길이·회전
const sageId = await page.locator("[data-agent]", { has: page.locator("[title='세이지']") }).first().getAttribute("data-agent");
await page.click(`[data-agent="${sageId}"]`);
await page.click(`[data-ability="${sageId}:c"]`);
check((await pressed("[data-tool=wall]")) !== "true" && (await page.locator("[data-tool-hint]").innerText()).includes("방벽"), "세이지 방벽 → 벽 도구 (안내 칩)");
await clickBoard(0.4, 0.7);
check((await objectCount()) === 5, "벽 배치");
check((await page.locator("aside span.font-bold:has-text('벽 / 장막')").count()) === 1, "속성 패널 '벽 / 장막'");
check((await page.locator("[data-length-m]").innerText()) === "10.0 m", "방벽 기본 길이 10.0 m");
check((await page.locator("[data-handle='end-a']").count()) === 1 && (await page.locator("[data-handle='end-b']").count()) === 1, "벽 양 끝 핸들");
await dragBy(page.locator("[data-handle='end-b']"), 60, 40);
const len = parseFloat(await page.locator("[data-length-m]").innerText());
const rot = await page.locator("input[aria-label='회전(도)']").inputValue();
check(len > 10 && Number(rot) > 0, `끝 핸들 드래그로 길이·회전 변경 (${len} m, ${rot}°)`);
check((await objectCount()) === 5, "벽 핸들 드래그는 객체 수 유지");

// 자유 그리기 (드래그) — 색 선택 후 그리면 선택 모드로
await page.click("[data-tool=draw]");
await page.click("[data-draw-color='#ff4655']");
const a = await boardPoint(0.15, 0.15);
const b = await boardPoint(0.45, 0.35);
await page.mouse.move(a.x, a.y);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 10, a.y + ((b.y - a.y) * i) / 10 + Math.sin(i) * 12);
await page.mouse.up();
check((await objectCount()) === 6, "자유 그리기 완성 → 객체 추가");
check((await pressed("[data-tool=select]")) === "true", "그리기 후 선택 모드 복귀");
check((await page.locator("aside span.font-bold:has-text('자유 그리기')").count()) === 1, "속성 패널 '자유 그리기' (색 견본)");
await page.keyboard.press("d");
check((await pressed("[data-tool=draw]")) === "true", "단축키 D → 그리기 도구");
await page.keyboard.press("v");
check((await pressed("[data-tool=select]")) === "true", "단축키 V → 선택 도구");

// 휠 확대: 페이지는 스크롤되지 않고 배율만 바뀐다
await page.evaluate(() => window.scrollTo(0, 0));
const c = await boardPoint(0.5, 0.5);
await page.mouse.move(c.x, c.y);
await page.mouse.wheel(0, 240);
await page.waitForTimeout(300);
const scrollY = await page.evaluate(() => window.scrollY);
const zoom = await page.locator("[data-zoom]").innerText();
check(scrollY === 0 && zoom !== "100%", `휠: 페이지 스크롤 0, 배율 ${zoom}`);
await page.click("[data-zoom]");

// 저장·새로고침 유지 (길이 컬럼 포함)
await page.click("button:has-text('저장 (Ctrl+S)')");
await page.waitForSelector("[data-save-state=saved]", { timeout: 10000 });
await page.screenshot({ path: `${shots}/13-board-tools.png` });
await page.reload();
await page.waitForLoadState("networkidle");
check((await objectCount()) === 6, "새로고침 후 객체 6개 유지");
check((await page.locator("svg[data-board] polyline").count()) >= 1, "자유 그리기 선 유지");
check(page.url() === boardUrl, "같은 보드");

check(errors.length === 0, `브라우저 콘솔 에러 없음 (${errors.length})`);
if (errors.length) console.log(errors);
await browser.close();

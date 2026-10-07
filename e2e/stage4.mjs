// 실행 전제: 서버 3100 포트, 멤버 Rae 존재 (stage1 이후면 됨). 마지막 로그인 상태와 무관하게 Rae로 다시 입장한다.
// 4단계 흐름 E2E: 유틸 — 감도 저장·360°, 크로스헤어 코드 저장·표시, 감도 찾기 시작/중단, 외부 링크
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const ADMIN_PASS = process.env.E2E_ADMIN_PASSCODE ?? process.env.E2E_PASSCODE ?? "valo1234";
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
function check(cond, label) { console.log(`${cond ? "PASS" : "FAIL"} ${label}`); if (!cond) process.exitCode = 1; }

await page.goto(`${BASE}/prefs`);
await page.waitForLoadState("networkidle");
if (!page.url().includes("/login")) {
  await page.click("button:has-text('나가기')");
  await page.waitForURL(/\/login/);
}
await page.goto(`${BASE}/login`);
await page.waitForLoadState("networkidle");
await page.fill("#passcode", ADMIN_PASS);
await page.click("label:has-text('Rae')");
await page.click("button[type=submit]");
await page.waitForURL(`${BASE}/`);

await page.goto(`${BASE}/tools`);
await page.waitForLoadState("networkidle");
check((await page.locator("h1:has-text('유틸')").count()) === 1, "유틸 페이지");

// 내 감도 저장 → eDPI·360°
await page.fill("input[name=dpi]", "800");
await page.fill("input[name=sens]", "0.32");
await page.click("button:has-text('감도 저장')");
await page.waitForSelector("form:has(input[name=dpi]) >> text=저장했습니다");
await page.reload();
await page.waitForLoadState("networkidle");
check((await page.locator("text=360° 회전 51cm").count()) === 1, "360° 회전 거리 51cm");
const raeRow = await page.locator("tbody tr", { hasText: "Rae" }).innerText();
check(raeRow.includes("256") && raeRow.includes("51cm"), `비교표 Rae eDPI 256 · 51cm (${raeRow.replace(/\s+/g, " ")})`);

// 크로스헤어 코드
await page.fill("#crosshair", "0;P;c;5;h;0;0t;1;0l;3;0o;2;0a;1;0f;0;1b;0");
await page.click("button:has-text('코드 저장')");
await page.waitForSelector("form:has(#crosshair) >> text=저장했습니다");
await page.reload();
await page.waitForLoadState("networkidle");
check((await page.inputValue("#crosshair")).startsWith("0;P;c;5"), "크로스헤어 코드 저장·로드");
check((await page.locator("tbody tr:has-text('Rae') code").count()) === 1, "비교표에 코드 표시");
check((await page.locator("tbody tr:has-text('Rae') button:has-text('복사')").count()) === 1, "복사 버튼");

// 감도 찾기 시작 → 라운드 안내 → 중단
check((await page.locator("canvas[aria-label='조준 테스트 캔버스']").count()) === 1, "조준 테스트 캔버스");
const lowVal = await page.inputValue("input.font-mono >> nth=1");
check(Math.abs(Number(lowVal) - 0.192) < 0.001, `시작 구간 하한 = 현재 감도 × 0.6 (${lowVal})`);
await page.click("button:has-text('테스트 시작')");
await page.getByText("1/5 라운드", { exact: false }).waitFor({ timeout: 15000 });
check(true, "테스트 시작 → 1/5 라운드 안내");
check((await page.locator("text=구간 0.192–0.448").count()) === 1, "구간·후보 표시");
// 포인터 잠금 중에는 클릭이 캔버스로 가므로(실사용은 Esc) 잠금을 풀고 중단한다
await page.evaluate(() => document.exitPointerLock());
await page.waitForTimeout(300);
await page.click("button:has-text('중단')");
await page.waitForSelector("button:has-text('테스트 시작')");
check(true, "중단 → 대기 상태");

// 외부 링크
check((await page.locator("a[target=_blank]:has-text('Lineups Valorant')").count()) >= 1, "외부 링크 Lineups Valorant");
check((await page.locator("a[target=_blank]:has-text('Valoplant')").count()) >= 1, "외부 링크 Valoplant");

check(errors.length === 0, `브라우저 콘솔 에러 없음 (${errors.length})`);
if (errors.length) console.log(errors);
await browser.close();

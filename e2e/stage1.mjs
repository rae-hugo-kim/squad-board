// 실행 전제: 빈 DB(npm run db:setup 직후, 관리자 닉네임 Rae, 패스코드 valo1234)에 서버가 3100 포트로 떠 있어야 한다.
// npm run build && npm run start -- -p 3100  →  npm run e2e
// 1단계 흐름 E2E 점검: 입장 → 선호 저장 → 매트릭스 반영 → 관리자 멤버 추가 → 맵 풀 토글 → 나가기
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const shots = process.env.E2E_SHOTS ?? "e2e/shots";
import { mkdirSync } from "node:fs";
mkdirSync(shots, { recursive: true });
// PW_CHROMIUM 환경 변수로 브라우저 경로를 지정할 수 있다 (없으면 Playwright 기본 설치 경로)
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

function check(cond, label) { console.log(`${cond ? "PASS" : "FAIL"} ${label}`); if (!cond) process.exitCode = 1; }

await page.goto(`${BASE}/prefs/ascent`);
check(page.url().includes("/login?next=%2Fprefs%2Fascent"), "비로그인 → /login 리다이렉트 + next");
await page.waitForLoadState("networkidle"); // 하이드레이션 완료 후 상호작용
await page.screenshot({ path: `${shots}/01-login.png` });

// 틀린 패스코드
await page.fill("#passcode", "wrong");
await page.click("label:has-text('Rae')");
await page.click("button[type=submit]");
await page.waitForSelector("text=패스코드가 틀렸습니다");
check(true, "틀린 패스코드 에러 표시");

await page.fill("#passcode", "valo1234");
await page.click("button[type=submit]");
await page.waitForURL(`${BASE}/prefs/ascent`);
check(true, "로그인 후 next 경로로 이동");
await page.screenshot({ path: `${shots}/02-prefs-empty.png` });

// 선호 저장
await page.selectOption("select[name=agent1Id]", { label: "오멘" });
await page.selectOption("select[name=agent2Id]", { label: "브림스톤" });
await page.fill("#attackPosition", "A 메인 후방 · 연막 후 진입");
await page.fill("#defensePosition", "A 사이트 앵커");
await page.click("label:has(input[name=confidence][value='5'])");
await page.fill("#memo", "카타콤 연막 라인업 3개");
await page.click("form:has(input[name=mapId]) button[type=submit]");
await page.waitForSelector("text=저장했습니다");
await page.reload();
const row = await page.locator("tbody tr", { hasText: "Rae" }).innerText();
check(row.includes("오멘") && row.includes("브림스톤") && row.includes("A 사이트 앵커"), "매트릭스에 저장값 반영");
// 같은 값으로 한 번 더 저장(폼 리셋 버그 회귀 확인) → 값이 유지돼야 한다
check((await page.inputValue("select[name=agent1Id]")) !== "", "리로드 후 폼에 기존 값 로드");
await page.click("form:has(input[name=mapId]) button[type=submit]");
await page.waitForSelector("text=저장했습니다");
check((await page.inputValue("select[name=agent1Id]")) !== "", "저장 직후 DOM select 값 유지");
await page.click("form:has(input[name=mapId]) button[type=submit]");
await page.waitForTimeout(1500);
await page.reload();
const row2 = await page.locator("tbody tr", { hasText: "Rae" }).innerText();
check(row2.includes("오멘") && row2.includes("브림스톤"), "연속 저장 후에도 값 유지");
await page.screenshot({ path: `${shots}/03-prefs-saved.png` });

// 감도
await page.fill("input[name=dpi]", "800");
await page.fill("input[name=sens]", "0.32");
await page.waitForSelector("text=256");
await page.click("button:has-text('감도 저장')");
await page.waitForSelector("form:has(input[name=dpi]) >> text=저장했습니다");
check(true, "감도 저장");

// 다른 맵으로 이동 시 폼 초기화
await page.click("a:has-text('바인드')");
await page.waitForURL(`${BASE}/prefs/bind`);
const a1 = await page.inputValue("select[name=agent1Id]");
check(a1 === "", "맵 전환 시 폼 초기화");

// 관리자
await page.click("a:has-text('관리')");
await page.waitForURL(`${BASE}/admin`);
await page.fill("input[name=nickname]", "Minseo");
await page.click("button:has-text('추가')");
await page.waitForSelector("tbody tr:has-text('Minseo')");
check(true, "멤버 추가");
await page.fill("input[name=nickname]", "Minseo");
await page.click("button:has-text('추가')");
await page.waitForSelector("text=이미 있는 닉네임입니다");
check(true, "중복 닉네임 거부");

const bindForm = page.locator("form", { hasText: "BIND" });
await bindForm.locator("button").click();
await page.waitForSelector("form:has-text('BIND') button:has-text('풀에 추가')");
check(true, "맵 풀 토글");
await bindForm.locator("button").click();
await page.waitForSelector("form:has-text('BIND') button:has-text('풀에서 제외')");
await page.screenshot({ path: `${shots}/04-admin.png` });

// 자기 자신 비활성화 버튼 비활성
const selfBtn = page.locator("tbody tr:has-text('Rae') button:has-text('비활성화')");
check(await selfBtn.isDisabled(), "자기 자신 비활성화 금지");

// 로그아웃
await page.click("button:has-text('나가기')");
await page.waitForURL(/\/login/);
check(true, "나가기 → /login");
await page.goto(`${BASE}/login`);
await page.waitForLoadState("networkidle");
check(await page.locator("label:has-text('Minseo')").count() === 1, "새 멤버가 입장 목록에 표시");

check(errors.length === 0, `브라우저 콘솔 에러 없음 (${errors.length})`);
if (errors.length) console.log(errors);
await browser.close();

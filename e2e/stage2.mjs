// 실행 전제: e2e/stage1.mjs 를 같은 DB에서 먼저 실행한 상태(관리자 Rae가 어센트 선호를 저장했고 멤버 Minseo가 있음),
// 서버가 3100 포트로 떠 있어야 한다. 패스코드 valo1234.
// npm run build && npm run start -- -p 3100  →  npm run e2e && npm run e2e:stage2
// 2단계 흐름 E2E 점검: 편성 계산 → 수동 조정 → 세션 시작 → 경기 결과 저장 → 확정 → 경기 추가 → 통계 → 수동 세션 → 권한
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const shots = process.env.E2E_SHOTS ?? "e2e/shots";
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

function check(cond, label) { console.log(`${cond ? "PASS" : "FAIL"} ${label}`); if (!cond) process.exitCode = 1; }

async function login(nickname) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill("#passcode", "valo1234");
  await page.click(`label:has-text('${nickname}')`);
  await page.click("button[type=submit]");
  await page.waitForURL(`${BASE}/prefs/**`);
}

await login("Rae");

// 네비: 2단계 메뉴 활성, 3단계 비활성
check((await page.locator("nav a:has-text('스쿼드 편성')").count()) === 1, "네비 '스쿼드 편성' 활성 링크");
check((await page.locator("nav a:has-text('세션 기록')").count()) === 1, "네비 '세션 기록' 활성 링크");
check((await page.locator("nav span[aria-disabled]:has-text('전술 보드')").count()) === 1, "네비 '전술 보드' 비활성");

// 참가자 5명을 만들기 위해 멤버 3명 추가 (stage1이 Minseo를 만들어 둠)
await page.goto(`${BASE}/admin`);
await page.waitForLoadState("networkidle");
for (const n of ["Jin", "Yuna", "Hoon"]) {
  await page.fill("input[name=nickname]", n);
  await page.click("button:has-text('추가')");
  await page.waitForSelector(`tbody tr:has-text('${n}')`);
}
check(true, "멤버 3명 추가 (총 5명)");

// 편성기: 초기 안내 → 계산
await page.goto(`${BASE}/squad`);
await page.waitForLoadState("networkidle");
check((await page.locator("text=조합 계산을 누르세요").count()) === 1, "편성기 초기 안내");
await page.selectOption("#map", { label: "어센트" });
for (const n of ["Rae", "Minseo", "Jin", "Yuna", "Hoon"]) await page.check(`label:has-text('${n}') input[name=m]`);
await page.click("button:has-text('조합 계산')");
await page.waitForSelector("article:has-text('1안')");
check(page.url().includes("/squad?map=ascent&m="), "GET 폼 → URL에 맵·참가자 유지");
check((await page.locator("article").count()) === 1, "참가 5명 → 조합 1개");
const raeRow = page.locator("article tr", { hasText: "Rae" });
const raeAgentLabel = await raeRow.locator("select").evaluate((el) => el.options[el.selectedIndex].text);
check(raeAgentLabel === "오멘", `Rae에게 1순위 오멘 배정 (${raeAgentLabel})`);
check((await page.locator("article li:has-text('선호 미입력')").count()) === 4, "선호 미입력 멤버 4명 경고");
check((await page.locator("article li:has-text('척후대 0명')").count()) === 1, "척후대 규칙 미달 경고");
await page.screenshot({ path: `${shots}/05-squad.png` });

// 수동 조정: Minseo에게 제트 → 즉시 재계산 표시
await page.locator("article tr", { hasText: "Minseo" }).locator("select").selectOption({ label: "제트" });
await page.waitForSelector("text=수동 조정됨");
check(true, "요원 수동 조정 시 재계산 표시");
const minseoSelects = page.locator("article tr", { hasText: "Jin" }).locator("select option[value]:not([value=''])");
check((await minseoSelects.evaluateAll((os) => os.filter((o) => o.textContent === "제트" && o.disabled).length)) === 1, "이미 고른 요원은 다른 멤버 목록에서 비활성");

// 세션 시작
await page.fill("input[name=date]", "2026-10-07");
await page.click("button:has-text('이 조합으로 세션 시작')");
await page.waitForURL(/\/sessions\/[0-9a-f-]{36}$/);
const sessionUrl = page.url();
check(true, "편성 확정 → 세션 상세로 이동");
await page.waitForLoadState("networkidle");
check((await page.locator("article h3:has-text('ASCENT')").count()) === 1, "1경기 ASCENT 생성");
const editorRae = page.locator("article tr", { hasText: "Rae" }).locator("select");
check((await editorRae.evaluate((el) => el.options[el.selectedIndex].text)) === "오멘", "경기 멤버 행에 요원 스냅샷(오멘)");
const editorMinseo = page.locator("article tr", { hasText: "Minseo" }).locator("select");
check((await editorMinseo.evaluate((el) => el.options[el.selectedIndex].text)) === "제트", "수동 조정한 요원(제트)이 스냅샷에 반영");
check(await page.locator("button:has-text('확정')").first().isDisabled(), "결과 없는 경기는 확정 버튼 비활성");

// 결과·스코어·킬 저장
await page.click("article label:has(input[aria-label='승'])");
await page.fill("input[name=scoreAlly]", "13");
await page.fill("input[name=scoreEnemy]", "9");
await page.fill("input[aria-label='Rae 킬']", "20");
await page.fill("input[aria-label='Rae 데스']", "12");
await page.click("button:has-text('경기 저장')");
await page.waitForSelector("text=저장했습니다");
await page.reload();
await page.waitForLoadState("networkidle");
check((await page.locator("article header:has-text('13:9')").count()) === 1, "스코어 저장·표시");
check((await page.inputValue("input[aria-label='Rae 킬']")) === "20", "킬 저장");
check((await page.locator("article header .badge:has-text('승')").count()) === 1, "결과 '승' 배지");
await page.screenshot({ path: `${shots}/06-session.png` });

// 확정
await page.click("button:has-text('확정')");
await page.waitForSelector("article header .badge:has-text('확정')");
check((await page.locator("button:has-text('확정 해제')").count()) === 1, "확정 후 관리자에게 '확정 해제' 표시");
check((await page.locator("button:has-text('경기 저장')").count()) === 1, "관리자는 확정 뒤에도 수정 가능");

// 경기 추가 (바인드, 참가자 5명 기본 선택)
await page.selectOption("#add-map", { label: "바인드" });
check((await page.locator("text=출전 멤버 (5/5)").count()) === 1, "경기 추가 폼: 참가자 5명 기본 선택");
await page.click("button:has-text('경기 추가')");
await page.waitForSelector("article h3:has-text('BIND')");
check((await page.locator("article").count()) === 2, "2경기 BIND 추가");
const bind = page.locator("article", { hasText: "BIND" });
await bind.locator("label:has(input[aria-label='패'])").click();
await bind.locator("button:has-text('경기 저장')").click();
await bind.locator("text=저장했습니다").waitFor();
check(true, "2경기 결과 패 저장");

// 세션 정보 수정
await page.click("summary:has-text('세션 정보 수정')");
await page.fill("#edit-memo", "첫 2단계 세션");
await page.click("button:has-text('세션 저장')");
await page.waitForSelector("text=저장했습니다");
await page.reload();
await page.waitForLoadState("networkidle");
check((await page.locator("text=첫 2단계 세션").count()) >= 1, "세션 메모 수정 반영");

// 목록·통계
await page.goto(`${BASE}/sessions`);
await page.waitForLoadState("networkidle");
const row = page.locator("tbody tr", { hasText: "2026-10-07" });
const rowText = await row.innerText();
check(rowText.includes("2경기") && rowText.includes("1승") && rowText.includes("1패") && rowText.includes("확정 1"), `목록 요약: ${rowText.replace(/\s+/g, " ")}`);
await page.goto(`${BASE}/sessions/stats`);
await page.waitForLoadState("networkidle");
check((await page.locator("tbody tr:has-text('ASCENT')").count()) === 1 && (await page.locator("tbody tr:has-text('BIND')").count()) === 1, "맵별 통계에 ASCENT·BIND");
const raeCard = page.locator("article", { hasText: "Rae" }).first();
const raeCardText = await raeCard.innerText();
check(raeCardText.includes("2경기") && raeCardText.includes("오멘") && raeCardText.includes("50%"), `멤버별 통계 Rae: 2경기·오멘·50%`);
await page.screenshot({ path: `${shots}/07-stats.png` });

// 수동 세션 생성
await page.goto(`${BASE}/sessions`);
await page.waitForLoadState("networkidle");
await page.fill("#new-date", "2026-10-01");
await page.click("form:has(#new-date) label:has-text('Rae')");
await page.click("form:has(#new-date) label:has-text('Jin')");
await page.fill("#new-memo", "수동 세션");
await page.click("button:has-text('세션 만들기')");
await page.waitForURL(/\/sessions\/[0-9a-f-]{36}$/);
await page.waitForLoadState("networkidle");
check((await page.locator("text=아직 경기가 없습니다").count()) === 1, "수동 세션 생성 → 빈 상세");
check((await page.locator("text=출전 멤버 (2/5)").count()) === 1, "참가자 2명이 경기 추가 폼에 기본 선택");

// 권한: 일반 멤버는 확정 경기 수정·삭제 불가, 세션 삭제 버튼 없음
await page.click("button:has-text('나가기')");
await page.waitForURL(/\/login/);
await login("Minseo");
await page.goto(sessionUrl);
await page.waitForLoadState("networkidle");
const ascent = page.locator("article", { hasText: "ASCENT" });
check((await ascent.locator("text=확정된 경기입니다").count()) === 1, "일반 멤버: 확정 경기 읽기 전용 안내");
check((await ascent.locator("button:has-text('삭제')").count()) === 0, "일반 멤버: 확정 경기 삭제 버튼 없음");
check((await ascent.locator("button:has-text('확정 해제')").count()) === 0, "일반 멤버: 확정 해제 버튼 없음");
check((await page.locator("button:has-text('세션 삭제')").count()) === 0, "일반 멤버: 세션 삭제 버튼 없음");
check((await page.locator("article", { hasText: "BIND" }).locator("button:has-text('경기 저장')").count()) === 1, "일반 멤버: 미확정 경기는 수정 가능");

check(errors.length === 0, `브라우저 콘솔 에러 없음 (${errors.length})`);
if (errors.length) console.log(errors);
await browser.close();

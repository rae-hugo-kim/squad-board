// 실행 전제: e2e/stage1.mjs → e2e/stage2.mjs 를 같은 DB에서 먼저 실행한 상태(멤버 5명, Rae의 어센트 선호 오멘), 서버 3100 포트.
// npm run e2e && npm run e2e:stage2 && npm run e2e:stage3
// 3단계 흐름 E2E: 전술 생성 → 보드 편집(핑·토큰·경로·자동 저장·드래그·삭제) → 단계 추가 → 슬롯 → PNG → 복제·삭제 → 겹쳐보기 → 필터
//               → 편성기 전술 슬롯 점수·바인딩 → 경기 사용 전술 → 전술별 승률 → 권한(읽기 전용)
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const PASS = process.env.E2E_PASSCODE ?? "valo1234";
const ADMIN_PASS = process.env.E2E_ADMIN_PASSCODE ?? PASS;
/** Rae는 시드 관리자 — 관리자 패스코드로 입장한다 */
const passFor = (nickname) => (nickname === "Rae" ? ADMIN_PASS : PASS);

const shots = process.env.E2E_SHOTS ?? "e2e/shots";
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("dialog", (d) => d.accept());

function check(cond, label) { console.log(`${cond ? "PASS" : "FAIL"} ${label}`); if (!cond) process.exitCode = 1; }

async function logoutIfNeeded() {
  await page.goto(`${BASE}/prefs`);
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
  await page.waitForURL(`${BASE}/prefs/**`);
}
/** 보드 SVG 위의 (fx, fy) 비율 위치를 클릭 */
async function boardPoint(fx, fy) {
  const box = await page.locator("svg[data-board]").boundingBox();
  const size = Math.min(box.width, box.height);
  const ox = box.x + (box.width - size) / 2;
  const oy = box.y + (box.height - size) / 2;
  return { x: ox + size * fx, y: oy + size * fy };
}
async function clickBoard(fx, fy) {
  const p = await boardPoint(fx, fy);
  await page.mouse.click(p.x, p.y);
}
const objectCount = () => page.locator("svg[data-board] [data-object]").count();

await login("Rae");
check((await page.locator("nav a:has-text('전술 보드')").count()) === 1, "네비 '전술 보드' 활성");
check((await page.locator("nav a:has-text('유틸')").count()) === 1, "네비 '유틸' 활성");

// 목록 → 첫 맵 리다이렉트, 빈 상태
await page.goto(`${BASE}/tactics`);
await page.waitForURL(`${BASE}/tactics/ascent`);
await page.waitForLoadState("networkidle");
check((await page.locator("text=아직 이 맵의 전술이 없습니다").count()) === 1, "전술 목록 빈 상태");

// 새 전술
await page.fill("input[name=name]", "A 러시");
await page.selectOption("select[name=side]", "attack");
await page.selectOption("select[name=roundType]", "fullbuy");
await page.fill("input[name=tags]", "러시, 더블연막");
await page.click("button:has-text('전술 만들기')");
await page.waitForURL(/\/tactics\/board\/[0-9a-f-]{36}$/);
await page.waitForLoadState("networkidle");
const boardUrl = page.url();
const tacticId = boardUrl.split("/").pop();
check((await page.locator("h1:has-text('A 러시')").count()) === 1, "보드 열림 (제목)");
check((await page.locator("[role=tab]:has-text('1. 셋업')").count()) === 1, "단계 1 '셋업' 탭");
check((await page.locator("text=변경 없음").count()) === 1, "초기 저장 상태 '변경 없음'");

// 연막 핑 추가 + 속성
await page.click("[data-tool=smoke]");
await clickBoard(0.4, 0.3);
check((await objectCount()) === 1, "연막 핑 추가");
check((await page.locator("aside span.font-bold:has-text('연막')").count()) === 1, "속성 패널에 '연막' 표시");
await page.locator("aside select").nth(0).selectOption({ label: "오멘" }); // 시전 요원
await page.locator("aside select").nth(1).selectOption({ index: 1 }); // 첫 스킬
await page.fill("aside input[placeholder='https://']", "https://easylineup.gg/");
check((await page.locator("a:has-text('라인업 링크 열기')").count()) === 1, "외부 라인업 링크 표시");

// 요원 토큰 (슬롯 1, 아군)
await page.click("[data-tool=agent]");
await clickBoard(0.5, 0.6);
check((await objectCount()) === 2, "요원 토큰 추가");
// 아군 경로: 3점 + 더블클릭
await page.click("[data-tool=path_ally]");
await clickBoard(0.5, 0.8);
await clickBoard(0.5, 0.65);
const last = await boardPoint(0.42, 0.45);
await page.mouse.dblclick(last.x, last.y);
check((await objectCount()) === 3, "아군 경로 추가 (더블클릭 완성)");
// 타이밍 라벨
await page.click("[data-tool=timing]");
await clickBoard(0.7, 0.7);
await page.fill("aside input[maxlength='40']", "0:15");
check((await objectCount()) === 4, "타이밍 라벨 추가");
check((await page.locator("text=변경됨").count()) === 1, "변경됨 상태");
await page.waitForSelector("[data-save-state=saved]", { timeout: 10000 });
check(true, "자동 저장 완료");
await page.screenshot({ path: `${shots}/08-board.png` });
await page.reload();
await page.waitForLoadState("networkidle");
check((await objectCount()) === 4, "새로고침 후 객체 4개 유지 (저장 확인)");

// 드래그 이동: 선택 도구로 토큰을 끌어 옮긴다
await page.click("button:has-text('선택 / 이동')");
const token = page.locator("svg[data-board] [data-object]").nth(1);
const before = await token.boundingBox();
await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
await page.mouse.down();
await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 + 40, { steps: 5 });
await page.mouse.up();
const after = await page.locator("svg[data-board] [data-object]").nth(1).boundingBox();
check(Math.abs(after.x - before.x - 60) < 8 && Math.abs(after.y - before.y - 40) < 8, `드래그 이동 (${Math.round(after.x - before.x)}, ${Math.round(after.y - before.y)})`);

// 선택 + Delete
await page.keyboard.press("Delete");
check((await objectCount()) === 3, "Delete 키로 선택 객체 삭제");
await page.click("button:has-text('저장 (Ctrl+S)')");
await page.waitForSelector("[data-save-state=saved]");

// 단계 추가 (복사)
await page.click("button:has-text('+ 단계 추가')");
await page.waitForSelector("[role=tab]:has-text('2. 단계 2')");
await page.click("[role=tab]:has-text('2. 단계 2')");
check((await objectCount()) === 3, "새 단계는 이전 단계를 복사해 시작");

// 슬롯 저장
await page.selectOption("select[aria-label='슬롯 1 역할군']", "controller");
await page.fill("input[aria-label='슬롯 1 설명']", "A 메인 연막");
await page.fill("input[aria-label='슬롯 1 포지션 힌트']", "A 메인");
await page.selectOption("select[aria-label='슬롯 2 역할군']", "initiator");
await page.selectOption("select[aria-label='슬롯 3 역할군']", "duelist");
await page.click("button:has-text('슬롯 저장')");
await page.waitForSelector("form:has(button:has-text('슬롯 저장')) >> text=저장했습니다");
check(true, "슬롯 저장");

// 메타 수정
await page.click("[role=tab]:has-text('1. 셋업')");
await page.fill("form:has(button:has-text('정보 저장')) input[name=name]", "A 러시 v2");
await page.click("button:has-text('정보 저장')");
await page.waitForSelector("form:has(button:has-text('정보 저장')) >> text=저장했습니다");
await page.reload();
await page.waitForLoadState("networkidle");
check((await page.locator("h1:has-text('A 러시 v2')").count()) === 1, "전술 이름 수정 반영");

// PNG 내보내기
// headless Chromium은 blob URL 다운로드의 파일명을 "download"로 보고하므로 파일 내용(PNG 시그니처)으로 확인한다
const [download] = await Promise.all([page.waitForEvent("download"), page.click("button:has-text('PNG 저장')")]);
const pngBuf = readFileSync(await download.path());
check(pngBuf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" && pngBuf.length > 10000, `PNG 다운로드 (${pngBuf.length} bytes)`);

// 복제 → 새 보드, 삭제 → 목록
await page.click("header + div button:has-text('복제'), button:has-text('복제')");
await page.waitForURL((u) => /\/tactics\/board\/[0-9a-f-]{36}$/.test(u.toString()) && u.toString() !== boardUrl);
await page.waitForLoadState("networkidle");
check((await page.locator("h1:has-text('(복제)')").count()) === 1, "복제 → 새 보드");
check((await objectCount()) === 3, "복제본에 객체 복사");
await page.click("button:has-text('삭제')");
await page.waitForURL(`${BASE}/tactics/ascent`);
await page.waitForLoadState("networkidle");
check((await page.locator("tbody tr").count()) === 1, "복제본 삭제 → 목록 1건");

// 두 번째 전술(수비) + 겹쳐보기 + 필터
await page.fill("input[name=name]", "B 수비 셋업");
await page.selectOption("select[name=side]", "defense");
await page.click("button:has-text('전술 만들기')");
await page.waitForURL(/\/tactics\/board\//);
await page.waitForLoadState("networkidle");
await page.click("[data-tool=trap]");
await clickBoard(0.6, 0.25);
await page.waitForSelector("[data-save-state=saved]", { timeout: 10000 });
await page.goto(`${BASE}/tactics/ascent`);
await page.waitForLoadState("networkidle");
check((await page.locator("tbody tr").count()) === 2, "전술 2건");
await page.check("input[name=ids] >> nth=0");
await page.check("input[name=ids] >> nth=1");
await page.click("button:has-text('체크한 전술 겹쳐보기')");
await page.waitForURL(/\/tactics\/ascent\/overlay\?ids=/);
await page.waitForLoadState("networkidle");
check((await page.locator("text=2개 전술").count()) === 1, "겹쳐보기 2개 전술");
check((await page.locator("aside li").count()) === 2, "레이어 목록 2개");
check((await page.locator("svg[data-board] [data-layer]").count()) === 2, "SVG 레이어 2개");
await page.screenshot({ path: `${shots}/09-overlay.png` });
await page.goto(`${BASE}/tactics/ascent?side=attack`);
await page.waitForLoadState("networkidle");
check((await page.locator("tbody tr").count()) === 1 && (await page.locator("tbody tr:has-text('A 러시 v2')").count()) === 1, "진영 필터 (공격 1건)");

// 편성기 전술 슬롯 점수·바인딩 → 세션
await page.goto(`${BASE}/squad`);
await page.waitForLoadState("networkidle");
await page.selectOption("#map", { label: "어센트" });
for (const n of ["Rae", "Minseo", "Jin", "Yuna", "Hoon"]) await page.check(`label:has-text('${n}') input[name=m]`);
await page.check(`input[name=t][value="${tacticId}"]`);
await page.click("button:has-text('조합 계산')");
await page.waitForSelector("article:has-text('1안')");
check((await page.locator("article:has-text('전술 A 러시 v2')").count()) === 1, "조합 카드에 전술 슬롯 표시");
check((await page.locator("article >> text=#1 → Rae").count()) === 1, "슬롯 1(전략가·A 메인) → Rae(오멘) 바인딩");
check((await page.locator("article li:has-text('전술 A 러시 v2: 슬롯 1/3 충족')").count()) === 1, "근거: 슬롯 1/3 충족");
// Rae 오멘 3 + 자신감 5(+2) + 슬롯 2 + 포지션 힌트 'A 메인' 1 = 8.0
check((await page.locator("article header:has-text('8.0점')").count()) === 1, "점수 8.0 (선호 5 + 슬롯 2 + 포지션 1)");
await page.screenshot({ path: `${shots}/10-squad-tactic.png` });
await page.click("button:has-text('이 조합으로 세션 시작')");
await page.waitForURL(/\/sessions\/[0-9a-f-]{36}$/);
await page.waitForLoadState("networkidle");
check((await page.locator("input[name=tacticIds]:checked").count()) === 1, "경기에 사용 전술이 체크되어 있음");
check((await page.locator("text=편성 바인딩: A 러시 v2 (#1 Rae)").count()) === 1, "편성 바인딩 스냅샷 표시");
await page.click("article label:has(input[aria-label='승'])");
await page.click("button:has-text('경기 저장')");
await page.waitForSelector("text=저장했습니다");
await page.goto(`${BASE}/sessions/stats`);
await page.waitForLoadState("networkidle");
check((await page.locator("tbody tr:has-text('A 러시 v2')").count()) === 1, "전술별 승률 표에 A 러시 v2");
const tacticRow = await page.locator("tbody tr:has-text('A 러시 v2')").innerText();
check(tacticRow.includes("1승") && tacticRow.includes("100%"), `전술 1승 100% (${tacticRow.replace(/\s+/g, " ")})`);

// 권한: 다른 멤버는 읽기 전용
await login("Minseo");
await page.goto(boardUrl);
await page.waitForLoadState("networkidle");
check((await page.locator("text=읽기 전용").count()) === 1, "작성자 아님 → 읽기 전용 배지");
check(await page.locator("[data-tool=smoke]").isDisabled(), "읽기 전용: 팔레트 비활성");
check((await page.locator("button:has-text('저장 (Ctrl+S)')").count()) === 0, "읽기 전용: 저장 버튼 없음");
check((await page.locator("button:has-text('복제')").count()) >= 1, "읽기 전용에서도 복제 가능");

check(errors.length === 0, `브라우저 콘솔 에러 없음 (${errors.length})`);
if (errors.length) console.log(errors);
await browser.close();

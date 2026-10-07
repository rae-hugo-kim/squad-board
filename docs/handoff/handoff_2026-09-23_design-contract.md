# Handoff: 저장소 안 디자인 계약 (DESIGN.md) — 하네스 규칙 + 첫 파일럿

- 발신: chats 리포 세션 (2026-09-23, sum: `chats/docs/sum/session_2026-09-23_tone-orca-viper-design-tools.md` D6)
- 수신: ① omp 리포(하네스 SoT) 작업 세션 — 규칙·템플릿 추가 / ② 프로덕트 리포 파일럿 세션
- 상태: 사이클 ① 마감 (#37 / 212bafa — `rules/design_contract.md` + `templates/DESIGN.md`, harness 2026.80). ②(프로덕트 파일럿)·③(이탈 리포트 스크립트)는 프로덕트 리포 몫으로 #37에 유지. 이 파일은 발행 당시 미추적으로 남았다가 2026-09-25에 `~/projects/workspace/omp` 워크트리에서 회수해 커밋(#38 정책 소급 적용).

## 한 줄 요약

UI 디자인의 진실의 원천을 외부 툴이 아니라 **저장소 안 파일(`DESIGN.md` + `tokens.css` + 컴포넌트 라이브러리)** 로 두고, 에이전트가 화면을 만들 때 그 계약만 참조하게 하는 규칙을 하네스에 추가합니다. 결정론은 툴에서 오지 않고 "산출물이 git에 코드로 있는가"에서 오므로, 어떤 생성 툴(Claude Design / Stitch / OpenDesign)을 붙여도 결과가 저장소로 수렴하게 만드는 것이 목적입니다.

## 배경 — 왜 이 방향인가

사용자 조건: 디자인 문외한, CS 학습 단계, 웹앱 프로덕트 메이커, 에이전트가 이미 React/Tailwind를 씀. Claude Design·Stitch를 조금 써 봄. Max 구독 2개(Claude Design 포함).

툴 비교 결론 (2026-09-23 조사):

| 툴 | 종류 | 산출물 | 판정 |
|---|---|---|---|
| Penpot (+공식 MCP) | 캔버스형 | 벡터 → 코드 변환 필요 | **보류.** 디자인 역량 전제. MCP 쓰기 경로는 `execute_code`(LLM이 쓴 JS를 플러그인에서 실행) 하나. 스크립트를 저장소 자산으로 두면 결정론 가능하나 브라우저 탭+플러그인 UI 상시 필요(헤드리스 불가) |
| Claude Design | 아티팩트형 | HTML + 핸드오프 번들 | **탐색용 채택.** Max에 포함, 코드베이스 인식 |
| Google Stitch (+MCP) | 아티팩트형 | HTML/Tailwind/Vue/… 내보내기 | **보조.** 무료 350회/월, 5화면 흐름 탐색에만 |
| OpenDesign (nexu-io) | 아티팩트형, 로컬 우선 | 저장소 HTML/CSS, `DESIGN.md` 계약 | **컨벤션만 차용, 앱 도입 보류.** Apache-2.0, 151개 브랜드 `DESIGN.md` 동봉(원출처 VoltAgent/awesome-design-md). Linux 빌드 없음, WSL2 마찰(`/usr/bin/od` 충돌), omp와 하네스 역할 중첩, v0.21·이슈 1,110 |

핵심 통찰: 아티팩트형은 생성이 비결정이어도 결과가 코드 파일이라 그 순간부터 결정론적 자산이 됩니다. 캔버스형에 결정론을 부여하려면 우회(스크립트)가 필요합니다. 그래서 **계약을 저장소에 두는 것이 툴 선택보다 앞서는 문제**입니다.

## 계약의 형식 (제안 — 작업 세션에서 확정)

OpenDesign `design-systems/` 패키지 형태를 참고하되 최소로 시작:

```
design/
  DESIGN.md        # 브랜드 계약서 — 톤, 컬러 역할(primary/surface/…), 타이포 스케일, 간격 스케일,
                   # 컴포넌트 규약(버튼 변형, 카드, 폼), 금지 사항(그라데이션 남용 등), 참조 스크린샷 경로
  tokens.css       # DESIGN.md의 값을 CSS 변수로 컴파일한 것 — 코드가 실제로 읽는 유일한 값
  reference/       # 확정된 화면 스크린샷 (증거·회귀 비교용)
```

- `DESIGN.md`는 사람이 읽는 계약, `tokens.css`는 코드가 읽는 계약. 둘의 불일치는 결함.
- Tailwind 프로젝트면 `tokens.css`의 변수를 `tailwind.config`/`@theme`에서 참조하게 해 컴포넌트 코드에 리터럴 색상·크기가 들어가지 않게 한다.
- 컴포넌트 라이브러리(shadcn 등)는 계약의 **구현**이지 계약이 아니다.

## 에이전트 규칙 (제안 문구의 뼈대 — `rules/design_contract.md`)

1. UI를 생성·수정할 때 `design/DESIGN.md`와 `tokens.css`만 참조한다. 계약에 없는 값(색·폰트·간격 리터럴)을 코드에 넣지 않는다.
2. Claude Design / Stitch / OpenDesign 산출물은 **참고 자료**다. 저장소에 들어오는 것은 계약에 맞춰 재작성된 코드이며, 생성 툴의 HTML을 그대로 커밋하지 않는다.
3. 계약 변경(토큰 추가·값 변경)은 화면 작업과 **별도 사이클**로 분리한다 — 계약 diff는 리뷰 대상, 화면 diff는 계약 준수 검증 대상.
4. 화면 작업의 확인 문장은 항상 "스크린샷 + 계약 준수"로 쓴다. "예쁘다"는 확인 문장이 아니다.
5. 계약이 없는 프로젝트에서 UI 작업이 들어오면 먼저 계약 작성 사이클을 역제안한다 (cycle_definition의 역제안 패턴).

## 검증 수단

- 스크린샷 증거: omp `browser` 캡처를 `design/reference/`와 비교 (사람 검토). 자동 픽셀 비교는 비범위.
- 계약 이탈 검출(선택, ③): 컴포넌트 소스에서 토큰 변수 외 색상 리터럴(`#hex`, `rgb(`, `oklch(`)과 임의 px 폰트 크기를 grep하는 스크립트. 게이트가 아니라 리포트.

## 사이클 분할 제안 (cycle_definition 기준)

| # | 사이클 | 수신 | 확인 문장 |
|---|---|---|---|
| ① | `rules/design_contract.md` + `templates/DESIGN.md` 작성, `AGENTS.md` Linked Modules 등록 | omp | 소비 리포에서 harness-sync 후 `rule://design_contract`가 읽히고 `templates/DESIGN.md`가 존재한다 |
| ② | 프로덕트 리포 1개에서 파일럿: 기존 코드에서 실제 값을 추출해 `design/DESIGN.md`·`tokens.css` 작성(Claude Design 초안은 참고만), 화면 1개를 계약만 참조해 재생성 | 프로덕트 리포 | `design/` 3파일 존재 + 재생성 화면 스크린샷이 `reference/`에 저장되고 사용자 검토 통과 |
| ③ | 계약 이탈 리포트 스크립트 | omp(`scripts/`) 또는 프로덕트 리포 | 픽스처(리터럴 3건 포함)에서 3건 검출, 토큰만 쓴 파일에서 0건 |

①은 docs-only 검증 경로. ②는 프로덕트 코드 변경이라 그 리포의 게이트를 따름. ③은 독립.

## 수용 기준 제안

- AC1: 규칙 문구가 위 5항을 담고, `rules/writing_style.md`처럼 `owner: local-policy`(자동 게이트 없음)를 명시한다 — 이 계약은 행동 규칙이지 커밋 게이트가 아니다.
- AC2: `templates/DESIGN.md`가 빈 뼈대가 아니라 각 섹션에 "무엇을 적는가 / 왜 필요한가" 1줄과 예시 값을 담는다 (디자인 문외한이 채울 수 있어야 함).
- AC3: 파일럿 리포에서 재생성한 화면의 컴포넌트 소스에 색상·폰트 리터럴이 0건이다 (③ 스크립트 또는 grep으로 확인).
- AC4: `claudedocs/CLAUDEKR.md` 동기 여부 명시 (AGENTS.md Linked Modules 변경이 있으므로 갱신 또는 stale 표기).
- AC5: omp `tests/` 회귀 없음 (①은 문서만이라 영향 없음을 확인).

## 비범위 (명시)

- OpenDesign / Penpot 설치·연동 — 재검토 트리거(사람 디자이너 협업, 픽셀 단위 통제, 다프로덕트 토큰 거버넌스) 전까지 하지 않음.
- 자동 픽셀 회귀 비교, 디자인 토큰 → Penpot 동기화.
- 계약 준수를 커밋 게이트로 강제 — 리포트까지만. 게이트화는 데이터가 쌓인 뒤 별도 판단.
- 컴포넌트 라이브러리 선택(shadcn 등) — 프로덕트 리포 결정.

## 관련

- chats sum D6: `chats/docs/sum/session_2026-09-23_tone-orca-viper-design-tools.md`
- 참고 자료: OpenDesign `design-systems/README.md`(패키지 형태), VoltAgent/awesome-design-md(브랜드 `DESIGN.md` 카탈로그), Penpot MCP 문서 https://help.penpot.app/mcp/
- #29 rules/ 생사 감사 — ①에서 `rules/` 항목이 하나 늘어나므로 조율.
- #28 AGENTS.md Linked Modules 누락 — ①에서 같은 표를 건드리므로 함께 처리 가능.
- 선행 handoff 형식: `docs/handoff/handoff_2026-09-21_estimate-vs-actual.md`.

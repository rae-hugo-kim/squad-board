# harness-audit.sh 점수 실효성 검토 (2026-10-06)

이슈 #87의 연구 산출물이에요. 대상은 `scripts/harness-audit.sh`(rubric v3, `TOTAL: 51/70`)가 내는 점수이고, 스크립트·규칙·게이트는 이 사이클에서 수정하지 않았어요. 기준 커밋은 `e3563c3`(main, PR #85 머지)이고, 모든 명령은 워크트리 `gh-loop-issue-87`에서 실행했어요(점수 이력 파일·`docs/sum`·`docs/reviews`는 gitignored라 메인 체크아웃 `/home/rae/projects/workspace/omp`에서 읽기 전용으로 집계했어요).

## 0. 결론

**추천은 (a) 폐지예요.** 근거는 네 가지예요.

> **결정: (a) 폐지** (2026-10-06, 이슈 #87 댓글 "세션에서 직접 결정함" — 실행은 별도 이슈로, #15 머지 뒤 진행).

1. 점수 항목 32개 중 **실제 동작을 판정하는 항목은 0개**예요 — 파일·디렉터리 존재 21개(42점), 고정 문자열 grep 9개(20점), 파일 개수 2개(5점)뿐이에요(§2).
2. 범프 31회(2026.50 → 2026.85, 2026-06-11 → 2026-10-02)의 점수 행이 **전부 `total: 51`, 카테고리별 값까지 동일**해요 — 4개월 동안 한 번도 움직이지 않은 지표예요(§3.1).
3. 점수가 결정에 쓰인 사례는 **없어요**. 유일한 용례는 #49·#50(ADR 002)·PR #52·#80·#85의 AC "점수가 내려가지 않음"인데, 이것은 점수가 결정을 만든 것이 아니라 결정(규칙 이동·병합)이 점수에 발목 잡히지 않도록 방어한 흔적이에요(§3.2). 사용자 진술(2026-10-06)과 일치해요.
4. 스크립트가 측정하는 것은 문자열이에요 — AGENTS.md에 HTML 주석 한 줄(`<!-- model routing; .omp/state/sessions; auto memory; token budget -->`)과 빈 `eval/` 디렉터리를 더하면 **51 → 67**(도달 가능 최대치)이 돼요(§2.4).

(b) 행동 지표 재설계는 **새 점수를 만들지 않는 조건으로만** 의미가 있어요. 기존 `estimate_vs_actual`(#33)과 #79가 추가한 `gh_loop_dispatched`/`gh_loop_closed`는 `estimate-report.mjs`가 이미 표로 내고 있고, 그 도구는 의도적으로 "임계값·추천 없음"이에요(`estimate-report.mjs:16`). 이것을 다시 한 숫자로 합치면 지금 폐지하려는 것과 같은 "아무도 행동하지 않는 숫자"가 하나 더 생겨요. 그리고 (b)의 핵심 축인 **게이트 BLOCK/PASS 비율은 현재 어디에도 기록되지 않아요**(§4.2) — 지표가 아니라 계측부터 새로 만들어야 하는 범위예요.

(c) 존재 점수만 제거하면 만점 25점(grep 20 + 개수 5)의 스크립트가 남는데, 남는 항목이 더 약한 판정이에요(`sum` 단어 일치 +3은 `docs/sum/` 경로 문자열에서 나와요). 유지 비용만 남고 정보는 없어요(§4.3).

폐지하면 #86(병합 M1–M9)은 "점수가 내려가지 않음" AC와 `rules-liveness-audit-2026-10-06.md` §7-1(존재 점수를 모체로 재배치)·§7-4 없이 진행할 수 있어요. 행동 데이터가 필요한 질문은 `estimate-report.mjs` 표를 읽는 것으로 답하고, 숫자 하나가 다시 필요해지면 **그 숫자가 어떤 결정 규칙에 들어가는지**("X 이하면 누가 무엇을 한다")를 먼저 적는 것을 조건으로 해요.

## 1. 범위와 방법

- 연구할 것 1(항목 전수표): `scripts/harness-audit.sh` 381줄을 전부 읽고 채점 항목 32개를 표로 옮겼어요(`award` 호출은 #1·#3의 폴백 티어 2건을 포함해 34건이고, 폴백은 표의 항목 열에 괄호로 적었어요). 판정 방식은 헬퍼 기준으로 분류했어요 — **E** = `exists`/`compgen -G`(파일·디렉터리 존재), **P** = `has_pattern`/`grep -qF`(고정 문자열 일치), **C** = `count_files`(파일 개수), **B** = 실제 동작(게이트 실행·이벤트·결과).
- 연구할 것 2(이력·결정 사례): 점수 행 파일, `docs/harness/audit.jsonl`, `docs/sum`·`docs/reviews`(메인 체크아웃, gitignored), 이슈·PR 검색(`gh … --search`), 스크립트 git 이력을 명령과 출력으로 기록했어요(§3).
- 연구할 것 3·4: 선택지별 영향 파일을 `grep`·`gh`로 열거하고(§4), 추천을 §0에 두었어요.
- 참고: `docs/harness/audit.jsonl`의 `rubric_evaluated`(10행)는 **kickoff 루브릭**(seed 명료성·coverage) 이벤트이고 이 스크립트와 무관해요. 같은 "rubric" 단어라 혼동하기 쉬워 적어 두어요.

## 2. 점수 항목 전수표 (AC1)

### 2.1 항목별 판정 방식

가중치는 `award` 두 번째 인자, "현재"는 `bash scripts/harness-audit.sh`(2026-10-06, `e3563c3`) 출력이에요.

| # | 카테고리 | 항목 (출력 라벨) | 가중치 | 판정 | 현재 | 판정 코드 (`scripts/harness-audit.sh`) |
|---|---|---|---|---|---|---|
| 1 | tool_coverage | `.omp/agents/` 파일 수 ≥2 (1개면 +1) | 3 | C | +3 (4개) | `count_files ".omp/agents"` :120 |
| 2 | tool_coverage | `.omp/extensions/harness/gates/` 존재 | 2 | E | +2 | `exists` :133 |
| 3 | tool_coverage | `scripts/` 파일 수 ≥3 (디렉터리만 있으면 +1) | 2 | C | +2 (5개) | `count_files "scripts"` :139 |
| 4 | tool_coverage | `.omp/rules/harness-agent_routing.md` 존재 | 1 | E | +1 | `exists` :147 |
| 5 | tool_coverage | AGENTS.md에 `model_routing` 또는 `model routing` 문자열 | 2 | P | +0 | `has_pattern "AGENTS.md"` :153 |
| 6 | context_efficiency | `.omp/rules/harness-context_management.md` 존재 | 3 | E | +3 | `exists` :162 |
| 7 | context_efficiency | `.omp/rules/harness-session_persistence.md` 존재 | 2 | E | +2 | `exists` :168 |
| 8 | context_efficiency | AGENTS.md 또는 `.omp/rules/`에 `.omp/state` 문자열 | 2 | P | +0 | `grep -rqF ".omp/state"` :174 |
| 9 | quality_gates | `.omp/rules/harness-code_review_policy.md` 존재 | 2 | E | +2 | `exists` :183 |
| 10 | quality_gates | `checklists/code_review.md` 존재 | 1 | E | +1 | `exists` :189 |
| 11 | quality_gates | `gates/acceptance-gate.*` 파일 존재 | 2 | E | +2 | `compgen -G` :195 |
| 12 | quality_gates | `gates/backpressure-gate.*` 파일 존재 | 2 | E | +2 | `compgen -G` :201 |
| 13 | quality_gates | `.omp/rules/harness-quality_gates.md` 존재 | 1 | E | +1 | `exists` :207 |
| 14 | quality_gates | `.omp/rules/harness-verification_tests_and_evals.md` 존재 | 2 | E | +2 | `exists` :213 |
| 15 | memory_persistence | `.omp/rules/harness-session_persistence.md` 존재 (**#7과 중복**) | 2 | E | +2 | `exists` :222 |
| 16 | memory_persistence | AGENTS.md에 `auto memory`/`MEMORY.md`/`memory system` 문자열 | 3 | P | +0 | `has_pattern "AGENTS.md"` :228 |
| 17 | memory_persistence | AGENTS.md 또는 `.omp/rules/`에 `.omp/state/sessions` 문자열 | 2 | P | +0 | `grep -rqF` :236 |
| 18 | memory_persistence | AGENTS.md 또는 `.omp/rules/`에 단어 `sum` | 3 | P | +3 | `grep -rqwF "sum"` :243 |
| 19 | eval_coverage | `templates/eval_definition.md` 존재 | 2 | E | +2 | `exists` :253 |
| 20 | eval_coverage | `templates/eval_report.md` 존재 | 2 | E | +2 | `exists` :259 |
| 21 | eval_coverage | `checklists/eval.md` 존재 | 2 | E | +2 | `exists` :265 |
| 22 | eval_coverage | verification 규칙에 `Eval-Driven Development` 또는 `EDD` 문자열 | 2 | P | +2 | `has_pattern` :271 |
| 23 | eval_coverage | `eval` 경로 존재(`-e`라 파일·디렉터리 종류 무관) | 2 | E | +0 | `exists "eval"` :278 |
| 24 | security_guardrails | `.omp/rules/harness-safety_security.md` 존재 | 2 | E | +2 | `exists` :287 |
| 25 | security_guardrails | `.omp/rules/harness-agent_security.md` 존재 | 2 | E | +2 | `exists` :293 |
| 26 | security_guardrails | `gates/destructive-guard.*` 파일 존재 | 3 | E | +3 | `compgen -G` :299 |
| 27 | security_guardrails | `gates/mcp-gate.*` 파일 존재 | 2 | E | +2 | `compgen -G` :305 |
| 28 | security_guardrails | `.omp/rules/`에 `secret` 또는 `credential` 문자열(대소문자 무시) | 1 | P | +1 | `grep -rqiF` :311 |
| 29 | cost_efficiency | `.omp/rules/harness-cost_awareness.md` 존재 | 3 | E | +3 | `exists` :321 |
| 30 | cost_efficiency | AGENTS.md에 `model_routing`/`model routing` 문자열 (**#5와 중복**) | 3 | P | +0 | `has_pattern "AGENTS.md"` :327 |
| 31 | cost_efficiency | `.omp/rules/harness-context_management.md` 존재 (**#6과 중복**) | 2 | E | +2 | `exists` :333 |
| 32 | cost_efficiency | `.omp/rules/`에 `token budget`/`token-budget`, 또는 AGENTS.md에 `token budget` 문자열 | 2 | P | +0 | `grep -rqiF` :339-341 |

### 2.2 집계

| 판정 방식 | 항목 수 | 배점 합 | 현재 득점 |
|---|---|---|---|
| **E** 파일·디렉터리 존재 | 21 | 42 | 40 (#23 `eval/`만 결손) |
| **P** 고정 문자열 grep | 9 | 20 | 6 (#18 `sum` +3, #22 EDD +2, #28 secret +1) |
| **C** 파일 개수 | 2 | 5 | 5 |
| **B** 실제 동작 | **0** | 0 | 0 |
| 합계 | 32 | **67** | **51** |

- **만점은 70이 아니라 67이에요.** `context_efficiency`의 배점 합이 3+2+2 = 7이라 `/10` 표기의 3점은 어떤 레이아웃도 받을 수 없어요(§2.4 실험에서 `context_efficiency: 7/10`로 확인). 스크립트 헤더(`:5-6` "Each category scores 0..10 … Total range: 0..70")와 `test-harness-audit.sh:8`의 "host repo 40..70"은 이 사실과 어긋나요.
- **같은 파일이 두 카테고리에서 중복 득점해요.** `session_persistence.md`(#7 +2, #15 +2), `context_management.md`(#6 +3, #31 +2), AGENTS.md `model routing` 문자열(#5 +2, #30 +3). 파일 하나를 지우면 최대 5점이 함께 빠지고, 문자열 하나를 넣으면 5점이 함께 들어와요.
- 현재 결손 16점은 전부 **문자열 5개와 빈 경로 1개**예요(#5/#30 `model routing`, #8 `.omp/state`, #16 `auto memory`, #17 `.omp/state/sessions`, #32 `token budget`, #23 `eval`). `.omp/state`는 현행 하네스의 로컬 상태 디렉터리(`harness-version-check.mjs:64,196`, `harness-version-bump.sh:157`)지만 #8은 그 경로가 AGENTS.md나 규칙 본문에 **적혀 있는지**만 검사하고, `.omp/state/sessions`는 현행 세션 경로(`~/.omp/agent/sessions/`)와 어긋나요 — 결손이 품질 부족이 아니라 **루브릭이 문서 본문의 문자열을 세는 것**이에요.

### 2.3 득점 항목이 가리키는 대상이 실제와 다른 사례

| 항목 | 득점 | 실제 |
|---|---|---|
| #27 `mcp-gate.*` 존재 +2 | 파일 `gates/mcp-gate.mjs`가 있어 득점 | 이슈 #21(OPEN) "xd:// MCP 디스패치에 mcp-gate 재배선 — 17.x xd 마운팅에서 advisory 사문화". `index.ts:9,575`가 `mcp__*` 도구명에만 배선하므로 현행 `xd://` 경로에서는 실행되지 않아요. 파일 존재 점수가 **사문화된 게이트**에 만점을 줘요. |
| #18 단어 `sum` +3 ("sum skill referenced") | `.omp/rules/` 9개 파일에서 일치 | `grep -nw sum AGENTS.md` → 0건. 규칙 파일의 일치 중 `harness-coding_standards.md:98`은 `docs/sum/session_…md` **경로 문자열**이에요(`-w`는 `/`를 단어 경계로 봐요). 스킬 참조 여부와 무관하게 `docs/sum/` 링크 하나로 3점이 나와요. |
| #25 `agent_security.md` +2, #29 `cost_awareness.md` +3, #6/#31 `context_management.md` +5, #13 `quality_gates.md` +1 | 파일 존재로 득점 | `rules-liveness-audit-2026-10-06.md` §2 판정: `agent_security`·`cost_awareness`·`context_management`는 **사**(참조·배선·흔적 없음), `quality_gates`는 **약**. 죽은 규칙 4편이 11점을 떠받치고 있어요. 그래서 PR #85 §4·§7-1이 "존재 점수를 모체로 재배치"해야 했어요. |
| #1 에이전트 ≥2 +3 | 4개(`adversary`·`code-reviewer`·`reviewer`·`verifier`) | 스크립트 주석(`:121-124`)대로 v2에서 ≥5 임계값이 "측정된 위임 0건"으로 은퇴했어요 — 루브릭이 한 번 현실에 맞춰 내려온 전례이고, 그때도 결정은 점수 밖(위임 측정)에서 났어요. |

### 2.4 조작 실험 — 문자열 한 줄로 51 → 67

리포의 채점 대상(AGENTS.md, `scripts/`, `checklists/`, `templates/`, `.omp/rules`, `.omp/agents`, `.omp/extensions/harness/gates`)만 임시 디렉터리에 복사해 기준선을 확인한 뒤, AGENTS.md 끝에 HTML 주석 한 줄을 붙이고 빈 `eval/` 디렉터리를 만들었어요.

```
$ T=$(mktemp -d); … cp -r … "$T/"
$ bash scripts/harness-audit.sh --root "$T" --terse | tail -1
TOTAL: 51/70
$ printf '\n<!-- model routing; .omp/state/sessions; auto memory; token budget -->\n' >> "$T/AGENTS.md"; mkdir "$T/eval"
$ bash scripts/harness-audit.sh --root "$T" --terse
  tool_coverage: 10/10
  context_efficiency: 7/10
  quality_gates: 10/10
  memory_persistence: 10/10
  eval_coverage: 10/10
  security_guardrails: 10/10
  cost_efficiency: 10/10
TOTAL: 67/70
```

HTML 렌더링에 보이지 않고 실행 가능한 기능을 더하지 않는 한 줄과 빈 경로만으로 16점이 올라요(`.omp/state/sessions`가 `.omp/state`도 포함하므로 #8·#17이 함께 득점; 이 주석이 모델 입력·행동에 미치는 영향은 이 실험에서 측정하지 않았어요). 반대로 #86의 M1–M9 병합은 일부 구식 절(`rules-liveness-audit-2026-10-06.md:361,364,366` — M3 `~/.claude/scripts` 절, M6 e2e 포맷, M8 레시피 5종)을 의도적으로 폐기하면서 점수 대상 규칙 4편을 없애 §2.3 세 번째 행의 11점을 잃어요 — **제안된 구조 개선과 점수가 역행해요.**

## 3. 점수 이력과 결정 사례 탐색 (AC2)

### 3.1 점수 행 — 31회 전부 51

점수 행은 `scripts/harness-version-bump.sh:154-177`(§7 "Append audit-score row", 이슈 #11 참고 주석)이 범프마다 `.omp/state/harness-scores.jsonl`에 append해요. 이 경로는 `.gitignore:3`(`.omp/state/`)이라 **체크아웃마다 따로 쌓이고 커밋되지 않아요.** 워크트리에는 파일이 없고(`ls .omp/state/harness-scores.jsonl` → `No such file`), 메인 체크아웃에만 있어요.

```
$ wc -l /home/rae/projects/workspace/omp/.omp/state/harness-scores.jsonl
31
$ node -e '…' # total·by_cat 분포
total 51 × 31행 (2026-06-11T03:39Z 2026.50 … 2026-10-02T15:08Z 2026.85)
by_cat 동일 × 31행: tool 8 / ctx 5 / qg 10 / mem 5 / eval 8 / sec 10 / cost 5
```

- 31행의 `total`·`by_cat`·`rubric_version`("3")이 **모두 같아요.** 4개월 동안 하네스는 게이트 12종 배선, 규칙 29편 이동(#50), 상태 라벨 체계(#69), dispatch 기록(#79) 등을 거쳤지만 점수는 한 번도 반응하지 않았어요.
- 범프 2026.70·79·80·81·83의 행이 **없어요**(태그는 `git tag -l 'harness/*'`에 존재). 다른 체크아웃·워크트리에서 범프했거나(`docs/sum/session_2026-07-22_sidecar-landing-vibe-topology.md:15` "audit-score 행 … 비커밋 best-effort") 손으로 범프한 경우예요. 이력 자체가 **손실형**이라, 설령 점수가 움직였더라도 시계열로 읽을 수 없어요.
- `docs/harness/audit.jsonl`에는 점수 관련 행이 없어요: `grep -c 'audit-score\|audit_score\|harness-scores\|harness_audit\|TOTAL' docs/harness/audit.jsonl` → `0`. 이슈 본문의 "`docs/harness`의 audit-score 행"은 실제로는 `.omp/state/`에 있어요.

### 3.2 결정 사례 탐색 — 명령과 출력

| 소스 | 명령 | 결과 |
|---|---|---|
| 세션 요약 45편 | `grep -rn 'harness-audit\|audit-score\|harness-scores\|/70\|rubric' /home/rae/projects/workspace/omp/docs/sum` | 점수 언급 3곳. `session_2026-07-22_…:15,80` — 범프를 스크립트 경로로 재작성한 기록("audit-score 행 … 비커밋"); `session_2026-09-26_policy-retier-cycles-1-2.md:109`·`cycles-3-8.md:123` — `rules/` 이동 때 스크립트 **경로 치환** 목록. 점수 값을 읽고 무언가를 결정한 기록은 0건. 나머지 일치는 kickoff rubric(`rubric-report.md`)이에요. |
| 이슈 | `gh issue list --state all --search "harness-audit"` → 24건; `--search '"51/70"'` → #87, #49 | 24건 중 #87은 본 조사, #86은 점수 처분에 의존하는 병합 후속, #49·#50은 비회귀 AC예요 — #49 본문 AC3 "`harness-audit.sh --terse` 점수가 내려가지 않고", 결정 요청 댓글 "audit 51/70 유지"; #50 본문 검증 3 "`rules/` 제거 후 … 점수가 내려가지 않아요". 나머지 20건(#68·#25·#21·#31·#71·#33·#34·#79·#62·#32·#35·#40·#43·#38·#42·#29·#22·#69·#1·#66)은 검색어가 점수 도구 전용이 아니라 `harness`와 `audit`이 점수와 무관한 문맥(`audit.jsonl` 병렬 충돌 #71, 감사 이벤트 #33·#34, 동기화 경로·세션 문서명 등)에 함께 나와 걸린 결과이고, 점수로 생성·삭제를 결정한 사례는 확인하지 못했어요. |
| PR | `gh pr list --state all --search "harness-audit"` → 19건; `--search '"51/70"'` → #52, #80, #85 | #52 "51/70 (4015b10 기준선 동일)", #80 "51/70 → 51/70", #85 "`TOTAL: 51/70` (기준선 기록)" + "존재 점수를 모체로 재배치(현재 `TOTAL: 51/70` 유지)". 전부 **비회귀 확인**이에요. |
| ADR | `docs/decisions/002-policy-layer-retiering.md:73` | 검증 항목 3 "점수가 내려가지 않습니다" — AC 문구의 원천. |
| 스크립트 이력 | `git log --format='%h %ad %s' -- scripts/harness-audit.sh` | 2건: `8f9d689`(2026-06-10 OMP 포트, 이미 `RUBRIC_VERSION="3"`)·`f2babf1`(2026-09-26 경로 `rules/` → `.omp/rules/harness-`, 44줄 ±). 루브릭 내용 변경은 이 리포 안에서 0건. |
| 출처 | `claudedocs/ecc_harness_analysis.md:47,90` (2026-04-24, Claude Code 시절) | ECC `harness-audit.js`를 이식한 동기: "우리 `harness-check`는 contract 존재 여부만 체크. ECC는 '얼마나 좋은가'를 수치화 — 리팩토링 근거 제공". 도입 목적이 "리팩토링 근거"였는데, 그 근거로 쓰인 리팩토링이 없어요. |

**판정**: 점수가 규칙·게이트·스킬을 만들거나 없애는 결정에 쓰인 사례는 없어요. 쓰인 방식은 단 하나, "이 변경이 점수를 떨어뜨리지 않는다"는 AC 가드이고, 그 가드가 지키는 점수는 §2에서 보듯 파일 존재 합이에요. 사용자 진술 "평가도구를 통해서 내가 규칙을 없애거나 만들거나 한 기억은 없긴해"(2026-10-06)와 기록이 일치해요.

## 4. 선택지별 영향 범위 (AC3)

### 4.1 (a) 폐지 — 스크립트·범프 연동·AC 문구 제거

영향 파일(`grep -rn 'harness-audit\|test-harness-audit\|harness-scores'` 전수 — 수정 대상과 의도적 유지 대상을 모두 적어요):

| 파일 | 내용 | 조치 |
|---|---|---|
| `scripts/harness-audit.sh`, `scripts/test-harness-audit.sh` | 스크립트 본체·테스트 드라이버 | 삭제 |
| `scripts/harness-version-bump.sh:50-51` (`HARNESS_PATHS`), `:154-177` (§7 점수 행 append) | 범프 연동 | 두 경로 제거, §7 블록 삭제(`python3` 의존도 함께 사라져요) |
| `scripts/harness-sync.sh:195-196` (`PATHS`) | 소비 리포 동기화 목록 | 두 줄 제거. **소비 리포의 기존 사본은 고아로 남아요** — 비글롭 파일 항목은 원본에 없으면 `continue`(`:361`)라 삭제되지 않아요. `RETIRED_DIRS`(`:240`)는 디렉터리 단위라 `scripts/` 전체를 넣을 수 없고, 개명표처럼 릴리스 노트·`harness-check` advisory 한 줄로 "삭제해도 됨"을 안내해요(ADR 002 부속 결정 1과 같은 경로). |
| `.omp/extensions/harness/gates/risk-assess.mjs:38` (`HARNESS_ASSET_PATHS`) | 두 경로를 하네스 자산으로 분류 | 두 항목 제거(테스트 `risk-assess.test.mjs`에 이 경로 픽스처가 있는지 확인 — 2026-10-06 grep으로는 테스트 디렉터리에 일치 0건) |
| `.omp/skills/harness-check/SKILL.md:83-96` (§4 Quality audit) | `--audit` 절차 | 절 삭제 |
| `README.md:185`, `README.en.md:182` | "`--audit`은 … rubric v3 … `harness-scores.jsonl`에 누적" | 문장 삭제 |
| `docs/decisions/002-policy-layer-retiering.md:73` | 검증 3 "점수가 내려가지 않습니다" | ADR 본문은 시점 기록이라 손대지 않고 Amendment 한 줄("2026-10-xx #87로 점수 폐지, 검증 3 무효")을 더해요 |
| `docs/harness/rules-liveness-audit-2026-10-06.md:17,189,385,388` | 기준 ② 설명, §4.1 존재 점수 목록, §7-1·§7-4 | 시점 기록이라 수정하지 않고, #86 산출물에서 "§7-1·§7-4는 #87 결정으로 불필요"라고 참조해요 |
| `docs/harness/seed.yaml:42-43`, `docs/harness/current-scope.md:10` (#87 seed·scope) | 참고 파일 목록·AC 문구 | #87 추적 산출물이라 closeout 뒤 시점 기록으로 유지 |
| `claudedocs/ecc_harness_analysis.md:47,90` | 도입 동기(2026-04-24 스냅샷) | 원본 스냅샷이라 수정하지 않아요 |
| `.gitignore:3` `.omp/state/` | 점수 파일 디렉터리 | `.omp/state/`는 다른 상태(`harness-policy-check.json` 등)도 쓰므로 유지. 각 체크아웃의 `harness-scores.jsonl`은 그대로 두거나 지워요(커밋 대상 아님) |
| `docs/harness/archive/20260926-policy-retiering/seed.yaml:23,43,57` | 완료된 정책 재계층화의 보관 seed(감사 명령·경로·비회귀 AC) | 시점 기록으로 유지 |
| `CHANGELOG.md:28` | 정책 재계층화 때 스크립트 경로 갱신 기록 | `:28`은 유지하고 `[Unreleased]`에 폐지 항목 1줄 추가 |
| 이슈 AC | #49(CLOSED)·#50(OPEN) "점수가 내려가지 않음" | #50은 열려 있으므로 검증 3을 댓글로 무효 처리. #86의 AC 초안에는 넣지 않아요 |

범위: 삭제 2파일, 수정 6파일(`harness-version-bump.sh`·`harness-sync.sh`·`risk-assess.mjs`·`harness-check/SKILL.md`·README ko/en) + CHANGELOG 1줄 + ADR Amendment 1줄. `risk-assess.mjs`는 `.omp/extensions/harness/gates/` 안이라(#15 작업과 같은 파일은 아니에요) 실행 사이클은 #15 머지 뒤로 순서를 잡고, 하네스 자산 경로라 `risk-assess`가 medium 이상으로 분류할 수 있으니 reviewer 사이드카를 준비해요.

### 4.2 (b) 행동 지표로 재설계

이슈가 든 네 축이 **지금 어디에 있는지**를 먼저 적어요.

| 축 | 현재 데이터 | 집계 도구 |
|---|---|---|
| gh_loop_closed 실측(변경 파일/줄·리뷰 라운드·verifier·결정 왕복·분) | `docs/harness/audit.jsonl` `gh_loop_closed` 2행, `gh_loop_dispatched` 3행(#79, 2026-10-03~06) | `estimate-report.mjs` §3 Dispatch(모델×규모 셀: dispatched/closed/median review rounds/verifier FAIL/decisions/minutes) — 이미 있어요 |
| estimate_vs_actual 적중 | `estimate_vs_actual` 16행(이벤트 `ts` 기준 2026-09-23~10-03) | `estimate-report.mjs` §1 Bias(exact-level matches 10/16, files 중앙 비율 1.00) — 이미 있어요 |
| 리뷰 라운드 | `gh_loop_closed.meta.review_rounds` 2행. 과거 `adversarial_review` 5행(2026-07, 마지막 2026-07-30 round 5)·`review_override` 4행·메인 체크아웃 `/home/rae/projects/workspace/omp/docs/reviews/*.json`의 gitignored 사이드카 35개(`ls … | wc -l`)도 있지만 **현재 §3 집계에는 들어가지 않아요**(`estimate-report.mjs:130-136`은 closeout 행의 `review_rounds`만 읽어요) | §3 median review rounds(closeout 2행 기준). 과거 라운드를 포함하려면 별도 정규화·집계가 필요하고, 사이드카는 커밋되지 않아 리포 밖에서는 못 읽어요 |
| **게이트 BLOCK/PASS 비율** | **기록 없음.** `audit.jsonl` append 호출부를 추적하면 게이트가 직접 쓰는 이벤트 리터럴은 `acceptance_wip`(`gates/acceptance-gate.mjs:68`)·`estimate_vs_actual`(`gates/estimate.mjs:81`)·`harness_sync`(`gates/review-gate.mjs:376`)·`review_override`(`gates/review-gate.mjs:609`) 4종이고, BLOCK/PASS 판정 이벤트는 없어요(넓은 `grep "event:"`는 `index.ts`의 OMP 핸들러 타입 `tool_call`·`session_start` 등까지 8종을 돌려주므로 근거로 쓰지 않아요). 판정은 stdout과 `.omp/harness-state/`(gitignored, cwd별 — #58)에만 흘러요 | 없음 — 계측(게이트별 판정 이벤트 append)과 집계 둘 다 신규예요 |

영향 범위(최소 구현 기준):

- **신규**: 게이트 판정 이벤트 스키마·append 지점(`index.ts` 또는 `commit-gates` 디스패처 — `.githooks/pre-commit` 경로 포함), 집계 스크립트 1개(또는 `estimate-report.mjs` §4), 테스트, `.gitattributes`의 `audit.jsonl merge=union` 영향(병렬 PR마다 BLOCK 행이 쌓여 #71의 꼬리 충돌이 늘어나요).
- **수정**: (b)는 두 갈래예요. ① **제자리 재설계** — `harness-audit.sh` CLI·sync/risk 경로는 유지하고 내부 점수·출력 계약(`--terse` 파서가 `harness-version-bump.sh:162-175`에 있어요)·`test-harness-audit.sh` 기대 범위·README·점수 행 스키마를 교체해요. ② **교체** — 기존 스크립트를 폐지하고 새 집계기를 두면 (a)의 제거 범위가 그대로 더해져요. 어느 쪽이든 `harness-version-bump.sh` §7을 새 집계로 바꿀지 결정해야 해요.
- **선행 조건**: 각 지표가 **어떤 결정에 들어가는지**를 적는 것. 예: "모델 셀의 verifier FAIL ≥ 2/5면 `gh-loop-record.mjs recommend` 규칙표의 그 셀을 한 단계 올린다" — 이것은 이미 #79의 설계예요(`gh-loop/SKILL.md` Stage 0-2 "규칙표는 `estimate-report.mjs` §3이 쌓이면 테스트와 함께 조정"). 즉 (b)의 실질은 **새 점수가 아니라 #79 규칙표의 조정 절차**이고, 그것은 데이터(현재 closeout 2행)가 쌓인 뒤의 일이에요.
- **반례 위험**: 네 축을 다시 0..N 점수 하나로 합치면 §3.1과 같은 "움직이지 않거나, 움직여도 아무도 읽지 않는 숫자"가 돼요. `estimate-report.mjs:16`이 "No thresholds, no recommendations: the tables are raw material"로 못 박은 이유예요.

### 4.3 (c) 존재 점수만 제거하고 유지

- E 21개(42점)를 빼면 P 9개(20점) + C 2개(5점) = **만점 25**, 현재 득점 11이에요. 남는 항목은 §2.3의 `sum` 경로 일치(+3), `secret` 단어(+1), EDD 제목(+2), AGENTS.md 문자열 4종(현행 omp에 없는 Claude Code 경로 포함), 파일 개수 2종이에요 — 존재 판정보다 **더 약한** 판정만 남아요.
- 수정 범위: `harness-audit.sh`(21개 블록 삭제, 카테고리 배점 재조정 → `RUBRIC_VERSION` 4), `test-harness-audit.sh`(기대 범위 3곳), `harness-check/SKILL.md:92-94`(만점 표기), README 2곳, 그리고 점수 행 시계열은 rubric 3/4로 끊겨요. #86 병합은 (a)와 같이 자유로워지지만 스크립트·테스트·범프 연동·sync 항목의 유지 비용은 그대로예요.
- 요약: 비용은 (a)보다 크고 정보는 (a)와 같아요(0).

## 5. 추천과 근거 (AC4)

**(a) 폐지**를 추천해요. 측정 도구의 최소 조건은 "값이 변하고, 변한 값이 어떤 행동을 바꾼다"인데, 이 점수는 4개월·31회 동안 변하지 않았고(§3.1), 변했을 때 무엇을 할지 정한 규칙이 어디에도 없으며(§3.2), 변하게 만드는 가장 싼 방법이 HTML 주석이에요(§2.4). 유지하면 #86 병합처럼 하네스를 좋게 만드는 변경이 매번 "점수 재배치" 작업을 끌고 다녀요(PR #85 §7-1·§7-4).

(b)는 "지표"의 이름으로 새 계측·집계·점수를 만드는 것이면 반대해요. "#79 규칙표를 `estimate-report.mjs` 표로 조정한다"는 뜻이면 신규 지표 설계 이슈는 지금 열지 않고, 표본이 쌓인 뒤 기존 #79 조정 경로(`gh-loop/SKILL.md` Stage 0-2 "규칙표는 … 테스트와 함께 조정")에서 규칙표·테스트를 바꾸는 별도 구현 사이클로 처리해요. 게이트 BLOCK/PASS 비율이 정말 필요해지면 그때 "이 비율이 X를 넘으면 Y 게이트를 완화/강화한다"는 결정 규칙과 함께 계측을 여는 이슈를 따로 내요.

**다음 사이클(실행)의 AC 초안** — 사용자가 (a)를 고르면 이대로 이슈를 열어요:

1. `scripts/harness-audit.sh`·`scripts/test-harness-audit.sh`가 삭제되고, `harness-version-bump.sh` §7·`HARNESS_PATHS`, `harness-sync.sh` `PATHS`, `risk-assess.mjs` `HARNESS_ASSET_PATHS`, `harness-check/SKILL.md` §4, README ko/en 문장에서 운영 참조가 0건이에요(`git grep -n -E 'harness-audit|test-harness-audit|harness-scores' -- ':!docs/**' ':!claudedocs/**' ':!CHANGELOG.md'` → 0). `CHANGELOG.md`에는 기존 `:28` 시점 기록과 `[Unreleased]` 폐지 안내만 남아요.
2. 하네스 suite(`node --test .omp/extensions/harness/tests/*.test.mjs`)·`node scripts/docs-drift`가 통과해요.
3. ADR 002 Amendment 1줄, CHANGELOG `[Unreleased]` 1줄, #50 검증 3 무효 댓글이 있어요.
4. 소비 리포 안내: 릴리스 노트(범프 CHANGELOG)에 "`scripts/harness-audit.sh`·`scripts/test-harness-audit.sh`는 삭제해도 됩니다" 1줄.
5. 실행 순서: #15(게이트 `.mjs`)가 머지된 뒤에 열어요 — `risk-assess.mjs`가 같은 디렉터리예요.

#86은 이 결정이 나면 "점수가 내려가지 않음" AC 없이 M1–M9 이동표를 확정할 수 있어요. 점수 처분이 정해지기 전에는 병합 **실행** 사이클을 열지 않아요(이슈 #87 AC4).

## 6. 검증

- `bash scripts/harness-audit.sh` / `--terse` (2026-10-06, `e3563c3`) → `TOTAL: 51/70`, §2.1 "현재" 열과 일치.
- §2.4 임시 디렉터리 실험 → `TOTAL: 67/70`(위 출력 그대로).
- `wc -l`·`node -e` 집계 → 31행 전부 `total: 51`.
- `gh issue list`/`gh pr list --search` → §3.2 표의 번호·인용 줄.
- 이 문서는 `docs/harness/` 신규 1파일이고, 스크립트·규칙·게이트·스킬은 수정하지 않았어요(문서 커밋 `f116a43` 기준 브랜치 변경은 `docs/harness/` 4파일뿐이고, `git diff --stat main -- scripts .omp/rules .omp/extensions`는 비어 있어요).

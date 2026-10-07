# harness-* 규칙 29편 생사 감사 (2026-10-06, 이슈 #29)

**결론**: `.omp/rules/harness-*.md` 29편을 기준 3개로 실측한 결과, 기준 판정은 **생 17편 · 약 6편 · 사 6편**이고, 내용 중복 분석을 겹친 처분 제안은 **유지 20편(조건부 3) · 병합 9편 · 폐기 0편**이에요. 사 판정 6편은 모두 고유 내용을 가진 흡수 모체가 있어 "삭제"가 아니라 "병합"으로 제안해요. 삭제·병합은 이 사이클에서 실행하지 않고 §7의 제안 목록만 남겨요 — 실행은 별도 승인 후속 사이클이에요(이슈 #29 세션 직접 결정 A, 2026-10-06).

- 대상: HEAD `0f205a7`(main, PR #81 머지 직후)의 `.omp/rules/harness-*.md` 29편. 규칙 파일은 이 감사에서 한 줄도 바꾸지 않았어요.
- 기준(이슈 본문 제안을 그대로 승인): ① 참조 여부 ② 게이트 배선 ③ 최근 발동 사례. ①·②는 명령과 출력을 §3·§4에 그대로 기록했고(리포 루트에서 재실행하면 같은 숫자), ③은 §5에서 명령·출력과 함께 흔적을 경로·번호로 인용했어요.
- 실측 시각: 2026-10-06 06:40~08:10 UTC. 이슈·댓글 집계는 그 시각의 스냅샷(이슈+PR 84건, 댓글 131건)이라 이 사이클이 남기는 댓글·PR 본문은 들어 있지 않아요.
- 선례: 2026-08-26 세션이 같은 목적의 4축 판정(기계 배선·길목 소비·세션 발화·통치 대상 실존)으로 `context7_policy.md`를 폐기했고(커밋 `edb9b0a`), 사망 후보 4편(learning_policy·writing_style·coding_standards·tdd_policy)을 남겼어요(`docs/sum/session_2026-08-26_omp1738-harness-publish-context7-vision.md:97-102`). 이번 실측에서 writing_style·coding_standards는 생으로 복귀했고 learning_policy·tdd_policy는 약(병합 제안)으로 남아요.

## 1. 판정 방법

### 1.1 기준별 표식

| 기준 | ● (강) | ◐ (약) | ○ (없음) |
|---|---|---|---|
| ① 참조 | `harness-core` 포인터(A칸, 매 요청 본문), AGENTS.md 본문(Linked Modules 색인 제외), `.omp/skills`·`.omp/agents`·`checklists`·`templates`·`docs`(archive 제외)가 이름으로 가리킴 | 형제 규칙(`.omp/rules/harness-*`)의 교차 링크만 | AGENTS.md "Linked Modules" 색인 1줄뿐 |
| ② 배선 | `.omp/extensions/harness`·`.githooks` 코드가 이름을 인용하거나(§4.1) 그 규칙의 MUST를 집행(§4.2 의미 배선 표) | `scripts/harness-audit.sh`의 파일 존재 점수, `scripts/harness-sync.sh` 동기화 주석, 테스트 픽스처 경로뿐 | 없음 |
| ③ 흔적 | 2026-08-07 이후(최근 60일)에 규칙이 **적용·집행·개정**된 흔적 — 집행 이벤트/상태 파일(`audit.jsonl` 이벤트, 리뷰 사이드카, `.omp/harness-state`), 규칙을 근거로 한 결정·승격·개정(이슈·댓글·sum·커밋), PR 본문의 "적용한 규칙" 목록 | 60일 안이라도 **이름만 지나가는 언급**(파일 이동 목록, 링크 일괄 동기 커밋, lint 오탐 서술, 사망 후보 목록), 또는 60일 이전 흔적만 | 흔적 없음 |

### 1.2 기준 판정 (기계적)

- **생**: ● 2개 이상, 또는 `harness-core`가 `rule://`로 가리키는 규칙(ADR 002 A칸 포인터 — 매 요청 요지가 실리므로 ①만으로 생).
- **약**: ● 1개.
- **사**: ● 0개.

### 1.3 처분 제안 (기준 판정 + §6 내용 중복 분석)

- 생 → **유지**.
- 약 → 흡수 모체(§6)가 있으면 **병합**, 없으면 **유지**.
- 사 → 모체가 있으면 **병합**(고유 절을 옮김), 없으면 **폐기**.
- 병합 방향은 **살아 있는 쪽이 모체**예요(게이트 배선·외부 참조를 가진 파일이 남아요).
- **"조건부" 꼬리표**는 기준 판정과 무관하게, §6에서 SSOT 중복이나 stale 절 정리 과제가 확인된 **유지** 규칙에 붙여요(§7.3 — 내용 개정이라 별도 이슈). 이번에는 `code_review_policy`(임계값 3중 중복·심각도 라벨 불일치), `commit_and_pr`(PR 본문 템플릿 3종), `mcp_policy`(본문 절반 stale) 3편이에요. `coding_standards`는 임계값 SSOT의 **목적지**라 과제가 없어요.

한계: 이름 grep은 발동의 근사치예요. 문체·추측 금지처럼 매 턴 작동하는 규칙은 이름을 남기지 않고, 게이트가 집행하는 규칙은 이벤트 행으로만 남아요. 그래서 ③에는 이름 흔적과 집행 이벤트를 둘 다 적고, 흔적의 성격(적용/개정 vs 단순 언급)을 §5.3에서 하나씩 판정했어요. `docs/sum`·`docs/reviews`는 gitignore 로컬 전용이라 메인 체크아웃(`/home/rae/projects/workspace/omp`)의 사본을 읽기 전용으로 집계했어요 — 다른 머신에서는 그 두 열의 숫자가 달라요.

## 2. 판정표 (29편)

| # | 규칙 | ① | ② | ③ | 기준 판정 | 처분 제안 | 근거 요약 (경로) |
|---|---|---|---|---|---|---|---|
| 1 | adversarial_review | ● | ● | ● | 생 | 유지 | 스킬 `startdev`·`kickoff` 6회; `gates/review-gate.mjs:560` 인용, `audit.jsonl` `adversarial_review`×5·`review_override`×4(최근 2026-09-26); `docs/reviews` JSON 사이드카 35개(최근 2026-10-03) |
| 2 | agent_routing | ● | ● | ● | 생 | 유지 | AGENTS.md 본문 2, `gh-loop/SKILL.md`, `.omp/agents/reviewer.md`×2; `estimate-report.mjs:3`, review-gate 이종 모델 검사, `harness-audit.sh:147`; #79 dispatch 기록(2026-10-03) |
| 3 | agent_security | ◐ | ◐ | ◐ | 사 | **병합 → safety_security (M9)** | inbound는 `harness-prompt_engineering.md:174,341`뿐; `harness-audit.sh:293` 존재 점수(+2); 흔적은 커밋 `edb9b0a`(2026-08-26 Context7 폐기의 링크 동기)뿐 — 고유 MUST 3개는 모체로 옮겨요 |
| 4 | anti_hallucination | ● | ○ | ◐ | 생 | 유지 (M2 모체) | `harness-core.md:9` 포인터, AGENTS.md 본문 1; 게이트 없음; 2026-08-26 sum은 배선 9파일 동기 목록 언급 |
| 5 | assetization | ● | ○ | ● | 생 | 유지 (M4 모체) | `docs/decisions/README.md`; 이슈 #27(2026-09-03, ADR 규약 인라인 개정)·#26, sum 2026-09-26 |
| 6 | change_control | ● | ○ | ● | 생 | 유지 | `harness-core.md:12` 포인터, AGENTS.md 본문 2; `context-gate`는 :6이 언급만(read-before-edit는 integration_contract 소관); PR #72 본문 적용 규칙 목록(2026-10-02) |
| 7 | code_review_policy | ● | ◐ | ○ | 약 | 유지(조건부) | `checklists/code_review.md:3,25` "Full policy"; `harness-audit.sh:183`(+2), 픽스처 1; 이름 흔적 0 — 80% 확신 게이트·머지 기준·출력 표는 여기에만 있지만 임계값(50/800/4)이 `coding_standards`·체크리스트와 3중 중복(§6 A) |
| 8 | coding_standards | ◐ | ○ | ● | 약 | 유지 | `harness-hook_recipes.md:44`·`harness-code_review_policy.md` 교차 링크뿐; 게이트 없음; 이슈 #36(2026-10-01, EPIPE 규칙 개정), sum 2026-10-02, 커밋 4건(최근 2026-10-03) |
| 9 | commit_and_pr | ◐ | ○ | ● | 약 | 유지(조건부) | `harness-writing_style.md:95` 역할 분리뿐; 게이트 없음; sum 2026-09-28 "승격 → :25-27 머지 커밋 MUST" 개정 — 승격 목적지로 쓰이고 있어요. PR 본문 템플릿이 규칙·`checklists/pr.md`·`compr` 3곳에서 다른 것이 조건(§6 B) |
| 10 | context_management | ◐ | ◐ | ○ | 사 | **병합 → session_persistence (M3)** | `session_persistence`×3·`cycle_definition`×1 교차 링크; `harness-audit.sh:162,333` 존재 점수(+5); 흔적 0 — 모체는 살아 있는 쌍둥이 |
| 11 | core | ● | ◐ | ● | 생 | 유지 | `alwaysApply: true`(매 요청 본문); 테스트 픽스처 21회; 이슈 #49·#50·#52·#80, 커밋 `4965c53`(2026-10-03 언어 줄 개정) |
| 12 | cost_awareness | ○ | ◐ | ○ | 사 | **병합 → agent_routing (M1)** | 색인뿐; `harness-audit.sh:321` 존재 점수(+3); 흔적 0 — Haiku/Sonnet/Opus 고정 표가 `agent_routing`의 롤 체계와 이중 정의 |
| 13 | cycle_definition | ● | ● | ● | 생 | 유지 | `harness-core.md:10` 포인터, 스킬 3·templates 2; 게이트 코드 10회(`acceptance-gate.mjs:534` BLOCK, `kickoff-detector.mjs:30`, `estimate.mjs`, `index.ts:404`); `estimate_vs_actual`×16(최근 2026-10-03), `acceptance_wip`×22(최근 2026-10-01) |
| 14 | design_contract | ● | ○ | ● | 생 | 유지 | `templates/DESIGN.md:5` 역참조; 게이트 없음(소비 리포 계약); 이슈 #37(2026-09-24 신설)·#44, 댓글 #37(2026-10-06) |
| 15 | doc_standards | ● | ● | ● | 생 | 유지 | 스킬 6(`compr`·`compush`·`sum`·`design-mockup`), `docs/README.md`; `gates/archive-guard.mjs:4`, `.githooks/pre-push:26`, `mermaid-check.ts`; 이슈 #38(2026-09-26 핸드오프 보관 정책), sum 2026-09-26 |
| 16 | documentation_policy | ◐ | ◐ | ◐ | 사 | **병합 → writing_style (M7)** | inbound는 `harness-writing_style.md:9,51,97`뿐; 픽스처 1; 이슈 #49(2026-09-25)는 참조 언급 — 본문 5개 불릿, 이모지 금지는 writing_style R6이 재서술 |
| 17 | harness_integration_contract | ● | ● | ● | 생 | 유지 (M8 모체) | AGENTS.md 본문 1, `docs/harness/README.md`; `gates/backpressure-gate.mjs:95` BLOCK, `commit-gates.mjs:65`, `.githooks/pre-commit:12`; 이슈·PR 19건, reviews 16, sum 21 |
| 18 | hook_recipes | ◐ | ○ | ○ | 사 | **병합 → harness_integration_contract (M8)** | inbound `harness-session_persistence.md:79` 1회; 레시피 5종 중 `gates/`에 존재 0; 흔적 0 |
| 19 | information_discovery | ○ | ○ | ◐ | 사 | **병합 → anti_hallucination (M2)** | 색인뿐(`harness-core.md:9`는 anti_hallucination·repo_command_discovery만 가리킴); 커밋 `e97b8f8`(2026-09-26 `rules/` 잔존 서술 제거)뿐 — 스스로 twin 선언(:6) |
| 20 | learning_policy | ● | ◐ | ◐ | 약 | **병합 → assetization (M4)** | `templates/retro.md:26`; 픽스처 1; 2026-08-26 sum "사망 후보" 목록·커밋 `e97b8f8` 링크 동기 — retro 트리거가 `assetization:48-53`과 중복, 저장소 `MEMORY.md` 부재 |
| 21 | mcp_policy | ● | ● | ● | 생 | 유지(조건부) | AGENTS.md "MCP Server Policy" 본문 2; `gates/mcp-gate.mjs`(advisory, `index.ts:575`)가 DDL 패턴 경고; 커밋 `edb9b0a`(2026-08-26 Context7 폐기 기록 개정), sum 2026-09-07, 이슈 #21 — 본문 절반이 stale(§6 C)인 것이 조건 |
| 22 | prompt_engineering | ● | ◐ | ● | 생 | 유지 | `docs/prompt-writing-handbook.md`·`docs/README.md`; `scripts/harness-sync.sh:228` 짝 핸드북 동기화; 이슈 #23(2026-08-26 외과 수정 5건)·#24·#27·#28, 댓글 2026-09-23 |
| 23 | quality_gates | ● | ◐ | ◐ | 약 | **병합 → verification_tests_and_evals (M5)** | `checklists/quality_gate.md`; `harness-audit.sh:207`(+1); 유일 흔적은 2026-09-26 sum의 docs-drift 오탐 서술(`:74`) — 발견 순서·EVAL 조건이 형제 재서술, 전제 훅 `quality-gate.js` 부재 |
| 24 | repo_command_discovery | ● | ○ | ○ | 생 | 유지 | `harness-core.md:9` 포인터, AGENTS.md 본문 1(Non-Negotiables); 게이트 없음; 이름 흔적 0(매 작업 암묵 적용) |
| 25 | safety_security | ● | ● | ○ | 생 | 유지 (M9 모체) | `harness-core.md:8` 포인터; `gates/destructive-guard.mjs`(advisory)가 :8-14 일부 집행, `harness-audit.sh:287`(+2); 발동 기록 없음(advisory는 `HARNESS_DEBUG` 없이는 로그를 안 남겨요) |
| 26 | session_persistence | ● | ● | ● | 생 | 유지 (M3 모체) | `docs/architecture/harness-architecture.md:288,295`; `breadcrumb-tracker/-surface`가 :24-36을 집행, `harness-audit.sh:168,222`(+4); 집행 흔적 `session-log.jsonl` 2,068행(2026-10-03) — 단 `.omp/contexts/*` 절(:52-70)은 부재 |
| 27 | tdd_policy | ● | ◐ | ◐ | 약 | **병합 → verification_tests_and_evals (M6)** | AGENTS.md 본문 1(Core Principles 4); 픽스처 5; 2026-08-26 sum "사망 후보" 목록뿐 — 사이클 본문은 `startdev/references/tdd_rules.md`가 상세판 |
| 28 | verification_tests_and_evals | ● | ● | ● | 생 | 유지 (M5·M6 모체) | AGENTS.md 본문 3(Non-Negotiables), `checklists/quality_gate.md`; `backpressure-gate`가 "검증 없이 커밋 금지" 집행, `harness-audit.sh:213,271`(+2); PR #72 본문 적용 규칙 목록(2026-10-02), `test-history.json`(2026-10-01) |
| 29 | writing_style | ● | ◐ | ● | 생 | 유지 (M7 모체) | `harness-core.md:6` 포인터; 픽스처 4; 이슈 #49·#80(2026-10-03 참조 정정 개정), 댓글 #31·#49, 커밋 `4965c53` |

집계 — 기준 판정: 생 17 / 약 6 / 사 6. 처분 제안: 유지 20(조건부 3: code_review_policy·commit_and_pr·mcp_policy) / 병합 9(M1–M9) / 폐기 0.

## 3. 기준 ① 참조 여부 — 명령과 출력

열: `AGENTS` = AGENTS.md 전체 줄 수, `body` = "Linked Modules" 절을 뺀 AGENTS.md 줄 수, `skills` = `.omp/skills/**/*.md`, `rules` = 자기 파일을 뺀 `.omp/rules/*.md`, `agents` = `.omp/agents/*.md`, `chk/tpl` = `checklists/`·`templates/`·`INDEX.md`, `docs` = `docs/**/*.{md,yaml}`(이 문서 제외; `docs/harness/archive`·`docs/handoff`의 보관 문서가 포함되므로 ① 판정에서는 위치 목록으로 archive를 걸러요).

```bash
printf '%-36s %6s %4s %6s %5s %6s %7s %4s\n' rule AGENTS body skills rules agents chk/tpl docs
for f in .omp/rules/harness-*.md; do n=$(basename "$f" .md)
  a=$(grep -c "$n" AGENTS.md)
  b=$(awk '/^## Linked Modules/{skip=1} /^## Checklists/{skip=0} !skip' AGENTS.md | grep -c "$n")
  s=$(grep -rho "$n" .omp/skills --include='*.md' | wc -l)
  r=$(grep -rho "$n" .omp/rules --include='*.md' --exclude="$n.md" | wc -l)
  g=$(grep -rho "$n" .omp/agents --include='*.md' | wc -l)
  c=$(grep -rho "$n" checklists templates INDEX.md | wc -l)
  d=$(grep -rho "$n" docs --include='*.md' --include='*.yaml' --exclude='rules-liveness-audit-*.md' | wc -l)
  printf '%-36s %6s %4s %6s %5s %6s %7s %4s\n' "$n" "$a" "$b" "$s" "$r" "$g" "$c" "$d"
done
```

```text
rule                                 AGENTS body skills rules agents chk/tpl docs
harness-adversarial_review                1    0      6     6      0       0    0
harness-agent_routing                     3    2      1     3      2       0    2
harness-agent_security                    1    0      0     4      0       0    0
harness-anti_hallucination                2    1      0     5      0       0    0
harness-assetization                      1    0      0     0      0       0    2
harness-change_control                    3    2      0     4      0       0    0
harness-code_review_policy                1    0      0     0      0       4    0
harness-coding_standards                  1    0      0     3      0       0    0
harness-commit_and_pr                     1    0      0     2      0       0    0
harness-context_management                1    0      0     5      0       0    0
harness-core                              5    5      1     1      0       1   15
harness-cost_awareness                    1    0      0     0      0       0    0
harness-cycle_definition                  2    1      3     6      0       2    2
harness-design_contract                   1    0      0     0      0       1    0
harness-doc_standards                     1    0      6     7      0       0    2
harness-documentation_policy              1    0      0     6      0       0    0
harness-harness_integration_contract      2    1      0     5      0       0    2
harness-hook_recipes                      1    0      0     1      0       0    0
harness-information_discovery             1    0      0     0      0       0    0
harness-learning_policy                   1    0      0     1      0       1    0
harness-mcp_policy                        3    2      0     0      0       0    0
harness-prompt_engineering                1    0      0     0      0       0    7
harness-quality_gates                     1    0      0     2      0       1    0
harness-repo_command_discovery            2    1      0     4      0       0    0
harness-safety_security                   1    0      0     2      0       0    0
harness-session_persistence               1    0      0     2      0       0    2
harness-tdd_policy                        2    1      0     0      0       0    0
harness-verification_tests_and_evals      4    3      0     4      0       1    0
harness-writing_style                     2    0      0     1      0       0    2
```

읽는 법: `AGENTS=1, body=0`은 "Linked Modules" 색인 한 줄뿐이라는 뜻이에요(29편 전부 색인에는 있어요 — 그래서 색인은 ① 판정에서 제외했어요). `harness-core`의 포인터(`grep -noE 'rule://harness-[a-z_]+' .omp/rules/harness-core.md`)는 `writing_style`(:6)·`safety_security`(:8)·`anti_hallucination`·`repo_command_discovery`(:9)·`cycle_definition`(:10)·`change_control`(:12) 6편이에요. `docs` 열의 위치: `agent_routing` → `docs/architecture/workflow-lifecycle.md`; `assetization` → `docs/decisions/README.md`; `cycle_definition` → `docs/rules/seed_contract.md`(+archive); `doc_standards` → `docs/README.md`; `harness_integration_contract` → `docs/harness/README.md`(+archive); `prompt_engineering` → `docs/prompt-writing-handbook.md`·`docs/README.md`·`docs/decisions/README.md`; `session_persistence` → `docs/architecture/harness-architecture.md`; `writing_style` → `docs/decisions/002-…`(+archive). 참조 위치 전체 목록은 아래 명령으로 다시 뽑을 수 있어요(출력 약 190줄이라 본문에는 싣지 않았어요):

```bash
for f in .omp/rules/harness-*.md; do n=$(basename "$f" .md); echo "## $n"
  grep -rc "$n" AGENTS.md INDEX.md .omp/skills .omp/agents .omp/rules checklists templates docs \
    --include='*.md' --include='*.yaml' --exclude='rules-liveness-audit-*.md' | grep -v ':0$' | grep -v "^$f:"
done
```

frontmatter 실측(`awk` 추출): 29편 중 `harness-core`만 `alwaysApply: true`, 나머지 28편은 `description`만 있어요. `globs`·`condition`(TTSR)은 0편 — ADR 002 부속 결정 5("TTSR은 범위 밖")와 일치해요.

## 4. 기준 ② 게이트 배선 — 명령과 출력

### 4.1 코드가 이름을 인용하는가

열: `gates` = `.omp/extensions/harness/**/*.{ts,mjs}`(tests 제외), `tests` = `.omp/extensions/harness/tests/`, `hooks` = `.githooks/`, `scripts` = `scripts/`.

```bash
printf '%-36s %5s %6s %7s %8s\n' rule gates tests hooks scripts
for f in .omp/rules/harness-*.md; do n=$(basename "$f" .md)
  c=$(grep -rho "$n" .omp/extensions/harness --include='*.ts' --include='*.mjs' --exclude-dir=tests | wc -l)
  t=$(grep -rho "$n" .omp/extensions/harness/tests | wc -l)
  h=$(grep -rho "$n" .githooks | wc -l)
  s=$(grep -rho "$n" scripts | wc -l)
  printf '%-36s %5s %6s %7s %8s\n' "$n" "$c" "$t" "$h" "$s"
done
grep -rnE "readFileSync\([^)]*rules" .omp/extensions/harness --include='*.ts' --include='*.mjs' --exclude-dir=tests | wc -l
```

```text
rule                                 gates  tests   hooks  scripts
harness-adversarial_review               1      0       0        0
harness-agent_routing                    1      0       0        3
harness-agent_security                   0      0       0        3
harness-anti_hallucination               0      0       0        0
harness-assetization                     0      0       0        0
harness-change_control                   0      0       0        0
harness-code_review_policy               0      1       0        3
harness-coding_standards                 0      0       0        0
harness-commit_and_pr                    0      0       0        0
harness-context_management               0      0       0        6
harness-core                             0     21       0        0
harness-cost_awareness                   0      0       0        3
harness-cycle_definition                10      3       0        0
harness-design_contract                  0      0       0        0
harness-doc_standards                    1      0       1        0
harness-documentation_policy             0      1       0        0
harness-harness_integration_contract     2      0       1        0
harness-hook_recipes                     0      0       0        0
harness-information_discovery            0      0       0        0
harness-learning_policy                  0      1       0        0
harness-mcp_policy                       0      2       0        0
harness-prompt_engineering               0      0       0        1
harness-quality_gates                    0      0       0        3
harness-repo_command_discovery           0      0       0        0
harness-safety_security                  0      0       0        3
harness-session_persistence              0      0       0        6
harness-tdd_policy                       0      5       0        0
harness-verification_tests_and_evals     0      0       0        5
harness-writing_style                    0      4       0        0
0
```

- 마지막 `0`: 런타임에 규칙 파일 본문을 `readFileSync`로 읽는 게이트는 없어요. 게이트는 규칙을 **읽지 않고** 자기 로직으로 집행하며, 사용자에게 보이는 메시지·주석에서 규칙 경로를 인용할 뿐이에요.
- `gates` 열의 인용 위치(`grep -rnE 'harness-(cycle_definition|adversarial_review|doc_standards|harness_integration_contract|agent_routing)' .omp/extensions/harness --exclude-dir=tests .githooks`): `acceptance-gate.mjs:530,534`(BLOCK 메시지) · `kickoff-detector.mjs:30`(REMINDER) · `estimate.mjs:1,20` · `index.ts:399,404` · `review-gate.mjs:471`(cycle_definition), `review-gate.mjs:560`(adversarial_review override 선례), `archive-guard.mjs:4` · `.githooks/pre-push:26`(doc_standards), `commit-gates.mjs:65` · `backpressure-gate.mjs:95`(BLOCK 메시지) · `.githooks/pre-commit:12`(harness_integration_contract), `estimate-report.mjs:3` · `gh-loop-record.mjs:2`(agent_routing·cycle_definition).
- `tests` 열은 전부 **픽스처 경로**예요(`risk-assess.test.mjs:51-56`이 docs-only 분류 샘플로 규칙 경로를 쓰고, `harness-sync.test.mjs`가 글롭 동기화 샘플로 `harness-core`·`harness-writing_style`을 써요). 집행 근거가 아니라 ◐로 셌어요.
- `scripts` 열은 전부 `scripts/harness-audit.sh`의 **파일 존재 점수**예요(`prompt_engineering`만 `harness-sync.sh:228` 짝 핸드북 주석). 현재 점수 `bash scripts/harness-audit.sh --terse` → `TOTAL: 51/70`. 존재 점수가 걸린 규칙과 점수: `agent_routing`(+1 tool_coverage) · `context_management`(+3 context_efficiency, +2 cost_efficiency) · `session_persistence`(+2 context_efficiency, +2 memory_persistence) · `code_review_policy`(+2 quality_gates) · `quality_gates`(+1) · `verification_tests_and_evals`(+2 quality_gates, +EDD 패턴 eval_coverage) · `safety_security`(+2 security_guardrails) · `agent_security`(+2) · `cost_awareness`(+3 cost_efficiency). 이 파일들을 지우거나 개명하면 점수가 내려가므로(#49·#50 AC "점수가 내려가지 않는다") 병합 사이클은 `harness-audit.sh`를 같이 고쳐야 해요.
- `risk-assess.mjs:36`은 `.omp/rules/harness-*.md`를 docs-only(저위험) 경로 클래스로 분류해요 — 규칙 편집 커밋은 review-gate가 리뷰를 요구하지 않는다는 뜻이고, 이 감사의 커밋도 그 경로예요.

### 4.2 의미 배선 — 어느 게이트가 어느 규칙의 MUST를 집행하는가

이름 인용과 별개로, `index.ts`가 배선한 게이트(`grep -oE '"[a-z-]+\.mjs"' index.ts` 12종 + `.githooks/pre-commit`의 `commit-gates` 4종 + in-process `mermaid-check`)의 헤더 주석(`sed -n 1,12p gates/*.mjs`)과 규칙 본문을 대조한 결과예요.

| 게이트 (배선 위치) | 집행하는 규칙 절 | 성격 |
|---|---|---|
| `context-gate` + `read-tracker` + `write-tracker` (`index.ts` tool_call Edit/Write) | read-before-edit — `harness_integration_contract` §필수 게이트(`change_control:6`은 언급만, 그 규칙의 MUST인 최소 변경은 집행 안 함) | BLOCK |
| `acceptance-gate` (`.githooks/pre-commit` → `commit-gates`) | `cycle_definition` "AC는 커밋 시점에 판정 가능"(:534 메시지), `docs/rules/scope_self_detect_policy.md`(harness-* 아님) | BLOCK |
| `backpressure-gate` + trackers (`commit-gates`) | `verification_tests_and_evals` "검증 없이 완료 금지", `harness_integration_contract` §3(:95 메시지) | BLOCK |
| `review-gate` (`commit-gates`) | `adversarial_review` 불변식 3(JSON 사이드카)·override(:560), `agent_routing` 리뷰어 트리거(high/critical)·이종 모델 2 패밀리 검사; `code_review_policy`는 **간접**(리뷰 존재만 검사, 심각도 정의는 안 읽음) | BLOCK |
| `archive-guard` (`commit-gates`, `.githooks/pre-push`) | `doc_standards` §Local Archives(:4 주석, pre-push:26) | BLOCK |
| `mermaid-check.ts` (in-process, 저장 시) | `doc_standards` R1 | advisory |
| `destructive-guard` (`index.ts:538`) | `safety_security:8-14` 중 `rm -rf`·`git reset --hard`·`git clean -f`·`sed -i`(force push·DB migration·prod는 패턴 없음) | advisory |
| `mcp-gate` (`index.ts:575`) | `mcp_policy` Supabase DDL MUST(서버명 무관 패턴) | advisory |
| `kickoff-detector` (`index.ts` before_agent_start) | `cycle_definition` 인테이크(:30 REMINDER) | advisory |
| `estimate.mjs` / `estimate-report.mjs` / `gh-loop-record.mjs` | `cycle_definition` "예상 레코드", `agent_routing` 등급 갱신 원자료 | 기록 |
| `breadcrumb-tracker` + `breadcrumb-surface` (`index.ts` tool_result/session_start) | `session_persistence:24-36`(수동 sum + breadcrumb 보완) | 기록 |
| `harness-version-check` (session_start) | `harness_integration_contract`(버전 드리프트·`.omp/AGENTS.md` 그림자) | advisory |

게이트가 전혀 닿지 않는 규칙(②=○ 9편): `anti_hallucination`, `assetization`, `change_control`, `coding_standards`, `commit_and_pr`, `design_contract`, `hook_recipes`, `information_discovery`, `repo_command_discovery`. 이 중 `harness-core`가 가리키는 `anti_hallucination`·`change_control`·`repo_command_discovery`는 "게이트 없는 상시 규칙"이고, 나머지는 읽혀야 작동하는 B칸 규칙이에요.

## 5. 기준 ③ 최근 발동 사례 — 명령과 흔적

### 5.1 이름 흔적 집계 (건수 + 최근 날짜)

`core`는 `harness-core`로, 나머지는 접두사 유무와 무관하게 토큰 단위(`(^|[^a-z_])<name>([^a-z_]|$)` — `harness-<name>`·`rules/<name>.md`·`rule://<name>`·맨 이름 모두)로 세어 2026-09-26 개명 이전 표기도 잡았어요. 열: `audit` = `docs/harness/audit.jsonl` 행 수, `sum` = `$MAIN/docs/sum/*.md` 파일 수와 최근 파일 날짜, `rev` = `$MAIN/docs/reviews/` 파일 수와 최근 날짜, `iss`/`cmt` = 이름이 나오는 이슈(PR 포함)·댓글 수와 최근 생성일(`gh api … --paginate` 스냅샷 84·131건), `git` = 커밋 메시지 수와 최근 커밋일.

```bash
MAIN=/home/rae/projects/workspace/omp   # docs/sum·docs/reviews는 로컬 전용(gitignore) — 메인 체크아웃 사본
mkdir -p /tmp/rules-audit-29
gh api "repos/{owner}/{repo}/issues?state=all&per_page=100" --paginate \
  --jq '.[] | "### issue#\(.number) \(.title) [\(.state)] \(.created_at)\n\(.body // "")\n"' > /tmp/rules-audit-29/issues.md
gh api "repos/{owner}/{repo}/issues/comments?per_page=100" --paginate \
  --jq '.[] | "### comment \(.issue_url | sub(".*/";"#")) \(.created_at)\n\(.body // "")\n"' > /tmp/rules-audit-29/comments.md
latest() { grep -oE '20[0-9]{2}-[0-9]{2}-[0-9]{2}' | sort | tail -1; }
printf '%-29s %5s %3s %-10s %3s %-10s %3s %-10s %3s %-10s %3s %-10s\n' rule audit sum latest rev latest iss latest cmt latest git latest
for f in .omp/rules/harness-*.md; do n=$(basename "$f" .md); s=${n#harness-}
  if [ "$s" = core ]; then p="harness-core"; else p="(^|[^a-z_])$s([^a-z_]|$)"; fi
  a=$(git show 0f205a7:docs/harness/audit.jsonl | grep -cE "$p")          # 감사 기준 커밋에 고정
  sf=$(grep -lE "$p" $MAIN/docs/sum/*.md 2>/dev/null | xargs -rn1 basename); su=$(echo "$sf" | grep -c .); sl=$(echo "$sf" | latest)
  rf=$(grep -rlE "$p" $MAIN/docs/reviews 2>/dev/null | xargs -rn1 basename); rv=$(echo "$rf" | grep -c .); rl=$(echo "$rf" | latest)
  il=$(awk -v p="$p" '/^### issue#/{cur=$2; d=substr($NF,1,10)} $0 ~ p && cur!=""{seen[cur]=d} END{for(k in seen)print seen[k]}' /tmp/rules-audit-29/issues.md); is=$(echo "$il" | grep -c .); isl=$(echo "$il" | latest)
  cl=$(awk -v p="$p" '/^### comment/{cur=$3; d=substr($4,1,10)} $0 ~ p && cur!=""{seen[cur]=d} END{for(k in seen)print seen[k]}' /tmp/rules-audit-29/comments.md); cm=$(echo "$cl" | grep -c .); cml=$(echo "$cl" | latest)
  gl=$(git log 0f205a7 --format=%ad --date=short -E --grep="$p"); gc=$(echo "$gl" | grep -c .); gll=$(echo "$gl" | latest)
  printf '%-29s %5s %3s %-10s %3s %-10s %3s %-10s %3s %-10s %3s %-10s\n' "$s" "$a" "$su" "$sl" "$rv" "$rl" "$is" "$isl" "$cm" "$cml" "$gc" "$gll"
done
```

```text
rule                          audit sum latest     rev latest     iss latest     cmt latest     git latest    
adversarial_review                6  13 2026-10-02   0              3 2026-10-02   2 2026-10-02   3 2026-10-01
agent_routing                     0   9 2026-09-25   3 2026-07-21   8 2026-10-03   2 2026-10-03   4 2026-10-04
agent_security                    0   0              0              0              0              1 2026-08-26
anti_hallucination                0   1 2026-08-26   0              0              0              1 2026-08-26
assetization                      0   3 2026-09-26   0              2 2026-09-03   0              1 2026-08-26
change_control                    0   0              0              2 2026-10-02   0              0           
code_review_policy                0   0              0              0              0              0           
coding_standards                  0   9 2026-10-02   0              3 2026-10-01   0              4 2026-10-03
commit_and_pr                     0   2 2026-09-28   0              0              0              0           
context_management                0   0              0              0              0              0           
core                              1   4 2026-09-28   0              4 2026-10-03   2 2026-10-03   5 2026-10-03
cost_awareness                    0   0              0              0              0              0           
cycle_definition                  0   9 2026-09-29   3 2026-09-23   4 2026-10-03   0              1 2026-09-26
design_contract                   0   2 2026-09-24   0              2 2026-09-24   1 2026-10-06   0           
doc_standards                     0   5 2026-09-26   2 2026-07-08   4 2026-09-26   1 2026-09-24   2 2026-09-26
documentation_policy              0   0              0              2 2026-09-25   0              0           
harness_integration_contract      2  21 2026-10-02  16 2026-10-03  19 2026-10-06   3 2026-10-02   5 2026-09-26
hook_recipes                      0   0              0              0              0              0           
information_discovery             0   0              0              0              0              1 2026-09-26
learning_policy                   0   1 2026-08-26   0              0              0              1 2026-09-26
mcp_policy                        0   7 2026-09-07   0              2 2026-08-03   0              1 2026-08-26
prompt_engineering                0   3 2026-09-24   0              4 2026-09-03   2 2026-09-23   3 2026-08-26
quality_gates                     0   1 2026-09-26   0              0              0              0           
repo_command_discovery            0   0              0              0              0              0           
safety_security                   0   0              0              0              0              0           
session_persistence               0   1 2026-06-18   0              0              0              1 2026-06-18
tdd_policy                        0   1 2026-08-26   0              0              0              0           
verification_tests_and_evals      0   2 2026-09-26   0              4 2026-10-02   0              1 2026-09-26
writing_style                     0   4 2026-09-28   1 2026-10-02   5 2026-10-03   3 2026-10-03   3 2026-10-03
```

스냅샷 규모: `docs/sum` 45파일(2026-06~10, 최근 `session_2026-10-02_ghloop-dispatch-labels-session-decision.md`), `docs/reviews` 94파일(JSON 사이드카 35, 최근 `review-2026-10-03-151425.json`), `audit.jsonl`은 main `0f205a7` 기준 186행(`^{"ts"` 월별: 2026-06 35 · 07 73 · 08 1 · 09 54 · 10 23 — 이 브랜치는 #29의 `gh_loop_dispatched`·`thread_opened`·`gh_loop_closed`·`thread_closed`·`task_closed` 5행을 더해요), 이슈+PR 84 · 댓글 131.

일괄 언급 소스(③에서 ◐로 셈): 커밋 `edb9b0a`(2026-08-26, Context7 폐기 — "배선 9파일 동기"로 여러 규칙 링크를 한꺼번에 고침), 커밋 `e97b8f8`(2026-09-26, `rules/` 잔존 서술 제거), `docs/sum/session_2026-09-26_policy-retier-cycles-*.md`(29편 이동 목록), `session_2026-08-26_…context7-vision.md:101`(사망 후보 4편 목록).

### 5.2 집행 이벤트 흔적 (이름 없이 남는 발동)

```bash
for e in adversarial_review review_override review_remediation acceptance_wip scope_self_detect estimate_vs_actual gh_loop_dispatched gh_loop_closed policy_update; do
  echo "$e: n=$(git show 0f205a7:docs/harness/audit.jsonl | grep -c "\"event\":\"$e\"") last=$(git show 0f205a7:docs/harness/audit.jsonl | grep "\"event\":\"$e\"" | tail -1 | grep -oE '"ts":"[^"]+"' | head -1)"; done
```

| 이벤트 | n | 최근 | 발동한 규칙 |
|---|---|---|---|
| `adversarial_review` | 5 | 2026-07-30 | adversarial_review(3-pass 라운드 기록) |
| `review_override` | 4 | 2026-09-26 | adversarial_review 블로킹 해제 경로, review-gate |
| `review_remediation` | 3 | 2026-07-30 | adversarial_review·code_review_policy |
| `acceptance_wip` | 22 | 2026-10-01 | cycle_definition(acceptance-gate WIP 레인) |
| `scope_self_detect` | 1 | 2026-07-30 | docs/rules/scope_self_detect_policy(harness-core 한 줄) |
| `estimate_vs_actual` | 16 | 2026-10-03 | cycle_definition 예상 레코드·agent_routing 등급 원자료 |
| `gh_loop_dispatched`/`gh_loop_closed` | 1/1 | 2026-10-03 | agent_routing(모델·에포트 기록 — 이 브랜치가 #29의 dispatch·closed 행을 더해요) |
| `policy_update` | 1 | 2026-07-30 | adversarial_review 불변식 4 갱신(`rules/adversarial_review.md` 인용) |

로컬 상태(메인 체크아웃 `.omp/harness-state/`): `session-log.jsonl` 2,068행(2026-10-03 — breadcrumb, `session_persistence` 집행), `read-log.txt` 2,994행(2026-10-03 — context-gate), `test-history.json` 797행(2026-10-01 — backpressure, `verification_tests_and_evals` 집행), `hook-debug.log` 4행(2026-09-22 — `HARNESS_DEBUG` 없이는 advisory 게이트의 발동이 기록되지 않아요). `docs/reviews` JSON 사이드카 35편은 `adversarial_review` 불변식 3의 발동 흔적이에요.

### 5.3 규칙별 인용과 성격 판정 (● 적용·집행·개정 / ◐ 언급·오래됨 / ○ 없음)

| 규칙 | ③ | 인용 |
|---|---|---|
| adversarial_review | ● | `docs/reviews/review-2026-10-03-151425.json`(PR #81 사이드카, het fable+gpt-6-astra); `audit.jsonl` `review_override` 2026-09-26(#48 통합 머지); sum `session_2026-10-02_ghloop-dispatch-labels-session-decision.md`; 이슈 #39 |
| agent_routing | ● | #79 댓글·`gh_loop_dispatched`(2026-10-03, 모델 롤·추천 규칙표 결정); 커밋 `16e5ba6`; sum `session_2026-09-25_omp1830-friction-fix-pr44-2026.80.md`; 이슈 #32·#39·#41·#44 |
| agent_security | ◐ | 커밋 `edb9b0a`(2026-08-26) 본문의 링크 동기 목록뿐 — sum·reviews·이슈·audit 없음 |
| anti_hallucination | ◐ | sum `session_2026-08-26_…context7-vision.md:36`("배선 9파일 동기" 목록); 커밋 `edb9b0a` — `harness-core:9`가 매 요청 요지를 싣지만 이름 흔적으로는 언급뿐 |
| assetization | ● | 이슈 #27(2026-09-03, ADR 규약을 규칙에 인라인하는 개정 결정)·#26; `docs/decisions/README.md`; sum `session_2026-09-26_policy-retier-cycles-1-2.md` |
| change_control | ● | PR #72 본문 "`harness-change_control`, `harness-verification_tests_and_evals`, … 를 적용합니다"(2026-10-02) — 적용 기록; 이슈 #16(2026-07-22) |
| code_review_policy | ○ | **흔적 없음**(이름 기준). 간접: review-gate 사이드카 35편이 리뷰 존재를 증명하지만 이 규칙의 심각도·80% 게이트 적용 여부는 사이드카에 안 남아요 |
| coding_standards | ● | 이슈 #36(2026-10-01, EPIPE 리스너 규칙 :46 개정); sum `session_2026-10-02_ghloop-dispatch-labels-session-decision.md`; 커밋 4건(최근 2026-10-03) |
| commit_and_pr | ● | sum `session_2026-09-28_retier-merges-2026.84-mac-parity.md:28`("승격 → `harness-commit_and_pr.md` merge commit for branches that carry a tag" — :25-27 MUST가 이때 들어간 개정); sum 2026-09-07 |
| context_management | ○ | **흔적 없음** |
| core | ● | 이슈 #49·#50·#52·#80, 댓글 #49·#50; 커밋 `4965c53`(2026-10-03, 언어 줄 개정)·`d0e91b7`·`57802d7`; `audit.jsonl` thread_closed(#49) |
| cost_awareness | ○ | **흔적 없음** |
| cycle_definition | ● | `audit.jsonl` `estimate_vs_actual` 2026-10-03(#79)·`acceptance_wip` 2026-10-01; reviews `review-2026-09-23-220120.md`; sum `session_2026-09-29_issue56-closeout-ac-record-pr59.md`; 이슈 #18·#32·#39 |
| design_contract | ● | 이슈 #37(2026-09-24, 규칙 신설)·#44; 댓글 #37(2026-10-06); sum `session_2026-09-24_issues-38-36-37-handoff-execpath-design-contract.md`; `docs/handoff/handoff_2026-09-23_design-contract.md` |
| doc_standards | ● | 이슈 #38(2026-09-26, 핸드오프 보관 정책 결정)·#49, 댓글 #38; sum `session_2026-09-26_policy-retier-cycles-3-8.md`; reviews `review-2026-07-08-archive-guard.md`; `.githooks/pre-push` 실행마다 |
| documentation_policy | ◐ | 이슈 #49(2026-09-25)·#16 본문의 참조 언급뿐; sum·reviews 없음 |
| harness_integration_contract | ● | 이슈·PR 19건(최근 2026-10-06); reviews 16편(최근 `review-2026-10-03-145639.md`); sum 21편(최근 2026-10-02); `audit.jsonl` review_override×2 |
| hook_recipes | ○ | **흔적 없음** |
| information_discovery | ◐ | 커밋 `e97b8f8`(2026-09-26, `rules/` 잔존 서술 제거)뿐 |
| learning_policy | ◐ | sum `session_2026-08-26_…context7-vision.md:101`("사망 후보 4편 잔존" 목록); 커밋 `e97b8f8` 링크 동기 |
| mcp_policy | ● | 커밋 `edb9b0a`(2026-08-26, Context7 폐기 기록을 이 규칙에 추가하는 개정); sum `session_2026-09-07_fable51-consumer-safe-sync-2026.75.md`; 이슈 #5·#21 |
| prompt_engineering | ● | 이슈 #23(2026-08-26, 외과 수정 5건 개정)·#24·#27·#28, 댓글 #28·#9(최근 2026-09-23); sum `session_2026-09-24_…design-contract.md`; 커밋 `ee9ae47`·`8227dcb`·`10ba6ba` |
| quality_gates | ◐ | sum `session_2026-09-26_policy-retier-cycles-3-8.md:74`(docs-drift `extractHookRefs` 오탐 원인 서술에 이름이 나올 뿐) |
| repo_command_discovery | ○ | **흔적 없음**(이름 기준; 매 작업의 명령 발견은 기록되지 않아요) |
| safety_security | ○ | **흔적 없음**(이름 기준; destructive-guard는 advisory라 로그를 안 남겨요) |
| session_persistence | ● | 집행 흔적 `session-log.jsonl` 2,068행(breadcrumb-tracker, 2026-10-03); 이름 흔적은 sum `session_2026-06-18_autonomy-q1-breadcrumb.md`·커밋 `ccd72a4`(도입 세션) |
| tdd_policy | ◐ | sum `session_2026-08-26_…context7-vision.md:101`("사망 후보 4편" 목록)뿐 |
| verification_tests_and_evals | ● | PR #72 본문 적용 규칙 목록(2026-10-02); 이슈 #41·#55; sum `session_2026-09-26_policy-retier-cycles-1-2.md`·`-3-8.md`; `test-history.json` 797행(backpressure 집행, 2026-10-01) |
| writing_style | ● | 이슈 #49·#80(2026-10-03, 참조 정정 개정), 댓글 #31·#49; 커밋 `4965c53`·`e490688`; reviews `review-2026-10-02-153539.md`; sum `session_2026-09-28_retier-merges-2026.84-mac-parity.md` |

## 6. 내용 중복 분석 (병합 제안의 근거)

3개 그룹으로 나눠 규칙 본문을 전수 대조한 결과예요(읽기 전용 scout 3개, `file:line` 인용). 병합 쌍마다 "무엇이 겹치는가"와 "병합 시 잃는 고유 내용"을 적었어요 — 후속 사이클이 이 목록을 보고 옮길 절을 고르면 돼요.

### A. 검증·리뷰 계열
- **quality_gates → verification_tests_and_evals**: 발견 순서(:26-36)는 `repo_command_discovery:12-20` 재서술, EVAL 조건(:50)은 `verification:92-100` 동일 목록, fast-gate(:84-88)는 3중. 전제 훅 `quality-gate.js`(:6,:72)는 `.omp/extensions`에 없어요. 잃는 것: 6 게이트 **정규 이름**(:12-21), 트리거별 필수 게이트 표(:42-48), 억제 주석 금지 조건(:63-66) — 이 셋만 verification으로 옮기면 돼요. `checklists/quality_gate.md`가 전체를 복제하고 있어 링크 갱신 1곳.
- **tdd_policy → verification_tests_and_evals**: RED/GREEN/TIDY 본문(:12-30)은 `.omp/skills/startdev/references/tdd_rules.md:3-75`가 상세판, "무관한 변경 금지"(:17-30)는 `harness-core:12`. 예외 절차(:72-77)의 1·2단계는 `change_control:43-46`·`verification:24-27`과 겹치지만 **3단계 "Get explicit approval before proceeding without TDD"는 두 모체에 없어요** — 보존 대상이에요. 잃는 것: 커버리지 80–100% 목표(:33-36), TDD 생략 전 명시 승인(:77), e2e 체크리스트 포맷(:40-70 — 리포 전체에 `e2e_*.md` 0건이라 폐기 가능).
- **code_review_policy(유지, 조건부)**: 80% 확신 게이트·머지 기준·출력 표·silent-failure 표는 이 규칙에만 있고 `.omp/agents/code-reviewer.md`·`reviewer.md`는 절차만 담아요. 다만 임계값 50/800/4가 `coding_standards:50-72`·`checklists/code_review.md:62-66`과 3중이고, 심각도 라벨이 `adversarial_review:67-73`(3단계, HIGH 비블로킹)과 **다르게 정의**돼 있어요. 조건: 임계값 SSOT를 `coding_standards`로 두고 여기선 참조만.

### B. 운영·프로세스 계열
- **cost_awareness → agent_routing**: Haiku/Sonnet/Opus 고정 표(:12-16)가 `agent_routing:41-43`의 롤 체계(`modelRoles.slow/advisor`, `smol/default/slow/plan`)와 같은 개념을 벤더명으로 이중 정의하고, `agent_routing:43`이 "기준은 estimate-report 실측으로 갱신"이라 정적 표를 대체해요. 재독 회피(:30-33)는 context-gate/read-tracker가 기계 집행. 잃는 것: eval 리포트에 모델·토큰·비용 기재(:20-23), 병렬 호출 SHOULD(:25-28 — 시스템 프롬프트 Tool Policy가 이미 요구). `~/.omp/metrics/costs.jsonl`(:6-8)은 생성 코드 없음.
- **information_discovery → anti_hallucination**: :6이 스스로 `repo_command_discovery`의 twin이라 선언, :26 "무엇을 검색했는지 말하라"는 `anti_hallucination:36-38` Exception Protocol, :9-11 "false negative = fabrication"은 `anti_hallucination:6-14`. `harness-core:9` 후반("없다는 결론은 넓게 검색한 뒤에만")이 요지. 잃는 것: 알려진 경로 vs 클래스 판별(:13-18), 3단 스윕 순서(:23-25). stale: `Explore` 에이전트(:30, 현 `scout`), `claudedocs/` 규약 디렉터리(:24).
- **context_management → session_persistence**: `session_persistence:6,:10,:77`이 세 번 "context_management가 WHEN/WHAT, 이 파일이 HOW/WHERE"라 자기 정의해요 — 한 파일이 자연스럽고, 살아 있는 쪽(breadcrumb 배선·architecture 링크·집행 흔적 보유)이 모체예요. Self-Check(`context_management:117-124`) ↔ `session_persistence:85-89`. 옮길 것: 컴팩션 시점(:14-26)·보존 MUST 목록(:30-39)·`<remember>`/notepad(:56-85). 폐기할 것: `~/.claude/scripts` 절(:90-114 — Context7 폐기 이후 낡았고 :103 주석이 스스로 무효화). 모체 쪽 stale: `.omp/contexts/{dev,review,research}.md` 전부 부재(:52-70), `MEMORY.md`/auto-memory 모순(learning_policy:31 ↔ session_persistence:20).
- **learning_policy → assetization**: 캡처 트리거(:12-17) ↔ `assetization:48-53` retro 트리거, "Duplicate: link instead"(:38) ↔ `documentation_policy:35`. 잃는 것: 좋은 학습 4기준(:19-24), Vague/Unverified/Duplicate 금지(:36-38). stale: 저장 티어 `MEMORY.md`(:31) 부재.
- **commit_and_pr(유지, 조건부)**: 검증 명시(:11-14) ↔ `harness-core:7`·`checklists/pr.md:3`, PR 본문 필수항목(:16-23) ↔ `checklists/pr.md:2-6`·`compr` §5·`templates/pr_body.md` — 규칙·체크리스트·스킬이 **서로 다른** PR 본문 템플릿 3종을 제시해요. 고유한 것: "작고 리뷰 가능한 단위로 커밋" SHOULD(:6-9 — 리포 어디에도 같은 지침이 없음)와 "태그/스탬프 브랜치는 머지 커밋(squash 금지)" MUST(:25-27 — 2026-09-28 승격으로 들어온 절). 조건: PR 본문 템플릿의 SSOT를 한 곳(`templates/pr_body.md`)으로 정하고 나머지 두 곳은 참조만.

### C. 문서·보안·인프라 계열
- **documentation_policy → writing_style**: 제목부터 "Optional Module", "if adopted"(:16,:33) 2회 — 채택 여부가 미정인데 `writing_style:51`은 이를 MUST로 인용해요. 이모지 금지(:16-18) ↔ `writing_style:51-52`, 코드 주석 영어(:14) ↔ `harness-core:5`, README vs INDEX(:20-23) ↔ `AGENTS.md:7-11`. 잃는 것: 한/영 독자 분리 SHOULD(:12-13), UTF-8 NO-BOM(:26), latest-only 옵션(:33-37). `.ps1` BOM 예외(:27)는 리포에 `.ps1` 0개.
- **hook_recipes → harness_integration_contract**: 이벤트 4종 표(:17-24)·페이로드(:28-36)·fail-open(:129)은 `index.ts:5-22,389-392,569,579`와 일치하는 OMP 시대 내용이지만, 레시피 5종(:42-121 — 800줄 차단·TODO 경고·테스트 리마인더·자동 포맷·tmux 차단)은 `gates/` 22개 파일 어느 것과도 대응하지 않아요. runGate 스폰 패턴(:137-139)은 `harness_integration_contract:9`와 동일. 잃는 것: 이벤트별 차단 가능 여부 표, 페이로드 스키마 — contract의 Gate Location 절 옆에 붙이면 돼요.
- **agent_security → safety_security**: 외부 링크 감사·숨은 문자 탐지·MCP 공급망 MUST 3개(:14-49)와 OWASP 표(:94-104)는 다른 규칙에 없는 고유 내용이고 `prompt_engineering:174,341`이 관할을 위임해요 — 내용은 살아 있으나 세 기준 모두 ◐라 단독 파일로 둘 근거가 없어요. 모체는 `harness-core:8`이 가리키는 `safety_security`(운영 안전)이고, `agent_security:6`의 ECC 주석이 이미 "safety_security를 보완한다"고 선언해요. 잃는 것: "운영 안전 vs 적대 위협" 관할 분리 선언(:6) — 모체 안의 절 제목으로 남기면 돼요. stale: `.omp/notepads/`(:86)·`MEMORY.md`·`~/.claude/projects/*/memory/`(:84)·`context7` 예시(:45).
- **mcp_policy(유지, 조건부)**: Supabase MUST·웹 검색·Search vs LSP 판단표(:66-98)는 AGENTS.md 한 줄로 대체되지 않지만, :8이 스스로 "LSP 레이어 A/B·`mcp__plugin_oh-my-claudecode_t__lsp_*` 도구명은 Claude Code 시절 표기"라 선언한 절(:25-74 약 60줄)과 Context7/Serena 폐기 이력(:100-135 약 35줄)이 본문 절반이에요. `bootstrap` SKILL이 등록하는 서버(exa·browser-tools·supabase·react-design-systems·pixelmaker)와 정책의 서버 목록이 어긋나요(Stitch :192-198·고정 IP :189는 정책에만, pixelmaker는 bootstrap에만). 조건: stale 절 정리는 내용 개정이라 별도 이슈.

## 7. 삭제·병합 제안 목록 (후속 사이클용 — 이 사이클에서는 실행하지 않아요)

### 7.1 병합 제안 (9편 → 모체 8편, `verification_tests_and_evals`가 M5·M6 둘을 받아요)

| # | 흡수되는 규칙 (기준 판정) | 모체 (기준 판정) | 옮길 절 | 링크·점수 갱신 대상 |
|---|---|---|---|---|
| M1 | `harness-cost_awareness` (사) | `harness-agent_routing` (생) | eval 리포트 비용 기재(:20-23) 한 줄 | `scripts/harness-audit.sh:321-324`(cost_efficiency +3 → 모체로 재배치), AGENTS.md Linked Modules·Operational rails |
| M2 | `harness-information_discovery` (사) | `harness-anti_hallucination` (생) | 경로 vs 클래스 판별(:13-18), 3단 스윕(:23-25) | AGENTS.md Linked Modules·Core rails(`harness-repo_command_discovery.md`에는 역링크가 없어 갱신 대상 아님) |
| M3 | `harness-context_management` (사) | `harness-session_persistence` (생) | 컴팩션 시점(:14-26), 보존 MUST(:30-39), `<remember>`/notepad(:56-85); `~/.claude/scripts` 절(:90-114)은 폐기 | `harness-session_persistence.md:6,10,77`(자기 정의 3곳), `harness-cycle_definition.md:189`, `scripts/harness-audit.sh:162-165,333-336`(+5 → 모체로 재배치), AGENTS.md Operational rails |
| M4 | `harness-learning_policy` (약) | `harness-assetization` (생) | 좋은 학습 4기준(:19-24), 금지 3종(:36-38) | `templates/retro.md:26`, `harness-session_persistence.md:78`, AGENTS.md Operational rails |
| M5 | `harness-quality_gates` (약) | `harness-verification_tests_and_evals` (생) | 6 게이트 정규 이름(:12-21), 트리거 표(:42-48), 억제 금지(:63-66) | `checklists/quality_gate.md`, `harness-adversarial_review.md`(Related), `scripts/harness-audit.sh:207-210`(+1 → 모체로 재배치), AGENTS.md Quality rails |
| M6 | `harness-tdd_policy` (약) | `harness-verification_tests_and_evals` (생) | 커버리지 목표(:33-36), **TDD 생략 전 명시 승인(:72-77 3단계)**; e2e 포맷(:40-70)은 실사용 0건이라 폐기 | AGENTS.md Core Principles 4 "→ Detail"·Quality rails, `.omp/extensions/harness/tests/risk-assess.test.mjs:56,119,238,418,422`(현재 이름 픽스처 5곳 — 존재하는 다른 docs-only 경로로 교체; `:63`의 `rules/tdd_policy.MD`는 레거시 대소문자 분류 픽스처라 그대로 둬요) |
| M7 | `harness-documentation_policy` (사) | `harness-writing_style` (생) | 한/영 독자 분리(:12-13), UTF-8 NO-BOM(:26), latest-only(:33-37) | `harness-writing_style.md:9,51,97`, `risk-assess.test.mjs:53`(픽스처), AGENTS.md Optional 목록 |
| M8 | `harness-hook_recipes` (사) | `harness-harness_integration_contract` (생) | 이벤트 차단 가능 표(:17-24), 페이로드 스키마(:28-36), fail-open(:129); 레시피 5종은 폐기 | `harness-session_persistence.md:79`, AGENTS.md Tool rails |
| M9 | `harness-agent_security` (사) | `harness-safety_security` (생) | MUST 3개(:14-49), 방어 블록·계정 분리·메모리 감사(:53-90), OWASP 표(:94-104); 관할 분리(:6)는 절 제목으로 | `harness-prompt_engineering.md:174,341`, `scripts/harness-audit.sh:293-296`(security_guardrails +2 → 모체 가중치로 재배치), AGENTS.md Core rails |

M4·M8은 M3 뒤에 해도 대상 줄 번호가 유지돼요(M3의 모체가 `session_persistence`라 :78-79는 남아요). 29편 → 20편이 되고, 규칙집 노출(매 프롬프트 이름+설명 한 줄, 평균 114 B/행 상한 — ADR 002 Amendment)은 약 1.0 KB/요청 줄어요.

### 7.2 폐기 제안

**없음.** 사 판정 6편(agent_security·context_management·cost_awareness·documentation_policy·hook_recipes·information_discovery)은 모두 고유 절과 살아 있는 모체가 있어 폐기 대신 병합(M1·M2·M3·M7·M8·M9)으로 제안해요. 폐기로 돌리려면 §6의 "잃는 것" 목록을 의도적으로 버린다는 결정이 필요하고, 그 결정은 후속 사이클 승인 범위예요.

### 7.3 유지 조건부 3편 (내용 개정이라 별도 이슈 제안)

| 규칙 | 조건 |
|---|---|
| `harness-code_review_policy` | 임계값(50/800/4) SSOT를 `coding_standards`로 지정하고 여기·`checklists/code_review.md`는 참조만; 심각도 라벨을 `adversarial_review`와 정합(§6 A) |
| `harness-commit_and_pr` | PR 본문 템플릿 SSOT를 `templates/pr_body.md` 한 곳으로 두고 규칙 :16-23·`checklists/pr.md`·`compr` §5는 참조만(§6 B) |
| `harness-mcp_policy` | Claude Code 표기 LSP 절(:25-74)·Context7/Serena 폐기 이력(:100-135) 축약, 서버 목록을 `bootstrap` SKILL과 정합(§6 C) |

### 7.4 실행 시 공통 체크

1. `scripts/harness-audit.sh`의 존재 점수(§4.1)를 모체 파일로 옮겨 `TOTAL: 51/70`이 내려가지 않게 해요(#49·#50 AC 선례).
2. `scripts/harness-sync.sh:184`의 글롭 `.omp/rules/harness-*.md`는 그대로 두면 돼요 — 소비 리포는 다음 `harness-check` sync에서 사라진 파일이 자동 제거돼요(기존 `harness-*` 삭제 후 복사, ADR 002 부속 결정 1). 소비 리포 문서가 흡수된 규칙을 링크했을 수 있으므로, 개명표(흡수 규칙 → 모체)를 그 버전의 CHANGELOG/릴리스 노트와 `harness-check`의 sync 출력(advisory 한 줄)에 실어요 — `migrate` 스킬은 초기 컷오버용이라 기존 소비 리포는 그 안내를 볼 경로가 없어요.
3. AGENTS.md "Linked Modules"와 각 모체의 Related 절, `claudedocs/CLAUDEKR.md` 미러를 같은 PR에서 갱신하고 `node scripts/docs-drift`로 링크를 확인해요. 테스트 픽스처(`risk-assess.test.mjs`)는 존재하는 다른 docs-only 경로로 바꿔요.
4. 병합 사이클은 `risk-assess`가 docs-only(저위험)로 분류하므로 review-gate가 리뷰를 요구하지 않아요 — 그래도 `harness-audit.sh --terse` 점수와 `omp -p` 규칙집 렌더 확인을 AC에 넣어요.

## 8. 부수 관찰 (비범위 — 규칙 내용 개정은 이 이슈 밖이라 기록만 해요)

- **CRLF 15편**(`file .omp/rules/harness-*.md`): agent_security, anti_hallucination, code_review_policy, coding_standards, commit_and_pr, context_management, cost_awareness, documentation_policy, learning_policy, mcp_policy, quality_gates, repo_command_discovery, safety_security, session_persistence, tdd_policy. 포팅 때 들어온 줄끝이라 병합 사이클에서 LF로 통일하면 돼요.
- **레거시 경로 참조**(`grep -rnoE '(rules/|rule://)(<28 names>)\.?m?d?'`): `docs/decisions/002-policy-layer-retiering.md:44`(`rule://writing_style` — 역사 서술), `docs/harness/review-remediation.md:4`(`rules/doc_standards.md`), `docs/handoff/*`·`docs/harness/archive/*/seed.yaml`(보관 문서), `.omp/extensions/harness/tests/risk-assess.test.mjs:63`(`rules/tdd_policy.MD` 픽스처). 규칙 본문 안의 레거시 이름: `harness-tdd_policy.md:35`(`repo_command_discovery`), `harness-mcp_policy.md:104,114`(`rules/context7_policy.md` — git history 참조로 명시).
- **stale 절(유지 규칙 안)**: `verification_tests_and_evals:8-15` "Global enforcement(oh-my-claudecode)… acceptance-gate: Blocks completion claims" — 실제 게이트는 커밋을 막아요(`acceptance-gate.mjs:3`); `harness_integration_contract:27,122-124,151` "Architect verification(oh-my-claudecode)"와 `docs/harness/completion-attack-report.md`(부재); `adversarial_review:135-142` 롤아웃 Phase 1/2(이미 운영 중), :49-51 critic/architect/security-reviewer/test-engineer(`.omp/agents/`에는 adversary/code-reviewer/reviewer/verifier만); `code_review_policy:6` "code-reviewer agent enforces this automatically"(에이전트는 이 규칙을 링크하지 않음); `session_persistence:52-70` `.omp/contexts/*` 부재; `mcp_policy` §6 C 참조.
- **AGENTS.md 본문이 가리키지 않는 규칙 19편**(§3 `body=0`): 색인 한 줄과 규칙집 노출로만 존재해요. ADR 002 트레이드오프 "규칙집은 존재를 알리는 층이지 본문을 강제하는 층이 아니다"가 그대로 적용돼요 — 이번 ③ ○ 6편 가운데 `repo_command_discovery`를 뺀 5편이 이 집합에 들어요.

## 9. 재현

리포 루트에서 §3·§4.1·§5.1·§5.2의 코드 블록을 그대로 실행하면 돼요. `MAIN`은 `docs/sum`·`docs/reviews`를 가진 체크아웃 경로이고(없으면 그 열은 0), 이슈·댓글은 실행 시점 스냅샷이라 이 PR 이후 댓글이 늘면 `iss`/`cmt` 열이 커져요. 규칙 파일 무변경 확인: `git diff --stat main -- .omp/rules` 가 비어 있어요.

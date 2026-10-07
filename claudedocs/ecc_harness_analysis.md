# ECC (everything-claude-code) vs 우리 하네스 매핑 분석

> **Historical**: 이 분석은 Claude Code 시절(harness v2026.12, `.claude/hooks/` 기준)에 작성됨. OMP 포트 이후 경로·훅 메커니즘 서술은 현행과 다르다 — 현행은 `rules/harness_integration_contract.md` 참조.

- **대상 레포**: https://github.com/affaan-m/everything-claude-code
- **ECC 버전**: v1.10.0 (Apr 2026)
- **ECC 규모**: 38 agents · 156 skills · 72 commands · 단일 `hooks/hooks.json` + Rust 컨트롤플레인(`ecc2/`) + Tkinter 대시보드 + GitHub App + npm 패키지
- **우리 기준**: `~/projects/workspace/claude` (harness v2026.12) + 전역 OMC (`~/.claude`)
- **분석일**: 2026-04-24

## 1. 우리가 이미 구현해서 ECC가 필요 없는 것

| ECC 요소 | 우리 대응 |
|---|---|
| `agents/planner`, `architect`, `code-architect` | OMC `planner`, `architect`, `oh-my-claudecode:plan` |
| `agents/code-reviewer`, `security-reviewer` | OMC `code-reviewer`, `security-reviewer` + `rules/adversarial_review.md` |
| `agents/code-simplifier`, `refactor-cleaner` | OMC `code-simplifier`, `tidy` 스킬 |
| `agents/tdd-guide` | `rules/tdd_policy.md` + `startdev` 스킬 |
| `agents/build-error-resolver` (범용) | OMC `debugger` |
| `agents/chief-of-staff`, `loop-operator` | OMC `autopilot`, `ralph`, `ultrawork`, `team` |
| `agents/opensource-*` (forker/packager/sanitizer) | 우리 워크플로우와 무관 |
| `skills/verification-loop` | `rules/verification_tests_and_evals.md` + `verifier` 에이전트 + `backpressure-gate` |
| `skills/tdd-workflow`, `django-tdd`, `laravel-tdd` 등 | `rules/tdd_policy.md` (언어 무관) |
| `skills/continuous-learning v1` (Stop 훅 기반) | OMC `learner`, `skillify`, `remember` + auto-memory |
| `skills/council` (다중 모델 합의) | OMC `ccg` (Claude-Codex-Gemini 삼각) |
| `skills/strategic-compact`, `context-budget`, `token-budget-advisor` (원칙 레벨) | `rules/context_management.md`, `rules/cost_awareness.md` |
| `skills/deep-research`, `search-first`, `iterative-retrieval` | OMC `external-context`, `document-specialist` |
| `skills/git-workflow`, `github-ops` | `compr`, `compush` 스킬 + `rules/commit_and_pr.md` |
| `skills/coding-standards`, `rules-distill`, `skill-comply`, `skill-stocktake` | `rules/coding_standards.md` + `harness-check` |
| `skills/hookify-rules` (규칙 레벨) | `rules/hook_recipes.md` |
| `commands/plan`, `verify`, `tdd`, `quality-gate`, `eval` | 위 동등물 이미 커버 |
| `commands/save-session`, `resume-session` | `sum` 스킬 + `rules/session_persistence.md` + `.omc/state/sessions/` |
| `commands/checkpoint` | git workflow + backpressure 히스토리 |
| `commands/skill-create` | OMC `skillify` |
| `commands/orchestrate`, `multi-*`, `devfleet`, `loop-start/status`, `santa-loop` | OMC `autopilot`/`ralph`/`ultrawork`/`team`/`loop` |
| `commands/prp-*` (PRD 4개) | `kickoff` + CLAUDE.md Completion Contract |
| `commands/review-pr`, `code-review` | `code-review`, `receiving-code-review` 스킬 |
| `commands/model-route` | CLAUDE.md의 `<model_routing>` 섹션에 내재화 |
| hooks의 pre-commit quality / secret 감지 / push 리마인더 | `backpressure-gate`, `destructive-guard`, `mcp-gate` |
| hooks의 desktop-notify | OMC `configure-notifications` (Telegram/Discord/Slack) |
| hooks의 dev server blocker (tmux 강제) | CLAUDE.md 가이드 + `qa-tester` |

## 2. 우리도 구현했지만 ECC에서 받아들일 부분

| 요소 | 왜 받아들일 만한가 | 우리 쪽 편입 위치 |
|---|---|---|
| **`harness-audit.js` 결정론적 스코어링 엔진** (7 카테고리 × 10점, rubric 버전 고정) | 우리 `harness-check`는 contract 존재 여부만 체크. ECC는 "얼마나 좋은가"를 **수치화** — 리팩토링 근거 제공 | `scripts/harness-audit.sh` 신설 → `harness-check` 스킬이 호출 |
| **`skills/agent-harness-construction`** 의 4-quality 모델 (action/observation/recovery/context-budget) + tool granularity 룰 | 우리 hook_recipes는 구현 관점. ECC는 **설계 원칙** 명시 | `rules/harness_design.md` 신설 또는 `harness_integration_contract.md`에 섹션 추가 |
| **`agents/silent-failure-hunter`** (빈 catch / 삼켜진 에러 / 위험한 fallback 전담) | 우리 `code-reviewer`가 겸업하지만 독립 패스로 빠짐없이 잡힘 | `rules/code_review_policy.md` 체크리스트에 항목 추가 (에이전트 신설은 후순위) |
| **`continuous-learning-v2` "instinct" 모델의 3요소**: (a) PreToolUse/PostToolUse 훅 관찰(100% 관측), (b) confidence 0.3~0.9 가중, (c) project/global 스코프 분리 | 우리 auto-memory는 **대화 감지 기반 + 글로벌**. 프로젝트 오염/confidence 없음 | auto-memory frontmatter에 `confidence`, `project_id` 필드 추가 + 관찰 훅 실험 (전면 도입 대신 **개념만 흡수**) |
| **`skills/eval-harness`** (테스트와 구분되는 LLM eval 파이프라인) | 우리 `rules/verification_tests_and_evals.md`는 원칙만. 실행 인프라 없음 | EDD가 실제로 필요해지는 시점에 도입 (지금 당장은 ROI 낮음) |
| **PreCompact hook** (압축 직전 상태 덤프) | 우리 `sum` 스킬은 수동. 자동 PreCompact 훅은 컨텍스트 날림 방지 | ~~`.claude/hooks/harness/pre-compact.mjs` 후보~~ → **미채택 (결정 2026-05-27)** → **부분 실현(2026-06)**: no-LLM breadcrumb을 `breadcrumb-tracker`(turn_end/tool_result)로 신설, 압축 비의존. 전체 LLM 요약은 여전히 `sum` 수동. `rules/session_persistence.md` 참조 |
| **`instinct-export`/`import` YAML 포맷** | 팀 공유/머신 이동 시 memory 전이 | 개인 사용이면 보류, 팀 확장 시 고려 |

## 3. 우리에게 없어서 받아들여야 하는 것 (신규 도입 후보)

| 요소 | 가치 | 우선순위 |
|---|---|---|
| **`hookify` / `hookify-configure` / `hookify-list`** — 훅을 대화로 CRUD하는 스킬 | 우리 `update-config`는 settings 전반. 훅 전용 세밀도(ID, matcher, exitCode 의미)는 없음 | 中 (하네스를 자주 손대면 가치) |
| **Strategic Compact 자동 제안 훅** (50 tool call마다 `/compact` 권유) | 우리는 수동. 긴 세션에서 드리프트 방지 | 中 |
| **`skills/prompt-optimizer`** | Claude API/스킬 프롬프트 튜닝 자동화 — 우리에게 전혀 없음 | 中 (skills 많아질수록 가치 상승) |
| **`agents/silent-failure-hunter` 전용 패스** | §2와 동일, 에이전트 레벨로 격상 시 | 小 (룰 추가로 먼저 시도) |
| **`agents/type-design-analyzer`** | TS 타입 설계 전용 리뷰 | 프로젝트 TS 비중 높을 때만 |
| **언어별 `*-build-resolver`** (Rust/Go/Java/Kotlin/C++/Pytorch 등) | `debugger`보다 빠름 | 해당 언어 쓰는 프로젝트에서만 |
| **`skills/skill-health` 대시보드 개념** (skill 성공률 sparkline + 실패 클러스터링) | 스킬 많아지면 **어느 스킬이 죽었는지** 안 보임 | 中 (OMC 스킬 15개+ 상황에 맞음) |
| **harness self-rating 시간축 트래킹** `.omc/state/harness-scores.json` | ECC install-state 아이디어의 **축소판**: 버전 × 점수 히스토리 | 小 |

## 4. 우리에게 없지만 필요없는 것 (도입 비권장)

| 요소 | 제외 이유 |
|---|---|
| **언어/프레임워크별 140+ skill** (Django/Laravel/Flutter/Kotlin/Springboot/Rust/Swift/.NET/Perl/JPA/Kotlin-Exposed 등) | 우리 작업 언어 외 불필요 — 해당 프로젝트에서 **개별 설치**가 맞음 |
| **도메인 비즈니스 skill** (carrier-relationship, customs-trade, energy-procurement, healthcare-*, investor-outreach, logistics-exception, returns-reverse-logistics, finance-billing-ops) | 업종 특화, 우리 컨텍스트와 무관 |
| **마케팅/콘텐츠 skill** (brand-voice, connections-optimizer, social-graph-ranker, manim-video, remotion-video, seo-specialist, x-api, crosspost) | OMC에 이미 page-cro, seo-audit, copywriting, email-sequence 등 **더 풍부한** 마케팅 스킬군 존재 |
| **`ecc2/` Rust 컨트롤플레인** (sessions/daemon/dashboard CLI) | OMC가 이미 오케스트레이션 담당, Rust 런타임 중복 |
| **`ecc_dashboard.py` Tkinter GUI** | CLI/HUD로 충분, WSL에서 어색 |
| **`install-plan.js` / `install-apply.js` 매니페스트 기반 selective install** | 우리 `harness-sync.sh`의 **remote-wins + 단순 덮어쓰기** 철학과 충돌. 오버엔지니어링 |
| **Multi-harness adapter** (Codex/Cursor/OpenCode/Gemini 전체 surface sync) | Claude Code 전용 + 필요 시 `omc-teams`/`ccg`로 교차, 어댑터 레이어는 유지비만 높음 |
| **GitHub App (`ecc-tools`), `ecc-agentshield` npm** | 상용 제품 레이어 |
| **`commands/prp-*` PRD 4종** | `kickoff` + Completion Contract로 동일 목적, 단순함이 장점 |
| **`commands/aside`, `claw`, `nanoclaw-repl`, `gan-*`, `santa-loop`** | ECC 전용 실험 기능, 범용성 낮음 |
| **`council` 스킬** | `ccg`가 같은 목적 — 이미 성숙 |
| **`promote` 명령 (instinct 승격)** | instinct 시스템 전면 도입 안 하면 불필요 |
| **`dmux-workflows`, `devfleet`, `multi-backend/frontend`, `pm2`** | tmux 기반 특수 워크플로우 — `qa-tester` + `omc-teams` 조합으로 커버 |
| **`model-route` 명령** | CLAUDE.md `<model_routing>`에 이미 규칙화 |
| **`continuous-learning` v1** (Stop 훅 단일) | v2.1이 완전 대체 |

## 5. 실행 가능한 다음 단계 (ROI 높은 순)

1. **`scripts/harness-audit.sh` 신설** — ECC 7-카테고리 rubric(Tool Coverage / Context Efficiency / Quality Gates / Memory Persistence / Eval Coverage / Security Guardrails / Cost Efficiency) 이식. `harness-check` 스킬에서 호출 → 하네스 품질 수치 추적.
2. **`rules/harness_design.md` 신설** — ECC `agent-harness-construction`의 4-quality 모델 + granularity 룰 편입. `hook_recipes.md`, `harness_integration_contract.md`와 상호참조.
3. **`code_review_policy.md` 체크리스트에 silent-failure 항목 추가** — 에이전트 신설 대신 룰 보강이 우리 스타일에 맞음.
4. **auto-memory frontmatter 확장 실험** — `confidence`, `project_id` 필드 추가, 기존 memory 구조는 유지. (instinct 전면 도입은 보류)
5. ~~**PreCompact 훅 신설**~~ → **부분 실현(2026-06, 자율화 Q1)**: 압축 트리거 대신 `breadcrumb-tracker`가 `turn_end`/`tool_result`에서 no-LLM breadcrumb(커밋·테스트·변경파일)을 `.omp/harness-state/session-log.jsonl`에 append하고, `breadcrumb-surface`가 `session_start`에 `docs/sum/`를 표면화하며, 수동 `sum`이 이를 seed로 소비. 전체 LLM 자동요약은 미채택 유지(Q1.4). 상세: `rules/session_persistence.md`.

3~5는 small·reversible → 하네스 버전 하나로 묶어 태깅 가능. 1~2는 별도 PR 단위가 적합.

## 참고 사항

- ECC는 "10개월간 실사용하며 진화" 포지셔닝. **장점**: 훅 1개 파일로 전체 관리 / instinct 기반 자동 학습 / rubric 기반 결정론적 audit. **단점**: 언어·도메인 스킬 난립 / Rust 컨트롤플레인·Tkinter GUI 등 주변 제품화로 핵심 철학 희석 / 설치 체계 복잡(install-plan/apply).
- 우리 하네스는 **"얇은 코어 + OMC 위임"** 철학. ECC의 "두꺼운 카탈로그" 모델은 맞지 않고, **결정론적 audit / 설계 원칙 문서 / 자동 학습의 개념적 흡수**만 골라오는 게 맞음.

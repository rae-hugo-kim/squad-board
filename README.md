**[English](README.en.md)**

# omp — OMP 하네스 템플릿

OMP(Oh My Pi) 코딩 에이전트가 일관되고 안전하게 동작하도록 만드는 정책 프레임워크입니다.

이 저장소를 복사하면 규칙, 체크리스트, 스킬, 게이트(확장)가 한 세트로 적용됩니다.
필요 없는 건 지우고, 프로젝트에 맞게 고쳐 쓰세요.

## 포팅 고지 (Porting Notice)

이 저장소는 Claude Code용 하네스 템플릿 **`rae-hugo-kim/claude`** (harness/2026.49)를 **OMP 네이티브로 포팅**한 것입니다 (2026-06-10).

| | 원본 (Claude Code) | 이 저장소 (OMP) |
|---|---|---|
| 정책 진입점 | `CLAUDE.md` | `AGENTS.md` |
| 게이트 배선 | `.claude/settings.json` 훅 등록 11종 | `.omp/extensions/harness/index.ts` 확장 1개 |
| 게이트 스크립트 | `.claude/hooks/harness/` | `.omp/extensions/harness/gates/` — **로직 무변경** (테스트 177개 그대로 통과) |
| 런타임 상태 | `.omc/harness-state/` | `.omp/harness-state/` |
| 스킬 · 에이전트 | `.claude/skills/`, `.claude/agents/` | `.omp/skills/`, `.omp/agents/` |
| 훅 이벤트 | PreToolUse / PostToolUse / UserPromptSubmit / SessionStart | `tool_call` / `tool_result` / `before_agent_start` / `session_start` |

원본 대비 개선 1건: 실패한 bash 검증도 FAIL로 기록됩니다 (원본의 PostToolUseFailure 한계 해소 — 아래 [하네스](#하네스) 절 참고).

> **이 저장소는 Claude Code에서 동작하지 않습니다.** Claude Code 훅 등록(settings.json)이 의도적으로 제거되었으므로, Claude Code 사용자는 원본 템플릿을 사용하세요.

## 필요한 것

- [OMP (Oh My Pi)](https://github.com/oh-my-pi) — 코딩 에이전트 하네스
- Node.js — 게이트 스크립트 실행용 (`node`가 PATH에 있어야 함)
- (선택) oh-my-claudecode — `~/.claude`에 설치돼 있으면 OMP가 OMC 에이전트/스킬을 자동 발견

## 시작하기

### 1. 환경 구축 (머신당 1회)

```
/skill:bootstrap
```

MCP 서버(OMP 설정에 등록)를 설치합니다. docs는 빌드 도구 없이 Obsidian/GitHub로 바로 읽습니다.

### 2. 프로젝트 생성

```
/skill:init my-project          # public
/skill:init my-project --private # private
```

이 템플릿을 기반으로 새 GitHub 저장소를 만듭니다.

### 3. 개발 시작

```
/skill:brainstorm  →  (선택) 사고 발산, 캡처는 docs/brainstorming/에 자동 저장
/skill:kickoff     →  스코프 정의 (목표, 제약, 수락 기준) — brainstorm 캡처 있으면 자동 인식
/skill:startdev    →  TDD 기반 구현
/skill:compr       →  PR 생성
```

스킬은 자연어로도 트리거됩니다 ("킥오프 하자", "브레인스토밍" 등).

## 구조

```
.
├── AGENTS.md              에이전트 정책 진입점 (OMP가 자동 로드)
├── .omp/rules/harness-*.md  행동 규칙(omp 규칙집 — 매 프롬프트에 이름+설명, 본문은 rule://harness-<name>; harness-core는 상시)
├── checklists/            작업별 체크리스트
├── templates/             재사용 템플릿
├── .omp/
│   ├── skills/            스킬 정의 (OMP 네이티브 발견, 15개)
│   ├── agents/            reviewer / verifier 에이전트 (task 도구로 위임)
│   └── extensions/harness/
│       ├── index.ts       게이트 배선 확장 (tool_call/tool_result/before_agent_start/session_start)
│       ├── gates/         게이트 스크립트 — stdin JSON CLI, 테스트로 커버됨
│       ├── harness-meta.json  하네스 버전 메타
│       └── tests/         게이트 단위 테스트 (node --test) — 게이트와 같은 태그로 소비 리포에 동기화
├── docs/
│   ├── README.md          docs 색인 노트 (Obsidian vault 진입점)
│   ├── brainstorming/     발산 캡처 (gitignored)
│   └── harness/           하네스 런타임 파일 (seed.yaml 등)
├── scripts/               드리프트 감사/버전 관리
└── claudedocs/            참조 문서 (Claude Code 시절 이력 포함)
```

## 스킬

OMP에서 스킬은 `/skill:<이름>`으로 호출하거나, 설명에 매칭되는 자연어 요청으로 자동 발동됩니다.

| 명령어 | 하는 일 |
|--------|---------|
| `/skill:bootstrap` | 개발 환경 구축 (MCP 서버 + docs 도구) |
| `/skill:init <name>` | 이 템플릿에서 새 프로젝트 생성 |
| `/skill:brainstorm [주제]` | 사고 발산 모드. `docs/brainstorming/`에 verbatim 캡처 |
| `/skill:kickoff` | 목표, 제약, 수락 기준 정의 (brainstorm 캡처를 soft context로 활용) |
| `/skill:startdev` | seed.yaml 기반 TDD 구현 시작 |
| `/skill:sum` | 현재 세션을 `docs/sum/`에 요약 저장 |
| `/skill:compr` | 브랜치 → 커밋 → 푸시 → PR |
| `/skill:compush` | 커밋 → 푸시 (PR 없이) |
| `/skill:receiving-code-review` | 받은 리뷰 의견 검증·반영 |
| `/skill:harness-check` | 하네스 버전 드리프트 체크 + 원격 sync (`--audit`로 품질 점수) |
| `/skill:migrate` | 기존 Claude Code 프로젝트(.claude/CLAUDE.md)를 OMP로 컷오버 (보험 태그 + 하네스 이식) |
| `/skill:design-mockup` | 슬라이더/노브로 파라미터 튜닝 가능한 단일 HTML mockup 생성 |
| `/skill:grepai-search` | 의미 기반 코드 검색 (콜드스타트 탐색) |
| `/skill:gh-loop` | finding → 이슈 → 수정 → PR → 교차검증 → HITL 루프 (머지 자동 안 함) |
| `/skill:gh-fanout` | 멀티세션 — gh-loop을 여러 이슈에 worktree 격리 병렬 실행 (관측=GitHub) |

## 기존 Claude Code 프로젝트 이주

이미 Claude Code(`.claude/` + `CLAUDE.md`)로 작업하던 프로젝트는, 일괄 이주 대신 **그 프로젝트에서 omp로 작업하고 싶어진 시점에** 1회 컷오버합니다:

```
cd <기존-프로젝트>
/skill:migrate        # 또는 "omp로 이주해줘"
```

`migrate`는 ① `pre-omp-migration` 보험 태그를 먼저 박고(복귀는 `git checkout pre-omp-migration -- .claude CLAUDE.md` 1줄) → ② `harness-sync.sh`로 하네스 자산을 이식 → ③ `.claude/`·`CLAUDE.md`를 제거합니다. 프로젝트 고유 커스텀이 있으면 sync 전에 멈추고 확인을 받습니다. 이주 후 갱신은 `/skill:harness-check`.

## 하네스

kickoff → startdev 흐름에서 자동으로 작동하는 장치들. 집행 지점은 두 곳입니다 — **커밋 게이트는 git 훅(`.githooks/pre-commit`)** 에서, 나머지는 OMP 확장 `index.ts`가 이벤트에 배선합니다. 게이트 CLI는 `.omp/extensions/harness/gates/` (24)에 있는 stdin-JSON 프로그램입니다:

| OMP 이벤트 | 게이트 | 역할 |
|-----------|--------|------|
| `tool_call` (edit/write/ast_edit) | cross-repo guard (`index.ts` + `cross-repo.mjs`) | 세션 리포 밖 리포의 파일 수정을 그 리포의 규율 파일(AGENTS.md > CLAUDE.md > .cursorrules) read 증명 전까지 차단 (#15 ①) — 같은 리포의 링크드 워크트리는 외부가 아님(`repo-root.mjs`) |
| `tool_call` (edit/write/ast_edit) | context-gate | 읽지 않은 파일 수정 차단 |
| `tool_call` (bash) | destructive-guard | 위험 명령(rm -rf, 강제 푸시 등) 경고 |
| `tool_call` (bash) | commit-tripwire (`index.ts`) | 커밋 게이트 **우회 선언** 차단 — `--no-verify`/`-n`, `core.hooksPath` 재지정, `--git-dir`/`--work-tree`, 리타게팅 `GIT_*` |
| `tool_call` (bash) | cross-repo guard (`index.ts` + `cross-repo.mjs`) | 규율·하네스를 가진 외부 리포 대상 `git commit`/`git push` 차단(`git -C X`, `cd X &&`, bash -c; 해석 불가는 fail-closed) + 리터럴 경로 mutation(rm/mv/cp/tee/sed -i/리다이렉션)의 ① 판정 (#15 ②) — 규율·하네스 없는 리포(sum-vault)는 관할 밖 통과 |
| `tool_call` (mcp__*) | mcp-gate | 파괴적 MCP 호출 경고 |
| `tool_result` (read) | read-tracker | 읽은 파일 기록 |
| `tool_result` (grep/ast_grep) | read-tracker | 검색이 `[path#TAG]` 앵커를 발급한 파일 기록 (배치 1회 스폰) |
| `tool_result` (edit/write 성공) | write-tracker + backpressure-invalidator | 작성 파일 기록, 코드 수정 시 검증 상태 무효화 |
| `tool_result` (bash) | backpressure-tracker / failure-tracker | 검증 명령 PASS/FAIL 기록 |
| `tool_result` (bash 커밋·검증 / edit·write) | breadcrumb-tracker | 세션 재개용 breadcrumb 기록 (커밋·테스트·파일변경, no-LLM) |
| `before_agent_start` | kickoff-detector | 새 작업 감지 시 킥오프 리마인더 주입 |
| `session_start` | harness-version-check | 원격 하네스 드리프트 알림 (24h 캐시), 훅 비활성·정책 shadow(비어 있지 않은 `.omp/AGENTS.md`) 프로브 |
| `session_start` | breadcrumb-surface | 최근 docs/sum 표면화 (고아 요약 해소, no-LLM) |

커밋 계열은 git 경계에서 집행됩니다(어떤 철자·경로로 커밋해도, 사람 커밋도 동일):

| git 훅 | 게이트 | 역할 |
|--------|--------|------|
| `pre-commit` (차단) | commit-gates → acceptance/backpressure/review/archive | 스테이징된 인덱스 기준 판정. 실패 시 커밋 객체 미생성. node 부재 시 fail-closed(`OMP_NODE_BIN` 탈출구) |
| `post-commit` (비차단) | 백스톱 + 유예 소비 | 게이트 미경유 커밋(`--no-verify`·cherry-pick·revert·rebase) advisory + one-shot 플래그 소비 |
| `pre-commit` (관측) | review-gate → estimate-vs-actual | 인테이크가 남긴 `.omp/harness-state/cycle-estimate`(예상 위험·파일 수·깊이·모델)를 `risk-assess` 실측과 붙여 `audit.jsonl`에 `estimate_vs_actual` 기록·소비. 판정 불관여. 표는 `node .omp/extensions/harness/estimate-report.mjs`(gh-loop 워커의 `gh_loop_dispatched`·`gh_loop_closed`도 §3 모델×규모 셀로 모음 — `gh-loop-record.mjs`) |
| `post-merge` (비차단) | 백스톱 | merge 자동커밋 관측 — git이 pre-commit/post-commit을 발화하지 않는 유일 경로 |
| `pre-push` (차단) | 아카이브 유출·docs drift | `docs/sum`·`docs/reviews` 추적 상태 및 FAIL 드리프트 차단 |

통합 경로(merge 자동커밋·cherry-pick·revert·rebase)는 **의도적으로 차단하지 않습니다** — 원 커밋 시점에 이미 게이트를 통과한 콘텐츠의 이동이고, 백스톱이 관측합니다. 잔여면(sparse-checkout·stash·`--no-verify`·관할 밖 레포)은 [`.omp/rules/harness-harness_integration_contract.md`](.omp/rules/harness-harness_integration_contract.md)에 열거돼 있습니다.

**서버측 백스톱 (CI)**: 위 집행 지점은 모두 클라이언트측이라 `--no-verify`나 훅 비활성 리포의 push는 원격에서 걸러지지 않았습니다. 이 저장소는 `.github/workflows/harness-ci.yml`(GitHub-hosted 러너, `main` push + `pull_request`)로 검사 3종을 돌립니다 — 아카이브 유출(로컬 `.githooks/pre-push`를 커밋된 트리에 그대로 실행), 하네스 suite(`node --test .omp/extensions/harness/tests/*.test.mjs`), docs drift(`node scripts/docs-drift`). 소비 리포는 `templates/github-workflows/harness-ci.yml`을 1회 복사해 쓰며(sync는 `.github/`를 건드리지 않습니다) 안내와 조정 지점은 [`templates/github-workflows/README.md`](templates/github-workflows/README.md)에 있습니다. 이 워크플로는 보고만 하고 머지를 막지는 않습니다(필수 체크 지정은 브랜치 보호의 별도 결정).

- **seed.yaml** — 킥오프 결과를 구조화 (목표, 제약, 수락 기준, 리스크)
- **rubric** — 4차원 명확도 게이트 (HIGH/MED/LOW)
- **audit log** — 이벤트 추적 (append-only JSONL)
- **glossary** — 프로젝트 용어 정의 (`docs/glossary.yaml`)
- 런타임 상태는 `.omp/harness-state/`(gitignored), 게이트 단독 실행·테스트는 `node --test .omp/extensions/harness/tests/*.test.mjs`

Claude Code 원본과 달리, 실패한 bash 검증도 기록됩니다 — 어댑터가 비정상 종료(`details.exitCode`≠0) 또는 도구 오류(`isError`)인 bash `tool_result`를 failure-tracker로 라우팅해, 원본의 PostToolUseFailure 한계가 해소됐습니다.

또한 omp의 `grep`/`ast_grep`는 파일별 `[path#TAG]` 편집 앵커(whole-file snapshot)를 발급하고 편집 도구가 이를 read와 동급으로 인정하므로, 어댑터가 검색 결과의 인증 파일 목록(`details.files`, 폴백: 브래킷 헤더)을 read-tracker에 **배치 1회 스폰**으로 기록합니다 — grep 직후 편집이 context-gate에 오차단되지 않습니다(16.3.12에서 오차단 라이브 재현 후 수정).

## 하네스 버전 관리

이 저장소는 다른 OMP 프로젝트들이 동기화 대상으로 삼는 **하네스 원본**입니다.

### 이 저장소 (source) — 버전 bump (의도적 1회)

`.omp/rules/harness-*.md`, `checklists/`, `.omp/`, `AGENTS.md`, `scripts/harness-*.sh`, `templates/` 등 하네스 자산 변경은 main에 머지돼도 바로 범프하지 않고, 소비 리포가 받아야 할 이유가 생겼을 때 한 번 올립니다. 동작 변경(게이트·sync·훅·스킬)과 안전 수정은 바로, 구조 변경은 단독 버전으로 올립니다. 문서만 바뀐 변경은 다음 범프에 함께 싣되 7일을 넘기지 않고, 범프는 하루 한 번을 넘기지 않습니다(근거와 기각한 대안: [`docs/decisions/003-harness-release-cadence.md`](docs/decisions/003-harness-release-cadence.md)).

```bash
bash scripts/harness-version-bump.sh --dry-run   # 무엇이 .N+1로 올라갈지, CHANGELOG [Unreleased]가 승격될지 미리 보기 (트리 불변)
bash scripts/harness-version-bump.sh             # 마지막 harness/* 태그 이후 변경분에 대해 1회 bump + 태그 + CHANGELOG [Unreleased] → ## [<버전>] 승격
git push --follow-tags
```

### 다른 프로젝트 (consumer) — `/skill:harness-check`

`/skill:init`으로 만든 프로젝트는 `session_start` 게이트가 24시간마다 원격 하네스 태그를 확인하고 드리프트가 있으면 알립니다. 명시적으로 동기화하려면:

```bash
/skill:harness-check              # 최신 harness/* 태그로 덮어쓰기 sync
/skill:harness-check --dry-run    # 변경될 경로만 미리 보기
/skill:harness-check --audit      # sync 후 7-카테고리(0~70) 품질 점수 출력
```

`--audit`은 `scripts/harness-audit.sh`(rubric v3)를 호출하며, 버전 bump 시 결과가 `.omp/state/harness-scores.jsonl`에 누적됩니다.

## Docs 뷰어 (Obsidian)

마크다운(SST)을 빌드 없이 그대로 읽습니다. repo 루트를 vault로 열면 됩니다
(설정·진입점은 [`docs/README.md`](docs/README.md) 참조).

- Mermaid syntax는 저장 시점에 하네스 게이트가 OMP 내장 파서로 검증
  (`.omp/extensions/harness/mermaid-check.ts`)
- 링크 무결성: `node scripts/docs-drift`
- 작성 표준: [`.omp/rules/harness-doc_standards.md`](.omp/rules/harness-doc_standards.md)
- 1회성 사람용 HTML은 `artifacts/`로 (gitignored, README 제외)
- `docs/brainstorming/`, `docs/sum/`, `docs/reviews/`는 로컬 전용 아카이브

## OMP에서의 동작 방식

| 레이어 | 메커니즘 |
|--------|----------|
| `AGENTS.md` | OMP가 컨텍스트 파일로 자동 로드 (cwd가 이 레포일 때) |
| `.omp/rules/harness-*.md` 등 | 매 프롬프트에 규칙집(이름+설명)으로 실리고, 본문은 `rule://harness-<name>`으로 열람; `harness-core`는 상시 주입 |
| `.omp/skills/` | OMP 네이티브 스킬 발견 (우선순위 100 — 동명 OMC 스킬보다 우선) |
| `.omp/agents/` | task 도구의 위임 대상으로 발견 |
| `.omp/extensions/harness/` | 시작 시 자동 로드되는 확장 — 게이트 배선 |
| `.omp/harness-state/` | 게이트 런타임 상태 (gitignored) |

Claude Code의 `settings.json` 훅 등록은 OMP에서 해석되지 않으므로 이 템플릿에는 존재하지 않습니다 — 같은 게이트가 확장 한 개로 배선됩니다.

## 규칙 커스터마이징

`.omp/rules/harness-*.md` 각 파일이 독립된 규칙입니다.
필요 없는 파일은 삭제하세요 — 나머지는 그대로 동작합니다.

| 분류 | 포함 규칙 |
|------|----------|
| **안전** | safety_security, agent_security, anti_hallucination, repo_command_discovery |
| **품질** | coding_standards, verification_tests_and_evals, change_control, tdd_policy, code_review_policy, quality_gates |
| **도구** | mcp_policy, context7_policy, hook_recipes |
| **프로세스** | assetization, commit_and_pr, harness_integration_contract |
| **문서** | documentation_policy, doc_standards |
| **운영** | context_management, session_persistence, cost_awareness, learning_policy |

## 핵심 원칙

1. **코딩 전에 생각하기** — 가정을 명시하고, 불확실하면 질문
2. **단순함 우선** — 요청된 것만 구현, 과도한 설계 금지
3. **외과적 변경** — 관련 코드만 수정, 기존 스타일 유지
4. **목표 중심 실행** — 모호한 요청을 검증 가능한 목표로 전환

## 라이선스

저장소 라이선스를 확인하세요.

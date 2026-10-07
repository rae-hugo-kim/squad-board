<!-- policy-sync-warning:start -->
warning_type: reference_only
non_normative_reference_only: true
last_sync_date: 2026-10-07
status: synced
source_of_truth: ../AGENTS.md
source_commit_hash: 9fbe856f165904e86be21dfb9879715b17e3e7b2
<!-- policy-sync-warning:end -->

# AGENTS.md 한국어 미러 (에이전트 규칙 - 계층형)

> 이 문서는 `../AGENTS.md`의 한국어 미러입니다(2026-09-26, ADR 002 재계층화 시점에 재생성). 규범은 항상 `../AGENTS.md`이며, 두 문서가 다르면 원문을 따릅니다. `source_commit_hash`는 원문을 마지막으로 바꾼 커밋이며, docs-drift가 불일치를 검사합니다.

이 파일은 **항상 켜져 있는(always-on)** 에이전트 정책입니다. 짧게 유지합니다.

## 탐색

- 여기서 시작한 뒤 색인을 사용합니다:
  - `INDEX.md`
  - 하네스 규칙: `harness-*` 규칙집(매 프롬프트에 이름과 설명이 실리고, 본문은 `rule://harness-<name>`, 파일은 `.omp/rules/` 아래). 상시 핵심 규칙은 `rule://harness-core`입니다.
  - `checklists/INDEX.md`
  - `templates/INDEX.md`

## 범위

- 이 정책은 에이전트가 활성화된 동안 이 리포/워크스페이스에 적용됩니다.
- 링크된 모듈이 이 파일과 충돌하면 **이 파일이 우선**합니다.
- **이 정책은 사용자 전역 규칙을 보완합니다**(OMP는 `~/.claude/CLAUDE.md`와 OMC 스킬/에이전트도 발견합니다) — 대체하지 않습니다.

## 소유·우선순위·관할

- `owner: global-harness` → OMP 하네스 확장이 기계적으로 집행합니다. `owner: local-policy` → 이 리포의 정책 문서와 리뷰 절차가 집행합니다. 소유 태그가 없는 `MUST`는 `local-policy`입니다.
- 충돌 순서: 1) 시스템/개발자/사용자 지시 2) 전역 하네스 요건 3) 리포 로컬 정책 4) 권고(`SHOULD`/`MAY`). 로컬 정책과 전역 하네스 규칙이 어긋나면 하네스 규칙을 따르고 이탈을 문서화합니다.
- 관할: `.omp/rules/harness-*.md`는 에이전트가 일하는 방식에 대한 행동 규칙(이 리포의 모든 작업에 적용)이고, `docs/rules/`는 미션/seed 워크플로(kickoff·startdev·closeout)의 산출물 계약(그 워크플로 안에서만 적용)입니다.

## 소비자 확장점

이 파일, `.omp/rules/harness-*.md`, `checklists/`, `templates/`, `.omp/extensions/harness/`, 하네스 스킬, 하네스 에이전트 4종은 **하네스 소유**입니다: `harness-check`가 동기화 때마다 원격본으로 덮어쓰고(remote wins), 디렉터리 항목은 `rm -rf` + 복사, `.omp/rules/harness-*.md`는 파일 글롭(낡은 `harness-*` 파일은 제거, 형제 파일은 비접촉)입니다. 이 템플릿으로 만든 프로젝트는 동기화가 건드리지 않는 자리에 자체 정책을 둡니다:

|필요|위치|OMP가 읽는 방식|
|---|---|---|
|프로젝트 규칙(프롬프트 관례, 도메인 제약)|`.omp/rules/<name>.md` — `harness-`로 시작하지 **않는** 이름|네이티브 규칙 파일: `alwaysApply: true`면 매 세션 주입, `globs`/`description`이 있으면 규칙집에 등재(`rule://<name>`), `condition`이 있으면 TTSR 스트림 규칙. 하네스 규칙과 같은 매체라 가시성도 같습니다.|
|긴 세션에서도 보여야 하는 짧은 필수 요건|`.omp/RULES.md`|`RULES`라는 이름의 always-apply 규칙으로 변환되는 sticky 규칙. 사용자에게 `~/.omp/agent/RULES.md`가 있으면 **가려집니다**: 두 sticky 파일이 고정 이름 `RULES`를 쓰고 dedup에서 사용자 파일이 이깁니다(`omp://context-files.md`; 18.3.0에서 2026-09-24 한 머신에서는 공존으로 재측정됐지만 이식성은 보장되지 않습니다) — 어느 머신에서나 실려야 하는 요건은 `alwaysApply: true`인 프로젝트 `.omp/rules/<name>.md`에 두며, 하네스가 `harness-core`를 배포하는 방식이 바로 그것입니다.|
|프로젝트 배경과 프로젝트 자체 모듈 색인|`alwaysApply: true`인 `.omp/rules/<project>-context.md`|always-apply 규칙이며 이 파일과 공존합니다. **`.omp/AGENTS.md`는 절대 만들지 않습니다** — 네이티브 provider(우선순위 100)가 같은 깊이의 이 `AGENTS.md`를 *대체*하므로(내용이 있기만 하면, 개행 하나여도 — omp 18.1.14/18.2.5에서 2026-09-23 실측, 18.3.0에서 2026-09-24 재측정) 하네스의 모든 MUST가 세션에서 조용히 빠집니다. 파일이 있는 동안 세션 시작 프로브가 `HARNESS POLICY SHADOWED`를 냅니다(24시간에 1회, `--force`로 반복).|
|커스텀 에이전트/스킬|`.omp/agents/<custom>.md`, `.omp/skills/<custom>/`|하네스 것과 같은 방식으로 발견됩니다. 동기화는 하네스 에이전트·스킬을 파일/디렉터리 단위로 등재하며 형제를 쓸어내지 않습니다.|

우선순위: `.omp/rules/`나 `.omp/RULES.md`의 프로젝트 규칙은 이 정책의 **로컬 특화**이며 같은 주제의 링크 모듈보다 우선합니다. 이 파일의 MUST(안전·게이트·검증)만은 그렇게 덮어쓸 수 없습니다. 프로젝트 규칙 이름을 `harness-*`로 짓지 말고, `.omp/agents/`의 하네스 이름이나 하네스 스킬 디렉터리 아래에 프로젝트 파일을 두지 마세요 — 다음 동기화에서 삭제되거나 덮어써집니다.

## 하네스 집행 (OMP)

이 리포는 자체 집행 계층을 **OMP 확장**으로 배포합니다. 다음이 자동으로 집행됩니다:

|무엇|어떻게|위치|
|---|---|---|
|편집 전 파일 읽기|`context-gate` + `read-tracker` + `write-tracker` 게이트|`.omp/extensions/harness/gates/`|
|크로스리포 규율(#15): 다른 리포 파일 변경은 그 리포의 규율 파일(`AGENTS.md` > `CLAUDE.md` > `.cursorrules`) read 뒤에만, 규율·하네스를 가진 다른 리포 대상 commit/push는 차단(대상 리포 세션 안내), 해석 불가 대상은 fail-closed|cross-repo guard(`index.ts` 인프로세스) + `cross-repo.mjs` + `repo-root.mjs`(동일성 = common git dir, 링크드 워크트리는 같은 리포)|`.omp/extensions/harness/gates/`|
|커밋 완료 기준|`acceptance-gate`(`commit-gates` 디스패처 경유, `.githooks/pre-commit`이 실행)|`.omp/extensions/harness/gates/`, `.githooks/`|
|실패 시 backpressure|`backpressure-gate` + 트래커|`.omp/extensions/harness/gates/`|
|위험 리뷰 임계|`review-gate`(`commit-gates` 디스패처 경유, `.githooks/pre-commit`이 실행)|`.omp/extensions/harness/gates/`, `.githooks/`|
|파괴적 명령 경고|`destructive-guard`|`.omp/extensions/harness/gates/`|
|새 작업 감지|`kickoff-detector`|`.omp/extensions/harness/gates/`|
|코드 변경 리뷰/검증|`task` 도구로 `reviewer` / `verifier` 에이전트|`.omp/agents/`|
|세션 breadcrumb 기록(비차단)|`breadcrumb-tracker` + `breadcrumb-surface`|`.omp/extensions/harness/gates/`|
|저장된 `.md`의 Mermaid 문법(비차단)|OMP 번들 파서를 쓰는 in-process `mermaid-check`|`.omp/extensions/harness/mermaid-check.ts`|
|로컬 아카이브 유출 방지(커밋 BLOCK / 푸시 BLOCK)|`archive-guard`(`commit-gates` 경유) + `.githooks/pre-push` + `compush`/`compr` 푸시 전 검사|`.omp/extensions/harness/gates/`, `.githooks/`|
|커밋 게이트 우회 선언|`index.ts`의 `commitBypassTripwire`(`--no-verify`/`-n`, `core.hooksPath`, `--git-dir`/`--work-tree`, `GIT_*` 재지정)|`.omp/extensions/harness/gates/git-commit-detect.mjs`|
|게이트를 거치지 않은 커밋 관찰(비차단)|`.githooks/post-commit` + `.githooks/post-merge` 권고|`.githooks/`|

커밋 집행은 git 자체 경계에서 돕니다: **`.githooks/pre-commit`**이 `commit-gates` 디스패처를 훅 모드로 호출하므로, 커밋 게이트 4종은 실제 커밋 대상 리포의 staged 인덱스를 판정합니다 — 어떤 철자로 호출하든, 사람 커밋이든 에이전트 커밋이든. `core.hooksPath`가 `.githooks`를 가리켜야 합니다(bootstrap/migrate가 설정). 명령 계층에는 위의 우회 tripwire만 남습니다. 통합 경로(merge 자동 커밋, cherry-pick, revert, rebase)는 의도적으로 차단하지 않습니다 — 원 커밋 시점에 이미 게이트를 통과한 커밋을 옮기는 것이고, post-commit/post-merge 권고가 관찰합니다. 나머지 게이트는 `.omp/extensions/harness/index.ts`가 배선합니다(OMP 이벤트: `tool_call`, `tool_result`, `before_agent_start`, `session_start`). 게이트는 PATH의 `node`가 필요하며, pre-commit 훅은 node가 없으면 **fail-closed**입니다(`OMP_NODE_BIN`이 nvm/GUI/cron 환경의 탈출구). in-process mermaid 검사는 node가 필요 없습니다. 알려진 잔존(sparse-checkout, `stash`, `--no-verify`, 관할 밖 리포)은 `rule://harness-harness_integration_contract`([`.omp/rules/harness-harness_integration_contract.md`](../.omp/rules/harness-harness_integration_contract.md))에 열거돼 있습니다.

OMC 관계: `~/.claude` 아래 설치된 OMC 에이전트·스킬은 OMP가 발견해 `task` 도구로 쓸 수 있습니다. OMC의 훅 자동화(매직 키워드, system-reminder 주입)는 OMP에서 **동작하지 않으며**, 리포 수준 게이팅은 이 확장이 대신합니다.

**이 파일이 더하는 것**: 프로젝트 고유 제약, 근거 기준, 문서화 요건.

## 용어 (RFC 2119)

- **MUST**: 필수. 지킬 수 없으면 예외 프로토콜을 따릅니다.
- **SHOULD**: 기본 기대치. 짧은 사유와 함께 생략할 수 있습니다.
- **MAY**: 선택.

## 우선순위 (충돌 해결)

1) **안전·보안**
2) **리포 진실**(lockfile / manifest / CI / 리포 문서)
3) **검증**(테스트/평가/재현 가능한 단계)
4) **변경 통제**(최소 변경, 범위 한정 diff)
5) **유지보수성**(가독성, 정리 리팩터링)

## 핵심 원칙

### 1. 코딩 전에 생각하기
- 가정을 명시합니다. 불확실하면 묻습니다.
- 해석이 여럿이면 제시합니다 — 조용히 고르지 않습니다.
- 더 단순한 방법이 있으면 말합니다. 필요하면 반론합니다.
- → 상세: `rule://harness-anti_hallucination`

### 2. 단순함 우선
- 요청 밖 기능을 만들지 않습니다. 한 번 쓰는 코드에 추상화를 만들지 않습니다.
- 200줄을 썼는데 50줄로 될 수 있으면 다시 씁니다.
- 자기 점검: "시니어 엔지니어가 과설계라고 하겠는가?"
- → 상세: `rule://harness-change_control`

### 3. 외과적 변경
- 사용자 요청에 직접 닿는 줄만 편집합니다.
- 기존 스타일을 따릅니다. 인접 코드를 "개선"하지 않습니다.
- 무관한 문제를 발견하면 언급만 하고 고치지 않습니다.
- → 상세: `rule://harness-change_control`

### 4. 목표 지향 실행
- 모호한 작업을 성공 기준이 있는 검증 가능한 목표로 바꿉니다.
- "버그 고쳐" → "재현 테스트를 쓰고 통과시킨다"
- 각 단계는 [행동] → 검증: [확인]의 형태를 갖습니다.
- → 상세: `rule://harness-verification_tests_and_evals`, `rule://harness-tdd_policy`

## 필수 사항 (MUST)

긴 세션에서도 살아 있어야 하는 행동 MUST — 추측 금지, 위험 조작 사전 승인, 근거 인용, scope self-detect, 사이클 인테이크, 사람 대상 문체 — 는 상시 규칙 `rule://harness-core`([`.omp/rules/harness-core.md`](../.omp/rules/harness-core.md))가 나르고 규칙집이 상세를 담습니다. 이 파일은 리포 고유 항목을 더합니다:

- **리포 명령**: build/test/lint/typecheck/e2e/eval 명령을 추측하지 않고 찾아냅니다(`rule://harness-repo_command_discovery`).
- **검증**: 사용자에게 영향이 있는 모든 변경은 재현 가능한 검증 산출물을 최소 하나 포함합니다(`rule://harness-verification_tests_and_evals`).
- **문서/정책 전용 모드**: 순수 마크다운/정책/템플릿 편집은 `rule://harness-verification_tests_and_evals`의 docs-only 검증 경로를 따르고 그 근거 형식을 포함합니다.
- **참조 문서 동기(소스 리포만)**: omp 소스 리포에서는 `claudedocs/CLAUDEKR.md`(이 파일의 한국어 미러)를 같은 PR에서 갱신하거나 stale로 명시합니다. `source_commit_hash`는 AGENTS.md를 마지막으로 바꾼 커밋이므로, 미러의 `status: synced` 재스탬프는 AGENTS.md를 건드리지 않는 후속 커밋에서 합니다(같은 커밋에서는 일치할 수 없습니다). 소비 리포에는 미러가 없습니다(`claudedocs/`는 동기화되지 않습니다. 오래된 `init`이 남긴 사본이 있으면 삭제하세요 — 유지되지 않습니다).
- **Scope self-detection (L1)**·**Cycle intake (L1)**: `rule://harness-core` 참조. 계약은 [`docs/rules/scope_self_detect_policy.md`](../docs/rules/scope_self_detect_policy.md)와 `rule://harness-cycle_definition`(기계적 backstop = `acceptance-gate`).

## 완료 계약 (MUST)

"완료" 보고에는 `rule://harness-core`가 정의한 세 절이 있어야 합니다: 적용한 규칙·체크리스트, 근거(파일 경로 + 발췌 또는 명령 출력), 검증(실행한 것과 결과). 독립 완료 검증은 `task` 도구로 `verifier` 에이전트(`.omp/agents/verifier.md`)에 위임하며, verdict가 도착한 뒤에만 완료를 선언합니다.

## 예외 프로토콜 (막혔을 때 MUST)

어떤 MUST든 지킬 수 없으면:

1) **이유**를 밝힙니다(어떤 제약이 막는지).
2) **2–3개 대안**을 제시합니다(안전한 것만).
3) 위험하거나 되돌릴 수 없는 대안이 있으면 **명시적 확인**을 받습니다.

## MCP 서버 정책 (트리거 기반)

- 전체 정책은 `rule://harness-mcp_policy`. 서버는 OMP의 MCP 설정(`omp://mcp-config.md`)에 등록돼 있습니다.
- **외부 라이브러리/API 진실**: `librarian` 에이전트(소스 읽기) 또는 공식 문서 직접 읽기. (Context7 정책은 2026-08-26 폐기 — `rule://harness-mcp_policy` 참조.)
- **Supabase**: DDL은 반드시 migration으로. 조회는 직접 SQL도 가능합니다.
- **웹 검색**: 최신 사건, 오류, 최신 문서에 사용하는 것이 좋습니다.

## 에이전트 라우팅 정책 (트리거 기반)

- 전체 라우팅 규칙은 `rule://harness-agent_routing`(2026-06에 폐기한 미사용 MCP 위임 매트릭스 포함).
- **reviewer**: **high/critical 위험** 변경(`risk-assess` 기준: 보안/인증/마이그레이션 파일 접촉, 또는 코드 100줄 초과)에 위임하는 것이 좋습니다. low/medium은 자체 리뷰만 — 추가 스폰 없음. 3-pass 적대 리뷰(self + 이종 adversary + code-reviewer, 셋 다 `.omp/agents/`에 정의 — 외부 플러그인 불필요. reviewer가 `spawns:` frontmatter로 Pass 2/3를 중첩 스폰). 이는 `review-gate`가 집행하는 것과 같습니다: 기계 증거는 엄격한 JSON 튜플 사이드카(`docs/reviews/review-<ts>.json`, `["omp-review-evidence/v1", <hash>, <verdict>, <models|null>, <human|null>, <reviewer>]` — 게이트는 마크다운을 읽지 않음)이고, 2차 관점 증거(실측된 2계열 이상 models 배열 또는 사람 신원)는 high/critical 커밋에만 필요하며, 유일한 우회는 감사되는 override(`docs/harness/review-skip`에 `["omp-review-override/v1", <reason>, <approved_by>, <hash>]`, `docs/harness/audit.jsonl`에 기록 후 소비)입니다. **디스패치 preflight (MUST)**: reviewer를 스폰하기 전에 자신의 깊이와 `task` 도구 가용성을 확인합니다 — reviewer는 Pass 2/3에 `task` 도구가 필요하고(재귀 상한: depth <= 1), `task` 도구가 없는 세션은 세션 안에서 리뷰를 수행하면 안 됩니다(진입점 우선순위: `rule://harness-agent_routing`).
- **verifier**: AC가 있으면 완료 선언 전에 반드시 위임합니다. `task` 스폰은 비차단(비동기 결과 전달) — **스폰은 완료가 아니며, verifier verdict가 실제로 도착한 뒤에만 완료를 선언합니다.**

## 링크 모듈

하네스 규칙 하나는 규칙집 항목(`rule://harness-<name>`)이자 파일(`.omp/rules/harness-<name>.md`; 예: [`.omp/rules/harness-writing_style.md`](../.omp/rules/harness-writing_style.md))입니다.

- 핵심 규칙: `harness-safety_security`, `harness-agent_security`, `harness-anti_hallucination`, `harness-repo_command_discovery`, `harness-information_discovery`
- 품질 규칙: `harness-coding_standards`, `harness-verification_tests_and_evals`, `harness-change_control`, `harness-tdd_policy`, `harness-code_review_policy`, `harness-quality_gates`, `harness-writing_style`, `harness-prompt_engineering`, `harness-design_contract`
- 도구 규칙: `harness-mcp_policy`, `harness-hook_recipes`
- 프로세스 규칙: `harness-assetization`, `harness-commit_and_pr`, `harness-cycle_definition`, `harness-harness_integration_contract`, `harness-adversarial_review`, `harness-agent_routing`
- 운영 규칙: `harness-context_management`, `harness-session_persistence`, `harness-cost_awareness`, `harness-learning_policy`
- 선택: `harness-documentation_policy`, `harness-doc_standards`

- 아티팩트 역할(seed/scope/audit 3계층): [`docs/rules/artifact_roles_contract.md`](../docs/rules/artifact_roles_contract.md)
- Scope self-detect 정책(L1): [`docs/rules/scope_self_detect_policy.md`](../docs/rules/scope_self_detect_policy.md)

## 체크리스트 (필요 시)

- 계획: [`checklists/plan.md`](../checklists/plan.md)
- 검증: [`checklists/verify.md`](../checklists/verify.md)
- 위험 조작: [`checklists/risky_actions.md`](../checklists/risky_actions.md)
- 버그 수정 프로토콜: [`checklists/bugfix.md`](../checklists/bugfix.md)
- PR 본문: [`checklists/pr.md`](../checklists/pr.md)
- 코드 리뷰: [`checklists/code_review.md`](../checklists/code_review.md)
- 품질 게이트: [`checklists/quality_gate.md`](../checklists/quality_gate.md)
- 평가(EDD): [`checklists/eval.md`](../checklists/eval.md)
- 구현 전 조사: [`checklists/research_before_implement.md`](../checklists/research_before_implement.md)

## 템플릿

- 가정: [`templates/assumptions.md`](../templates/assumptions.md)
- 변경 로그: [`templates/decision_log.md`](../templates/decision_log.md)
- PR 설명: [`templates/pr_body.md`](../templates/pr_body.md)
- 회고 노트: [`templates/retro.md`](../templates/retro.md)
- 평가 정의: [`templates/eval_definition.md`](../templates/eval_definition.md)
- 평가 보고: [`templates/eval_report.md`](../templates/eval_report.md)
- 세션 회고: [`templates/session_retro.md`](../templates/session_retro.md)

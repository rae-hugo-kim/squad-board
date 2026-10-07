# 002 — 정책 층 재계층화: 링크 문서 단일 매체에서 omp 규율 위계(alwaysApply · rulebook · 링크 · 머신)로

- 결정일: 2026-09-26
- 상태: 확정 (작업 이슈 #50, 별도 세션에서 브랜치 작업)
- 원천: 이슈 #49 #31, 첫 커밋 `8f9d689`(2026-06-10 포팅), `128758e`(2026-09-05 소비자 확장점), ADR 001 §3, `scripts/harness-sync.sh:172-177`, `omp://rulebook-matching-pipeline.md`, `omp://context-files.md`, `omp://system-prompt-customization.md`, 세션 기록 `docs/sum/session_2026-09-26_account-pin-and-persona-block.md`, 2026-08-13 세션 덤프(렌더된 시스템 프롬프트)

## 결정

하네스의 정책 문서를 "AGENTS.md 색인 + 마크다운 링크"라는 단일 매체에서 omp가 제공하는 규율 위계로 재배치합니다. 트리를 재작성하지 않고, 각 규칙이 **어느 가시성 칸에 있어야 하는지**를 분류해 옮깁니다.

| 칸 | omp 매체 | 가시성 | 하네스 배치 |
|---|---|---|---|
| A. 상시 본문 | `.omp/rules/harness-core.md` (`alwaysApply: true`) | 매 요청 시스템 프롬프트에 본문 전체 | 긴 세션에서도 지켜야 할 행동 규칙 ≤ 12줄: 문체·경어체 요건(R1–R3 요약), Completion Contract 3절, verifier verdict 도착 후 완료 선언, 위험 조작 사전 승인, 근거 인용, Scope self-detect·Cycle intake 한 줄씩 + `rule://` 포인터 |
| B. 규칙집 | `.omp/rules/harness-<name>.md` (`description` frontmatter) | 매 프롬프트에 이름+설명 한 줄, 본문은 `rule://harness-<name>` | 현행 `rules/*.md` 28편 (INDEX 제외) |
| C. 링크 문서 | 지금 그대로 | 에이전트가 `read` 해야 존재 | `checklists/`, `templates/`, `docs/rules/*`(스킬이 직접 읽는 산출물 계약), `docs/prompt-writing-handbook.md` |
| D. 머신 | `~/.omp/agent/PERSONALITY.md` | omp block 0의 페르소나 프리셋을 대체 | `templates/PERSONALITY.md`를 `bootstrap`이 사용자 디렉터리에 복사(없을 때만). 리포가 통제할 수 없는 층이라 셋업 절차로만 보장 |

부속 결정:

1. **소유 경계는 이름 접두사로 유지합니다.** `.omp/rules/`는 ADR 001 §3의 소비자 공간이므로 디렉터리 sweep은 금지 그대로이고, 하네스 규칙은 `harness-` 접두사 파일만 동기화합니다(기존 `harness-*.md` 삭제 후 복사). `scripts/harness-sync.sh`에 접두사 글롭 항목 1종을 추가하고 W3 가드(`harness-wiring.test.mjs:49`)가 그 패턴을 "파일 단위 등재"로 인정하도록 갱신합니다. omp 네이티브 탐색은 `<cwd>/.omp/rules/*.{md,mdc}` 비재귀라 하위 디렉터리(`.omp/rules/harness/`)는 발견되지 않습니다.
2. **원천은 하나입니다.** `rules/*.md`는 `.omp/rules/harness-*.md`로 이동(git mv)하고 `rules/` 디렉터리와 화이트리스트 항목 `rules`를 제거합니다. `rules/INDEX.md`의 소유 범례·충돌 순서·관할 구분은 `AGENTS.md`로 옮기고, 목록 자체는 omp 규칙집 노출이 대체합니다.
3. **AGENTS.md는 색인과 집행 표로 남습니다.** A칸으로 옮긴 MUST 문장은 AGENTS.md에서 한 줄 포인터로 줄여 본문 중복을 없앱니다(현재 16.9 KB, 컨텍스트 파일은 프롬프트 footer에 한 번 실리는 층입니다). "Linked Modules"는 `rule://harness-<name>` + 파일 경로 병기로 바꿉니다.
4. **#49의 처방을 수정합니다.** 하네스 문체·완료 보고 요건은 `.omp/RULES.md`(프로젝트 sticky)가 아니라 A칸 `harness-core`에 싣습니다. 이유는 근거 4항 — 사용자 `~/.omp/agent/RULES.md`가 프로젝트 파일을 가리는 반면 `alwaysApply` 규칙은 이름(`harness-core`)이 고유해 어느 머신에서도 실립니다. `.omp/RULES.md`는 소비자 고유 요건용 확장점으로 남기고, `init` 안내 문구의 "loads alongside"는 "shadow"로 정정합니다(#49 완료 기준 2 유지).
5. **TTSR(`condition`)은 이번 범위 밖입니다.** `commit_and_pr`·`design_contract`처럼 트리거형 후보가 있으나 조건 문법(글롭 모양 값의 `tool:edit` 변환 등)을 실측하지 않았으므로 B칸으로 먼저 옮기고, 별도 사이클에서 도입 여부를 판단합니다.
6. **소비 리포 이행**은 `harness-check`가 처리합니다: 새 버전 sync 시 화이트리스트에서 빠진 `rules/`(하네스 소유였던 디렉터리)를 제거하고 `.omp/rules/harness-*.md`를 설치합니다. 소비자 자체 문서가 `rules/<name>.md` 경로를 링크했다면 `migrate` 안내로 치환합니다.

## 검토한 대안과 기각 사유

| 대안 | 기각 사유 |
|---|---|
| 현상 유지(색인 + 링크, 모델의 자발적 read에 의존) | 29편 중 프롬프트에 존재하는 것이 0편. 게이트 없는 정책(문체·완료 보고)은 읽히기 전엔 작동하지 않아 #49가 재발합니다 |
| `SYSTEM.md`/`SYSTEM_TEMPLATE.md`로 block 0 인수 | omp 기본 프롬프트 전체를 리포가 떠안아 업그레이드마다 shipped 템플릿과 diff 유지. 충돌 원천은 프리셋 1블록이고 `PERSONALITY.md`가 그 블록만 대체합니다(#49 기각 사유 유지) |
| 규칙 전부 `alwaysApply` | `rules/` 본문 합계 약 130 KB(`harness_integration_contract.md` 36 KB, `prompt_engineering.md` 27 KB)가 매 요청에 실립니다 |
| AGENTS.md에 본문을 더 인라인 | 컨텍스트 파일은 footer에 한 번 실리는 층이라 긴 세션에서 밀리고(#49 근거 4) 이미 16.9 KB입니다 |
| 하네스 요건을 프로젝트 `.omp/RULES.md`(sticky)에 | 규칙 이름이 고정 `RULES`라 사용자 `RULES.md`가 있는 머신에서 가려집니다. omp 문서상 sticky는 "always-apply 규칙으로 변환"이며 별도 재부착 경로가 바이너리에 없어 `alwaysApply` 파일과 가시성이 같습니다 `[INFERENCE: 문서+strings 검색, 런타임 미측정]` |
| `.omp/rules/harness/` 하위 디렉터리로 디렉터리 sweep | omp 네이티브 탐색이 비재귀(`*.md`)라 발견되지 않습니다 |
| `rules/` 유지 + sync 시 `.omp/rules/` 사본 생성 | 원천 이중화. 편집이 한쪽에만 반영되는 drift 경로가 생깁니다 |
| `.omp/rules/harness-*.md → ../../rules/*.md` 심볼릭 링크 | 플랫폼(Windows 체크아웃)·omp 탐색·git 속성 호환을 검증하지 않았고, 검증 비용이 이동 비용보다 큽니다 |
| 하네스 규칙 29편을 화이트리스트에 파일별 열거 | 파일 추가·개명마다 목록 관리(ADR 001이 같은 이유로 테스트 파일 열거를 기각). 접두사 글롭이 같은 안전성(소비자 파일 비접촉)을 유지합니다 |

## 근거

1. **출신.** 첫 커밋 `8f9d689` "Claude Code 하네스 템플릿을 OMP 네이티브로 포팅 (harness/2026.49 기반)". README 포팅 고지 표: `CLAUDE.md → AGENTS.md`, 훅 11종 → 확장 1개, 게이트 로직 무변경(테스트 177개). 집행 층은 omp 이벤트(`tool_call`/`tool_result`/`session_start`)로 재배선됐지만 정책 층은 `CLAUDE.md` 트리(색인 + 링크)를 이름만 바꿔 이식했습니다. `claudedocs/CLAUDEKR.md`라는 미러 이름이 그 흔적입니다.
2. **omp 위계 미사용 실측(2026-09-26, 18.3.0).** `.omp/rules/` 0편, `rules/*.md` 29편 모두 frontmatter 없음, 현재 세션 시스템 프롬프트에 규칙집 목록 없음(`<generic-rules>`는 사용자 `~/.omp/agent/RULES.md` 본문). `rule://writing_style`은 주소 자체가 없습니다. 반면 AGENTS.md "Consumer extension points" 표(2026-09-05 `128758e`)는 소비자에게 `.omp/rules/`를 "Stronger than a `rules/` link"라고 안내합니다 — 하네스 자신에게는 적용하지 않은 채로요.
3. **omp 프롬프트 위계.** `omp://rulebook-matching-pipeline.md`: 네이티브 provider가 `<cwd>/.omp/rules/*.{md,mdc}`·사용자 `rules/`·양쪽 `RULES.md`를 읽고, 버킷은 TTSR > always-apply(본문 상시) > rulebook(`description` 필수, 이름+설명 노출, `rule://`로 본문). `omp://context-files.md` §"Sticky rules vs normal context": 컨텍스트 파일은 opening project context에 한 번, `RULES.md`는 always-apply 규칙으로 변환, 두 sticky 후보는 이름 `RULES`로 dedup되어 사용자 파일이 프로젝트 파일을 가립니다. 2026-08-13 세션 덤프의 블록 순서 `§ Role → § Runtime → … → PROJECT → <repo-rules>(AGENTS.md)`가 오늘과 동일해, AGENTS.md가 하류인 것은 버전업 산물이 아니라 상수입니다.
4. **증상.** #49: 소비 리포(맥)에서 경어체·두괄식·Completion Contract 반복 위반, 원인은 "규칙이 Linked Modules에만 있어 열기 전엔 컨텍스트에 없음" + 페르소나 블록 충돌 + 사용자 규칙 파일 부재. 이 머신(규칙 파일 보유)의 Opus 5.5 세션(2026-09-24)에서도 40자 초과 텍스트 127건 중 63건 영어 — 툴 호출 사이 진행 서술이 페르소나 블록(`Fragments when clearer`)을 따라갔습니다. 게이트가 있는 정책은 석 달간 깨지지 않았고 깨진 것은 전부 `owner: local-policy`(게이트 없음) 항목입니다.
5. **페르소나 스위치 실측.** `personality` 설정(`default|friendly|pragmatic|none`, 기본 `default` = "Terse, evidence-first engineer")이 프리셋을 고르고, `~/.omp/agent/PERSONALITY.md`(사용자 디렉터리만 탐색)가 프리셋 본문을 대체합니다. 마커 파일 A/B 프로브(gemini-3.7-flash, `-p --no-rules --no-skills --no-extensions`): `"Fragments when clearer"` 없음 / 마커 있음 / `"Evidence-first terse engineer"` 없음. 서브에이전트는 항상 `none`.
6. **소유 경계 계약.** ADR 001 §3과 `scripts/harness-sync.sh:172-177`: 디렉터리 항목은 하네스 소유 디렉터리만, 공유 디렉터리(`.omp/agents/`, `docs/rules/`)는 파일 단위 등재. 접두사 글롭은 이 원칙(소비자 파일 비접촉)을 유지하면서 파일별 열거의 관리 비용을 없앱니다.

## 트레이드오프

- 매 프롬프트에 규칙집 28줄 + `harness-core` 본문(약 1.5 KB)이 추가됩니다. AGENTS.md 중복 제거로 상쇄 가능하며, 순증가 여부는 재계층화 후 `/dump`로 측정해 Revisit 항목에 기록합니다.
- `rules/` 트리가 GitHub 브라우징에서 사라지고 `.omp/rules/`(숨김 디렉터리)로 들어갑니다. 사람 독자용 진입점은 AGENTS.md "Linked Modules"의 파일 경로 병기로 유지합니다.
- 규칙집은 "존재를 매 턴 알리는" 층이지 본문을 강제하는 층이 아닙니다. 위반이 지속되는 규칙은 개별적으로 A칸으로 승격하는 후속 판단이 필요합니다.
- 소비 리포는 새 버전 첫 sync에서 `rules/` 제거 + `.omp/rules/harness-*` 설치라는 1회 구조 변화를 겪습니다. 소비자 문서의 `rules/<name>.md` 링크는 깨집니다(migrate 안내로 완화).
- D칸(PERSONALITY.md)은 리포 밖이라 `bootstrap`을 실행하지 않은 머신에서는 페르소나 충돌이 남습니다. `harness-version-check`류 세션 시작 점검에 "PERSONALITY.md 부재" 알림을 추가할지는 후속 판단입니다.
- `claudedocs/CLAUDEKR.md` 미러 갱신 비용이 한 번 큽니다(AGENTS.md 구조 변경).

## 확정 사항 (2026-09-26)

초안의 다섯 가지 열린 항목을 사용자가 모두 제안안으로 확정했습니다.

1. 원천 위치: `rules/*.md` → `.omp/rules/harness-*.md` 이동(단일 원천, `rules/` 제거).
2. A칸 매체: `.omp/rules/harness-core.md`(`alwaysApply: true`). 프로젝트 `.omp/RULES.md`는 소비자 확장점으로만 남깁니다(#49 처방 수정).
3. 첫 사이클 범위: 29편 일괄 이동.
4. 페르소나: `templates/PERSONALITY.md`를 `bootstrap`이 `~/.omp/agent/`에 복사(부재 시).
5. `rules/INDEX.md`: 소유 범례·충돌 순서·관할 프로즈를 AGENTS.md로 흡수, 목록은 omp 규칙집 노출로 대체.

## 완료 기준

1. 이 리포 새 omp 세션의 시스템 프롬프트에 `harness-*` 규칙집 목록(이름+설명)이 있고, `read rule://harness-writing_style`이 본문을 돌려주며, `harness-core` 본문이 매 요청에 실립니다(`/dump` 또는 `omp -p` 프로브로 확인).
2. 픽스처 소비 리포에 `.omp/rules/consumer-x.md`를 두고 `scripts/harness-sync.sh`를 실행해도 그 파일이 남고, `harness-*.md`만 교체됩니다. W3 가드 갱신본 통과.
3. `rules/` 디렉터리 제거 후 `scripts/docs-drift`와 `bash scripts/harness-audit.sh --terse` 점수가 내려가지 않습니다.
4. AGENTS.md와 `claudedocs/CLAUDEKR.md`가 같은 PR에서 갱신되거나 stale 표기됩니다.
5. `bootstrap`이 `~/.omp/agent/PERSONALITY.md` 부재 시 `templates/PERSONALITY.md`를 복사하고, A/B 프로브에서 `"Fragments when clearer"`가 사라집니다.
6. 소비 리포 1곳(#49의 `blender` 권장)에서 `harness-check` 후 `rules/` 고아 없음, `.omp/rules/harness-*` 존재, 이후 세션의 문체 위반을 같은 census(모델별 40자 초과 텍스트의 한글 비율)로 재측정합니다.

## Revisit Triggers

- omp가 네이티브 규칙 탐색·규칙집 렌더링·TTSR 계약을 바꿀 때(#31의 업데이트 감사 축: `omp://rulebook-matching-pipeline.md` diff, 렌더된 block 0 diff).
- 재계층화 2주 후에도 B칸 규칙의 위반이 반복되면 해당 규칙을 A칸으로 개별 승격하거나 TTSR `condition` 도입(부속 결정 5)을 재검토.
- `/dump` 측정에서 매 요청 프롬프트가 재계층화 전보다 커지면 규칙집 설명을 줄이거나 B칸을 분할.
- omp가 프로젝트 레벨 `PERSONALITY.md`를 지원하면 D칸을 `bootstrap`에서 리포 파일로 이관.
- 소비 리포 sync에서 `rules/` 제거가 소비자 파일을 지운 사례가 1건이라도 나오면 이행 절차(부속 결정 6)를 중단하고 재설계.

## Amendment 2026-09-26 — 구현 결과와 프롬프트 크기 실측

- 사이클 ①–⑦ 착지(브랜치 `rae-hugo-kim/policy-retier`): 28편 `.omp/rules/harness-<name>.md` + `harness-core.md`(alwaysApply, 본문 8줄), `harness-sync.sh` 글롭 항목·`rules/` 은퇴(7c), AGENTS.md 축약, `templates/PERSONALITY.md` + bootstrap Phase 2.6.
- 매 요청 프롬프트 순증가(구성 요소 합산, 세션 파일에는 시스템 프롬프트가 저장되지 않아 `/dump` 대신 산출): 규칙집 28행 3,192 B + `harness-core` 본문 1,681 B − AGENTS.md 축소 908 B(16,850 → 15,942 B) = **+3,965 B/요청**. 트레이드오프 절의 예상(규칙집 28줄 + 약 1.5 KB)과 일치한다. Revisit 트리거 3("전보다 커지면")의 조건 자체는 충족됐지만 예상 범위 안이라 즉시 조치(설명 축약·B칸 분할)는 보류하고, 2주 후 위반 재측정(트리거 2)과 함께 다시 판단한다 — 규칙집 설명은 평균 114 B/행을 상한으로 유지한다.
- 완료 기준 6(소비 리포 재측정)은 머지·태그 뒤 절차로 남는다.

# Absorption Manifest — 7/24 미커밋 하드닝 처분 (AC7)

**Date**: 2026-07-29 · **Task**: 20260729-132948-e510 (seed v3) · **작성 모델**: 세션(fable-5, 6차 리뷰 맥락 적재 상태)
**대상**: 2026-07-24 세션의 미커밋 변경 — tracked 14파일(+1,789/−173 중 하네스분) + untracked 2파일
**분류 원칙**: v3 설계(차단면 = pre-commit 훅 1개, 명령층 = 최소 tripwire) 기준으로 콘텐츠의 목적지를 판정. "폐기"는 기계적 revert 지시가 아니라 **최종 상태에 포함되지 않음**의 뜻 — executor는 현재 트리에서 목표 상태로 직행해도 된다 (AC3 순감 수치는 HEAD→최종으로 측정).

## 기준선 (AC3 순감 측정용, 실측 2026-07-29)

| 파일 | HEAD | 7/24 워킹트리 | v3 목표 |
|---|---:|---:|---|
| gates/git-commit-detect.mjs | 482 | **1,020** | 대폭 순감 (tripwire 잔존분만) |
| gates/commit-gates.mjs | 81 | 261 | 훅 어댑터로 대체 (AC6) |
| index.ts | 390 | 435 | tripwire 축소 |
| tests/commit-gates.test.mjs | 221 | 641 | 유지+개작분만 |
| tests/git-commit-detect.test.mjs | 372 | 678 | tripwire 테스트만 |
| gates/gate-verdict.mjs (신규) | — | 16 | 유지 |

## 1. 유지 (v3에서 그대로 가치 있음)

| 항목 | 근거 |
|---|---|
| `gates/gate-verdict.mjs` 전체 (untracked, 16행) + commit-gates.test.mjs의 `isCleanGateRun` 단위테스트 | fail-closed 판정 경계의 순수 헬퍼 — 훅/tripwire 스폰 경계에서 동일하게 필요. 6차 리뷰가 전문 검토 완료 |
| `index.ts`: SIGKILL killSignal·어댑터 오류 fail-closed(외곽 catch 분리) | 스폰 경계의 crash-is-block 계약 — 집행 위치와 무관한 인프라 (r3/r6 리뷰 통과분). **단, `killed`/`signal` 필드와 `isCleanGateRun` 배선은 최종적으로 폐기**했습니다: 이 경로의 게이트는 전부 advisory/edit-scoped이고 커밋 판정은 훅이 자체 fail-closed로 처리하므로 소비자가 없었습니다(리뷰 3R L3) |
| `index.ts`: 구조화 입력 passthrough 중 `env` | v3 tripwire의 GIT_*/GIT_CONFIG_* env 주입 감시가 그대로 소비 |
| git-commit-detect.mjs의 `isGitCommit` **export 표면** (기본형) | `breadcrumb-tracker.mjs:13`(PostToolUse, 비커밋 경로 소비자)이 import — AC3 순감 시에도 export 유지 (test-attack C-4, 2026-07-29) |
| `skills/gh-fanout`: `PI_AUTO_QA=0` 배선 (1행) | 게이트와 무관한 독립 개선 (7/24 seed의 부수 AC) |
| `claudedocs/harness-auto-capture-analysis.md` +66행 (Q11 텔레메트리 분석) | 분석 문서 — 재설계와 독립 |

## 2. 개작 (콘텐츠 재사용, 형태 변경 — 대응 AC 명시)

| 항목 | 재사용처 | 개작 내용 |
|---|---|---|
| commit-gates.test.mjs의 **관할·크로스레포 픽스처군**: `seedCommit` 헬퍼, harness-enabled foreign repo 빌더, 'NON-harness skips'·'REVERSE direction closed'·'foreign target passing'·'unborn-HEAD foreign'·'marker staged-delete'·'index-only marker'·'symlink+.. attribution' | **AC2** 신규 픽스처의 골격 | 단언 대상을 "디스패처 exit code" → "대상 레포 훅 발화 여부"로 교체. 관할 시맨틱(정방향 skip·역방향 봉쇄)은 그대로 검증 목표 |
| commit-gates.mjs의 `AMBIENT_GIT_ENV` 검사 + `unsafeCommitExecutionEnvKeys` 경로, 대응 테스트('ambient GIT_DIR blocks'·'r5 env injection') | **AC3** tripwire | GIT_*/GIT_CONFIG_* env 감시는 v3 tripwire 명세에 잔존 — 디스패처에서 tripwire로 이식 |
| git-commit-detect.mjs의 `GIT_REPO_REDIRECT_ENV`/why-`+=` 패턴 상수와 그 테스트(`GIT_DIR+=` 등) | **AC3** tripwire | env 이름 패턴만 발췌 — 주변의 귀속 로직은 버림 |
| commit-gates.mjs의 `hasHarnessMarker` 3중판정(+`gitToplevel`/`safeReal`) | **AC1** post-commit 백스톱 후보 | 백스톱이 "하네스 레포인데 게이트 미경유" 판정 시 재사용 가능 — executor가 AC1 설계 시 채택/기각 결정 (기각 시 폐기로 전환) |
| `skills/sum`·`skills/compush`의 단계 분리 서술(사전체크→스테이징→커밋→푸시) | **AC5** | 4단계 분리 자체는 위생으로 유지하되, "standalone-commit 규칙에 의해 BLOCK" 근거 서술은 삭제 — v3에선 vault 레포에 훅이 없어 관할 밖(마찰 자체가 소멸). realpath 리터럴 치환 요구도 근거 상실 → 완화 |
| commit-gates.test.mjs 'sum-vault flow' 테스트 | **AC2/AC5** | 관할-밖 skip의 실증 케이스로 단언만 교체 |

## 3. 폐기 (철자-열거·정적 귀속 — v3 최종 상태에 불포함)

| 항목 | 사유 |
|---|---|
| git-commit-detect.mjs +696행 중 §2 발췌분 제외 전부: `isCommitSuspect`·`commitIsStandalone`·`resolveCommitTarget`·`hasDynamicGitSubcommand`·`hasIndirectExecutionSyntax`·`hasDetachedSetsid`·`hasUnsafeInlineExecutionEnv`·`hasUnquotedOutputRedir`·`literalCValue`·`segCdLike`·`segPersistsGitEnv`·`gitCommitSegScanAll`·`hasRetargetIndicator`·`programCandidates`·`lexSegments(meta)` 확장·backslash/CRLF 토크나이저 정합·`isGitCommit` 하드닝(sudo -u/글루드 치환/`\git` 등)·`parseCommitForm`/`isWipCommit`의 `opts` 스레딩 | 전부 "문자열 층위에서 셸 의미론 동치판정" 시도 — 6차 리뷰가 증명한 지는 게임의 본체. 훅은 철자와 무관하므로 존재 이유 소멸. AC3 제거 대상과 정확히 일치 |
| commit-gates.mjs의 귀속 블록: suspect 프리게이트·standalone 강제·async 차단·`repo_redirect_resolved` 산출·toplevel 프로브 | 귀속은 "훅이 대상 레포에서 뜬다"로 대체. async 커밋도 훅이 어차피 잡음 |
| 자식 게이트 4종의 `formOpts`/`repo_redirect_resolved` 스레딩 (+9/+2/+2/+2행) | AC6이 command 결합 자체를 제거 — 이 헌크들이 붙어 있던 결합면이 사라짐 |
| index.ts의 `isCommitSuspect` import·배선, 25s 타임아웃의 프로브 근거 주석 | suspect 소멸. 타임아웃은 AC6에서 훅 구조에 맞게 재산정 |
| tests/git-commit-detect.test.mjs +308행 중 §2 발췌분 제외 전부 (철자 케이스: `\git`·sudo·글루드 치환·redirection·CRLF 등) | 제거되는 함수의 테스트 — 함수와 함께 소멸 |
| commit-gates.test.mjs 중 standalone/suspect/귀속 케이스: 'compound add&&commit' 2종·'standalone stays allowed'·'cd alongside'·'-C nonexistent'·'unresolvable -C'·'git -C . normalization' 2종·'2>&1 fails closed'·'GIT_CEILING probe poisoning'·'r5 substitution/async'·'r6 dynamic/indirect/env/setsid' 전부 | 동상 |
| `docs/harness/seed.yaml`의 7/24 콘텐츠 · 구 `current-scope.md`(untracked) | 신규 kickoff 산출물로 대체 — 원본 두 벌 모두 `archive/20260724-cross-repo-denylist/` 보존 (13AC 체크는 6차 리뷰 이전 기록이라 stale였음) |

## 4. 매니페스트 대상 아님 (본 kickoff 산출물 — 현 diff에 섞여 있음)

`docs/harness/{audit.jsonl,kickoff-summary.md,plan-attack-report.md,rubric-report.md,current-scope.md,seed.yaml(현행 내용),absorption-manifest.md}` — task 20260729-132948-e510 자체 산출물.

## Executor 주의사항

1. **폐기 ≠ `git restore`**: git 상태 변경은 사용자 명시 지시 필요. 현재 트리에서 v3 목표 상태로 파일 편집으로 직행하라.
2. `hasHarnessMarker` 채택/기각(§2 마지막 행)은 AC1 백스톱 설계 시점에 결정하고, 기각하면 본 매니페스트를 갱신해 폐기로 옮길 것 (AC7 verify의 정합 대조 대상).
3. AC3 순감 보고는 위 기준선 표를 인용할 것 (HEAD 기준과 7/24 워킹트리 기준 양쪽 대비).
4. 라이브 실증 (2026-07-29, 본 매니페스트 작성 중): 읽기 전용 `git show HEAD:$f | wc -l` 루프가 suspect 휴리스틱에 오차단됨 — 현행 denylist의 false-positive 마찰 실례. AC3 완료 후 동일 명령이 통과해야 한다 (회귀 스모크 후보).

## 실행 결과 (2026-07-30, 구현 후 갱신 — AC7 verify)

### 분류 변경 2건 (매니페스트 주의사항 2의 절차대로 기록)

| 항목 | 원 분류 | 실제 | 사유 |
|---|---|---|---|
| `gates/gate-verdict.mjs` + 그 단위테스트 | 유지 | **폐기** | 유일 소비자가 index.ts의 commit-gates spawn 경계였고 AC3가 그 spawn을 제거 — 훅 경로는 bash가 자체 fail-closed를 구현. 파일 삭제(미커밋분이라 흔적 없음) |
| `programCandidates` (§3 폐기 목록) | 폐기 | **유지** | 유지 기반인 `segmentIsGitCommit`(→`isGitCommit`)이 의존. isGitCommit은 breadcrumb-tracker·tripwire의 전제라 함께 유지 |
| `hasHarnessMarker` 3중판정 (§2 채택/기각 미결) | 개작 후보 | **폐기** | v3 관할 의미론이 "훅이 이 레포에서 떴는가"로 대체 — 마커 프로브 자체가 불필요 |

### AC3 순감 실측 (양축, C-6 요구)

| 파일 | HEAD | 7/24 워킹트리 | 최종 (리뷰 5R 교정 후) | vs 7/24 |
|---|---:|---:|---:|---:|
| gates/git-commit-detect.mjs | 482 | 1,020 | 790 | **−230** |
| gates/commit-gates.mjs | 81 | 261 | 175 | **−86** |
| gates/gate-verdict.mjs | — | 16 | 0 (삭제) | **−16** |
| index.ts | 390 | 435 | 431 | **−4** |
| tests/git-commit-detect.test.mjs | 372 | 678 | 373 | **−305** |
| tests/commit-gates.test.mjs | 221 | 641 | 0 (삭제) | **−641** |
| **합계** | 1,546 | 3,051 | 1,769 | **−1,282** |

신규 산출물: `.githooks/{pre-commit,post-commit,post-merge}` 260행(75+151+34) + 테스트 3파일(`hook-gates` 1,244 / `commit-tripwire` 225 / `harness-wiring` 131) 1,600행. 전 스위트 **474 테스트**.

**정직한 해석**: 7/24 denylist 대비 명령층은 **−1,282행** 순감했습니다(파일별 델타 합도 −1,282로 내부정합). 1라운드 시점의 −1,482에서 줄어든 200행은 전부 리뷰 2~5라운드 교정입니다 — tripwire argv 워커, 토큰 프로토콜 v2, 소모 계층의 실패 처리, verb 스코프. HEAD 대비로는 detect 모듈이 +308행인데, 이는 tripwire(~185행: argv 워커 + 호출 종류·alias 분류)와 HEAD 이후 유지된 기반(lexSegments meta·programCandidates·토크나이저 정합) 때문입니다. `parseCommitForm` 계열(~200행)은 **의도적으로 유지**했습니다 — 게이트 4종의 non-hook(standalone 디버그) 경로와 기존 132케이스 회귀 스위트의 전제이고, 제거하면 AC4가 요구하는 회귀 기반 자체를 재작성해야 합니다. 즉 "철자-열거 판정 로직"은 사라졌고, 남은 명령-형태 코드는 HEAD 시절의 기반(isGitCommit·parseCommitForm)에 우회-선언 tripwire를 더한 것입니다. 테스트는 순증(+1,600행)이며 이는 의도된 방향입니다 — 집행 표면이 줄고 검증이 늘었습니다.

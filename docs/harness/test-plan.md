# Test Plan — precommit-gate-enforcement (v2)

**Date**: 2026-07-29 · **Task**: 20260729-132948-e510 (seed v4) · **승인**: 사용자 (GATE 1) · **v2**: test-attack run 1 (BLOCK) 18건 반영 — 대장: `docs/harness/test-attack-report.md`
**커밋 정책**: 무커밋 진행, 완료·3-pass 리뷰 PASS 후 일괄
**격리 계약 (C-7)**: U·T 시리즈 전건 `mkdtempSync` 픽스처에서 실행, 실 레포 파일 변경 0건 단언. 테스트 헬퍼는 **hermetic env**(상속 `GIT_*` 제거, 픽스처가 의도 주입만 얹음 — C-5).

## Unit — AC6 훅-모드 어댑터

| # | Given → When → Then |
|---|---|
| U1 | 클린 상태 픽스처 → hook-mode 페이로드(command 없음)로 디스패처 실행 → 자식 4종 전부 실행, exit 0 |
| U2 | current-scope AC 미체크 + non-wip staged → acceptance-gate hook-mode → exit 2, stderr `HARNESS BLOCK:` + 수정 지시 |
| U2w | wip: `.omp/harness-state` one-shot 플래그 또는 `OMP_COMMIT_WIP=1` env → U2 상황에서 통과; **플래그는 pre-commit 단계에서 미소각** (소비는 post-commit — B-4) |
| U3 | high-risk staged + 리뷰 증거 없음 → review-gate hook-mode(리스크=`--cached`) → exit 2; 유효 evidence 존재 시 exit 0 |
| U3n | **고위험 unstaged 워킹트리 변경 + staged는 docs만** → exit 0 — diffRanges가 `['--cached']` 고정임을 단언 (C-2) |
| U4 | hook-mode 게이트 실행 전후 `git status --porcelain` 스냅샷 **동일** — pre-commit 시점 추적 파일 변형 0 (B-2) |
| U5 | backpressure 실패 상태 파일 → hook-mode → exit 2 |
| U6 | `docs/sum/*` staged → archive-guard hook-mode → exit 2 |
| U7 | 모든 차단 stderr = `HARNESS BLOCK: [게이트명]` + 재시도-금지형 지시 |
| U8 | **`-a` 커밋의 임시 `GIT_INDEX_FILE`(절대 lock 경로) 상속 상태** → `--cached`에 커밋 대상 파일 가시 (A-2); env 살균 시 빈 diff가 됨을 역단언 |
| U9 | **pathspec 부분커밋**의 임시 인덱스 → 부분 staged만 `--cached`에 가시 (A-2) |
| U10 | hook-mode에서 ambient GIT_*(git이 세팅한 GIT_DIR 등) 존재 → **차단 없이 정상 판정** (ambient 검사 미수행 — A-2ii) |
| U11 | hung 자식 게이트(3s 초과) → SIGKILL + exit 2 + `HARNESS BLOCK` (B-3); 총예산 초과 동등 케이스 |

wip 설계 확정 (A-4): 플래그 파일 정본 + env 병행, 소비는 post-commit, `.git/COMMIT_EDITMSG` 스크래핑 금지(직전 커밋 메시지 반환 — 실측 rE).

## Integration — AC1 훅 집행 (임시 레포 매트릭스)

| # | 경로 → 기대 |
|---|---|
| I1 | plain commit, 게이트 통과 상태 → 커밋 성립 |
| I2 | plain commit, 게이트 실패 상태 → 커밋 객체 미생성 (`rev-parse HEAD` 불변) |
| I3 | `--amend` → 훅 발화 |
| I4 | merge 충돌 → 해소 → `git commit` → 훅 발화 |
| I5 | **hermetic 사람 커밋**: `env -i PATH=<shim> HOME=<tmp> GIT_CONFIG_GLOBAL=/dev/null …` + node shim 포함 → 훅 발화·판정 (B-1 레시피, 자동 케이스) |
| I6 | 동일 hermetic에서 **node shim 제외** → 커밋 차단 + `HARNESS BLOCK` 안내(nvm/GUI 문구), `$OMP_NODE_BIN` 지정 시 복구 (B-1) |
| I7 | 철자 스모크: `git -c alias.c=commit c -m x` → 훅 도달 |
| I8 | `--no-verify` 커밋 → **post-commit** 백스톱 advisory (비차단) |
| I9 | merge 자동커밋 → pre-commit·post-commit 미발화(실측 정합) + **post-merge** 백스톱 advisory 발화 (A-1 정정) |
| I10 | cherry-pick / revert / replay-rebase → post-commit 백스톱 경로별 advisory; **post-rewrite 이중 관찰 중복 제거** 확인 (B-5) |
| I11 | 동시 커밋 3건 → 1건 성립, 패자 rc=128 index.lock — **하네스 차단 아님** 구분 안내 (A-6) |
| I12 | sparse-checkout(cone)으로 `.githooks` 제거 → 훅 침묵 무효화 **관측** (차단 아님 — AC5 문서화 대상, A-5) |
| I13 | 훅 이후 단계 실패(빈 메시지 abort) → one-shot 플래그·상태 **불변** (B-4) |

## Unit — AC3 tripwire

| # | 케이스 |
|---|---|
| T1 | `--no-verify`·유일-접두 축약(`--no-ver`)·독립 별칭 `-n` → BLOCK |
| T2 | `-c core.hooksPath=…` / hooksPath·worktree·gitdir·include **값을 갖는** `GIT_CONFIG_*` 조합 → BLOCK (키-값 검사 — A-3) |
| T3 | `--git-dir`/`--work-tree` 최상위 리타게팅 → BLOCK |
| T4 | bash 툴 구조화 `env`의 GIT_* 리타게팅 키 주입 → BLOCK |
| T5 | 음성 회귀: plain commit·`git add && git commit`·`git merge`·변수 낀 `git show` 루프(07-29 오차단 실례)·**`GIT_CONFIG_COUNT`+credential 키 ambient**(Orca 런처 재현 — A-3) → 명령층 PASS |

## Wiring — 배포·문서 정합

| # | 케이스 |
|---|---|
| W1 | `scripts/harness-sync.sh` 동기화 목록에 `.githooks/pre-commit`(+post-merge) 열거 단언 (C-1) |
| W2 | docs-drift 도달성 모델 갱신 후: 정상 토폴로지 PASS + 고아 게이트 카나리아 심으면 FAIL (C-3) |

## Integration — AC2 크로스레포

| # | 케이스 |
|---|---|
| X1 | 훅 활성 consumer 픽스처 + 세션 cwd=omp에서 커밋 → consumer의 스코프로 판정 |
| X2 | 하네스 미보유 레포 → 무게이트 통과, omp AC 오차단 재현 불가 |
| X3 | 역방향: 외부 cwd → 하네스 레포 커밋 → 훅 발화 (7/24 픽스처 골격 개작) |

## Edge Cases

- unborn HEAD 최초 커밋 (`git diff --cached` = 빈 트리 대비)
- hooksPath 미설정 클론 = 관할 밖 (AC5 문서화 검증)
- 게이트 crash → fail-closed (U11이 timeout 축, 기존 `isCleanGateRun` 유지 테스트가 crash 축)
- GIT_* 오염 불변: 헬퍼가 `GIT_CONFIG_COUNT` 주입해도 결과 동일 (C-5)

## 검증 실행

- `node --test tests/*.test.mjs` — **hermetic env** (AC4)
- AC3 순감 **양축** 기록: git-commit-detect HEAD 482→N행 / 7-24 워킹트리 1,020→N행 (C-6)
- `node scripts/docs-drift` (갱신된 도달성 모델 — AC5)

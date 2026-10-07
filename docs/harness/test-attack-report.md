# Test Attack Report — precommit-gate-enforcement (GATE 1.5, run 1)

**Date**: 2026-07-29 · **Attacker**: test-engineer (실측: git 2.43.0, /tmp 임시 레포 8개 + 워크트리/스파스 변종)
**Verdict**: **REJECT → BLOCK** (CRITICAL 2 · HIGH 8 · MEDIUM 8) · **Full findings**: `history://TestAttack`
**처분**: override 없이 전건 반영 — test-plan v2 + seed v4 + 매니페스트 정정. 아래 표가 처분 대장.

| # | Sev | 발견 (실측 요지) | 처분 |
|---|---|---|---|
| A-1 | **CRIT** | merge 자동커밋은 post-commit **미발화** (cherry-pick/revert/replay-rebase는 발화, 충돌해소는 pre+post 발화) | 백스톱을 post-commit **+ post-merge**(비블로킹 관찰 — 블로킹 훅 1개 제약 유지)로. seed AC1·I9 정정 |
| A-2 | **CRIT** | `-a`/부분커밋 시 git이 `GIT_INDEX_FILE`=임시 lock 인덱스로 pre-commit 실행 — env 살균 시 `--cached`가 **빈 결과**(미검증 통과), ambient 검사 이식 시 **전 커밋 차단**, 상대경로 `.git/index`+타 cwd면 타 레포 인덱스 판독 | AC6에 명문화: GIT_INDEX_FILE/GIT_DIR/GIT_PREFIX **그대로 상속**, cwd=훅 레포 토플레벨 고정, hook-mode에서 ambient GIT_* 검사 미수행. U 시리즈에 `-a`·부분커밋 가시성 단언 추가 |
| A-3 | HIGH | tripwire가 `GIT_CONFIG_*`를 통짜 차단하면 Orca 런처 `GIT_CONFIG_COUNT`(credential) 주입으로 2026-07-27 전면 차단 사고 회귀 | AC3을 **키-값 검사**로 좁힘 (hooksPath/worktree/gitdir/include 값만 차단). T5에 음성 회귀 케이스 추가 |
| A-4 | HIGH | pre-commit 시점 `.git/COMMIT_EDITMSG`는 **직전 커밋** 메시지 (스크래핑=오판정); commit-msg 훅은 블로킹 훅 신설이라 제약 위반; env 상속은 정상 동작 실측 | wip 설계 확정: `.omp/harness-state` one-shot 플래그 정본 + `OMP_COMMIT_WIP=1` env 병행, **소비는 post-commit에서**, EDITMSG 스크래핑 금지 명문화 |
| A-5 | HIGH | sparse-checkout(cone)이 `.githooks/`를 제거 → 상대 hooksPath가 **경고 없이 전 훅 무효화** (커밋 rc=0, 침묵) | I 시리즈에 침묵 무효화 관측 케이스, AC5 잔여면 문서화 + bootstrap의 sparse 필수 경로 고정 검토 |
| A-6 | MED | 동시 커밋은 index.lock으로 직렬화(이중 통과 없음)되나 패자는 rc=128 — HARNESS BLOCK 계약 밖 메시지라 자가치유(lock 삭제) 유도 위험 | 케이스 1건(lock 실패≠하네스 차단) + 문서화 |
| A-7 | MED | `git stash push`는 커밋 객체를 만들지만 pre/post-commit 미발화 | goal을 "브랜치 히스토리에 올리는 경로"로 정밀화, stash를 잔여면 문서화에 |
| B-1 | HIGH | I6(node 부재) 재현 불안정 위험 — `env -i`+심링크 shim 레시피 실측 제공. nvm 경로 특성상 GUI/cron 커밋은 node 부재가 **상시** | I6를 hermetic 레시피로 명세, I5(사람 커밋)를 동일 hermetic 자동 케이스로 승격. node 검색 = PATH → `OMP_NODE_BIN` → fail-closed 안내 |
| B-2 | MED | U4 단언 수단 부재; audit.jsonl은 tracked라 pre-commit 시점 append = 커밋 후 더티 트리 | U4 단언식 확정: 커밋 전후 `git status --porcelain` 동일성. 부작용 쓰기는 post-commit으로 이전 (AC6) |
| B-3 | HIGH | crash/timeout fail-closed의 구현체(runGate 래퍼)는 index.ts 소유 — 훅 경로엔 없음. git은 pre-commit을 **무기한 대기** | 디스패처 hook-mode에 자식별 예산+SIGKILL 유지 확인 + 훅 스크립트 belt(`timeout` 가용 시). hung-child U 케이스 2건 추가 |
| B-4 | MED | pre-commit은 커밋 성립 전 실행 — 훅 이후 단계 실패(빈 메시지 등) 시 one-shot 우회권만 소각됨 (실측) | one-shot 소비를 post-commit으로 이전 (A-4와 동일 처분). "훅 후 실패 시 상태 불변" 케이스 추가 |
| B-5 | MED | 백스톱 must 5경로 중 테스트 2개뿐; ff-rebase는 커밋 생성 없어 무발화; replay-rebase는 post-commit+post-rewrite **이중 발화** | 경로별 케이스 4건 + post-rewrite 중복 관찰 제거 규칙 |
| C-1 | HIGH | `harness-sync.sh`가 훅을 **개별 열거** — pre-commit 미추가 시 consumer 배포 영구 누락, 픽스처 테스트론 비가시 | sync 목록에 `.githooks/pre-commit` 추가 + 배선 단언 테스트 (AC5) |
| C-2 | HIGH | form 제거 시 `diffRanges`가 `['--cached','']`(unstaged 포함) 폴백 → 무관한 워킹트리 수정이 리스크 견인해 오차단 | AC6: hook-mode form 명시 전달로 `['--cached']` 고정. 단언: 고위험 unstaged + docs-only staged → exit 0 |
| C-3 | MED | docs-drift의 게이트 도달성 모델이 "index.ts→디스패처→4종" 하드코딩 — 훅 스포너 전환 시 orphan 오판 | AC5: 도달성 모델 갱신 + orphan 카나리아 단언 |
| C-4 | MED | `breadcrumb-tracker.mjs`(PostToolUse)가 `isGitCommit` import — 매니페스트에 소비자 누락 | 매니페스트 §1에 "isGitCommit export 유지(breadcrumb 소비자)" 추가 — 반영 완료 |
| C-5 | HIGH | 테스트 헬퍼가 `...process.env` 통짜 상속 — GIT_* 오염 시 36/479 실패 실증 존재. AC4 "통과" 신뢰 불가 | AC4 verify를 hermetic env(상속 GIT_* 제거)로 강화 + 오염 불변 케이스 |
| C-6 | MED | 계획이 순감 기준선을 1,020(7/24 트리)만 인용 — HEAD 482 대비 누락 시 과대 보고 | 순감 보고 양축 의무화 (HEAD 482→N, 7/24 1,020→N) |
| C-7 | MED | U 시리즈 격리 수단 미명시 — 실 레포에서 돌면 라이브 상태·tracked 파일 오염 | U 시리즈 전건 mkdtemp 픽스처 + "실 레포 변경 0건" 단언 명시 |

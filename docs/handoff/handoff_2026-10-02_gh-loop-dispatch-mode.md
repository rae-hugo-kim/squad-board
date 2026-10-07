# Handoff 2026-10-02 — gh-loop dispatch 모드 (메인 세션은 오케스트레이션만)

| 항목 | 값 |
|---|---|
| 상태 | 마감 (#65 / 1e011cc) — PR #67 머지 2026-10-02, 세션 직접 결정(이슈 #65 댓글). 배경 참고용이며 지시로 읽지 않는다(`docs/rules/artifact_roles_contract.md` §Handoff) |
| 발행 | 2026-10-02, 메인 세션(코디네이터)에서 수동 handoff로 띄운 첫 워커 |
| 이슈 | `issue://65` |
| 역할 | seed의 전신 — 착지 뒤 권위는 `docs/harness/seed.yaml`로 |

## 배경

2026-10-01 첫 gh-loop 완주(#62 → PR #64, 세션 기록 `docs/sum/session_2026-10-01_restart-pr59-web-merge-ghloop62-pr64.md`, sum-vault)는 **메인 세션이 직접 작업**했다. 루프 하나가 메인 세션을 통째로 점유했고, 사용자는 "메인은 오케스트레이션과 나와의 소통만, 작업은 새 세션·새 워크트리에서, 모델은 적당히 골라서"로 바꾸기로 했다.

사용자 결정(2026-10-02, 메인 세션 ask):
1. **감독 방식 = 비차단 오케스트레이션** — 메인은 워커를 띄우고 바로 복귀한다. `orca orchestration check --wait` 같은 블로킹 대기 금지(gh-loop Non-Negotiables "블로킹 대기 금지"와 일치). 상태는 GitHub(라벨·댓글)이 원천이고, 메인은 턴마다 inbox/Orca 카드로 확인해 사용자에게 전달한다.
2. **모델 = 매번 메인이 사용자에게 물어본다** — 자동 정책 없음. 선택지는 omp `modelRoles`(`omp config get modelRoles`)의 역할(`smol`/`default`/`slow`/`plan` 등)과 실제 id를 함께 보여 주고, "이 세션과 동일"도 포함한다. 선택 결과는 이슈에 기록해 재개 때 다시 묻지 않는다(사용자가 바꾸라고 하지 않는 한).
3. **범위 = gh-loop만** — `gh-fanout`(`omp --mode rpc` 워커 스폰)의 `worker-start` 전환은 후속 이슈로 남긴다.

## 완료 문장

메인 세션에서 `/gh-loop <N>`을 치면 메인은 코드를 만지지 않고, 모델을 사용자에게 물은 뒤 새 워크트리에 새 omp 세션(워커)을 띄워 루프를 위임하고 즉시 복귀하며, 워커가 이슈→수정→PR→결정 요청까지 수행하고, 재개·머지 뒤 정리는 메인이 같은 워크트리를 다시 찾아 처리한다.

## 이미 확인된 사실 (메인 세션 실측, 2026-10-02)

- `orca-ide orchestration worker-start --help`: `(--task|--spec) [--worktree current|<selector>|new-child|new-top-level] (--agent <id>|--terminal <handle>) [--model <id>] [--effort <level>] [--name] [--repo] [--base-branch] [--comment] [--on <saved-environment>]` — 한 명령으로 새 top-level 워크트리 + 에이전트 + 모델까지. 단 Notes에 "`--model` supports Claude, Codex, Cursor, Antigravity, and Muse … Other agents … launch with the model from their own config"라서 **`--agent omp`가 `--model`을 받는지는 미검증**. `worker-start`는 Run이 바인딩돼 있어야 한다(`run-create --objective`; 없으면 `run_required`).
- `orca worktree create --issue <N>`은 Orca 카드에 이슈를 링크하고, 이후 `--worktree issue:<N>` 셀렉터로 그 워크트리를 다시 찾을 수 있다. `orca worktree rm`은 로컬 브랜치까지 함께 지운다.
- 워커가 **자기 워크트리를 지울 수 없다**(그 안에서 실행 중) → 머지 뒤 정리(워크트리·브랜치 삭제)는 코디네이터 몫.
- 코디네이터 터미널 핸들은 `orca terminal list --json`에서 `agentIdentity: omp`인 메인 워크트리 터미널로 찾을 수 있다(이 handoff를 낸 세션: `term_048bff58-5e5c-4e7a-bb9f-0ac1f5f074ca`, 워크트리 `\\wsl.localhost\Ubuntu\home\rae\projects\workspace\omp`).
- acceptance-gate는 미체크 AC가 있는 중간 커밋을 막는다 → 커밋 순서는 `gh-loop` SKILL.md Stage 2에 적힌 대로(구현 → 전부 `[x]` seed 착지 → 코드 → 리뷰·후속 → closeout). 이 handoff 문서는 seed 착지 커밋에 함께 싣는다.
- `.omp/harness-state/`는 세션 cwd 기준(#58) — 워크트리에서 bare로 테스트해도 "No build/test verification recorded" 경고가 날 수 있다(medium은 경고, high는 BLOCK).
- 전역 미러 `~/.claude/skills/gh-loop`는 이 머신에 없다(동기화 생략 가능, 있으면 복사).

## 요구 사항

### R1. 모드 판별 (SKILL.md)
- `/gh-loop <N>`의 기본은 **dispatch 모드(코디네이터)**. 프롬프트에 워커 마커(예: `<!-- gh-loop:worker -->` 또는 인자 `--worker`)가 있을 때만 **worker 모드**. 워커 모드에서는 다시 dispatch하지 않는다(재귀 금지).
- finding 산문으로 호출된 Stage 1(이슈 생성)은 코디네이터가 그대로 수행한 뒤 dispatch로 넘어간다.

### R2. dispatch 모드 절차 (코디네이터)
1. `issue://N` 읽기, `gh-loop` 라벨 보장.
2. **모델 질문**: `ask` 툴로 사용자에게 선택지 제시 — `omp config get modelRoles`의 역할별 id(최소 `smol`/`default`/`slow`/`plan`) + "이 세션과 동일". 선택을 이슈 댓글에 `<!-- gh-loop:model:<id>:<effort> -->` 마커로 기록. 재개 시 마커가 있으면 묻지 않는다.
3. **워커 기동** — 1순위 `orca orchestration run-create`(미바인딩 시) + `worker-start --spec "<워커 프롬프트>" --worktree new-top-level --agent omp --model <id> --effort <level> --name gh-loop-issue-N --repo <selector> --comment "gh-loop #N: 시작"`. **스파이크(R4)에서 omp가 `--model`을 못 받는 것으로 판명되면** 2단계 경로: `orca worktree create --repo <selector> --name gh-loop-issue-N --no-parent --issue N --json` → `orca terminal create --worktree id:<full id> --title "gh-loop #N" --command "omp --model <id> --thinking <effort>"` → `terminal wait --for tui-idle --timeout-ms 60000` → `terminal send --text "<워커 프롬프트>" --enter`. 어느 경로든 **워커 핸들 하나**만 쓴다.
4. **워커 프롬프트**에 반드시: 워커 마커, 이슈 번호, "gh-loop Stage 2~5 수행", 커밋 순서, 머지 금지(결정은 이슈 댓글 + `needs-decision` + 턴 종료), 보고 채널(이슈 댓글 + `orca worktree set --worktree active --comment`), "자기 워크트리를 지우지 말 것", Run이 있으면 코디네이터 핸들로 `orca orchestration send --type status` 1건(시작·결정요청·완료 마일스톤만).
5. **즉시 복귀**: 사용자에게 워크트리 id·워커 핸들·모델을 보고하고 턴 종료. `check --wait`·`terminal read` 폴링 금지.
6. **재개** `/gh-loop N`(코디네이터): `issue:N` 셀렉터로 워크트리를 찾고, 살아 있는 omp 터미널이 있으면 `terminal send`로 "재개" 프롬프트(마커 포함), 없으면 같은 워크트리에 `terminal create --command "omp …"`로 새 워커. 댓글 해석(LLM, 권한자, nonce 이후)은 **워커가** 한다 — 코디네이터는 해석하지 않는다(소유자 1명 유지).
7. **정리**(머지 뒤): 워커가 "머지 완료, 정리 필요"를 이슈 댓글(+ status 메일)로 알리면 코디네이터가 `orca worktree rm --worktree issue:N` + `git push origin --delete <branch>`를 실행한다(미커밋이 있으면 중단·보고). 리뷰 사이드카(`docs/reviews/`, gitignored)는 삭제 전 메인 체크아웃으로 복사.
8. 메인 세션 턴 시작 루틴: `orca orchestration check --unread`(Run이 있을 때)와 `orca worktree ps`의 `gh-loop-issue-*` 카드 comment를 보고 결정 요청·완료를 사용자에게 전달.

### R3. worker 모드 절차
- 오늘의 Stage 2~5 그대로 + 커밋 순서 + 보고 채널 + "자기 워크트리 삭제 금지" + "dispatch 금지" + 결정 지점에서 턴 종료. 머지 승인 댓글을 받으면 `gh pr merge --match-head-commit`까지는 워커가 실행하고(2026-10-01 #62 선례), 정리는 코디네이터에게 넘긴다.

### R4. 스파이크 — `worker-start --agent omp --model` 수용 여부 실측
- Run 생성 → `worker-start --spec "노-op: 상태바의 모델을 말하고 worker_done" --worktree current --agent omp --model <modelRoles.smol id> --effort medium`(현재 워크트리에 새 터미널). 워커 상태바/`/model` 출력으로 실제 모델 확인. 결과(수용/무시)를 SKILL.md R2-3의 1순위·폴백 서술과 CHANGELOG에 기록. 끝나면 `worker-stop`/`worker-release`로 정리. `--model`이 무시되면 2단계 경로를 1순위로 올린다.

### R5. 문서·정합
- `.omp/skills/gh-loop/SKILL.md`: Goal/Non-Negotiables에 "코디네이터는 코드를 만지지 않는다 · 블로킹 대기 금지(worker-start 뒤 즉시 복귀)" 추가, Process에 Stage 0(dispatch)·worker 모드·재개·정리 절차, Reuse Map에 `orca orchestration worker-start`/`worktree create --issue`/`issue:<N>` 셀렉터.
- `.omp/skills/gh-fanout/SKILL.md`: 스폰 단계에 "worker-start 전환 예정 → 이슈 #<후속>" 한 줄(후속 이슈는 워커가 `gh issue create`로 만든다 — 제목: "gh-fanout: 워커 스폰을 omp --mode rpc에서 orca orchestration worker-start로").
- `CHANGELOG.md` [Unreleased], `docs/handoff/handoff_2026-10-02_gh-loop-dispatch-mode.md`(이 문서; 마감 시 상태 행을 `마감 (#N / <sha>)`로).

## 완료 기준 (seed AC 후보 — 그대로 써도 됨)
- [ ] AC1 — SKILL.md에 dispatch 모드(모델 ask → 워커 기동 → 프롬프트 → 즉시 복귀 → 재개 → 정리)가 R2 1~8대로 서술되고, 코디네이터가 `check --wait`/폴링을 하지 않는다고 명시된다
- [ ] AC2 — worker 모드(마커·재귀 금지·자기 워크트리 삭제 금지·보고 채널·결정 지점 턴 종료)가 R3대로 서술된다
- [ ] AC3 — R4 스파이크 결과(omp가 `--model`을 받는지)가 실측 근거와 함께 SKILL.md·CHANGELOG에 기록되고, 1순위/폴백 경로가 그 결과를 따른다
- [ ] AC4 — Non-Negotiables에 "코디네이터는 코드를 만지지 않는다"가 있고, 2026-10-01에 추가된 커밋 순서 문단이 유지된다; gh-fanout에 후속 이슈 링크 한 줄
- [ ] AC5 — `node --test .omp/extensions/harness/tests/*.test.mjs` 전부 통과, `node scripts/docs-drift` OK, 이 handoff 문서가 커밋에 포함, PR 본문에 `Closes #N`

## 범위 밖
- option A(GitHub Actions + self-hosted runner로 댓글만으로 기동) — 별도.
- gh-fanout의 스폰 교체 — 후속 이슈.
- 모델 자동 선택 정책 — 사용자가 "매번 묻기"를 택함.
- 전체 dispatch 경로의 **라이브 스모크**는 PR 머지 뒤 메인 세션이 다음 이슈(#60 또는 #61)로 수행한다 — 워커는 R4 스파이크까지만.

## 작업 규율 (이 리포)
- 커밋 순서: 구현·테스트 → seed+scope(전부 `[x]`)+이 handoff 문서 docs 커밋 → 코드/스킬 커밋 → 리뷰(docs-only·low면 자기 리뷰로 충분; `.mjs`를 추가했다면 3-pass) → closeout 커밋(`compr` 3.5) → push → PR(`Closes #N`) → 이슈에 결정 요청 댓글 + `needs-decision` + 턴 종료.
- 머지 금지. 마일스톤마다 `orca worktree set --worktree active --comment "…"`.
- 자기 워크트리 삭제 금지.

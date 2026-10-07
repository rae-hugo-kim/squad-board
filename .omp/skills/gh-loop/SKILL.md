---
name: gh-loop
argument-hint: [finding description | issue number to resume]
description: Runs a finding→issue→fix→PR→cross-verify→HITL loop on GitHub (autonomy Q2, option-D PoC). Use when the user says "gh-loop", "이슈 루프", "finding을 이슈로", "자율 수정 루프", "issue fix loop", or wants a finding turned into an issue, fixed, PR'd, and cross-verified with a human decision gate. NEVER auto-merges.
---

# gh-loop — Finding → Issue → Fix → PR → Cross-verify → HITL

## Goal

발견사항을 GitHub 이슈로 만들고, 수정하고, PR을 열고, 교차검증한 뒤, **판단이 필요한 지점에서 멈춰 사용자에게 묻는** 반자율 루프. GitHub(이슈/PR/라벨/댓글)이 곧 상태저장소이자 버스다 — 루프는 프로세스를 점유하지 않고 **stateless-resumable**하다.

이것은 **option-D PoC**다 (analysis `claudedocs/harness-auto-capture-analysis.md#Q2`): 결정점에선 이슈에 질문을 남기고 **턴을 종료**한다. 준비되면 `/gh-loop <issue-number>`로 재호출해 재개한다. 완전 자율 런타임(GitHub Actions/runner = 옵션 A)은 검증 후 별도 작업이다.

**2026-10-02부터 기본은 dispatch 모드다(#65)**: `/gh-loop`를 받은 메인 세션은 **코디네이터**로서 오케스트레이션과 사용자 소통만 하고, 루프(Stage 2~5)는 새 워크트리에 띄운 **워커** omp 세션이 수행한다. 첫 완주(#62 → PR #64)가 메인 세션을 통째로 점유한 데 대한 사용자 결정 — 감독은 비차단, 모델은 매번 사용자에게 묻고, 범위는 gh-loop만(gh-fanout 전환은 후속 이슈).

## Non-Negotiables

| Rule | Violation = STOP |
|------|------------------|
| **머지 절대 자동 금지** | 교차검증은 advisory일 뿐. 에이전트는 **자율 단계로 머지하지 않는다**; `gh pr merge`는 **PR별 명시적 인간 승인**(이슈/PR 댓글, 또는 코디네이터 세션 대화의 직접 지시 — Stage 0 9)이 있을 때만 그 지시로 실행한다. |
| **블로킹 대기 금지** | 결정점에선 질문을 이슈에 게시하고 **턴 종료**. 프로세스를 붙잡고 폴링/sleep 하지 않는다. 코디네이터도 같다 — 워커를 띄운 뒤 **즉시 복귀**하고 `orca orchestration check --wait`·`terminal read` 폴링을 하지 않는다. 상태 원천은 GitHub(라벨·댓글)이다. |
| **코디네이터는 코드를 만지지 않는다** | dispatch 모드의 메인 세션은 이슈 읽기·모델 질문·워커 기동·재개 프롬프트·머지 뒤 정리, 그리고 세션 직접 결정의 기록·실행(Stage 0 9)만 한다. 수정·커밋·PR·댓글 해석은 **워커**가 한다(소유자 1명). 워커는 **다시 dispatch하지 않는다**(재귀 금지). |
| **dedup/throttle** | 이슈 생성 전 항상 `gh-loop-issue.mjs`로 중복·상한을 판정. 동일 finding 이슈 폭주 금지. 단 `gh issue list`는 **최종일관성**이라 생성 직후 조회가 권위적이지 않음 — Stage 1 주의 참조. |
| **사용자 응답 최우선** | 재개 시 이슈 댓글의 최신 사용자 지시를 memory/계획보다 우선한다 (CLAUDE.md "user > memory"). 코디네이터 세션 대화의 직접 지시는 이 스킬의 댓글 절차보다 우선한다(Stage 0 9). |
| **파괴 작업 가드** | force-push·history 재작성·대량 삭제는 advisory에 그치지 않고 사용자 확인. |

## Inputs

- `$ARGUMENTS`:
  - **finding 설명** (산문) → 새 루프 시작 (Stage 1부터; 코디네이터가 이슈를 만든 뒤 Stage 0 dispatch로 넘어간다).
  - **이슈 번호** (예: `42`) → 그 이슈에서 **재개** (코디네이터: 워커 재개 프롬프트 또는 머지 뒤 정리; 워커: needs-decision 응답 처리 또는 다음 단계).
  - 비어 있음 → 사용자에게 finding 또는 재개할 이슈를 묻는다.
- **모드 판별(R1)**: 기본은 **dispatch 모드(코디네이터)**. 프롬프트에 워커 마커 `<!-- gh-loop:worker -->`(또는 인자 `--worker`)가 있을 때만 **worker 모드**. 둘을 섞지 않는다 — worker 모드에서 Stage 0을 실행하지 않고, dispatch 모드에서 Stage 2~5를 실행하지 않는다.

## Prerequisites (discover, don't assume)

```bash
gh auth status                 # gh CLI 인증 (compr이 gh pr create로 쓰는 것과 동일)
gh repo view --json nameWithOwner -q .nameWithOwner
```

미인증 → `gh auth login` 안내 후 중단. autopilot/ralph·reviewer 등 재사용 자산은 OMC/하네스가 제공(아래 Reuse Map).

## 상태 라벨 (사람 손이 필요한 정도 — #69)

이슈·PR의 **상태 라벨**은 사람이 지금 무엇을 해야 하는지를 나타낸다. 한 이슈·PR에는 **하나만** 붙고, 전이할 때 이전 라벨을 뗀다(`--remove-label <이전> --add-label <다음>`). 리포에 있지만 붙어 있지 않은 라벨을 떼는 것은 no-op이지만, **리포에 없는 라벨을 떼려 하면 명령 전체가 실패한다**(`'<label>' not found`, exit 1 — 둘 다 2026-10-02 실측). 그래서 전이 전에 Stage 1 라벨 블록이 먼저 돈다(없을 때만 생성, 설명·색 고정). **PR의 라벨도 `gh issue edit <PR 번호|URL>`로 바꾼다** — `gh pr edit`는 gh 2.65.0에서 `Projects (classic) is being deprecated` GraphQL 오류로 실패한다(2026-10-02 PR #70 실측, `gh issue edit`는 PR 번호·URL 모두 성공). 에이전트가 처리할 백로그에는 상태 라벨이 없다.

| 라벨 | 뜻 | 붙이는 시점 | 떼는 시점 |
|---|---|---|---|
| `agent-working` (`1D76DB`) | 에이전트 작업 중 — 사람 손 불필요 | 워커가 이슈를 잡을 때(dispatch 워커 기동·gh-fanout 클레임), 결정을 받아 워커가 다시 작업할 때(이슈·PR) | 결정 요청·park(→ `needs-decision`), 질문 없이 PR·보고만 남기고 끝남(→ `needs-review` — gh-loop 워커는 Stage 5에서 머지를 묻으므로 `needs-decision`으로 간다), 실패(→ `needs-decision` + 사유 댓글) |
| `needs-decision` (`D93F0B`) | 사람이 결정해야 함 — 에이전트가 질문을 남기고 멈춤 | Stage 5 결정 게이트(**이슈와 PR 둘 다**), park(되묻기·명확화), 사용자가 결정할 것이 본문에 있는 이슈를 만들 때 | 답을 받아 처리한 뒤(acted — 이슈·PR 둘 다), 사용자가 `/gh-loop N`으로 워커를 띄울 때(→ `agent-working`), PR 머지·닫힘 |
| `needs-review` (`FBCA04`) | 사람이 봐야 함 — 질문 없는 리뷰·머지 대기 PR, 확인할 보고 | compr가 PR을 열 때, 확인만 필요한 이슈를 만들 때 | 머지·닫힘, 확인 후, 결정 게이트(→ `needs-decision`) |

- **모아 보기**: `is:open label:needs-decision,needs-review`(쉼표 = OR).
- **PR에는 `gh-loop` 라벨을 붙이지 않는다** — option A 러너(`gh-loop-runner.mjs`)는 `gh-loop` 라벨이 있는 대상에만 반응하므로, `needs-decision`이 붙은 PR의 댓글로 같은 루프가 중복 재개되지 않는다(회귀 테스트 `gh-loop-runner.test.mjs` "PR comment").
- **이슈 생성 분류** — Stage 1, `sum` 5.5, 워커가 만드는 후속 이슈 등 에이전트가 이슈를 만드는 모든 절차: 본문에 사용자가 결정할 것이 있으면 `needs-decision`, 확인만 필요하면 `needs-review`, 에이전트가 처리할 백로그면 상태 라벨 없음.

## Process

### Stage 0 — dispatch (코디네이터) / worker 모드

#### dispatch 절차 (코디네이터 — 코드를 만지지 않는다)

1. `issue://N`을 읽고 라벨을 보장한다(Stage 1의 라벨 블록 — `gh-loop` + 상태 라벨 3개). finding 산문으로 호출됐으면 Stage 1을 그대로 수행해 이슈를 만든 뒤 그 번호로 계속한다.
2. **모델 질문**: 이슈 댓글에 `<!-- gh-loop:model:<id>:<effort> -->` 마커가 이미 있으면 묻지 않고 그 값을 쓴다(사용자가 바꾸라고 하지 않는 한). 없으면 먼저 이슈 본문에서 **규모를 추정**하고(risk = risk-assess 분류 그대로, files = 예상 변경 파일 수, depth = 추론 깊이 low|high, ac_count = AC 수 — `rule://harness-cycle_definition` "예상 레코드"와 같은 축) `ask` 툴로 선택지를 제시한다 — `omp config get modelRoles`의 역할별 실제 id(최소 `smol`/`default`/`slow`/`plan`, 예: `smol → anthropic/claude-fable-5-1:medium`) + **"이 세션과 동일"**, 그리고 질문 본문 끝에 **규모 기반 추천 한 줄**(#79):
   ```bash
   node .omp/extensions/harness/gh-loop-record.mjs recommend --risk <risk> --depth <depth> --files <n> --roles-json "$(omp config get modelRoles)"
   # → 규모 기반 추천: <provider/model>:<level> (<tier> — <사유>; risk × depth × files [S|M|L])
   ```
   추천은 `gh-loop-record.mjs`의 단순 규칙표(risk × depth × files 구간 → `smol`/`default`/`slow`/`plan` 역할)가 낸 **표시용 한 줄**이다 — 기본값으로 두지 않고 선택지로도 만들지 않으며, 사용자가 매번 고른다(사용자 결정 2026-10-02; 규칙표는 `estimate-report.mjs` §3이 쌓이면 테스트와 함께 조정한다). 자동 선택 정책은 없다. 선택은 이슈 댓글에 마커 + **dispatch 튜플** `["omp-dispatch/v1", <issue>, <risk>, <files>, <depth>, <ac_count>, <model>, <effort>, <ts>]`로 기록해 재개 때 다시 묻지 않고, 워커가 `audit.jsonl`에 `gh_loop_dispatched`로 남기게 한다(코디네이터는 트리를 만지지 않는다):
   ```bash
   GHLOOP_OUT=$(mktemp -d); trap 'rm -rf "$GHLOOP_OUT"' EXIT
   node .omp/extensions/harness/gh-loop-record.mjs dispatch --issue N --risk <risk> --files <n> --depth <depth> --ac-count <n> \
     --model <provider/model> --effort <level> --out "$GHLOOP_OUT" > /dev/null     # model.md = 모델 줄 + 마커 + 튜플(인라인 코드)
   gh issue comment N --body-file "$GHLOOP_OUT/model.md"
   ```
   `modelRoles` id의 `:<level>` 접미는 thinking 레벨이다 — `omp --model <provider/model> --thinking <level>`로 나눠 넘긴다. 마커만 있고 튜플이 없는 옛 댓글(#79 이전)이면 워커의 ingest가 "no tuple"로 멈추므로, 워커가 같은 축을 이슈에서 추정해 튜플 댓글을 하나 더 남기고 ingest한다(#79 자체가 첫 사례).
3. **워커 기동** — **2단계 경로가 1순위**(R4 스파이크 실측, 아래). Linux에서 Orca 터미널 밖 셸이면 `orca` 대신 `orca-ide`(orca-cli 스킬):
   ```bash
   orca worktree create --repo <selector> --name gh-loop-issue-N --no-parent --issue N --json   # 카드에 이슈 링크 → 이후 issue:N 셀렉터로 재탐색
   # 응답의 result.worktree.id("<repoId>::<path>") 전체를 terminal create에 복사한다
   gh issue edit N --remove-label needs-decision,needs-review --add-label agent-working   # 클레임 먼저(gh-fanout과 같은 순서)
   # 아래 terminal create/send가 실패하면 롤백: gh issue edit N --remove-label agent-working 후 사용자에게 보고(거짓 클레임 방지)
   # 워커 명령(R8): 코디네이터 환경의 Orca 상태 확장 경로를 여기서 펼쳐 리터럴로 넣는다 — 없으면 확장 없이(5에서 안내)
   if [ -n "${ORCA_OMP_STATUS_EXTENSION:-}" ] && [ -f "$ORCA_OMP_STATUS_EXTENSION" ]; then
     WORKER_CMD="command omp --extension $(printf %q "$ORCA_OMP_STATUS_EXTENSION") --model <provider/model> --thinking <level>"
   else   # 값이 없거나 파일이 없으면 plain omp — 워커 셸의 Orca 래퍼가 유효한 확장을 가졌다면 그것이 한 번 싣는다
     WORKER_CMD="omp --model <provider/model> --thinking <level>"
   fi
   orca terminal create --worktree "id:<repoId>::<path>" --title "gh-loop #N" --command "$WORKER_CMD" --json
   orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 120000 --json   # 타임아웃돼도 `terminal read --screen`으로 상태바(모델·thinking)가 보이면 진행
   orca terminal send --terminal <handle> --text "<워커 프롬프트 — 한 단락, 줄바꿈 없이>" --enter --json
   ```
   `--agent` 없는 `worktree create`는 첫 탭에 폴백 셸을 남긴다 — 커스텀 argv(`--model`)가 필요한 경우라 허용되는 2단계 경로이며, 그 셸은 `terminal list`로 미사용임을 확인한 뒤에만 닫는다. 어느 경로든 **워커 핸들 하나**(`terminal create`가 돌려준 `result.terminal.handle`)만 쓴다.

   **워커 명령의 Orca 상태 확장(R8, #69 — 2026-10-02 사용자 결정)**: Orca 카드의 에이전트 상태와 "작업 완료/입력 필요" 알림은 omp에 Orca 상태 확장(`orca-agent-status.ts` — `agent_end`·`ask` 등을 Orca로 POST)이 실려야 나간다. Orca 셸 래퍼는 `ORCA_OMP_STATUS_EXTENSION`이 있는 셸에서만 `omp`를 함수로 감싸 `command omp --extension "$ORCA_OMP_STATUS_EXTENSION" …`을 실행하는데(rcfile `__orca_omp_invoke`), 최근 만든 Orca 터미널 셸에는 이 변수와 `ORCA_OMP_FRESH_CONFIG`가 없다(2026-10-02 실측, Orca 런처 "fresh OMP settings are unavailable on this host") — 확장 없이 뜬 워커는 카드에 보이지 않고, 결정 지점에서 턴을 끝내도 알림이 나가지 않는다. 그래서 코디네이터가 **자기 환경의 값을 펼쳐 리터럴로** 넘기고, `command`로 그 함수를 우회해 변수가 있는 셸에서도 확장이 두 번 실리지 않게 한다. 코디네이터 환경에도 값이 없으면 확장 없이 띄우고 사용자에게 알린다(5). 재개 때 새 워커를 띄우는 명령(6)도 같은 `WORKER_CMD`다. 실측: #69 워커가 이 형태로 기동된 첫 사례 — 프로세스 argv `omp --extension /mnt/c/Users/user/.omp/agent/extensions/orca-agent-status.ts --model anthropic/claude-opus-5-5 --thinking max`, 워커 셸에는 `ORCA_OMP_STATUS_EXTENSION`이 없는데 `ORCA_PI_STATUS_OWNED`가 그 omp PID(확장이 로드되며 기록), `orca terminal show`가 `agentIdentity: "omp"`.

   **`orca orchestration worker-start --agent omp` 실측(R4, 2026-10-02, Orca CLI on WSL)**: `run-create` 뒤 `worker-start --spec … --worktree current --agent omp --model anthropic/claude-fable-5-1 --effort medium` → `invalid_argument: "Agent omp does not support launch-time model selection. Omit --model to run the model from its own config."` — 조용한 무시가 아니라 **거부**다. `--model` 없이 `--agent omp`는 `state: ready`로 돌아오지만, Orca의 omp 런처가 `ORCA_OMP_FRESH_CONFIG`를 요구해 그 변수가 없는 호스트에서는 `Orca: fresh OMP settings are unavailable on this host` 뒤 **bash 셸로 폴백**하고 `--spec` 프롬프트가 셸에 타이핑됐다(`Command 'Please' not found`). 따라서 worker-start는 모델 지정이 불가능하고 기동도 호스트 상태에 의존해 **1순위가 아니다** — Orca가 omp 런치타임 모델 선택을 지원하면 재검토한다(그때는 `run-create --objective` + `worker-start --spec "<워커 프롬프트>" --worktree new-top-level --agent omp --model <id> --effort <level> --name gh-loop-issue-N --repo <selector> --comment "gh-loop #N: 시작"` 한 명령). 2단계 경로는 같은 날 `terminal create --command "omp --model anthropic/claude-fable-5-1 --thinking medium"`로 상태바 `Fable 5.1 · ◑ med`를 확인했다(`terminal wait --for tui-idle`은 60초에서 타임아웃 → `terminal read --screen`으로 확인).
4. **워커 프롬프트**에 반드시 넣는 것: 워커 마커 `<!-- gh-loop:worker -->`, 이슈 번호, "gh-loop Stage 2~5 수행", 커밋 순서(Stage 2 문단), **머지 금지**(결정은 이슈 댓글 + 이슈·PR `needs-decision` + 턴 종료), 보고 채널(이슈 댓글 + `orca worktree set --worktree active --comment`), **"자기 워크트리를 지우지 말 것"**, Run이 바인딩돼 있으면 코디네이터 핸들로 `orca orchestration send --type status` 1건(시작·결정 요청·완료 마일스톤만). 요구 사항이 handoff 문서에 있으면 그 경로와 "먼저 읽고 그대로 수행"을 적는다.
5. **즉시 복귀**: 사용자에게 워크트리 id·워커 핸들·모델을 보고하고(Orca 상태 확장 없이 띄웠으면 "Orca 카드 상태·알림이 보이지 않을 수 있음"도 알린다 — R8) 턴을 종료한다. `check --wait`·`terminal read` 폴링 금지(Non-Negotiables).
6. **재개** `/gh-loop N`(코디네이터): 사용자가 이 세션 대화로 결정을 줬으면 9의 댓글을 먼저 남긴다. `orca worktree show --worktree issue:N --json`으로 워크트리를 찾고, `terminal list --worktree id:…`에 살아 있는 omp 터미널이 있으면 `terminal send`로 재개 프롬프트(워커 마커 + "이슈 #N 재개 — 댓글을 해석해 다음 단계 수행")를 보내고, 없으면 3의 `WORKER_CMD` 블록을 이슈의 모델 마커 값으로 다시 실행해 만든 명령(R8)으로 같은 워크트리에 `terminal create`해 새 워커를 띄운 뒤 같은 프롬프트를 보낸다. 댓글 해석(LLM, 권한자, nonce 이후)은 **워커가** 한다 — 코디네이터는 해석하지 않는다(소유자 1명).
7. **정리**(머지 뒤): 워커가 "머지 완료, 정리 필요"를 이슈 댓글(+ status 메일)로 알리거나 코디네이터가 9에서 직접 머지했으면 코디네이터가 `orca worktree rm --worktree issue:N --json`(로컬 브랜치도 함께 지워진다) + `git push origin --delete <branch>`를 실행한다. 미커밋 변경이 있으면 중단하고 보고한다(`--force` 금지). 리뷰 사이드카(`docs/reviews/`, gitignored)는 삭제 전에 메인 체크아웃으로 복사한다. 워커는 자기 워크트리 안에서 실행 중이라 스스로 지울 수 없다.
8. **턴 시작 루틴**(코디네이터): Run이 있으면 `orca orchestration check --unread`, 그리고 `orca worktree ps --json`의 `gh-loop-issue-*` 카드 comment를 보고 결정 요청·완료를 사용자에게 전달한다. 폴링이 아니라 턴마다 한 번이다.
9. **세션 직접 결정**(R7, 2026-10-02 사용자 결정 — 첫 적용: #65 → PR #67 머지): 결정은 이슈 댓글만이 아니라 **코디네이터 세션 대화**로도 받는다 — 대화의 직접 지시가 이 스킬의 댓글 절차보다 우선한다. 받으면 코디네이터가 그 이슈(PR이 있으면 PR에도)에 아래 댓글을 파일로 써서(`--body-file`) 남긴다:
   ```
   ## 세션에서 직접 결정함
   **원 질문**: <결정 요청 댓글 링크>
   **결정**: <결정 요지>
   **사용자 지시 원문**: "<인용>" (<날짜>, 코디네이터 세션 대화)
   **실행**: <코디네이터가 실행한 명령과 결과, 또는 "워커 재개">
   <!-- gh-loop:session-decision:<가장 최근 결정 요청의 nonce> -->
   ```
   - **코디네이터가 바로 실행하는 결정**(머지·닫기): Stage 5 재개 5의 head 가드와 아래 “순차 PR 갱신”의 최신 base·검증 확인을 거칩니다. 머지는 `gh pr merge <pr> --merge --match-head-commit <질문에 적힌 head SHA>`처럼 승인된 방식으로 실행한 뒤, 같은 댓글에 `<!-- gh-loop:acted:<nonce> -->`를 함께 남기고 이슈·PR에서 `needs-decision`을 뗍니다. 머지했으면 곧바로 7(정리)로 갑니다.
   - **워커가 실행할 결정**(수정 요청·PR별 rebase/force-with-lease 등): 댓글(acted 없음)을 남기고 이슈(PR이 있으면 PR도)의 `needs-decision`을 `agent-working`으로 바꾼 **뒤** 6처럼 재개 프롬프트를 보냅니다. 라벨을 먼저 바꿔야 워커의 다음 전이를 덮어쓰지 않습니다. 워커는 Stage 5 재개 2에 따라 인용된 지시를 해석하며, 이견·모호성으로 멈추면 새 nonce와 `needs-decision`으로 되돌립니다. rebase 승인은 머지 승인이 아닙니다.
   - option A 러너는 이 댓글을 계속 무시한다(`<!-- gh-loop:` 마커 자기 제외) — 코디네이터가 워커를 직접 깨우므로 러너까지 기동하면 중복이다(회귀 테스트 `gh-loop-runner.test.mjs` "session-decision").

#### worker 모드 (워커 세션)

- 트리거: 프롬프트의 `<!-- gh-loop:worker -->`(또는 `--worker`). **다시 dispatch하지 않는다.**
- 처음 시작하면(재개 프롬프트가 아니면) Stage 1 라벨 블록(멱등)을 실행하고 이슈에 `agent-working`을 보장한다(`gh issue edit N --remove-label needs-decision,needs-review --add-label agent-working` — 코디네이터가 3에서 붙였으면 no-op; 리포에 라벨이 없으면 이 명령이 실패하므로 블록이 먼저다). 그다음 **dispatch 기록을 ingest**한다(#79) — `author_association`이 OWNER/MEMBER/COLLABORATOR인 작성자의 이슈 댓글 본문만 파일로 받아 넘긴다(아무나 붙여 넣은 튜플은 입력에 들어오지 않게 하는 1차 필터다. 이것은 Guard policy의 write+ 판정 그 자체가 아니라 근사치다 — COLLABORATOR에는 read/triage 권한자도 포함되므로 엄밀한 권한은 option A 러너처럼 `gh api repos/{owner}/{repo}/collaborators/<login>/permission`으로 작성자별로 조회한다). 그 안의 유효한 `omp-dispatch/v1` 튜플 중 **이 이슈 번호의 것**이 모두(재dispatch면 둘 다; 다른 이슈 번호의 튜플은 무시하고 알린다) `docs/harness/audit.jsonl`에 `gh_loop_dispatched`(issue·risk·files·depth·ac_count·model·effort·dispatched_at)로 append되고(같은 issue+ts면 skip), 이 행은 seed 착지 커밋(Stage 2 커밋 순서)에 실린다:
  ```bash
  GHLOOP_OUT=$(mktemp -d); trap 'rm -rf "$GHLOOP_OUT"' EXIT
  gh api "repos/{owner}/{repo}/issues/N/comments" --paginate \
    --jq '.[] | select(.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR") | .body' > "$GHLOOP_OUT/comments.md"
  node .omp/extensions/harness/gh-loop-record.mjs ingest --issue N --comment-file "$GHLOOP_OUT/comments.md"
  ```
  재개 때 새로 뜬 워커는 이 두 단계를 건너뛰고 Stage 5 재개를 따른다(재개 중 코디네이터가 모델을 바꿔 다시 dispatch했으면 — 새 마커·튜플 댓글 — 그 워커가 위 ingest를 한 번 더 실행해 새 행을 남긴다. 멱등이라 기존 행은 skip된다). 이슈(및 handoff 문서)를 읽고 **Stage 2~5를 그대로** 수행한다 — 커밋 순서(Stage 2 문단), compr로 PR(`Closes #N`, PR에 `needs-review`), advisory 교차검증, 결정 지점에서 이슈 댓글 + 이슈·PR `needs-decision`(Stage 5) + **턴 종료**.
- 보고 채널: 이슈 댓글(마일스톤·결정 요청) + `orca worktree set --worktree active --comment "gh-loop #N: <마일스톤>" --json`(마일스톤마다). Run이 바인딩돼 있으면 코디네이터 핸들로 `orca orchestration send --type status` 1건씩(시작·결정 요청·완료만).
- 재개 프롬프트를 받으면 Stage 5 "재개" 1~6을 워커가 수행한다(댓글 해석·권한자·nonce·멱등 — 코디네이터의 `세션에서 직접 결정함` 댓글도 그 nonce의 답이다, 재개 2). 머지 승인 댓글이면 `gh pr merge --match-head-commit <approved-sha>`까지는 워커가 실행하고(2026-10-01 #62 선례), 이슈에 "머지 완료, 정리 필요(워크트리·브랜치)" 댓글을 남긴 뒤 턴을 종료한다 — 정리는 코디네이터 몫.
- **자기 워크트리를 지우지 않는다**(그 안에서 실행 중). 머지도 승인 없이는 하지 않는다(Non-Negotiables).
- `.omp/harness-state/`는 세션 cwd 기준(#58) — 워크트리에서 테스트해도 "No build/test verification recorded" 경고가 날 수 있다(medium은 경고, high는 BLOCK).

### Stage 1 — Finding → Issue (dedup + throttle)

**Finding 소스 (둘 중 하나)**:
- **수동 지목** (기본): 네가/사용자가 finding을 직접 제시 → 아래 1·2로 이슈화.
- **자동탐지** (option, Q2.7-4): `gh-loop-detect.mjs`로 소스에서 finding을 추출·계획한 뒤 아래 생성 경로를 재사용한다(신규 생성 로직 없음):
  ```bash
  EXISTING=$(gh issue list --state open --label gh-loop --json number,title,labels,body --limit 100)
  # 소스: breadcrumb의 미해결 FAIL(FAIL 뒤 동일 type PASS면 제외) — 또는 lint/리뷰: --from json --findings-json '[{"title","body","labels"}]'
  node .omp/extensions/harness/gh-loop-detect.mjs detect --from breadcrumb --existing-json "$EXISTING" --cap 5
  ```
  출력 `plan[]`에서 `action=="create"`인 항목마다 그 `payload`(title/body/labels)를 **Stage 1 create 블록과 동일한 안전 패턴**(변수 title + `--body-file` + 라벨 배열)으로 생성한다. `skip`/`block`은 건너뛴다. *언제* 돌릴지(스케줄/트리거)는 option-A 런타임·per-project 몫.

1. 루프 라벨과 상태 라벨 3개(상태 라벨 절 — 설명·색 고정)를 보장하고(없으면 생성, 멱등 — 소비 리포는 첫 사용 때 생긴다) 열린 루프 이슈를 수집한다 (dedup 입력):
   ```bash
   gh label create gh-loop --description "gh-loop automated" --color BFD4F2 2>/dev/null || true
   gh label create needs-decision --description "awaiting human decision" --color D93F0B 2>/dev/null || true
   gh label create needs-review --description "내가 봐야 함 — 리뷰·머지 대기 PR이나 확인할 보고 (질문 없음)" --color FBCA04 2>/dev/null || true
   gh label create agent-working --description "에이전트 작업 중 — 사람 손 불필요" --color 1D76DB 2>/dev/null || true
   gh issue list --state open --label gh-loop --json number,title,labels,body --limit 100
   ```
   새 repo엔 라벨이 없어 `--label gh-loop` 조회가 곧장 실패하므로 **먼저 보장**한다 (라이브 검증에서 확인된 게이트).

   **`gh issue list` 최종일관성 주의** (라이브 E2E에서 확인): 이슈 생성 **직후** 같은 쿼리로 재조회하면 방금 만든 이슈가 **누락**될 수 있다 → dedup 입력이 비어 **중복 생성** 위험(+ 빈/stale list는 `gh-loop-issue`의 `existing.length` 기반 **open-count throttle 백스톱**도 과소계상해 상한이 늦게 걸림). 완화: (a) **한 run 안에서는** `planIssues`의 배치 dedup(`seen` 누적)이 gh 조회 없이 중복을 막는다(1차 방어); (b) **연속 run**(자동 cron 등)은 list 지연을 가정 — **직렬화만으론 부족**(다음 run도 stale list를 볼 수 있음): 마커 기반 dedup이 나중에 수렴하게 두거나 직렬화에 **수렴 대기/재시도**를 더한다; (c) 즉시 재조회가 필요하면 카운트가 맞을 때까지 **짧은 재시도**. `gh issue list`를 *즉시* 권위 소스로 가정하지 말 것.
2. 생성 여부를 **헬퍼**로 판정한다 (gh 호출은 seam, 결정은 테스트된 로직). finding 텍스트는 **변수로** 넘기고 쉘 라인에 보간하지 않는다. `--out`은 **호출마다 임시 디렉터리**로 받아(공유 `/tmp/ghloop` 레이스·심링크 회피) **jq 없이**(node만) 소비한다:
   ```bash
   GHLOOP_OUT=$(mktemp -d); trap 'rm -rf "$GHLOOP_OUT"' EXIT
   gh issue list --state open --label gh-loop --json number,title,labels,body --limit 100 > "$GHLOOP_OUT/existing.json" \
     || { echo "gh issue list failed — abort (헬퍼에 손상된 입력 금지)"; exit 1; }
   node .omp/extensions/harness/gh-loop-issue.mjs decide --kind finding \
     --title "$FINDING_TITLE" --body "$FINDING_BODY" --label "$SEV" \
     --cap 5 --created "$CREATED" --existing-json "$(cat "$GHLOOP_OUT/existing.json")" \
     --out "$GHLOOP_OUT" > /dev/null
   action=$(cat "$GHLOOP_OUT/action")
   ```
   - `action == "skip"` → 중복. **`$GHLOOP_OUT/dup`(중복 이슈 번호)** 와 `reason`을 읽어 그 이슈에 코멘트만 남기고 종료.
   - `action == "block"` → `$GHLOOP_OUT/reason` 보고 멈춤 (상한 도달, 또는 **손상된 `--existing-json`** = fail-closed).
   - `action == "create"` → payload 파일로 생성. **finding 텍스트를 쉘 명령줄에 보간하지 말 것** — `$(...)`·백틱이 그대로 실행된다:
     ```bash
     label_args=()
     while IFS= read -r l; do label_args+=(--label "$l"); done < "$GHLOOP_OUT/labels"
     ISSUE_URL=$(gh issue create --title "$(cat "$GHLOOP_OUT/title")" \
       --body-file "$GHLOOP_OUT/body.md" "${label_args[@]}") || { echo "gh issue create failed — abort"; exit 1; }
     ISSUE_NUM=${ISSUE_URL##*/}   # gh가 돌려주는 이슈 URL 끝의 번호 — 번호는 생성 뒤에만 알 수 있어 제목 접두는 2단계다(#78)
     gh issue edit "$ISSUE_NUM" --title "#$ISSUE_NUM $(cat "$GHLOOP_OUT/title")" \
       || echo "제목 접두 부착 실패 — 이슈는 생성됐으니 재생성하지 말고 제목만 수동으로 '#$ISSUE_NUM <제목>'으로 고친다"
     ```
     `"$(cat …/title)"` 전개 결과는 재스캔되지 않아 finding의 `$(...)`/백틱이 무력화되고, `--body-file`은 본문을 명령줄 밖으로 빼며, 배열은 각 라벨을 한 인자로 안전 전달한다. `body.md`엔 dedup 마커가 박힌다.

     **제목 `#N ` 접두(#78, 사용자 결정 2026-10-03 — 목록·카드·알림에서 번호로 찾기 위함)**: 에이전트가 만드는 이슈·PR 제목은 `#N <제목>`으로 시작한다. 이슈는 번호를 생성 뒤에만 알 수 있어 `gh issue create` → `gh issue edit N --title "#N <제목>"` 2단계로 만든다(gh-fanout 추적 이슈, 코디네이터가 직접 만드는 이슈도 같다). 헬퍼의 `payload.title`·`$GHLOOP_OUT/title`은 접두 없는 제목 그대로이고, 접두는 생성 뒤 edit에서만 붙는다. dedup은 `normalizeTitle`이 비교 전에 선행 `#N `을 벗기므로(마커 해시도 같다) 이미 접두가 붙은 열린 이슈와 접두 없는 새 finding이 계속 중복으로 잡힌다. 제목의 `#N`은 GitHub 자동 링크일 뿐 close 키워드가 아니므로 `Closes #N`은 본문에 그대로 둔다. **소급 금지**: 이미 있는 이슈·PR 제목은 바꾸지 않는다.
     상태 라벨은 이슈 생성 분류(상태 라벨 절)를 따른다 — 루프가 고칠 finding은 백로그라 붙이지 않고(dispatch가 곧 `agent-working`을 붙인다), 사용자 결정이 필요한 이슈는 `needs-decision`(`--kind decision`이면 헬퍼가 붙인다), 확인만 필요한 이슈는 `--label needs-review`를 더한다.

### Stage 2 — Issue → Fix (재사용, 신규 구현 없음)

생성/지정된 이슈를 작업 단위로 **autopilot**(또는 복잡하면 **ralph**)에 넘긴다. 하네스 게이트(context/acceptance/backpressure/review)가 그 안에서 그대로 작동한다. 새 수정 엔진을 만들지 않는다 — 기존 실행 substrate를 배선만 한다 (analysis Q2.4).

**커밋 순서(하네스 게이트 전제)**: acceptance-gate는 미체크 AC가 있는 중간 커밋을 막는다(WIP 레인만 예외). 구현·테스트를 먼저 끝내고 seed+scope(전부 `[x]`)를 docs 커밋으로 착지 → 코드 커밋(그 **앞**에 reviewer 3-pass를 돌려 review-gate 사이드카를 만든다 — high/critical이면 게이트가 요구한다) → 리뷰 지적을 고친 후속 커밋 → closeout 커밋 순으로 낸다(#56 `ecccc54`, #62 `8dfe619` 선례). WIP 레인은 커밋마다 `acceptance_wip` 감사 행이 쌓이므로 루프에서는 쓰지 않는다. handoff 문서가 있으면 seed 착지 커밋에 함께 싣는다(`docs/rules/artifact_roles_contract.md` §Handoff).

**closeout 기록(#79)**: closeout 커밋(`thread_closed`·`task_closed`를 append하는 그 커밋)에 워커 실측을 `gh_loop_closed`로 함께 append한다 — 실측은 그 시점의 값이며 머지 뒤에는 커밋할 수 없으므로 closeout이 "시작→PR" 종점이다(PR은 closeout 직후 열린다). 그래서 세는 리뷰 라운드는 **코드 커밋 앞에 돌린 reviewer 3-pass 라운드**(review-gate 사이드카를 만드는 그 리뷰 — r1 FAIL → 수정 → r2 … 식으로 closeout 전에 끝난다)이고, Stage 4가 PR에 게시하는 것은 그 결과의 요약이다(PR 뒤에 추가 라운드가 생기면 그것은 이 행에 들어가지 않는다 — 한 dispatch에 한 행, 두 번째 실행은 skip):
```bash
# files/insertions/deletions: git diff --shortstat <base>...HEAD (closeout 커밋 전까지의 브랜치 변경);
# review-rounds: 코드 커밋 전 reviewer 라운드 수(위); verifier: verifier verdict(PASS / PASS WITH NOTES / FAIL — report §3은 PASS로 시작하지 않는 값을 FAIL로 센다);
# decisions: closeout 전에 남긴 `gh-loop:decision` nonce 수(뒤따르는 머지 결정 게이트는 구조상 항상 1회라 세지 않는다).
# model/effort/risk/depth/files_predicted/dispatched_at은 audit의 gh_loop_dispatched 행(이슈의 최신 dispatch — dispatched_at 기준)에서 채운다 — 특정 dispatch에 묶으려면 --dispatched-at <그 행의 meta.dispatched_at>(행의 ts가 아니라 튜플의 ts).
node .omp/extensions/harness/gh-loop-record.mjs close --issue N --files-changed <n> --insertions <n> --deletions <n> \
  --review-rounds <n> --verifier <verdict> --decisions <n>
```
같은 issue의 같은 dispatch(dispatch 행이 없으면 같은 issue)에 대해 두 번 실행하면 skip한다. 두 이벤트는 어떤 게이트 판정에도 관여하지 않으며, `node .omp/extensions/harness/estimate-report.mjs` §3이 모델×규모 셀로 모은다(라우팅 기준·추천 규칙표를 바꿀 때의 원자료 — `rule://harness-agent_routing`).

### Stage 3 — Fix → PR

`compr` 스킬 절차로 브랜치·커밋·PR을 만든다 (`gh pr create`, `.omp/skills/compr/SKILL.md`). PR 제목은 `#<issue> <제목>`으로 시작한다 — 접두는 PR 자신의 번호가 아니라 **닫는 이슈 번호**라 PR 번호를 기다리지 않고 `gh pr create --title "#<issue> <제목>"` 한 번에 만든다(#78). PR 본문에 `Closes #<issue>`를 넣어 이슈와 연결한다(제목의 `#N`은 close 키워드가 아니다). compr가 PR에 `needs-review`를 붙이고, `gh-loop` 라벨은 PR에 붙이지 않는다(상태 라벨 절). 이슈는 워커가 Stage 4·5를 이어 가므로 `agent-working`을 유지한다.

### Stage 4 — PR → Cross-verify (**advisory**)

PR에 교차검증 결과를 게시한다 — 결과는 **참고용**이지 머지 게이트가 아니다:
- `reviewer` 에이전트 (`.omp/agents/reviewer.md`) — 적대적 다중패스 리뷰. 이 리뷰는 코드 커밋 **앞**에 돈다(review-gate가 high/critical 커밋에 요구하는 사이드카를 만드는 그 라운드들 — Stage 2 커밋 순서·"closeout 기록"의 `review-rounds`); PR 단계에서는 그 결과를 게시하고, 필요하면 PR diff에 1패스를 더 돌린다(추가 라운드는 `gh_loop_closed`에 들어가지 않는다).
- 이종 모델 2차 의견: `adversary` 에이전트 (`.omp/agents/adversary.md`) 또는 OMC `ccg`(claude+codex+gemini).
- 결과 요약을 파일로 써서 PR 코멘트로 게시한다 (`gh pr comment <pr> --body-file /tmp/ghloop-review.md`) — 본문을 쉘 명령줄에 보간하지 않는다.

### Stage 5 — Decision Gate → HITL (the crux)

머지 질문(Stage 5의 마지막 결정 게이트) 전에 워커는 closeout 커밋에 `gh_loop_closed` 실측을 함께 남긴다(Stage 2 "closeout 기록" — 변경 파일/줄·리뷰 라운드·verifier 판정·결정 왕복·dispatch→closeout 분). 결정 요청 댓글의 **Context**에는 그 행의 요약 한 줄(예: `9 files +400/-20, r2, verifier PASS, 0 decision(s), 200 min`)을 적어 사용자가 예측(`gh_loop_dispatched`)과 나란히 보게 한다.

판단이 필요하면 (예: 교차검증이 HIGH+ 이슈 제기 / 스키마·API 파괴 변경 / 머지 직전 / 파괴 작업) **자동 진행하지 않는다**:

1. 구조화 질문을 **파일**로 작성하고(보간 회피) 끝에 **고유 nonce 마커** `<!-- gh-loop:decision:<nonce> -->`(nonce 예: `$(date +%s)-$RANDOM`)를 붙인다 — 이 마커가 *이 결정점*을 식별해 재개가 stale 댓글을 재사용하지 못하게 한다. 그 뒤 코멘트 게시 + 상태 라벨 전이 — **이슈와 PR 둘 다** `needs-decision`(이전 상태 라벨 `agent-working`·`needs-review`는 뗀다, PR에 `gh-loop`는 붙이지 않는다):
   ```
   ## Decision needed
   **Context**: <무엇을/왜 멈췄나 — PR·이슈 링크; 머지 질문이면 현재 PR head SHA도>
   **Question**: <하나의 명확한 질문>
   **Options**: A) … (tradeoff) / B) … (tradeoff)
   **Recommendation**: <기본안 + 근거>
   <!-- gh-loop:decision:<nonce> -->
   ```
   ```bash
   gh issue comment <issue> --body-file /tmp/ghloop-question.md
   gh issue edit <issue> --remove-label agent-working,needs-review --add-label needs-decision
   gh issue edit <pr> --remove-label agent-working,needs-review --add-label needs-decision   # PR이 있으면 — PR도 gh issue edit(상태 라벨 절)
   ```
2. **턴을 종료**한다 (option D: 프로세스 안 붙잡음). 사용자에게: "이슈 #N에 결정 요청을 남겼습니다. 댓글로 답한 뒤 `/gh-loop N`으로 재개하세요." (코디네이터 세션 대화로 답해도 된다 — Stage 0 9.)

**재개** (트리거 = `needs-decision` 이슈에 **권한자(write+)**의 새 댓글. option-A: `issue_comment` webhook; option-D: 수동 핑 / `/gh-loop N`; 세션 직접 결정이면 코디네이터의 `세션에서 직접 결정함` 댓글 + 재개 프롬프트 — Stage 0 9):
1. `issue://<n>` 로 이슈+댓글(author·createdAt 포함)을 읽는다.
2. **가장 최근 에이전트 질문 마커**(`<!-- gh-loop:decision:<nonce> -->`)를 찾고, **그 이후에 달린 댓글만** 후보로 본다 — 그 전 댓글은 *이전 결정용 stale*이라 무시. 에이전트 자기 댓글 제외(bot author / `gh-loop:` 마커). **예외(R7)**: `<!-- gh-loop:session-decision:<nonce> -->` 댓글은 그 nonce가 이 질문의 nonce와 같으면 코디네이터가 옮긴 사용자의 답으로 후보에 넣는다(bot 토큰 모드라 봇 계정으로 달렸어도 이 댓글에 한해 bot author 제외를 풀고, nonce가 다르면 다른 `gh-loop:` 마커 댓글처럼 제외한다). 권한·owner 우선(3)은 인용된 사람이 아니라 **댓글 작성자**로 판정한다 — 그 마커를 단 write 미만 댓글은 무시. 해석은 댓글의 지시 원문 인용을 보고 한다. 같은 댓글에 `acted:<nonce>`도 있으면 코디네이터가 이미 실행한 것이라 6의 실제 상태 재확인만 한다.
3. 후보 중 **권한자(write+) 댓글만**; **owner 우선, 없으면 최신**. 권한자 간 **명시적 이견**이면 자동결정 말고 되묻기(parked).
4. 그 댓글을 **LLM으로 해석**한다 — **고정 키워드/`grep` 금지**. 자연어로 충분(예: `"B, 검증까지 해야지"` → 옵션 B+검증; grep이었으면 놓쳤다). **모호하면 행동 금지** → 명확화 댓글 + parked 유지.
5. 머지 결정이면 질문의 **승인된 head SHA**를 확인하고, 아래 “순차 PR 갱신”에 따라 최신 base와 검증 근거를 확인합니다. **머지 직전 PR head를 다시 읽어** 승인 SHA와 일치할 때만 `gh pr merge <pr> --merge --match-head-commit <approved-sha>`처럼 승인된 방식으로 머지합니다. head가 바뀌면 댓글 시각만으로 승인했다고 추정하지 않고 **새 head·새 nonce로 다시 승인받습니다**. rebase/force-with-lease 승인이나 배치 운영 승인을 머지 승인으로 재사용하지 않습니다. 자율 단계로는 머지하지 않습니다.
6. 멱등: 행동 **성공 후** `<!-- gh-loop:acted:<nonce> -->` 기록 + 이슈·PR **둘 다**에서 `needs-decision` 제거 — 수정 요청처럼 워커가 이어서 작업하는 결정이면 행동에 들어갈 때 이슈·PR의 `needs-decision` → `agent-working`으로 바꿔 두고, 끝나면 다음 결정 게이트(1)로 간다. acted된 nonce면 재실행 무시. acted/라벨 쓰기가 **실패하면 park**(모호하게 두지 말 것). 재개 시엔 마커뿐 아니라 **실제 상태를 재확인**(PR 이미 머지됨 등)해 멱등 보장 — stateless 마커는 원자적이지 않다(Guard policy 직렬화·멱등 참조).
   **park도 결정 요청이다**: 3의 되묻기·4의 명확화로 멈출 때는 1처럼 새 nonce 마커를 단 댓글을 남기고(다음 답을 그 질문에 묶는다) 이슈·PR을 `needs-decision`으로 되돌린다(`agent-working` 제거 — 코디네이터가 Stage 0 9에서 미리 바꿔 둔 경우 포함).

### 순차 PR 갱신 — 소유 워커가 rebase·검증합니다.

[이슈 #71](https://github.com/rae-hugo-kim/omp/issues/71)의 A+C 결정에 따라 코디네이터는 PR을 하나씩 처리합니다. `docs/harness/audit.jsonl merge=union`은 **로컬 merge·rebase의 순수 append 충돌을 줄이는 속성**입니다. #73~#76 실측에서 GitHub는 union이 있어도 `CONFLICTING`이었으므로 서버의 자동 해결을 약속하지 않습니다. 병렬 PR이 모두 충돌하거나 항상 rebase가 필요한 것도 아닙니다.

1. **현재 상태와 PR별 권한을 고정합니다.** 코디네이터는 앞 PR의 실제 머지 상태를 확인한 뒤 다음 PR의 이슈·소유 워커·head/base 리포와 브랜치·현재 head SHA·최신 원격 base SHA를 확인합니다. base가 head의 조상이 아니거나 충돌하면 소유 워커에게 갱신을 맡깁니다. 실행 전 **해당 PR URL·head/base 리포와 ref·기존 head·대상 base SHA·rebase와 원격 히스토리 갱신 방식**을 명시해 승인받습니다. 승인이 없거나 범위가 불명확하면 Stage 5의 새 nonce 질문을 남기고 이슈·PR을 `needs-decision`으로 바꾼 뒤 종료합니다. 세션 직접 결정은 Stage 0 9로 양쪽에 기록하며, 다른 PR이나 미래 갱신의 포괄 승인으로 해석하지 않습니다.
2. **소유 워커가 사전 상태를 보존합니다.** 승인 확인 후에만 이슈·PR을 `agent-working`으로 옮기고, 자기 워크트리의 브랜치·`git status --porcelain`(untracked 포함)·진행 중인 rebase/merge 부재를 확인합니다. 더러운 트리를 stash/reset/clean으로 치우지 않습니다. 원격 이름을 `origin`으로 추정하지 않고 fetch URL과 `git remote get-url --push --all "$HEAD_REMOTE"`의 실제 목적지를 확인합니다. push URL은 **하나이며 승인된 PR head 리포와 같을 때만** `HEAD_PUSH_URL`로 고정합니다. 복수 URL·불일치·조회 실패는 중단합니다. 확인한 원격에서 head/base를 fetch하고 PR head와 `git ls-remote "$HEAD_PUSH_URL" "refs/heads/$BRANCH"`의 SHA, 로컬 HEAD가 모두 승인된 기존 head와 같은지 대조합니다. 기존 head(`OLD_HEAD`), 공통 조상(`OLD_BASE`), 승인된 최신 base(`BASE_SHA`), 예상 원격 head(`EXPECTED_REMOTE_SHA`), PR URL·두 리포·ref·push URL, 원 AC·변경 파일 목록과 세 시점의 감사 로그 원본을 임시 위치에 보존합니다. SHA는 비어 있지 않은 완전한 값이어야 하며 원격 base가 승인 SHA와 달라졌으면 다시 결정받습니다. 감사 로그의 양쪽 변경이 공통 조상 원본을 그대로 둔 **순수 append**인지 먼저 확인하고, 삭제·교체·비JSON 행·끝 개행 손상은 보고하고 중단합니다.
   리터럴 URL도 Git의 URL 재작성 대상이므로, 모든 유효 설정 범위에서 `url.*.insteadOf`·`url.*.pushInsteadOf`가 **없음**을 확인하고 push 직전 다시 대조합니다. 재작성 설정이 있거나 조회 결과가 불명확하면 설정을 임의로 바꾸지 않고 park합니다. 명시 refspec 밖의 태그·서브모듈 전송은 아래 명령의 옵션으로 차단합니다.
3. **고정한 base 위에서 실제 rebase합니다.** `git check-attr --source "$BASE_SHA" merge -- docs/harness/audit.jsonl`로 rebase 대상 트리의 유효 속성을 확인한 뒤 `git rebase "$BASE_SHA"`를 실행합니다. `--source` 지원은 설치된 Git의 도움말로 확인합니다. 미지원·union 미설정·충돌을 임의 속성 변경이나 `ours`/`theirs`·수동 union으로 우회하지 않습니다. 다른 파일 충돌, 로그 재작성, 범위 밖 변경이 나타나면 상태와 사유를 보존해 Stage 5로 park합니다. 코디네이터가 대신 편집·rebase하지 않습니다.
4. **성공 exit만으로 통과시키지 않고 검증 4종을 수행합니다.** rebase 재생·충돌 해결에는 커밋 게이트의 append-only 검사를 기대할 수 없으므로 아래 검증을 생략하지 않습니다.
   - **로그 무결성을 검증합니다.** 결과의 끝 개행을 확인하고 모든 물리적 행을 JSON으로 파싱합니다(빈 행·비JSON 행도 실패합니다). 최신 base 로그가 바이트 단위 prefix로 남고, 기존 PR의 추가 행이 원래 순서·내용·개수대로 결과의 나머지 부분에 보존됐는지 확인합니다. 공통 조상·최신 base·기존 head의 사전 스냅샷과 대조하며, 정렬·중복 제거·기존 행 삭제/교체는 하지 않습니다. union은 JSON 유효성·append-only·시간순서를 보증하지 않으며, 누락·손상은 별도 수정 승인 없이 조용히 통과시키지 않습니다.
   - **원 작업 범위를 대조합니다.** `git range-diff "$OLD_BASE..$OLD_HEAD" "$BASE_SHA..HEAD"`와 최신 base 대비 diff를 원 AC·변경 파일 목록에 대조합니다. seed/scope를 포함한 다른 파일 충돌이나 원 범위를 벗어난 변경은 자동 해결로 간주하지 않습니다.
   - **발견된 검증 명령을 실행합니다.** 해당 리포의 테스트·build/lint 등 필요한 명령을 찾아 실행하고 실제 변경 경로를 스모크 검증합니다. 이 소스 리포는 하네스 suite와 `node scripts/docs-drift`도 실행합니다. 소비 리포에 없는 소스 전용 명령은 복사하지 않습니다.
   - **새 head의 리뷰·verifier 근거를 확보합니다.** 이전 head의 결과를 그대로 재사용하지 말고 새 diff·AC에 대한 검토, 명령·결과와 남은 한계를 이슈·PR에 기록합니다.
5. **명시적 lease로만 갱신합니다.** 검증 후 작업트리 청결과 로컬 HEAD, 실제 push URL, 원격 base SHA·head SHA를 다시 확인합니다. 원 PR URL과 base 리포를 고정해 `gh pr view`로 `baseRefName`·`baseRefOid`·`headRefName`·`headRefOid`·`headRepository`·`headRepositoryOwner`도 재조회합니다. 리포·ref가 승인 대상과 다르거나 base SHA 또는 `EXPECTED_REMOTE_SHA`가 달라졌으면 push하지 않고 새 nonce로 결정받습니다. `HEAD_PUSH_URL`·`BRANCH`는 2에서 확인한 해당 PR의 목적지·브랜치이며, 예상 SHA는 승인 때의 값을 유지합니다.
   ```bash
   git push --no-follow-tags --recurse-submodules=no --force-with-lease="refs/heads/$BRANCH:$EXPECTED_REMOTE_SHA" "$HEAD_PUSH_URL" "HEAD:refs/heads/$BRANCH"
   ```
   일반 `--force`, 예상 SHA 없는 `--force-with-lease`, lease 실패 뒤 새 SHA를 넣어 자동 재시도하는 것은 금지합니다. 응답 유실이면 실제 원격 SHA를 한 번 확인하고, 결과가 불명확하면 성공으로 기록하거나 재시도하지 않고 park합니다.
6. **변경된 head는 별도로 머지 승인받습니다.** 원격 PR head가 검증한 새 로컬 HEAD와 같음을 확인한 뒤 rebase 승인 nonce의 `acted`와 검증 결과를 이슈·PR에 기록합니다. 이어 **PR URL·head/base 리포와 ref·새 head SHA·base SHA·새 nonce·머지 방식**을 담은 별도 질문을 남기고 양쪽을 `needs-decision`으로 바꾼 뒤 종료합니다. 머지 직전에도 5의 PR 대상 리포·ref·SHA를 재조회하며, base 브랜치가 바뀌면 SHA가 같아도 새 nonce로 승인받습니다. base가 전진했으면 최신 base 포함 여부·검증부터 다시 확인합니다. Stage 5 재개 5의 `--match-head-commit`으로 승인된 head만 머지합니다. 이 옵션은 head 가드이지 base 리포·ref·SHA를 원자적으로 잠그는 수단은 아니므로 최종 조회 뒤의 base 변경 경쟁은 남습니다. 다음 PR은 이 PR의 실제 머지를 확인한 뒤 처리합니다.

**배포 범위를 구분합니다.** 이 소스 리포와 이 속성을 포함한 신규 템플릿 복사에는 한 경로의 union 규칙이 적용됩니다. 기존 소비 리포의 `.gitattributes`는 `scripts/harness-sync.sh` allowlist 밖이며 이번 변경도 sync 범위를 넓히지 않습니다. 소비 리포는 별도 적용 승인 후 **기존 속성과 우선순위를 읽고 해당 한 줄만 반영**하며 `git check-attr`로 유효값을 확인합니다. 파일 전체 덮어쓰기는 금지합니다. 속성이 없는 리포에서는 자동 해결을 전제하지 않고 위 중단·보고 절차를 따릅니다.

## Loop Safety

- **이슈 상한** = 헬퍼 `--cap`(기본 5). 런당 생성 수(`--created`)가 cap에 도달하거나 **열린 gh-loop 이슈 수가 cap에 도달**하면 `block` — 후자는 호출자 카운팅을 신뢰하지 않는 관측 기반 백스톱.
- **반복 한도**: 같은 이슈에서 fix→verify가 N회(기본 3) 수렴 실패면 멈추고 사유 댓글 + `needs-decision`(상태 라벨 전이 — 이슈·PR 둘 다)으로 사용자에게.
- 파괴 작업은 advisory를 넘어 사용자 확인 (Non-Negotiables).

## Guard policy (확정 — 라이브 검증 후 결정)

option-A에서 "권한자 댓글 = 트리거"의 안전 정책:
- **권한 임계값**: **write 권한 이상**만 루프를 조종할 수 있다 (그 미만 댓글은 무시).
- **봇 아이덴티티**: 전용 **bot 토큰**으로 식별; PAT 모드면 에이전트 댓글의 `<!-- gh-loop:* -->` **마커 prefix fallback**으로 자기 댓글 제외. 러너 트리거는 `session-decision` 댓글도 예외 없이 제외하고, 재개 해석에서만 그 nonce의 사용자 답으로 인정한다(Stage 5 재개 2).
- **다중 응답 충돌**: **owner 우선, 없으면 최신** 권한자; 명시적 이견이면 **되묻기**(자동결정 금지).
- **모호성 에스컬레이션**: 명확화 후에도 미결이면 **무기한 parked** — 자동결정하지 않는다 (선택적 리마인더만).
- **동시성·멱등 (option-A)**: runner는 **이슈별 concurrency group**으로 직렬화(동시 `issue_comment` 워커 금지)하고 행동은 **멱등**이어야 한다(이미 머지된 PR 재머지=no-op 등). stateless `acted` 마커만으론 원자성이 보장되지 않으므로 직렬화가 1차 방어, 멱등이 2차.

## Reuse Map (stage → asset → 위치 / provenance)

| Stage | Asset | 위치 |
|---|---|---|
| 0 dispatch / 재개 / 정리 / 세션 직접 결정 (코디네이터) | `orca worktree create --issue N`(카드 링크) · `terminal create --command "command omp --extension <EXT> --model … --thinking …"`(R8) · `terminal send` · `issue:<N>` 셀렉터 · `worktree rm` · `세션에서 직접 결정함` 댓글(R7) · `gh-loop-record.mjs recommend`/`dispatch`(규모 기반 추천 한 줄 + dispatch 튜플, #79) · (보류) `orca orchestration run-create`/`worker-start` | **Orca CLI**: `.omp/skills/orca-cli/SKILL.md` · **harness**: `.omp/extensions/harness/gh-loop-record.mjs` · 본 스킬 Stage 0 |
| 1 finding→issue (dedup/throttle/label) | `gh issue create` + 헬퍼 | **harness(신규)**: `.omp/extensions/harness/gh-loop-issue.mjs` |
| 2 issue→fix | autopilot / ralph + 하네스 게이트 | **OMC**(전역 스킬) + `.omp/extensions/harness/gates/` |
| 3 fix→PR | `gh pr create` + `needs-review` (compr 절차) | **harness**: `.omp/skills/compr/SKILL.md` |
| 4 cross-verify (advisory) | reviewer · adversary · ccg/codex | **harness**: `.omp/agents/{reviewer,adversary,verifier}.md` · **OMC**: ccg/codex |
| 5 decision gate / resume / closeout 기록 | 상태 라벨(이슈·PR `needs-decision`) + `issue://` read(워커가 해석, `session-decision` 댓글 포함) · `gh-loop-record.mjs ingest`/`close`(`gh_loop_dispatched`·`gh_loop_closed`, #79) → `estimate-report.mjs` §3 | 본 스킬 컨벤션(상태 라벨 절) + `gh` CLI · **harness**: `.omp/extensions/harness/gh-loop-record.mjs` |

## Substrate note

- **지금(option D + dispatch)**: 코디네이터 세션이 킥오프·재개 프롬프트·정리만 하고, 루프는 워크트리별 워커 세션이 수행한다. 본 레포가 만드는 건 **재사용 자산**(이 스킬 + 헬퍼)이고, 실제 실행은 각 프로젝트에서 이 스킬을 호출해 일어난다.
- **검증 후(option A, 별도 작업)**: `.github/workflows/` + self-hosted runner + `issue_comment` 트리거로 재개를 자동화. 본 PoC의 범위 밖.

## State

루프 상태는 **GitHub에 산다** — 이슈/PR 상태, `gh-loop` 라벨과 상태 라벨(`agent-working`/`needs-decision`/`needs-review`, 상태 라벨 절), 댓글. 별도 로컬 상태 파일을 만들지 않는다 (재개는 이슈 번호만으로 충분).

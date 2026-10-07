---
name: gh-fanout
argument-hint: [label/filter for issues to fan out, or a tracking issue number]
description: Fans out gh-loop across many issues as Orca-managed worktree-isolated omp worker sessions, observed via GitHub labels/comments and Orca cards, with dynamic scaling. Use when the user says "gh-fanout", "멀티세션", "fan-out", "병렬 루프", "multisession orchestration", or wants several gh-loop issues worked in parallel. A THIN on-demand controller — never a daemon; never auto-merges.
---

# gh-fanout — multisession controller (autonomy Q3)

## Goal

검증된 **gh-loop**를 여러 이슈에 병렬로 실행하는 얇은 컨트롤러입니다. 각 워커는 **Orca 워크트리 1개 + omp 터미널 1개 + 이슈 1개**를 맡습니다. GitHub 라벨·댓글·트래킹 이슈를 상태 원천으로 사용하고, Orca 카드로 진행 상황을 보조 관측합니다. cap(기본 3) 안에서 한 번 배치한 뒤 즉시 복귀하며, 다음 호출에서 재조정합니다.

별도 수정 엔진이나 데몬을 만들지 않고 [gh-loop](../gh-loop/SKILL.md)의 worker 모드(Stage 2~5)를 재사용합니다.

## Non-Negotiables

| Rule | Why |
|------|-----|
| **머지 절대 자동 금지** | 워커 PR은 인간 승인으로만 머지(gh-loop과 동일 불변식) |
| **얇은 오케스트레이터** | 컨트롤러는 spawn/모니터/스케일만 — 상시 데몬·대시보드 제품화 금지(Q3.6 ecc2 경계) |
| **이슈 1 ↔ worktree 1 ↔ 워커 1** | 병렬 편집·커밋 충돌 방지 |
| **cap 준수 + 예산 가드** | 워커마다 모델콜 N배 — `--cap`(기본 3) 천장, 동적 스케일은 1~cap |
| **GitHub가 상태 원천** | 라벨·댓글·트래킹 이슈가 세션 간 버스이며, Orca 카드·터미널은 보조 관측 수단입니다. RPC 이벤트 수신이나 상시 폴링을 하지 않습니다. |
| **단일 컨트롤러 가정** | GitHub 라벨은 CAS 아님 → **동시 컨트롤러 미지원**(로컬 온디맨드 tier). 멀티 컨트롤러는 외부 락 필요(out_of_scope) |

## Prerequisites (discover, don't assume)

설치된 `skill://orca-cli`를 먼저 읽고 아래 명령을 확인합니다(orca-cli는 이 템플릿의 동기화 자산이 아닙니다). 이 문서의 `orca`는 Linux의 Orca 터미널 밖 셸에서는 **`orca-ide`**로 바꿔 실행합니다.

```bash
gh auth status
gh repo view --json nameWithOwner -q .nameWithOwner
command -v omp
orca status --json
```

컨트롤러 결정 로직은 `.omp/extensions/harness/gh-loop-controller.mjs`를 재사용합니다. 스폰·관측은 이 스킬의 절차이며, helper의 `role`은 모델 선택 정책이 아닙니다.

## Process

### 0. 트래킹 이슈를 먼저 정합니다.

gh-loop Stage 1의 라벨 블록으로 `gh-loop`와 상태 라벨 3개를 보장합니다. 인자가 트래킹 이슈 번호이면 그 이슈를 읽어 같은 리포의 gh-fanout 집계인지 확인하고 `TRACKING`에 번호를 보관합니다. label/filter 호출이면 기존 열린 트래킹 이슈에서 같은 배치를 찾아 재사용하며, 후보가 여럿이면 사용자에게 번호를 묻습니다. 없으면 배치 필터·cap·빈 워커 표를 담은 본문 파일(`TRACKING_BODY`)과 제목(`TRACKING_TITLE`)을 준비해 생성합니다.

```bash
TRACKING_URL=$(gh issue create --title "$TRACKING_TITLE" --body-file "$TRACKING_BODY" --label needs-review) || exit 1
TRACKING=${TRACKING_URL##*/}   # 번호는 생성 뒤에만 알 수 있어 제목 접두는 2단계입니다(#78)
gh issue edit "$TRACKING" --title "#$TRACKING $TRACKING_TITLE" || echo "제목 접두 부착 실패 — 이슈는 생성됐으니 재생성하지 말고 제목만 수동으로 '#$TRACKING <제목>'으로 고칩니다"
```

제목은 `#N <제목>`으로 시작합니다(사용자 결정 2026-10-03 — gh-loop Stage 1 "제목 `#N ` 접두"와 같은 규칙). `TRACKING_TITLE`은 접두 없는 제목이고 접두는 생성 뒤 edit에서만 붙습니다. 이미 있는 트래킹 이슈의 제목은 소급해서 바꾸지 않습니다.

반환 URL의 이슈 번호를 `TRACKING`에 보관하고 읽기·갱신 가능 여부를 확인한 뒤 진행합니다. 트래킹 이슈는 집계 보고이므로 `needs-review`로 만들고 **`gh-loop`를 붙이지 않습니다**(자기 자신을 백로그로 할당하지 않습니다). 생성 응답 유실이면 기존 이슈를 단발 조회해 확인하며, 확인할 수 없으면 재생성·클레임 없이 보고합니다. 재호출은 이 번호로 하며 §6의 재개 대기·기동 실패 기록을 §1 신규 후보보다 먼저 처리합니다.

### 1. 후보 수집 + 중복할당 방지 (assign)
§0에서 보장한 라벨을 사용해 후보를 수집합니다. 새 리포에서도 `agent-working` 라벨이 존재하는 상태에서 조회합니다.
```bash
ISSUES=$(gh issue list --state open --label gh-loop --json number,title,labels --limit 100)
CLAIMED=$(gh issue list --state open --label agent-working --json number | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(s).map(i=>i.number))))')
node .omp/extensions/harness/gh-loop-controller.mjs assign --issues-json "$ISSUES" --claimed-json "$CLAIMED"
```
→ `assignable`만 fan-out 대상 — 상태 라벨(gh-loop `SKILL.md` "상태 라벨")이 없는 이슈만 백로그다. `agent-working`이면 다른 워커가 잡았고, `needs-decision`·`needs-review`면 사람 차례라 skip한다.

### 2. 풀 shape 결정 (planPool)
각 assignable 이슈를 `id = 이슈 번호`, `kind = "fix"`인 task로 전달합니다. 이 풀은 이슈 소유 워커를 계획합니다. §5 기준으로 센 현재 활성 수를 `RUNNING`에 넣고, cap에서 남은 슬롯만 계획합니다.
```bash
CAP=3
AVAILABLE=$((CAP - RUNNING))
if [ "$AVAILABLE" -gt 0 ]; then
  node .omp/extensions/harness/gh-loop-controller.mjs plan --tasks-json "$TASKS" --cap "$AVAILABLE"
fi
```
`workers`는 이번 호출의 후보, `queued`는 다음 호출의 후보입니다. 여유가 0 이하면 plan/spawn을 건너뜁니다. helper의 `kind: "review"` 다중 슬롯은 별도 리뷰 계획용이며, 같은 `taskId`로 이슈 소유 워커를 여러 개 띄우지 않습니다. 교차검증은 각 워커의 gh-loop Stage 4가 담당합니다.

### 3. 모델을 선택하고 Orca 워커를 기동합니다.

**기본 경로는 gh-loop Stage 0의 2단계 기동입니다.** `orca orchestration worker-start --agent omp --model …`는 모델 지정을 거부하고, 모델 없이 실행해도 호스트에 따라 셸로 폴백한 실측이 있습니다(#65 R4). 이 실패를 재시험하거나 RPC 경로로 우회하지 않습니다.

1. **모델을 먼저 정합니다.** 각 이슈의 본문·댓글을 읽고 `<!-- gh-loop:model:<provider/model>:<effort> -->`가 있으면 사용자 변경 지시가 없는 한 재사용합니다. 없는 이슈들은 gh-loop Stage 0 2처럼 `omp config get modelRoles`의 실제 역할·id와 “이 세션과 동일”을 선택지로 묶어 `ask`로 묻습니다. 배치 공통 선택도 사용자가 선택했을 때만 적용하며, 각 이슈에 모델·thinking과 마커를 **파일로 작성해 `gh issue comment --body-file`로 기록한 뒤** 클레임합니다. 모델 자동 선택은 하지 않습니다.
2. **중복·소유권을 확인합니다.** §6 재조정과 `orca worktree list --repo "$REPO" --json`으로 같은 이슈의 기존 카드·터미널을 찾습니다. `REPO`는 확인한 리포 셀렉터, `ISSUE`는 대상 번호입니다. 자기 소유 워크트리가 있으면 **3~5를 건너뛰고 §6으로** 갑니다. 다른 소유자의 워커가 있거나 소유권이 불명확하면 생성·클레임 없이 보고합니다. 기존 워크트리 제거·브랜치 강제 초기화로 새 슬롯을 만들지 않습니다.
3. **최신 상태를 확인하고 클레임 뒤 워크트리를 생성합니다.** 클레임 직전 `issue://N`으로 이슈가 열려 있고 상태 라벨이 없는지 다시 확인합니다. 상태가 바뀌었으면 이번 후보에서 빼며 `needs-decision`·`needs-review`를 신규 클레임 명령으로 제거하지 않습니다. §4 트래킹 이슈에 대상 번호·시각·소유 컨트롤러·클레임 전 상태와 “클레임 시도”를 먼저 기록합니다(기록 실패면 중단합니다). 각 명령이 성공한 뒤에만 다음으로 가고, 클레임 후에도 이슈 상태를 단발 대조해 사람 대기 라벨·닫힘을 발견하면 자기 클레임만 롤백하고 스폰하지 않습니다. GitHub 라벨은 CAS가 아니므로 조회~변경 사이 경쟁을 완전히 막지는 못합니다.
   ```bash
   gh issue edit "$ISSUE" --add-label agent-working
   orca worktree create --repo "$REPO" --name "gh-fanout-issue-$ISSUE" --no-parent --issue "$ISSUE" --json
   ```
   생성 결과의 `result.worktree.id` **전체**(`<repoId>::<path>`)를 `WT_ID`로 보관합니다. 기본 브랜치 기준으로 만들며 `--base-branch`로 현재 기능 브랜치를 물려주지 않습니다. 생성 결과의 브랜치와 소유권도 §4 트래킹 이슈에 기록합니다.
4. **R8 상태 확장을 전달합니다.** 확인한 사용자 선택을 `MODEL`(provider/model), `THINKING`(effort)에 넣습니다. 댓글 본문을 셸 코드로 실행하지 않으며, 명령 문자열의 인자는 Bash `printf %q`로 인용합니다.
   ```bash
   if [ -n "${ORCA_OMP_STATUS_EXTENSION:-}" ] && [ -f "$ORCA_OMP_STATUS_EXTENSION" ]; then
     printf -v WORKER_CMD 'command omp --extension %q --model %q --thinking %q' "$ORCA_OMP_STATUS_EXTENSION" "$MODEL" "$THINKING"
   else
     printf -v WORKER_CMD 'omp --model %q --thinking %q' "$MODEL" "$THINKING"
   fi
   orca terminal create --worktree "id:$WT_ID" --title "gh-fanout #$ISSUE" --command "$WORKER_CMD" --json
   ```
   확장 경로는 **코디네이터 환경에서 펼친 리터럴**이며 `command omp`로 Orca 래퍼의 중복 로드를 피합니다. 확장이 없으면 plain omp를 쓰고 “Orca 카드 상태·알림이 보이지 않을 수 있습니다”라고 보고합니다(gh-loop R8). `PI_AUTO_QA=0`의 headless RPC 우회는 사용하지 않습니다.
5. **단일 핸들로 준비를 확인하고 프롬프트를 전달합니다.** 생성 응답의 `result.terminal.handle`을 `HANDLE`로 보관합니다.
   ```bash
   orca terminal wait --terminal "$HANDLE" --for tui-idle --timeout-ms 120000 --json
   orca terminal send --terminal "$HANDLE" --text "$WORKER_PROMPT" --enter --json
   ```
   wait 성공 뒤에만 send합니다. 타임아웃이면 `orca terminal read --terminal "$HANDLE" --screen --json`을 **한 번** 읽어 omp 상태바의 선택 모델·thinking을 확인한 경우에만 send하고, 셸·오류 화면이거나 준비가 불명확하면 아래 표로 갑니다. 이 대기는 기동 준비 확인에만 사용하며 워커 완료를 기다리지 않습니다. bare `worktree create`가 만든 기존 탭은 실제 명령을 실행 중일 수 있으므로 `terminal list/show`로 미사용 셸임을 확인하기 전에는 닫지 않습니다.

`WORKER_PROMPT`는 다음 내용을 담은 **한 단락, 줄바꿈 없는 문자열**로 작성합니다: `<!-- gh-loop:worker -->`, 이슈 번호, gh-loop Stage 2~5 수행·Stage 2 커밋 순서·상태 라벨 절 준수, 재디스패치 금지, 자동 머지·자기 워크트리 삭제 금지, 이슈 마일스톤 댓글과 `orca worktree set --worktree active --comment` 갱신, 결정점에서 이슈·PR `needs-decision` + nonce 댓글 + 턴 종료입니다. handoff가 있으면 경로와 선독 지시를 포함합니다. 재개 프롬프트는 “이슈 #N 재개 — gh-loop Stage 5 재개 절차로 댓글을 해석해 다음 단계를 수행합니다”를 명시합니다.

| 실패 지점 | 처리 |
|---|---|
| 모델 마커 기록 실패·클레임이 적용되지 않은 것이 확인됨 | 새 워커를 띄우지 않습니다. 획득하지 않은 클레임을 제거하지 않습니다. |
| 클레임 응답 유실·타임아웃 | GitHub의 실제 상태와 사전 “클레임 시도” 기록을 단발 대조합니다. 먼저 §3-3과 같이 닫힘·새 사람 대기 라벨을 확인하며, 발견하면 확인된 자기 `agent-working`만 제거하고 그 사람 상태·질문을 보존한 채 스폰·새 park 없이 보고합니다. 그렇지 않고 자기 클레임이며 다른 소유자가 없음을 확인하면 제거하고 공통 park 절차를 따릅니다. 미적용이면 스폰하지 않고 실패를 보고합니다. 소유권·적용 여부 또는 조회 자체가 불명확하면 임의 제거·재클레임 없이 거짓 클레임 가능성과 회수 필요를 트래킹 이슈의 새 nonce 질문으로 보고한 뒤 중단합니다. |
| 클레임 뒤 worktree/terminal 생성·준비 실패가 확정됨 | 이 컨트롤러의 `agent-working`을 제거하고 공통 park 절차를 따릅니다. 파일·브랜치는 보존합니다. 자동 재시도 대신 사람의 확인을 기다리는 것은 gh-loop 상태 라벨 절의 실패 전이를 따른 선택입니다. |
| 생성 응답 유실·send 실패/타임아웃 등 전달 여부가 불확실함 | GitHub 댓글·라벨과 worktree list, terminal list/show/read를 한 번 대조합니다. 전달·작업 시작을 확인하면 기존 워커를 채택합니다. 작업 중일 가능성을 배제하지 못하면 원 이슈·PR 라벨을 유지하고 트래킹 이슈에 새 nonce 질문과 `needs-decision`을 남겨 멈춥니다. 비실행이 확인된 자기 워커의 전달 실패는 공통 park 절차로 갑니다. 불확실한 워커는 cap 슬롯을 유지하며, 확인 전 재스폰·프롬프트 재전송·워크트리 삭제를 하지 않습니다. |
| 롤백·댓글·라벨 쓰기도 실패함 | 거짓 클레임 가능성과 실패한 명령을 사용자에게 보고하고 중단합니다. 성공으로 기록하지 않습니다. |

**공통 park 절차**는 위 표나 §6이 이 절차로 보낸 경우에 적용하며, 표의 사람 상태 보존·트래킹 이슈 보고 분기가 우선합니다. gh-loop Stage 5 형식의 사유·질문·선택지·권고와 새 `<!-- gh-loop:decision:<nonce> -->` 마커를 파일로 작성해 이슈 댓글로 게시하고, 이슈와 기존 PR에 `gh issue edit <대상> --remove-label agent-working,needs-review --add-label needs-decision`을 실행한 뒤 턴을 끝냅니다. 다른 소유자의 상태 라벨은 변경하지 않고 트래킹 이슈에 같은 형식의 질문과 `needs-decision`을 남겨 보고합니다. 트래킹 이슈를 결정 대기로 옮길 때도 기존 상태 라벨은 제거합니다. PR에는 `gh-loop`를 붙이지 않습니다. 정상 기동도 워커 핸들·모델·기동 결과를 보고한 뒤 **즉시 복귀**합니다.

### 4. 턴마다 GitHub와 Orca를 한 번 관측합니다.

RPC 이벤트 스트림 대신, 컨트롤러가 호출된 턴에만 아래 상태를 조회합니다. `orca orchestration check --wait`, `terminal read` 폴링, sleep 루프는 사용하지 않습니다.

```bash
gh issue list --state open --label gh-loop --json number,title,labels --limit 100
orca worktree ps --json
```

- **GitHub 상태를 우선합니다.** 각 `issue://N`의 댓글과 연결된 `pr://N`의 실제 상태·라벨을 읽어 `agent-working`(작업 중), `needs-decision`(결정 요청), `needs-review`(질문 없는 확인 대기)를 구분합니다. 위 issue list는 PR 조회를 대신하지 않습니다. Stage 5는 이슈·PR 양쪽을 `needs-decision`으로 바꿉니다. 카드의 “완료”나 터미널의 idle만으로 이슈 완료·머지·크래시를 추정하지 않습니다.
- **카드는 보조 관측입니다.** 워커가 마일스톤마다 `orca worktree set --worktree active --comment "gh-loop #N: …" --json`을 갱신합니다. 상태 확장 없이도 코멘트 명령은 사용하며, 댓글과 어긋나면 GitHub를 다시 대조합니다.
- **마일스톤 댓글은 워커가 씁니다.** 시작·막힘·결정 요청·완료마다 한 번만 남깁니다. 컨트롤러는 같은 이슈·마일스톤 키의 기존 댓글을 확인해 재게시하지 않습니다. `gh-loop-issue.mjs`는 이슈 생성 dedup/throttle이며 댓글 중복 제거를 대신하지 않습니다.
- **트래킹 이슈는 본문을 갱신합니다.** 각 이슈의 링크·상태·소유 컨트롤러(트래킹 이슈 번호)·전체 worktree id·브랜치·현재 terminal handle·모델과 풀 집계(활성 N/cap, 결정 대기, 완료)를 기록합니다. handle은 런타임 한정 힌트이므로 재개 시 다시 확인합니다. 댓글을 누적하거나 RPC 로그를 보존하는 컨트롤러를 만들지 않습니다.
- **실패가 확인되면 park합니다.** 자기 소유 워커의 종료·기동 실패만 gh-loop Stage 5의 새 nonce 질문으로 보고하고, 이슈·PR의 `agent-working`·`needs-review`를 제거해 `needs-decision`으로 바꿉니다. 카드가 없거나 Orca 조회가 실패했다는 이유만으로 다른 워커의 클레임을 해제하지 않습니다.

### 5. 다음 호출에서 스케일을 조정합니다.

이번 조회의 실제 활성 워커 수(`running`), 재할당 가능한 백로그 수(`backlog`), 안전하게 은퇴 가능한 슬롯(`idle`)로 `STATE`를 구성합니다. 다른 gh-loop dispatch의 활성 워커도 같은 리포의 cap 계산에 포함하지만 소유권은 가져오지 않습니다. 실행 여부가 불명확한 워커는 활성으로 보수적으로 셉니다.

```bash
node .omp/extensions/harness/gh-loop-controller.mjs scale --state-json "$STATE" --cap "$CAP"
```

`up`이면 delta만큼 §3을 수행하고, `down`이면 §6 조건을 충족한 슬롯만 은퇴시키며, `hold`이면 변경하지 않습니다. `needs-decision`·`needs-review`에서 턴을 종료한 워커는 백로그가 아니며, 슬롯을 비워도 워크트리와 터미널을 지우지 않습니다. 살아 있는 omp 프로세스 수와 현재 작업 중인 슬롯 수는 다를 수 있습니다. 컨트롤러는 백로그가 남아 있어도 이번 배치를 보고한 뒤 종료합니다.

### 6. 소유권을 확인해 재개·정리합니다.

- **재조정은 할당 전에 합니다.** 트래킹 이슈의 소유 기록과 Orca 카드의 이슈 링크·전체 id를 대조합니다. `gh-fanout-issue-<N>`은 검색 힌트일 뿐입니다. gh-loop dispatch의 `gh-loop-issue-<N>` 워커나 소유 불명 워커를 라벨만 보고 회수하지 않습니다. 같은 이슈의 카드가 여럿이면 자동 선택하지 않습니다. 활성·소유권이 불명확하면 §3 표에 따라 원 이슈·PR 라벨을 유지하고 트래킹 이슈에 새 nonce 질문을 남기며, 자기 소유·비실행이 확인된 충돌에만 공통 park를 적용합니다.
- **트래킹 이슈의 운영 질문은 코디네이터가 처리합니다.** `TRACKING`의 답은 gh-loop Stage 5 재개 1~4·6과 같은 최신 nonce 이후·write+ 권한·owner 우선·이견/모호성 park·acted 멱등 규칙으로 해석합니다. 승인된 운영 조치가 성공한 뒤 `<!-- gh-loop:acted:<nonce> -->`를 기록하고, 미결 운영 질문이 없으면 트래킹 이슈의 `needs-decision`을 `needs-review`로 바꿉니다. 트래킹 답을 개별 이슈의 수정·머지 승인으로 간주하지 않습니다. 개별 이슈 승인이 필요하면 그 이슈에 별도 nonce 질문을 남기고 해당 워커의 Stage 5 검증을 거칩니다. 기록·라벨 쓰기 실패는 §3 실패 표대로 보고하고 멈춥니다.
- **답의 출처를 먼저 보존합니다.** 코디네이터 세션 대화의 직접 답은 cap·상태 확인보다 먼저 gh-loop Stage 0 9의 `session-decision` 댓글로 기록합니다. GitHub 댓글 답은 복제하지 않고 원 댓글을 워커가 Stage 5의 권한자·nonce·멱등 규칙으로 해석하게 합니다. 재개 요청은 §1의 신규 assign 필터와 별도로 처리하며, 후보 답이 없으면 깨우지 않습니다.
- **재개도 cap 안에서만 합니다.** §5의 활성 수를 다시 확인하고, 슬롯을 반환했던 워커의 재개는 신규 기동과 똑같이 여유 1개를 요구합니다. 여유가 없으면 라벨·터미널을 그대로 두고 트래킹 이슈에 원 질문·답 링크와 재개 대기를 기록한 뒤 복귀합니다. 전달 불확실성으로 이미 활성 슬롯에 센 워커는 중복 가산하지 않되, 작업 중이면 깨우지 않습니다.
- **워크트리 생성 전 실패도 복구합니다.** 트래킹 기록이 자기 소유 기동 실패이고 실제 워크트리·워커가 없음을 확인한 경우, 재개 요청·cap·최신 이슈 상태를 확인한 뒤 §3의 `worktree create`부터 4~5까지 수행합니다. 이슈가 닫혔거나 별도 사람 보류가 생겼으면 기동하지 않습니다. 이 경로는 신규 assign/클레임을 생략하며, 프롬프트를 반드시 **재개** 형태로 전달해 새 워커가 먼저 Stage 5의 원 답을 검증하게 합니다. 라벨 전이는 아래 답 출처별 규칙을 따릅니다.
- **기존 워크트리는 그대로 재개합니다.** `terminal list --worktree "id:$WT_ID"`와 `terminal show/read`로 현재 omp 핸들과 작업 종료·입력 대기 여부를 한 번 확인합니다. 이미 작업 중이거나 불명확하면 라벨 변경·send 없이 보고합니다. 입력 대기와 위 cap 조건을 확인하면 기존 핸들에 재개 프롬프트를 한 번 send합니다. 워커 부재·cap 여유가 확인되면 §3의 **4~5만** 수행해 같은 워크트리에 모델 마커·R8 `WORKER_CMD`로 새 terminal을 만듭니다. stale handle은 재조회하며 두 핸들에 중복 전달하지 않습니다.
- **라벨은 답의 출처에 맞춰 전이합니다.** 세션 직접 답이면 실제 재개 직전에 코디네이터가 이슈·PR을 `agent-working`으로 바꿉니다. GitHub 댓글 답이면 코디네이터는 라벨을 유지하며, 워커가 답을 검증하고 행동에 들어갈 때 Stage 5 재개 6에 따라 전이합니다. 모든 재개 경로의 실패·불확실성에는 §3 표를 적용합니다. 새 nonce로 park하면 이전 답을 재사용하지 않고 새 질문에 대한 답을 기다립니다.
- **크래시 상태는 보존합니다.** 커밋·미커밋 파일·브랜치를 지우지 않고 §4의 결정 요청으로 보냅니다. 기동 응답이 유실되었거나 소유권이 불명확하면 조회 결과를 보고할 뿐 자동 재클레임하지 않습니다.
- **정리는 코디네이터만 합니다.** PR 머지 또는 폐기를 실제로 확인하고 **해당 워크트리·브랜치 삭제를 명시적으로 승인받은 뒤**, 미커밋 변경이 없는지 확인합니다. gitignored 리뷰 사이드카는 메인 체크아웃으로 먼저 보존합니다. `orca worktree rm --worktree "id:$WT_ID" --json`은 로컬 브랜치 삭제도 시도하지만, 기존에 있던 브랜치나 머지됐음을 증명하지 못한 브랜치는 보존합니다(설치 CLI `--help`). 보존된 브랜치는 보고하고 별도 승인 없는 추가 삭제는 하지 않습니다. 원격 브랜치 삭제도 따로 승인받아 기록한 브랜치에만 실행합니다. `--force`는 사용하지 않고 삭제 실패는 보고합니다. 워커는 자기 워크트리를 지우지 않습니다.

### 7. PR은 하나씩 승인·갱신·머지합니다.

구현 워커는 병렬로 일하지만, 코디네이터는 **현재 head에 대한 승인을 받은 PR부터 하나씩** 처리합니다. [gh-loop](../gh-loop/SKILL.md)의 “순차 PR 갱신 — 소유 워커가 rebase·검증합니다”가 실행 절차의 정본입니다.

1. 앞 PR의 **실제 머지 상태**를 확인한 뒤 다음 PR의 head/base·최신 원격 base SHA·승인 head·소유 워커를 대조합니다. 이미 최신 base를 포함하고 검증이 유효하면 불필요한 rebase는 하지 않습니다. `CONFLICTING`이거나 base가 오래됐으면 코디네이터가 대신 코드를 만지지 않고 **해당 PR의 소유 워커**에게 갱신을 맡깁니다.
2. **PR별 rebase와 원격 히스토리 갱신 승인을 먼저 받습니다.** PR URL·head/base 리포와 ref·기존 head·대상 base SHA·예상 원격 head SHA·`--force-with-lease` 방식을 질문에 명시합니다. #71의 A+C 방향 승인이나 트래킹 이슈의 운영 승인은 개별 PR의 재작성·머지 권한이 아닙니다. 세션 직접 결정은 gh-loop Stage 0 9로 이슈·PR에 기록하고, 워커 재개는 §6의 cap·소유권·라벨 절차를 유지합니다.
3. 소유 워커는 **깨끗한 작업트리·원격 SHA·최신 base·원 AC/변경 범위**를 확인하고 승인된 base로 rebase합니다. gh-loop의 검증 4종(감사 로그의 기존 행·추가 행 보존과 끝 개행·모든 행 JSON 파싱, 원 작업 범위 대조, 발견된 명령과 실제 스모크, 새 head 리뷰·verifier)을 수행한 뒤에만 `git push --no-follow-tags --recurse-submodules=no --force-with-lease="refs/heads/$BRANCH:$EXPECTED_REMOTE_SHA" "$HEAD_PUSH_URL" "HEAD:refs/heads/$BRANCH"`로 갱신합니다. 목적지는 gh-loop 절차로 확인한 **단일 push URL**로 고정하며 URL 재작성 설정(`url.*.insteadOf`·`url.*.pushInsteadOf`) 부재와 PR의 head/base 리포·ref·SHA를 push 직전에 다시 대조합니다. 재작성 설정이 있거나 조회가 불명확하면 park하며 태그·서브모듈은 전송하지 않습니다. 예상 SHA는 비어 있지 않은 완전한 승인 값이고 자동 갱신하지 않습니다. 일반 `--force`나 예상 SHA 없는 lease는 금지합니다.
4. rebase·추가 커밋으로 **head가 바뀌면 기존 머지 승인은 재사용하지 않습니다.** 검증 근거와 PR 대상 리포·ref·새 head/base SHA·새 nonce로 별도 머지 승인을 요청하고 이슈·PR 양쪽을 `needs-decision`으로 바꾼 뒤 종료합니다. 답을 받은 뒤 gh-loop Stage 5의 권한자·nonce·acted 규칙을 거쳐, 머지 직전 대상 리포·ref·SHA를 다시 확인하고 승인된 방식의 `gh pr merge <pr> --merge --match-head-commit <approved-sha>`로 처리합니다. base ref가 바뀌면 SHA가 같아도 재승인하며, head 가드가 base까지 원자적으로 고정하지는 않습니다. 실패·불명확성은 새 질문으로 park하며 다음 PR로 자동 진행하지 않습니다.

`docs/harness/audit.jsonl`에만 적용하는 `merge=union`은 **로컬 순수 append 충돌 완화**이며 JSON·append-only·시간순서 보증이 아닙니다. 기존 로그 삭제·교체, 비JSON 행, 다른 파일 충돌은 중단·보고하고 정렬·덮어쓰기로 통과시키지 않습니다. GitHub가 이 속성으로 자동 해결한다고 가정하지 않습니다(#73~#76 실측). 소비 리포의 속성 적용은 gh-loop의 배포 범위를 따르며 `.gitattributes` 전체를 복사하거나 sync allowlist를 넓히지 않습니다.

## Observability

사용자는 GitHub 라벨·마일스톤 댓글·트래킹 이슈·PR로 진행을 보고, Orca 카드 코멘트로 현재 작업을 확인합니다. 정밀 디버그가 필요한 경우에만 해당 워커의 `terminal show/read`를 단발로 사용합니다. GitHub 결정 요청 뒤에는 턴을 끝내며 사용자가 `/gh-loop N` 또는 컨트롤러 재호출로 재개합니다.

## Reuse map

| 단계 | 자산 |
|---|---|
| assign/plan/scale 결정 | `.omp/extensions/harness/gh-loop-controller.mjs`(테스트됨) |
| 워커 루프 | `gh-loop` 스킬(per-issue) |
| 이슈 생성 dedup/throttle | `gh-loop-issue.mjs`(마일스톤 댓글 dedup은 §4 절차) |
| finding→이슈 소스 | `gh-loop-detect.mjs` |
| 워커 커밋 리뷰 | review-gate — 위험 변경에 2차 관점(이종 모델/휴먼 리뷰) 또는 감사된 override 강제 |
| 워커 substrate | Orca `worktree create --issue` + `terminal create/send`, gh-loop Stage 0의 R8·재개 규칙 |

## Scope / limits

- **로컬 온디맨드** 컨트롤러(이 박스). **24/7 상시응답**은 분리(robo-omp/cloud — WSL2 데스크톱은 상시서버 아님).
- **라이브 N워커 실주행**은 비용 N배 — 결정 로직은 테스트로 검증됨; 실제 다중 구동은 환경/예산 따라.
- 워커끼리 **직접 통신 안 함**(이슈 단위 분할이라 대부분 불요); fine 조정은 컨트롤러 경유.
- **audit 충돌은 A+C로 처리합니다.** [이슈 #71](https://github.com/rae-hugo-kim/omp/issues/71)의 승인에 따라 한 경로의 로컬 union과 §7의 순차 PR 절차를 사용합니다. 작업별 감사 파일 이주·과거 로그 재작성·추가 러너 기능·기존 PR 일괄 rebase/머지는 범위 밖입니다.

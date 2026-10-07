# OMP 15.11.x 업그레이드 사전 점검 노트

> 작성: 2026-06-11 · 기준: 설치본 `omp/15.10.12`, 릴리즈 `v15.11.0`, refusal 폴백 PR [can1357/oh-my-pi#2294](https://github.com/can1357/oh-my-pi/pull/2294) (미머지)
> 결정: **업그레이드는 refusal 폴백(#2290 수정)이 포함된 릴리즈가 나올 때 한 번에 진행.** 이 문서는 그 시점에 이 하네스에서 손볼 부분의 사전 감사 결과다.

## 실행 결과 (2026-06-16) — 16.0.1로 직접 업그레이드 (완료)

이 사전 점검 이후 OMP가 15.13.2까지 진행됐고 refusal 폴백 계열이 포함된 **16.0.x 메이저 릴리즈**가 나와, 단계적 15.11 계획을 건너뛰고 `omp update`로 **`omp/16.0.1`에 직접 업그레이드**했다.

- **16.0.0+16.0.1 breaking change ↔ 하네스 대조 결과: 확장/게이트 코드 무변경.** v16이 깬 표면 — settings `hooks`/`customTools`→단일 `extensions` 배열, `--hook`/`--tool`→`--extension`/`-e`, 디렉터리 `hooks/`·`tools/`→`extensions/`·`commands/`→`prompts/`, SDK 타입(`ToolCallFormat`→`DialectFormat`, `toolCallSyntax`→`dialect`, `additionalHookPaths`/`additionalCustomToolPaths`→`additionalExtensionPaths`), pi-tui `isXxx()`→`matchesKey` — 중 어느 것도 이 저장소를 건드리지 않는다. 저장소는 이미 `.omp/extensions/`를 쓰고, `index.ts`가 의존하는 API(`pi.on(...)`, `event.toolName/input/isError/details.exitCode`, `ctx.cwd/hasUI/ui.notify`, `{block,reason}` / `{message:{customType,content,display}}` 반환)는 전부 v16 `.d.ts`에 동일 형태로 존재한다. 제거·개명 API 사용 0건(저장소 전체 검색), 디스커버리 경로 `.omp/extensions/<name>/index.ts` 불변.
- **B-1 적용**: `.omp/agents/reviewer.md`의 flat `task()` 2곳 → batch 스키마(`context` 필수 + 16.0.1 신규 `role`). `task.batch`가 16.x 기본 on이라 기존 flat 예시는 모델이 보는 기본 스키마와 어긋나 있었다.
- **B-2 적용**: `task` 항상-비동기(논블로킹 job 배달)에 대응해 "스폰=완료 아님, verdict 수신 후에만 완료 선언" 문구를 `AGENTS.md`(Agent Routing Policy)·`rules/agent_routing.md`(+ idle/parked `irc` 운영 팁)·`rules/harness_integration_contract.md`(검증 레인)에 보강.
- **검증**: `node --test tests/*.test.mjs` 177/177 통과(`docs-drift` 무드리프트 포함). `omp/16.0.1` 신규 세션 부팅 → 확장 로드 + read-tracker 게이트 발동(`read-log.txt` 경로 기록) 확인.
- **버전/태그**: 메타 버전은 `harness/*` 태그 기준으로 산출되므로 수동 편집하지 않음. 이 변경이 main에 랜딩한 뒤 `scripts/harness-version-bump.sh`로 1회 발행(E-2), 이어서 파생 프로젝트는 `/skill:harness-check`로 전파(E-3).
- **D 적용 완료**: 전역 `~/.omp/agent/config.yml`에 `retry.fallbackChains.default: ["gpt-5.5"]` 설정(`omp config set`). #2290 fix가 **동일모델 재시도를 스킵**하므로 primary(`anthropic/claude-opus-4-8`)와 같은 모델은 폴백이 빈 체인이 된다 → prep 원안 `["anthropic/claude-opus-4-8"]`는 무효. Anthropic 분류기 refusal을 실제로 우회하려면 교차계열이 필요해 **`gpt-5.5`**(openai-codex, adversary 에이전트가 이미 사용) 선택. `fallbackRevertPolicy`는 기본 `cooldown-expiry` 유지, `modelFallback`은 기본 on. 검증: `omp/16.0.1` 부팅 시 `references unknown model` 경고 없음(셀렉터 유효). refusal 자체는 인위 재현 불가 → 사후 `retry_fallback_applied` 이벤트로 확인.

## 결론 요약

| 영역 | 판정 | 비고 |
|------|------|------|
| 게이트 확장/스크립트 (`.omp/extensions/harness/`) | **무변경** | 15.11 변경 표면과 접점 없음 (아래 A) |
| 게이트 테스트 (`tests/`) | **무변경** | node 직접 실행, OMP 런타임 무관 |
| 에이전트 정의 (`.omp/agents/reviewer.md`) | **갱신 필요** | flat `task()` 예시 → batch 스키마 (아래 B-1) |
| 위임 정책 문서 (AGENTS.md, rules/) | **문구 보강** | task 항상-비동기화에 따른 "결과 대기" 명시 (아래 B-2) |
| OMP 전역 설정 (`~/.omp/agent/`) | **추가 필요** | `retry.fallbackChains` — refusal 릴리즈 후 (아래 D) |

## A. 영향 없음 — 감사 근거

v15.11.0 breaking change를 하네스 전체에 대조한 결과. 각 항목은 검색/코드 확인 완료.

1. **확장 배선은 15.11 변경 표면 밖.** `.omp/extensions/harness/index.ts`가 쓰는 API는 `pi.on("tool_call"|"tool_result"|"before_agent_start"|"session_start")` + `event.input` / `event.details.exitCode` / `ctx.cwd`뿐. 15.11에서 깨진 것은 `task`/`irc` 도구 스키마, `pi-agent-core` compaction 배럴 re-export, `renderSnapcompactPng` 반환형 — 어느 것도 import하지 않음.
2. **bash 인라인 출력 ~50KB 하드캡 무영향.** 게이트는 bash *출력 텍스트를 읽지 않는다*. 실패 판정은 `bashRunFailed()`가 `event.isError` + `event.details.exitCode`(구조화 메타데이터)로만 수행하고(`index.ts:67-71`), backpressure 트래커에 넘기는 페이로드는 `tool_input: { command }`뿐(`index.ts:283-289`). 출력 엘리전이 와도 분류 불변.
3. **압축 요약 포맷 변경(`<read-files>`/`<modified-files>` → `<files>`) 무영향.** 요약 텍스트를 파싱하는 하네스 코드 없음 (저장소 전체 검색 0건).
4. **제거된 API 사용 없음.** `task` `resume` 옵션, per-call `schema`, `task.simple`, `irc.enabled`, `awaitReply`, eval `agent(prompt, context=…)` — 전부 참조 0건. (`rules/session_persistence.md`의 "resume"은 세션 재개 개념으로 무관.)
5. **`migrate`/`harness-check` 스킬 무영향.** 둘 다 이 템플릿 저장소의 `harness/*` 태그에 결합되어 있고 OMP 코어 버전과 독립.

## B. 업그레이드 시 함께 갱신할 파일 (소스 = 이 저장소, `harness/*` 태그로 전파)

### B-1. `.omp/agents/reviewer.md` — task 호출 예시 2곳 (29-34행, 42-47행)

현재 flat 형태를 문서화:

```
task({ agent: "adversary", assignment: "…" })
```

15.11에서 `task.batch`(기본 on)가 와이어 스키마를 batch-first로 교체한다: `{ agent, context, tasks: [{ id, description, assignment }] }`, **공유 `context` 필수**. 레거시 flat 호출은 호환 처리되어 *동작은 하지만*, 모델이 보는 도구 스키마와 에이전트 정의 속 예시가 어긋난다. 두 예시를 batch 형태로 갱신:

```
task({
  agent: "adversary",
  context: "Adversarial review of this repo's uncommitted changes.",
  tasks: [{ id: "AdversaryReview", description: "GPT adversary pass",
            assignment: "Adversarially review the uncommitted changes (git diff HEAD). …" }]
})
```

### B-2. 위임 서술에 "결과 수신까지 대기" 명시 — task 항상-비동기화 대응

15.11부터 `task`는 설정과 무관하게 **항상 백그라운드 스폰**이고 결과는 비동기 job 배달로 도착한다 (`async.enabled`은 bash만 게이트). 위험: 메인 에이전트가 verifier/reviewer job을 띄워놓고 **결과 수신 전에 완료를 선언**하는 것.

- `AGENTS.md` "Agent Routing Policy" — `verifier: MUST delegate before claiming task completion` 문구에 "**스폰만으로는 불충분 — job 결과(verdict) 수신 후에만 완료 선언**" 보강. 변경 시 `claudedocs/CLAUDEKR.md` 동기 또는 stale 마킹 (AGENTS.md Non-Negotiables).
- `rules/agent_routing.md`, `rules/harness_integration_contract.md`(22행, 69행, 87행) — 같은 취지 한 줄씩.
- (선택) idle/parked 라이프사이클 활용: 완료된 서브에이전트는 7분(기본 `task.agentIdleTtlMs`) 동안 idle로 살아있으므로, reviewer/verifier 후속 질의는 재스폰 대신 `irc`로 이어갈 수 있음 — `rules/agent_routing.md`에 운영 팁으로 추가.

### B-3. 확인만 (변경 불요 가능성 높음)

- `docs/architecture/workflow-lifecycle.md:146-148` — 3-pass 리뷰 흐름 서술은 개념 수준이라 스키마 비결합. 업그레이드 후 읽고 어긋나는 표현만 손본다.

## C. 기본값 변화 — 운영 인지 항목 (설정 변경은 선택)

| 항목 | 15.11 동작 | 우리 영향 |
|------|-----------|----------|
| `task.softRequestBudget` | explore/quick_task 40회, 기타 90회. 초과 시 wrap-up 지시, 1.5×에서 중단 | reviewer는 내부에서 adversary + code-reviewer를 중첩 스폰하는 3-pass라 가장 길다. **리뷰가 잘리는 게 관측되면 상향** |
| `task.agentIdleTtlMs` | 완료 서브에이전트 7분 idle 후 디스크 파킹, 메시지 시 부활 | 기본값 수용 |
| `compaction.supersedeReads` | 기본 on — 같은 파일 재읽기 시 이전 read 결과를 placeholder로 프루닝 | 게이트 무관(read-tracker는 경로만 기록). 에이전트 컨텍스트 동작 변화만 인지 |
| `irc` 재설계 | `send`/`wait`/`inbox`/`list`, send는 fire-and-forget | 하네스 비사용. B-2 운영 팁에만 등장 |
| TUI | `ctrl+s` = Agent Hub(옵저버 대체), 시작 중 입력 큐잉 제거 | 습관 변화만 |

## D. refusal 폴백 릴리즈 후 추가 설정 (`~/.omp/agent/` 전역 — 저장소 밖)

1. 릴리즈 노트에서 `fix(retry): fall back on Anthropic refusals` (#2294) 포함 확인 후 업그레이드.
2. 설정 추가 — #2294는 refusal을 `retry.fallbackChains` 경로로 라우팅하므로 체인이 비어 있으면 폴백할 곳이 없다:

   ```yaml
   retry:
     fallbackChains:
       default: ["anthropic/claude-opus-4-8"]
   ```

   `retry.fallbackRevertPolicy`는 기본값 유지 — refusal 트리거 폴백은 #2294가 자체적으로 대화에 핀 고정(cooldown 복원 제외).
3. 설정 검증: 세션 시작 시 `Fallback chain … references unknown model` 경고가 **안 뜨면** 셀렉터 유효 (`AgentSession#validateRetryFallbackChains`가 기동 시 검사). refusal 자체는 인위 재현이 어려우므로 사후에 `retry_fallback_applied` 이벤트로 확인.

## E. 권장 업그레이드 절차

1. #2294 포함 릴리즈 확인 → OMP 업그레이드.
2. 이 저장소에서 B-1·B-2 갱신 → `scripts/harness-version-bump.sh`로 `harness/*` 태그 발행.
3. 파생 프로젝트에서 `/skill:harness-check`로 전파.
4. 스모크 (새 OMP 위에서):
   - `node --test tests/` — 게이트 자체 회귀 (OMP 무관하지만 환경 확인 겸).
   - 미리드 파일 `edit` 시도 → context-gate **block** 확인.
   - `git commit` 시도 → commit-gates 발동 확인.
   - `task`로 verifier 1회 위임 → job 결과(verdict)가 메인 세션에 도착하는지 확인.
5. D 설정 적용.

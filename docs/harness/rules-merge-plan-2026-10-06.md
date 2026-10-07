# harness-* 규칙 병합 M1–M9 실행 명세 연구 (2026-10-06, 이슈 #86)

**결론**: 감사(PR #85, `docs/harness/rules-liveness-audit-2026-10-06.md` §6·§7)의 병합 제안 9건을 실제 본문으로 재대조한 결과, **9건 모두 병합이 맞지만 M1(`cost_awareness`)은 옮길 고유 내용이 2줄뿐**이라 감사가 "잃는 것"으로 꼽은 절(eval 비용 기재·병렬 호출)은 이미 타처에 있고, 실제로 옮길 것은 티어 승격 원칙(:18)과 재독 회피 SHOULD(:32) 두 문장이에요. **M2–M9는 병합 유지**예요. 감사의 `file:line` 인용 중 **23곳을 정정**했고(§4), 감사 §7.1이 빠뜨린 갱신 대상 **14곳을 보충**했어요(`claudedocs/CLAUDEKR.md` 미러, `README.md`·`README.en.md` 규칙 분류표, `index.ts:402` 주석 등). 실행은 **#87(점수 처분)의 결론이 나온 뒤** 5개 PR로 나누어 순차 처리하는 안을 §7에 번호 붙여 두었어요 — 점수 처분에 따라 코드 커밋(`scripts/harness-audit.sh` 재배치)의 유무만 달라지고 문서 측 작업은 같아요.

- 대상: 연구 기준 커밋 `e3563c3`(main, PR #85 머지 직후 — 이 문서의 모든 `file:line`은 이 커밋 기준이고, 이 브랜치의 커밋은 `docs/harness/` 아래만 바꿔요)의 `.omp/rules/harness-*.md` 29편 중 병합 쌍 17편을 봤어요. 규칙 파일·스크립트·게이트는 한 줄도 바꾸지 않았어요(`git diff --stat main -- .omp/rules scripts .omp/extensions` 비어 있음).
- 방법: 그룹 A(M5·M6)·B1(M1·M2)·B2(M3·M4)·C(M7·M8·M9)로 나눠 읽기 전용 scout 4개가 절 단위로 대조했고(`read`/`grep -n` 실측 줄 번호), 줄 수·줄끝(`wc -l`, `file`)과 핵심 인용은 워커가 직접 재실행해 확인했어요(§9 재현).
- 실측 시각은 2026-10-06 09:20~10:40 UTC예요.

## 1. 요약표

| # | 흡수 규칙 (줄 수·줄끝) | 모체 (줄 수·줄끝) | 판정 | 옮기는 고유 내용 | 모체 예상 줄 수 | `description` | 점수 영향 (`harness-audit.sh`) |
|---|---|---|---|---|---|---|---|
| M1 | `cost_awareness` (39, CRLF) | `agent_routing` (56, LF) + `session_persistence`(SHOULD 소절 2줄, M3 뒤) | 병합(MUST 1줄 + SHOULD 소절) — 폐기는 D1 선택지 | 티어 승격 MUST(:10+:18) 1줄, 재독 회피 SHOULD(:30+:32) 소절; 나머지는 타처 보유·stale | 57 | 불변 | `:321-325` cost_efficiency **+3 소실** |
| M2 | `information_discovery` (36, LF) | `anti_hallucination` (46, CRLF) | 병합 | 경로 vs 클래스 판별(:12-17), 3단 스윕(:23-25), 위임 1줄 | ≈58 | 교체(106 B) | 없음 |
| M3 | `context_management` (127, CRLF) | `session_persistence` (89, CRLF) | 병합 | 시점 표(:14-26), 보존 MUST(:30-39), 드롭 목록(:43-54, 감사 누락), front-loading(:73) | ≈128 (M1 소절 포함) | 교체(99 B) | `:162-166` +3, `:333-337` +2 **소실(5)** |
| M4 | `learning_policy` (44, CRLF) | `assetization` (61, LF) | 병합 | 4기준(:21-24), 트리거 3종(:14-16), 금지 축약(:36,:38), 저장지 1줄 | ≈74 | 교체(103 B) | 없음 |
| M5 | `quality_gates` (98, CRLF) | `verification_tests_and_evals` (168, LF) | 병합 | 게이트 정의 표(:8-21), 트리거 표(:41-48), 억제 조건(:64-66), Self-Check 1항 | ≈193 (M5만) | 교체 | `:207-211` quality_gates **+1 소실** |
| M6 | `tdd_policy` (77, CRLF) | `verification_tests_and_evals` | 병합 | TDD MUST 요지(:6-8), 커버리지(:32-36), 생략 전 승인(:77) | ≈202 (M5+M6) | 교체(103 B, 합산) | 없음 |
| M7 | `documentation_policy` (41, CRLF) | `writing_style` (98, LF) | 병합 | 한/영 독자 분리(:12-13), UTF-8 NO-BOM(:27) — 약 4줄 | ≈104 | 교체 권고(98 B) | 없음 |
| M8 | `hook_recipes` (141, LF) | `harness_integration_contract` (198, LF) | 병합 | 이벤트 표(:16-25), 페이로드 필드(:27-38 축약), fail-open 단서(:137) — 약 10줄 | ≈210 | 불변(이미 122 B) | 없음 |
| M9 | `agent_security` (110, CRLF) | `safety_security` (30, CRLF) | 병합 | MUST 3개(:14-48), SHOULD 3개(:52-84), OWASP 표(:88-98), Self-Check(:102-110) — 전부 **그대로**(축약 없음) | ≈125 | 교체(104 B) | `:293-297` security_guardrails **+2 소실** |

합계: 29편 → **20편**(9편 감소 — 감사 §7.1과 같은 수). 존재 점수 소실은 네 블록 **11점**(M1 3 · M3 5 · M5 1 · M9 2)이고, 현재 `bash scripts/harness-audit.sh --terse` → `TOTAL: 51/70`이에요(§6). `description` 바이트 수는 `printf %s | wc -c` 실측이에요. **규칙집 예산**: ADR 002 `:89`는 "규칙집 설명은 평균 114 B/행을 상한으로 유지한다"고 적었고, 그 행은 `alwaysApply`인 `harness-core`를 뺀 B칸 28편의 `이름 (): 설명` 한 줄(28행 3,192 B)이에요 — 개별 `description` 바이트와 직접 비교하는 값이 아니에요. 같은 형식으로 재면(§9) 현재 **28행 3,192 B(평균 114.00 B)**로 ADR 실측과 정확히 일치하고, 9편을 빼면 설명을 **하나도 바꾸지 않아도 19행 2,228 B(평균 117.26 B)**, 모체 6편의 설명을 위 제안으로 바꾸면 **19행 2,335 B(평균 122.89 B)**예요. 총량은 **−857~−964 B/요청**으로 줄지만(감사 §7.1 "약 1.0 KB" 추정과 같은 방향) **행 평균은 어느 경우든 상한을 넘어요** — 빠지는 9편의 행이 평균보다 짧기 때문에, 행 평균 지표는 짧은 규칙을 지우는 정리를 오히려 벌점으로 세요. 19행을 114 B 평균에 맞추려면 설명 합계를 2,166 B 이하로 줄여야 하고(현행 대비 −62 B, 제안 대비 −169 B), 이것은 실행 PR의 결정 사항이에요(§7 D7).

## 2. 연구 1·2 — M1–M9 이동표·손실·폐기 판정

줄 번호는 모두 이 워크트리의 `grep -n`/`read` 실측값이에요. 감사 §6·§7.1의 인용과 다른 곳은 §4에 모아 정정했어요. "모체 목표 위치"는 **현재** 모체 줄 번호이고, 같은 모체에 두 번 넣는 경우(M5·M6, M3 뒤 M4·M8)는 §7의 순서 의존을 따라요.

### M1. `harness-cost_awareness` → `harness-agent_routing` (+ `session_persistence` SHOULD 소절) — 병합(MUST 1줄 + SHOULD 소절)

| 흡수 규칙 절 (file:line) | 판정 | 모체 목표 위치 | 옮길 형태 · 근거 |
|---|---|---|---|
| ECC 주석 `~/.omp/metrics/costs.jsonl`·벤더 단가 (`:6-8`) | stale → 폐기 | — | 생성 코드 0건: `grep -rn "costs\.jsonl\|metrics/costs\|cost-tracker" .` → 이 파일 :6,8과 감사 :341뿐 |
| 정적 티어 표 본문 Haiku/Sonnet/Opus (`:12-16`; `:10` 제목의 규범은 아래 행으로) | 겹침 → 폐기 | — | 벤더명 고정 표는 `harness-agent_routing.md:41-43`(롤 체계 `@advisor`/`@slow`/`modelRoles.*`), `.omp/extensions/harness/gh-loop-record.mjs:33-34`(`TIERS`)·`:105-115`(`recommendTier` 규칙표)가 대체하고, `agent_routing:43`이 "기준은 `estimate-report.mjs` 실측으로 갱신"이라 정적 표를 두지 않아요 |
| **티어 승격 MUST** (`:10` `## MUST: model selection — use the cheapest model that can do the job` + `:18` "Escalate to a higher tier only when the lower tier demonstrably cannot handle the task.") | **고유 → 옮김 1줄(MUST 표지 유지)** | `harness-agent_routing.md:43` 뒤 | `- **MUST**: Use the cheapest tier that can do the job; escalate to a higher tier only when the lower tier demonstrably cannot handle the task.` — `:10` 제목의 MUST 강도를 불릿 접두로 보존해요(리뷰 r2 지적). `grep -rniE "cheapest|lower tier|escalat|lowest tier"` → `agent_routing`·`gh-loop-record.mjs`에 0건이라 일반 원칙은 이 줄뿐이에요. `gh-loop-record.mjs:4`의 "사용자가 매번 고른다"는 **선택 주체**에 관한 결정이고 이 줄은 **권고 기준**이라 충돌하지 않아요(리뷰 r1 지적으로 정정) |
| SHOULD eval 토큰·비용 기재 (`:20-23`) | 겹침 → 폐기 | — | 동일 문장 `harness-verification_tests_and_evals.md:163` "Do not ignore cost per eval run — track tokens and estimated cost."; `templates/eval_report.md:45-50` `## Cost`(토큰·USD); `templates/session_retro.md:32-35` `## Cost/efficiency notes` |
| SHOULD 병렬 호출 (`:25-28`) | 폐기 | — | 리포 규칙·스킬·에이전트에 0건; omp 런타임 시스템 프롬프트 Tool Policy("parallelize independent calls")가 매 세션 주입 — [INFERENCE] 이 세션 프롬프트로만 관측 |
| **재독 회피 SHOULD** (`:30` `## SHOULD: avoid re-reading files already in context` + `:32` "If a file was read earlier in the session, use that content rather than re-reading.") | **고유 → 옮김 소절 2줄(SHOULD 표지 유지)** | `harness-session_persistence.md`의 M3 `### Safe to drop` 블록 **뒤에 별도 소절** `### SHOULD: avoid re-reading files already in context`(M3 뒤) | 제목 1줄 + `:32` 원문 1줄. `Safe to drop`의 `context_management:47` "the path is sufficient; re-read if needed"는 **버릴 수 있는 것**의 목록이라 조건이 다르므로 같은 블록에 섞지 않고 소절로 분리해요(리뷰 r2 지적) |
| SHOULD 큰 출력 요약 (`:33`) | 겹침 → 폐기 | — | `harness-context_management.md:49` "Verbose command output (keep the summary…)"(M3로 모체에 남음) |
| Self-Check 3항 (`:35-39`) | 폐기 | — | `:37`은 표에, `:38`은 옮긴 재독 SHOULD 소절에, `:39`는 폐기된 병렬 절에 종속돼요 |

- **손실 목록**: `:6-8`(stale), `:12-16`(정적 티어 표 본문 — 롤 체계·규칙표가 대체; `:10` 제목의 "cheapest model" 규범은 `:18`과 함께 MUST 불릿으로 보존), `:20-23`(3곳 보유), `:25-28`(런타임 보유), `:33`(모체 보유), `:35-39`. 감사 §6 B "잃는 것: eval 비용 기재(:20-23), 병렬 SHOULD(:25-28)"는 둘 다 타처 보유라 **정정**이고, 감사가 겹침으로 본 `:18`·`:32`는 반대로 **고유**예요.
- **폐기 판정**: 이름 인용은 `.omp/skills/**`·`.omp/agents/*`·`checklists/`·`templates/`·게이트 코드 모두 0건. 옮길 고유 문장이 2줄이라 **병합(2줄)**이 맞고, 폐기(D1)는 그 2줄을 의도적으로 버리는 결정이에요 — 감사 §7.2의 "모두 고유 절이 있다"는 전제는 이 규칙에서도 2줄만큼은 성립해요.
- **모체 영향**: `agent_routing` 56 → 57(MUST 불릿 1줄). `description` 불변(이미 "model and effort tiers" 포함). `session_persistence`는 M3 합계에 +2(소절). 감사 §6 "재독 회피는 context-gate/read-tracker가 기계 집행"은 **정정** — 두 게이트는 편집 전 읽기만 강제하고 재독을 막지 않아요(`gates/context-gate.mjs:48-51`, `gates/write-tracker.mjs:10`만 자기 쓰기 재독 제거).
- **갱신 대상**: `AGENTS.md:157`(Operational rails), `claudedocs/CLAUDEKR.md:157`(보충), `README.md:224`·`README.en.md:221`(규칙 분류표 "운영"/"Ops" 행 — 보충), `scripts/harness-audit.sh:321-325`(§6).

### M2. `harness-information_discovery` → `harness-anti_hallucination` — 병합

| 흡수 규칙 절 | 판정 | 모체 목표 위치 | 옮길 형태 |
|---|---|---|---|
| 제목·twin 선언 (`:4-6`) | 겹침 → 폐기 | — | "information artifacts" 정의 한 구절만 새 절 도입문에 |
| MUST narrow guess 금지 (`:8-10`) | 겹침 → 축약 1줄 | 새 절 도입문 | `harness-core.md:9` 후반("없다는 결론은 넓게 검색한 뒤에만")이 요지 |
| **경로 vs 클래스 판별** (`:12-17`) | **고유 → 옮김** | `anti_hallucination.md:14`(`## MUST: do not guess` 끝) 뒤, `:16` 앞에 새 절 `## MUST: search broadly before concluding an artifact is absent` | 불릿 2개(:14-15) + 실패 양상 1줄(:17) 그대로 |
| **3단 스윕 순서** (`:19-26`) | **고유 → 옮김**(:23-25); :26은 모체 Exception Protocol(`:34-40`, `:38` "State what you checked")과 겹쳐 1구절로 | 새 절 둘째 블록 | 번호 목록 3단계 그대로; `:24` 규약 디렉터리에서 **`claudedocs/` 제거** |
| 위임 (`:28-30`) | stale → 축약 1줄 | 새 절 끝 | `Explore` → `scout`(`.omp/agents/`에 Explore 없음, `agent_routing.md:19,52`가 scout로 확정) |
| Self-Check (`:32-36`) | 1항 축약 | `anti_hallucination.md:44` 뒤 | "Before claiming no X exists, did I sweep (grep + convention dirs) and state what I searched?" |

- **손실**: `:6` twin 선언(역링크 0건 — `harness-repo_command_discovery.md`에 `information_discovery` 0), `:10` 비유, `:24` `claudedocs/`(소스 리포 전용 — `AGENTS.md:120` "Consumer repos have no such mirror", 부재가 아니라 **비동기 경로**라 빼는 것 — 감사 사유 정정), `:26` 링크, `:36` 중복 Self-Check.
- **폐기 판정**: 판별·스윕 절차는 `grep -rin "breadth|넓게 검색|convention dir|sweep|false negative"` → 이 파일과 `harness-core.md:9`뿐. **병합 유지** — `harness-core.md:9`가 이미 `rule://harness-anti_hallucination`을 가리켜 모체에 넣으면 상시 포인터를 타요.
- **모체 영향**: 46 → ≈58. `description` 교체 제안(106 B): `"No guessing: find evidence or ask; search broadly before calling an artifact absent; cite paths and output"`. 모체가 CRLF라 LF로 통일. 부수: `anti_hallucination.md:23`의 `librarian` 에이전트는 `.omp/agents/`에 없어요(범위 밖, 보고만).
- **갱신 대상**: `AGENTS.md:153`, `claudedocs/CLAUDEKR.md:153`(보충). `README.md:219`·`README.en.md:216` 분류표는 `information_discovery`를 넣지 않아 해당 없음. `harness-core.md:9` 불변.

### M3. `harness-context_management` → `harness-session_persistence` — 병합

| 흡수 규칙 절 | 판정 | 모체 목표 위치 | 옮길 형태 |
|---|---|---|---|
| ECC 주석 (`:6`), Purpose (`:8-10`) | 겹침 → 모체 `:6`의 "Complements harness-context_management.md…" 구절 삭제, `:10` 둘째 문장을 "This file governs when to compact, what to preserve, and how/where to persist it."로 | 모체 `:6,:10` 제자리 | 축약 |
| **Phase Transitions 표** (`:14-26`; 표 :18-24, SHOULD :26) | **고유 → 옮김** — `index.ts:400-402`·`tests/cycle-boundary-wiring.test.mjs:7-8`이 `:24` "mid-implementation은 끊지 말라"를 주석으로 인용 | 모체 `:12`(`---`) 뒤, `:14 ## Persistence channels` 앞 새 절 `## When to compact (phase boundaries)` | 13줄 그대로 |
| **What to Preserve (MUST)** (`:30-39`) | **고유 → 옮김** | 위 절 아래 `## What to preserve before compacting (MUST)` | 10줄; `:32` "a file, a notepad, or a `<remember>` tag" → "one of the persistence channels below (sum summary, auto-memory)" |
| **What Can Be Safely Dropped** (`:43-54`) — **감사 §6·§7.1 누락** | 고유 → 옮김(축약 7줄) | MUST 절 끝 `### Safe to drop` | 축약 |
| `<remember>` tags (`:58-69`) | stale → 축약 1줄 — `grep '<remember'` 리포 전체 → 이 파일뿐; OMP 채널은 모체 `:20` auto-memory | 모체 `:20` 뒤 | "Session-critical facts not captured in a file go to auto-memory; progress state belongs in the todo list, not memory." |
| Front-loading (`:71-73`) | 고유 → 축약 1줄 | MUST 절 끝 | `:73` |
| Notepad persistence (`:75-85`) — 감사 "옮길 것" → **정정: 폐기** | 폐기 | — | `.omp/notepads/` 부재; 모체 `:16` "Do **not** hand-author ad-hoc session-state files", `:22` "fold … into the `sum` summary — not a separate file"와 정면 모순 |
| Startup Context Budget (`:89-91`), `~/.claude/scripts` (`:93-113`) — 감사 `:90-114` → **:89-114** | 폐기 | — | 스크립트는 이 머신에 실존하나 `:103` 주석이 "`mcp` toggles `~/.claude.json`, which OMP does **not** read"로 자기 무효화, `:100` 기본값 `context7`은 2026-08-26 폐기 |
| Self-Check (`:117-127`) — 감사 `:117-124` → **정정** | 축약 2줄(`:121`, `:125`); `:122-124`는 모체 `:87-88`과 겹침 | 모체 `:83-89`(감사 `:85-89` 정정) `:87` 앞 | 축약 |

- **손실**: `:62-67` `<remember>`/`priority` 구문, `:75-85` notepad, `:89-91`, `:93-113`, `:122-124`, `:6`.
- **폐기 판정**: 시점 표·보존 MUST·드롭 목록은 `.omp/skills/sum/SKILL.md`(컴팩션·보존 목록 없음 — `:4`, `:236`뿐)·`docs/architecture/harness-architecture.md:285-289`(파일 보존만)에 없어요. **병합 유지** — 폐기하면 `index.ts:402`·`cycle-boundary-wiring.test.mjs:8` 주석이 가리키는 규칙이 사라져요.
- **모체 영향**: 89 + ≈38 − 1(`:77` 삭제) + 2(M1 재독 SHOULD 소절) ≈ **128**. `description` 교체 제안(99 B): `"When to compact, what must survive, and where session state persists across compaction and sessions"`. 초점 HOW/WHERE → WHEN/WHAT+HOW/WHERE. 자기 정의 3곳(`:6,:10,:77`) 모두 삭제. 모체 stale `.omp/contexts/*` 절은 **`:47-71`**(감사 `:52-70` 정정; `glob .omp/contexts/**` 부재) — 삽입 절과 충돌 없이 아래로 밀리고, 삭제 여부는 범위 결정(§7 D6).
- **갱신 대상**: `AGENTS.md:157`, `claudedocs/CLAUDEKR.md:157`(보충), `README.md:224`·`README.en.md:221`(보충), `.omp/rules/harness-session_persistence.md:6,10,77`, `.omp/rules/harness-cycle_definition.md:189`, `.omp/extensions/harness/index.ts:402`(주석 — 보충), `.omp/extensions/harness/tests/cycle-boundary-wiring.test.mjs:8`(주석 — 보충), `scripts/harness-audit.sh:162-166,333-337`(§6; 감사 `:162-165,333-336` 블록 정정).
- **순서 반례**: 감사 `:369` "M4·M8은 M3 뒤에 해도 `session_persistence:78-79` 유지"는 **틀려요**. M3가 `:77`을 지우는 것만으로 `:78→:77`, `:79→:78`이고, 새 절이 `:14` 앞에 들어가면 Relationship 절(`:75`)이 약 `:110`으로 밀려요. M4·M8의 모체 갱신 대상은 줄 번호가 아니라 불릿 텍스트(`- **\`harness-learning_policy.md\`**: …`, `- **\`harness-hook_recipes.md\`**: …`)로 특정하고 M3 뒤 `grep -n 'harness-learning_policy\|harness-hook_recipes' .omp/rules/harness-session_persistence.md`로 재측정해요.

### M4. `harness-learning_policy` → `harness-assetization` — 병합

| 흡수 규칙 절 | 판정 | 모체 목표 위치 | 옮길 형태 |
|---|---|---|---|
| ECC 주석 (`:6-10`) | 폐기(instinct 시스템 없음) | — | — |
| 캡처 트리거 (`:12-17`) — 감사 "↔ `assetization:48-53`" → **정정: 1/4만 겹침** | 부분 고유 → 축약 4줄(`:14-16` 비자명 root cause·가정 뒤집는 패턴·사용자 교정; `:17` 반복 실수는 모체 `:48-50`과 동일) | 모체 `:50` 앞 | 축약 |
| **4기준 Atomic/Evidence-based/Domain-tagged/Actionable** (`:19-24`) | **고유 → 옮김** — `grep 'Atomic|Evidence-based|Domain-tagged|Actionable'` 이 파일 외 0건; `templates/retro.md:26`가 "See … harness-learning_policy.md for criteria"로 외부 참조, `:28` `[domain-tag]` 서식 의존 | 모체 `:53` 뒤 `### Learning criteria` | 4 불릿 그대로 |
| 저장 티어 (`:26-32`) | `:30` 겹침(AGENTS.md:183, `templates/INDEX.md:10`), **`:31` `MEMORY.md` stale 폐기**(`glob **/MEMORY.md` 0건; `session_persistence:20` "Cross-session facts → auto-memory"와 모순), `:32` 겹침(모체 `:41-46,:53`) | 모체 `:53` 불릿 확장 | 1줄: "Where it lands: one-off → `templates/session_retro.md`; cross-session fact → auto-memory (see `harness-session_persistence.md`); recurring → rule/checklist item." |
| 금지 3종 (`:34-38`) — 감사 "`:38` ↔ `documentation_policy:35`" → **정정: 겹치지 않음**(`:35`는 latest-only지 "중복이면 링크"가 아님) | `:36`·`:38` 고유 → 축약 1줄; `:37` Unverified는 `:22`의 대우라 폐기 | Learning criteria 아래 | "Do not record vague (\"be more careful\") or duplicate (already in docs — link instead) learnings." |
| Self-Check (`:40-44`) | 폐기(기준 재서술) | — | — |

- **손실**: `:6-10`, `:17`, `:31`, `:37`, `:40-44`.
- **폐기 판정**: **병합 유지** — 폐기하면 `templates/retro.md:26` 주석이 공중에 떠요.
- **모체 영향**: 61 + ≈14 ≈ **74**(LF). `description` 교체 제안(103 B): `"Record spec, decisions, retro and atomic learnings for non-trivial changes (spec -> implement -> retro)"`. retro 절이 2줄 → ≈16줄.
- **갱신 대상**: `AGENTS.md:157`, `claudedocs/CLAUDEKR.md:157`(보충), `README.md:224`·`README.en.md:221`(보충), `templates/retro.md:26`, `.omp/rules/harness-session_persistence.md:78`(M3 뒤 재측정), `.omp/extensions/harness/tests/risk-assess.test.mjs:54`(문자열 픽스처 — §6, 선택).

### M5. `harness-quality_gates` → `harness-verification_tests_and_evals` — 병합

| 흡수 규칙 절 | 판정 | 모체 목표 위치 | 옮길 형태 |
|---|---|---|---|
| 훅 주석 `quality-gate.js` (`:6`), Relationship to Automated Hooks (`:70-78`) | stale → 폐기 | — | `quality-gate.js`는 `.omp/extensions/harness/**`·`scripts/`·`.githooks/`에 없음(`grep -rn "quality-gate"` → 이 파일 :6,72와 `checklists/quality_gate.md:33`뿐) |
| **Gate Definitions 표** (`:8-21`; 표 :12-19, 선언 :21) | **고유 → 옮김** — FORMAT/TYPECHECK 토큰 정의는 이 파일뿐(`checklists/quality_gate.md:7-18`은 이름을 **사용**만) | 모체 `:91`(smallest-gate SHOULD 끝) 뒤, `:93 ## Guidance: tests vs evals` 앞 새 절 `## Named gates and trigger levels` | 표 8줄 + 선언 1줄 |
| Gate Discovery (`:25-37`) — 감사 `:26-36` → **정정** | 겹침 → 폐기(포인터 1줄) | — | `harness-repo_command_discovery.md:6-20`(순서), `:31-34`(없을 때), `harness-core.md:9`, `AGENTS.md:117` |
| **트리거 표** (`:41-48`; 감사 `:42-48` 정정) + EVAL 조건 (`:50`) | 표 **고유 → 옮김**; `:50`은 모체 `:99-107`(감사 `verification:92-100` → **정정**)과 동일 집합이라 참조 1줄 | 새 절 안 | 표 6줄 + "EVAL 적용 조건은 아래 MUST 참조" |
| Gate Failure Protocol (`:54-62`) — 감사 미언급 | 겹침 → 폐기(모체 `:131-137`, `checklists/quality_gate.md:25-26`); 4단계 "tool broken이면 skipped 명시" 1구절은 모체 `:137`에 괄호 보강 가능 | — | — |
| **억제 주석 금지 조건** (`:64-66`; 감사 `:63-66` 정정) | **고유 → 옮김** — `eslint-disable|noqa|ts-ignore` 조건부 금지는 다른 규칙·에이전트·스킬에 없음 | 새 절 안, 트리거 표 뒤 | 3줄 + "fix the root cause, never suppress to pass" 1줄 |
| fastest-gate-first (`:82-86`; 감사 `:84-88` 정정) | 겹침(3중: 모체 `:88-91`, `repo_command_discovery:22-29`) → 폐기 | — | — |
| Adversarial Verification Gates (`:90-92`) — 감사 미언급 | 겹침 → 새 절 끝에 `harness-adversarial_review.md` 링크 1줄 | — | — |
| Self-Check (`:94-98`) | `:97-98` 축약 1항 | 모체 `:165-168` 끝 | "Did I run the gates required for this trigger level and fix (not suppress) failures?" |

- **손실**: `:6,:70-78`(부재 훅 전제), `:35-37`(AGENTS.md 힌트·`biome.json`·"gate unavailable" — `repo_command_discovery:12-20,31-34`가 취지 보유), `:62` "Do not batch failures", `:84-86` 게이트별 순서, `:50`(모체가 5종으로 더 넓음).
- **폐기 판정**: **병합 유지** — 폐기하면 `checklists/quality_gate.md:3` "see … for the trigger table"과 6 게이트 이름이 고아가 돼요. 감사 §6 A "`checklists/quality_gate.md`가 전체를 복제"는 **정정**: 발견·게이트·실패 처리 체크박스만 복제고 트리거 표·억제 **조건절**은 복제돼 있지 않아요.
- **갱신 대상**: `AGENTS.md:154`, `claudedocs/CLAUDEKR.md:154`(보충), `README.md:220`·`README.en.md:217`(보충), `checklists/quality_gate.md:3`(+`:33` stale 노트 선택), `.omp/rules/harness-adversarial_review.md:11`, `scripts/harness-audit.sh:207-211`(§6; 감사 `:207-210` 블록 정정). `.omp/skills/harness-check/SKILL.md:93`·`harness-audit.sh:16,79,85,182-218,350,356`의 `quality_gates`는 **점수 범주 이름**이라 불변.

### M6. `harness-tdd_policy` → `harness-verification_tests_and_evals` — 병합

| 흡수 규칙 절 | 판정 | 모체 목표 위치 | 옮길 형태 |
|---|---|---|---|
| **MUST: TDD for implementation** (`:6-8`) — 감사 미언급 | **고유(규칙 층)** — `grep "TDD|test-first"` in `AGENTS.md`·모체·`coding_standards`·`adversarial_review`·`.omp/agents` 0건; 이웃은 `harness-change_control.md:43-46` "SHOULD: method guidance (TDD / Tidy First) is situational"뿐 | 모체 `:27`(검증 산출물 MUST 셋째 불릿) 뒤, `:29` 앞 `### Test-first default (RED → GREEN → TIDY)` | 축약 3줄 + `.omp/skills/startdev/references/tdd_rules.md` 포인터 |
| Cycle RED/GREEN/TIDY (`:10-30`) | 겹침 → 폐기 | — | `tdd_rules.md:3-80`(감사 `:3-75` 정정; 파일 112줄, `:82-111` 무결성 체크·위반표 추가 보유); "무관한 변경 금지"는 정확히 `:21,:27-28` ↔ `harness-core.md:12`·`change_control:8-19` |
| **Coverage 80–100%** (`:32-36`; 감사 `:33-36` 정정) | **고유 → 옮김** — 수치 목표는 이 파일뿐(`code_review_policy:28,106`은 정성 "adequacy") | 모체 `:131-137 ### MUST: record what you verified` 불릿 뒤 | 1-2줄; `:35` 레거시 이름 `repo_command_discovery` → `rule://harness-repo_command_discovery`(감사 §8 :393) |
| E2E Test Checklist (`:38-70`; 감사 `:40-70` 정정) | 고유 → **폐기** | — | `glob **/e2e_*`(gitignore 무시) 0건, 참조 0건(`grep "e2e_<feature>|checklists/e2e_|E2E Checklist"` → 이 파일 :42,46뿐) — 감사 확인 |
| Exception Protocol (`:72-77`) | 1단계(`:75`)·2단계(`:76`) 겹침(`AGENTS.md:129-131`, `change_control:46`, 모체 `:27`); **3단계 `:77` "Get explicit approval before proceeding without TDD" 고유 → 옮김** | `### Test-first default` 끝 | 1줄: "Skipping test-first on code logic needs the user's explicit approval after stating why and naming the alternative artifact." |

- **손실**: `:38-70`(27줄), `:10-30`(스킬이 상세판), `:75-76`, `:35` 레거시 이름.
- **폐기 판정**: **병합 유지** — 폐기하면 규칙집의 TDD 지위가 `change_control:43`의 situational SHOULD로 내려가고 커버리지·승인 조항이 리포에서 사라져요. 폐기를 택하면 "TDD는 `startdev` 스킬 층에서만 강제한다"를 결정 로그에 남겨야 해요.
- **규칙 간 모순(결정 필요, §7 D2)**: `tdd_policy:6` MUST ↔ `change_control:43-46` situational SHOULD. 병합 문구를 "코드 로직 변경에 테스트 인프라가 있으면 test-first가 기본(default); 생략은 명시 승인"으로 쓰면 `change_control:45-46` 조건절과 정합돼요. 모체 `:13` "Architect verification"(stale, 감사 §8)과 혼동되지 않게 "승인자 = 사용자"를 명시해요.
- **갱신 대상**: `AGENTS.md:111`(Core Principles 4 "→ Detail"), `AGENTS.md:154`, `claudedocs/CLAUDEKR.md:112,154`(보충), `README.md:220`·`README.en.md:217`(보충), `EXAMPLES.md:140`(Related rules 링크 — 감사 미기재), `.omp/extensions/harness/tests/risk-assess.test.mjs:56,119,238,418,422`(§6 — 합성 픽스처라 **깨지지 않음**, 교체는 선택; `:63`·`:159-160`의 `rules/tdd_policy.MD`는 대소문자 무시 합성 픽스처라 유지, `:159-160`은 감사 누락 보충).

**M5+M6 합산 모체**: 168 + 24 + 1 + 8 + 1 ≈ **202줄**(모체 `:6-15` stale 절을 2줄로 교정하면 ≈194). 최종 절 순서: `:6-15` Global enforcement → `:19-27` 산출물 MUST → **[M6] Test-first default** → `:29-45` Goal Transformation → `:47-86` Docs-only → `:88-91` smallest gate → **[M5] Named gates and trigger levels** → `:93-109` evals → `:131-137` record(**[M6] 커버리지 불릿**) → `:165-168` Self-Check(**[M5] 1항**). `description` 제안(103 B): `"Verification artifacts: tests, evals, gate names/triggers, TDD default, docs-only path, evidence format"`. 흡수 두 파일의 stale(부재 훅 전제)과 모체 `:6-15` stale(oh-my-claudecode 전제, "acceptance-gate: Blocks completion claims" — 실제는 커밋 차단, `acceptance-gate.mjs:2-3`)은 같은 종류라 한 커밋에서 정리하는 것이 자연스럽지만 모체 본문 교정은 별도 AC(§7 D6).

### M7. `harness-documentation_policy` → `harness-writing_style` — 병합

| 흡수 규칙 절 | 판정 | 모체 목표 위치 | 옮길 형태 |
|---|---|---|---|
| 제목·"Optional Module" 서문 (`:4-6`) | 폐기 | — | — |
| **한/영 독자 분리 SHOULD** (`:8-14`; 고유 `:12-13`, `:14` 코드 주석 영어는 `harness-core.md:5`와 겹침) | **고유 → 옮김** | `writing_style:85`(R8 마지막 불릿) 뒤, `:87 ## Self-check` 앞 `### R9. 언어 선택 — 독자별 한/영 분리` 신설 | 축약 3줄(불릿 2 + "코드 주석은 `rule://harness-core` 언어 줄" 1) |
| MUST 이모지 금지 "(if adopted)" (`:16-18`) | 겹침 → `writing_style:51-52` R6 제자리 수정 | `:51-52` | 조건부 MUST → 무조건 MUST로 올라가는 셈(§7 D3) |
| README vs INDEX (`:20-23`) — 감사 "↔ `AGENTS.md:7-11`" → **정정: 겹치지 않음**(Navigation 목록일 뿐 역할 분리 문장 없음) | 고유 → 폐기(인용 0건, 관행은 `INDEX.md:3-4`·`README.md` 실존으로 자명) | — | 원하면 R9에 1줄 |
| Encoding (`:25-29`) — UTF-8 NO-BOM **`:27`**(감사 `:26` 정정), `.ps1` 예외 **`:28`**(감사 `:27` 정정) | `:27` 고유 → 옮김 1줄; `:28` stale 폐기(`glob **/*.ps1` 0건); `:29` 근거 폐기 | R9 불릿 | "문서는 UTF-8 NO-BOM" — 게이트는 BOM 허용(`acceptance-gate.mjs:192,199` `stripBom`)이라 선언만 |
| latest-only (`:31-37`) — 감사 "잃는 것 :33-37" → **정정: 고유는 `:35` 1줄** | 폐기 — `:36` ↔ `assetization:38-42`, `:37` ↔ `mcp_policy:104,114` 관행, "optional/if adopted" 채택 흔적 0(감사 §5.1 전부 0) | — | 대안: `doc_standards:52` R6 끝에 1문장 |

- **손실**: `:20-23`, `:28`, `:29`, `:31-37`, `:4-6,14,16-18`.
- **폐기 판정**: **병합 유지** — `writing_style:8-9`가 "언어 선택(한/영 분리)은 documentation_policy가 담당"이라 명시 위임하고 있어 폐기하면 위임이 끊겨요. 한/영 분리 문장은 리포에 없어요(`harness-core.md:5`·`templates/PERSONALITY.md:8-9`는 **응답** 언어).
- **모체 영향**: 98 + 7 − 1(`:97` Related) ≈ **104**. `description` 교체 권고(98 B): `"Human-facing output style: Korean polite register, conclusion first, no filler; doc language split"`. 제자리 수정 원문 → 제안: `:8-9` "…언어 선택(한/영 분리)은 R9가 다루고, 본 문서는"; `:51-52` "- 이모지 금지 — 응답·커밋·PR·markdown 문서 전부 예외 없이 금지한다(구 documentation_policy의 MUST를 여기로 흡수)."
- **갱신 대상**: `AGENTS.md:158`(Optional), `claudedocs/CLAUDEKR.md:158`(보충), `README.md:223`·`README.en.md:220`(보충), `.omp/rules/harness-writing_style.md:8-9,51-52,97`, `risk-assess.test.mjs:53`(문자열 픽스처, 선택).

### M8. `harness-hook_recipes` → `harness-harness_integration_contract` — 병합

| 흡수 규칙 절 | 판정 | 모체 목표 위치 | 옮길 형태 |
|---|---|---|---|
| ECC 주석 (`:6`), Purpose `:10`(레시피 전제) | 폐기 | — | — |
| Purpose `:12` "확장 = `.omp/extensions/` TS 모듈, `pi.on(...)` 구독" | 고유 → 1줄 | `contract:10` 뒤 | "확장은 `pi.on(event, handler)`로 구독하는 기본 내보내기 함수 — `index.ts:389-392`" |
| **Event Types 표 + Blocking** (**`:16-25`**; 감사 `:17-24` 정정) | **고유 → 옮김** — `index.ts:389-392` `on()` 오버로드(tool_call→`ToolCallBlock`, tool_result→`ToolResultPatch`, before_agent_start→`AgentStartMessage`, session_start→`void`)와 일치 확인; 고유한 열은 "차단 가능 여부"(`AGENTS.md:63-64`는 이름만) | `contract:13` 뒤, `:15 ## Required Gates and Event Wiring` 앞 `### Event model` 소절 | 표 6줄 + Blocking 1줄 |
| Event payload (**`:27-38`**; 감사 `:28-36` 정정) | 고유 → 축약 3줄 — `index.ts:66-70,72-75,370-375`와 일치; `:33` `isError` 주석은 `contract:93`에 이미 있음; `:31`의 `toolName` 리터럴 합집합은 `index.ts:67`의 `string`과 이미 **드리프트** | Event model 소절 | 필드 이름만 + "정의는 `index.ts:66-76`, `:370-375`" |
| Recipe 1–5 (`:42-127`, 86줄) | 고유 → **폐기** | — | `gates/` 22개 파일 중 대응 0(800줄 차단·TODO 경고·테스트 리마인더·자동 포맷·tmux 차단); `coding_standards:44` 800줄 한도는 리뷰 임계값 |
| Writing Custom Extensions 1-4 (`:131-136`) | 겹침 → 폐기 | — | 표의 Can Block 열 + `index.ts:569` |
| **fail-open 단서** (**`:137`**; 감사 `:129` 정정 — `:129`는 `---`) | 고유 → 옮김 1줄 — `index.ts:36-41,579`와 일치하되 **bash 핸들러는 fail-closed**(`index.ts:40-41`, `:560` "bash commit-gate adapter error (failing closed)") 단서 필수 | `contract:10` 문장 끝 | "어댑터 오류는 fail-open(경고) — 단 bash 핸들러는 커밋 진행 중일 수 있어 fail-closed" |
| runGate 재서술 (`:139`) — 감사 "↔ contract:9" → **정정: `contract:10`** | 겹침 → 폐기 | — | — |

- **손실**: `:42-127` 레시피(의도적 폐기 — §7.2 승인 범위), `:131-136`, `:29-36` 코드블록(SSOT는 `index.ts:66-76`), `:139,:141,:6,:10`.
- **폐기 판정**: 이벤트별 차단 가능 여부·확장 어댑터 층의 fail-open 원칙은 규칙 층에 고유(`contract:29`는 pre-commit fail-closed만). **병합 유지**(약 10줄). 대안으로 "표 대신 `index.ts:389-392` 포인터 1줄"도 정보 손실은 없어요(§7 D4). `harness-check`/`harness-sync` 절(`contract:108-109`)과 겹침 0(`hook_recipes`에 `sync` 0건).
- **모체 영향**: 198 + ≈12 ≈ **210**. `description` **불변** — 이미 122 B(설명만)로 29편 중 가장 길어 더 늘리지 않아요. `(gates, hooks, evidence, residual risks)` → `(gates, events, evidence, residuals)`로 줄이면 118 B(−4 B)라 §1 규칙집 예산(D7)에 거의 기여하지 않으므로 축약은 선택 사항이에요. 모체 stale(`:27`, `:117-126`, `:145`, `:171-181` — 감사 §8)은 삽입 위치와 무관.
- **갱신 대상**: `AGENTS.md:155`(Tool rails → `harness-mcp_policy` 하나 남음), `claudedocs/CLAUDEKR.md:155`(보충), `README.md:221`·`README.en.md:218`(보충; 같은 행의 `context7_policy`는 이미 삭제된 규칙 — 표 전체 stale), `.omp/rules/harness-session_persistence.md:79`(M3 뒤 재측정; 제안 "- **`harness-harness_integration_contract.md`** (Event model): provides the extension/gate mechanism; …"). 아웃바운드 `hook_recipes:44`→`coding_standards` 링크 소실로 `coding_standards`의 ① 교차 링크가 1 줄지만 판정은 ◐ 그대로.

### M9. `harness-agent_security` → `harness-safety_security` — 병합

| 흡수 규칙 절 | 판정 | 모체 목표 위치 | 옮길 형태 |
|---|---|---|---|
| ECC 주석 "Complements harness-safety_security.md (operational safety) with adversarial…" (`:6`) | 절 제목으로 변환 | `safety_security:26` 뒤 `## Adversarial threats (agent-specific)` 신설, 기존 `:6-26`은 `## Operational safety` 아래 | 제목만 |
| Purpose (`:8-10`) | 옮김 | 신설 절 도입 | 그대로 2줄 |
| **MUST 외부 링크 감사** (`:14-24`), **MUST 숨은 문자 탐지** (`:28-37`), **MUST MCP 공급망** (`:41-48`) — 감사 "`:14-49`" → **`:14-48`** | **고유 → 옮김** — `grep -rniE "zero-width|typosquat|OWASP|prompt injection|memory poisoning|supply.chain"` 규칙 층 이 파일뿐; `review-gate.mjs:134-135` 제로폭 제거는 모델명 검증 한정, `harness-mcp_policy.md`·`bootstrap/SKILL.md`에 pin/typosquat 0건 | 소절 1-3 | **그대로**(mutable-source 검사·인라인 대안, 숨은 문자 종류·`grep -P` 스캔 명령, MCP tool-description·권한 점검 전부 보존). 유일한 편집은 `:45` 괄호의 `context7` 예시 삭제(2026-08-26 폐기, `mcp_policy:92`) |
| SHOULD 방어 블록 (`:52-58`), 계정 분리 (`:62-70`), 메모리 감사 (`:74-84`) — 감사 "`:53-90`" → **`:52-84`** | 고유 → 옮김 | 소절 4-6 | **그대로**, 단 메모리 감사 대상 목록(`:78-80`)의 stale **경로 토큰**만 손봐요: `:78` "`MEMORY.md` and auto-memory files (`~/.claude/projects/*/memory/` — OMC memory)"에서 `MEMORY.md`(감사 `:84` 정정; `glob` 0건)와 OMC 경로만 빼고 **auto-memory 감사 요구는 유지**해요(`session_persistence:20,78,88`이 auto-memory를 현행 교차 세션 저장소로 쓰므로 활성 위협 표면 — 리뷰 r2 지적) → "auto-memory (the cross-session memory `harness-session_persistence.md` relies on)"; `:79` `~/.omp/agent/sessions/`는 `session_persistence:19` 실존이라 그대로; `:80` `.omp/notepads/`(감사 `:86` 정정; 부재)는 "policy files read at session start (`.omp/rules/*.md`, `AGENTS.md`)"로 교체 |
| OWASP 표 (**`:88-98`**; 감사 `:94-104` 정정) | 고유 → 옮김 | 소절 7 | **표 9줄 그대로**(ID·이름·위협 요약 3열 보존) |
| Self-Check (`:102-110`) | 옮김 | 신설 절 끝 | **그대로 5항** — 경로 참조가 없어(`:110` "Persistence files reviewed recently for unexpected content?"가 일반 항목) 손볼 곳이 없어요(r1 반영분 "stale 경로 손봄"은 r2 지적으로 정정) |

- **손실**: `:6`(출처 주석 — 절 제목으로 대체), `:45` 괄호 예시(`context7`), `:78`의 `MEMORY.md`·OMC 경로 토큰과 `:80` notepad 항목(정책 파일 항목으로 교체 — auto-memory·세션 파일 감사는 유지), 구분선 8줄(`:12,26,39,50,60,72,86,100`). 보안 요건 본문은 축약 없이 전부 옮기므로 실행자가 임의로 뺄 여지가 없어요 — 리뷰 r1 지적으로 "그대로 또는 축약"을 "그대로"로, r2 지적으로 auto-memory 감사 유지를 확정했어요.
- **폐기 판정**: **병합 유지** — `harness-prompt_engineering.md:173-174` "에이전트 환경 자체의 방어(설정 주입·공급망·메모리 오염)는 … 관할"이 명시 위임, `:341` Related. 모체 집행 범위는 `destructive-guard.mjs:66-75`(advisory; rm -rf/git reset --hard/sed -i 등)가 `safety_security:10-14` 일부만 — 흡수되는 MUST 3개는 어느 게이트도 집행하지 않지만 모체 `:16-26`도 같은 "선언만" 상태예요.
- **모체 영향**: 30(실본문 26) + 110 − 폐기 약 14(frontmatter·제목 4, 주석 1, 구분선 8, stale 2) + 제목 2 ≈ **125**(모체가 가장 작은 파일에서 중간 크기로 커져요). `description` **교체 필요**(104 B): `"Hard rails: explicit approval for secrets/destructive ops/prod; injection, supply-chain, memory defenses"` — 현재 문구는 운영 안전만 가리켜 규칙집 노출로 주입·공급망 내용을 찾을 수 없어요. `harness-core.md:8`은 승인 레일만 요약하므로 불변. 모체 CRLF → LF 통일 시 diff가 전 줄에 걸려요(§7 D5).
- **갱신 대상**: `AGENTS.md:153`, `claudedocs/CLAUDEKR.md:153`(보충), `README.md:219`·`README.en.md:216`(보충), `.omp/rules/harness-prompt_engineering.md:173-174,341`(제안: "…`harness-safety_security.md`의 Adversarial threats 절 관할"), `scripts/harness-audit.sh:293-297`(§6; 감사 `:293-296` 블록 정정).

## 3. 공통 갱신 대상 (모든 병합 PR이 건드리는 곳)

| 파일 | 줄 | 내용 | 비고 |
|---|---|---|---|
| `AGENTS.md` | `:153-158` Linked Modules(Core/Quality/Tool/Operational/Optional rails), `:111` | 이름 제거 | 감사 §7.1 확인 |
| `claudedocs/CLAUDEKR.md` | `:112,153-158` | AGENTS.md 한국어 미러 | **보충** — `AGENTS.md:119-120` 규약상 같은 PR 갱신 또는 stale 표기 후 후속 커밋에서 `status: synced` 재스탬프 |
| `README.md` / `README.en.md` | `:219-224` / `:216-221` 규칙 분류표 | 맨 이름(`harness-` 접두 없음)으로 `information_discovery`를 뺀 8편 열거; 같은 표에 이미 삭제된 `context7_policy` 잔존 | **보충** — 감사 §3의 `harness-<name>` grep에 안 잡힌 이유가 접두 없는 표기예요 |
| `scripts/harness-sync.sh:184` | 글롭 `.omp/rules/harness-*.md` | **불변** | §5 |
| 치환하지 않는 곳 | `claudedocs/CLAUDE_original.md`, `claudedocs/ecc_harness_analysis.md`, `docs/harness/rules-liveness-audit-2026-10-06.md`, 이 문서, `docs/harness/archive/*`, `docs/handoff/*` | 시점 기록·스냅샷 | `harness-doc_standards.md:52` R6 |

## 4. 감사 §6·§7.1 정정 목록

| 쌍 | 감사 인용 | 실측 | 종류 |
|---|---|---|---|
| M1 | "잃는 것: eval 비용 기재(:20-23), 병렬 SHOULD(:25-28)" | 둘 다 타처 보유(`verification:163`, `templates/eval_report.md:45-50`, `session_retro.md:32-35`; 런타임 Tool Policy) | 판정 |
| M1 | "모델 표(:12-16) ↔ `agent_routing:41-43` 이중 정의", "재독 회피(:30-33)는 게이트가 기계 집행" | 표는 겹치지만 `:18` 티어 승격 원칙과 `:32` 재독 회피 SHOULD는 리포 어디에도 없는 고유 문장(옮김 2줄); 두 게이트는 편집 전 읽기만 강제(`context-gate.mjs:48-51`) | 판정 |
| M1 | §7.1 "옮길 절: eval 비용 기재 한 줄" | 옮길 절은 `:18`·`:32` 두 줄이고 모체도 둘(`agent_routing`, `session_persistence`) | 판정 |
| M2 | `:9-11`, `:13-18` | `:8-10`, `:12-17`(빈 줄 포함 오프셋) | 줄 |
| M2 | "`claudedocs/` 규약 디렉터리 stale" | 부재가 아니라 소비 리포 비동기 경로(`AGENTS.md:120`) | 사유 |
| M3 | Self-Check `:117-124`, scripts `:90-114`, 모체 Self-Check `:85-89`, `.omp/contexts` `:52-70`, `harness-audit.sh:162-165,333-336` | `:117-127`, `:89-114`, `:83-89`, `:47-71`, `:162-166,333-337` | 줄 |
| M3 | "`<remember>`/notepad(:56-85) 옮길 것" | `<remember>` 축약 1줄, notepad **폐기**(모체 `:16,:22` 모순) | 판정 |
| M3 | — | What Can Be Safely Dropped(`:43-54`) 누락 | 누락 |
| M3 | `:369` "M4·M8은 M3 뒤에 해도 :78-79 유지" | `:77` 삭제만으로 밀림 — 텍스트로 특정 | 판정 |
| M4 | "트리거(:12-17) ↔ `assetization:48-53`" | 1/4만 겹침(`:17`) | 판정 |
| M4 | "`:38` ↔ `documentation_policy:35`" | 겹치지 않음(latest-only ≠ 중복 링크) | 판정 |
| M5 | `:26-36`, `:42-48`, `:63-66`, `:84-88`, `verification:92-100`, `harness-audit.sh:207-210` | `:25-37`, `:41-48`, `:64-66`, `:82-86`, `:99-107`, `:207-211` | 줄 |
| M5 | "`checklists/quality_gate.md`가 전체를 복제" | 트리거 표·억제 조건절은 복제돼 있지 않음 | 판정 |
| M6 | `tdd_rules.md:3-75`, `:33-36`, `:40-70` | `:3-80`(112줄), `:32-36`, `:38-70` | 줄 |
| M6 | 픽스처 5곳(`:56,119,238,418,422`) "존재하는 경로로 교체" | 합성/문자열 픽스처라 삭제로 깨지지 않음(§6); `:159-160` 누락 | 판정·누락 |
| M7 | UTF-8 `:26`, `.ps1` `:27` | `:27`, `:28` | 줄 |
| M7 | "README vs INDEX(:20-23) ↔ `AGENTS.md:7-11`" | Navigation 목록일 뿐 역할 분리 문장 없음 | 판정 |
| M7 | "잃는 것: latest-only(:33-37)" | 고유는 `:35` 1줄, 채택 흔적 0 | 판정 |
| M8 | 이벤트 표 `:17-24`, 페이로드 `:28-36`, fail-open `:129`, 모체 `contract:9` | `:16-25`, `:27-38`, `:137`, `contract:10` | 줄 |
| M9 | MUST `:14-49`, SHOULD `:53-90`, OWASP `:94-104`, `MEMORY.md :84`, `.omp/notepads/ :86`, `harness-audit.sh:293-296` | `:14-48`, `:52-84`, `:88-98`, `:78`, `:80`, `:293-297` | 줄 |
| 공통 | §7.1 "링크·점수 갱신 대상" | `claudedocs/CLAUDEKR.md` 미러(9건 전부), `README.md`·`README.en.md` 분류표(`information_discovery`를 뺀 8편), `EXAMPLES.md:140`(M6), `index.ts:402`·`cycle-boundary-wiring.test.mjs:8`(M3), `risk-assess.test.mjs:54`(M4) 누락 | 누락 |
| 공통 | §7.4-4 "병합 사이클은 docs-only(저위험)" | 규칙 삭제(`.md`)와 `harness-audit.sh`(`.sh`)·픽스처(`.mjs`)를 **한 커밋**에 넣으면 `hasCode && diffSize > 100`으로 **high**(`risk-assess.mjs:307-310,463-470`; diffSize는 삭제 `.md` 줄도 셈 `:442-451`) → review-gate 증거 요구(`review-gate.mjs:721-725`) | 판정 |

## 5. 연구 3 — 소비 리포 영향

### 5.1 sync가 삭제를 전파하는 방식

- `scripts/harness-sync.sh:184` 글롭 `.omp/rules/harness-*.md`: 실제 실행(`:340-358`)은 **소비 측 매치를 먼저 전부 `rm -f`하고**(`:350`, 주석 `:343-344` "stale matches in the consumer go first so a rule renamed or removed upstream does not linger as an orphan rulebook") 소스 파일을 복사해요. 따라서 삭제된 9편은 다음 `harness-check` sync에서 자동 제거돼요. dry-run(`:300-313`)은 `PRUNE <file> (no longer in source)`를 출력하지만 **실제 실행은 제거 파일명을 출력하지 않아요**(`:350`에 echo 없음) — 소비자는 어떤 규칙이 사라졌는지 sync 출력만으로는 알 수 없어요.
- 레거시 레이아웃(`rules/<name>.md`, ADR 002 이전) 소비 리포는 `RETIRED_DIRS=(rules)`(`:240`)와 7c(`:452-486`)가 처리해요: 이전 동기 트리(`refs/harness/<prev>`)의 blob과 같은 파일만 삭제하고, 소비자가 고친 파일은 advisory(`:479,:484`)로 남겨요.
- `rule://harness-<삭제된 이름>` 참조는 omp 규칙집에서 해석되지 않아요(규칙집은 `.omp/rules/` 파일 목록이에요 — `INDEX.md:28`). 깨짐은 **소비 리포가 직접 쓴 문서·규칙**(`.omp/rules/<project>-context.md`, `.omp/RULES.md`, 프로젝트 docs)에서만 생겨요. 하네스 소유 파일(`AGENTS.md`, `checklists/`, `templates/`, `.omp/skills/`, `.omp/extensions/harness/`, `EXAMPLES.md`, `INDEX.md`)은 sync가 통째로 교체하므로 깨지지 않아요(`risk-assess.mjs:35-39` HARNESS_ASSET_PATHS = sync 범위).

### 5.2 탐색 명령과 결과

접근 가능 범위: 이 리포 + `/home/rae/orca/workspaces` 아래 리포(읽기 전용). `.omp` 디렉터리를 가진 리포는 `omp/*` 워크트리들과 **`game-design/trigger-happy`**뿐이에요(`AIPQ-daily-drill`·`AIwitness`·`blogger`·`chats`·`hgj`는 빈 디렉터리).

```bash
# 소비 리포에서 실행 — 접두 유무·rule://·레거시 rules/ 표기 전부
NAMES='cost_awareness|information_discovery|context_management|learning_policy|quality_gates|tdd_policy|documentation_policy|hook_recipes|agent_security'
grep -rnoE "(^|[^a-z_/])(harness-)?($NAMES)(\.md)?|rule://harness-($NAMES)|rules/($NAMES)\.md" . \
  --include='*.md' --include='*.yaml' --include='*.json' --include='*.sh' --include='*.mjs' --include='*.ts' \
  --exclude-dir=node_modules --exclude-dir=.git | sort | uniq -c | sort -rn
```

**이 리포(소스)** — `.omp/rules/harness-<name>.md` 자기 파일·감사 문서·이 문서를 뺀 결과는 §2 각 쌍의 "갱신 대상"과 §3에 그대로 있어요. 요약: 하네스 소유 갱신 대상은 `AGENTS.md` 6줄(`:111,153,154,155,157,158`), `claudedocs/CLAUDEKR.md` 6줄(`:112,153,154,155,157,158`), README 2종 분류표 각 5행, 모체·형제 규칙 12줄(`writing_style` 3, `session_persistence` 5, `prompt_engineering` 2, `adversarial_review` 1, `cycle_definition` 1), `templates/retro.md:26`, `checklists/quality_gate.md:3`, `EXAMPLES.md:140`, `index.ts:402`, 테스트 주석·픽스처 8줄(`cycle-boundary-wiring.test.mjs:8`, `risk-assess.test.mjs:53,54,56,119,238,418,422`), `harness-audit.sh` 4블록이에요. 치환하지 않는 스냅샷은 `claudedocs/CLAUDE_original.md:468-488`, `claudedocs/ecc_harness_analysis.md:18-91`, 감사 문서(`docs/harness/rules-liveness-audit-2026-10-06.md`)와 이 문서예요.

**`game-design/trigger-happy`** (하네스 2026.75를 2026-09-07에 동기, `docs/harness/audit.jsonl:2` `harness_sync` tag `refs/harness/2026.75`; 레거시 `rules/*.md` 27편 + `rules/INDEX.md`(2026.75 시점 규칙 수라 현재 29편과 달라요), `.omp/rules/` 없음; 작업 트리 깨끗) — 위 명령 출력(발췌 — 하네스 소유라 교체되는 `AGENTS.md`(22건)·`.omp/extensions/harness/harness-manifest.json`(9건)·`templates/retro.md`·`checklists/quality_gate.md`와 스냅샷 `claudedocs/CLAUDE_original.md`(10건)는 생략했어요):

```text
rules/INDEX.md:27,30,37,39,46,57,59,60,64        # 레거시 하네스 사본 — 7c가 blob 일치 시 삭제
rules/writing_style.md:6,48,88                    # documentation_policy 링크 — 사본, 7c 처리
rules/session_persistence.md:3,7,74,75,76         # context_management·learning_policy·hook_recipes — 사본
rules/prompt_engineering.md:171,338               # agent_security — 사본
rules/cycle_definition.md:153 / rules/adversarial_review.md:8   # 사본
scripts/harness-audit.sh:16,184-216,356            # 점수 범주 이름 quality_gates — 하네스 소유, 교체됨
.omp/skills/harness-check/SKILL.md:92             # 범주 이름 — 하네스 소유
.omp/extensions/harness/index.ts:148              # context_management 주석 — 하네스 소유, 교체됨
.omp/extensions/harness/tests/{risk-assess,cycle-boundary-wiring}.test.mjs:159,8  # 하네스 소유
EXAMPLES.md:140                                   # tdd_policy 링크 — 하네스 소유(HARNESS_ASSET_PATHS), 교체됨
claudedocs/CLAUDEKR.md:87,91,138-156              # 옛 init이 남긴 소스 전용 사본 — sync 7b advisory(:446-449)가 삭제 안내
claudedocs/ecc_harness_analysis.md:30,48,91       # 프로젝트 분석 문서(2026-07 시점 기록) — 치환 대상 아님
tests/{risk-assess,cycle-boundary-wiring}.test.mjs:159,8  # 옛 템플릿이 남긴 테스트 사본 — 합성 픽스처라 깨지지 않음
```

판정: trigger-happy에는 **소비자가 직접 쓴 살아 있는 참조가 0건**이에요. 하네스 사본은 sync가 교체·은퇴하고, `claudedocs/*`·`tests/*`는 옛 init 잔재(스냅샷)라 병합과 무관하게 이미 advisory 대상이에요. 이 리포 외에 **현행 레이아웃(`.omp/rules/harness-*`)으로 동기된 소비 리포는 지정 범위 안에 없었어요** — 마이그레이션 노트(5.3)는 그런 리포가 생기거나 다른 머신의 소비 리포에서 위 명령을 돌릴 때를 위한 초안이에요.

### 5.3 마이그레이션 노트 초안 (병합 PR의 `CHANGELOG.md [Unreleased]`와 릴리스 노트에 실을 것)

```markdown
- **refactor(rules)**: harness-* 규칙 29편 → 20편 (#86 연구 → 실행 이슈 #N). 아래 9편이 삭제되고 고유 절은 모체로 옮겨졌어요. (이 문구는 **마지막 PR이 완성하는 최종 형태**예요 — 각 PR은 자기가 삭제한 규칙의 표 행만 추가하고, 머리 문장은 "N편 → M편(진행 중)"으로 두었다가 PR-5가 완료형으로 바꿔요.)
  다음 `harness-check` sync에서 소비 리포의 `.omp/rules/harness-<이름>.md` 사본이 자동 제거돼요(레거시 `rules/<이름>.md`는 7c 은퇴).
  소비 리포가 직접 쓴 문서·규칙(`.omp/rules/<project>-context.md`, `.omp/RULES.md`, `docs/`)의 `rule://harness-<이름>`·`harness-<이름>` 참조는 아래 표로 바꿔 주세요(탐색 명령: 이 문서 §5.2).

  | 삭제된 규칙 | 내용이 간 곳 |
  |---|---|
  | `harness-cost_awareness` | `rule://harness-agent_routing`(티어 승격 원칙 1줄) · `rule://harness-session_persistence`(재독 회피 1줄); eval 비용 기재는 `rule://harness-verification_tests_and_evals` |
  | `harness-information_discovery` | `rule://harness-anti_hallucination` "search broadly before concluding an artifact is absent" |
  | `harness-context_management` | `rule://harness-session_persistence` "When to compact" / "What to preserve" |
  | `harness-learning_policy` | `rule://harness-assetization` "Learning criteria" |
  | `harness-quality_gates` | `rule://harness-verification_tests_and_evals` "Named gates and trigger levels" |
  | `harness-tdd_policy` | `rule://harness-verification_tests_and_evals` "Test-first default" (+ `.omp/skills/startdev/references/tdd_rules.md`) |
  | `harness-documentation_policy` | `rule://harness-writing_style` R9 |
  | `harness-hook_recipes` | `rule://harness-harness_integration_contract` "Event model" (레시피 5종은 폐기) |
  | `harness-agent_security` | `rule://harness-safety_security` "Adversarial threats" |
```

전파 채널의 빈틈(후속 이슈 제안, 이 사이클 범위 밖): 실제 sync는 제거 파일명을 출력하지 않으므로(5.1), `harness-sync.sh:350` 루프에 `removed: <file>` 한 줄을 echo하거나 `harness-check` SKILL의 sync 결과 안내에 개명표 링크를 두는 변경이 있어야 소비자가 sync 시점에 알 수 있어요. `migrate` 스킬은 초기 컷오버용이라 기존 소비 리포는 이 안내를 볼 경로가 CHANGELOG뿐이에요(감사 §7.4-2와 같은 결론).

## 6. 연구 4 — 점수·테스트 결합과 #87 의존

### 6.1 `scripts/harness-audit.sh` 파일 존재 점수 (현재 `TOTAL: 51/70`)

| 줄 | 범주 | 검사 | 점수 | 병합 영향 |
|---|---|---|---|---|
| `:147-150` | tool_coverage | `exists harness-agent_routing.md` | +1 | 모체 — 불변 |
| `:162-166` | context_efficiency | `exists harness-context_management.md` | **+3** | M3 소실 |
| `:168-172` | context_efficiency | `exists harness-session_persistence.md` | +2 | 모체 — 불변 |
| `:207-211` | quality_gates | `exists harness-quality_gates.md` | **+1** | M5 소실 |
| `:213-217` | quality_gates | `exists harness-verification_tests_and_evals.md` | +2 | 모체 — 불변 |
| `:222-226` | memory_persistence | `exists harness-session_persistence.md` | +2 | 모체 — 불변 |
| `:271-272` | eval_coverage | `has_pattern verification… "Eval-Driven Development"/"EDD"` | 패턴 | 불변 |
| `:287-291` | security_guardrails | `exists harness-safety_security.md` | +2 | 모체 — 불변 |
| `:293-297` | security_guardrails | `exists harness-agent_security.md` | **+2** | M9 소실 |
| `:321-325` | cost_efficiency | `exists harness-cost_awareness.md` | **+3** | M1 소실 |
| `:333-337` | cost_efficiency | `exists harness-context_management.md` | **+2** | M3 소실 |

소실 합계 **11점**(51 → 40). `scripts/test-harness-audit.sh:78` "host repo" 케이스의 허용 범위는 `40..70`이라 40이면 통과 경계에 걸려요(39 이하면 FAIL). 재배치안(현상 유지 변형, §7): M1 → `cost_efficiency` +3을 `harness-agent_routing.md` 존재로(또는 `verification:163` 패턴); M3 → `:162-166`·`:333-337`을 `harness-session_persistence.md` 존재로 바꾸면 `:168-172`와 중복이라 가중치 합산(2→5, 2→4)으로; M5 → `has_pattern harness-verification_tests_and_evals.md "TYPECHECK"` +1("게이트 이름이 모체에 실제로 들어갔는가"); M9 → `:287-291` 가중치 2→4 또는 `grep -qiF "injection"` 조건부 +2.

### 6.2 테스트 픽스처가 고정하는 것

| 파일:줄 | 고정하는 동작 | 삭제 시 |
|---|---|---|
| `.omp/extensions/harness/tests/risk-assess.test.mjs:53,54,56` | `isHighRiskFile()`이 `policy` 토픽 부분문자열을 `.md` 산문에 적용하지 않음(false) — **순수 경로 판정, 디스크 비접촉**(같은 목록 `:52 rules/context7_policy.md`는 이미 삭제된 파일) | 통과(이름만 stale) |
| `:63`, `:159-160` | `rules/tdd_policy.MD` 대문자 확장자도 산문 면제·docs-only low — 합성 픽스처 | 통과, 유지 |
| `:119` | `withRepo({'.omp/rules/harness-tdd_policy.md': …})` 규칙 산문만 바꾼 커밋 → `low` — 임시 리포 생성 | 통과 |
| `:238`, `:418,:422` | `TEMPLATE` 고정 리포의 하네스 자산 표본; 윈도우 안 하네스 자산 삭제가 채점됨(`:421` not low, `:424` `.omp/rules/harness-` 접두 면제 금지) | 통과 |
| `tests/cycle-boundary-wiring.test.mjs:8`, `index.ts:402` | 주석 — `context_management.md`의 "mid-implementation은 끊지 말라" 인용 | 통과(주석 stale → M3에서 `session_persistence.md`로 교체) |
| `tests/harness-sync.test.mjs` | 글롭 동기 샘플 `harness-core`·`harness-writing_style` | 무관 |
| `scripts/test-harness-audit.sh:78` | host repo `TOTAL` 40..70 | 6.1 |

**결론**: 감사 §7.1 M6·M7·M4의 "픽스처를 존재하는 경로로 교체"는 **정합성 때문이 아니라 가독성 때문**이에요(어느 테스트도 실제 파일을 읽지 않아요). 교체하면 `.mjs` 변경이 생겨 그 커밋이 medium이 되므로(§4 마지막 행) 교체는 `harness-audit.sh` 재배치와 같은 **코드 커밋 하나**에 모아요.

### 6.3 #87 의존

- #87 AC4: "점수 처분이 정해지기 전에는 병합 실행 사이클을 열지 않아요." 선택지는 (a) 폐지 (b) 행동 지표로 재설계 (c) 존재 점수만 제거하고 유지예요.
- (a)·(b)·(c) 어느 쪽이든 **파일 존재 점수가 사라지므로** 병합 PR은 `harness-audit.sh`를 건드리지 않아요 → PR-1·3·4·5는 docs-only(low)예요. 예외는 PR-2(M3)로, `index.ts:402`·`cycle-boundary-wiring.test.mjs:8`의 **주석**이 삭제될 파일명을 가리키므로 코드 파일 커밋이 항상 하나 붙고(`risk-assess.mjs:307-310,472-478` — `.ts`/`.mjs`는 줄 수와 무관하게 medium), 픽스처 가독성 교체(선택)를 택한 PR도 같은 이유로 medium 커밋을 하나 가져요.
- #87이 **현상 유지**로 끝나면(어느 선택지도 아님) 6.1 재배치 4블록을 코드 커밋으로 실어야 해요 — 점수 블록이 걸린 쌍을 가진 PR(M1 → PR-3, M3 → PR-2, M5 → PR-4, M9 → PR-5)에만 붙고 PR-1에는 없어요. 그 커밋은 medium(≤100줄 코드)이고, 규칙 삭제 커밋과 **분리**해야 high를 피해요(§4 마지막 행).
- 어느 경우든 각 PR의 확인 문장에 "점수"를 넣지 않고(#87 결론을 선행 조건으로 두고) `node --test`·`docs-drift`·참조 0건으로 확인해요.

## 7. 연구 5 — 실행 사이클 분할안 (번호로 승인 가능)

### 7.0 선행 조건과 결정 사항

- **P0 — #87 결론**: 점수 처분(a/b/c/현상 유지)이 정해져야 PR-1부터 열어요. 현상 유지면 점수 블록이 걸린 PR(PR-2·3·4·5)에 코드 커밋(6.1 재배치)이 붙고, 아니면 붙지 않아요.
  - **결정: #87 (a) 폐지 (2026-10-06)** — 파일 존재 점수가 사라지므로 PR-2·3·4·5의 `harness-audit.sh` 재배치 코드 커밋은 빠져요(PR-2의 `index.ts`·테스트 주석 커밋만 남아요).
- 결정 사항(사용자가 번호로 답하면 돼요):
  - **D1** M1 처분: 고유 2문장(`:10+:18` 티어 승격 MUST → `agent_routing` 불릿, `:30+:32` 재독 회피 SHOULD → `session_persistence` 소절)만 옮기고 삭제하는 병합을 권고해요 / 그 2문장도 버리는 폐기를 택할 수 있어요(손실로 기록).
  - **D2** TDD 지위(M6): "test-first 기본 + 생략 시 명시 승인"으로 봉합하는 쪽을 권고해요(`change_control:43-46`과 정합) / MUST를 유지할 수 있어요 / SHOULD로 내릴 수 있어요.
  - **D3** 이모지 금지(M7): "if adopted" 조건부 MUST를 무조건 MUST로 올리는 쪽을 권고해요(`writing_style:51-52`가 이미 그렇게 인용) / 조건부를 유지할 수 있어요.
  - **D4** M8 이벤트 표: 표 6줄을 옮기는 쪽을 권고해요 / `index.ts:389-392` 포인터 1줄로 대신할 수 있어요.
  - **D5** CRLF → LF 통일: 병합 커밋과 **분리한 별도 커밋**(PR-6)을 권고해요 — 리뷰 diff 가독성 때문이에요 / 같은 커밋에 넣을 수 있어요.
  - **D6** 모체 stale 절 정리(`verification:6-15` oh-my-claudecode, `session_persistence:47-71` `.omp/contexts/*`, `contract:27,117-126,145`): 별도 이슈를 권고해요 — 내용 개정은 감사 §7.3과 같은 범주예요 / 같은 PR의 별도 AC로 넣을 수 있어요.
  - **D7** 규칙집 행 평균(§1): 9편을 지우는 것만으로 평균이 114 → 117 B가 되므로 ADR 002 `:89`의 지표를 "행 평균"에서 "규칙집 총량(현 3,192 B, 병합 뒤 ≤2,335 B)"으로 바꾸는 쪽을 권고해요(ADR 개정 1줄 — 짧은 규칙 삭제를 벌점으로 세는 지표라 정리와 상충해요) / 지표를 유지하고 19편 설명 합계를 2,166 B 이하로 다듬을 수 있어요(현행 대비 −62 B, 제안 문구 대비 −169 B — 어느 설명을 줄일지 실행 PR이 정해요).
- 공통 절차: 각 PR은 gh-loop 워커 1개, Stage 2 커밋 순서(seed+scope → 변경 → 리뷰 후속 → closeout), `순차 PR 갱신` 절차로 하나씩 머지. 모든 PR이 `AGENTS.md:153-158`·`claudedocs/CLAUDEKR.md`·`CHANGELOG.md`를, PR-1을 뺀 모든 PR이 `README*` 분류표를 건드리므로 **병렬 PR은 충돌**해요 — 순차가 맞아요.
- 공통 확인(모든 PR): ① `grep -rnE "(harness-|rule://harness-|rules/)<삭제 이름>"` 결과가 스냅샷 3종(§3)뿐 ② `node scripts/docs-drift` 0 errors ③ `node --test .omp/extensions/harness/tests/*.test.mjs` 전부 통과 ④ `git diff --stat main -- .omp/rules`에 삭제 파일과 모체만 ⑤ omp 세션에서 `rule://harness-<모체>`를 열어 옮긴 절이 보이고 `description`이 바뀌어 있음(감사 §7.4-4의 규칙집 렌더 확인).

### 7.1 PR 목록 (제안 순서)

| # | 쌍 | 변경 파일(문서) | 코드 커밋(있을 때 — "현상 유지 시"는 #87이 점수를 그대로 둘 때만) | 위험 | 의존 | 확인 문장 |
|---|---|---|---|---|---|---|
| **PR-1** | M2 | 삭제 1편; `anti_hallucination` 새 절+description; `AGENTS.md:153`; CLAUDEKR; CHANGELOG(이 PR이 삭제한 1편의 개명표 행만) | — | low | P0, D7 | "`harness-information_discovery`가 삭제되고 `rule://harness-anti_hallucination`에 'search broadly…' 절(판별 불릿 2·스윕 3단계·scout 위임)이 있으며, 그 이름의 참조가 스냅샷 밖 0건이에요." |
| **PR-2** | M3 | 삭제 1편; `session_persistence` 새 절 2개+`:6,10,77` 정리+description; `cycle_definition:189`; `AGENTS.md:157`; CLAUDEKR; README 2종(`context_management` 이름만 제거); CHANGELOG(개명표 행 추가) | `index.ts:402`·`cycle-boundary-wiring.test.mjs:8` 주석(코드 파일이라 **항상** medium 커밋 1), 현상 유지 시 `harness-audit.sh:162-166,333-337` | low + medium 커밋 1 | P0, D6, D7 | "`harness-context_management`가 삭제되고 `rule://harness-session_persistence`에 'When to compact'(표 5행)·'What to preserve (MUST)'(+Safe to drop) 절이 있으며, 모체 안에 `context_management` 언급이 0건이고 `index.ts`·테스트 주석이 새 파일명을 가리켜요." |
| **PR-3** | M1 + M4 + M8 | 삭제 3편; `agent_routing:43` 뒤 MUST 불릿 1줄; `session_persistence` Safe to drop 뒤 SHOULD 소절 2줄 + Relationship 불릿 2개(텍스트로 특정, M3 뒤 재측정); `assetization` Learning criteria; `contract` Event model; `templates/retro.md:26`; `AGENTS.md:155,157`; CLAUDEKR; README 2종(3편 이름만 제거); CHANGELOG(행 3개 추가) | 현상 유지 시 `harness-audit.sh:321-325`; 픽스처 `risk-assess.test.mjs:54` 선택(택하면 medium) | low(코드 커밋 시 medium) | PR-2 머지 뒤, D1, D4, D7 | "`harness-cost_awareness`·`harness-learning_policy`·`harness-hook_recipes`가 삭제되고 `rule://harness-agent_routing`에 티어 승격 MUST 1줄, `rule://harness-session_persistence`에 재독 회피 SHOULD 소절과 새 Relationship 불릿, `rule://harness-assetization`에 4기준+트리거 3종, `rule://harness-harness_integration_contract`에 Event model(표 4행 + fail-open/bash fail-closed 단서)이 있으며, `templates/retro.md:26`이 새 위치를 가리켜요." |
| **PR-4** | M5 + M6 | 삭제 2편; `verification_tests_and_evals` Test-first 소절+Named gates 절+커버리지 불릿+Self-Check+description; `checklists/quality_gate.md:3`; `adversarial_review:11`; `AGENTS.md:111,154`; `EXAMPLES.md:140`; CLAUDEKR; README 2종(2편 이름만 제거); CHANGELOG(행 2개 추가); 결정 로그(D2) | 현상 유지 시 `harness-audit.sh:207-211`; 픽스처 `:56,119,238,418,422` 선택(택하면 medium) | low(코드 커밋 시 medium) | P0, D2, D7 | "`harness-quality_gates`·`harness-tdd_policy`가 삭제되고 `rule://harness-verification_tests_and_evals`에 'Named gates and trigger levels'(정의 표 6행·트리거 표 4행·억제 조건)과 'Test-first default'(요지 3줄·승인 1줄·커버리지)가 있으며, `checklists/quality_gate.md`가 그 절을 가리키고 D2 결정이 `docs/decisions/`에 기록돼요." |
| **PR-5** | M7 + M9 | 삭제 2편; `writing_style` R9+`:8-9,51-52,97`+description; `safety_security` 2단 구조+Adversarial threats 절(원문 그대로, auto-memory 감사 유지)+description; `prompt_engineering:173-174,341`; `AGENTS.md:153,158`; CLAUDEKR; README 2종(**20편 기준으로 분류표 재작성** — `context7_policy` 잔존도 정리); CHANGELOG(행 2개 추가 + 머리 문장을 완료형 "29편 → 20편"으로) | 현상 유지 시 `harness-audit.sh:293-297` | low(코드 커밋 시 medium) | P0, D3, D7, PR-1~4 머지 뒤(README·CHANGELOG 완료형) | "`harness-documentation_policy`·`harness-agent_security`가 삭제되고 `rule://harness-writing_style`에 R9(한/영 분리·UTF-8 NO-BOM), `rule://harness-safety_security`에 Operational/Adversarial 2단 절(MUST 3·SHOULD 3·OWASP 표 9줄·Self-Check 5항이 원문 그대로, 메모리 감사 목록에 auto-memory 포함)이 있으며, `prompt_engineering`의 위임이 새 절을 가리키고, README 분류표와 CHANGELOG 머리 문장이 20편 최종 상태와 일치해요." |
| **PR-6**(선택, D5) | CRLF→LF | 모체 중 CRLF인 `anti_hallucination`·`session_persistence`·`safety_security`(+ 유지 규칙 12편) | — | low | PR-1~5 뒤 | "`file .omp/rules/harness-*.md`에 CRLF가 0건이고 `git diff -w`가 비어 있어요." |

규모 근거: PR당 삭제 1–3편 + 모체 1–3편 + 공통 4파일 ≈ 6–12파일이고, 코드 커밋을 분리하면 문서 커밋은 `risk-assess`로 low예요. 한 PR에 **같은 모체**(PR-4)나 **M3 뒤 `session_persistence`를 함께 건드리는 소형 쌍**(PR-3)만 묶었고, 가장 큰 M3는 단독이에요. 순서는 소형 독립(PR-1) → M3(PR-2) → M3 의존(PR-3) → 같은 모체 쌍(PR-4) → 마지막(PR-5)이에요. PR-1·PR-4와 PR-2→PR-3 묶음은 서로 독립이라 사용자가 순서를 바꿔도 되지만, PR-3은 PR-2 뒤여야 하고 PR-5는 README·CHANGELOG를 완료형으로 만드는 PR이라 항상 마지막이에요.

### 7.2 PR 공통 커밋 구조

1. `docs(harness): #N AC를 기록합니다` — seed+scope(전부 `[x]`).
2. `refactor(rules): #N <쌍> 병합` — 삭제 + 모체 편집 + AGENTS/CLAUDEKR/README/형제 링크(docs-only, low). CRLF 모체는 D5에 따라 여기서 LF로 바꾸거나 PR-6으로.
3. (코드 파일이 있을 때만 — PR-2의 주석 2곳은 항상, 현상 유지 변형의 점수 재배치와 선택한 픽스처 교체는 해당 PR만) `chore(harness): #N 점수·주석 재배치` — `harness-audit.sh`·`index.ts`·테스트 주석/픽스처(코드, ≤100줄 → medium 경고만). **2와 합치지 않아요**(합치면 high → review-gate 사이드카 필요).
4. 리뷰 후속 → `docs(harness): #N 작업을 마감합니다`(closeout, `gh_loop_closed`).
5. `CHANGELOG.md [Unreleased]`에 5.3 노트 — 각 PR이 자기가 삭제한 규칙의 개명표 행만 추가하고(머리 문장은 "진행 중"), 마지막 PR(PR-5)이 머리 문장을 완료형으로 바꿔요. README 분류표도 같은 방식(각 PR은 이름만 제거, PR-5가 20편 기준 재작성)이라 순차 머지 중에도 사용자 문서가 실제 파일 상태와 어긋나지 않아요.

## 8. 부수 관찰 (비범위 — 기록만)

- `anti_hallucination.md:23`의 `librarian` 에이전트는 `.omp/agents/`에 없어요(AGENTS.md:138도 언급).
- `README.md:219-224`·`README.en.md:216-221` 규칙 분류표는 이미 삭제된 `context7_policy`를 포함해 전체가 stale이에요 — 중간 PR은 이름만 빼고, 마지막 PR(PR-5)에서 20편 기준으로 다시 쓰는 편이 나아요.
- `harness-audit.sh:327-331` AGENTS.md "model routing" 패턴 +3은 현재도 skip(문자열 0건)이고 `:339-341` "token budget" 패턴도 0건 — #87 자료예요.
- `hook_recipes:31`의 `toolName` 리터럴 합집합이 `index.ts:67`의 `string`과 이미 다르듯, 규칙 안의 코드 스케치는 드리프트해요 — M8에서 코드블록을 옮기지 않는 근거예요.
- 감사 §8의 CRLF 15편 목록은 `file` 재실행으로 일치했어요(병합 쌍 17편 중 CRLF 11편).
- 같은 시각 `gh-loop-issue-87` 워크트리도 `docs/harness/seed.yaml`·`current-scope.md`·`audit.jsonl`을 바꾸므로 두 PR은 순차 머지에서 seed 충돌이 나요(`순차 PR 갱신` 절차 대상).

## 9. 재현

리포 루트에서:

```bash
# 줄 수·줄끝 (§1)
for n in cost_awareness agent_routing information_discovery anti_hallucination context_management session_persistence learning_policy assetization quality_gates tdd_policy verification_tests_and_evals documentation_policy writing_style hook_recipes harness_integration_contract agent_security safety_security; do
  f=.omp/rules/harness-$n.md; printf '%-30s %4s %s\n' "$n" "$(wc -l < $f)" "$(file -b $f | grep -o CRLF || echo LF)"; done
# 리포 내 참조 (§2·§3) — 자기 파일·감사·이 문서 제외
NAMES='cost_awareness|information_discovery|context_management|learning_policy|quality_gates|tdd_policy|documentation_policy|hook_recipes|agent_security'
grep -rnoE "(^|[^a-z_/])(harness-)?($NAMES)(\.md)?|rule://harness-($NAMES)|rules/($NAMES)\.md" AGENTS.md INDEX.md EXAMPLES.md README.md README.en.md claudedocs .omp checklists templates docs scripts .githooks \
  --include='*.md' --include='*.yaml' --include='*.sh' --include='*.mjs' --include='*.ts' \
  | grep -vE "^\.omp/rules/harness-($NAMES)\.md|rules-liveness-audit|rules-merge-plan|docs/harness/archive|harness-state"
# 점수·테스트 (§6)
bash scripts/harness-audit.sh --terse | tail -1          # TOTAL: 51/70
node --test .omp/extensions/harness/tests/*.test.mjs     # 671/671 (2026-10-06)
node scripts/docs-drift                                   # closeout 전에는 "Closeout pending" 구조 경고 1건이 정상이고, closeout 커밋 뒤 0 errors/0 warnings
# 규칙집 행 평균 (§1 — ADR 002 :89와 같은 형식: alwaysApply인 harness-core 제외, `이름 (): 설명` 한 줄)
tot=0; n=0; for f in .omp/rules/harness-*.md; do nm=$(basename $f .md); d=$(grep -m1 '^description:' $f | sed -E 's/^description: *"?//; s/"?\r?$//'); [ -z "$d" ] && continue; tot=$((tot+$(printf '%s (): %s' "$nm" "$d" | wc -c))); n=$((n+1)); done; echo "rows=$n total=$tot avg=$(awk "BEGIN{printf \"%.2f\", $tot/$n}")"   # rows=28 total=3192 avg=114.00
# 병합 뒤 예상: 9편 제외·설명 불변 → rows=19 total=2228 avg=117.26 / 모체 6편 설명을 §1 제안으로 교체 → rows=19 total=2335 avg=122.89 (제외 목록은 위 NAMES, 교체 문구는 §1 표)
grep -nE 'harness-[a-z_]+\.md' scripts/harness-audit.sh
grep -nE "($NAMES)" .omp/extensions/harness/tests/*.test.mjs .omp/extensions/harness/index.ts
# 소비 리포 (§5.2) — 읽기 전용
cd /home/rae/orca/workspaces/game-design/trigger-happy && grep -rnoE "(^|[^a-z_/])(harness-)?($NAMES)(\.md)?" . --include='*.md' --include='*.mjs' --include='*.ts' --include='*.sh' --exclude-dir=.git | sort | uniq -c | sort -rn
```

규칙 파일 무변경 확인: `git diff --stat main -- .omp/rules scripts .omp/extensions`가 비어 있어요.

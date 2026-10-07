# Scope Self-Detect Policy (L1)

## 목적

작업 세션(working session) 도중 에이전트가 대화에 등장한 **scope-add / fix / 새로 도입된 요구**를
스스로 감지하여, 충실도 불변식(*모든 코드변경 ↔ 추적가능·테스트가능 AC ≥ 1*)이 깨지지 않도록
in-agent에서 1차로 메우는 규칙을 정의한다.

사용자가 완전한 스펙을 매번 밀어넣는 **push**에 의존하지 않고, 부족분을 시스템이 **질문으로 당기는
(pull)** 동작으로 전환한다. (analysis Q6 / seed AC5)

이것은 **에이전트 행동 규칙**이다 — 코드 게이트가 아니라 에이전트가 매 턴 준수하는 의미기반 정책이며,
`AGENTS.md`/rules에서 링크되어 상시 로드된다. 기계적 backstop은 L2(`acceptance-gate.mjs`)가 담당한다.

## 감지 대상 (트리거)

작업 세션 중 아래가 대화에 나타나면 L1이 발화한다.

| 트리거 | 예 |
|------|------|
| scope-add | "그것 말고 X도 해줘" — 기존 seed AC가 덮지 않는 새 산출 |
| fix / 회귀 | "방금 변경이 Y를 깨뜨렸다, 고쳐" — 새 수정 요구 |
| 새 요구 발견 | 구현 중 파생 요구·엣지케이스가 드러남 |

비대상(발화하지 않음): 스타일/nit, 표현 다듬기, **이미 active AC가 덮는 draw-down(소진)**.
draw-down은 새 AC가 아니라 `current-scope.md` 체크오프로만 처리한다(작업 ⊆ seed; analysis Q9.1).

## 동작 — silent-append vs 질문

감지하면 에이전트는 먼저 그 변경에 대한 **AC를 제안**한다. 이후 둘 중 하나로 분기한다.

1. **silent-append (흔한 경우)** — 변경이 **테스트가능 AND 명확(경계 분명)**하면 질문 없이 active scope에 추가한다.
   - **draw-down 정제** (기존 seed AC를 더 잘게 쪼갠 스레드 AC): `current-scope.md`의 `## Acceptance Criteria`에 체크박스로 append (thread window).
   - **진짜 새 요구** (amend, 작업 ⊄ seed): `seed_evolution_policy.md` 절차를 그대로 따른다 — `seed.yaml`의 해당 필드(`acceptance_criteria`/`constraints`/`risks`) 수정, `version +1`, `audit.jsonl`에 `seed_revised` 기록, `current-scope.md` 동기화. **신규 메커니즘 발명 없이 기존 진화 절차를 재사용**한다.
2. **질문 (push→pull)** — 아래 Q6.3 임계 중 하나라도 해당하면 silent-append 대신 사용자에게 질문해 답을 얻은 뒤 진행한다.

## 질문 임계 (Q6.3) — 충실도 gap에만

질문하는 경우 = **material fidelity gap**. 아래 넷 중 하나라도 해당할 때만 묻는다.

| # | 조건 | 왜 질문인가 |
|---|------|------------|
| i | scope-add에서 **테스트가능 AC를 도출할 수 없음** | 검증 불가 → 충실도 추적 불가 |
| ii | 기존 `constraints` / `out_of_scope`와 **충돌** | 임의 해소는 scope drift |
| iii | 변경의 **경계가 모호**(어디까지인지 불명) | 잘못 좁히거나 넓힐 위험 |
| iv | **coverage 잔차** — 원본 요구의 일부만 덮임 | 누락이 silent하게 남음 |

**질문하지 않음**: 스타일/nit, 그리고 명확·테스트가능한 변경(→ silent append, 흔한 경우).

**배치(batch)**: 질문은 **매 발화마다 하지 않는다.** 자연 체크포인트(예: 커밋/슬라이스 종료)에 모아서
한 번에 묻는다 — 작업 흐름을 끊지 않기 위해. (analysis Q6.3)

## L1 / L2 / thread-scope 관계

| 층 | 무엇 | 성격 | 시점 | 역할 |
|----|------|------|------|------|
| **L1 (이 정책)** | in-agent 자가감지 | soft·연속·의미기반 | 대화 중(매 턴) | **primary** — 정확하지만 에이전트 준수에 의존 |
| **L2 (`acceptance-gate.mjs`)** | commit backstop | hard·기계적 | 커밋 시 | L1 누락 포획 — 코드변경인데 매칭 active AC 없으면 차단/질문 |
| **`thread-scope.mjs`** | scope 물질화 | 도구 | 스레드 open/close | active seed에서 `current-scope.md` 재생성 + audit provenance |

- L1은 **의미를 읽어** 대화에서 미리 잡는다(정확하나 regex 불가, 에이전트 준수에 의존). L2는 **기계적**으로 커밋 순간 L1이 놓친 변경을 포획한다(신뢰가능하나 의미는 못 읽음). 둘은 한 불변식을 지키는 두 안전망 — **primary(L1) + backstop(L2)**.
- L1이 silent-append/amend로 갱신하는 대상(`current-scope.md`/`seed.yaml`)이 곧 `thread-scope.mjs`가 물질화하고 `acceptance-gate`(L2)가 읽는 파일이다. → L1이 제대로 작동하면 L2는 대부분 **침묵(draw-down)**; L1이 놓쳤을 때만 L2가 발화한다. (analysis Q9.2 — graceful degradation.)

## 예시 (동작)

**(A) silent-append.** 세션 중 사용자: "로그인에 rate-limit도 걸어줘." 기존 seed AC에 없는 새 요구이나
테스트가능·명확("N회 초과 시 429 반환") → 질문 없이 `seed.yaml`의 `acceptance_criteria`에 AC를 추가하고
`version +1`, `audit.jsonl`에 `seed_revised` 기록, `current-scope.md` 동기화 후 그대로 구현을 진행한다.

**(B) 질문.** 사용자: "성능도 좀 좋게 해줘." 경계 모호(iii) + 테스트가능 AC 도출 불가(i) → silent-append
금지. 다음 체크포인트(커밋 전)에 묶어 질문한다: "성능 기준을 무엇으로 검증할까요? (예: p95 < X ms /
처리량 ≥ Y)". 답을 받아 테스트가능 AC로 변환한 뒤 append한다.

## 금지 사항 (MUST NOT)

| 금지 | 이유 |
|------|------|
| 모호·비테스트 변경을 임의 해석해 silent-append | 잘못된 AC가 충실도를 왜곡 |
| `out_of_scope`/`constraints` 충돌을 사용자 확인 없이 해소 | scope drift (`seed_evolution_policy.md`의 out_of_scope 축소 절차 위반) |
| 스타일/nit마다 질문 | 마찰·과탐 (Q6.3 위반) |
| 매 발화마다 질문(체크포인트 batch 무시) | 작업 흐름 단절 (Q6.3 위반) |
| L1에서 잡았다는 이유로 L2 backstop을 우회/무력화 | backstop은 독립 안전망 — 끄지 않는다 |

## 연계 문서

- `docs/rules/seed_evolution_policy.md` — silent-append(amend) 시 seed 수정·version·audit 절차의 출처.
- `docs/rules/seed_contract.md` — `acceptance_criteria`/`constraints`/`out_of_scope` 필드 의미.
- `.omp/extensions/harness/gates/acceptance-gate.mjs` — L2 commit backstop.
- `.omp/extensions/harness/thread-scope.mjs` — `current-scope.md` 물질화 + audit provenance.
- `claudedocs/harness-auto-capture-analysis.md` (Q6, Q9) — 설계 근거.

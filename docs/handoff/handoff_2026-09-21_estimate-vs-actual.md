# Handoff: 작업 무게 예측 ↔ 실측 대조 로그 (estimate-vs-actual)

- 발신: chats 리포 세션 (2026-09-21)
- 수신: omp 리포(하네스 SoT) 작업 세션
- 상태: 마감 (#32 #33 #34 / 81f620f — harness 2026.78)

## 한 줄 요약

인테이크(kickoff / cycle intake) 시점에 **예상 위험 등급·파일 수·추론 깊이·사용 모델**을 한 줄 기록하고, 커밋 시점에 `risk-assess`의 **실측 결과**를 같은 레코드에 붙여 `audit.jsonl`에 남깁니다. 목적은 자동 라우팅이 아니라, 몇 달 뒤 `rules/agent_routing.md`의 모델·에포트·에이전트 선택 기준을 **실측 근거로 갱신**할 수 있는 데이터를 만드는 것입니다.

## 배경 — 어디서 온 아이디어인가

[BoxBy/viper-plugin-cc](https://github.com/BoxBy/viper-plugin-cc)의 `references/rules/common/complexity-matrix.md`를 분석했습니다. 작업 전에 Lv 0-100 점수를 공식(`(Base + Additives − Deduction) × Multipliers`)으로 계산해 팀 스폰 규모와 절차 무게를 결정하는 구조입니다.

분석 결론 (chats 세션 2026-09-21):

| 항목 | 판정 |
|---|---|
| 강제 수단 | 없음. `hooks.json`은 SessionStart 업데이트 체크와 Stop 훅뿐. LLM이 스스로 점수를 매기고 스스로 따름 |
| 입력값 | "5+ 파일", "hard debug(race)", "core arch 수정" 등 **작업 후에야 판명되는 값**. 사전 Lv는 입력의 추측 |
| 보정 | 문서가 명시: 기존 주관적 Lv와 일치하도록 재보정 → 직관을 재현하는 순환. 남는 가치는 정확도가 아니라 감사 가능성 |
| 실질 효과 | 개인 하네스 Base=40 고정이라 "기존 패턴 공제(−20) 없으면 팀 스폰"으로 환원 |
| 자기 모순 | 같은 `advisor.md`가 CodeRabbit 인용으로 과도한 fan-out(탐지율↓, 비용 1.5–3배)을 경고하면서 Lv 21+(3파일 버그 수정)에 워커 2명 + codex 계획 리뷰 + 편집마다 pi 교차검증을 강제 |
| 가져올 것 | 공식이 아니라 **"예측을 적어두고 실측과 대조한다"**는 루프 하나 |
| 가져오지 말 것 | Lv 21+ 팀 스폰 기본값, 편집마다 교차검증, 예측 기반 게이트 완화 |

우리 하네스와의 대비:

| | viper `complexity-matrix` | omp `risk-assess.mjs` |
|---|---|---|
| 시점 | 작업 전 (예측) | 커밋 직전 (실측) |
| 입력 | 모델의 자기 판단 | 실제 diff: 경로 패턴 + 변경 줄 수 |
| 측정 대상 | 인지 난이도 | 폭발 반경 |
| 강제 | 프롬프트 | `.githooks/pre-commit` 차단 |
| 작업 방식 영향 | 큼 | 없음 (커밋 허용 여부만) |

두 하네스 모두 **예측 vs 실측 대조**는 갖고 있지 않습니다. 그 빈자리가 이 작업의 범위입니다.

## 왜 하는가 — 그리고 무엇을 기대하면 안 되는가

**기대하는 것**
1. 예측기(에이전트/사용자)의 계통 편향 노출 — 예: "마이그레이션 계열은 파일 수를 절반으로 잡는다".
2. `(예상 등급 × 추론 깊이 × 사용 모델) → 결과 품질` 표의 원자료. 이것이 있어야 "high + Sonnet급 = 재작업 1.4회 → high는 Opus" 같은 라우팅 규칙 갱신이 근거를 갖습니다.

**기대하면 안 되는 것**
- 예측 정확도가 올라간다고 모델 선택 근거가 자동으로 생기지 않습니다. 예측 대조는 "얼마나 컸나"에 답하고, 모델 선택은 "그 크기를 이 모델로 했을 때 결과가 어땠나"를 필요로 합니다. 후자는 결과 품질 신호(재작업·검증 실패·리뷰 verdict)를 별도로 붙여야 합니다.
- 개인 하네스는 표본이 적습니다(주 10–20 커밋). 셀당 의미 있는 수가 모이는 데 몇 달이 걸리므로, **v1의 산출물은 "기록 + 손으로 읽는 표"**입니다. 자동 추천은 비범위입니다.

## 축은 두 개

`risk-assess`가 재는 폭발 반경과, 모델·에포트를 가르는 **추론 깊이**는 독립입니다.

- 500줄 기계적 rename: 폭발 반경 high, 추론 깊이 low → 값싼 모델로 충분
- 20줄 동시성 버그: 폭발 반경 medium, 추론 깊이 high → 비싼 모델 필요

viper가 두 축을 한 숫자로 뭉갠 것이 그 도구의 결함이었습니다. 예측 레코드는 두 값을 **따로** 적습니다. 위험 등급은 실측(`risk-assess`)과 대조되고, 추론 깊이는 실측 대상이 없으므로 결과 품질로만 사후 검증됩니다.

## 설계 제안

### 1. 예측 레코드 (인테이크 시점)

기존 플래그 파일들(`review-skip`, `backpressure-skip`)과 같은 **JSON 튜플 + 버전 태그** 관례를 따릅니다.

```
["omp-estimate/v1", <risk>, <files>, <depth>, <model>, <effort>, <ts>]
  risk   : "low" | "medium" | "high" | "critical"   — risk-assess taxonomy 그대로
  files  : 정수 (예상 변경 파일 수)
  depth  : "low" | "high"                            — 추론 깊이, 거친 2단계로 시작
  model  : 문자열 (예: "claude-fable-5", "sonnet")  — 세션이 아는 값
  effort : 문자열 또는 null (예: "medium", "high")
  ts     : ISO 8601
```

**저장 위치 — 작업 세션에서 선택** (권장은 B):

| 안 | 위치 | 장점 | 단점 |
|---|---|---|---|
| A | `.omp/harness-state/cycle-estimate` | 기존 one-shot 플래그 관례(`commit-wip`) 그대로, post-commit 소비 경로 재사용 | 다세션 사이클에서 `/clear`·세션 교체 시 유실 가능. gitignored라 소비 리포 간 이동 없음 |
| B | `docs/harness/cycle-estimate` (gitignored, `review-skip`과 동일 취급) | 다세션 사이클에서도 잔존. post-commit 소비 대상 화이트리스트(`docs/harness/*`)에 이미 같은 패턴 존재 | 화이트리스트에 경로 1개 추가 필요 |
| C | kickoff `seed.yaml` 필드 | 정식 경로(kickoff)에서는 이미 audit 이벤트를 남기므로 자연스러움 | 채팅 인테이크(cycle intake) 경로를 덮지 못함 → 어차피 A/B 중 하나가 추가로 필요 |

권장: **B를 기본 + C를 kickoff 경로의 파생 기록**(kickoff Step 6이 `current-scope.md`를 파생물로 쓰듯, seed의 estimate 필드에서 `docs/harness/cycle-estimate`를 생성).

### 2. 규칙 변경 (에이전트 행동)

- `rules/cycle_definition.md` "판정 방법" 출력 형식에 한 줄 추가:
  ```
  판정: 1사이클 | 분할 제안 | 확인문장 필요
  확인 문장: <한 줄>
  예상: 위험 <low|medium|high|critical> / 파일 <n> / 깊이 <low|high>
  ```
  그리고 판정이 "1사이클"이면 레코드 파일을 쓴다는 MUST. **사이클 미만(오타 등)은 생략** — 과잉 발동 금지 조항과 정합.
- `.omp/skills/kickoff/SKILL.md`: seed에 estimate 필드 추가, Step 6에서 레코드 파일 파생.
- `rules/agent_routing.md`: "라우팅 기준(모델/에포트/reviewer 임계) 변경 시 `scripts/estimate-report.mjs` 출력을 근거로 인용한다"는 한 줄. **기준 자체는 이번에 바꾸지 않습니다.**

### 3. 게이트 대조 (커밋 시점)

- 커밋 게이트 디스패처(`commit-gates`)가 이미 `assessRisk(cwd, form)`를 호출하므로, 레코드 파일이 있으면 **hook mode에서** `pending-consume` 경로로 post-commit에 다음 두 가지를 위임:
  1. `audit.jsonl`에 이벤트 append — 기존 `{ts, event, actor, meta}` 형식:
     ```json
     {"ts":"…","event":"estimate_vs_actual","actor":"<session/agent>",
      "meta":{"predicted":{"risk":"medium","files":3,"depth":"low","model":"…","effort":"…","ts":"…"},
              "actual":{"risk":"high","diffSize":142,"files":5,"reason":"142+ lines of code changed"},
              "commit":"<sha>"}}
     ```
  2. 레코드 파일 소비(unlink).
- **레코드 파일 부재 시 게이트 동작 불변.** 판정(allow/block)에 레코드는 **절대 관여하지 않음** — 예측 기반 완화는 비범위이자 금지.
- `-a`/unverifiable form: 기존 review-gate의 TOCTOU 처리와 동일 스탠스(hook mode 지연 소비). 비-hook 경로에서는 기록하지 않아도 무방(비-hook 경로는 이미 게이트 판정을 하지 않음).
- 결과 품질 신호는 v1에서 **하나만**: 레코드 생성 시각 이후 `backpressure-status`가 FAIL을 기록한 횟수(구현이 가볍다면). 재작업 횟수(같은 AC로 커밋 재시도)는 커밋↔사이클 연결이 필요해 v2로 보류.

### 4. 리포트

`scripts/estimate-report.mjs` (또는 문서화된 `jq` 한 줄): `audit.jsonl`의 `estimate_vs_actual`을 읽어 다음 두 표를 출력.

1. 편향 표: 예상 등급 × 실측 등급 교차표 + 파일 수 예측 오차(예상/실측 비율 중앙값).
2. 셀 표: (예상 등급, 깊이, 모델) 그룹별 건수 + FAIL 횟수 합.

읽는 사람은 사람입니다. 임계값 제안·자동 추천 없음.

## 사이클 분할 제안 (cycle_definition 기준)

| # | 사이클 | 확인 문장 |
|---|---|---|
| ① | 레코드 형식 + 규칙 (cycle_definition / kickoff / agent_routing 문구, 레코드 파일 관례) | 채팅 인테이크 출력에 `예상:` 줄이 포함되고 `docs/harness/cycle-estimate`에 v1 튜플이 기록된다 (스모크: 가상 지시 1건) |
| ② | 게이트 대조 + audit 이벤트 + 소비 | 레코드가 있는 상태로 `git commit` → landed commit 후 `audit.jsonl`에 `estimate_vs_actual` 1건, 레코드 파일 소멸; 레코드 없이 커밋 → `audit.jsonl` 변화 없음 (hook-gates 테스트 픽스처로 재현) |
| ③ | 리포트 스크립트 | 픽스처 `audit.jsonl` 5건 입력 시 편향 표·셀 표가 기대 값으로 출력된다 |

①은 문서·규칙만이라 docs-only 검증 경로. ②는 게이트 코드 변경이라 high 가능성 → 리뷰 증거 예고. ③은 독립.

## 수용 기준 제안

- AC1: 레코드 파일 부재 시 모든 게이트의 allow/block 판정과 stderr 출력이 **바이트 단위로 불변** (기존 테스트 전량 통과).
- AC2: 레코드 파일 존재 여부·내용은 어떤 경우에도 게이트 판정에 영향을 주지 않는다 (판정 경로에서 레코드를 읽지 않음을 테스트로 고정).
- AC3: hook mode 커밋 착지 시 `estimate_vs_actual` 이벤트가 정확히 1건 append되고 레코드가 소비된다; 커밋 실패(게이트 차단) 시 append·소비 모두 발생하지 않는다.
- AC4: 형식 오류 레코드(태그 불일치, 필드 누락)는 **무시 + stderr 경고 1줄**, 차단하지 않는다 (관측 도구가 작업을 막으면 안 됨).
- AC5: `rules/cycle_definition.md` 출력 형식에 `예상:` 줄이 추가되고 사이클 미만 생략 조항과 충돌하지 않는다.
- AC6: 리포트가 픽스처에서 결정적으로 같은 표를 출력한다.
- AC7: `claudedocs/CLAUDEKR.md` 동기 여부 명시 (AGENTS.md 변경이 없으면 "변경 없음"으로).

## 비범위 (명시)

- 모델·에포트·에이전트 **자동 선택** 또는 추천 문구 출력.
- 예측값에 따른 게이트 임계 완화/강화 — 금지.
- viper식 점수 공식 도입.
- 재작업 횟수(커밋↔사이클 연결) — v2.
- `rules/agent_routing.md`의 라우팅 **기준값** 변경 — 데이터가 쌓인 뒤 별도 사이클.

## 검증 환경

- omp 리포 `tests/hook-gates.test.mjs`가 게이트 픽스처(임시 git repo + `.githooks/pre-commit` 실행)를 이미 갖고 있으므로 ②의 확인 문장은 그 픽스처에 케이스를 추가해 재현.
- chats 리포는 하네스 소비자라 ①의 규칙 변경이 sync로 착지하는지 확인용(다음 harness-check).

## 관련

- #29 rules/ 생사 감사 — ①에서 `cycle_definition.md`·`agent_routing.md`를 건드리므로 조율.
- #15 cross-repo 갭 — 레코드 파일이 세션 리포 기준이라 타 리포 커밋에는 대조가 붙지 않음(동일 한계, 별도).
- #17 tests/ 미동기화 — 소비 리포에서 ②의 테스트가 stale로 실패할 수 있음(기존 문제, 이 작업의 범위 아님).
- 선행 handoff 형식: `docs/harness/handoff_2026-09-02_sync-commit-gates.md`.
- 출처 분석: viper `complexity-matrix.md` / `advisor.md` / `hooks.json` (2026-09-21 chats 세션에서 직접 읽음).

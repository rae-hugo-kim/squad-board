# Handoff: 소비 리포의 harness-sync 커밋이 커밋 게이트에 상시 차단됨

- 발신: chats 리포 세션 (2026-09-02)
- 수신: omp 리포(하네스 SoT) 작업 세션
- 상태: 마감 (#17 #24 #26 #27 #28 / 128758e — 후보 C 채택, harness 2026.74)

## 배경

#26 조사로 소비 리포 9개에 `core.hooksPath=.githooks`를 연결한 뒤, chats에서 harness-sync(2026.70→2026.73) 결과를 커밋하려 하자 `.githooks/pre-commit`이 처음으로 실제 판정을 내려 **차단**했습니다. 지금까지는 훅이 비활성(#26)이라 드러나지 않았을 뿐, **모든 소비 리포 × 모든 sync 커밋에서 재현되는 구조적 문제**입니다.

## 재현 (chats, 2026-09-02)

스테이징 내용: harness-sync 2026.73 결과 28파일(+1,237/−1,250) + `scripts/docs-drift` 삭제 + `docs/README.md` 1줄. `git commit` 결과:

```
HARNESS WARNING: No scope file. Run /kickoff to define acceptance criteria.
HARNESS BLOCK: No build/test verification for high-risk changes.
Run tests first, or create docs/harness/backpressure-skip to override.
HARNESS BLOCK [backpressure-gate.mjs]: this gate blocked the commit …
HARNESS BLOCK: high risk changes (3127+ lines of code changed) require review evidence.
A HIGH/CRITICAL commit needs ONE of (1) heterogeneous model review sidecar / (2) human review sidecar / (3) audited override docs/harness/review-skip
HARNESS BLOCK [review-gate.mjs]: this gate blocked the commit …
```

정당한 통과 경로를 실제로 시도한 결과:

- **backpressure**: `node --test tests/*.test.mjs` → **328 중 24 실패**. 전부 stale — chats의 `tests/`는 init 템플릿 사본(2026-07-15)이고 화이트리스트 밖이라 갱신되지 않은 채 2026.73 코드를 검사합니다 (예: `index.ts`에 옛 `astEditPreview` 상수가 있어야 한다는 단언). **#17 그대로**입니다.
- **review**: 커밋 내용은 `harness/2026.73`(197b7b8) 태그의 remote-wins 원본 복사 — 검토·테스트는 상류(omp)에서 이미 끝난 코드입니다. 이종모델 리뷰(1)는 비용 대비 효용이 없고, 사람 리뷰(2)는 매 sync마다 수천 줄, override(3)는 매번 수작업.

## 원인

1. `risk-assess.mjs`: 코드 변경 >100줄 → HIGH (AGENTS.md 정의). sync 번들은 항상 수천 줄이므로 무조건 HIGH. **번들의 출처(harness-meta.json `commit_sha`의 태그 트리와 일치)를 고려하지 않습니다.**
2. `backpressure-gate.mjs`: 고위험 + 검증 상태 파일 부재 → BLOCK. sync 자체는 검증 행위를 남기지 않고, 소비 리포에서는 #17로 테스트 검증이 불가능합니다.
3. `review-gate.mjs`: HIGH면 증거 3종 중 하나를 요구. sync 번들에 맞는 증거 형태가 없습니다.

## 영향

- 소비 리포에서 sync 후 커밋하려면 매번 `review-skip` + `backpressure-skip` 수작업 → override가 상례가 되어 감사 신호가 희석되고, 현실적으로 `--no-verify` 습관을 유도합니다 (에이전트 경로는 tripwire가 막지만 사람 경로는 열려 있음).
- "다 막는 건 비용>효용" 원칙(2026-09-02 세션 결정)과 정면충돌.

## 해법 후보 (선택은 작업 세션에서)

|안|내용|장점|단점/주의|
|---|---|---|---|
|**A. sync가 자체 증거 생성**|`harness-sync.sh` 완료 시 `docs/harness/review-skip`·`backpressure-skip`을 태그 SHA 근거로 자동 작성 (`"harness-sync remote-wins copy of harness/<ver> <sha>"`, approved_by=실행자). 게이트가 소비·`audit.jsonl` 기록|게이트 로직 무변경, 감사 추적 유지|override 이벤트와 구분이 안 되면 신호 희석 → `harness_sync` 이벤트 타입으로 분리 권장. 사용자 코드가 같이 스테이징돼도 통과시키면 우회 경로가 됨 → 스테이징이 화이트리스트 경로만인지 확인 필요|
|**B. risk-assess가 sync 번들 인식**|스테이징 파일이 전부 화이트리스트 경로이고 내용이 태그 트리와 일치하면 LOW/MEDIUM|근본적, 우회 불가|게이트에서 네트워크 없이 대조하려면 sync 시 파일별 해시 manifest를 `harness-meta.json` 옆에 남기고 게이트가 대조해야 함|
|**C. A+B**|sync가 manifest를 남기고, 게이트는 manifest 일치분을 제외한 나머지만 위험 산정|화이트리스트 밖 변경이 섞이면 정상 판정 유지|구현량 최대|
|**D. #17만 해결**|tests/ 동기화로 backpressure 정당 경로 복원|독립적으로 가치 있음|review-gate는 여전히 차단 → 이 문제의 해법은 아님|

## 수용 기준 제안

- AC1: 소비 리포에서 harness-sync 직후 `git add -A && git commit`이 override 파일 수작업 없이 통과한다 (재현: chats 현 상태 또는 tmp 소비 리포).
- AC2: sync 번들에 화이트리스트 밖 변경(사용자 코드)이 섞여 스테이징되면 **여전히 정상 위험도로 판정**된다 — 우회 경로가 되지 않는다.
- AC3: 순수 sync 커밋도 `docs/harness/audit.jsonl`에 식별 가능한 이벤트로 남는다 (감사 추적).
- AC4: omp `tests/` 회귀 없음.
- AC5: 동작이 #17(tests 동기화) 해결 여부와 독립적이다.

## 검증 환경

- **chats 리포가 재현 환경 그대로입니다**: 2026.73 sync 적용 + hooksPath 연결 + 33개 변경 스테이징, 커밋 미실행 상태로 대기 중. `git -C ~/projects/workspace/chats commit`을 다시 시도하면 동일 판정이 재현됩니다.
- game-design, ajoshplayer도 `scripts/docs-drift` 삭제가 스테이징된 채 대기 중 (동일 차단 예상).

## 비범위

- #17(tests/ 동기화) 자체, #26(init 결함) 자체 — 별도 이슈.
- `--no-verify` tripwire 완화 — 금지.
- 게이트의 일반 위험 판정 기준(>100 LOC, 보안 패턴) 완화 — 이 문제의 범위 아님.

## 관련

- #17 harness-sync: tests/ 미동기화 → 다운스트림 stale 실패 (backpressure 정당 경로 부재의 원인)
- #26 init: 훅 미활성화 + 소스 전용 자산 복사 (이 문제가 지금까지 숨어 있던 이유)
- #24 화이트리스트 신규 항목 1사이클 지연 (manifest 설계 시 함께 고려)
- #25 compush/compr bump-nudge (sync 커밋 흐름과 인접)

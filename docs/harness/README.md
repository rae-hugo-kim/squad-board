# Harness Outputs

이 디렉터리는 현재 하네스의 구조화 산출물을 모아두는 기본 위치다.

## Files

### `kickoff-summary.md`
- 사람이 읽는 킥오프 요약
- 맥락과 의사결정 이유를 남긴다

### `seed.yaml`
- 하네스가 읽는 구조화 명세
- `startdev`의 기본 입력

### `rubric-report.md`
- kickoff 품질 판정 결과
- follow-up 필요 여부와 override 흔적 기록

### `audit.jsonl`
- append-only 감사 로그
- kickoff 완료, seed 생성, override, startdev 시작 같은 핵심 이벤트를 기록

### `verify-commands.json` (선택)
- 프로젝트 고유 검증 명령 등록 — `{"test": ["bash bpy/bench/run.sh"], "lint": [], "build": []}` 리터럴 접두사
- backpressure 트래커가 내장 표(`npm test`, `node --test`, `pytest`…)보다 먼저 대조한다 (`.omp/rules/harness-harness_integration_contract.md` §3)

## Operating Rules

- `kickoff`는 최소 `kickoff-summary.md`, `seed.yaml`, `rubric-report.md`를 생성해야 한다
- `startdev`는 가능하면 `seed.yaml`을 우선 입력으로 읽는다
- 민감 정보가 있는 로그는 이 디렉터리 대신 로컬 상태 위치로 분리할 수 있다

## Related Docs

- `docs/rules/seed_contract.md`
- `docs/rules/kickoff_output_contract.md`
- `docs/rules/startdev_seed_contract.md`
- `docs/rules/closeout_contract.md`
- `docs/checklists/kickoff_rubric_checklist.md`
- `docs/templates/seed.template.yaml`
- `docs/templates/rubric-report.template.md`
- `docs/templates/kickoff-summary.template.md`

# Plan Attack Report — precommit-gate-enforcement (run 1)

**Date**: 2026-07-29
**Task**: 20260729-132948-e510 (seed v1)
**Critic verdict**: REJECT (1 CRITICAL + 4 HIGH + 3 MEDIUM)
**Gate policy**: run_count=1 → WARN (진행 가능) — 단, CRITICAL이 실측 검증된 사실 오류라 seed v2로 보완 후 진행
**Full transcript**: `history://PlanAttack`

## Findings → Disposition

| # | Sev | 발견 (요지) | 처분 (seed v2) |
|---|---|---|---|
| A1 | **CRITICAL** | merge·cherry-pick·revert·rebase는 pre-commit 미발화 (git 2.43.0 실측). assumption "표준 의미론 그대로"는 사실 정반대. denylist 제거 후 이 경로들은 어느 층에도 안 걸림 | AC1을 "경로축 집행 매트릭스"로 재구성: plain/amend→pre-commit, merge→**pre-merge-commit 훅**, rebase→**pre-rebase 훅**, cherry-pick/revert→canonical verb tripwire, + post-commit 백스톱(사후 감지 advisory). assumption 교체 |
| A2 | HIGH | "구조적 소멸"은 hooksPath 활성 레포에서만 성립 — 미활성 레포는 무게이트로 전락 | goal을 관할 의미론으로 재서술(하네스 없는 레포=관할 밖, 의도된 skip). consumer 공백은 명시적 interim risk + 후속 배포 우선순위 |
| A3 | HIGH | 게이트 4종은 stdin `tool_input.command`에 결합(조기종료·parseCommitForm·diff 스코프) — 훅 시점엔 command가 없음. 어댑터 재작성이 AC에 미열거 | 신규 AC6: 훅-모드 어댑터 (command 결합 제거, diff=--cached 고정, 조기종료 대체). assumption 정정 |
| B1 | HIGH | AC1 "대표 철자 2~3케이스"는 6차 FAIL 안티패턴 재판 — 실구멍은 철자축이 아니라 경로축 | AC1 매트릭스로 교체 (A1과 동일 처분), 철자 스모크는 1건으로 축소 |
| B2 | MEDIUM | tripwire 명세 구멍: `-n`(독립 별칭), `--git-dir/--work-tree` 최상위 리타게팅 | AC3 명세에 추가 |
| B3 | HIGH | AC2가 7/24 픽스처 재사용에 의존 — 그 픽스처는 제거 예정인 명령층 귀속 검증용, 새 메커니즘을 운동 못 시킴 | AC2를 신규 픽스처로 재정의 (훅 활성 consumer 레포 + omp 세션 cwd 커밋 실증) |
| C1 | HIGH | 7/24분 16파일의 유지/폐기 파일·헌크 매니페스트 부재 — executor가 결정적으로 흡수 불가 | 신규 AC7: 구현 1단계 산출물로 absorption-manifest.md 작성 |
| C2 | MEDIUM | review-gate의 git-추적 파일 변형(audit append·review-skip unlink)이 훅 시점에선 커밋 밖 잔여로 의미 반전 | AC6에 부작용 쓰기 재배치(사후 기록화) 포함 |
| C3 | MEDIUM | 훅 exit 2는 에이전트에게 "git 실패"로만 보여 무한 재시도 루프 위험 | AC6에 차단 메시지 계약(`HARNESS BLOCK:` 프리픽스, 수정-지시형 본문) 포함 |

## 판단 근거

- critic의 CRITICAL은 임시 레포 실측(발화 매트릭스)으로 뒷받침됨 — 반박 불가, 수용.
- 훅 추가(pre-merge-commit·pre-rebase)와 canonical verb 2종(cherry-pick·revert)은 "git-정의 유한면" 원칙 안에 있음 — 철자-열거 회귀 아님.
- AC 5→7 증가는 신규 작업 추가가 아니라 v1에 은폐돼 있던 필수 작업(어댑터·매니페스트)의 표면화.

## v3 재처분 (2026-07-29, 사용자 결정)

위 표의 A1/B1 처분(훅 3종 + verb 감시 2종)은 **과잉으로 기각**하고 v3에서 최소화했습니다:

- **사실은 수용**: 발화 매트릭스 실측(merge·cherry-pick·revert·rebase의 pre-commit 미발화)은 seed assumption에 정정 반영.
- **처분은 축소**: 통합 경로가 옮기는 콘텐츠는 원 커밋 시점에 이미 게이트를 통과한 것 — 새 미검증 diff의 진입로는 `git commit`(plain/amend/충돌해소)뿐이므로 차단면은 pre-commit 하나로 충분. 잔여 경로는 기존 post-commit 훅의 advisory 백스톱 한 줄이 사후 관찰 (N개 사전차단 → 1개 사후관찰).
- **블로킹 표면**: v2안 3개 → v3 1개. pre-merge-commit·pre-rebase 훅과 cherry-pick/revert verb 감시 폐기 — 하네스 부피·마찰 축소라는 재설계 취지에 정합.
- 잔여면(게이트 미경유 원본의 cherry-pick 등)은 assumption·AC5 문서화로 명시.

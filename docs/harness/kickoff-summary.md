# Kickoff Summary: precommit-gate-enforcement

**Date**: 2026-07-29
**Type**: Feature (하네스 재설계)
**Branch**: `rae-hugo-kim/precommit-enforcement`

### JTBD

- User: omp 레포에서 커밋을 만드는 에이전트 세션과 사람 (consumer 8곳 배포는 후속)
- Problem: 커밋 게이트가 명령 문자열 층위의 철자 열거(denylist ~2,000행)로 집행되어 ① 등가 철자에 fail-open(6차 리뷰 FAIL), ② 세션 cwd 기준 판정이라 크로스레포 오귀속, ③ 사람 커밋 미적용
- Success: omp 레포에서 집행이 `.githooks/pre-commit`으로 이동 — 어떤 철자·경로·주체로 커밋해도 index 확정 시점에 대상 레포에서 게이트가 실행되고, 명령 층위는 최소 tripwire로 축소(코드 순감). consumer 배포는 별도 후속.

### Context

- Repo type: single (하네스 소스 레포; consumer 8곳에 harness-sync로 배포)
- Tech stack: Node(mjs 게이트, `node --test`), Bash 훅, OMP extension(TS)
- Build/Test: `node --test tests/*.test.mjs` (현행 234케이스)
- Patterns: `core.hooksPath=.githooks` 활성(pre-push·post-commit 선례), commit-gates.mjs 디스패처(fail-closed), 자식 게이트 4종은 파일 기반 판정(실측 — 세션 상태 의존 없음)
- Risks/constraints: node 부재 환경(→ fail-closed 결정), git-정의 우회 손잡이(--no-verify·hooksPath·GIT_*)는 tripwire + 문서화

### Scope

- MUST: pre-commit 훅 신설(게이트 4종, fail-closed) / 명령층 최소 tripwire 축소 / 7/24 하드닝 흡수(재사용 선별·철자열거 제거) / 크로스레포 귀속 소멸 / 회귀 테스트
- SHOULD: 기존 훅·부트스트랩 정합, 7/24 산출물 아카이브 보존
- MUST NOT: 철자-열거 denylist 확장 재개, consumer 실배포
- OUT OF SCOPE: consumer 8곳 배포(후속 kickoff), 의도적 회피 잔여면 완전 봉쇄(문서화 대체), 샌드박스 수준 집행

### Acceptance Criteria

1. AC1 훅 집행 — 게이트 4종 실행, exit 2 → 커밋 불성립; 대표 철자 2~3 + 사람 커밋 1케이스; node 부재 fail-closed
2. AC2 크로스레포 귀속 소멸 — consumer 픽스처가 대상 레포 기준 판정 (원 문제 해결 증명)
3. AC3 명령층 순감 — 최소 tripwire(--no-verify 축약·hooksPath·GIT_*)만 잔존, 라인수 수치 기록
4. AC4 회귀 없음 — 기존 스위트 + 재구성 테스트 통과
5. AC5 문서 동기화 — AGENTS.md 표·README 게이트 수(기존 drift 2건 포함)·CLAUDEKR

### Edge Cases

- unborn HEAD(최초 커밋), node 부재(fail-closed), core.hooksPath 미설정 클론(bootstrap 책임 명시)
- amend·merge-마무리·cherry-pick은 git 표준 훅 의미론 그대로 (특별 처리 없음)

### Backpressure

- Method: `node --test tests/*.test.mjs` 전 스위트 + 임시 레포 실커밋 스모크(차단/허용 양방향) + 3-pass 적대적 리뷰 PASS 필수 (사용자 지정)
- How to run: `node --test tests/*.test.mjs`; 스모크는 AC1 verify 절차

### 결정 기록 (인터뷰 중 사용자 결정)

- Success 보수화: omp 단독 적용까지가 이번 성공, consumer 배포 분리 (Phase 0)
- 7/24 미커밋분 처분: 재설계에 흡수 (Phase 2)
- tripwire 범위: 최소 (Phase 2)
- 우회 잔여면: tripwire 차단 + 문서화, 완전 봉쇄 비추구 (Phase 2)
- node 부재: fail-closed (Phase 3)
- 검증: 3-pass 리뷰 PASS를 완료 조건에 명시 (Phase 4)
- AC 축소: 7개 초안 → 5개 (스코프 비대 지적 반영 — 이 작업의 본질은 삭감)

---
Kickoff complete. Ready for implementation.
Next: `/startdev` or manual planning.

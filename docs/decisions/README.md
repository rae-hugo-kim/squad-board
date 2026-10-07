# docs/decisions/ — 결정 기록 (ADR)

자명하지 않은 결정의 "왜"를 남기는 판례 보관소. 현행 규칙(무엇을 따르나)은
`.omp/rules/harness-*.md`가, 세션 서사(그날 무슨 일이)는 로컬 아카이브가 담당하고, 여기는
"왜 이렇게 됐나"만 담는다 — 불변 본문 + 날짜 박힌 Amendment로 운영한다.

## 언제 쓰나

- 대안이 여럿이고 기각 사유가 미래에 다시 질문될 결정
- 기존 규칙·구조의 전제를 무너뜨리는 변경
- 세션 마감(sum)에서 승격된 결정 지식

가벼운 결정은 PR 본문의 Decision Log(`templates/decision_log.md`)로 충분하다 —
파일 신설은 위 기준을 넘는 것만.

## 형식

- 파일명: `NNN-slug.md` (3자리 연번)
- 본문: 결정 / 검토한 대안과 기각 사유 / 근거(증거) / 트레이드오프 /
  Revisit Triggers (재검토 조건을 결정 문서 자체에 심는다)
- 확정된 본문은 고치지 않는다 — 후속 변경은 `## Amendment (YYYY-MM-DD)` 추가

## Related

- [`.omp/rules/harness-assetization.md`](../../.omp/rules/harness-assetization.md) — 결정 기록 SHOULD의 원 규칙
- [`.omp/rules/harness-prompt_engineering.md`](../../.omp/rules/harness-prompt_engineering.md) §게이트 철거 — 대안 기각 기록·재발 트리거의 실전 원리

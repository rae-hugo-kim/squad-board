# Implementation Checklist

## Pre-Implementation (Gate 1)

### Task Understanding
- [ ] Epic/task 파일 읽었는가?
- [ ] User stories 파악했는가?
- [ ] Acceptance criteria 추출했는가?
- [ ] Scope boundaries 확인했는가? (뭘 안 하는지)
- [ ] 의존성 파악했는가?

### Test Plan
- [ ] 테스트 계획 작성했는가?
- [ ] Unit tests 목록 있는가?
- [ ] Edge cases 목록 있는가?
- [ ] Integration tests 필요 여부 확인했는가?
- [ ] **사용자 승인 받았는가?**

---

## During Implementation (Gate 2)

### Per TDD Cycle

#### RED Phase
- [ ] 테스트 먼저 작성했는가?
- [ ] 테스트가 실패하는가?
- [ ] 올바른 이유로 실패하는가? (기능 없음, 문법 에러 X)
- [ ] 커밋: `test: add failing test for <feature>`

#### GREEN Phase
- [ ] 최소한의 코드만 작성했는가?
- [ ] 테스트가 통과하는가?
- [ ] 20줄 이하인가?
- [ ] Anti-pattern 체크 통과했는가?
- [ ] 커밋: `feat: implement <feature>`

#### TIDY Phase
- [ ] 방금 작성한 코드만 정리했는가?
- [ ] 테스트가 여전히 통과하는가?
- [ ] 커밋: `refactor: tidy <what>`

### Cycle Completion
- [ ] 모든 테스트 통과?
- [ ] 다음 테스트로 넘어갈 준비?

---

## Post-Implementation (Gate 3)

### Test Coverage
- [ ] 테스트 계획의 모든 항목 구현?
- [ ] 모든 테스트 통과?
- [ ] Edge cases 커버?
- [ ] 테스트 실행 결과 첨부?

### Code Quality
- [ ] 하드코딩된 값 없음?
- [ ] Magic numbers 없음?
- [ ] TODO 주석 없음?
- [ ] console.log / print 디버깅 제거?
- [ ] 에러 무시(empty catch) 없음?

### Scope Compliance
- [ ] 요청한 기능만 구현?
- [ ] Scope creep 없음?
- [ ] Acceptance criteria 모두 충족?

### Commit History
- [ ] 커밋이 atomic (하나당 하나의 변경)?
- [ ] 커밋 메시지 명확?
- [ ] test → feat → refactor 순서 지켜짐?

### Documentation (if needed)
- [ ] 주요 결정 사항 기록?
- [ ] API 변경 시 문서 업데이트?

---

## Final Output Template

```markdown
## Implementation Complete: <task>

### Acceptance Criteria
- [x] Criteria 1 — met
- [x] Criteria 2 — met

### Test Summary
| Type | Count | Status |
|------|-------|--------|
| Unit | N | ✓ Pass |
| Edge | N | ✓ Pass |
| Integration | N | ✓ Pass |

### Commits
1. `abc1234` test: ...
2. `def5678` feat: ...
3. `ghi9012` refactor: ...

### Anti-Pattern Check
- [x] No test-after
- [x] No big bang
- [x] No scope creep
- [x] No hardcoding

### Gate Status
- [x] Gate 1: Test Plan ✓
- [x] Gate 2: TDD Cycles ✓
- [x] Gate 3: Completion ✓
```

---

## Quick Reference

### Must Have Before Start
1. Task understanding (approved)
2. Test plan (approved)

### Must Have Per Cycle
1. Failing test
2. Passing test
3. Clean code

### Must Have Before Done
1. All tests passing
2. No anti-patterns
3. Scope compliance
4. Clean commits

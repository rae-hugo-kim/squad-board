# Test Plan Template

## Task: <task name>

**Date**: YYYY-MM-DD
**Epic**: <epic reference or N/A>

---

## Scope

### In Scope
- Feature 1
- Feature 2

### Out of Scope
- Not doing X
- Not doing Y

---

## Unit Tests

### Feature 1: <name>

| # | Test Case | Input | Expected Output | Priority |
|---|-----------|-------|-----------------|----------|
| 1 | <describe> | <input> | <output> | P1 |
| 2 | <describe> | <input> | <output> | P1 |
| 3 | <describe> | <input> | <output> | P2 |

### Feature 2: <name>

| # | Test Case | Input | Expected Output | Priority |
|---|-----------|-------|-----------------|----------|
| 1 | <describe> | <input> | <output> | P1 |

---

## Edge Cases

| # | Scenario | Input | Expected Behavior | Priority |
|---|----------|-------|-------------------|----------|
| 1 | Empty input | `""` or `null` | Return error / default | P1 |
| 2 | Invalid type | wrong type | Throw TypeError | P1 |
| 3 | Boundary - min | minimum value | Handle correctly | P1 |
| 4 | Boundary - max | maximum value | Handle correctly | P1 |
| 5 | Special chars | `"<script>"` | Escape / reject | P2 |
| 6 | Unicode | `"한글🎉"` | Handle correctly | P2 |
| 7 | Concurrent | simultaneous calls | No race condition | P2 |

---

## Integration Tests (if applicable)

| # | Scenario | Components | Expected | Priority |
|---|----------|------------|----------|----------|
| 1 | <e2e flow> | A → B → C | <outcome> | P1 |

---

## Test Implementation Order

구현 순서 (의존성 고려):

1. [ ] Unit Test 1.1 (P1) — 가장 기본
2. [ ] Unit Test 1.2 (P1)
3. [ ] Edge Case 1 (P1) — empty input
4. [ ] Edge Case 2 (P1) — invalid type
5. [ ] Unit Test 2.1 (P1)
6. [ ] Edge Case 3-4 (P1) — boundaries
7. [ ] Edge Case 5-7 (P2) — if time permits
8. [ ] Integration Test 1 (P1) — after units

---

## Acceptance Criteria Mapping

| Acceptance Criteria | Covered By Tests |
|---------------------|------------------|
| User can do X | Unit 1.1, 1.2 |
| System handles Y | Edge 1, 2 |
| Integration with Z | Integration 1 |

---

## Approval

- [ ] Test plan reviewed
- [ ] Coverage is sufficient
- [ ] Order makes sense
- [ ] Ready to implement

**Approved by**: (user confirmation)
**Date**:

---

## Notes

<Any assumptions, dependencies, or concerns>

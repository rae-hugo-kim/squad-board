# TDD Rules - Non-Negotiable

## The Cycle: RED → GREEN → TIDY

```
┌─────────────────────────────────────────────┐
│                                             │
│   RED ──────► GREEN ──────► TIDY ───┐      │
│    │                                 │      │
│    │         (repeat per feature)    │      │
│    └─────────────────────────────────┘      │
│                                             │
└─────────────────────────────────────────────┘
```

## RED: Write Failing Test FIRST

### Rules
1. Write the test before any implementation
2. Test MUST fail when first run
3. If test passes immediately → test is wrong, rewrite it
4. Test should fail for the RIGHT reason (missing feature, not syntax error)

### What to Test
```
Given: <precondition>
When: <action>
Then: <expected outcome>
```

### Commit Pattern
```
test: add failing test for <feature>
```

## GREEN: Minimal Implementation

### Rules
1. Write the MINIMUM code to make the test pass
2. "Minimum" means:
   - Hardcoding is OK temporarily
   - No optimization
   - No edge case handling (unless tested)
   - No abstraction
3. If you're writing more than 20 lines → STOP, break down the test

### Forbidden in GREEN Phase
- [ ] Refactoring
- [ ] Adding features not in the test
- [ ] "Improving" existing code
- [ ] Writing additional tests

### Commit Pattern
```
feat: implement <feature>
```

## TIDY: Clean Only What You Touched

### Rules
1. Only refactor code you just wrote
2. Only structural changes (no behavior changes)
3. Tests must still pass after tidying
4. If tests fail → revert immediately

### Allowed Tidyings
- Remove duplication you just introduced
- Extract method from code you just wrote
- Rename variables you just named poorly
- Remove hardcoding from GREEN phase

### Forbidden in TIDY Phase
- [ ] Touching unrelated files
- [ ] Adding new features
- [ ] "While I'm here" cleanups

### Commit Pattern
```
refactor: tidy <what>
```

## Cycle Integrity Checks

### Before Moving RED → GREEN
- [ ] Test exists?
- [ ] Test fails?
- [ ] Test fails for the right reason?

### Before Moving GREEN → TIDY
- [ ] Test passes?
- [ ] Implementation is minimal?
- [ ] No extra code added?

### Before Moving TIDY → RED (next feature)
- [ ] Tests still pass?
- [ ] Only touched files are tidied?
- [ ] Commits are atomic?

## Common Violations

| Violation | Why It's Bad | Fix |
|-----------|--------------|-----|
| Test after code | Test might not catch bugs | Delete code, write test first |
| Big GREEN phase | Hard to debug, scope creep | Smaller test, smaller impl |
| TIDY other files | Unrelated changes, risk | Revert, only tidy your code |
| Skip TIDY | Technical debt accumulates | Always tidy before next RED |
| Multiple features per cycle | Muddled commits, hard to revert | One test, one feature, one cycle |

## The Golden Rule

> "Write a test that fails, write code that passes, clean up the mess — in that order, always."

If you catch yourself doing it differently, STOP and restart the cycle.

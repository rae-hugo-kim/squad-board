# Eval Definition

## Metadata

- **Name**:
- **Target** (feature / behavior / agent):
- **Date**:
- **Owner**:
- **Eval type**: capability | regression | benchmark

## What is Being Evaluated

<!-- One paragraph. What behavior or property does this eval test? Why does it matter? -->

-

## Input Specification

### Test Cases

<!-- MUST cover the primary success path. -->

- T1:
- T2:
- T3:

### Edge Cases

<!-- SHOULD cover at least two boundary or failure-mode inputs. -->

- E1:
- E2:

### Out of Scope

<!-- MAY list inputs this eval explicitly does not cover. -->

-

## Expected Output / Success Criteria

<!-- Describe what a passing response looks like. Be specific enough that two different graders reach the same verdict. -->

- C1:
- C2:
- C3:

## Grader Type

<!-- Mark one or more. If multiple, specify which grader applies to which criterion. -->

- [ ] exact-match — output must equal a fixed string/value
- [ ] includes — output must contain a substring or pattern
- [ ] semantic — meaning-equivalent accepted (use model grader)
- [ ] rubric-based — scored against a rubric (attach rubric below)
- [ ] code-execution — grader runs code and checks exit code / stdout
- [ ] human — flagged for manual review (specify risk level: LOW / MEDIUM / HIGH)

### Grader Details

<!-- Write the grader command, prompt, or rubric here. -->

```
# example code grader
grep -q "expected_pattern" output.txt && echo PASS || echo FAIL
```

## Pass Criteria

| Metric | Target | Notes |
|--------|--------|-------|
| pass@1 |        | First-attempt success rate |
| pass@3 |        | Success within 3 attempts (typical default: > 90%) |
| pass^3 |        | All 3 attempts succeed (use for critical paths: 100%) |

Minimum threshold to ship:

## Anti-Patterns

<!-- Things this eval MUST NOT do. -->

- Do not test more than one behavior per eval — split instead.
- Do not use vague success criteria ("looks good", "seems correct").
- Do not rely solely on human graders for anything that runs in CI.
- Do not write evals after the fact to rubber-stamp existing behavior without running them first.
- Do not skip edge cases because they seem unlikely.

## Notes

<!-- Observations, open questions, known flakiness, links to related evals. -->

-

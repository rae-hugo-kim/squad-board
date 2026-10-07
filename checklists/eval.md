# Eval Checklist (EDD)

Eval-Driven Development: define expected behavior before implementation, then verify.

## Before Implementation

- [ ] Eval cases defined: inputs + expected outputs documented
- [ ] Grader type selected: code-based (deterministic), model-based, or human review
- [ ] Pass criteria set: pass@k threshold specified (e.g., pass@3 > 90%)
- [ ] Baseline recorded (if replacing or modifying existing behavior)
- [ ] Eval storage location created: `.omp/evals/{feature}.md`


## During Implementation

- [ ] Eval cases run after each significant change (not just at the end)
- [ ] Failures analyzed and documented — root cause, not just symptom
- [ ] No eval cases removed or weakened to make results pass


## Before Completion

- [ ] All eval cases pass at defined threshold
- [ ] Eval report generated (capability evals + regression evals + pass@k summary)
- [ ] Results compared to baseline (regressions flagged)
- [ ] Cost per eval run tracked and within acceptable range


## Anti-Patterns (NEVER)

- **Overfitting**: tuning implementation to pass specific eval inputs rather than the general case
- **Cherry-picking**: reporting only passing runs, ignoring failures
- **Removing hard cases**: deleting or skipping eval cases that are difficult to pass
- **Ignoring cost**: running evals without tracking token/time cost per run
- **Skipping regression evals**: only checking new capability, not existing behavior


## Notes

- Prefer code-based graders over model-based — deterministic beats probabilistic.
- If evals are slow, they will not be run. Keep each case fast and targeted.
- Evals are first-class artifacts. Version them alongside code.
- For quality/LLM/visual/statistical bugs, add an eval case instead of (or in addition to) a unit test. See [`bugfix.md`](bugfix.md).

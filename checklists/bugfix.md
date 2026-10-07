# Bugfix Protocol Checklist

- [ ] Add an API-level regression test (or equivalent verification artifact)
- [ ] Add a minimal reproduction test/case/step
- [ ] Make the smallest change that fixes the bug
- [ ] Verify green (fast gate first, then broader gate if needed)
- [ ] Refactor only after green (keep refactors obviously behavior-preserving)

Notes:

- If tests are not feasible in this repo, document a deterministic manual repro procedure instead.
- If the bug is quality/statistical/LLM/visual, prefer adding an eval case + harness run.





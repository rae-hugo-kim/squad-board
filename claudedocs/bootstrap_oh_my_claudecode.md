# Bootstrap Guide: oh-my-claudecode + this policy repo

> **Historical**: this guide describes the Claude Code era of this template (hooks in `.claude/`, registration via `settings.json`). Under the OMP port, gates live in `.omp/extensions/harness/gates/` — see `rules/harness_integration_contract.md`. Kept for history; use `/skill:bootstrap` for setup.

This guide is a manual checklist for verifying your **oh-my-claudecode** environment and this repo's policy layer are aligned.

## 1) Prerequisites

Install and keep the following available before running agent sessions in this repository:

- A working **Codex/Claude Code CLI environment** (the tool you use to run agent tasks).
- Global **oh-my-claudecode harness** integration enabled.
- Global hooks active for:
  - `context-gate` (pre-edit read enforcement)
  - `acceptance-gate` (completion/test gate)
  - `backpressure-gate` (failure throttling)
- Multi-agent orchestration path enabled (architect + executor flow), because this repo assumes delegated code edits and architect verification.

Repo references for those expectations:

- `CLAUDE.md` integration table and assumptions.
- `rules/change_control.md` (context gate; scope drift via Surgical Changes + PR review).
- `rules/verification_tests_and_evals.md` (acceptance/backpressure/architect verification).

## 2) First-run validation sequence (ordered)

Run these checks in order from repo root:

1. **Confirm repo + policy entry points are present**

   ```bash
   pwd
   test -f CLAUDE.md && test -f INDEX.md && echo "policy entrypoints present"
   ```

2. **Confirm hook-related policy docs exist**

   ```bash
   test -f rules/change_control.md && test -f rules/verification_tests_and_evals.md && echo "hook policy docs present"
   ```

3. **Sanity-read integration assumptions**

   ```bash
   sed -n '1,120p' CLAUDE.md
   ```

4. **Verify clean baseline in your working tree**

   ```bash
   git status --short
   ```

5. **Behavior smoke test (manual, required once per machine/profile)**
   - In a low-risk scratch change, attempt each of the following in your normal agent workflow:
     - Edit a file before reading it -> should be blocked by `context-gate`.
     - Claim completion without required verification evidence -> should be blocked by acceptance flow.
     - Repeatedly fail validations -> observe slower progression/backpressure behavior.

If all checks pass, your environment is ready for normal work in this repo.

## 3) Common misconfigurations and quick fixes

- **Symptom:** Agent edits are not blocked when they should be.
  - **Likely cause:** oh-my-claudecode hooks are not active in your current profile/session.
  - **Quick fix:** Re-enable your global harness/hook bootstrap, then rerun the behavior smoke test.

- **Symptom:** Agent can claim done without meaningful verification evidence.
  - **Likely cause:** acceptance/architect stage not wired in current runtime.
  - **Quick fix:** Ensure your run mode includes architect verification and acceptance gating.

- **Symptom:** Excessive friction after failures.
  - **Likely cause:** backpressure behavior is intentionally active.
  - **Quick fix:** reduce retry churn; fix root cause first, then re-run smallest relevant check.

## 4) Minimal sample task + expected enforcement behavior

Use this sample task:

> "Add one sentence to `claudedocs/agreements.md` clarifying that agreements are human notes."

Expected enforcement during execution:

- If the agent edits `claudedocs/agreements.md` before reading it, `context-gate` should block.
- Completion report should include concrete verification (at minimum deterministic file diff/inspection step).
- If validations fail repeatedly, backpressure behavior should appear.

## 5) Reporting environment status in issue/PR templates

Include a short **Environment Status** section in issues/PRs when reporting failures or onboarding problems.

Suggested snippet:

```md
### Environment Status (oh-my-claudecode)
- CLI/runtime: <name + version>
- Harness active: yes/no
- Hooks observed: context-gate=<ok/fail>, acceptance-gate=<ok/fail>, backpressure-gate=<ok/fail>
- Multi-agent orchestration active: yes/no
- Repro command/task: <what you ran>
- Observed behavior: <what happened>
- Expected behavior: <what should have happened>
```

This keeps triage focused on whether the problem is policy content, harness wiring, or task-specific logic.

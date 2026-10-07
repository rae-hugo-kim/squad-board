---
description: "Commit message and PR body discipline, review evidence expectations"
---
# Commit & PR Discipline

## SHOULD: commit in small, reviewable units

- Prefer small commits that reviewers can understand quickly.
- If applicable, avoid mixing large refactors with behavior changes.

## MUST: verification before landing

- Do not declare completion without stating what verification was performed.
- If verification was skipped, state why and what the risk is.

## SHOULD: PR body includes essentials

At minimum:

- Change summary (1–3 bullets)
- Verification performed (tests/evals/manual steps)
- Risk and rollback (if non-trivial)
- Assumptions/decisions (if relevant)

## MUST: merge commit for branches that carry a tag or a mirror stamp

- A PR whose branch already carries a pushed `harness/*` tag, or a `claudedocs/CLAUDEKR.md` stamp (`source_commit_hash`), is merged with a merge commit — never squash or rebase. A squash leaves the tag on an orphan commit (the 2026.74 incident in ADR 001) and moves the AGENTS.md anchor away from the stamped commit, so `docs-drift` fails (measured on PR #55, 2026-09-26).

## Template

- PR description: `../../templates/pr_body.md`





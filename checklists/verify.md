# Verification Checklist

- [ ] Fastest relevant gate was run first (or explained why not)
- [ ] Commands are repo-discovered (not guessed)
- [ ] For user-impacting behavior: at least one reproducible verification artifact exists
- [ ] Any skipped gates are listed with rationale and risk
- [ ] Evidence is cited for version/command/API claims

## Adversarial Verification

- [ ] plan-attack gate passed (or override recorded in audit.jsonl)
- [ ] test-attack gate passed (or override recorded)
- [ ] completion-attack gate passed (or override recorded)


## Docs/Policy-Only Change Mode

Use this mode when changes are limited to markdown/policy navigation/template edits with no runtime behavior impact.

- [ ] Eligibility confirmed: docs/policy/template files only; no code/config/schema/dependency changes
- [ ] Deterministic artifacts captured:
  - [ ] Link integrity check (edited links/anchors resolve)
  - [ ] Cross-reference check (references point to canonical docs)
  - [ ] Rule conflict checklist (no contradictions with `AGENTS.md` and linked rules)
- [ ] Evidence block prepared for docs-only PR:
  - [ ] Changed files listed
  - [ ] Before/after intent documented
  - [ ] Manual validation steps + outcomes included
- [ ] Policy risk level assigned (low / medium / high)
- [ ] Mandatory reviewers identified:
  - [ ] Medium: policy owner/maintainer + verification owner
  - [ ] High: policy owner/maintainer + verification owner + project/repo owner


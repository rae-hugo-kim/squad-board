<!-- policy-sync-warning:start -->
warning_type: reference_only
non_normative_reference_only: true
last_sync_date: 2026-06-10
status: stale
source_of_truth: ../AGENTS.md
source_commit_hash: b379ed5a64db3eea14433d41706b5d385782e203
<!-- policy-sync-warning:end -->

> **Provenance**: upstream Claude Code-era original (long-form expansion of the old `CLAUDE.md`), kept verbatim for history. The current policy entry point is `../AGENTS.md`.

# CLAUDE.md (Team Standard) — Expanded English Reference

This document is the **self-contained, long-form English version** of the agent policy in `CLAUDE.md`.
It is a non-normative reference: the source of truth is always `../CLAUDE.md`.
Unlike `CLAUDE.md`, this file inlines key details from linked modules so you do not need to read them separately.

---

## Overview

This policy is **always-on** agent policy for all repos where it is active. The core philosophy is:

> Deploy correct changes with minimal risk. Prioritize verifiable loops over speed.

The policy is **layered**: `CLAUDE.md` is the short authoritative version. Linked modules expand each rule. This document inlines those expansions for convenience.

---

## Navigation (Source Indexes)

When working in the repo, start with `CLAUDE.md`, then consult:

- `INDEX.md` — top-level directory index
- `rules/INDEX.md` — all policy modules
- `checklists/INDEX.md` — all checklists
- `templates/INDEX.md` — all templates

---

## Scope and Precedence

- This policy applies to the repo/workspace when the agent is active.
- If a linked module conflicts with `CLAUDE.md`, **`CLAUDE.md` wins**.
- This policy **complements** oh-my-claudecode global rules — it does not replace them.

### Priority Order (Conflict Resolution)

When rules conflict, resolve in this order:

1. **Safety & Security** — never compromised
2. **Repo Truth** — lockfiles, manifests, CI config, repo docs are authoritative
3. **Verification** — tests, evals, and replicable checks take precedence over assumptions
4. **Change Control** — minimal change, scoped diffs
5. **Maintainability** — readability and tidy refactors, lowest priority

---

## Terminology (RFC 2119)

- **MUST**: required. If you cannot comply, follow the Exception Protocol.
- **SHOULD**: default expectation; may be skipped with a short, explicit rationale.
- **MAY**: optional.

---

## oh-my-claudecode Integration

This repo assumes **oh-my-claudecode** is active globally. The harness hooks and global agent rules handle the following automatically:

| What | How | Hook Location |
|------|-----|---------------|
| Code changes | Delegated to executor agents | N/A (global rule) |
| Pre-edit file read | `context-gate` + `read-tracker` + `write-tracker` hooks | `.claude/hooks/harness/` |
| Completion verification | Architect agent | N/A (global rule) |
| Backpressure on failures | `backpressure-gate` + `backpressure-tracker` hooks | `.claude/hooks/harness/` |
| Acceptance criteria | `acceptance-gate` hook | `.claude/hooks/harness/` |
| New work detection | `kickoff-detector` hook | `.claude/hooks/harness/` |

All hooks are registered in `.claude/settings.json` and included in the repo.

**What `CLAUDE.md` adds on top of the global rules**: project-specific constraints, evidence standards, and documentation requirements.

### Harness Hook Details

Each hook enforces a specific gate:

1. **`context-gate`** (PreToolUse: Edit/Write) — blocks edits to files that have not been read in the current session. Paired with `read-tracker` and `write-tracker`.
2. **`read-tracker`** (PostToolUse: Read) — records file reads so `context-gate` knows what has been seen. State stored in `.omc/harness-state/read-log.txt`.
3. **`write-tracker`** (PostToolUse: Edit/Write) — records files written so `context-gate` does not re-block editing a file created earlier in the session. Appends to the same `.omc/harness-state/read-log.txt`. Safe because PostToolUse fires only on success and the triggering write was already gated.
4. **`acceptance-gate`** (PreToolUse: Bash) — blocks commits with unmet acceptance criteria. Reads `docs/harness/current-scope.md` checkboxes and `docs/harness/seed.yaml`.
5. **`backpressure-gate`** (PreToolUse: Bash) — blocks commits if a previous build/test/lint run failed. Reads `.omc/harness-state/backpressure-status`.
6. **`backpressure-tracker`** (PostToolUse: Bash) — records build/test/lint outcomes so `backpressure-gate` has current state.
7. **`kickoff-detector`** (UserPromptSubmit) — reminds the agent to run a kickoff for new work. Suppressed by creating `docs/harness/kickoff-done`.

#### Fallback When a Gate is Unavailable

If a required gate is missing, do **not** claim automated harness compliance for that gate. Instead, apply manual downgrade:

- Missing `context-gate` → manually record files read before each edit batch.
- Missing `acceptance-gate` → provide explicit evidence section: commands, outputs, file citations.
- Missing `backpressure-gate` → after any failed verification, halt feature work until failure is resolved.
- Missing Architect verification → complete a second-pass review using `checklists/verify.md` before claiming done.

Final report MUST name which gate was unavailable, how the manual checklist was applied, and the residual risk.

---

## Non-Negotiables (MUST)

These are hard rules with no silent exceptions:

- **No guessing**: do not invent versions, commands, APIs, or files; and do not conclude an artifact is absent from one narrow guess — when its path is uncertain, search broadly first (see `rules/information_discovery.md`).
- **Repo commands**: never guess build/test/lint/typecheck/e2e/eval commands. Discover them from the repo (see Command Discovery section).
- **Risky actions**: require explicit user approval before proposing or executing risky changes.
- **Verification**: every user-impacting change must include at least one reproducible verification artifact.
- **Docs/policy-only mode**: for pure markdown/policy/template edits, follow the docs-only verification path (diff review + checklist) and include its required evidence format.
- **Evidence**: cite concrete evidence for key decisions — file paths + excerpts or command output.
- **Reference doc sync**: in the same PR, update `claudedocs/CLAUDEKR.md` and `claudedocs/CLAUDE_original.md` or explicitly mark them as stale.

---

## Core Principles

### 1. Think Before Coding

State assumptions explicitly before starting. If uncertain, ask.

- If multiple interpretations exist, present them — do not pick silently.
- If a simpler approach exists, say so and push back when warranted.
- Do not invent facts. See Anti-Hallucination section.

### 2. Simplicity First

- Build the simplest thing that works. Add abstraction only when the need is proven (Rule of Three: abstract on the third instance of duplication).
- YAGNI (You Aren't Gonna Need It) and KISS (Keep It Simple, Stupid) apply.
- No future-proofing for requirements that do not exist yet.
- Self-check: "Would a senior engineer say this is overcomplicated?"

### 3. Surgical Changes

- Edit only lines that trace directly to the user's request.
- Match existing code style. Do not "improve" adjacent code while making a change.
- If you notice unrelated issues, mention them explicitly — do not fix them silently.
- Every changed line should be justifiable against the stated request.

### 4. Goal-Driven Execution

- Transform vague tasks into verifiable goals with explicit success criteria.
- "Fix the bug" → "Write a test that reproduces the bug, then make it pass."
- Each step should follow the pattern: [action] → verify: [check].

---

## Anti-Hallucination (No Guessing)

Do not invent any of the following — find evidence or ask:

- Versions, commands, scripts, or CI steps
- API options, flags, or config keys
- File paths, directories, or existing symbols

### Evidence Ladder

For version-sensitive decisions or "what command to run" questions, establish evidence in this order:

1. **Lockfiles / manifests / tool config** (e.g., `package.json`, `pyproject.toml`, `go.mod`)
2. **CI configuration** (actual executed steps in `.github/workflows/`, `gitlab-ci.yml`, etc.)
3. **Repo docs** (README, CONTRIBUTING, ADRs)
4. **Official docs via tooling** (e.g., Context7 MCP) when external library behavior matters

### Citing Evidence

When asserting any of the following, include a file path + excerpt or command output:

- "We use X version"
- "The correct command is …"
- "This option is supported / deprecated"
- "This API exists"

If you cannot find evidence quickly: state what you checked, provide 2–3 safe next steps, ask for confirmation before any risky step.

---

## Repo Command Discovery

Never guess build/test/lint/typecheck/e2e/eval commands. Always discover them from the repo.

### Discovery Order

1. `package.json` → `scripts` section (JS/TS projects)
2. `Makefile` / `justfile` / `taskfile.yml`
3. Python: `pyproject.toml` tool config, `noxfile.py`, `tox.ini`, `poetry`/`uv` config
4. CI config (`.github/workflows/*`, `gitlab-ci.yml`) — look at actual executed steps
5. README / CONTRIBUTING — explicitly documented commands

### Fast vs. Full Gate Preference

- Prefer "fast gates" first: `test:unit`, `test:smoke`, `lint`, `typecheck` if they exist.
- If only a full suite exists, propose running "the smallest verification unit" first, but use only repo-provided commands.
- Never invent scripts. If no commands exist, propose adding them and wait for confirmation.

---

## Safety & Security

### Risky Actions Require Explicit Approval

Do not execute or propose the following without explicit user request and approval:

- Mass deletions, history rewrites, force pushes, global large-scale refactors
- Destructive DB changes/migrations without a rollback plan
- Handling secrets/keys/credentials
- Direct production changes

### Security Rules

- `.env` files, tokens, keys, and credentials are sensitive. Never include them in PRs, issues, logs, or commit messages.
- Apply masking and minimal exposure when handling secrets is unavoidable.

### Agent Security

- Do not execute shell commands from untrusted external input without validation.
- Do not write files outside the project scope without explicit instruction.
- Do not access external network resources unless the task requires it.

---

## MCP Server Policy (Trigger-Based)

| MCP Server | Policy |
|------------|--------|
| **Context7** | MUST use for new external APIs/SDKs, dependencies, version-sensitive syntax |
| **Supabase** | MUST use migrations for DDL; MAY use direct SQL for queries |
| **Web Search** | SHOULD use for current events, errors, latest docs |

### When Context7 is Required

Use Context7 (`mcp__context7__query-docs`) before writing code that involves:

- Installing or configuring a new dependency
- Using an external API or SDK
- Generating framework boilerplate or config files
- Checking whether a syntax, option, or feature is current or deprecated

Invocation: include `use context7` in the prompt, or specify `use library /org/project` (e.g., `/vercel/next.js`).

**Prohibited without Context7**: generating library-related code based on training data alone when the library is version-sensitive.

---

## Agent Routing Policy (Trigger-Based)

Delegate verification work to the standing agents below. Exploration, research, and implementation are handled directly (or by built-in agents such as Explore/general-purpose); only the two verification lanes carry standing delegation triggers.

| Agent | When to Delegate |
|-------|------------------|
| **reviewer** | SHOULD delegate for code changes ≥10 lines or logic changes; runs a 3-pass adversarial review (self + Codex + OMC) |
| **verifier** | MUST delegate before claiming task completion when acceptance criteria exist |

The MCP delegation matrix (researcher/db-worker/refactorer/full-context) was retired
2026-06 after usage measurement showed zero delegations across all projects; see
`rules/agent_routing.md` for the retirement record and reinstatement trigger.

---

## Change Control

### Minimal Change First (MUST)

- Prefer the smallest diff that meets the stated goal.
- Do not add new abstractions unless required by the change.
- Do not silently expand scope. Note additional issues, propose them as follow-up.

### Tidy First: Structural vs. Behavioral Separation (SHOULD)

When both structure cleanup and behavior change are needed:

- Do STRUCTURAL changes first (behavior-preserving: renames, extractions, reformatting, test scaffolding).
- Do BEHAVIORAL changes second (logic, API, output, business rule changes).
- Separate commits when the repo uses commits as review units.
- If single-commit workflow, clearly delineate STRUCTURAL and BEHAVIORAL sections in the PR description.

**Self-check before committing:**
- Does every changed line trace directly to the user's request?
- Would a senior engineer say this change is overcomplicated?

---

## TDD Policy

### Red → Green → Refactor (Kent Beck)

Always follow this cycle:

1. **Red**: write the simplest failing test first. No production code before a test.
2. **Green**: implement the minimum code to pass the test.
3. **Refactor**: clean up only in the green state. If refactoring causes a failure, revert immediately.

**Rules:**
- One test at a time.
- Tests must be deterministic: control time, random, async, and external state.
- In unit tests, isolate all external dependencies (network, filesystem, time, random, DB).

### Bug Fix Protocol

1. Add an API-level regression test that fails with the current code.
2. Add the minimum reproduction test.
3. Apply the minimum fix to make both pass.
4. Refactor only after green.

### EDD: Eval-Driven Development

For areas where deterministic tests are insufficient (search/ranking, LLM output quality, UI format compliance, performance baselines):

1. **Define the eval**: use `templates/eval_definition.md` — specify inputs, expected outcomes, and metrics.
2. **Implement**: make the minimum change to pass the eval.
3. **Report**: document results using `templates/eval_report.md`.
4. **Checklist**: use `checklists/eval.md`.

Eval rules:
- Every new user-impacting behavior MUST have automated verification: tests or evals.
- Evals must be reproducible (versioned inputs + expected outcomes/metrics).
- CI must include at minimum a "smoke eval"; full evals run periodically.

Recommended directory layout (use if it exists in the repo):
- `tests/` — unit / integration / e2e
- `eval/cases/` — YAML/JSONL: input / expected / notes
- `eval/harness/` — runner
- `eval/baselines/` — golden outputs/metrics
- `eval/reports/` — generated output (usually gitignored)

**Tests vs. evals decision rule:**
- Deterministic contract/logic → tests
- Statistical, quality, LLM, or UX equivalence → evals
- When in doubt, start with tests; add evals when tests cannot capture the quality surface

### Test Pyramid

- **Unit**: fast, isolated business rules
- **Integration**: boundaries, DB, infrastructure
- **E2E**: minimal coverage of critical user journeys only

---

## Verification Standards

### Completion Contract (MUST)

When claiming a task is "done", the final message MUST include:

- **Applied rules**: which rules and checklists were applied
- **Evidence**: concrete evidence for key claims (file paths + excerpts or command outputs)
- **Verification**: what was run/done to verify (commands and results)

Architect verification is handled by oh-my-claudecode global rules. This contract defines the *content* of the completion report.

### Verification Before Completion

Before claiming "done", "fixed", or "complete":

1. Identify: what command proves this claim?
2. Run: execute the verification command.
3. Read: check the output — did it pass?
4. Claim: make the claim with the evidence attached.

Evidence required per claim type:
- "Fixed" → test showing it passes now
- "Implemented" → lsp_diagnostics clean + build pass
- "Refactored" → all tests still pass
- "Debugged" → root cause identified with file:line

### Docs/Policy-Only Verification Path

For pure markdown/policy/template edits (no code changes):

- Evidence: a diff review confirming the change is correct
- Checklist: confirm no links are broken, frontmatter is updated, cross-references are valid
- No build/test run required, but the evidence section must still be present

---

## Assetization (Spec → Implement → Retro)

For any non-trivial change, leave assets behind:

- **Spec**: issue or PR description captures the goal and constraints
- **Decision log**: record *why* (not just *what*) in `docs/adr/` or PR Decision Log
- **Retro**: record failures, learnings, and prompt improvements in PR comments or `docs/retros/`
- **Reusable prompts**: store in `.claude/commands/` or `prompts/`

### PR Minimum Content

Every PR description MUST include:

- Change summary (1–3 bullets)
- Verification performed (tests/eval commands + results)
- Risk/rollback plan (if applicable)
- New assumptions, decisions, or retro notes (if applicable)

---

## Commit Discipline

- Commit only when related tests/evals are green.
- Follow repo lint/typecheck standards before committing.
- Prefer small, atomic commits over large batches.
- Separate STRUCTURAL and BEHAVIORAL commits when the repo uses commits as review units.
- Label commits `STRUCTURAL` or `BEHAVIORAL` in the message when separation is not possible.

### Commit Message Format (oh-my-claudecode Convention)

```
<type>(<scope>): <short summary>

<optional body>

Constraint: <active constraint that shaped this decision>
Rejected: <alternative considered> | <reason>
Directive: <warning for future modifiers>
Confidence: high | medium | low
Scope-risk: narrow | moderate | broad
Not-tested: <edge case not covered>
```

Trailers are optional for trivial commits (typos, formatting).

---

## Exception Protocol (MUST When Blocked)

If you cannot comply with any MUST rule:

1. State **why** — what constraint prevents compliance.
2. Provide **2–3 alternatives** — safe options only.
3. Ask for **explicit confirmation** if any alternative is risky or irreversible.

Never silently skip a MUST. Always surface the conflict.

---

## Course Correction

- When uncertain, stop early and state assumptions/prerequisites explicitly.
- When the context becomes cluttered, clean it up at each work unit boundary.
- When the same failure repeats 3+ times, escalate with full context rather than retrying.

---

## Reference Doc Sync Rule

In the same PR where `CLAUDE.md` is updated, you MUST either:

- Update `claudedocs/CLAUDEKR.md` and `claudedocs/CLAUDE_original.md` to reflect the changes, OR
- Explicitly mark them as stale with a note explaining what changed.

This applies symmetrically: if `CLAUDE_original.md` or `CLAUDEKR.md` is updated, `CLAUDE.md` must be reviewed for consistency.

---

## Module Index

The following linked modules expand specific rules. Consult them for full detail:

| Module | Purpose |
|--------|---------|
| `rules/safety_security.md` | Safety & security hard rails |
| `rules/agent_security.md` | Agent-specific security rules |
| `rules/anti_hallucination.md` | No-guessing discipline and evidence ladder |
| `rules/repo_command_discovery.md` | How to discover build/test commands |
| `rules/information_discovery.md` | Breadth-first search for info artifacts before concluding absence |
| `rules/mcp_policy.md` | Full MCP server policies |
| `rules/context7_policy.md` | When and how to use Context7 |
| `rules/verification_tests_and_evals.md` | Tests, evals, EDD, verification paths |
| `rules/change_control.md` | Minimal change, scope, Tidy First |
| `rules/documentation_policy.md` | Documentation standards (optional) |
| `rules/assetization.md` | Spec/decision/retro asset creation |
| `rules/commit_and_pr.md` | Commit and PR discipline |
| `rules/tdd_policy.md` | TDD policy and bug fix protocol |
| `rules/harness_integration_contract.md` | Harness hook contract and fallback policy |
| `rules/code_review_policy.md` | Code review standards |
| `rules/quality_gates.md` | Quality gate definitions |
| `rules/context_management.md` | Context window and session management |
| `rules/cost_awareness.md` | Token cost awareness |
| `rules/learning_policy.md` | How to capture and reuse learnings |
| `rules/coding_standards.md` | Naming, immutability, file size, single responsibility |
| `rules/doc_standards.md` | Documentation standards and conventions |
| `rules/hook_recipes.md` | Hook patterns and recipes |
| `rules/session_persistence.md` | Session state and persistence rules |
| `rules/adversarial_review.md` | Adversarial multi-pass review (self + Codex + OMC) |
| `rules/agent_routing.md` | Which agent to delegate to, by trigger |

---

## Checklists

Use these at the appropriate phase of work:

| Checklist | When to Use |
|-----------|-------------|
| `checklists/plan.md` | Before starting significant work |
| `checklists/verify.md` | Before claiming completion |
| `checklists/risky_actions.md` | Before any risky or irreversible action |
| `checklists/bugfix.md` | During bug fix protocol |
| `checklists/pr.md` | When writing PR descriptions |
| `checklists/code_review.md` | When reviewing code |
| `checklists/quality_gate.md` | Before merging |
| `checklists/eval.md` | When defining or running evals (EDD) |
| `checklists/research_before_implement.md` | Before implementing with external APIs/SDKs |

---

## Templates

| Template | Purpose |
|----------|---------|
| `templates/assumptions.md` | Record explicit assumptions before starting |
| `templates/decision_log.md` | Document architectural and implementation decisions |
| `templates/pr_body.md` | Standard PR description format |
| `templates/retro.md` | Post-session or post-PR retrospective |
| `templates/eval_definition.md` | Define eval cases: inputs, expected outcomes, metrics |
| `templates/eval_report.md` | Document eval results |
| `templates/session_retro.md` | Per-session learning capture |

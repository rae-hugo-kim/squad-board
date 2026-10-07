**[한국어](README.md)**

# omp — OMP Harness Template

A policy framework that makes the OMP (Oh My Pi) coding agent behave consistently and safely.

Copy this repository and you get rules, checklists, skills, and gates (extension) as one set.
Delete what you don't need; adapt the rest to your project.

## Porting Notice

This repository is the **OMP-native port** of the Claude Code harness template **`rae-hugo-kim/claude`** (harness/2026.49), ported on 2026-06-10.

| | Original (Claude Code) | This repo (OMP) |
|---|---|---|
| Policy entry point | `CLAUDE.md` | `AGENTS.md` |
| Gate wiring | 11 hook registrations in `.claude/settings.json` | one extension: `.omp/extensions/harness/index.ts` |
| Gate scripts | `.claude/hooks/harness/` | `.omp/extensions/harness/gates/` — **logic unchanged** (all 177 tests still pass) |
| Runtime state | `.omc/harness-state/` | `.omp/harness-state/` |
| Skills · agents | `.claude/skills/`, `.claude/agents/` | `.omp/skills/`, `.omp/agents/` |
| Hook events | PreToolUse / PostToolUse / UserPromptSubmit / SessionStart | `tool_call` / `tool_result` / `before_agent_start` / `session_start` |

One improvement over the original: failed bash verifications are recorded as FAIL (resolves the original PostToolUseFailure limitation — see [Harness](#harness) below).

> **This repository does not work under Claude Code.** The Claude Code hook registration (settings.json) was deliberately removed — Claude Code users should use the original template.

## Requirements

- [OMP (Oh My Pi)](https://github.com/oh-my-pi) — the coding agent harness
- Node.js — gates are spawned with `node` (must be on PATH)
- (Optional) oh-my-claudecode — if installed under `~/.claude`, OMP auto-discovers OMC agents/skills

## Getting Started

### 1. Environment setup (once per machine)

```
/skill:bootstrap
```

Installs MCP servers (registered in OMP's MCP config). Docs need no build tooling — read them with Obsidian/GitHub directly.

### 2. Create a project

```
/skill:init my-project          # public
/skill:init my-project --private # private
```

Creates a new GitHub repository based on this template.

### 3. Start developing

```
/skill:brainstorm  →  (optional) divergent thinking; captures auto-saved to docs/brainstorming/
/skill:kickoff     →  define scope (goals, constraints, acceptance criteria)
/skill:startdev    →  TDD-based implementation
/skill:compr       →  create a PR
```

Skills also trigger from natural language ("let's kick off", "brainstorm this", ...).

## Structure

```
.
├── AGENTS.md              agent policy entry point (auto-loaded by OMP)
├── .omp/rules/harness-*.md  behavior rules (omp rulebook, rule://harness-<name>)
├── checklists/            task checklists
├── templates/             reusable templates
├── .omp/
│   ├── skills/            skill definitions (OMP-native discovery, 15 skills)
│   ├── agents/            reviewer / verifier agents (delegated via the task tool)
│   └── extensions/harness/
│       ├── index.ts       gate-wiring extension (tool_call/tool_result/before_agent_start/session_start)
│       ├── gates/         gate scripts — stdin JSON CLIs, covered by tests/
│       ├── harness-meta.json  harness version metadata
│       └── tests/         gate unit tests (node --test) — synced to consumers with the gates, same tag
├── docs/                  markdown SST + harness runtime files (seed.yaml, ...)
├── scripts/               drift audit / version management
└── claudedocs/            reference docs (incl. Claude Code era history)
```

## Skills

In OMP, invoke skills as `/skill:<name>` or trigger them with natural language matching their descriptions.

| Command | What it does |
|---------|--------------|
| `/skill:bootstrap` | Set up dev environment (MCP servers + docs tooling) |
| `/skill:init <name>` | Create a new project from this template |
| `/skill:brainstorm [topic]` | Divergent thinking mode; verbatim capture to `docs/brainstorming/` |
| `/skill:kickoff` | Define goals, constraints, acceptance criteria |
| `/skill:startdev` | Start TDD implementation from seed.yaml |
| `/skill:sum` | Summarize current session to `docs/sum/` |
| `/skill:compr` | Branch → commit → push → PR |
| `/skill:compush` | Commit → push (no PR) |
| `/skill:receiving-code-review` | Verify and apply received review feedback |
| `/skill:harness-check` | Harness version drift check + remote sync (`--audit` for quality score) |
| `/skill:migrate` | Cut over an existing Claude Code project (.claude/CLAUDE.md) to OMP (insurance tag + harness port) |
| `/skill:design-mockup` | Generate a single-file HTML mockup with tunable sliders/knobs |
| `/skill:grepai-search` | Semantic code search (cold-start exploration) |
| `/skill:gh-loop` | finding → issue → fix → PR → cross-verify → HITL loop (never auto-merges) |
| `/skill:gh-fanout` | multisession — runs gh-loop across many issues as worktree-isolated parallel workers (observed via GitHub) |

## Migrating an existing Claude Code project

For a project already running on Claude Code (`.claude/` + `CLAUDE.md`), skip the bulk migration — cut it over **once, when you decide to work on it in OMP**:

```
cd <existing-project>
/skill:migrate        # or "migrate this to omp"
```

`migrate` ① drops a `pre-omp-migration` insurance tag first (revert with one line: `git checkout pre-omp-migration -- .claude CLAUDE.md`) → ② ports harness assets via `harness-sync.sh` → ③ removes `.claude/` and `CLAUDE.md`. If the project has custom policy it stops for confirmation before syncing. After migration, update with `/skill:harness-check`.

## Harness

Mechanisms that operate automatically in the kickoff → startdev flow. There are two enforcement points: **the commit gates run from a git hook (`.githooks/pre-commit`)**, everything else is wired to OMP events by the extension `index.ts`. The gate CLIs are stdin-JSON programs in `.omp/extensions/harness/gates/` (24):

| OMP event | Gate | Role |
|-----------|------|------|
| `tool_call` (edit/write/ast_edit) | cross-repo guard (`index.ts` + `cross-repo.mjs`) | Block mutations into another repo until that repo's discipline file (AGENTS.md > CLAUDE.md > .cursorrules) has been read (#15 ①) — a linked worktree of the session repo is not another repo (`repo-root.mjs`) |
| `tool_call` (edit/write/ast_edit) | context-gate | Block edits to unread files |
| `tool_call` (bash) | destructive-guard | Warn on dangerous commands (rm -rf, force push, ...) |
| `tool_call` (bash) | commit-tripwire (`index.ts`) | Block a **declared bypass** of the commit gates — `--no-verify`/`-n`, `core.hooksPath` retargeting, `--git-dir`/`--work-tree`, retargeting `GIT_*` |
| `tool_call` (bash) | cross-repo guard (`index.ts` + `cross-repo.mjs`) | Block `git commit`/`git push` into another discipline- or harness-bearing repo (`git -C X`, `cd X &&`, bash -c; unresolvable targets fail closed) and apply ① to literal-path mutations (rm/mv/cp/tee/sed -i/redirections) (#15 ②) — a repo with neither (sum-vault) stays out of jurisdiction |
| `tool_call` (mcp__*) | mcp-gate | Warn on destructive MCP calls |
| `tool_result` (read) | read-tracker | Record files read |
| `tool_result` (grep/ast_grep) | read-tracker | Record files the search minted `[path#TAG]` anchors for (one batched spawn) |
| `tool_result` (edit/write success) | write-tracker + backpressure-invalidator | Record written files; invalidate verification state on code edits |
| `tool_result` (bash) | backpressure-tracker / failure-tracker | Record verification PASS/FAIL |
| `tool_result` (bash commit·verify / edit·write) | breadcrumb-tracker | Record session-resume breadcrumbs (commits, tests, file changes; no-LLM) |
| `before_agent_start` | kickoff-detector | Inject kickoff reminder when new work is detected |
| `session_start` | harness-version-check | Remote harness drift notice (24h cache), hooks-inactive and policy-shadow (non-empty `.omp/AGENTS.md`) probes |
| `session_start` | breadcrumb-surface | Surface recent docs/sum (un-orphan prior summaries; no-LLM) |

Commit enforcement happens at git's own boundary, so it holds for every spelling and for human commits too:

| git hook | Gate | Role |
|----------|------|------|
| `pre-commit` (blocking) | commit-gates → acceptance/backpressure/review/archive | Judge the staged index; on failure no commit object is created. Fails closed without node (`OMP_NODE_BIN` is the escape hatch) |
| `post-commit` (non-blocking) | backstop + deferred consumption | Advisory for ungated commits (`--no-verify`, cherry-pick, revert, rebase) and one-shot flag consumption |
| `pre-commit` (observing) | review-gate → estimate-vs-actual | Pairs the intake's `.omp/harness-state/cycle-estimate` (predicted risk, file count, depth, model) with the measured `risk-assess` result, records `estimate_vs_actual` in `audit.jsonl` and consumes the record. Never enters a verdict. Read with `node .omp/extensions/harness/estimate-report.mjs` |
| `post-merge` (non-blocking) | backstop | Observes merge auto-commits — the one path where git fires neither pre-commit nor post-commit |
| `pre-push` (blocking) | archive leak + docs drift | Block tracked `docs/sum`·`docs/reviews` and FAIL-severity drift |

Integration paths (merge auto-commits, cherry-pick, revert, rebase) are **deliberately not blocked**: they move content that was already gated at its origin commit, and the backstop observes them. Residual surfaces (sparse-checkout, `stash`, `--no-verify`, out-of-jurisdiction repos) are enumerated in [`.omp/rules/harness-harness_integration_contract.md`](.omp/rules/harness-harness_integration_contract.md).

- **seed.yaml** — structured kickoff output (goals, constraints, AC, risks)
- **rubric** — 4-dimension clarity gate (HIGH/MED/LOW)
- **audit log** — event tracking (append-only JSONL)
- **glossary** — project terms (`docs/glossary.yaml`)
- Runtime state lives in `.omp/harness-state/` (gitignored); gates run standalone via `node --test .omp/extensions/harness/tests/*.test.mjs`

Unlike the Claude Code original, failed bash verifications ARE recorded — the adapter routes bash `tool_result`s with a non-zero `details.exitCode` (or `isError`) to the failure tracker, resolving the original PostToolUseFailure limitation.

omp's `grep`/`ast_grep` also mint per-file `[path#TAG]` edit anchors (whole-file snapshots) that the edit tool accepts as read-equivalent, so the adapter records each search result's certified file list (`details.files`, fallback: bracketed headers) into read-tracker — a grep-anchored edit is no longer false-blocked by context-gate (live-reproduced on 16.3.12, then fixed).

## Harness Versioning

This repository is the **harness source** other OMP projects sync from.

### This repo (source) — version bump (deliberate, once)

Harness asset changes merged to main are not bumped right away; bump once when consumers have a reason to receive them. Behavior changes (gates, sync, hooks, skills) and safety fixes go out immediately, structural changes as their own version. Documentation-only changes ride along with the next bump, but wait no longer than 7 days, and there is at most one bump per day (rationale and rejected alternatives: [`docs/decisions/003-harness-release-cadence.md`](docs/decisions/003-harness-release-cadence.md)).

```bash
bash scripts/harness-version-bump.sh --dry-run   # preview what bumps to .N+1 and whether CHANGELOG [Unreleased] gets promoted (tree untouched)
bash scripts/harness-version-bump.sh             # one bump + tag for changes since the last harness/* tag, promoting CHANGELOG [Unreleased] to ## [<version>]
git push --follow-tags
```

### Other projects (consumers) — `/skill:harness-check`

Projects created via `/skill:init` get a `session_start` gate that checks remote harness tags every 24h. To sync explicitly:

```bash
/skill:harness-check              # overwrite-sync to latest harness/* tag
/skill:harness-check --dry-run    # preview changed paths only
/skill:harness-check --audit      # 7-category (0-70) quality score after sync
```

`--audit` runs `scripts/harness-audit.sh` (rubric v3); on version bumps results accumulate in `.omp/state/harness-scores.jsonl`.

## Docs Viewer (Obsidian)

Markdown (SST) is read as-is, no build step: open the repo root as an Obsidian
vault (setup and entry point: [`docs/README.md`](docs/README.md)).

- Mermaid syntax is validated on save by the harness gate using OMP's bundled
  parser (`.omp/extensions/harness/mermaid-check.ts`)
- Link integrity: `node scripts/docs-drift`
- Writing standard: [`.omp/rules/harness-doc_standards.md`](.omp/rules/harness-doc_standards.md)
- One-off human-facing HTML goes to `artifacts/` (gitignored except READMEs)
- `docs/brainstorming/`, `docs/sum/`, `docs/reviews/` are local-only archives

## How It Works Under OMP

| Layer | Mechanism |
|-------|-----------|
| `AGENTS.md` | Auto-loaded by OMP as a context file (when cwd is this repo) |
| `.omp/rules/harness-*.md` etc. | Listed in every prompt as the rulebook (name + description); body via `rule://harness-<name>`; `harness-core` is always injected |
| `.omp/skills/` | OMP-native skill discovery (priority 100 — wins over same-named OMC skills) |
| `.omp/agents/` | Discovered as task-tool delegation targets |
| `.omp/extensions/harness/` | Extension auto-loaded at startup — wires the gates |
| `.omp/harness-state/` | Gate runtime state (gitignored) |

Claude Code's `settings.json` hook registration is not interpreted by OMP, so this template has none — the same gates are wired by a single extension.

## Rule Customization

Each `.omp/rules/harness-*.md` file is an independent rule.
Delete what you don't need — the rest keeps working.

| Category | Rules |
|----------|-------|
| **Safety** | safety_security, agent_security, anti_hallucination, repo_command_discovery |
| **Quality** | coding_standards, verification_tests_and_evals, change_control, tdd_policy, code_review_policy, quality_gates |
| **Tools** | mcp_policy, context7_policy, hook_recipes |
| **Process** | assetization, commit_and_pr, harness_integration_contract |
| **Docs** | documentation_policy, doc_standards |
| **Ops** | context_management, session_persistence, cost_awareness, learning_policy |

## Core Principles

1. **Think before coding** — state assumptions; ask when uncertain
2. **Simplicity first** — implement only what was asked; no over-engineering
3. **Surgical changes** — touch only related code; keep existing style
4. **Goal-driven execution** — turn vague requests into verifiable goals

## License

Check the repository license.

---
name: grepai-search
argument-hint: <natural-language-query>
description: Semantic code search via grepai CLI for cold-start orientation when symbol names are unknown. Use ONLY when ALL of (a) intent-based query with no specific symbol/literal, (b) codebase >500 files or unfamiliar, (c) AGENTS.md did not yield a concrete target. Explicit user keywords like "grepai", "semantic search", "의미 기반 검색", "콜드스타트 탐색" also trigger it. Do NOT use when a symbol name, file path, or literal string is already specified — go straight to `grep`/LSP.
---

# grepai-search - Semantic Code Search (Trial, event-based)

## Goal

Collapse the iteration cost of "I don't know the symbol name yet" cold-start orientation into a single vector-similarity call, then hand off to `grep`/LSP for precise resolution.

## Scope & Trial Status

- **Status**: EVENT-BASED trial (see `docs/sum/session_2026-04-21_grepai-adoption-decision.md`).
  The original 2-week window expired with ZERO trigger events (no >500-file unfamiliar
  cold-start task occurred), so time-based evaluation was vacuous; replaced 2026-06-10.
- **Kill criteria**: evaluate after 3 accumulated trigger-qualified tasks (cold start on a
  >500-file or unfamiliar codebase). If misleads >= assists, OR the skill goes unused even
  when triggers qualify → delete this skill directory; no other cleanup needed.
- **Cost model**: CLI path (no MCP context tax). Bash output is compressed transparently by RTK.

## When to Use

Invoke ONLY when the top-priority cold-start tree below says `grepai`:

```
Semantic query arrives (new session / subagent)
  │
  ├─ 1. Read AGENTS.md (always first, ~0 cost)
  │     └─ Answer found → extract symbol/path → `grep`/LSP direct, STOP
  │
  ├─ 2. User prompt already names a symbol / path / literal?
  │     └─ YES → `grep`/LSP direct, STOP
  │
  ├─ 3. Codebase <100 files?
  │     └─ YES → `glob` + `read` is cheaper, STOP
  │
  ├─ 4. Target is markdown / yaml / json / non-code config?
  │     └─ YES → `grep`, STOP
  │
  └─ 5. Otherwise → grepai search (Top-5) → LSP goto_definition / `read` for precision
```

## Prerequisites (one-time per repo)

```bash
grepai version          # should report 0.35.0+
ls .grepai/ 2>/dev/null # index present?
```

If `.grepai/` is missing, the repo has never been indexed. **Do NOT auto-run `grepai init`** — it requires an embedding-provider choice (Ollama / OpenAI / OpenRouter) and creates persistent config. Ask the user which provider to use before initializing.

## Process

### 1. Verify daemon / index freshness

```bash
grepai status 2>&1 | head -20
```

- No index → stop, ask user to run `grepai init` + `grepai watch` (daemon).
- Stale index → note it in the response; results may miss recent files.

### 2. Search

Prefer TOON output for token efficiency. Cap results at 5.

```bash
grepai search "<natural language query>" --toon --limit 5
```

Fallback if `--toon` output is hard to parse:

```bash
grepai search "<natural language query>" --json --limit 5
```

### 3. Trace (when the question is "who calls X" / "what does X call")

```bash
grepai trace callers "<SymbolName>" --json
grepai trace callees "<SymbolName>" --json
```

Use this only when LSP `find_references` is **not** applicable — i.e. dynamic dispatch, config-driven wiring, polyglot bridges. For single-language static code, prefer `lsp_find_references` (cheaper + exact).

### 4. Escalate to LSP / read

For the top 1–2 candidates from step 2:

- Known symbol → `lsp_goto_definition` to jump + `lsp_hover` for signature.
- Unknown structure → `read` the file slice shown in grepai output.

Never conclude from grepai ranking alone — it's a candidate-narrower, not an authority.

## Output Format (report to user)

```
grepai: <query>
  1. path/to/file.ts:120  (score 0.87) — <one-line hint from grepai>
  2. ...
Next: LSP goto_definition on <SymbolA> to confirm.
```

Keep it under 10 lines. Rank + file:line + next action. Do not paste the raw JSON/TOON blob.

## Guardrails (MUST NOT)

- Use grepai when the user's prompt already names a file / symbol / literal string.
- Use grepai on codebases <100 files — `glob` + `read` is strictly cheaper.
- Use grepai for markdown / config / comment search — `grep` is exact and free.
- Conclude a task from grepai ranking alone without LSP or `read` verification.
- Run `grepai init` without explicit user approval on provider choice.

## Escalation

If grepai returns zero usable candidates twice in the same query:

1. Fall back to `grep` with keyword-OR expansion (2–4 related keywords).
2. If still zero, ask the user for a symbol hint or file area.
3. Log the miss in the trial retro (issue #9 checklist) — each miss counts toward the kill-criteria count.

## Notes

- grepai is installed at `~/.local/bin/grepai` (prebuilt binary, not `go install`).
- All Bash invocations transit RTK for output compression — no extra flags needed.
- MCP promotion (`grepai mcp-serve`) is deferred until the event-based trial (3 trigger-qualified tasks) confirms stable call frequency + accuracy.

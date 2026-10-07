# Project Instructions

Guidelines for Claude Code when working in this repository.

---

## Project

**Vibe Invest** - B2C investment advisory service targeting Korean market (MVP stage)

---

## Finding Documents

| Purpose | Location |
|---------|----------|
| Folder structure | [`INDEX.md`](../INDEX.md) |
| Policy entry point | [`AGENTS.md`](../AGENTS.md) |
| Project-specific examples | [`claudedocs/INDEX.md`](./INDEX.md) |
| Team agreements & notes | [`claudedocs/agreements.md`](./agreements.md) |

---

## AI Work Rules

### Document Language Policy

**Purpose**: Optimize token consumption while maintaining human readability

| File Type | Language | Examples |
|-----------|----------|----------|
| **Human-readable docs** | Korean | `overview.md`, `requirements.md`, `tech-spec.md`, `vision.md`, user stories, scenarios |
| **AI navigation/guides** | English | `AGENTS.md`, `INDEX.md` files |
| **README.md** | Korean | Project/folder overviews for human readers |

**Rules**:
- NO emojis in any markdown files
- User-facing content (intent, behavior descriptions): Korean
- AI prompts, technical guidelines, navigation: English
- All code comments: English

### Document Structure Rules

**README.md vs INDEX.md**

| File | Audience | Purpose |
|------|----------|---------|
| `README.md` | Human | Folder purpose and usage guide |
| `INDEX.md` | AI (LLM) | Structural navigation for understanding folder contents |

### Naming Conventions

- **Folder names**: lowercase (including abbreviations: ir, hr, ui)
- **Document titles**: uppercase abbreviations (IR, HR, UI)
- **Encoding**: UTF-8 (NO-BOM), except .ps1 scripts (with BOM)
  - Rationale: prevent commit message corruption and ensure Korean text is handled consistently on Windows tooling.

### When Modifying Features

1. Update feature docs and User Story together
2. Review impact on scenarios

### Documentation Writing Principles

**Be Concise - Document Decisions, Not Obvious Details**

When writing architecture, tech stack, or planning documents:

**DO Document**:
- Technology choices and why (Next.js vs Vite)
- Architectural decisions (JWT vs Session)
- Business rules unique to this product (invite code activation)
- Deviations from standard practice

**DON'T Document**:
- Standard implementation details (bcrypt cost factor, password rules)
- Baseline security hygiene that any competent developer would do by default
  - EXCEPT: document security-related decisions, threat-model constraints, and any deviations from standard practice.
- Tunable parameters (rate limits, cache TTL)
- Future considerations or "might need later"
- TBD items or undecided features

**Rule of thumb**: If a competent developer would do it anyway, don't document it.

**Examples**:
- OK: "JWT for stateless auth" (decision)
- NO: "JWT expires in 7 days, stored in localStorage, validated via middleware" (obvious)
- OK: "Active users only - based on invite code" (unique business rule)
- NO: "Rate limit: 5 login attempts per 15 minutes" (tunable parameter)

**Goal**: Compact, decision-focused documentation that AI and humans can quickly parse.

---

### Documentation “latest-only” policy (no backward compatibility)

- Keep docs strictly current; do not preserve deprecated conventions, filenames, or “legacy” sections.
- When conventions change, update the canonical source and remove outdated references across the repo (links/headings/examples).
- When conventions change, you SHOULD record the rationale in a Decision Log / ADR (so history is searchable without reconstructing intent from commits).
- Rely on Git history for past versions instead of keeping backward-compat notes in the docs.

---

### Git commit messages (NOTE first, changes only)

- Prefer describing what is now true (outcome), not how the work was performed.
- If there are share-worthy notes (team-facing), put them at the very beginning as a single `NOTE:` line.
  - When multiple notes exist, summarize them in one line and join with commas (`,`) in priority order.
- NOTE priority (top to bottom):
  1. Completed product work (planning done / feature-level completion)
  2. Rules / conventions changes
  3. Docs areas invalidated by the change (cleanup/migrations)
- Keep the body as a short `Changes:` list. Avoid adding an `Intent:` section.

Template:

```
<optional> NOTE: <completed product work>, <rules / conventions change>, <docs invalidated / cleanup note>
<scope>: <completed outcome>

Changes:
- <what changed>
```

---

## Key Constraints

- **No real trading** (MVP stage)
- No securities broker API integration
- Focus only on simulation and advisory features


# Review Remediation Ledger — precommit-gate-enforcement

**Round 1**: 3-pass adversarial review, 2026-07-30 → **FAIL** (4 high · 6 medium · 4 low · 2 needs-review).
Reviewer artifacts: `docs/reviews/review-2026-07-30-133421.{md,json}` (local archive, not tracked — see `rules/doc_standards.md`); transcript `history://PrecommitReview`.
Models measured: `anthropic/claude-fable-5` → `anthropic/claude-opus-5` (pass 1; see the model-attribution correction at the end — the fallback fired mid-pass in every round) + `openai-codex/gpt-5.6-sol` (passes 2–3) — 2 families.

All findings were accepted; none required a scope change or an override. Disposition below, with the
test that now pins each fix.

## High (blockers)

| # | Finding (measured) | Fix | Pinned by |
|---|---|---|---|
| H1 | `isGitCommit` called without an import after the tripwire swap — `tsc` TS2304, the extension would not compile (the drift-recheck test asserts the call site as source TEXT, so the suite stayed green) | restored the named import in `index.ts:42` | `npx tsc --noEmit` → 0 × TS2304 |
| H2 | Deferred consumption intents were not bound to the approving attempt: an override accepted while ANOTHER gate blocked was replayed by a later unrelated commit (false `review_override` audit line), and a leftover token let a `--no-verify` commit consume approvals and suppress the ungated advisory | the verdict token now carries the tree the gates approved (`git write-tree`); `post-commit` consumes only when `HEAD^{tree}` matches, else reports the commit as ungated; the dispatcher clears `pending-consume` at the start of every run and on BLOCK | `hook-gates.test.mjs` P1/P2/P3 |
| H3 | The tripwire covered its own declared surface only in canonical spelling: alias-invoked commits (`git -c alias.c=commit c --no-verify`), the separated `--config-env <key>=<var>` form, `bash -c` payloads, and `GIT_CONFIG_PARAMETERS` all landed rc=0 with both channels silent | rewrote the tripwire as a real argv walker over EVERY git segment (with `bash -c`/`sh -c` re-entry), added the missing env channel, and scoped the short `-n` alias to commit-ish invocations so `git log -n 5` stays untouched | `commit-tripwire.test.mjs` T6 (+ T5/T7 negatives) |
| H4 | `--amend --no-edit` staged nothing, so every gate saw an empty `--cached` and passed — while the advisory recommended `--amend` as the way to re-gate a bypassed commit | the dispatcher recognizes the amend shape (nothing staged + a parent exists) and passes `hook_base=HEAD^`; gates and the review hash use `HEAD^ --cached`; the advisory no longer claims `--amend` re-judges existing content | `hook-gates.test.mjs` A1/A2 |

## Medium

| Finding | Fix | Pinned by |
|---|---|---|
| acceptance backstop re-introduced the staged∪unstaged union in hook mode (docs commit blocked by unrelated unstaged code) | backstop now uses the same synthetic hook form as the other gates | A3 |
| `wip:` message marker is inert at pre-commit time, yet the gate's own guidance recommended it | hook-mode guidance now names the one-shot flag / `OMP_COMMIT_WIP=1` and says why a message prefix cannot work | U2w (behavior) + message text |
| a failed audit append silently dropped the intent (record lost, override still consumed) | the intent is KEPT on failure with a warning, and consumption stops for that run | `post-commit` logic |
| tripwire mistook option VALUES for bypass flags (`-unormal`, `-Sname`, `-m --no-verify`, `-m "-n"`, `-- --no-verify`) | argv walker models `--`, glued-value shorts (`-S`/`-u`) and value-taking options | T7 |
| `unlink-*` whitelist was lexical, so `..` segments could delete outside the repo | targets containing `..` or a leading `/` are refused | `post-commit` logic |
| the deleted command-layer suite took the fail-closed matrix with it | matrix reinstated for the hook dispatcher: crash, signal death, un-spawnable gate, and all-gates-run-in-order | F1–F4 |

## Low

| Finding | Fix |
|---|---|
| `post-merge` advised on a fast-forward onto an existing merge commit | it now requires `HEAD^1 == ORIG_HEAD` (a merge commit actually created) |
| `compush`/`sum` skills still cited the retired standalone-commit / literal-`-C` rules; the compliance checklist never verified hook activation | both skills rewritten for hook enforcement; checklist step 4 verifies `core.hooksPath` + hook presence/executability |
| dead code and contradicted comments left by the rewrite (`no post-commit write point`, unreachable `-a` sweep note, unused `programIndex`, stale `resolvedRepoRedirect` doc, stale fail-policy comment in `index.ts`, a test comment naming a seam that does not exist) | all removed or corrected |
| the hook header claimed git exports `GIT_DIR` to hooks (it does not; only `GIT_INDEX_FILE` matters) and over-claimed "every path that puts NEW unreviewed diff" | header corrected, and the `rebase --continue` resolution gap is now an enumerated residual |

## Scope calibration accepted from the review

- Two-step `core.hooksPath` re-pointing and pre-segment `export GIT_CONFIG_*` are NOT tripwire targets (arming the harness uses the same command); recorded as residuals instead.
- `git rebase --continue` conflict resolution can land new content ungated — documented residual, not a new blocking hook (the "one blocking surface" constraint holds).
- The whitelist path-escape needed an arbitrary-write precondition, so it stays medium.

## Verification after remediation

- `node --test tests/*.test.mjs` → **451/451**
- `node scripts/docs-drift` → OK (0 errors, 0 warnings)
- `npx tsc --noEmit` on the extension → no TS2304 (the H1 defect)
- live hook in this repo: `bash .githooks/pre-commit` → exit 0 with the ACs checked off (exit 2 with a `HARNESS BLOCK [acceptance-gate.mjs]` line before that)

---

## Round 2 — 3-pass adversarial review, 2026-07-30 → **FAIL** (2 high · 8 medium · 6 low)

Artifacts: `docs/reviews/review-2026-07-30-144523.{md,json}` (local archive); transcript `history://PrecommitReview2`.
Models measured: `anthropic/claude-fable-5` → `anthropic/claude-opus-5` (pass 1; see the correction at the end) + `openai-codex/gpt-5.6-sol` (passes 2–3).
Round 2 added **mutation testing** (12 mutations) and proved 5 of the round-1 pins were self-satisfying —
the single most useful finding, because it explained how 451/451 green coexisted with two live defects.
All findings accepted; no override.

### High

| # | Finding (measured) | Fix | Pinned by (mutation-verified) |
|---|---|---|---|
| H5 | The amend classifier covered ONE shape. `stagedEmpty && hasParent` missed an amend that stages a delta and an amend of a root commit, while `archive-guard` ignored the base entirely (gate-scope inconsistency) | **removed the heuristic.** The gates now judge, uniformly, what a commit ADDS relative to HEAD. git exposes no amend flag and the observable shape is shared by `--allow-empty` / empty-index / merge-resolved-to-HEAD, so inferring amend is not possible — the gap is an enumerated residual instead of a half-implementation | A1, A2 |
| H6 | The verdict token was bound to the tree ALONE, so an approval was consumed by a same-tree commit on a different base (`reset --hard`, cherry-pick) — false `review_override` audit line for a diff that never landed, both one-shot flags consumed, advisory silent. A BLOCK verdict also failed to invalidate an earlier ALLOW token | token now carries the **attempt identity** (tree + approved HEAD + its parent); `post-commit` requires both axes; the dispatcher clears token+intents at the START of every run and on BLOCK | P1, P2, **P6** (cross-base), P4 |

### Medium

| Finding | Fix | Pin |
|---|---|---|
| the empty-index guess false-blocked `--allow-empty`, a plain empty commit, and a merge resolved with `--ours` (citing the PREVIOUS commit's diff) | same removal as H5 | A1 |
| "kept for a retry" was untrue — the next run's cleanup dropped the intent; and the early exit left `commit-wip` armed | audit-append failure now DROPS the intent, keeps the override unconsumed, and clears `commit-wip` FIRST | post-commit logic |
| the tripwire blocked read-only git calls (`-c core.hooksPath=… status`, `GIT_INDEX_FILE=… read-tree`, `GIT_DIR=… log`), `git merge --no-verify`, and even `GIT_DIR=x ls` (no git program); inline vs structured env disagreed | invocation is now classified (`commit` / `push` / `other`): every handle applies to a commit, only `--no-verify` to a push (with a pre-push-specific message), nothing to the rest; the over-broad `\bgit\b` fallback is gone | T8, T9 |
| `harness-sync` left an existing hook non-executable (`cp` preserves destination mode) and git skips non-executable hooks silently | `chmod +x` for `.githooks/*` in the sync loop | W3 (proves the git behavior too) |
| the contract contradicted itself on `wip:` two lines apart | contract + gate comment corrected to the flag/env mechanism | — |
| 5 pins were self-satisfying (A3, U3n, T6-alias, start-of-run cleanup, path-escape guard) | noise fixtures made TRACKED so the union is load-bearing; T10 pins alias resolution via the short `-n`; P4/P5/P6 added | mutation audit re-run: all now fail when their fix is reverted |

### Low

| Finding | Fix |
|---|---|
| post-merge still misfired on a fast-forward onto an existing merge commit (`ORIG_HEAD == HEAD^1`) | uses git's own reflog (`Fast-forward`) instead of parent comparison |
| `GIT_CONFIG_PARAMETERS` only inspected the first pair | every quoted key is inspected |
| docs-drift accepted gate names from hook **comments** as enforcement roots | shell comments are stripped before scanning |
| stale comments/claims (4 sites) + manifest line counts drifted after remediation | corrected; the AC3 table is re-measured (−1,328 vs 7/24, honest note about the tripwire growth) |
| H1 (unresolved identifier) had no automated guard | W4 runs `tsc --noEmit` and asserts zero TS2304 (skips cleanly when tsc is unavailable) |

### Verification after round-2 remediation

- `node --test tests/*.test.mjs` → **459/459**
- `node scripts/docs-drift` → OK (0 errors, 0 warnings)
- **mutation audit** (own, on `/tmp` copies): A3, U3n, T8, T10, P4, P5, P6 each FAIL when their fix is reverted
- live hook in this repo: `bash .githooks/pre-commit` → exit 0

---

## Round 3 — 3-pass adversarial review, 2026-07-30 → **FAIL** (1 high · 5 medium · 10 low)

Artifacts: `docs/reviews/review-2026-07-30-153333.{md,json}`; transcript `history://PrecommitReview3`.
Models measured: `anthropic/claude-fable-5` → `anthropic/claude-opus-5` (pass 1; 75% of the pass ran on
opus after the fallback — see the correction at the end) + `openai-codex/gpt-5.6-sol` (passes 2–3).
Pass 1 and pass 3 returned **PASS WITH NOTES**; the adversary (gpt family) returned FAIL on the one high.
Trend across rounds: **high 4 → 2 → 1**, and no round-3 finding re-opened a round-1/2 fix.

### High

| # | Finding (measured) | Fix | Pin (mutation-verified) |
|---|---|---|---|
| H7 | The token's `approved_parent` axis — added in round 2 to be amend-friendly — accepted any SIBLING commit on that parent. A plain `git commit --amend --no-edit` (no bypass flags at all) consumed the override and wrote an audit line whose `diff_hash` was the staged delta while the landed diff was different; cherry-pick and revert-shaped empty commits did the same | the parent axis is now **strict** (`landed_parent == approved_head`), and the token carries a `v2` format marker so a legacy one-line token cannot parse as valid at a root commit. An amend is consequently reported as ungated — which is the truth, since the gates judge only what a commit ADDS to HEAD | **P7** |

### Medium

| Finding | Fix | Pin |
|---|---|---|
| a failed `rm` of the token was swallowed, so a BLOCK could leave an ALLOW token alive (read-only state dir) | the dispatcher re-checks and warns loudly that a stale token survived | — |
| an audit-append failure left an unrelated `backpressure-skip` armed silently, letting a later commit pass a FAIL verification state | on failure every intent is dropped and the warning NAMES the flags still armed | — |
| `help.autocorrect` + a misspelled verb (`git comit -n`) reaches a commit the tripwire does not classify | **documented residual** (opt-in config; a hasty agent types the real verb; the advisory still fires) | — |
| an argv-local alias DEFINITION could carry the flag (`-c "alias.c=commit --no-verify"`) | the alias body is now walked by the same argv model; deeper alias indirection is a documented residual | T6/T10 family |
| C5 still could not detect the 2026-07-27 direction (it asserted a BLOCK baseline) | rewritten to an ALLOW baseline: pollution must not newly block | **C5** |

### Low

| Finding | Fix |
|---|---|
| post-merge matched `Fast-forward` anywhere in the reflog subject (a branch so named silenced it; an empty reflog produced a false advisory) | suffix-anchored on git's own `": Fast-forward"`, with an empty reflog falling through to the advisory (noise, never silence) + **I9b** negative pin |
| `GIT_CONFIG_PARAMETERS` legacy unquoted pairs were missed | both shapes are split and every key inspected |
| docs-drift counted gate names in hook DIAGNOSTIC output as enforcement roots | `echo`/`printf` lines are skipped; assignments still count (the check answers "does anything mention this gate", not "was the invocation line deleted") — heuristic limit documented in the comment |
| the `killed`/`signal` fields planted in round 1 were never read | removed (`tsc` clean) |
| the contract's hooksPath residual promised an advisory that cannot fire (re-pointing also silences post-commit) | corrected, with after-the-fact detection named |
| A2/X2 were self-satisfying | A2 rewritten to pin delta-gating; X2 relabeled a CHARACTERIZATION test |
| a legacy one-line token validated at a root commit | `v2` marker required |
| `.githooks/pre-commit` is untracked, so the review's diff hash cannot cover it | inherent to the no-commit state; it enters the hash the moment the work is staged |

### Verification after round-3 remediation

- `node --test tests/*.test.mjs` → **461/461**
- `node scripts/docs-drift` → OK (0 errors, 0 warnings)
- `npx tsc --noEmit` on the extension → no TS2304/TS2339/TS2551
- **mutation audit**: P7, I9b, C5 each FAIL when their fix is reverted (my first two attempts used the wrong mutation shape and reported false "weak" results — re-run with the shapes the reviews actually measured)
- live hook in this repo: `bash .githooks/pre-commit` → exit 0

---

## Round 4 — 3-pass adversarial review, 2026-07-30 → **FAIL** (0 high · 3 medium · 10 low)

Artifacts: `docs/reviews/review-2026-07-30-190740.{md,json}`; transcript `history://PrecommitReview4`.
Models measured: `anthropic/claude-fable-5` → `anthropic/claude-opus-5` (self, PASS WITH NOTES; 53% of
the pass ran on opus after the fallback — see the correction at the end) + `openai-codex/gpt-5.6-sol`
(adversary FAIL, code-reviewer FAIL) — 2 families. **First round with no high and no critical.**

Round 4 verified the round-3 high is closed: the v2 token's strict parent axis was re-attacked with
amend / sibling / revert shapes (all three → advisory, override preserved, zero audit lines) and with
12 legitimate flows (plain, consecutive, re-staged, abort-then-retry, merge resolution,
`merge --continue`, root, `commit -a`, pathspec, detached, worktree) → zero false advisories.

| # | Severity | Finding | Class | Fix |
|---|---|---|---|---|
| R4-1 | medium | Unclearable `pending-consume` was silent → a stale intent replayed a foreign approval into `audit.jsonl` on **every** later commit | (b) original | `clearAttemptState()` re-checks that both surfaces are gone, writes `attempt-state-dirty`, and warns; post-commit refuses to execute intents while that marker exists. Pin **R1** |
| R4-2 | medium | Contract's backstop paragraph still described the **removed** R2 protocol (parent-or-parent's-parent, amend accepted) — a re-introduction path for round 3's high | (a) my fix, doc not updated | Paragraph rewritten to the v2 two-axis protocol |
| R4-9 | medium | A consumption whose `unlink` failed recorded "consumed" while the flag stayed **armed** → a later commit passed a FAILED verification state | (b) original | post-commit verifies the removal and reports `STILL ARMED`. Pin **R2** |
| R4-3 | low | Dead descriptions surviving 3 rounds (`resolveCommitTarget`, tree-only token protocol, `GIT_DIR` exported to pre-commit — measured false) | (a) | Comments corrected at all sites |
| R4-4 | low | Ledger "Honest status" overstated: residuals "9" (actual 13), "none reachable", self-contradictory re-open claim | (a) | Rewritten below |
| R4-5 | low | Manifest line counts stale; `killed`/`signal` still listed as kept | (a) | Re-measured; keep-row corrected |
| R4-6 | low | 5 fixes unpinned (alias body walk, GCP legacy split, reflog suffix anchor, v2 marker, X2 branch) | (a) | Pins **T12**, **T14**, **R5** added; T11/T13 cover the round-4 fixes. Two honest exceptions: the **v2 marker** is redundant with the empty-field guard, so its test (R4) is labelled characterization; **X2** was already relabelled characterization in round 3 (it cannot fail while jurisdiction IS hook presence) |
| R4-7 | low | `post-merge` ignored `$1=1` → false advisory on a `--squash` merge from a merge HEAD | (b) original | Early exit. Pin **R3** |
| R4-8 | low | Alias model holes: case-insensitive sections, GCP definition channel, `--config-env`, `alias.commit=<verb>` | (b), evasion-only | Case-insensitivity fixed (pin **T11**); the rest documented as declaration-scope residual |
| R4-10 | low | Post-verb `-c` (`--reedit-message`) read as global config → could block an ordinary commit | (b) original | Config handles scoped to pre-verb position. Pin **T13** |
| R4-11 | low | `GIT_CONFIG_PARAMETERS` double-parse inspected words inside VALUES → a credential helper tripped | (b) original | Quoted and legacy shapes are now exclusive. Pin **T14** |
| R4-12 | low | My round-3 `docs-drift` fix (skip `echo`/`printf` lines) dropped the real `printf … \| node "$dispatcher"` invocation → 6 false orphans | (a) my fix overshot | Reverted to comment-stripping only; the accepted limit is documented |
| R4-13 | low | Reflog-absent fast-forward advisory not in the residual list | (a) | Added to the contract |

Not fixed, by decision: the evasion-only alias surfaces (R4-8 remainder) and R4-3's remaining prose
nits. Both are documented rather than defended — see the contract's residual list.

### Verification after round-4 remediation

- `node --test tests/*.test.mjs` → **470/470**
- `node scripts/docs-drift` → OK (0 errors, 0 warnings)
- `npx tsc --noEmit` on the extension → no TS2304
- **mutation audit**: R1, R2, R3, R5, T11, T12, T13, T14 each FAIL when their fix is reverted. Two
  results were negative and are recorded as such: R3's first fixture was self-satisfying (HEAD was not
  a merge commit, so the parent check suppressed the advisory anyway — rewritten to isolate the squash
  axis), and the token's `v2` marker is **not** independently load-bearing (the empty-field guard
  already refuses a v1 token), so R4 is labelled a characterization test rather than a pin
- live hook in this repo: `bash .githooks/pre-commit` → exit 0

---

## Round 5 — 3-pass adversarial review, 2026-07-30 → **FAIL** (0 high · 2 medium · 6 low)

Artifacts: `docs/reviews/review-2026-07-30-21*.{md,json}`; transcript `history://PrecommitReview5`.
Models measured: `anthropic/claude-fable-5` → `anthropic/claude-opus-5` (self; 80% of the pass ran on
opus after the fallback — see the correction at the end) + `openai-codex/gpt-5.6-sol` (adversary,
code-reviewer) — 2 families. Pass 1 opened at PASS WITH NOTES and **raised itself to FAIL** after
reproducing M1 independently.

| # | Severity | Finding | Class | Fix |
|---|---|---|---|---|
| M1 | medium | My round-4 dirty-state guard leaned on a **marker**, but an unwritable state dir blocks the marker while the token file stays writable → a valid approval was still issued and the foreign intent executed. The warning's "consumption is DISABLED" was false | (a) my round-4 fix, incomplete | `clearAttemptState()` returns whether both surfaces are provably gone; the dispatcher **issues no token at all** when they are not. Pin **R6** |
| M2 | medium | `rm -f commit-wip` was unchecked. A directory at that path satisfies the gate's `existsSync` WIP check and survives removal → every later commit gets an open-ended AC exemption, silently. Reachable without permission tricks: the gate's own guidance says "create `commit-wip`" | (b) original — the round-4 idiom was not applied to this sibling line | Same `[ -e ]` + `STILL ARMED` idiom as the unlink loop. Pin **R7** |
| L4 | low | `--attr-source` takes a REQUIRED value that git consumes; not modelling it made the value read as a flag → false block | (b) original | Added to the separated-value table. **Measured** that `--gpg-sign`/`--untracked-files` take OPTIONAL values, so adding them would have swallowed a real `-n` — they are deliberately excluded. Pin **T16** |
| L5 | low | My round-4 `sawVerb` fix was not applied to the alias-BODY walk, whose tokens start after the verb → `-c` inside a body false-blocked | (a) my round-4 fix, incomplete | `postVerb` parameter. Pin **T15** |
| L1 | low | The `[ -e ]` re-check cannot see a permission/link transition between gating and post-commit | (c) accepted boundary | Documented |
| L2 | low | This ledger said 13 residuals; the contract lists **14** | (a) | Corrected below |
| L3 | low | This ledger claimed `git stash` fires an advisory — **measured 0**, and it contradicts the contract's own residual entry | (a) | Corrected below |
| L6 | low | `GIT_CONFIG_KEY_n`/`GIT_CONFIG_COUNT` alias definitions are not resolved | (c) documented residual | Named in the declaration-scope entry |

**Independent mutation re-audit (the reviewer's, not mine)**: all 9 round-4 pins re-verified
load-bearing — including **R1 on both axes** (my ledger had claimed only one) — plus 7 sampled older
pins still load-bearing, and R4 confirmed green under mutation, so its "characterization" label is
honest. This is the first round where every pin claim in this ledger passed independent verification;
the failure mode round 2 exposed (a green suite coexisting with live defects) is closed.

**Independent document audit**: manifest numbers verified exact for the first time in three rounds
(783/165/431/373, total 1,752, −1,299 with the per-file deltas summing to 1,299, hooks 252 = 75+143+34,
new tests 1,532 = 1,195+206+131).

### Verification after round-5 remediation

- `node --test tests/*.test.mjs` → **474/474**
- `node scripts/docs-drift` → OK (0 errors, 0 warnings)
- `npx tsc --noEmit` on the extension → no TS2304
- **mutation audit**: R6, R7, T15, T16 each FAIL when their fix is reverted
- live hook in this repo: `bash .githooks/pre-commit` → exit 0
- `--attr-source` / `--gpg-sign` / `--untracked-files` / `--exec-path` / `--super-prefix` value
  semantics measured directly against git 2.43 before touching the option table

### Honest status (after round 5)

Five rounds, each finding real defects, with severity monotonically falling: **high 4 → 2 → 1 → 0 → 0,
medium 6 → 8 → 5 → 3 → 2, critical 0 throughout**. Rounds 4 and 5 found **nothing in the blocking
surface** — every finding was in the consume/record layer, the declaration layer, or the documentation.

What the rounds actually taught, in order:

- Round 2's most valuable finding was not a defect but a **method**: 451/451 green coexisted with two
  live defects because five of my own pins were self-satisfying. Every pin added since is mutation-verified,
  and round 5 confirmed that independently.
- Round 3's high was **my round-2 fix being too permissive**, not an original-design defect.
- Round 4's mediums were fail-open in the consume/record layer under infrastructure failure, plus a
  contract paragraph I had not updated when the code changed.
- Round 5's mediums were **the same class again, one level deeper**: my round-4 guard protected via a
  marker that the failure itself could suppress (M1), and the round-4 idiom was not applied to a sibling
  line (M2). Both fixes were 2 lines, with the correct idiom already present in the same file.

Corrections to what earlier versions of this ledger claimed (each caught by review, not by me):

- The residual list is **14 items**, not nine and not thirteen.
- "None is reachable by the threat model" was too strong, and my replacement was also wrong: I wrote
  that `git stash` produces an advisory. It does **not** — measured 0, and the contract's own entry says
  a stash fires no commit hook. The honest split is narrower than I claimed: of the 14 residuals, the ones
  a hasty agent reaches without evading are `git rebase --continue` resolution (advisory confirmed),
  content already in HEAD, merge-resolution scope, node absence, and out-of-jurisdiction repos. The
  evasion-only ones are `--no-verify` itself, two-step hooksPath re-pointing, `help.autocorrect`, alias
  chaining, and the `GIT_CONFIG_KEY_n` channel. The remainder (stash, sparse-checkout, concurrent
  commits, advisory precision) are **silent** — no advisory at all — which is exactly why they are
  enumerated instead of claimed as covered.

My reading: the enforcement boundary has converged. Two rounds with no high and no blocking-surface
finding, an independently verified pin suite, and documentation that finally measures true. What rounds 4
and 5 both found was *my own remediation being one step short* — which is a real and useful signal, but
it is a different and shallower class than the design defects of rounds 1–3. A sixth round would very
likely find more lows of that same shape; whether that is worth another cycle is a judgement call, and
with high 0 twice running I no longer think the answer is automatically yes.

---

## Model attribution correction (all five rounds)

This ledger recorded each round's self pass as `anthropic/claude-fable-5`. That is **incomplete**.
Measured from the session transcripts (`model_change` entries) and the omp logs:

| Round | Fallback fired (UTC) | Assistant turns fable-5 / opus-5 | opus share |
|---|---|---:|---:|
| 1 | 04:00:42.182 | 30 / 42 | 58% |
| 2 | 05:14:23.298 | 24 / 62 | 72% |
| 3 | 06:38:08.899 | 18 / 54 | 75% |
| 4 | 10:38:45.790 | 30 / 27 | 47% |
| 5 | 11:54:49.545 | 14 / 58 | 80% |

**Cause** (not overload, not a usage limit): in every round `anthropic/claude-fable-5` returned
`Refusal (cyber): This request triggered restrictions on violative cyber…`, and the configured retry
chain (`~/.omp/agent/config.yml`: `retry.fallbackChains["anthropic/claude-fable-5"] = [anthropic/claude-opus-5]`)
moved the session to `claude-opus-5`, which accepted it. The log timestamps match the `model_change`
entries to the millisecond in all five rounds. The refusal lands where the pass stops *reading* and
starts *attacking* — the probes are bypass attempts against a security gate, which reads as offensive
tooling to a safety classifier.

**What this does not change**: heterogeneity. `claude-fable-5` and `claude-opus-5` are the same
`anthropic` family, and the second family (`openai-codex/gpt-5.6-sol`) came from the adversary and
code-reviewer passes, which never fell back (verified: their transcripts have a single `primary`
`model_change` each). The `>=2 distinct families` requirement is satisfied on the same evidence as before.

**What it does change**: the models array in `docs/reviews/review-*.json` names only the primary, so the
model that did most of each self pass is not in the machine evidence. The reviewer's own round-5 report
did disclose it ("fallback anthropic/claude-opus-5, same family"); the earlier rounds did not. The
sidecars are left as the reviewers wrote them — this table is the correction of record.

**Follow-up worth doing** (not part of this task's AC): the evidence tuple's models array should be
populated from `model_change` entries rather than the requested selector, so an unrecorded substitution
cannot happen silently. Filed here rather than fixed, because it changes the review-gate evidence
contract and belongs in its own scope.

---

## Dogfooding findings — landing this work through its own gates (2026-07-31)

Committing and pushing this series exercised the mechanism against itself. Three things surfaced that no
review round had reported, because only a real landing produces them.

**1. `docs/harness/acceptance-done` is never consumed (open defect, NOT fixed here).**
`acceptance-gate.mjs` treats the flag as a one-shot override in its own help text, and
`.githooks/post-commit` lists it in the consumption whitelist — but the gate never writes the deferred
unlink intent that `review-gate.mjs:510` and `backpressure-gate.mjs:68` write for their flags
(`grep -c pending-consume .omp/extensions/harness/gates/acceptance-gate.mjs` → 0). So once created it
stays **armed indefinitely**, silencing the acceptance gate on every later commit. Measured: the
integration merge below used the flag, and it was still on disk afterwards while `review-skip` was gone.
This is the same class as round-4 R4-9 and round-5 M2 (a one-shot that is not one-shot), and it is the
first such defect found by *using* the harness rather than by reviewing it.

Deliberately **not fixed in this cycle**: the seed is closed, and a code change now would trip the
closed-seed backstop, need its own review evidence, and reopen a settled task. Routing around the
harness to fix the harness is the wrong instinct. The flag was removed by hand
(`rm -f docs/harness/acceptance-done`) and the fix is filed for its own cycle: write the deferred intent
in `acceptance-gate.mjs` exactly as the sibling gates do, and pin it with a test in the R2/R7 family.

**2. The backpressure tracker refuses piped verification — correctly.**
`node --test … | tail` and `node --test …; echo` both left `backpressure-status` at `UNKNOWN`, because the
shell's exit code then belongs to `tail`/`echo`, not the tests. The gate blocked the commit for "no
verification in this session" until the suite was run bare. That is the designed behavior
(`backpressure-tracker.mjs:44-48`) and it caught a genuinely unreliable signal, not a false alarm.

**3. Merge-resolution scope is real friction, as documented.**
The integration merge was judged as a 324-line high-risk change against its first parent, even though
almost all of that content had already been gated at its origin — the residual the contract enumerates.
The audited override is the intended satisfier, and it is on the record with the resolution details.

#!/usr/bin/env node
// acceptance-gate.mjs - PreToolUse hook for Bash(git commit*)
// Purpose: Block commits if acceptance criteria not met
// Logic: Pass if (all checkboxes checked) OR (acceptance-done flag exists and is <24h old)
// Exit 0 = allow, Exit 2 = block (uses stderr for messages)

import { readFileSync, existsSync, appendFileSync, mkdirSync, writeFileSync, statSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { isGitCommit, isWipCommit, parseCommitForm } from './git-commit-detect.mjs';
import { assessRisk } from './risk-assess.mjs';

// Use project-local state directory
function getStateDir(cwd) {
  const dir = join(cwd, '.omp', 'harness-state');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const input = readFileSync(0, 'utf-8');

let data;
try {
  data = JSON.parse(input);
} catch (e) {
  console.error('HARNESS WARNING: Hook received invalid input, skipping check.');
  process.exit(0);
}

const cwd = data?.session_state?.cwd || process.cwd();
const stateDir = getStateDir(cwd);
const logFile = join(stateDir, 'hook-debug.log');

function log(msg) {
  if (!process.env.HARNESS_DEBUG) return;
  const timestamp = new Date().toISOString();
  appendFileSync(logFile, `[${timestamp}] acceptance-gate: ${msg}\n`);
}

log('Hook started');

const command = data?.tool_input?.command || '';
// (The dispatcher's static `-C` attribution was retired with AC3 — hook mode judges the
// repo it fires in, so no redirect bookkeeping reaches the gates any more.)
log(`Command: ${command}`);

// Hook mode (AC6): spawned by the pre-commit dispatcher — there is no command string;
// the hook firing is the commit. Only check for git commit commands otherwise.
const isHookMode = data?.mode === 'hook';
// Hook-mode wip (A-4): pre-commit cannot see the commit message (COMMIT_EDITMSG holds the
// PREVIOUS commit's message — scraping it is forbidden). The one-shot flag is the canonical
// wip declaration, OMP_COMMIT_WIP=1 the env convenience; consumption happens post-commit.
const hookWip = isHookMode
  && (existsSync(join(stateDir, 'commit-wip')) || process.env.OMP_COMMIT_WIP === '1');
const isWip = () => hookWip || isWipCommit(command);
// Observability for the WIP lane (audit symmetry with review_override): in hook mode, queue an
// `acceptance_wip` audit intent for post-commit to append into docs/harness/audit.jsonl — a
// direct append here would be swept into the commit by `git commit -a` (the same TOCTOU the
// review-gate defers around via pending-consume). The message-prefix wip on the non-hook path
// is self-documenting in commit history and is not separately audited.
const queueWipAudit = (reason) => {
  if (!hookWip) return;
  try {
    const pendDir = join(stateDir, 'pending-consume');
    mkdirSync(pendDir, { recursive: true });
    const event = {
      ts: new Date().toISOString(),
      event: 'acceptance_wip',
      actor: process.env.USER || 'unknown',
      meta: { mechanism: process.env.OMP_COMMIT_WIP === '1' ? 'env' : 'flag', reason },
    };
    writeFileSync(join(pendDir, 'append-audit-acceptance-wip.json'), JSON.stringify(event) + '\n');
  } catch { /* observability only — never block or unblock the lane */ }
};
// Same synthetic form the other gates use in hook mode: the staged index is the commit's
// content (git already materialized -a/pathspec into the inherited temporary index), and
// Content already in HEAD is out of scope (including under --amend) — a documented residual.
const hookForm = isHookMode
  ? { all: false, verifiable: true }
  : null;
if (!isHookMode && !isGitCommit(command)) {
  log('Not a git commit, allowing');
  process.exit(0);
}

log('Git commit detected, checking acceptance criteria');
log(`CWD: ${cwd}`);

// Support test mode with custom paths
const isTestMode = process.env.ACCEPTANCE_GATE_TEST === 'true';
const scopeFilePath = isTestMode
  ? process.env.TEST_SCOPE_FILE
  : join(cwd, 'docs', 'harness', 'current-scope.md');
const flagFilePath = isTestMode
  ? process.env.TEST_FLAG_FILE
  : join(cwd, 'docs', 'harness', 'acceptance-done');
const seedPath = isTestMode
  ? process.env.TEST_SEED_FILE
  : join(cwd, 'docs', 'harness', 'seed.yaml');

// L2 backstop (analysis Q6.2 / seed AC6): when a commit reaches a "no active acceptance
// criteria" allow-path (closed/empty seed, or seed-with-AC but no current-scope), a CODE
// change must not pass silently — surface it so the iteration (P2) gets a thread-scope.
// Doc/config-only commits (risk=low) and WIP/override pass unchanged. Risk can't be assessed
// without git (tests, detached): fail OPEN (unknown -> allow) so the backstop never blocks
// blindly and the existing active-seed gating is untouched.
function backstop(reason, opts = {}) {
  let level;
  if (process.env.TEST_RISK_LEVEL) {
    level = process.env.TEST_RISK_LEVEL;        // test seam: deterministic risk without a git repo
  } else {
    // Scope risk to the diff the commit actually captures — NOT the staged∪unstaged union,
    // or unrelated unstaged code over-counts a docs commit. In hook mode there is no command
    // string to parse, so the same synthetic form the other gates use applies (3-pass review,
    // medium: the union re-appeared here and falsely blocked docs commits).
    try { level = assessRisk(cwd, hookForm ?? parseCommitForm(command)).level; } catch { level = 'unknown'; }
  }
  const codeTouching = level === 'medium' || level === 'high' || level === 'critical';
  if (!codeTouching) {
    log(`backstop(${reason}): risk=${level} not code-touching -> allow`);
    process.exit(0);
  }
  if (isWip()) {
    queueWipAudit(`backstop:${reason}`);
    log(`backstop(${reason}): wip marker -> allow`);
    process.exit(0);
  }
  log(`BACKSTOP BLOCK: code change with no active AC (${reason}), risk=${level}`);
  console.error('HARNESS BACKSTOP: 코드 변경인데 이를 추적할 active acceptance criteria가 없습니다.');
  console.error(`  reason: ${reason}`);
  console.error('  반복(P2) 작업이 충실도 추적 없이 커밋되려 합니다. 다음 중 하나:');
  if (opts.incomplete) {
    console.error('  1. 마감이면 위 WARNING이 가리키는 §3 항목을 채워 같은 커밋에 스테이징 (closeout_contract.md §3)');
  } else if (opts.closed) {
    console.error('  1. 같은 기능 반복이면 seed 재개(reopen): node .omp/extensions/harness/thread-scope.mjs open');
    console.error('     (genuinely 새 기능이면 /kickoff로 새 seed)');
  } else {
    console.error('  1. thread-scope 열기: node .omp/extensions/harness/thread-scope.mjs open');
  }
  console.error(isHookMode
    ? '  2. trivial이면 WIP 선언: `.omp/harness-state/commit-wip` 생성 또는 `OMP_COMMIT_WIP=1 git commit …` (pre-commit 시점에는 커밋 메시지를 볼 수 없어 `wip:` 접두사는 효력이 없습니다), 또는 docs/harness/acceptance-done 생성(override, mtime 기준 24h 유효)'
    : '  2. trivial이면 `wip:` 커밋, 또는 docs/harness/acceptance-done 생성(override, mtime 기준 24h 유효)');
  process.exit(2);
}

// The acceptance record of a scope file (shared by Check 3 and the closeout landing, so both
// paths count the same boxes): every checkbox line from the first `Acceptance Criteria` ATX
// heading (any level, behind ANY prefix — blockquote, list marker, deep indent — with an
// optional closing `#` run after a space; liberal on purpose, see below) to the END
// OF FILE. Nothing closes the section. Five review rounds (2026-09-27) each produced a
// valid-markdown shape — `###` subsections, fence variants (unterminated, mismatched,
// bullet-attached, container-prefixed closers), HTML comments and blocks — by which an emulated
// section boundary hid a real `- [ ]`; like review-gate's evidence parser, structural markdown
// emulation is not attempted in a gate. The templates (kickoff, thread-scope) put the AC section
// last, so a checkbox below the heading IS an acceptance criterion, and post-commit follow-ups
// are not checkboxes (#48-4). A checkbox is a list item of any bullet (`-`, `*`, `+`, `1.`,
// `1)`) behind any run of list / blockquote containers, at any indentation; CRLF tolerated.
// Returns null when no such heading exists.
function acceptanceRecord(text) {
  const items = [];
  let found = false;
  // Split on every terminator JS's `.`/`$` treat as one (CR, LF, CRLF, U+2028, U+2029) so a
  // terminator inside a box description cannot break the box match (r6 review).
  for (const line of text.split(/\r\n|[\n\r\u2028\u2029]/)) {
    if (!found) {
      // Liberal on purpose (fail-closed: the record can only open EARLIER): the heading may sit
      // behind any prefix — blockquote, list marker, deeper indentation — and carry trailing
      // whitespace of any kind; only the text must be exactly `Acceptance Criteria`.
      if (/#{1,6}[ \t]+acceptance criteria(?:[ \t]+#+)?\s*$/i.test(line)) found = true;
      continue;
    }
    const box = line.match(/^\s*(?:>[ \t]*|(?:[-*+]|\d+[.)])[ \t]+)*(?:[-*+]|\d+[.)])[ \t]+\[([ xX])\]\s*(.*)$/);
    if (box) items.push({ checked: box[1] !== ' ', text: box[2].trim() });
  }
  return found ? items : null;
}

// Closeout landing (#48-1): closeout_contract.md §3 puts the seed `approved -> done` transition
// (a), the current-scope.md retirement (b) and the `task_closed` audit row (c) IN THE SAME
// COMMIT as the code that completed the task (d). At pre-commit time the seed on disk already
// says `done`, so the closed-seed branch above would read it as "dead seed + new code" and
// backstop-block — the contract and the gate contradicted each other, and only the WIP lane got
// the commit through. The distinguishing facts are in the commit's own CONTENT, and all three
// closeout parts must be there (review 2026-09-26: the seed flip alone would let unmet AC be
// "closed" by editing one line): HEAD's seed is `approved` and the committed seed is `done`,
// the committed tree carries no current-scope.md, and the committed audit.jsonl gains a
// `task_closed` row naming the seed's task_id (when it has one) — and the AC record being retired
// (HEAD's current-scope.md) is fully checked (#56). Scoped to the content the commit captures (index, or worktree for -a); an
// unverifiable standalone form (pathspec, --amend, bash -c …) is not inspected — it falls
// through to the backstop as before. Test mode (custom file paths) never claims a closeout.
// Top-level `status:` scalar (balanced quotes or bare, non-empty, same line; a space before the
// colon and a leading BOM tolerated), a trailing YAML comment allowed only after whitespace
// (`status: done  # closed 2026-09-26`), lowercased — ONE grammar for every reader in this gate
// (r6 review: an exact-lowercase matcher beside a `\w+`-lowercasing one let `status: Done` fall
// between them). `done-later` is the value `done-later` — never `done`. A status line that is
// present but does not parse (`done#x`, `"done`, `done extra`) is INVALID, distinct from a
// missing line (null): both count as "leaving approved" in the closeout judgement (r7 review).
const INVALID = Symbol('invalid scalar');
const stripBom = (text) => text.replace(/^\uFEFF/, '');
// One top-level `<key>:` reader for `status` and `task_id`: value string, INVALID (a line for
// the key exists that is not a plain non-empty same-line scalar — ANY such line, even beside a
// valid one), or null (no such line). r8 review: two hand-rolled matchers drifted apart
// (`status[ \t]*:` vs `task_id:`) and `task_id : "x"` read as "no id"; r9: a CR inside quotes
// and an invalid line before a valid one slipped through.
const seedScalar = (raw, key) => {
  const lines = stripBom(raw).split(/\r\n|[\n\r\u2028\u2029]/).filter((l) => new RegExp(`^${key}[ \\t]*:`).test(l));
  if (lines.length === 0) return null;
  const scalar = new RegExp(`^${key}[ \\t]*:[ \\t]*(?:"([^"]+)"|'([^']+)'|([^\\s#'"][^\\s#]*))(?:[ \\t]+#.*)?[ \\t]*$`);
  const values = lines.map((l) => l.match(scalar));
  if (values.some((m) => !m)) return INVALID;
  return values[0][1] ?? values[0][2] ?? values[0][3];
};
const seedStatus = (raw) => {
  const v = seedScalar(raw, 'status');
  return typeof v === 'string' ? v.toLowerCase() : v;
};
// Returns 'closeout' (all three parts present and HEAD's AC record is fully checked), a string
// naming the FIRST missing part when the seed transition is there but the closeout is incomplete
// (surfaced in the backstop so a hasty `git commit -am` that silently left an untracked
// audit.jsonl behind is pointed at the file, not at reopen/WIP), `{ falseCloseout, unchecked }`
// when the seed transition is there but HEAD's AC record cannot prove the task done (#56: unmet
// `- [ ]`, or no scope / no checkboxes at HEAD — blocked outright by the caller, never routed
// through the risk backstop, which would wave a docs-only closeout commit through with a
// warning), or null when this is not a closeout attempt at all.
function closeoutState() {
  if (isTestMode) return null;
  const form = hookForm ?? parseCommitForm(command);
  if (!form.verifiable) return null;
  // `--no-color --no-ext-diff --no-textconv` on the diff itself: color.diff=always / diff.external
  // override a `-c color.ui=never` and would hide the `+` lines from the regex (fail-closed, but
  // needless); a textconv driver (`.gitattributes` diff=X + diff.X.textconv) would reshape the
  // rows the #62 append-only check reads (#62 r1 adversary).
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 });
  const diff = (...args) => git('diff', '--no-color', '--no-ext-diff', '--no-textconv', ...args);
  const tracked = (rel) => git('ls-files', '--', rel).trim() !== '';
  // What the commit will carry for `rel`: the index blob (plain), or the worktree file when it is
  // tracked (-a stages tracked edits/deletions, never an untracked copy). null = absent; a git
  // failure throws (the callers decide whether that is fail-closed).
  const committed = (rel) => {
    if (form.all) return tracked(rel) && existsSync(join(cwd, rel)) ? readFileSync(join(cwd, rel), 'utf-8') : null;
    return tracked(rel) ? git('show', `:${rel}`) : null;
  };
  // Membership in the COMMITTED TREE, not the raw index: an intent-to-add entry (`git add -N`)
  // sits in the index but is not committed, and `git diff --cached` already reports exactly that.
  const inCommittedTree = (rel) => {
    if (form.all) return tracked(rel) && existsSync(join(cwd, rel));
    const status = diff('--cached', '--name-status', '--', rel).trim().split(/\s+/)[0] ?? '';
    if (status === 'A') return true;
    if (status === 'D') return false;
    return git('ls-tree', '--name-only', 'HEAD', '--', rel).trim() !== '';
  };
  let transition = false;
  // A git failure while reading the committed seed of an APPROVED task is fail-closed whatever
  // the worktree says (r4/r5 review: `committed()` used to swallow it into "not staged" ->
  // backstop, and gating it on the on-disk status left the re-approved-worktree case open).
  const unverifiable = { falseCloseout: 'the closeout could not be verified (git failed while reading HEAD / the index), so the AC record cannot prove the task complete', unchecked: [], undo: null };
  try {
    let headSeed;
    try { headSeed = stripBom(git('show', 'HEAD:docs/harness/seed.yaml')); }
    catch {
      // Unborn HEAD or no seed at HEAD = not a closeout; a seed that exists but cannot be read
      // (git error, >maxBuffer) is fail-closed (r6 review). "Not a repository" is decided by the
      // presence of `.git` (dir, or the file a worktree/submodule carries), not by git answering
      // — a git that cannot answer inside a repo is the failure this must not wave through (r9).
      if (!existsSync(join(cwd, '.git'))) return null;
      try { git('rev-parse', '--verify', '-q', 'HEAD'); } catch (e) { return e?.status === 1 ? null : unverifiable; }
      let present;
      try { present = git('ls-tree', '--name-only', 'HEAD', '--', 'docs/harness/seed.yaml').trim() !== ''; } catch { present = true; }
      return present ? unverifiable : null;
    }
    if (seedStatus(headSeed) !== 'approved') return null;
    let committedSeed;
    try { committedSeed = committed('docs/harness/seed.yaml') ?? ''; }
    catch { return unverifiable; }
    const committedStatus = seedStatus(committedSeed);
    // (a) the transition: an approved task leaves the approved state. `superseded` (replaced by
    // a newer seed) and `draft` are not closures and are not judged here; ANYTHING else —
    // `done`, `Done`, `done-later`, a status line that does not parse, a removed status line, a
    // removed seed — retires the task and is judged (r6/r7 review: an exact-`done` test let
    // `status: Done` through, and null-for-malformed let `done#closed` through).
    if (committedStatus === 'approved' || committedStatus === 'draft' || committedStatus === 'superseded') {
      // The on-disk seed IS done (that is how we got here) but the commit does not carry the
      // transition: the classic mis-staging. Name it instead of the generic reopen/WIP advice.
      if (form.all || seedStatus(existsSync(seedPath) ? readFileSync(seedPath, 'utf-8') : '') !== 'done') return null;
      return 'docs/harness/seed.yaml approved -> done is in the worktree but not staged for this commit (closeout_contract.md §3a)';
    }
    transition = true;
    // (d, #56) the AC record the transition closes — judged as soon as (a) holds, before (b) and
    // (c): HEAD's current-scope.md is the last word on whether the task was done (the check-offs
    // must have reached HEAD before the retirement). Leaving the scope in, or the audit row out,
    // must not turn a false closeout into a merely "incomplete" one that the risk backstop waves
    // through, and the seed flip must not land alone in one docs-only commit with the retirement
    // following in the next (3-pass review 2026-09-27, rounds 1–2, high). No scope at HEAD, an
    // unreadable one, or one without checkboxes cannot prove completion either (contract §2:
    // "전부 [x]" must not be vacuously true) — same hard block, not the backstop.
    // The undo advice names only the paths THIS COMMIT changes (seed always; the scope when the
    // commit deletes it; the audit log when the commit touches it): a directory pathspec would
    // reset every tracked file under docs/harness/ (r7 review), and naming a path the commit did
    // not change would wipe a check-off the user is about to commit (r8 review). If git cannot
    // answer, no executable command is printed (undo = null).
    let undo = null;
    try {
      const status = (rel) => (form.all ? diff('HEAD', '--name-status', '--', rel) : diff('--cached', '--name-status', '--', rel)).trim().split(/\s+/)[0] ?? '';
      undo = ['docs/harness/seed.yaml'];
      if (status('docs/harness/current-scope.md') === 'D') undo.push('docs/harness/current-scope.md'); // a MODIFIED scope holds the user's check-offs (r9 review)
      if (status('docs/harness/audit.jsonl') !== '') undo.push('docs/harness/audit.jsonl');
    } catch { undo = null; }
    const falseCloseout = (reason, unchecked = []) => ({ falseCloseout: reason, unchecked, undo });
    let headScope = null;
    try { headScope = git('show', 'HEAD:docs/harness/current-scope.md'); }
    catch {
      let present;
      try { present = git('ls-tree', '--name-only', 'HEAD', '--', 'docs/harness/current-scope.md').trim() !== ''; } catch { return unverifiable; }
      return present
        ? falseCloseout('HEAD docs/harness/current-scope.md could not be read, so the closeout cannot prove the AC were met')
        : falseCloseout('HEAD has no docs/harness/current-scope.md — there is no AC record to prove the task complete (closeout_contract.md §2 skips the closeout without one)');
    }
    const record = acceptanceRecord(headScope);
    if (!record || record.length === 0) {
      return falseCloseout('HEAD docs/harness/current-scope.md has no acceptance checkboxes, so the closeout cannot prove the AC were met (closeout_contract.md §2)');
    }
    const unchecked = record.filter((i) => !i.checked).map((i) => i.text);
    if (unchecked.length > 0) {
      return falseCloseout(`HEAD docs/harness/current-scope.md still has ${unchecked.length} unchecked acceptance criteria:`, unchecked);
    }
    // (a′) the value itself: the contract's closure state is exactly `done`.
    if (committedStatus !== 'done') {
      const shown = committedStatus === INVALID ? 'a status line that is not a plain scalar' : committedStatus === null ? 'no status line' : `\`${committedStatus}\``;
      return `docs/harness/seed.yaml leaves \`approved\` for ${shown}, which is not the contract's \`done\` (closeout_contract.md §3a)`;
    }
    // (b) scope retired: not in the committed tree.
    if (inCommittedTree('docs/harness/current-scope.md')) {
      return 'docs/harness/current-scope.md is still in the commit (closeout_contract.md §3b deletes it)';
    }
    // (c) audit row added by this commit: a JSON object with `event: task_closed` on one added
    // line (contract §3c shape; a substring match would accept a nested "event"). When the seed
    // being closed carries a task_id (the stable identifier), the row must name it in
    // meta.task_id — a row for some other task, or one without an id, is not this closeout. Same
    // scalar grammar as SEED_STATUS (quoted or bare, a comment only after whitespace), but the
    // value must be non-empty and on the same line (`\s*` would run into the next key); a
    // task_id line that does not parse is fail-closed, never "no id".
    const seedTaskId = seedScalar(headSeed, 'task_id');
    if (seedTaskId === INVALID) return 'HEAD docs/harness/seed.yaml has a task_id line that is not a plain non-empty scalar, so the task_closed row cannot be matched (closeout_contract.md §3c)';
    const auditDiff = form.all ? diff('HEAD', '--', 'docs/harness/audit.jsonl') : diff('--cached', '--', 'docs/harness/audit.jsonl');
    // Only lines inside a hunk are content: everything before the first `@@` is the file header
    // (`--- a/…`, `+++ b/…`, `index`, mode lines). Exempting by PREFIX instead would let a removed
    // row that happens to start with `-- ` print as `--- …` and slip through (#62 r1 high).
    const hunkLines = [];
    let inHunk = false;
    for (const line of auditDiff.split('\n')) {
      if (line.startsWith('@@')) { inHunk = true; continue; }
      if (inHunk) hunkLines.push(line);
    }
    // The log is append-only (#62): a removed `-` line means an existing row was deleted or
    // replaced, and a task_closed row added beside that is not a closeout — the history it is
    // supposed to extend has been rewritten. Content that merely starts with `-` is a non-JSON
    // row and counts too (fail-closed), as does a HEAD file without a trailing newline (its last
    // row is re-emitted as `-`/`+`). A log fix belongs in its own commit, before the closeout.
    if (hunkLines.some((line) => line.startsWith('-'))) {
      return 'docs/harness/audit.jsonl is not append-only in this commit — an existing row is removed or replaced (a HEAD file without a trailing newline shows the same way) (closeout_contract.md §3c; land the log fix in a separate commit, then close out)';
    }
    const rowMatches = (line) => {
      if (!line.startsWith('+')) return false;
      let row;
      try { row = JSON.parse(line.slice(1)); } catch { return false; }
      return row?.event === 'task_closed' && (seedTaskId === null || row.meta?.task_id === seedTaskId);
    };
    if (!hunkLines.some(rowMatches)) {
      return seedTaskId === null
        ? 'no task_closed row is added to docs/harness/audit.jsonl in this commit (closeout_contract.md §3c; `git commit -a` does not add an untracked audit.jsonl — `git add` it)'
        : `no task_closed row for task_id ${seedTaskId} is added to docs/harness/audit.jsonl in this commit (closeout_contract.md §3c: meta.task_id must name the seed being closed)`;
    }
    return 'closeout';
  } catch {
    // Once the seed transition (a) is established the commit IS a closeout attempt: a git
    // failure while verifying it is fail-closed (r3 review: a second failing HEAD read used to
    // fall through to null = "not a closeout" = backstop). Before (a), null as before.
    return transition ? unverifiable : null;
  }
}

// Check 1: Flag file exists (manual override) — valid for 24h from its mtime (#15 ③). A flag
// left behind months earlier used to pass every later commit before the scope was even read
// (blogger, 2026-03 flag observed 2026-07-15); a stale one is now ignored with a warning and
// the normal checks run. The flag itself is not removed (it is the user's to re-arm: `touch`).
const ACCEPTANCE_DONE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
if (existsSync(flagFilePath)) {
  let ageMs = null;
  try { ageMs = Date.now() - statSync(flagFilePath).mtimeMs; } catch { /* unreadable: treat as stale */ }
  if (ageMs !== null && ageMs < ACCEPTANCE_DONE_MAX_AGE_MS) {   // a future mtime (clock skew) counts as fresh
    log('acceptance-done flag exists and is fresh, allowing (manual override)');
    process.exit(0);
  }
  const ageText = ageMs === null ? 'unreadable mtime' : `${Math.floor(ageMs / 3600000)}h old`;
  log(`acceptance-done flag is stale (${ageText}), ignoring`);
  console.error(`HARNESS WARNING: docs/harness/acceptance-done is stale (${ageText}, limit 24h) — ignoring the override. Re-create it (touch docs/harness/acceptance-done) if the override is still intended.`);
}

// Check 2a: closeout landing is judged on the COMMIT'S content (HEAD approved -> committed done +
// scope retired + task_closed row), before any on-disk state is consulted: an unstaged edit made
// after staging a complete closeout (the seed already flipped back for the next task) must not
// revive the closeout/backstop contradiction, an on-disk `done` with an incomplete commit must
// name the missing part, and deleting the worktree seed.yaml after staging a false closeout must
// not skip the judgement (3-pass review 2026-09-27 r3: this used to sit inside the
// `existsSync(seedPath)` branch below).
const closeout = closeoutState();
if (closeout === 'closeout') {
  log('closeout landing: this commit carries seed approved -> done, scope retired, task_closed row; allowing');
  console.error('HARNESS NOTE: closeout landing (seed approved -> done, current-scope.md retired, task_closed audited in this commit) — acceptance-gate allowing.');
  process.exit(0);
}
// False closeout (#56): the seed is being closed (approved -> done in this commit) but HEAD's
// AC record cannot prove the task done — unmet `- [ ]`, no scope / no checkboxes at HEAD, or a
// git failure while verifying. Blocked here, before the closed-seed branch — its backstop allows
// low-risk commits, and a closeout commit is typically docs-only. The acceptance-done override
// (Check 1) already ran.
if (closeout?.falseCloseout) {
  const items = closeout.unchecked;
  log(`BLOCKED: false closeout — ${closeout.falseCloseout} (${items.length} unchecked)`);
  console.error(`HARNESS BLOCK: this commit closes out the task (seed leaves \`approved\`) but ${closeout.falseCloseout}`);
  items.slice(0, 3).forEach((item) => console.error(`  - [ ] ${item}`));
  if (items.length > 3) console.error(`  ... and ${items.length - 3} more`);
  console.error('');
  console.error('closeout_contract.md §2 never closes a task without an AC record that is fully checked. Options:');
  console.error(closeout.undo
    ? `  1. Undo the staged closeout: \`git restore --staged --worktree -- ${closeout.undo.join(' ')}\` (only the paths this commit changed; they go back to HEAD, so an UNSTAGED edit in them — or an untracked next-task scope at that path — is lost as well; stash or move it first if you need it), keep seed.yaml \`status: approved\` (\`thread-scope open\` regenerates a missing scope), check off the met criteria in docs/harness/current-scope.md and COMMIT that first (the record must reach HEAD before the closeout), then redo the closeout`
    : '  1. Undo the staged closeout by hand (git could not list what this commit changed — `git status` and `git restore --staged --worktree -- <path>` for the seed/scope/audit paths it touched), keep seed.yaml `status: approved`, check off the met criteria in docs/harness/current-scope.md and COMMIT that first, then redo the closeout');
  console.error('  2. If the task is not complete, stop after that undo — keep `status: approved` and the scope; a closeout is not a checkpoint');
  console.error('  3. Create docs/harness/acceptance-done to override (valid 24h from its mtime)');
  process.exit(2);
}

// An incomplete closeout (seed transition present, §3a′/§3b/§3c shortfall) is named once here,
// whatever the on-disk status turns out to be, and goes straight to the backstop: a code change
// beside it blocks, a docs-only one passes with the warning (r7 review: routed through Check 2/3
// it could reach a plain allow when the on-disk status was not a closed one).
if (typeof closeout === 'string') {
  console.error(`HARNESS WARNING: this looks like a closeout (seed approved -> done) but it is incomplete: ${closeout}.`);
  backstop('incomplete closeout', { incomplete: true });
}

// Check 2: seed.yaml AC existence check
if (existsSync(seedPath)) {
  let seedContent;
  try { seedContent = readFileSync(seedPath, 'utf-8'); }
  catch { log('seed.yaml read failed (race), allowing'); process.exit(0); }
  // A CLOSED seed carries no ACTIVE acceptance criteria: `done` = the task completed
  // (closeout), `superseded` = replaced by a newer seed. Either way its criteria belong
  // to a finished/obsolete task and must not gate new, unrelated work. (cf. seed_contract.md)
  const status = seedStatus(seedContent);
  if (status === 'done' || status === 'superseded') {
    log(`seed.yaml status=${status} (closed), no active AC, allowing`);
    backstop(`closed seed (status:${status})`, { closed: true });
  }
  const hasAC = /^acceptance_criteria:\s*\n\s+-/m.test(seedContent);
  if (hasAC) {
    log('AC found in seed.yaml, checking completion via flag or scope file checkboxes');
  } else {
    log('seed.yaml exists but no AC defined, allowing with warning');
    console.error('HARNESS WARNING: seed.yaml has no acceptance_criteria. Run /kickoff to define them.');
    backstop('seed has no acceptance_criteria');
  }
}

// Check 3: Scope file exists (checkbox-based completion tracking)
if (!existsSync(scopeFilePath)) {
  if (existsSync(seedPath)) {
    log('seed.yaml has AC but no current-scope.md for checkbox tracking, allowing with warning');
    console.error('HARNESS WARNING: AC defined in seed.yaml but no current-scope.md for completion tracking.');
    backstop('seed defines AC but no current-scope.md');
  }
  log('No current-scope.md found, allowing with warning');
  console.error('HARNESS WARNING: No scope file. Run /kickoff to define acceptance criteria.');
  process.exit(0);
}

// Read scope file
let scopeContent;
try { scopeContent = readFileSync(scopeFilePath, 'utf-8'); }
catch { log('current-scope.md read failed (race), allowing'); process.exit(0); }

// Extract the acceptance record (same parser as the closeout landing)
const checkboxes = acceptanceRecord(scopeContent);
if (checkboxes === null) {
  // No recognizable AC heading: the record cannot gate anything, but a code change on an active
  // seed must not slip through silently (r6 review: this branch used to be a bare exit 0).
  log('No Acceptance Criteria section found');
  console.error('HARNESS WARNING: No Acceptance Criteria section in scope file.');
  backstop('current-scope has no Acceptance Criteria section');
  process.exit(0);
}

const checked = checkboxes.filter((i) => i.checked);
const unchecked = checkboxes.filter((i) => !i.checked);

log(`Checkboxes: total=${checkboxes.length}, checked=${checked.length}, unchecked=${unchecked.length}`);

if (checkboxes.length === 0) {
  log('No checkboxes defined, allowing');
  backstop('current-scope has no acceptance-criteria checkboxes');
}

if (unchecked.length === 0) {
  log('All acceptance criteria met, allowing');
  process.exit(0);
}

// WIP commits are intentional in-progress checkpoints. Without this, every commit during a
// tracked task is blocked until ALL AC are checked, pushing people to the blunt
// `acceptance-done` flag (which disables the gate). In HOOK mode the declaration is the
// one-shot flag `.omp/harness-state/commit-wip` or `OMP_COMMIT_WIP=1` — pre-commit runs before
// the commit message exists, so a `wip:` marker cannot be read there (scraping COMMIT_EDITMSG
// would return the PREVIOUS commit's message). The message marker still applies on the
// non-hook/standalone path. (cf. closeout_contract.md — closeout runs on completion.)
if (isWip()) {
  queueWipAudit(`unchecked:${unchecked.length}`);
  log(`WIP commit, ${unchecked.length} unchecked criteria but allowing (wip marker)`);
  console.error(`HARNESS WARNING: WIP commit with ${unchecked.length} unmet acceptance criteria (allowed by wip marker).`);
  process.exit(0);
}

// Unchecked items exist and no flag file = block
log(`BLOCKED: ${unchecked.length} unchecked criteria, no override flag`);

const uncheckedItems = unchecked.map((i) => i.text);

console.error(`HARNESS BLOCK: Cannot commit. ${unchecked.length} acceptance criteria not met:`);
uncheckedItems.slice(0, 3).forEach(item => console.error(`  - [ ] ${item}`));
if (uncheckedItems.length > 3) {
  console.error(`  ... and ${uncheckedItems.length - 3} more`);
}
console.error('');
console.error('Options:');
console.error('  1. Check off completed criteria in docs/harness/current-scope.md');
console.error('  2. Create docs/harness/acceptance-done to override (valid 24h from its mtime)');
if (isHookMode) {
  console.error('  3. WIP checkpoint: create .omp/harness-state/commit-wip or run OMP_COMMIT_WIP=1 git commit …');
  console.error('     (a `wip:` message prefix cannot work here — pre-commit runs before the message exists)');
}
// An AC that can only be true AFTER this commit ("PR opened", "tag pushed", "merged") is not an
// AC by .omp/rules/harness-cycle_definition.md — it circles with this gate (true only once the commit it gates
// has landed) and pushes people to check it falsely or reach for the WIP lane (#48-4). Name the
// fix here rather than inventing a marker syntax for it.
console.error('  If an item is true only AFTER this commit (open PR, tag, merge, deploy): it is not an acceptance');
console.error('  criterion — move it out of the checkboxes into a follow-up step (.omp/rules/harness-cycle_definition.md: "AC는 커밋 시점에 판정 가능해야 한다").');

process.exit(2);

// Unit tests for acceptance-gate.mjs (PreToolUse: Bash, git commit).
//
// Run: node --test .omp/extensions/harness/tests/acceptance-gate.test.mjs
//
// Focus: PR-1 of the closeout/freshen design — a CLOSED seed (`status: done` =
// completed via closeout, `status: superseded` = replaced) carries no ACTIVE
// acceptance criteria, so its AC must NOT gate new/unrelated commits. Regression
// guards keep an `approved` (active) seed enforcing, and the stale-safe warn+pass
// when AC are defined but no current-scope.md tracking file exists.
//
// Most cases read files only (a plain temp dir suffices); the closeout-landing cases (#48-1)
// initialize a real, hermetic git repo because the gate inspects the index / HEAD there.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'gates', 'acceptance-gate.mjs');

const AC_BLOCK = 'acceptance_criteria:\n  - id: AC1\n    title: do the thing\n';

function withDir(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'acc-gate-'));
  mkdirSync(join(dir, 'docs', 'harness'), { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    writeFileSync(join(dir, 'docs', 'harness', rel), content);
  }
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

function runGate(dir, command = 'git commit -m x', env = {}) {
  return spawnSync('node', [GATE], {
    input: JSON.stringify({ tool_input: { command }, session_state: { cwd: dir } }),
    cwd: dir,
    encoding: 'utf-8',
    // HERMETIC: drop inherited GIT_* so a session-injected GIT_DIR/GIT_CONFIG_* cannot
    // change what the gate sees (test-attack C-5).
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))), ...env },
  });
}

const UNCHECKED_SCOPE = '# Scope\n\n## Acceptance Criteria\n\n- [ ] not done yet\n';

// --- closed seed (done / superseded) -> no active AC -> allow ---

test('seed status:done -> allow even with an unchecked current-scope (closed task)', () => {
  withDir({ 'seed.yaml': `status: done\ncompleted: 2026-05-21\n${AC_BLOCK}`, 'current-scope.md': UNCHECKED_SCOPE }, (dir) => {
    assert.equal(runGate(dir).status, 0);
  });
});

test('seed status:superseded -> allow (replaced task, AC obsolete)', () => {
  withDir({ 'seed.yaml': `status: superseded\n${AC_BLOCK}`, 'current-scope.md': UNCHECKED_SCOPE }, (dir) => {
    assert.equal(runGate(dir).status, 0);
  });
});

test('quoted status ("done") is recognized as closed -> allow', () => {
  withDir({ 'seed.yaml': `status: "done"\n${AC_BLOCK}`, 'current-scope.md': UNCHECKED_SCOPE }, (dir) => {
    assert.equal(runGate(dir).status, 0);
  });
});

// --- regression: an ACTIVE (approved) seed still enforces ---

test('seed status:approved + unchecked current-scope -> BLOCK (active task still gated)', () => {
  withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': UNCHECKED_SCOPE }, (dir) => {
    assert.equal(runGate(dir).status, 2);
  });
});

// --- WIP bypass: an in-progress commit may pass unmet AC (still warns) ---

test('approved + unchecked + `wip:` message -> allow (WIP bypass), still warns', () => {
  withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': UNCHECKED_SCOPE }, (dir) => {
    const r = runGate(dir, 'git commit -m "wip: partway through"');
    assert.equal(r.status, 0);
    assert.match(r.stderr, /WIP commit/i);
  });
});

test('approved + unchecked + `[wip]` tag (bundled -am) -> allow', () => {
  withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': UNCHECKED_SCOPE }, (dir) => {
    assert.equal(runGate(dir, 'git commit -am "[wip] checkpoint"').status, 0);
  });
});

test('approved + unchecked + a NON-wip message -> BLOCK (bypass is marker-gated)', () => {
  withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': UNCHECKED_SCOPE }, (dir) => {
    assert.equal(runGate(dir, 'git commit -m "feat: done for real"').status, 2);
  });
});

test('precedence: a closed (done) seed + wip message exits via the closed-seed path, not wip', () => {
  withDir({ 'seed.yaml': `status: done\n${AC_BLOCK}`, 'current-scope.md': UNCHECKED_SCOPE }, (dir) => {
    const r = runGate(dir, 'git commit -m "wip: x"');
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stderr, /WIP commit/i);   // closed-seed early-exit precedes the wip bypass
  });
});

test('seed status:approved + all AC checked -> allow', () => {
  withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': '## Acceptance Criteria\n\n- [x] done\n' }, (dir) => {
    assert.equal(runGate(dir).status, 0);
  });
});

// --- stale-safe: AC defined but no current-scope.md -> warn + pass (not block) ---

test('approved seed with AC but no current-scope.md -> warn + allow (no false block)', () => {
  withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}` }, (dir) => {
    const r = runGate(dir);
    assert.equal(r.status, 0);
    assert.match(r.stderr, /no current-scope\.md/i);
  });
});

// --- non-commit and no-context cases ---

test('not a git commit -> allow', () => {
  withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': UNCHECKED_SCOPE }, (dir) => {
    assert.equal(runGate(dir, 'git status').status, 0);
  });
});

test('acceptance-done flag overrides a blocking active task', () => {
  withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': UNCHECKED_SCOPE, 'acceptance-done': '' }, (dir) => {
    assert.equal(runGate(dir).status, 0);
  });
});

// #15 ③: the flag is an override for the commit at hand, not a standing exemption — a flag
// left behind for months used to pass every later commit before the scope was read.
test('acceptance-done flag older than 24h is ignored with a warning and left in place (#15 ③)', () => {
  withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': UNCHECKED_SCOPE, 'acceptance-done': '' }, (dir) => {
    const flag = join(dir, 'docs', 'harness', 'acceptance-done');
    const twoDaysAgo = (Date.now() - 48 * 3600 * 1000) / 1000;
    utimesSync(flag, twoDaysAgo, twoDaysAgo);
    const r = runGate(dir);
    assert.equal(r.status, 2, 'the unchecked AC block again');
    assert.match(r.stderr, /HARNESS WARNING: docs\/harness\/acceptance-done is stale \(48h old, limit 24h\)/);
    assert.ok(existsSync(flag), 'the stale flag is reported, not removed');
  });
});

test('acceptance-done flag within 24h still overrides (boundary: 23h old)', () => {
  withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': UNCHECKED_SCOPE, 'acceptance-done': '' }, (dir) => {
    const flag = join(dir, 'docs', 'harness', 'acceptance-done');
    const recent = (Date.now() - 23 * 3600 * 1000) / 1000;
    utimesSync(flag, recent, recent);
    const r = runGate(dir);
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stderr, /stale/);
  });
});

// --- parser contract: only a top-level, uncommented status closes the seed ---

test('status:done with no space still closes the seed -> allow', () => {
  withDir({ 'seed.yaml': `status:done\n${AC_BLOCK}`, 'current-scope.md': UNCHECKED_SCOPE }, (dir) => {
    assert.equal(runGate(dir).status, 0);
  });
});

test('done seed with NO current-scope.md (the actual repo dogfood shape) -> allow', () => {
  withDir({ 'seed.yaml': `status: done\ncompleted: 2026-05-21\n${AC_BLOCK}` }, (dir) => {
    assert.equal(runGate(dir).status, 0);
  });
});

test('commented / indented status does NOT close an active seed (fail-closed)', () => {
  // A `# status: done` comment or a nested/indented status must not disable the gate;
  // only the real top-level `status: approved` counts -> still blocks unchecked AC.
  withDir({ 'seed.yaml': `# status: done\nstatus: approved\n${AC_BLOCK}`, 'current-scope.md': UNCHECKED_SCOPE }, (dir) => {
    assert.equal(runGate(dir).status, 2);
  });
  withDir({ 'seed.yaml': `meta:\n  status: done\nstatus: approved\n${AC_BLOCK}`, 'current-scope.md': UNCHECKED_SCOPE }, (dir) => {
    assert.equal(runGate(dir).status, 2);
  });
});

// --- L2 backstop (seed AC6): a CODE change with no active acceptance criteria must not
// pass silently. Risk is injected via TEST_RISK_LEVEL (test seam); real runs use assessRisk. ---

test('backstop: closed (done) seed + CODE change (no scope) -> BLOCK', () => {
  withDir({ 'seed.yaml': `status: done\n${AC_BLOCK}` }, (dir) => {
    const r = runGate(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /HARNESS BACKSTOP/);
  });
});

test('backstop: closed seed + DOCS-only change -> allow (no friction)', () => {
  withDir({ 'seed.yaml': `status: done\n${AC_BLOCK}` }, (dir) => {
    assert.equal(runGate(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low' }).status, 0);
  });
});

test('backstop: closed seed + CODE + `wip:` -> allow (intentional checkpoint)', () => {
  withDir({ 'seed.yaml': `status: done\n${AC_BLOCK}` }, (dir) => {
    assert.equal(runGate(dir, 'git commit -m "wip: x"', { TEST_RISK_LEVEL: 'medium' }).status, 0);
  });
});

test('backstop: NO seed at all + CODE change -> allow (no tracking intent)', () => {
  withDir({}, (dir) => {
    assert.equal(runGate(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'high' }).status, 0);
  });
});

test('backstop: approved seed with AC but no current-scope + CODE -> BLOCK', () => {
  withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}` }, (dir) => {
    const r = runGate(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /HARNESS BACKSTOP/);
  });
});

test('backstop: unknown risk (cannot assess) -> allow (fail-open)', () => {
  withDir({ 'seed.yaml': `status: done\n${AC_BLOCK}` }, (dir) => {
    assert.equal(runGate(dir, 'git commit -m x').status, 0);
  });
});

test('backstop: acceptance-done flag overrides before backstop', () => {
  withDir({ 'seed.yaml': `status: done\n${AC_BLOCK}`, 'acceptance-done': 'x' }, (dir) => {
    assert.equal(runGate(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'critical' }).status, 0);
  });
});

// --- backstop recovery-message branch (finding B + slice-2 reopen): a closed seed now offers
// `thread-scope open` (which REOPENS the closed seed) plus a /kickoff hint for genuinely new work. ---

test('backstop: closed-seed block offers seed reopen (thread-scope) and /kickoff', () => {
  withDir({ 'seed.yaml': `status: done\n${AC_BLOCK}` }, (dir) => {
    const r = runGate(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /thread-scope/);
    assert.match(r.stderr, /kickoff/);
  });
});

test('backstop: active-seed (no current-scope) block suggests thread-scope open', () => {
  withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}` }, (dir) => {
    const r = runGate(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /thread-scope/);
  });
});

// --- #48-1: closeout landing. closeout_contract.md §3 lands the seed `approved -> done`
// transition, the scope retirement and the `task_closed` audit row in the SAME commit as the
// completing code; the seed on disk is already `done` at pre-commit, so the closed-seed branch
// must read the commit's own content to tell a closeout from new code on a long-dead seed — and
// ALL THREE closeout parts must be there (a seed flip alone must not "close" unmet AC).
// Repo-backed: the detection reads the index / HEAD. ---

import { execFileSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';

const HERMETIC = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' };
const CLOSED_ROW = '{"ts":"2026-09-26T00:00:00Z","event":"task_closed","actor":"assistant","meta":{"task_id":"t1"}}\n';

// A tracked, in-flight task at HEAD: approved seed, scope with the given checkboxes, an audit log.
function gitRepoWithTask(dir, { seed = `status: approved\n${AC_BLOCK}`, scope = '# S\n\n## Acceptance Criteria\n\n- [x] done\n' } = {}) {
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: HERMETIC });
  git('init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), seed);
  writeFileSync(join(dir, 'docs', 'harness', 'current-scope.md'), scope);
  writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n');
  writeFileSync(join(dir, 'a.js'), 'x\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  return git;
}
// The full §3 closeout in the worktree: seed done, scope deleted, audit row appended, plus code.
function closeoutInWorktree(dir) {
  writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done\ncompleted: 2026-09-26\n${AC_BLOCK}`);
  unlinkSync(join(dir, 'docs', 'harness', 'current-scope.md'));
  writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n' + CLOSED_ROW);
  writeFileSync(join(dir, 'a.js'), 'y\n');
}
function runGateHermetic(dir, command = 'git commit -m x', env = {}) {
  return runGate(dir, command, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...env });
}

test('closeout landing: full §3 closeout STAGED with code -> allow (same-commit closeout)', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir);
    closeoutInWorktree(dir);
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m "feat: done"', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /closeout landing/);
  });
});

test('closeout landing: hook mode (staged index) is recognized the same way', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir);
    closeoutInWorktree(dir);
    git('add', '-A');
    const r = spawnSync('node', [GATE], {
      input: JSON.stringify({ mode: 'hook', hook: 'pre-commit', session_state: { cwd: dir } }),
      cwd: dir, encoding: 'utf-8', env: { ...HERMETIC, TEST_RISK_LEVEL: 'medium' },
    });
    assert.equal(r.status, 0, r.stderr);
  });
});

test('closeout landing: color.ui/color.diff=always and diff.external cannot break the detection', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir);
    git('config', 'color.ui', 'always');
    git('config', 'color.diff', 'always');
    git('config', 'diff.external', '/bin/false');
    closeoutInWorktree(dir);
    git('add', '-A');
    assert.equal(runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' }).status, 0);
  });
});

test('closeout landing: a seed flip ALONE (scope still committed, or no task_closed row) is NOT a closeout -> BLOCK', () => {
  withDir({}, (dir) => {
    // all [x] at HEAD; flip + code, scope left in place, no audit row -> incomplete, names §3b
    const git = gitRepoWithTask(dir);
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done\n${AC_BLOCK}`);
    writeFileSync(join(dir, 'a.js'), 'y\n');
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /HARNESS BACKSTOP/);
    assert.match(r.stderr, /incomplete: docs\/harness\/current-scope\.md is still in the commit/, 'the block names the missing §3 part');
  });
  withDir({}, (dir) => {
    // all [x] at HEAD, scope deleted but no audit row -> still incomplete, and the hint moves to §3c
    const git = gitRepoWithTask(dir);
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done\n${AC_BLOCK}`);
    unlinkSync(join(dir, 'docs', 'harness', 'current-scope.md'));
    writeFileSync(join(dir, 'a.js'), 'y\n');
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /incomplete: no task_closed row/);
  });
});

test('dead seed: done at HEAD (untouched) + staged CODE -> still BACKSTOP BLOCK', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { seed: `status: done\n${AC_BLOCK}` });
    unlinkSync(join(dir, 'docs', 'harness', 'current-scope.md'));
    git('add', '-A');
    git('commit', '-q', '-m', 'closed earlier');
    writeFileSync(join(dir, 'a.js'), 'y\n');
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /HARNESS BACKSTOP/);
  });
});

test('closeout landing: closeout present in the WORKTREE but NOT staged -> plain commit still blocks; -a sees it', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir);
    writeFileSync(join(dir, 'a.js'), 'y\n');
    git('add', 'a.js');
    closeoutInWorktree(dir); // unstaged (deletion + edits are tracked, so -a captures them)
    const plain = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(plain.status, 2);
    assert.match(plain.stderr, /incomplete: docs\/harness\/seed\.yaml approved -> done is in the worktree but not staged/);
    assert.equal(runGateHermetic(dir, 'git commit -am x', { TEST_RISK_LEVEL: 'medium' }).status, 0);
  });
});

test('closeout landing: -a with an UNTRACKED current-scope.md leftover and a trailing YAML comment on status still lands', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir);
    closeoutInWorktree(dir);
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done  # closed 2026-09-26\n${AC_BLOCK}`);
    git('add', '-A');
    writeFileSync(join(dir, 'docs', 'harness', 'current-scope.md'), '# untracked leftover\n');
    assert.equal(runGateHermetic(dir, 'git commit -am x', { TEST_RISK_LEVEL: 'medium' }).status, 0);
  });
});

test('closeout landing: a draft -> done edit is NOT a closeout (approved -> done only); a suffixed state never matches', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { seed: `status: draft\n${AC_BLOCK}` });
    closeoutInWorktree(dir);
    git('add', '-A');
    assert.equal(runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' }).status, 2);
  });
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir);
    closeoutInWorktree(dir);
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done-later\n${AC_BLOCK}`);
    git('add', '-A');
    assert.equal(runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' }).status, 2);
  });
});

// --- #48-4: a post-commit AC ("open PR", "tag") circles with this gate. No marker syntax —
// .omp/rules/harness-cycle_definition.md says such items are not AC; the block message must say so. ---

test('block message points post-commit items at cycle_definition.md (not a marker syntax)', () => {
  withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': '# S\n\n## Acceptance Criteria\n\n- [ ] commit and open the PR\n' }, (dir) => {
    const r = runGate(dir);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /true only AFTER this commit/);
    assert.match(r.stderr, /cycle_definition\.md/);
  });
});

// --- adversary pass (2026-09-26): scalar boundary, intent-to-add, JSON whitespace ---

test('closeout landing: `done#closed`, `"done`, `approved#pending` are not the exact states -> BLOCK', () => {
  for (const [head, committed] of [['status: approved', 'status: done#closed'], ['status: approved', 'status: "done'], ['status: approved#pending', 'status: done']]) {
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir, { seed: `${head}\n${AC_BLOCK}` });
      closeoutInWorktree(dir);
      writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `${committed}\n${AC_BLOCK}`);
      git('add', '-A');
      assert.equal(runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' }).status, 2, `${head} -> ${committed}`);
    });
  }
});

test('closeout landing: an intent-to-add (`git add -N`) scope for the NEXT task is not in the committed tree -> allow', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir);
    closeoutInWorktree(dir);
    git('add', '-A');
    writeFileSync(join(dir, 'docs', 'harness', 'current-scope.md'), '# next task\n');
    git('add', '-N', 'docs/harness/current-scope.md');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 0, r.stderr);
  });
});

test('closeout landing: a hand-formatted audit row (`"event" : "task_closed"`) counts', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir);
    closeoutInWorktree(dir);
    writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n{"ts":"2026-09-26T00:00:00Z", "event" : "task_closed", "actor":"assistant"}\n');
    git('add', '-A');
    assert.equal(runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' }).status, 0);
  });
});

test('closeout landing (-a): a seed whose deletion is staged with an untracked done copy left behind is NOT a closeout', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir);
    closeoutInWorktree(dir);
    git('add', '-A');
    git('rm', '-q', '--cached', 'docs/harness/seed.yaml'); // deletion staged; the done copy is now untracked
    assert.equal(runGateHermetic(dir, 'git commit -am x', { TEST_RISK_LEVEL: 'medium' }).status, 2);
  });
});

test('closeout landing: an UNSTAGED worktree edit after staging a complete closeout (seed flipped back for the next task) still lands', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir);
    closeoutInWorktree(dir);
    git('add', '-A');
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: approved\n${AC_BLOCK}`); // unstaged, next task
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /closeout landing/);
  });
});

test('closeout landing: a malformed staged state (`done-later` on disk and staged) gets NO "not staged" hint', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir);
    closeoutInWorktree(dir);
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done-later\n${AC_BLOCK}`);
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2);
    assert.doesNotMatch(r.stderr, /not staged/);
  });
});

// --- #56: a closeout retires HEAD's current-scope.md, so the AC record it carries is the last
// word on whether the task was done. Unchecked AC there = a false closeout (contract §2 never
// auto-closes with `- [ ]`), blocked outright — not routed through the risk backstop, which lets
// a docs-only closeout commit through with a warning. And the task_closed row must belong to
// the seed being closed when that seed carries a task_id. ---

const SEED_WITH_ID = `status: approved\ntask_id: "20260926-000000-abcd"\n${AC_BLOCK}`;
const rowFor = (taskId) => `{"ts":"2026-09-26T00:00:00Z","event":"task_closed","actor":"assistant","meta":{"task_id":"${taskId}"}}\n`;

test('#56 closeout with UNCHECKED AC in HEAD current-scope.md -> BLOCK with the count, even for a docs-only commit', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { scope: '# S\n\n## Acceptance Criteria\n\n- [x] one\n- [ ] two\n- [ ] three\n' });
    closeoutInWorktree(dir);
    writeFileSync(join(dir, 'a.js'), 'x\n'); // docs-only: risk=low must not let it through
    git('add', '-A');
    for (const level of ['low', 'medium']) {
      const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: level });
      assert.equal(r.status, 2, `risk=${level}: ${r.stderr}`);
      assert.match(r.stderr, /2 unchecked acceptance criteria/);
      assert.match(r.stderr, /- \[ \] two/);
      assert.doesNotMatch(r.stderr, /closeout landing/);
    }
    // hook mode judges the same staged index
    const hook = spawnSync('node', [GATE], {
      input: JSON.stringify({ mode: 'hook', hook: 'pre-commit', session_state: { cwd: dir } }),
      cwd: dir, encoding: 'utf-8', env: { ...HERMETIC, TEST_RISK_LEVEL: 'low' },
    });
    assert.equal(hook.status, 2, hook.stderr);
    assert.match(hook.stderr, /2 unchecked acceptance criteria/);
  });
});

test('#56 the check-offs committed BEFORE the closeout (all [x] at HEAD) still land', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { scope: UNCHECKED_SCOPE });
    writeFileSync(join(dir, 'docs', 'harness', 'current-scope.md'), '# S\n\n## Acceptance Criteria\n\n- [x] not done yet\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'check off');
    closeoutInWorktree(dir);
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /closeout landing/);
  });
});

test('#56 HEAD scope with NO checkboxes (or no scope at all) cannot prove completion -> false closeout, BLOCK even docs-only', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { scope: '# S\n\n## Acceptance Criteria\n\n(none yet)\n' });
    closeoutInWorktree(dir);
    writeFileSync(join(dir, 'a.js'), 'x\n'); // docs-only
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /HARNESS BLOCK: .*has no acceptance checkboxes/);
  });
  withDir({}, (dir) => {
    // two-commit bypass G1 -> G2 (review round 2): scope deleted earlier on the approved seed, then flip + row
    const git = gitRepoWithTask(dir);
    unlinkSync(join(dir, 'docs', 'harness', 'current-scope.md'));
    git('add', '-A');
    git('commit', '-q', '-m', 'scope lost earlier');
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done\n${AC_BLOCK}`);
    writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n' + CLOSED_ROW);
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /HARNESS BLOCK: .*HEAD has no docs\/harness\/current-scope\.md/);
  });
});

test('#56 task_closed row for ANOTHER task_id is not this seed\'s closeout -> incomplete; the matching id lands', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { seed: SEED_WITH_ID });
    closeoutInWorktree(dir);
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done\ntask_id: "20260926-000000-abcd"\n${AC_BLOCK}`);
    writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n' + rowFor('some-other-task'));
    git('add', '-A');
    let r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /incomplete: no task_closed row for task_id 20260926-000000-abcd/);
    // a row without meta.task_id does not count either when the seed has an id
    writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n{"event":"task_closed","actor":"assistant"}\n');
    git('add', '-A');
    r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2, r.stderr);
    // the right id (with the contract's JSON shape, spaces allowed) lands
    writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n' + rowFor('some-other-task') + rowFor('20260926-000000-abcd'));
    git('add', '-A');
    r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /closeout landing/);
  });
});

test('#56 review: leaving the audit row OUT of a false closeout does not downgrade it to "incomplete" (docs-only, risk=low, WIP) -> still BLOCK', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { scope: UNCHECKED_SCOPE });
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done\n${AC_BLOCK}`);
    unlinkSync(join(dir, 'docs', 'harness', 'current-scope.md'));
    git('add', '-A'); // no task_closed row, no code
    for (const [cmd, env] of [['git commit -m x', { TEST_RISK_LEVEL: 'low' }], ['git commit -am "wip: x"', { TEST_RISK_LEVEL: 'low' }]]) {
      const r = runGateHermetic(dir, cmd, env);
      assert.equal(r.status, 2, `${cmd}: ${r.stderr}`);
      assert.match(r.stderr, /1 unchecked acceptance criteria/);
      assert.doesNotMatch(r.stderr, /incomplete: no task_closed row/);
    }
  });
});

test('#56 review: a task_id with a trailing YAML comment is still the id (other row rejected, matching row lands); an unparseable task_id line is fail-closed', () => {
  for (const idLine of ['task_id: 20260926-000000-abcd  # kickoff id', 'task_id: "20260926-000000-abcd" # quoted']) {
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir, { seed: `status: approved\n${idLine}\n${AC_BLOCK}` });
      closeoutInWorktree(dir);
      writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done\n${idLine}\n${AC_BLOCK}`);
      writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n' + rowFor('some-other-task'));
      git('add', '-A');
      let r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
      assert.equal(r.status, 2, `${idLine}: ${r.stderr}`);
      assert.match(r.stderr, /no task_closed row for task_id 20260926-000000-abcd/);
      writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n' + rowFor('20260926-000000-abcd'));
      git('add', '-A');
      r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
      assert.equal(r.status, 0, `${idLine}: ${r.stderr}`);
    });
  }
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { seed: `status: approved\ntask_id: abcd#x\n${AC_BLOCK}` });
    closeoutInWorktree(dir); // CLOSED_ROW carries task_id t1 — must NOT be accepted as "seed has no id"
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /task_id line that is not a plain non-empty scalar/);
  });
});

test('#56 review: the AC record covers deeper subsections, repeated headings and other bullets; CRLF and [X] land', () => {
  const cases = [
    ['### subsection', '# S\n\n## Acceptance Criteria\n\n- [x] one\n\n### Remaining\n\n- [ ] two\n'],
    ['repeated heading', '# S\n\n## Acceptance Criteria\n\n- [x] one\n\n## Notes\n\ntext\n\n## Acceptance Criteria\n\n- [ ] two\n'],
    ['star bullet', '# S\n\n## Acceptance Criteria\n\n- [x] one\n* [ ] two\n'],
    ['numbered bullet', '# S\n\n## Acceptance Criteria\n\n1. [x] one\n2. [ ] two\n'],
  ];
  for (const [name, scope] of cases) {
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir, { scope });
      closeoutInWorktree(dir);
      git('add', '-A');
      const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low' });
      assert.equal(r.status, 2, `${name}: ${r.stderr}`);
      assert.match(r.stderr, /1 unchecked acceptance criteria/, name);
      assert.match(r.stderr, /- \[ \] two/, name);
    });
    // the same shapes gate the in-flight (non-closeout) commit too — Check 3 shares the parser
    withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': scope }, (dir) => {
      const r = runGate(dir);
      assert.equal(r.status, 2, `check 3 ${name}: ${r.stderr}`);
      assert.match(r.stderr, /1 acceptance criteria not met/, name);
    });
  }
  for (const [name, scope] of [
    ['CRLF + [X]', '# S\r\n\r\n## Acceptance Criteria\r\n\r\n- [X] one\r\n- [x] two\r\n'],
    ['non-checkbox prose after the AC section', '# S\n\n## Acceptance Criteria\n\n- [x] one\n\n## Cycles\n\n1. step one\n'],
    ['a closing # run and trailing spaces on the heading', '# S\n\n## Acceptance Criteria ##  \n\n- [x] one\n'],
  ]) {
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir, { scope });
      closeoutInWorktree(dir);
      git('add', '-A');
      const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
      assert.equal(r.status, 0, `${name}: ${r.stderr}`);
      assert.match(r.stderr, /closeout landing/, name);
    });
  }
});

test('#56 review: a row whose top-level event is not task_closed (nested "event") is not the audit row', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { seed: SEED_WITH_ID });
    closeoutInWorktree(dir);
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done\ntask_id: "20260926-000000-abcd"\n${AC_BLOCK}`);
    writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n{"event":"not_closed","nested":{"event":"task_closed"},"meta":{"task_id":"20260926-000000-abcd"}}\n');
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /incomplete: no task_closed row for task_id/);
  });
});

test('#56 review r2/r3: code fences never hide a box — the AC section is a checklist, fail-closed', () => {
  const shapes = [
    ['literal ~~~ inside a closed backtick block', '# S\n\n## Acceptance Criteria\n\n- [x] one\n\n```\n~~~\n```\n- [ ] two\n'],
    ['unterminated fence', '# S\n\n## Acceptance Criteria\n\n- [x] one\n\n```\n- [ ] two\n'],
    ['inline ```js``` paragraph', '# S\n\n## Acceptance Criteria\n\n- [x] one\n\nuse ```js``` inline\n- [ ] two\n'],
    ['closer shorter than opener', '# S\n\n## Acceptance Criteria\n\n- [x] one\n\n````\n```\n- [ ] two\n'],
    ['bullet-attached opener (r3 high)', '# S\n\n## Acceptance Criteria\n\n- [x] one\n- ```md\n  example\n  ```\n- [ ] two\n```\n'],
    ['closed fence around a box', '# S\n\n## Acceptance Criteria\n\n- [x] one\n\n~~~md\n- [ ] two\n~~~\n'],
  ];
  for (const [name, scope] of shapes) {
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir, { scope });
      closeoutInWorktree(dir);
      git('add', '-A');
      const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
      assert.equal(r.status, 2, `${name}: ${r.stderr}`);
      assert.match(r.stderr, /- \[ \] two/, name);
    });
    withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': scope }, (dir) => {
      assert.equal(runGate(dir).status, 2, `check 3 ${name}`);
    });
  }
});

test('#56 review r2: a heading indented 1-3 spaces is still the heading (fail-open regression), and a nested repeated AC heading keeps the outer boundary', () => {
  for (const [name, scope] of [
    ['indented heading', '# S\n\n   ## Acceptance Criteria\n\n- [x] one\n- [ ] two\n'],
    ['nested repeated heading', '# S\n\n## Acceptance Criteria\n\n- [x] one\n\n### Acceptance Criteria\n\n- [x] inner\n\n### Remaining\n\n- [ ] two\n'],
  ]) {
    withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': scope }, (dir) => {
      const r = runGate(dir);
      assert.equal(r.status, 2, `check 3 ${name}: ${r.stderr}`);
      assert.match(r.stderr, /1 acceptance criteria not met/, name);
    });
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir, { scope });
      closeoutInWorktree(dir);
      git('add', '-A');
      const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low' });
      assert.equal(r.status, 2, `${name}: ${r.stderr}`);
      assert.match(r.stderr, /- \[ \] two/, name);
    });
  }
});

test('#56 review r2: an empty task_id (bare or "") is fail-closed, not read from the next line and not matched by an empty meta.task_id', () => {
  for (const idLine of ['task_id:', 'task_id: ""', "task_id: ''"]) {
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir, { seed: `status: approved\n${idLine}\n${AC_BLOCK}` });
      closeoutInWorktree(dir);
      writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done\n${idLine}\n${AC_BLOCK}`);
      writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n' + rowFor('') + rowFor('acceptance_criteria:'));
      git('add', '-A');
      const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
      assert.equal(r.status, 2, `${idLine}: ${r.stderr}`);
      assert.match(r.stderr, /task_id line that is not a plain non-empty scalar/, idLine);
    });
  }
});

test('#56 review r2: the seed flip cannot land alone with the unchecked scope still committed (two-commit split) -> BLOCK even docs-only', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { scope: UNCHECKED_SCOPE });
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done\n${AC_BLOCK}`);
    git('add', '-A'); // flip only, docs-only
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /HARNESS BLOCK: .*1 unchecked acceptance criteria/);
    assert.doesNotMatch(r.stderr, /still in the commit/);
  });
});

test('#56 review r3/r5: a closing `#` run needs a space (`Acceptance Criteria#` is not the heading); an empty `##` line does not end the record', () => {
  withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': '# S\n\n## Acceptance Criteria ##\n\n- [x] one\n\n##\n\n- [ ] two\n' }, (dir) => {
    const r = runGate(dir);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /- \[ \] two/);
  });
  withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': '# S\n\n## Acceptance Criteria#\n\n- [ ] one\n' }, (dir) => {
    const r = runGate(dir);
    assert.equal(r.status, 0);
    assert.match(r.stderr, /No Acceptance Criteria section/);
  });
});

test('#56 review r3: deleting the worktree seed.yaml after staging a false closeout does not skip the judgement', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { scope: UNCHECKED_SCOPE });
    closeoutInWorktree(dir);
    git('add', '-A');
    unlinkSync(join(dir, 'docs', 'harness', 'seed.yaml')); // unstaged deletion; the index still carries `done`
    for (const input of [
      { tool_input: { command: 'git commit -m x' }, session_state: { cwd: dir } },
      { mode: 'hook', hook: 'pre-commit', session_state: { cwd: dir } },
    ]) {
      const r = spawnSync('node', [GATE], { input: JSON.stringify(input), cwd: dir, encoding: 'utf-8', env: { ...HERMETIC, TEST_RISK_LEVEL: 'low' } });
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stderr, /1 unchecked acceptance criteria/);
    }
  });
});

test('#56 review r3: a git failure while verifying an established closeout is fail-closed (BLOCK), not "not a closeout"', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir);
    closeoutInWorktree(dir);
    git('add', '-A');
    // PATH shim: real git, except `ls-tree` and `show HEAD:docs/harness/current-scope.md` fail
    const shim = join(dir, 'shim');
    mkdirSync(shim);
    const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf-8' }).trim();
    writeFileSync(join(shim, 'git'), `#!/bin/sh\nfor a in "$@"; do case "$a" in ls-tree|HEAD:docs/harness/current-scope.md) exit 128;; esac; done\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low', PATH: `${shim}:${process.env.PATH}` });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /HARNESS BLOCK: .*could not be verified/);
  });
});

test('#56 review r4: a `# …` line inside a fence or HTML comment cannot hide a box; a blockquoted box counts; non-checkbox prose after the section is fine', () => {
  const stillOpen = [
    ['shell comment in a bash fence', '# S\n\n## Acceptance Criteria\n\n- [x] one\n\n```bash\n# run the suite\n```\n- [ ] two\n'],
    ['heading-looking line in an unterminated fence', '# S\n\n## Acceptance Criteria\n\n- [x] one\n\n~~~\n## not a heading\n- [ ] two\n'],
    ['bullet-attached fence with a # line', '# S\n\n## Acceptance Criteria\n\n- [x] one\n- ```sh\n  # comment\n  ```\n- [ ] two\n'],
    ['html comment spanning lines', '# S\n\n## Acceptance Criteria\n\n- [x] one\n\n<!--\n# note\n-->\n- [ ] two\n'],
    ['blockquoted box', '# S\n\n## Acceptance Criteria\n\n- [x] one\n> - [ ] two\n'],
    ['nested blockquote box', '# S\n\n## Acceptance Criteria\n\n- [x] one\n> > - [ ] two\n'],
  ];
  for (const [name, scope] of stillOpen) {
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir, { scope });
      closeoutInWorktree(dir);
      git('add', '-A');
      const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
      assert.equal(r.status, 2, `${name}: ${r.stderr}`);
      assert.match(r.stderr, /- \[ \] two/, name);
    });
    withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': scope }, (dir) => {
      assert.equal(runGate(dir).status, 2, `check 3 ${name}`);
    });
  }
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { scope: '# S\n\n## Acceptance Criteria\n\n- [x] one\n\n```bash\n# run\n```\n\n<!-- # x -->\n\n## Follow-ups\n\n1. later (a step, not a checkbox — #48-4)\n' });
    closeoutInWorktree(dir);
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /closeout landing/);
  });
});

test('#56 review r4: the block message tells how to undo the staged closeout; following it (undo, check off, commit, redo) lands', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { scope: UNCHECKED_SCOPE });
    // an unrelated tracked file under docs/harness with an UNSTAGED edit must survive the undo (r7: a directory pathspec destroyed it)
    writeFileSync(join(dir, 'docs', 'harness', 'notes.md'), 'k\n');
    git('add', 'docs/harness/notes.md');
    git('commit', '-q', '-m', 'notes');
    closeoutInWorktree(dir);
    git('add', '-A');
    writeFileSync(join(dir, 'docs', 'harness', 'notes.md'), 'k3 unstaged\n');
    const blocked = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /`git restore --staged --worktree -- docs\/harness\/seed\.yaml docs\/harness\/current-scope\.md docs\/harness\/audit\.jsonl`/);
    git('restore', '--staged', '--worktree', '--', 'docs/harness/seed.yaml', 'docs/harness/current-scope.md', 'docs/harness/audit.jsonl');
    assert.equal(readFileSync(join(dir, 'docs', 'harness', 'notes.md'), 'utf-8'), 'k3 unstaged\n', 'unrelated unstaged edit survives');
    writeFileSync(join(dir, 'docs', 'harness', 'current-scope.md'), '# Scope\n\n## Acceptance Criteria\n\n- [x] not done yet\n');
    git('add', '-A');
    assert.equal(runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' }).status, 0, 'check-off commit');
    git('commit', '-q', '-m', 'check off');
    closeoutInWorktree(dir);
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /closeout landing/);
  });
});

test('#56 review r4/r5: an index seed read that fails for a git reason on an approved task is fail-closed, whatever the worktree seed says', () => {
  for (const worktreeSeed of [null, `status: approved\n${AC_BLOCK}`]) {
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir);
      closeoutInWorktree(dir);
      git('add', '-A');
      if (worktreeSeed) writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), worktreeSeed); // re-approved for the next task, unstaged
      const shim = join(dir, 'shim');
      mkdirSync(shim);
      const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf-8' }).trim();
      writeFileSync(join(shim, 'git'), `#!/bin/sh\nfor a in "$@"; do case "$a" in :docs/harness/seed.yaml) exit 128;; esac; done\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
      const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low', PATH: `${shim}:${process.env.PATH}` });
      assert.equal(r.status, 2, `${worktreeSeed ? 're-approved' : 'done'} worktree: ${r.stderr}`);
      assert.match(r.stderr, /HARNESS BLOCK: .*could not be verified/);
      assert.doesNotMatch(r.stderr, /not staged/);
    });
  }
});

test('#56 review r5: nothing closes the AC section — container-prefixed fake closers, HTML blocks, nested containers and pre-heading fence/comment noise cannot hide a box', () => {
  const shapes = [
    ['container-prefixed closer inside a fence', '# S\n\n## Acceptance Criteria\n- [x] one\n```\n> ```\n## Next\n```\n\n- [ ] two\n'],
    ['indented fake closer inside a fence', '# S\n\n## Acceptance Criteria\n- [x] one\n```\n    ```\n## Next\n```\n\n- [ ] two\n'],
    ['html block with a heading inside', '# S\n\n## Acceptance Criteria\n- [x] one\n<details>\n## Next\n</details>\n\n- [ ] two\n'],
    ['pre block with a heading inside', '# S\n\n## Acceptance Criteria\n- [x] one\n<pre>\n# Next\n</pre>\n\n- [ ] two\n'],
    ['nested list container', '# S\n\n## Acceptance Criteria\n- [x] one\n- - [ ] two\n'],
    ['list then blockquote container', '# S\n\n## Acceptance Criteria\n- [x] one\n- > - [ ] two\n'],
    ['blockquote without a space', '# S\n\n## Acceptance Criteria\n- [x] one\n>- [ ] two\n'],
    ['a later H2 with a box (AC section is last by template)', '# S\n\n## Acceptance Criteria\n- [x] one\n\n## Follow-ups\n- [ ] two\n'],
    ['indented fence before the real heading', '# S\n\n    ```\n## Acceptance Criteria\n- [x] one\n- [ ] two\n'],
    ['inline comment opener before the real heading', '# S\n\ntext <!-- note\n## Acceptance Criteria\n- [x] one\n- [ ] two\n'],
    ['repeated heading after an html comment', '# S\n\n## Acceptance Criteria\n- [x] one\n<!--\n-->\n## Acceptance Criteria\n- [ ] two\n'],
  ];
  for (const [name, scope] of shapes) {
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir, { scope });
      closeoutInWorktree(dir);
      git('add', '-A');
      const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low' });
      assert.equal(r.status, 2, `${name}: ${r.stderr}`);
      assert.match(r.stderr, /- \[ \] two/, name);
    });
    withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': scope }, (dir) => {
      const r = runGate(dir);
      assert.equal(r.status, 2, `check 3 ${name}: ${r.stderr}`);
    });
  }
  // non-checkbox prose after the AC section (the one real historical shape, `## Cycles`) still lands
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { scope: '# S\n\n## Acceptance Criteria\n- [x] one\n\n## Cycles\n1. step one — 확인: 픽스처\n2. step two\n' });
    closeoutInWorktree(dir);
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /closeout landing/);
  });
});

test('#56 review r5/r7: the undo command names only paths git knows — a NEW audit.jsonl is removed, a scope absent from HEAD and index is left out, and the command never fails', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { scope: UNCHECKED_SCOPE });
    git('rm', '-q', 'docs/harness/audit.jsonl');
    git('commit', '-q', '-m', 'no audit log yet');
    closeoutInWorktree(dir); // creates audit.jsonl
    git('add', '-A');
    const blocked = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(blocked.status, 2);
    const cmd = blocked.stderr.match(/`(git restore --staged --worktree -- [^`]+)`/)?.[1];
    assert.equal(cmd, 'git restore --staged --worktree -- docs/harness/seed.yaml docs/harness/current-scope.md docs/harness/audit.jsonl');
    git(...cmd.split(' ').slice(1));
    assert.equal(existsSync(join(dir, 'docs', 'harness', 'audit.jsonl')), false, 'the file that was new in the closeout commit is removed, as the message says');
    assert.match(readFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), 'utf-8'), /^status: approved/m);
  });
  withDir({}, (dir) => {
    // HEAD has no scope and the commit does not add one: the path is unknown to git and must not be in the command
    const git = gitRepoWithTask(dir);
    unlinkSync(join(dir, 'docs', 'harness', 'current-scope.md'));
    git('add', '-A');
    git('commit', '-q', '-m', 'scope lost earlier');
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done\n${AC_BLOCK}`);
    writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n' + CLOSED_ROW);
    git('add', '-A');
    const blocked = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low' });
    assert.equal(blocked.status, 2);
    const cmd = blocked.stderr.match(/`(git restore --staged --worktree -- [^`]+)`/)?.[1];
    assert.equal(cmd, 'git restore --staged --worktree -- docs/harness/seed.yaml docs/harness/audit.jsonl');
    git(...cmd.split(' ').slice(1)); // must not throw
    assert.match(readFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), 'utf-8'), /^status: approved/m);
  });
});

test('#56 review r5/r7 (continued): after the undo, check off, commit and redo -> lands', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { scope: UNCHECKED_SCOPE });
    git('rm', '-q', 'docs/harness/audit.jsonl');
    git('commit', '-q', '-m', 'no audit log yet');
    closeoutInWorktree(dir);
    git('add', '-A');
    git('restore', '--staged', '--worktree', '--', 'docs/harness/seed.yaml', 'docs/harness/current-scope.md', 'docs/harness/audit.jsonl');
    writeFileSync(join(dir, 'docs', 'harness', 'current-scope.md'), '# Scope\n\n## Acceptance Criteria\n\n- [x] not done yet\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'check off');
    closeoutInWorktree(dir);
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 0, r.stderr);
  });
});

test('#56 review r6: seed status is ONE grammar — `Done`/`DONE`/`done-later`/`Approved` cannot dodge the judgement; `Done` lands, `done-later` is not the contract state', () => {
  for (const value of ['Done', 'DONE', 'done-later', '"Done"']) {
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir, { scope: UNCHECKED_SCOPE });
      closeoutInWorktree(dir);
      writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: ${value}\n${AC_BLOCK}`);
      writeFileSync(join(dir, 'a.js'), 'x\n'); // docs-only
      git('add', '-A');
      for (const cmd of ['git commit -m x', 'git commit -am x']) {
        const r = runGateHermetic(dir, cmd, { TEST_RISK_LEVEL: 'low' });
        assert.equal(r.status, 2, `${value} ${cmd}: ${r.stderr}`);
        assert.match(r.stderr, /1 unchecked acceptance criteria/, value);
      }
    });
  }
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { seed: `status: Approved\n${AC_BLOCK}`, scope: UNCHECKED_SCOPE });
    closeoutInWorktree(dir);
    writeFileSync(join(dir, 'a.js'), 'x\n');
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /1 unchecked acceptance criteria/);
  });
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir);
    closeoutInWorktree(dir);
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: Done  # closed\n${AC_BLOCK}`);
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /closeout landing/);
  });
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir);
    closeoutInWorktree(dir);
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done-later\n${AC_BLOCK}`);
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /incomplete: docs\/harness\/seed\.yaml leaves `approved` for `done-later`/);
  });
});

test('#56 review r6: the AC heading is recognized behind any prefix (blockquote, list marker, deep indent, trailing NBSP); no heading at all is the backstop, not a silent allow', () => {
  for (const [name, heading] of [['blockquote', '> ## Acceptance Criteria'], ['list marker', '- ## Acceptance Criteria'], ['4-space indent', '    ## Acceptance Criteria'], ['trailing NBSP', '## Acceptance Criteria\u00a0'], ['closing run', '## Acceptance Criteria ##']]) {
    const scope = `# S\n\n${heading}\n\n- [x] one\n- [ ] two\n`;
    withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': scope }, (dir) => {
      const r = runGate(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'high' });
      assert.equal(r.status, 2, `check 3 ${name}: ${r.stderr}`);
      assert.match(r.stderr, /1 acceptance criteria not met/, name);
    });
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir, { scope });
      closeoutInWorktree(dir);
      git('add', '-A');
      const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low' });
      assert.equal(r.status, 2, `${name}: ${r.stderr}`);
    });
  }
  withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': '# S\n\n## Scope\n\n- [ ] not under an AC heading\n' }, (dir) => {
    const code = runGate(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(code.status, 2, code.stderr);
    assert.match(code.stderr, /HARNESS BACKSTOP[\s\S]*no Acceptance Criteria section/);
    const docs = runGate(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low' });
    assert.equal(docs.status, 0);
    assert.match(docs.stderr, /No Acceptance Criteria section/);
  });
});

test('#56 review r6: a U+2028 / U+2029 / bare CR inside a box description does not drop the box', () => {
  for (const [name, sep] of [['U+2028', '\u2028'], ['U+2029', '\u2029'], ['bare CR', '\r']]) {
    const scope = `# S\n\n## Acceptance Criteria\n\n- [x] one\n- [ ] two${sep}more text\n`;
    withDir({ 'seed.yaml': `status: approved\n${AC_BLOCK}`, 'current-scope.md': scope }, (dir) => {
      const r = runGate(dir);
      assert.equal(r.status, 2, `check 3 ${name}: ${r.stderr}`);
      assert.match(r.stderr, /- \[ \] two/, name);
    });
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir, { scope });
      closeoutInWorktree(dir);
      git('add', '-A');
      const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low' });
      assert.equal(r.status, 2, `${name}: ${r.stderr}`);
    });
  }
});

test('#56 review r6: a HEAD seed that exists but cannot be read is fail-closed; a >1 MiB HEAD seed is simply read', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { scope: UNCHECKED_SCOPE });
    closeoutInWorktree(dir);
    git('add', '-A');
    const shim = join(dir, 'shim');
    mkdirSync(shim);
    const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf-8' }).trim();
    writeFileSync(join(shim, 'git'), `#!/bin/sh\nfor a in "$@"; do case "$a" in HEAD:docs/harness/seed.yaml) exit 128;; esac; done\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low', PATH: `${shim}:${process.env.PATH}` });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /HARNESS BLOCK: .*could not be verified/);
  });
  withDir({}, (dir) => {
    const big = `status: approved\n${AC_BLOCK}# ${'x'.repeat(1_500_000)}\n`;
    const git = gitRepoWithTask(dir, { seed: big, scope: UNCHECKED_SCOPE });
    closeoutInWorktree(dir);
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), big.replace('status: approved', 'status: done'));
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /1 unchecked acceptance criteria/);
  });
});

test('#56 review r7: a committed status line that does not parse, a removed status line, or a removed seed still leaves `approved` -> judged (BLOCK on unchecked), and is not `done` (incomplete) when all checked', () => {
  const shapes = [
    ['done#closed', `status: done#closed\n${AC_BLOCK}`],
    ['space before colon', `status : done\n${AC_BLOCK}`],
    ['BOM', `\uFEFFstatus: done\n${AC_BLOCK}`],
    ['trailing junk', `status: done extra\n${AC_BLOCK}`],
    ['trailing NBSP', `status: done\u00a0\n${AC_BLOCK}`],
    ['status line removed', `name: x\n${AC_BLOCK}`],
    ['seed removed', null],
  ];
  for (const [name, seed] of shapes) {
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir, { scope: UNCHECKED_SCOPE });
      closeoutInWorktree(dir);
      writeFileSync(join(dir, 'a.js'), 'x\n'); // docs-only
      if (seed === null) unlinkSync(join(dir, 'docs', 'harness', 'seed.yaml')); else writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), seed);
      git('add', '-A');
      const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low' });
      assert.equal(r.status, 2, `${name}: ${r.stderr}`);
      assert.match(r.stderr, /1 unchecked acceptance criteria/, name);
    });
  }
  // all [x]: the grammar-valid `status : done` and BOM forms are simply `done` -> land; the rest are incomplete -> backstop
  for (const [name, seed, lands] of [['space before colon', `status : done\n${AC_BLOCK}`, true], ['BOM', `\uFEFFstatus: done\n${AC_BLOCK}`, true], ['done#closed', `status: done#closed\n${AC_BLOCK}`, false], ['status line removed', `name: x\n${AC_BLOCK}`, false]]) {
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir);
      closeoutInWorktree(dir);
      writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), seed);
      git('add', '-A');
      const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
      assert.equal(r.status, lands ? 0 : 2, `${name}: ${r.stderr}`);
      if (!lands) assert.match(r.stderr, /incomplete: docs\/harness\/seed\.yaml leaves `approved` for (a status line that is not a plain scalar|no status line)/, name);
    });
  }
});

test('#56 review r7: an incomplete closeout always reaches the backstop — `done-later` with the all-[x] scope retained + code -> BLOCK, docs-only -> allow with the warning', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir);
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done-later\n${AC_BLOCK}`);
    writeFileSync(join(dir, 'a.js'), 'y\n');
    git('add', '-A');
    const code = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(code.status, 2, code.stderr);
    assert.match(code.stderr, /incomplete: docs\/harness\/seed\.yaml leaves `approved` for `done-later`[\s\S]*HARNESS BACKSTOP[\s\S]*reason: incomplete closeout/);
    const docs = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low' });
    assert.equal(docs.status, 0, docs.stderr);
    assert.match(docs.stderr, /incomplete: docs\/harness\/seed\.yaml leaves `approved` for `done-later`/);
  });
});

test('#56 review r7: a BOM before a line-1 task_id at HEAD does not turn the id into "no id"', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { seed: `\uFEFFtask_id: "20260926-000000-abcd"\nstatus: approved\n${AC_BLOCK}` });
    closeoutInWorktree(dir);
    writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n' + rowFor('some-other-task'));
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /no task_closed row for task_id 20260926-000000-abcd/);
  });
});

test('#56 review r8: `task_id :` (space before the colon) is the same key as `task_id:` — other row rejected, matching row lands, malformed value fail-closed', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { seed: `status: approved\ntask_id : "20260926-000000-abcd"\n${AC_BLOCK}` });
    closeoutInWorktree(dir);
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done\ntask_id : "20260926-000000-abcd"\n${AC_BLOCK}`);
    writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n' + rowFor('some-other-task'));
    git('add', '-A');
    let r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /no task_closed row for task_id 20260926-000000-abcd/);
    writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n' + rowFor('20260926-000000-abcd'));
    git('add', '-A');
    r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 0, r.stderr);
  });
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { seed: `status: approved\ntask_id : "\n${AC_BLOCK}` });
    closeoutInWorktree(dir);
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /task_id line that is not a plain non-empty scalar/);
  });
});

test('#56 review r8: the undo command names only what THIS commit changed — an unstaged check-off in a scope the commit did not delete survives', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { scope: UNCHECKED_SCOPE });
    // seed flip + audit row staged; the scope stays, and the user has an UNSTAGED check-off in it
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done\n${AC_BLOCK}`);
    writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n' + CLOSED_ROW);
    git('add', 'docs/harness/seed.yaml', 'docs/harness/audit.jsonl');
    writeFileSync(join(dir, 'docs', 'harness', 'current-scope.md'), '# Scope\n\n## Acceptance Criteria\n\n- [x] not done yet\n');
    const blocked = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low' });
    assert.equal(blocked.status, 2, blocked.stderr);
    const cmd = blocked.stderr.match(/`(git restore --staged --worktree -- [^`]+)`/)?.[1];
    assert.equal(cmd, 'git restore --staged --worktree -- docs/harness/seed.yaml docs/harness/audit.jsonl');
    git(...cmd.split(' ').slice(1));
    assert.match(readFileSync(join(dir, 'docs', 'harness', 'current-scope.md'), 'utf-8'), /- \[x\] not done yet/, 'the unstaged check-off survives');
    assert.match(readFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), 'utf-8'), /^status: approved/m);
    // and the advertised next step works: stage the check-off, commit, redo the closeout
    git('add', '-A');
    git('commit', '-q', '-m', 'check off');
    closeoutInWorktree(dir);
    git('add', '-A');
    assert.equal(runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' }).status, 0);
  });
});

test('#56 review r9: a scope the commit MODIFIES (check-offs staged, not deleted) is not in the undo command; the staged check-off survives', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { scope: UNCHECKED_SCOPE });
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done\n${AC_BLOCK}`);
    writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n' + CLOSED_ROW);
    writeFileSync(join(dir, 'docs', 'harness', 'current-scope.md'), '# Scope\n\n## Acceptance Criteria\n\n- [x] not done yet\n\n## Evidence\n\nnotes the user wants to keep\n');
    git('add', '-A');
    for (const cmdForm of ['git commit -m x', 'git commit -am x']) {
      const blocked = runGateHermetic(dir, cmdForm, { TEST_RISK_LEVEL: 'low' });
      assert.equal(blocked.status, 2, `${cmdForm}: ${blocked.stderr}`);
      const cmd = blocked.stderr.match(/`(git restore --staged --worktree -- [^`]+)`/)?.[1];
      assert.equal(cmd, 'git restore --staged --worktree -- docs/harness/seed.yaml docs/harness/audit.jsonl', cmdForm);
    }
    git('restore', '--staged', '--worktree', '--', 'docs/harness/seed.yaml', 'docs/harness/audit.jsonl');
    assert.match(git('show', ':docs/harness/current-scope.md').toString(), /- \[x\] not done yet[\s\S]*notes the user wants to keep/, 'the staged check-off and notes survive');
    git('commit', '-q', '-m', 'check off');
    closeoutInWorktree(dir);
    git('add', '-A');
    assert.equal(runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' }).status, 0);
  });
});

test('#56 review r9: inside a repository (`.git` present), a git that cannot read HEAD at all is fail-closed, not "not a repository"', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { scope: UNCHECKED_SCOPE });
    closeoutInWorktree(dir);
    git('add', '-A');
    const shim = join(dir, 'shim');
    mkdirSync(shim);
    const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf-8' }).trim();
    writeFileSync(join(shim, 'git'), `#!/bin/sh\nfor a in "$@"; do case "$a" in HEAD:docs/harness/seed.yaml|rev-parse) exit 128;; esac; done\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low', PATH: `${shim}:${process.env.PATH}` });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /HARNESS BLOCK: .*could not be verified/);
    assert.doesNotMatch(r.stderr, /`git restore --staged --worktree -- docs\//, 'no executable command with real paths');
    assert.match(r.stderr, /by hand/);
  });
});

test('#56 review r9: a CR inside a quoted task_id, or an invalid task_id line beside a valid one, is fail-closed', () => {
  for (const [name, idLines] of [['CR in quotes', 'task_id: "t\r1"'], ['invalid line before a valid one', 'task_id:\ntask_id: t1']]) {
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir, { seed: `status: approved\n${idLines}\n${AC_BLOCK}` });
      closeoutInWorktree(dir);
      writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n' + rowFor('t\r1') + rowFor('t1'));
      git('add', '-A');
      const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
      assert.equal(r.status, 2, `${name}: ${r.stderr}`);
      assert.match(r.stderr, /task_id line that is not a plain non-empty scalar/, name);
    });
  }
});

test('#62 audit.jsonl must be append-only: a removed or replaced row makes the closeout incomplete (plain, -a, hook); appending lands', () => {
  const forms = [
    ['plain', (dir) => runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' })],
    ['-a', (dir) => runGateHermetic(dir, 'git commit -am x', { TEST_RISK_LEVEL: 'medium' })],
    ['hook', (dir) => spawnSync('node', [GATE], {
      input: JSON.stringify({ mode: 'hook', hook: 'pre-commit', session_state: { cwd: dir } }),
      cwd: dir, encoding: 'utf-8', env: { ...HERMETIC, TEST_RISK_LEVEL: 'medium' },
    })],
  ];
  for (const [name, run] of forms) {
    // existing row DELETED, task_closed row added -> not a closeout
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir);
      closeoutInWorktree(dir);
      writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), CLOSED_ROW);
      git('add', '-A');
      const r = run(dir);
      assert.equal(r.status, 2, `${name} deleted: ${r.stderr}`);
      assert.match(r.stderr, /audit\.jsonl is not append-only/, name);
    });
    // existing row REPLACED by the task_closed row (same line count) -> not a closeout
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir);
      closeoutInWorktree(dir);
      writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened","edited":true}\n' + CLOSED_ROW);
      git('add', '-A');
      const r = run(dir);
      assert.equal(r.status, 2, `${name} replaced: ${r.stderr}`);
      assert.match(r.stderr, /audit\.jsonl is not append-only/, name);
    });
    // r1 high: a removed row that starts with `-- ` prints as `--- …` in the diff — a prefix-based
    // header exemption let it through; only pre-hunk lines are header
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir);
      writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n-- broken row\n');
      git('add', '-A');
      git('commit', '-q', '-m', 'broken row at HEAD');
      closeoutInWorktree(dir);
      git('add', '-A');
      const r = run(dir);
      assert.equal(r.status, 2, `${name} header-looking row: ${r.stderr}`);
      assert.match(r.stderr, /audit\.jsonl is not append-only/, name);
    });
    // r1 low (design): a HEAD file without a trailing newline re-emits its last row as -/+ on
    // append — fail-closed, the message names the case
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir);
      writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}');
      git('add', '-A');
      git('commit', '-q', '-m', 'no trailing newline at HEAD');
      closeoutInWorktree(dir);
      git('add', '-A');
      const r = run(dir);
      assert.equal(r.status, 2, `${name} no trailing newline: ${r.stderr}`);
      assert.match(r.stderr, /without a trailing newline/, name);
    });
    // append only (the closeoutInWorktree shape) still lands
    withDir({}, (dir) => {
      const git = gitRepoWithTask(dir);
      closeoutInWorktree(dir);
      git('add', '-A');
      const r = run(dir);
      assert.equal(r.status, 0, `${name} append: ${r.stderr}`);
      assert.match(r.stderr, /closeout landing/, name);
    });
  }
});

test('#62 r2: a textconv driver on audit.jsonl cannot hide a removed row — the diff is read with --no-textconv', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir);
    // the driver filters the row that the closeout deletes: with textconv applied, both sides of
    // the diff agree and the deletion vanishes (pure append → would land)
    writeFileSync(join(dir, '.gitattributes'), 'docs/harness/audit.jsonl diff=hide\n');
    git('config', 'diff.hide.textconv', 'grep -v broken');
    writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n{"event":"broken"}\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'row to be hidden at HEAD');
    closeoutInWorktree(dir);
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /audit\.jsonl is not append-only/);
  });
});

test('#56 r10 fixtures: -a with an UNSTAGED closeout derives the undo list from HEAD (all three paths); valid-then-invalid duplicate key is INVALID; an unborn HEAD is not a closeout', () => {
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { scope: UNCHECKED_SCOPE });
    closeoutInWorktree(dir); // nothing staged: only -a sees it
    const r = runGateHermetic(dir, 'git commit -am x', { TEST_RISK_LEVEL: 'low' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /`git restore --staged --worktree -- docs\/harness\/seed\.yaml docs\/harness\/current-scope\.md docs\/harness\/audit\.jsonl`/);
  });
  withDir({}, (dir) => {
    const git = gitRepoWithTask(dir, { seed: `status: approved\ntask_id: t1\ntask_id:\n${AC_BLOCK}` });
    closeoutInWorktree(dir);
    writeFileSync(join(dir, 'docs', 'harness', 'audit.jsonl'), '{"event":"thread_opened"}\n' + rowFor('t1'));
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'medium' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /task_id line that is not a plain non-empty scalar/);
  });
  withDir({}, (dir) => {
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: HERMETIC });
    git('init', '-q', '-b', 'main'); // unborn HEAD
    writeFileSync(join(dir, 'docs', 'harness', 'seed.yaml'), `status: done\n${AC_BLOCK}`);
    writeFileSync(join(dir, 'a.js'), 'x\n');
    git('add', '-A');
    const r = runGateHermetic(dir, 'git commit -m x', { TEST_RISK_LEVEL: 'low' });
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /HARNESS BLOCK/);
  });
});

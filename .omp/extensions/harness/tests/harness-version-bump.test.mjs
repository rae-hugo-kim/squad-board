// harness-version-bump.test.mjs — CHANGELOG promotion contract of scripts/harness-version-bump.sh
// (issue #47), exercised against isolated temp repos (never this repo's tree or tags).
//
// Contract under test:
//   * a bump promotes the "## [Unreleased]" entries to "## [<new version>] - <date>" and leaves
//     an empty "## [Unreleased]" above it; older sections stay byte-identical (no retroactive split);
//     the CHANGELOG change lands in the SAME bump commit as harness-meta.json, nothing else.
//   * an empty [Unreleased] (or no CHANGELOG.md) is a CHANGELOG no-op; the bump itself still runs.
//   * no harness change since the last tag = full no-op (no commit, no tag, CHANGELOG untouched).
//   * --dry-run reports the promotion but leaves tree, index, tags and HEAD untouched.
//   * uncommitted CHANGELOG state of ANY kind (edits that keep or drop the entries, a staged leftover
//     of a failed earlier bump, an untracked file even under status.showUntrackedFiles=no) aborts the
//     bump before anything is mutated — the bump commit takes the file by pathspec and would sweep it in.
//   * after a failed bump commit, restoring both files lets the next bump land promotion + meta together.
//   * CRLF CHANGELOGs keep CRLF on the inserted lines.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, cpSync, symlinkSync, chmodSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
const SCRIPT = join(repoRoot, 'scripts', 'harness-version-bump.sh');

// Hermetic env: an ambient GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE (e.g. from a hook) would
// redirect every fixture git call at the wrong repo; the user's/system git config (gpgSign,
// core.hooksPath, status.showUntrackedFiles, ...) must not leak into the script's own commit/tag.
function cleanEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
}

function git(cwd, args) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'tag.gpgSign=false', '-c', 'commit.gpgSign=false', ...args], { cwd, encoding: 'utf-8', env: cleanEnv() });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function bump(dir, args = []) {
  return spawnSync('bash', [join(dir, 'scripts', 'harness-version-bump.sh'), ...args], {
    cwd: dir,
    encoding: 'utf-8',
    env: { ...cleanEnv(), GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' },
  });
}

const year = new Date().getFullYear();
const BASE_TAG = `harness/${year}.5`;
const NEW_VERSION = `${year}.6`;
const META = '.omp/extensions/harness/harness-meta.json';

const OLD_SECTION = `## [${year}.5] - 2026-01-01

- **fix(old)**: 과거 항목은 그대로 둡니다.
`;
const ENTRIES = `- **feat(a)**: 첫 항목입니다.
- **fix(b)**: 둘째 항목입니다.
`;

function changelog(unreleasedBody) {
  return `# Changelog\n\n헤더 문구입니다.\n\n## [Unreleased]\n\n${unreleasedBody}${unreleasedBody ? '\n' : ''}${OLD_SECTION}`;
}

// Temp repo: this repo's bump script, a meta file, an optional CHANGELOG.md, an annotated base tag,
// then one harness change (templates/x.md) so a bump is due. Returns the repo dir.
function makeRepo({ changelogText, harnessChange = true }) {
  const dir = mkdtempSync(join(tmpdir(), 'bump-test-'));
  git(dir, ['init', '-q']);
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  cpSync(SCRIPT, join(dir, 'scripts', 'harness-version-bump.sh'));
  mkdirSync(join(dir, dirname(META)), { recursive: true });
  writeFileSync(join(dir, META), `{\n  "version": "${year}.5",\n  "updated": "2026-01-01",\n  "description": "fixture"\n}\n`);
  if (changelogText !== undefined) writeFileSync(join(dir, 'CHANGELOG.md'), changelogText);
  // Keep the audit-score side file (written by the script after the bump) out of `git status`.
  writeFileSync(join(dir, '.gitignore'), '.omp/state/\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
  git(dir, ['tag', '-a', BASE_TAG, '-m', 'base']);
  if (harnessChange) {
    mkdirSync(join(dir, 'templates'), { recursive: true });
    writeFileSync(join(dir, 'templates', 'x.md'), 'changed\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'harness change']);
  }
  return dir;
}

function snapshot(dir) {
  return {
    head: git(dir, ['rev-parse', 'HEAD']).trim(),
    tags: git(dir, ['tag', '-l']).trim(),
    status: git(dir, ['status', '--porcelain']),
    changelog: readFileSync(join(dir, 'CHANGELOG.md'), 'utf-8'),
    meta: readFileSync(join(dir, META), 'utf-8'),
  };
}

function withRepo(opts, fn) {
  const dir = makeRepo(opts);
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('bump promotes [Unreleased] entries to a dated version heading and leaves an empty [Unreleased]', () => {
  withRepo({ changelogText: changelog(ENTRIES) }, (dir) => {
    const r = bump(dir);
    assert.equal(r.status, 0, r.stderr + r.stdout);

    const today = new Date().toISOString().slice(0, 10);
    const text = readFileSync(join(dir, 'CHANGELOG.md'), 'utf-8');
    // Local date (the script uses `date +%Y-%m-%d`) can differ from UTC near midnight; read it from the heading.
    const m = text.match(new RegExp(`^## \\[${NEW_VERSION.replace('.', '\\.')}\\] - (\\d{4}-\\d{2}-\\d{2})$`, 'm'));
    assert.ok(m, `new version heading missing:\n${text}`);
    assert.ok(Math.abs(Date.parse(m[1]) - Date.parse(today)) <= 86400000, `unexpected date ${m[1]}`);

    assert.equal(
      text,
      `# Changelog\n\n헤더 문구입니다.\n\n## [Unreleased]\n\n## [${NEW_VERSION}] - ${m[1]}\n\n${ENTRIES}\n${OLD_SECTION}`,
    );

    // One bump commit that touches exactly meta + CHANGELOG, and the annotated tag points at it.
    const files = git(dir, ['show', '--name-only', '--format=', 'HEAD']).trim().split('\n').sort();
    assert.deepEqual(files, ['.omp/extensions/harness/harness-meta.json', 'CHANGELOG.md']);
    assert.match(git(dir, ['log', '-1', '--format=%s']), /chore\(harness\): bump version to /);
    assert.equal(git(dir, ['rev-parse', `harness/${NEW_VERSION}^{commit}`]).trim(), git(dir, ['rev-parse', 'HEAD']).trim());
    assert.equal(git(dir, ['status', '--porcelain']), '');

    // Idempotent: a second run finds nothing newer than the fresh tag and changes nothing.
    const before = snapshot(dir);
    const again = bump(dir);
    assert.equal(again.status, 0, again.stderr);
    assert.deepEqual(snapshot(dir), before);
  });
});

test('bump with an empty [Unreleased] still bumps but leaves CHANGELOG.md byte-identical', () => {
  const text = changelog('');
  withRepo({ changelogText: text }, (dir) => {
    const r = bump(dir);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(readFileSync(join(dir, 'CHANGELOG.md'), 'utf-8'), text);
    assert.equal(git(dir, ['show', '--name-only', '--format=', 'HEAD']).trim(), '.omp/extensions/harness/harness-meta.json');
    assert.ok(git(dir, ['tag', '-l']).includes(`harness/${NEW_VERSION}`));
  });
});

test('bump without a CHANGELOG.md (consumer repo) still works', () => {
  withRepo({ changelogText: undefined }, (dir) => {
    const r = bump(dir);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.ok(git(dir, ['tag', '-l']).includes(`harness/${NEW_VERSION}`));
    assert.equal(git(dir, ['show', '--name-only', '--format=', 'HEAD']).trim(), '.omp/extensions/harness/harness-meta.json');
  });
});

test('no harness change since the last tag is a full no-op even with [Unreleased] entries', () => {
  withRepo({ changelogText: changelog(ENTRIES), harnessChange: false }, (dir) => {
    const before = snapshot(dir);
    const r = bump(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /nothing to bump/);
    assert.deepEqual(snapshot(dir), before);
  });
});

test('--dry-run reports the promotion without touching tree, index, tags or HEAD', () => {
  withRepo({ changelogText: changelog(ENTRIES) }, (dir) => {
    const before = snapshot(dir);
    const r = bump(dir, ['--dry-run']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`Would bump:\\s+${year}\\.5 -> ${NEW_VERSION}`));
    assert.match(r.stdout, new RegExp(`Would promote:\\s+CHANGELOG\\.md \\[Unreleased\\] -> ## \\[${NEW_VERSION.replace('.', '\\.')}\\]`));
    assert.deepEqual(snapshot(dir), before);
  });
});

test('--dry-run with an empty [Unreleased] says CHANGELOG stays unchanged', () => {
  withRepo({ changelogText: changelog('') }, (dir) => {
    const before = snapshot(dir);
    const r = bump(dir, ['--dry-run']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /CHANGELOG:\s+no \[Unreleased\] entries; unchanged/);
    assert.deepEqual(snapshot(dir), before);
  });
});

test('uncommitted CHANGELOG edits abort the bump before anything is mutated', () => {
  withRepo({ changelogText: changelog(ENTRIES) }, (dir) => {
    writeFileSync(join(dir, 'CHANGELOG.md'), changelog(ENTRIES) + '\n<!-- local edit -->\n');
    const before = snapshot(dir);
    const r = bump(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /CHANGELOG\.md has uncommitted changes/);
    assert.deepEqual(snapshot(dir), before);
  });
});

test('dirty CHANGELOG that dropped its entries still aborts (no meta-only bump beside a dirty CHANGELOG)', () => {
  withRepo({ changelogText: changelog(ENTRIES) }, (dir) => {
    writeFileSync(join(dir, 'CHANGELOG.md'), changelog(''));
    const before = snapshot(dir);
    const r = bump(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /CHANGELOG\.md has uncommitted changes/);
    assert.deepEqual(snapshot(dir), before);
  });
});

test('an untracked CHANGELOG.md aborts even when status.showUntrackedFiles=no hides it', () => {
  withRepo({ changelogText: undefined }, (dir) => {
    git(dir, ['config', 'status.showUntrackedFiles', 'no']);
    writeFileSync(join(dir, 'CHANGELOG.md'), changelog(ENTRIES));
    const tagsBefore = git(dir, ['tag', '-l']);
    const metaBefore = readFileSync(join(dir, META), 'utf-8');
    const r = bump(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /CHANGELOG\.md has uncommitted changes/);
    assert.equal(git(dir, ['tag', '-l']), tagsBefore);
    assert.equal(readFileSync(join(dir, META), 'utf-8'), metaBefore);
    assert.equal(readFileSync(join(dir, 'CHANGELOG.md'), 'utf-8'), changelog(ENTRIES));
  });
});

test('a failed bump commit is not retried into a meta-only bump; restoring both files lets the next bump land cleanly', () => {
  withRepo({ changelogText: changelog(ENTRIES) }, (dir) => {
    // pre-commit hook rejects the first attempt only
    const hook = join(dir, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\nif [ ! -e "$GIT_DIR/hook-ok" ] && [ ! -e .git/hook-ok ]; then touch .git/hook-ok; exit 1; fi\n', { mode: 0o755 });

    const first = bump(dir);
    assert.notEqual(first.status, 0, 'hook should reject the first bump commit');
    assert.ok(!git(dir, ['tag', '-l']).includes(`harness/${NEW_VERSION}`));

    const retry = bump(dir);
    assert.equal(retry.status, 1);
    assert.match(retry.stderr, /CHANGELOG\.md has uncommitted changes/);
    assert.ok(!git(dir, ['tag', '-l']).includes(`harness/${NEW_VERSION}`), 'no tag without the promotion commit');

    git(dir, ['restore', '--staged', '--worktree', '--', 'CHANGELOG.md', META]);
    const third = bump(dir);
    assert.equal(third.status, 0, third.stderr);
    const files = git(dir, ['show', '--name-only', '--format=', 'HEAD']).trim().split('\n').sort();
    assert.deepEqual(files, ['.omp/extensions/harness/harness-meta.json', 'CHANGELOG.md']);
    assert.ok(git(dir, ['tag', '-l']).includes(`harness/${NEW_VERSION}`));
  });
});

test('CRLF CHANGELOG keeps CRLF on the inserted heading and blank line', () => {
  const crlf = changelog(ENTRIES).replace(/\n/g, '\r\n');
  withRepo({ changelogText: crlf }, (dir) => {
    const r = bump(dir);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const text = readFileSync(join(dir, 'CHANGELOG.md'), 'utf-8');
    assert.ok(!/[^\r]\n/.test(text), 'every line ending must stay CRLF');
    assert.match(text, new RegExp(`## \\[Unreleased\\]\\r\\n\\r\\n## \\[${NEW_VERSION.replace('.', '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}\\r\\n\\r\\n- \\*\\*feat\\(a\\)`));
  });
});

test('a deleted tracked CHANGELOG.md (unstaged or staged) aborts instead of shipping a meta-only bump', () => {
  for (const stage of [false, true]) {
    withRepo({ changelogText: changelog(ENTRIES) }, (dir) => {
      if (stage) git(dir, ['rm', '-q', 'CHANGELOG.md']); else rmSync(join(dir, 'CHANGELOG.md'));
      const tagsBefore = git(dir, ['tag', '-l']);
      const metaBefore = readFileSync(join(dir, META), 'utf-8');
      const r = bump(dir);
      assert.equal(r.status, 1, `stage=${stage}: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /CHANGELOG\.md has uncommitted changes/);
      assert.equal(git(dir, ['tag', '-l']), tagsBefore);
      assert.equal(readFileSync(join(dir, META), 'utf-8'), metaBefore);
    });
  }
});

test('a tracked symlinked CHANGELOG.md aborts (the promotion would write through to the target)', () => {
  withRepo({ changelogText: undefined }, (dir) => {
    writeFileSync(join(dir, 'real.md'), changelog(ENTRIES));
    symlinkSync('real.md', join(dir, 'CHANGELOG.md'));
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'symlinked changelog']);
    const before = snapshot(dir);
    const r = bump(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /CHANGELOG\.md has uncommitted changes/);
    assert.deepEqual(snapshot(dir), before);
    assert.equal(readFileSync(join(dir, 'real.md'), 'utf-8'), changelog(ENTRIES));
  });
});

test('a gitignored CHANGELOG.md aborts (git add would fail after the in-place promotion)', () => {
  withRepo({ changelogText: undefined }, (dir) => {
    writeFileSync(join(dir, '.gitignore'), '.omp/state/\nCHANGELOG.md\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'ignore changelog']);
    writeFileSync(join(dir, 'CHANGELOG.md'), changelog(ENTRIES));
    const metaBefore = readFileSync(join(dir, META), 'utf-8');
    const r = bump(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal(readFileSync(join(dir, META), 'utf-8'), metaBefore);
    assert.equal(readFileSync(join(dir, 'CHANGELOG.md'), 'utf-8'), changelog(ENTRIES));
    assert.ok(!git(dir, ['tag', '-l']).includes(`harness/${NEW_VERSION}`));
  });
});

test('promotion keeps the file mode, leaves no temp file behind, and never exposes one to commit hooks', () => {
  withRepo({ changelogText: changelog(ENTRIES) }, (dir) => {
    chmodSync(join(dir, 'CHANGELOG.md'), 0o755);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'exec bit']);
    writeFileSync(join(dir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\ngit status --porcelain --untracked-files=all > .git/hook-status\n', { mode: 0o755 });
    const r = bump(dir);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(statSync(join(dir, 'CHANGELOG.md')).mode & 0o777, 0o755);
    assert.doesNotMatch(git(dir, ['diff', '--summary', 'HEAD~1', 'HEAD']), /mode change/);
    assert.doesNotMatch(readFileSync(join(dir, '.git', 'hook-status'), 'utf-8'), /^\?\?/m);
    assert.deepEqual(readdirSync(dir).filter((n) => n.startsWith('CHANGELOG.md.')), []);
    assert.deepEqual(readdirSync(join(dir, '.git')).filter((n) => n.startsWith('changelog-promote')), []);
  });
});

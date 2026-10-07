// tests/cross-repo.test.mjs — the cross-repo discipline guard (#15 ①②) and its repo identity.
//
// Run: node --test .omp/extensions/harness/tests/cross-repo.test.mjs
//
// Fixtures: a SESSION repo (with AGENTS.md), a linked WORKTREE of it (an Orca card), an
// EXTERNAL repo that carries discipline (AGENTS.md), and a VAULT repo that carries none (the
// sum skill's private backup target). Every case is a negative/positive pair across those:
//   ① a mutation into EXTERNAL is blocked until EXTERNAL/AGENTS.md is in the session's read
//     ledger, then passes; the same mutation into VAULT passes with a warning; into WORKTREE or
//     a non-repo path it is silent.
//   ② a commit/push into EXTERNAL is blocked regardless of the ledger (both `git -C` and
//     `cd … &&` spellings, and behind bash -c); into VAULT it passes (out of jurisdiction, the
//     documented semantics); into WORKTREE it passes (same repo); an unresolvable target fails
//     closed. The last group drives the REAL index.ts handlers so the wiring is tested, not
//     just the helpers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync, symlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoIdentity, repoToplevel } from '../gates/repo-root.mjs';
import { shellWriteTargets, isGitPush } from '../gates/git-commit-detect.mjs';
import { crossRepoBashVerdict, crossRepoMutationVerdict } from '../gates/cross-repo.mjs';
import { loadHarness, ctxFor } from './helpers/harness-handlers.mjs';

for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k];
Object.assign(process.env, { HOME: tmpdir(), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' });
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

function repo(root, name, files) {
  const dir = join(root, name);
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  for (const [rel, content] of Object.entries(files)) writeFileSync(join(dir, rel), content);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
  return dir;
}

/** session + worktree + external(discipline) + vault(none), torn down after `fn`. */
async function withFixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'xrepo-'));
  try {
    const session = repo(root, 'session', { 'AGENTS.md': '# session rules\n', 'a.txt': 'a\n' });
    const external = repo(root, 'external', { 'AGENTS.md': '# external rules\n', 'b.txt': 'b\n' });
    const vault = repo(root, 'vault', { 'note.md': 'n\n' });
    const worktree = join(root, 'card');
    git(session, 'worktree', 'add', '-q', worktree, '-b', 'card');
    const markRead = (file) => {
      mkdirSync(join(session, '.omp', 'harness-state'), { recursive: true });
      appendFileSync(join(session, '.omp', 'harness-state', 'read-log.txt'), `${file}\n`);
    };
    return await fn({ root, session, external, vault, worktree, markRead });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const firstLine = (v) => (v?.block ?? v?.warn ?? '').split('\n')[0];

// --- repo-root: identity is the common git dir ---------------------------------------------

test('repo-root: a linked worktree shares the session identity; another repo does not; non-repo paths are null', async () => {
  await withFixture(({ root, session, external, worktree }) => {
    assert.equal(repoIdentity(worktree), repoIdentity(session), 'worktree and main checkout are ONE repo');
    assert.notEqual(repoIdentity(external), repoIdentity(session));
    assert.equal(repoToplevel(join(worktree, 'new', 'deep', 'file.md')), worktree, 'a not-yet-existing file is attributed through its first existing ancestor');
    assert.equal(repoToplevel(join(session, 'a.txt')), session, 'a file path resolves to its repo toplevel');
    assert.equal(repoIdentity(root), null, 'the fixture root is not a repo');
    assert.equal(repoToplevel(''), null);
  });
});

// --- shellWriteTargets: what a command line writes, statically ------------------------------
// `cd` is followed only into a directory that EXISTS (the shell stays put otherwise), so these
// run on a real tree: <root>/base/repo (B), <root>/base/other, <root>/ext, B/sub.
function withTree(fn) {
  const root = mkdtempSync(join(tmpdir(), 'xscan-'));
  try {
    const B = join(root, 'base', 'repo');
    for (const d of [join(B, 'sub'), join(root, 'base', 'other'), join(root, 'ext')]) mkdirSync(d, { recursive: true });
    writeFileSync(join(B, 'sub', 'x.txt'), 'x\n');
    mkdirSync(join(root, 'ext', 'inner'));
    symlinkSync(join(root, 'ext', 'inner'), join(B, 'link'));          // B/link -> ext/inner
    return fn({ root, B, other: join(root, 'base', 'other'), ext: join(root, 'ext') });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('shellWriteTargets: git commit/push targets follow -C chains, one literal cd and bash -c; unresolvable forms report unknown', () => {
  withTree(({ B, other, ext }) => {
    const gitOf = (cmd) => shellWriteTargets(cmd, B).git;
    assert.deepEqual(gitOf('git commit -m x'), [{ dir: B, verb: 'commit' }]);
    assert.deepEqual(gitOf('git -C ../other commit -m x'), [{ dir: other, verb: 'commit' }]);
    assert.deepEqual(gitOf('cd ../other && git commit -m x'), [{ dir: other, verb: 'commit' }]);
    assert.deepEqual(gitOf(`cd ${ext}; git push origin HEAD`), [{ dir: ext, verb: 'push' }]);
    assert.deepEqual(gitOf(`bash -c 'cd ${ext} && git commit -m x'`), [{ dir: ext, verb: 'commit' }]);
    assert.deepEqual(gitOf(`git commit -m "cd ${ext}"`), [{ dir: B, verb: 'commit' }], 'a quoted message is one token');
    assert.deepEqual(gitOf('git add . && git commit -m x'), [{ dir: B, verb: 'commit' }]);
    assert.deepEqual(gitOf(`sudo -u git -E git -C ${ext} commit`), [{ dir: ext, verb: 'commit' }], 'every wrapper candidate is tried');
    assert.deepEqual(gitOf('git --git-dir=/x/.git status && git commit -m x'), [{ dir: B, verb: 'commit' }], 'a redirected READ does not poison the line (N1)');
    assert.deepEqual(gitOf('git status'), []);
    const unknowns = [
      'cd "$DIR" && git commit -m x', `pushd ${ext} && git commit`, `env -C ${ext} git commit`,
      'GIT_DIR=/x/.git git commit', `env GIT_DIR=${ext}/.git git push`, `env GIT_DIR=${ext}/.git bash -c 'git push'`,
      'for d in a b; do git -C $d commit; done', 'cd && git push', 'cd - && git commit',
      `cd ${ext} || cd ${B}; git commit -m x`,            // two cds: the model has one cwd (C2)
      `cd ${ext}; cd /definitely/missing; git push`,       // a failed cd leaves the shell in ext (C2)
      `cd ${ext}; (cd ${B}); git commit -m x`,             // a subshell cd restores on exit (C2)
      `eval 'cd ${ext} && git commit -m x'`,               // an eval payload naming a commit (C6)
      `git -C ${ext} -c alias.c=commit c`,                 // argv-local alias (N3)
      'git --git-dir=/x/.git commit -m x', 'git -C $(pwd) commit',
      `git --git-dir=${ext}/.git --attr-source HEAD push`,  // a value swallowed as the verb (r2 X2)
      `git --git-dir=${ext}/.git --no-replace-objects --attr-source HEAD push`,
      `export GIT_DIR=${ext}/.git; git push`,              // a standalone/exported retarget carries forward (r2 A2)
      `GIT_DIR=${ext}/.git; git push`,
      `cd ${B}/sub/x.txt 2>/dev/null; git commit -m x`,    // cd into a FILE does not move the shell (r2 A3)
      `declare -x GIT_DIR=${ext}/.git; git push`,          // r3 C2
    ];
    for (const cmd of unknowns) assert.ok(shellWriteTargets(cmd, B).unknown, `must be unknown: ${cmd}`);
    assert.ok(shellWriteTargets('git commit -m x', B, { GIT_DIR: '/o/.git' }).unknown, 'a retargeting call env is unknown');
    assert.equal(shellWriteTargets('git -c alias.st=status st && git commit -m x', B).unknown, null, 'a read-only alias is not a finding (r2 X4)');
    assert.ok(shellWriteTargets('git -c alias.c=commit c', B).unknown, 'an alias standing for commit is');
    assert.equal(shellWriteTargets('git -C "$D" init -q && git -C "$D" add -A', B).unknown, null, 'an unexpanded -C on a non-write verb is not a finding');
    assert.ok(shellWriteTargets('git -C "$D" commit -m x', B).unknown, 'an unexpanded -C on a commit is');
    assert.equal(shellWriteTargets('cd "$DIR" && git status', B).unknown, null, 'an unknown cwd matters only for a commit/push');
    assert.equal(shellWriteTargets('echo $(date) && git commit -m x', B).unknown, null, 'a substitution outside a cd does not move the cwd');
    assert.deepEqual(gitOf('echo $(date) && git commit -m x'), [{ dir: B, verb: 'commit' }]);
    assert.deepEqual(gitOf(`git -C ${ext} --attr-source HEAD commit`), [{ dir: ext, verb: 'commit' }], 'a known value-taking global is walked (r2 X2)');
    assert.deepEqual(gitOf(`cd ${B}/link/.. && git push`), [{ dir: B, verb: 'push' }], 'cd is logical like bash: link/.. is the link\'s parent');
    assert.deepEqual(gitOf(`cd -P ${B}/link/.. && git push`), [{ dir: ext, verb: 'push' }], 'cd -P is physical: link/.. is the TARGET\'s parent (r3 C1)');
    assert.equal(shellWriteTargets(`git --git-dir=${ext}/.git show-ref && git -C "$R" --version`, B).unknown, null, 'read verbs and terminal options beside a redirect global are not findings (r3 C3)');
    assert.ok(shellWriteTargets(`git -C ${ext} --shallow-file x push`, B).git.some((g) => g.verb === 'push'), '--shallow-file takes a value (r3 N7)');
    assert.deepEqual(gitOf(`cd ${ext} 2>/dev/null && git commit -m x`), [{ dir: ext, verb: 'commit' }], 'a redirection on the cd segment is not an operand (r4-1)');
    assert.deepEqual(gitOf(`git -C ${ext} 2>/dev/null push`), [{ dir: ext, verb: 'push' }], 'a redirection before the verb is not the verb (r4-5)');
    assert.deepEqual(gitOf(`git -C ${ext} commit --help`), [], '`git commit --help` prints and exits (r4-8)');
    assert.equal(shellWriteTargets('git -c alias.c=commit --version', B).unknown, null);
    assert.ok(isGitPush('git -C /x push') && !isGitPush('git log --grep push'));
  });
});

test('shellWriteTargets: file mutators and output redirections name literal operands only', () => {
  withTree(({ B, other, ext }) => {
    const filesOf = (cmd) => shellWriteTargets(cmd, B).files;
    assert.deepEqual(filesOf('cp a.md ../other/b.md'), [`${B}/../other/b.md`], 'cp destination only, as spelled (repo-root resolves `..` physically)');
    assert.deepEqual(filesOf(`cp -t ${ext} a b`), [ext]);
    assert.deepEqual(filesOf(`cp -t${ext} a b`), [ext], 'glued -tDIR (C5)');
    assert.deepEqual(filesOf(`mv ${ext}/README.md /tmp/x`), [join(ext, 'README.md'), '/tmp/x'], 'mv touches both ends (C5)');
    assert.deepEqual(filesOf(`mv -t ${ext} a b`), ['a', 'b'].map((f) => join(B, f)).concat(ext), 'mv -t DIR keeps the destination (r2 X1)');
    assert.deepEqual(filesOf(`mv --target-directory=${ext} a`), [join(B, 'a'), ext]);
    assert.deepEqual(filesOf(`install -d ${ext}/new`), [join(ext, 'new')], 'install -d creates directories (C5)');
    assert.deepEqual(filesOf(`echo hi > ${ext}/file.txt`), [join(ext, 'file.txt')]);
    assert.deepEqual(filesOf(`echo hi>${ext}/file.txt`), [join(ext, 'file.txt')], 'glued redirection (C4)');
    assert.deepEqual(filesOf(`printf x>>${ext}/log`), [join(ext, 'log')]);
    assert.deepEqual(filesOf(`git commit -m '>${ext}/f'`), [], 'a quoted > is not a redirection (C4)');
    assert.deepEqual(filesOf(`cat x 2>&1 | tee ${ext}/out.log`), [join(ext, 'out.log')], '2>&1 is an fd duplicate, not a file');
    assert.deepEqual(filesOf('cd sub && echo > out.txt'), [join(B, 'sub', 'out.txt')], 'relative operands follow a literal cd');
    assert.deepEqual(filesOf('sed -n p ../ext/f'), [], 'sed without -i reads');
    assert.ok(filesOf(`sed -i s/a/b/ ${ext}/f`).includes(join(ext, 'f')));
    assert.deepEqual(filesOf('rm -rf /tmp/x $TMP/y'), ['/tmp/x'], 'an unexpanded operand is not a literal path');
    assert.deepEqual(filesOf(`sudo rm ${ext}/f`), [join(ext, 'f')], 'a wrapper does not hide the mutator');
    assert.deepEqual(filesOf(`sudo -u git rm ${ext}/f`), [join(ext, 'f')], 'a wrapper VALUE spelled like a program does not hide it either (N4)');
    assert.deepEqual(filesOf('cd "$D" && rm f && rm /abs/g'), ['/abs/g'], 'unknown cwd drops relative operands, keeps absolute ones');
    assert.deepEqual(filesOf('ls -la'), []);
    assert.deepEqual(filesOf(`cp a.txt ${ext}/x 2>/dev/null`), ['/dev/null', join(ext, 'x')], 'a trailing redirection is not the destination (r3 N1)');
    assert.deepEqual(filesOf(`cp a.txt ${ext}/x >/dev/null 2>&1`), ['/dev/null', join(ext, 'x')]);
    assert.deepEqual(filesOf(`ln -s target ${ext}/link </dev/null`), [join(ext, 'link')]);
    assert.deepEqual(filesOf(`mv -t${ext} a`), [join(B, 'a'), ext], 'glued -t is non-greedy (r3 N2)');
    assert.deepEqual(filesOf(`cp -rvt ${ext} a`), [ext], 'a bundle ending in t takes the next token');
    assert.deepEqual(filesOf(`rsync -rtv docs/ ${ext}/docs/`), [`${ext}/docs/`], 'rsync -t is --times, not a target (r3 N2)');
    assert.deepEqual(filesOf(`mv --target-dir=${ext} a`), [join(B, 'a'), ext], 'GNU option prefix (r3 N6)');
    assert.deepEqual(filesOf(`command rm ${ext}/f && command cp a ${ext}/x`), [join(ext, 'f'), join(ext, 'x')], 'behind `command` (r3 N3)');
    assert.deepEqual(filesOf(`echo hi &> ${ext}/out.log`), [join(ext, 'out.log')], '&>word writes both streams to a file (r3 N5; the `>&word` spelling is a lexer residual)');
    assert.deepEqual(filesOf('echo hi >&2 && echo x >&-'), [], 'fd duplicate / close');
    assert.deepEqual(filesOf(`command -p rm ${ext}/f`), [join(ext, 'f')], '`command -p` (r4-2)');
    assert.deepEqual(filesOf(`cp -Stmp a ${ext}/x`), [join(ext, 'x')], '-S takes a glued value: not `-t mp` (r4-3)');
    assert.deepEqual(filesOf(`cp --suffix .bak a ${ext}/x`), [join(ext, 'x')], '--suffix takes the next token');
    assert.deepEqual(filesOf(`install -oroot -m755 a ${ext}/x`), [join(ext, 'x')]);
    assert.deepEqual(filesOf(`install -tbuild a`), [join(B, 'build')], '-tbuild is a target dir, not `-d`');
    assert.deepEqual(filesOf(`install -dm755 ${ext}/new`), [join(ext, 'new')], '-d before a value letter still creates directories');
    assert.deepEqual(filesOf(`touch -r ${ext}/x ${B}/y`), [join(B, 'y')], 'touch -r is a reference, not a target');
    assert.deepEqual(filesOf(`chmod +x ${ext}/script`), ['+x', join(ext, 'script')].map((p) => (p.startsWith('/') ? p : join(B, p))), 'chmod is a mutator (r4-6); the mode operand is harmless');
    assert.deepEqual(filesOf(`cd ${ext} 2>/dev/null && rm f`), ['/dev/null', join(ext, 'f')], 'relative operand after a redirected cd (r4-1)');
  });
});

// --- ① mutation verdicts ----------------------------------------------------------------

test('① a mutation into another discipline-bearing repo is blocked until its AGENTS.md is read; vault warns; worktree and non-repo are silent', async () => {
  await withFixture(({ session, external, vault, worktree, markRead }) => {
    const before = crossRepoMutationVerdict(join(external, 'b.txt'), session);
    assert.match(before?.block ?? '', /another repo .* whose discipline has not been loaded/);
    assert.match(before.block, new RegExp(`Read ${join(external, 'AGENTS.md')}`));
    assert.match(crossRepoMutationVerdict(join(external, 'new', 'file.md'), session)?.block ?? '', /HARNESS BLOCK/, 'a new file in that repo is attributed too');
    assert.match(crossRepoMutationVerdict(join(vault, 'x.md'), session)?.warn ?? '', /no AGENTS.md\/CLAUDE.md\/.cursorrules/);
    assert.equal(crossRepoMutationVerdict(join(worktree, 'a.txt'), session), null, 'a linked worktree is the session repo');
    assert.equal(crossRepoMutationVerdict(join(session, 'a.txt'), session), null);
    assert.equal(crossRepoMutationVerdict('/tmp/scratch.txt', session), null, 'outside any repo: nothing to load');
    // Reading some OTHER file of that repo is not loading its discipline.
    markRead(join(external, 'b.txt'));
    assert.match(crossRepoMutationVerdict(join(external, 'b.txt'), session)?.block ?? '', /HARNESS BLOCK/);
    markRead(join(external, 'AGENTS.md'));
    assert.equal(crossRepoMutationVerdict(join(external, 'b.txt'), session), null, 'passes once AGENTS.md is in the ledger');
    assert.equal(crossRepoMutationVerdict(join(external, 'new', 'file.md'), session), null);
  });
});

test('① symlinks: a link INTO another repo\'s subtree attributes to that repo; a link TO a repo is read through the link (C1)', async () => {
  await withFixture(({ root, session, external, markRead }) => {
    mkdirSync(join(external, 'src'));
    symlinkSync(join(external, 'src'), join(session, 'vendor'));                 // session/vendor -> external/src (npm link shape)
    assert.match(crossRepoMutationVerdict(join(session, 'vendor', 'x.ts'), session)?.block ?? '', /HARNESS BLOCK/, 'a lexical walk would have found the SESSION .git first');
    assert.match(crossRepoMutationVerdict(`${session}/vendor/../x.ts`, session)?.block ?? '', /HARNESS BLOCK/, '`link/..` is the link TARGET\'s parent, not the link\'s (r2 X3)');
    assert.equal(crossRepoMutationVerdict(`${session}/sub/../a.txt`, session), null, 'a plain `..` still resolves inside the session repo');
    symlinkSync(external, join(root, 'link'));                                   // root/link -> external (a symlinked checkout)
    assert.match(crossRepoMutationVerdict(join(root, 'link', 'b.txt'), session)?.block ?? '', /HARNESS BLOCK/);
    markRead(join(root, 'link', 'AGENTS.md'));                                   // read THROUGH the link, as an agent would
    assert.equal(crossRepoMutationVerdict(join(root, 'link', 'b.txt'), session), null, 'the ledger spelling via the link counts');
    assert.equal(crossRepoMutationVerdict(join(session, 'vendor', 'x.ts'), session), null, 'and so does the physical repo it names');
  });
});

test('① CLAUDE.md is the discipline file when a repo has no AGENTS.md', async () => {
  await withFixture(({ root, session, markRead }) => {
    const legacy = repo(root, 'legacy', { 'CLAUDE.md': '# legacy rules\n', 'c.txt': 'c\n' });
    assert.match(crossRepoMutationVerdict(join(legacy, 'c.txt'), session)?.block ?? '', new RegExp(`Read ${join(legacy, 'CLAUDE.md')}`));
    markRead(join(legacy, 'CLAUDE.md'));
    assert.equal(crossRepoMutationVerdict(join(legacy, 'c.txt'), session), null);
  });
});

// --- ② bash verdicts --------------------------------------------------------------------

test('② commit/push into another discipline-bearing repo is blocked in every spelling, regardless of the ledger; vault and worktree pass', async () => {
  await withFixture(({ session, external, vault, worktree, markRead }) => {
    const verdict = (command, extra = {}) => crossRepoBashVerdict({ command, toolCwd: session, sessionCwd: session, ...extra });
    markRead(join(external, 'AGENTS.md'));                       // ② does not care about the ledger
    for (const cmd of [`git -C ${external} commit -m x`, `cd ${external} && git commit -m x`, `git -C ${external} push origin main`,
      `cd ${external}; git push`, `bash -c 'cd ${external} && git commit -m x'`, `git -C ${external} add -A && git -C ${external} commit -m x`]) {
      const v = verdict(cmd);
      assert.match(v?.block ?? '', /targets another repo/, `must block: ${cmd}`);
      assert.match(v.block, /session whose cwd is that repo/, 'the block names the sanctioned path');
    }
    assert.match(verdict('git commit -m x', { toolCwd: external })?.block ?? '', /targets another repo/, 'the bash tool cwd input is the base dir');
    assert.equal(verdict('git commit -m x'), null, 'plain commit in the session repo');
    assert.equal(verdict(`git -C ${worktree} commit -m x`), null, 'a linked worktree is the same repo');
    assert.equal(verdict(`cd ${worktree} && git commit -m x`), null);
    assert.equal(verdict(`git -C ${vault} commit -m x && git -C ${vault} push`), null, 'no discipline, no harness: out of jurisdiction (sum vault)');
    assert.equal(verdict(`mkdir -p ${vault}/proj/sum && cp a.txt ${vault}/proj/sum/`)?.block, undefined, 'vault file copies warn at most');
  });
});

test('② an unresolvable commit/push target fails closed; a harness-bearing repo without AGENTS.md is still in jurisdiction', async () => {
  await withFixture(({ root, session, external }) => {
    const verdict = (command, extra = {}) => crossRepoBashVerdict({ command, toolCwd: session, sessionCwd: session, ...extra });
    for (const cmd of ['cd "$DIR" && git commit -m x', 'pushd /somewhere && git commit', 'env -C /somewhere git commit -m x', 'cd && git push',
      `cd ${external} || cd ${session}; git commit -m x`, `cd ${external}; cd /definitely/missing; git push`, `cd ${external}; (cd ${session}); git commit -m x`,
      `eval 'cd ${external} && git commit -m x'`, `env GIT_DIR=${external}/.git git push`]) {
      assert.match(verdict(cmd)?.block ?? '', /cannot resolve which repo .* failing closed/, `must fail closed: ${cmd}`);
    }
    assert.match(verdict('git push', { env: { GIT_DIR: join(external, '.git') } })?.block ?? '', /failing closed/, 'a retargeting call env fails closed for push too (C3)');
    assert.equal(verdict('cd "$DIR" && git status'), null, 'read-only git after an unknown cd is not a finding');
    assert.equal(verdict('git --git-dir=/x/.git log -1 && git commit -m x'), null, 'a redirected read beside a session commit is not a finding (N1)');
    const consumer = repo(root, 'consumer', { 'README.md': 'r\n' });
    mkdirSync(join(consumer, '.omp', 'extensions', 'harness'), { recursive: true });
    assert.match(verdict(`git -C ${consumer} commit -m x`)?.block ?? '', /targets another repo/);
  });
});

// --- wiring: the real index.ts handlers -----------------------------------------------------

test('wiring: tool_call blocks an edit/write and a commit into another discipline-bearing repo, passes the worktree and the read-proven edit', async () => {
  const { handlers } = await loadHarness();
  const toolCall = handlers.tool_call[0];
  await withFixture(async ({ session, external, worktree, markRead }) => {
    const ctx = ctxFor(session);
    const edit = await toolCall({ toolName: 'edit', toolCallId: 'e1', input: { path: join(external, 'b.txt'), input: `[${join(external, 'b.txt')}#AB12]\nPUT 1.=1:\n+x\n` } }, ctx);
    assert.equal(edit?.block, true);
    assert.match(edit.reason, /whose discipline has not been loaded/);
    const write = await toolCall({ toolName: 'write', toolCallId: 'w1', input: { path: join(external, 'new.md'), content: 'x' } }, ctx);
    assert.equal(write?.block, true);
    const commit = await toolCall({ toolName: 'bash', toolCallId: 'b1', input: { command: `cd ${external} && git commit -m x` } }, ctx);
    assert.equal(commit?.block, true);
    assert.match(commit.reason, /targets another repo/);
    const cardCommit = await toolCall({ toolName: 'bash', toolCallId: 'b2', input: { command: `git -C ${worktree} commit --allow-empty -m x` } }, ctx);
    assert.equal(cardCommit, undefined, 'a linked worktree commit is not blocked');
    markRead(join(external, 'AGENTS.md'));
    const writeAfter = await toolCall({ toolName: 'write', toolCallId: 'w2', input: { path: join(external, 'new.md'), content: 'x' } }, ctx);
    assert.equal(writeAfter, undefined, 'a new file in the external repo passes once its AGENTS.md was read');
    const commitAfter = await toolCall({ toolName: 'bash', toolCallId: 'b3', input: { command: `git -C ${external} commit -m x` } }, ctx);
    assert.equal(commitAfter?.block, true, 'the commit stays blocked after the read');
  });
});

// cross-repo.mjs — the cross-repo discipline guard (#15 ①②). A helper module imported by
// index.ts (never spawned): it decides, at tool_call time, from what a call statically names.
//
// The gap: session cwd ≠ target repo. The agent then works under THIS repo's AGENTS.md and
// scope while its edits — or its commit — land in another repo whose own discipline it never
// loaded (observed 2026-07-15, blogger retirement session). Two rails:
//
//   ① mutation — an edit/write target, or a bash mutator operand / output redirection naming a
//     literal path, inside ANOTHER repo is BLOCKED until that repo's discipline file
//     (AGENTS.md > CLAUDE.md > .cursorrules, first one present at its toplevel) has been read in
//     this session — proven by `.omp/harness-state/read-log.txt`, the same ledger context-gate
//     uses for read-before-edit. A repo with no discipline file has nothing to load: the
//     mutation passes with a warning.
//   ② commit/push — a `git commit` / `git push` whose target is another repo that CARRIES agent
//     discipline (a discipline file or the harness itself) is BLOCKED regardless of what was
//     read: the session's seed/scope and the target's own hooks cannot be reconciled from here;
//     the sanctioned path is a session whose cwd is that repo. A repo with neither (the sum
//     skill's private vault, `git -C <vault> commit`) stays out of jurisdiction and passes,
//     matching harness_integration_contract "Out-of-jurisdiction repos". A commit/push whose
//     target cannot be resolved statically (`cd "$DIR"`, `pushd`, `eval`, `env -C`, GIT_DIR=…)
//     is BLOCKED too — fail-closed, the review-gate UNVERIFIABLE bias.
//
// Repo identity is the physical common git dir (repo-root.mjs): a linked worktree of the session
// repo (an Orca card, `git worktree add`) is the SAME repo and never trips either rail.

import { existsSync, readFileSync, realpathSync } from 'fs';
import { basename, dirname, join } from 'path';
import { isGitCommit, isGitPush, shellWriteTargets } from './git-commit-detect.mjs';
import { repoIdentity, repoToplevel } from './repo-root.mjs';

export const DISCIPLINE_FILES = ['AGENTS.md', 'CLAUDE.md', '.cursorrules'];
const HARNESS_DIR = join('.omp', 'extensions', 'harness');

function physical(p) {
  try { return realpathSync.native(p); } catch { return p; }
}

/** The discipline file the agent must have read for the repo rooted at `top`, or null. */
export function disciplineFile(top) {
  for (const name of DISCIPLINE_FILES) {
    if (existsSync(join(top, name))) return name;
  }
  return null;
}

/** Lines of the session's read ledger (read-tracker/write-tracker format), as a Set. */
function readLedger(sessionCwd) {
  const path = join(sessionCwd, '.omp', 'harness-state', 'read-log.txt');
  try { return new Set(readFileSync(path, 'utf-8').split('\n').map((l) => l.trim()).filter(Boolean)); } catch { return new Set(); }
}

/** True when the ledger holds a read of the discipline file `name` at the toplevel of ANY
 *  checkout of repo `id`: every ledger line named like it is resolved physically (the agent may
 *  have read it through a symlinked path) and must sit at a worktree root of that repo — a read
 *  in a linked worktree of the target repo counts (review r2 A5). One read proves the repo. */
function ledgerHas(ledger, id, name) {
  for (const line of ledger) {
    if (basename(line) !== name) continue;
    const dir = physical(dirname(line));
    if (repoToplevel(dir) === dir && repoIdentity(dir) === id) return true;
  }
  return false;
}

/**
 * ① verdict for one mutation target (absolute or session-relative path).
 * null = allowed silently; { block } = refuse with that reason; { warn } = allow, advisory.
 * `ledger` (a Set of read-log lines) is loaded only once a target proves to be in another repo.
 */
export function crossRepoMutationVerdict(target, sessionCwd, ledger = null) {
  const sessionId = repoIdentity(sessionCwd);
  if (!sessionId) return null;                                   // no session repo: nothing to compare
  const abs = target.startsWith('/') ? target : `${sessionCwd}/${target}`;   // not normalized: `link/..` is resolved physically by repo-root
  const top = repoToplevel(abs);
  if (!top) return null;                                         // outside any repo: no discipline to load
  const id = repoIdentity(abs);
  if (!id || id === sessionId) return null;
  const file = disciplineFile(top);
  if (!file) {
    return { warn: `HARNESS WARNING: '${abs}' is in another repo (${top}) that has no ${DISCIPLINE_FILES.join('/')} — nothing to load before editing; it is out of the harness's jurisdiction (#15).` };
  }
  if (ledgerHas(ledger ?? readLedger(sessionCwd), id, file)) return null;
  return {
    block: [
      `HARNESS BLOCK: '${abs}' is in another repo (${top}) whose discipline has not been loaded in this session.`,
      `Read ${join(top, file)} first (and the context files it links), then retry — this session runs under ${sessionCwd}'s rules until then (#15 ①).`,
      'Committing or pushing to that repo is not available from this session at all: open a session whose cwd is that repo (#15 ②).',
    ].join('\n'),
  };
}

function targetSessionHint(top) {
  return [
    `Run it from a session whose cwd is that repo, so its own hooks, scope and AGENTS.md apply — e.g. \`cd ${top} && omp -p --auto-approve @task.md\`, or open the repo in its own omp session.`,
    'This holds regardless of what has been read in this session (#15 ②); linked worktrees of the session repo are not affected.',
  ];
}

/**
 * ①+② verdict for a bash tool call. `toolCwd` is where the command runs (the bash tool's
 * `cwd` input resolved against the session cwd, else the session cwd); `env` is the call's
 * injected environment. Same return shape as crossRepoMutationVerdict.
 */
export function crossRepoBashVerdict({ command, toolCwd, sessionCwd, env }) {
  if (!command || typeof command !== 'string') return null;
  const scan = shellWriteTargets(command, toolCwd || sessionCwd, env);
  // `unknown` is set only when a commit/push (or an eval/source argument naming one) was met in
  // a cwd the scanner could not attribute; a detected commit/push with no attributed directory
  // is the same finding from the detector's side (`sudo -u git …` shapes).
  const unknown = scan.unknown
    ?? ((isGitCommit(command) || isGitPush(command)) && scan.git.length === 0 ? 'no git commit/push invocation could be attributed to a directory' : null);
  if (!unknown && scan.git.length === 0 && scan.files.length === 0) return null;   // nothing to judge: no fs work
  const sessionId = repoIdentity(sessionCwd);
  if (!sessionId) return null;
  if (unknown) {
    return {
      block: [
        `HARNESS BLOCK: cannot resolve which repo this git commit/push targets (${unknown}) — failing closed (#15 ②).`,
        'Spell the target literally so the guard can attribute it: `git commit …` in the session repo, `git -C <dir> commit …`, or ONE `cd <existing-dir> && git commit …` per call (a second cd, a cd into a directory that does not exist yet, a subshell, eval/pushd, or a `$VAR` path cannot be followed). A commit into another repo must run from a session whose cwd is that repo.',
      ].join('\n'),
    };
  }
  for (const { dir, verb } of scan.git) {
    const id = repoIdentity(dir);
    if (!id || id === sessionId) continue;
    const top = repoToplevel(dir);
    if (!disciplineFile(top) && !existsSync(join(top, HARNESS_DIR))) continue;   // out of jurisdiction (no discipline, no harness)
    return {
      block: [
        `HARNESS BLOCK: \`git ${verb}\` targets another repo (${top}); the session repo is ${repoToplevel(sessionCwd)}.`,
        ...targetSessionHint(top),
      ].join('\n'),
    };
  }
  let ledger = null;
  const warnings = [];
  for (const file of scan.files) {
    ledger ??= readLedger(sessionCwd);
    const v = crossRepoMutationVerdict(file, sessionCwd, ledger);
    if (v?.block) return v;
    if (v?.warn) warnings.push(v.warn);
  }
  return warnings.length ? { warn: warnings.join('\n') } : null;
}

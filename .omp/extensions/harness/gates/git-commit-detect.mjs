#!/usr/bin/env node
// git-commit-detect.mjs - shared `git commit` detection for the commit gates.
// Not a hook itself — imported by acceptance-gate, backpressure-gate, and
// review-gate (all PreToolUse: Bash) so they detect a commit identically.
//
// isGitCommit(command) -> boolean
//
// Replaces the old per-gate regex /(?:^|&&|\|\||;)\s*git\b[^|;]*\bcommit\b/, which
// had two defects (adversarial review then surfaced a long tail in both directions):
//   (1) false-NEGATIVE: a real `git commit` slipped past when separated by a NEWLINE
//       or single `&`, hidden behind an env-with-quoted-value or wrapper-with-options
//       prefix, behind a `bash -c`/`sh -c` variant, or behind a shell reserved word.
//   (2) false-POSITIVE: it fired on non-commit git commands whose args merely contain
//       "commit" (`git log --grep commit`), on sibling subcommands (`git commit-graph`,
//       `git commit-tree`), on commented-out / heredoc-body text, and on terminal global
//       options (`git --help commit`).
//
// Approach — a small, linear shell-aware lexer (NOT a full bash grammar):
//   lexSegments()  splits into top-level command segments. Quotes ('…'/"…") protect
//                  operators; `\`+newline is a line-join; an unquoted word-initial `#`
//                  starts a comment (dropped); `<<WORD` heredoc bodies are dropped;
//                  delimiters are && || ; | & and newline.
//   Per segment: tokenize() quote-aware, then locate the program being run — skipping
//   env-assignments and shell reserved words, and (for a wrapper command such as
//   sudo/env/nice/timeout, matched by BASENAME so `/usr/bin/env` counts) scanning past
//   its options for the first git/bash/sh program token. `bash -c "<inner>"` recurses on
//   the inner script. Fire only when the program is `git` (basename) and its SUBCOMMAND —
//   the first token after global options, with terminal options (--help/--version/…)
//   short-circuiting — is exactly `commit`.
//
// Bias: this is a SAFETY gate, so ambiguous/unparseable cases fail CLOSED (treated as a
// commit) rather than fail-open. Wrapper option arity is NOT modelled — we scan for the
// real program token instead, so unknown wrapper options can never hide the commit.
//
// Deliberate scope / known gaps (documented, asserted in tests):
//   - Cross-repo targeting (`git -C other commit`) is NOT special-cased — still detected.
//   - The exact detector does not parse quoted command substitution, `env -S` split-string
//     exec, or dynamic subcommands. The dispatcher-level isCommitSuspect boundary now blocks
//     those forms plus eval/re-parsing executors. `case … esac` pattern bodies remain outside
//     the non-adversarial static model.
//   - Leading redirections (`>out git commit -a`) are detected and then rejected by the
//     standalone rule. Unquoted substitutions swallowed as Git option values become
//     unresolved; process substitution is rejected. Backslash escapes (`\git`,
//     `/repo\ with\ spaces`) fold like bash, so they cannot hide a program or split a path.
//   - Sequencer continuations that CREATE commits (`git merge --continue`,
//     `git cherry-pick --continue`, `git revert --continue`, `git rebase --continue`)
//     are NOT detected — the subcommand is not `commit`. Deliberate: this workflow is
//     main-centered (short-lived branches, squash-merge PRs; sequencers are ~unused),
//     so the gates skip them rather than carry an effective-diff model per sequencer.
//     Revisit if rebase/merge conflict-resolution becomes routine.
//   - The heredoc delimiter is parsed as ONE quoted atom or ONE simple bareword
//     (+ trailing CRs). Compound/odd-quoted delimiter WORDs (`<<'EOF'X`, `<<E"O"F`,
//     `<<EO\F`) and an empty/whitespace-only delimiter (`<<\r\n`, where `\s*` reaches
//     the next line) are mis-parsed, so a trailing commit after such a heredoc is
//     missed. Pre-existing (unchanged by the CRLF-terminator fix), fail-open, but only
//     reachable by deliberately bizarre delimiters — outside the agent threat model.
//   - A few exotic forms OVER-detect (fail-closed, harmless): `command -v git commit`
//     and `xargs echo git commit` are lookups/echoes, not commits, but report true.
//   - Past MAX_DEPTH of nested `bash -c`, detection FAILS CLOSED (treats it as a commit).

import { realpathSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';

const MAX_DEPTH = 5;

const RESERVED = new Set(['if', 'then', 'elif', 'else', 'fi', 'while', 'until', 'for',
  'in', 'do', 'done', 'case', 'esac', 'function', '!', '{', '}']);

// Commands that exec the rest of the line (after their own options). Matched by basename.
const WRAPPER = new Set(['env', 'sudo', 'doas', 'nice', 'ionice', 'time', 'timeout',
  'command', 'nohup', 'stdbuf', 'setsid', 'xargs', 'exec']);

// Terminal/informational options that make a wrapper print-and-exit (never exec git).
const WRAPPER_TERMINAL_OPT = new Set(['--help', '--version', '-h', '-V']);

// git global options that take a SEPARATE argument (consume the next token too).
const GIT_OPT_WITH_ARG = new Set(['-C', '-c', '--config-env', '--git-dir', '--work-tree',
  '--namespace', '--exec-path', '--super-prefix', '--attr-source', '--shallow-file']);
// Terminal/informational git global options: git prints and exits before any subcommand.
const GIT_TERMINAL_OPT = new Set(['-h', '--help', '--version', '--html-path',
  '--man-path', '--info-path']);

// bash/sh options that take a SEPARATE argument, consumed before locating `-c`.
const SHELL_OPT_WITH_ARG = new Set(['-o', '-O', '--rcfile', '--init-file']);

function basename(t) {
  const i = t.lastIndexOf('/');
  return i >= 0 ? t.slice(i + 1) : t;
}
function isAssign(t) { return /^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(t); }   // NAME= and bash NAME+=
function isShellProg(b) { return b === 'git' || b === 'bash' || b === 'sh'; }


// Split a command into top-level segments, dropping comments and heredoc bodies.
// Optional `meta` receives { background: true } when an unquoted lone `&` operator is
// seen (background job) — `&&` is excluded by its own branch, and quoted/heredoc-body
// `&` never reaches the operator branch, so consumers get a false-positive-free signal.
function lexSegments(cmd, meta) {
  const segs = [];
  let cur = '', i = 0, q = null;            // q = "'" or '"' while inside that quote
  const heredocs = [];                       // delimiters opened on the current line
  const n = cmd.length;
  while (i < n) {
    const c = cmd[i], nx = cmd[i + 1];
    if (q === "'") { cur += c; if (c === "'") q = null; i++; continue; }
    if (q === '"') {
      if (c === '\\' && nx !== undefined) { cur += c + nx; i += 2; continue; }
      cur += c; if (c === '"') q = null; i++; continue;
    }
    if (c === '\\' && nx === '\n') { i += 2; continue; }                       // line join (LF only)
    // NOTE deliberately NO unquoted CRLF join: bash reads `\`+CR as an ESCAPED CR (a
    // literal CR character in the word) and the following LF as a real command separator
    // — joining them would merge two commands and hide a trailing commit (review r4).
    if (c === '\\' && nx !== undefined) { cur += c + nx; i += 2; continue; }    // escape
    if (c === "'" || c === '"') { q = c; cur += c; i++; continue; }
    // Comment: `#` after UNESCAPED whitespace. `foo\ #bar` is one word in bash (the
    // escaped space joins), so a `\ ` tail must NOT open a comment (review r4).
    if (c === '#' && (cur === '' || (/\s$/.test(cur) && !/\\[\s]$/.test(cur)))) {
      while (i < n && cmd[i] !== '\n') i++;
      continue;
    }
    if (c === '<' && nx === '<' && cmd[i + 2] !== '<') {                        // heredoc start (not <<<)
      // Trailing CRs are CAPTURED INTO the delimiter: to bash `\r` is a word character,
      // not whitespace, so under CRLF input the delimiter word itself carries the CR(s)
      // (`<<EOF\r\n` -> delimiter "EOF\r", `<<'EOF'\r\n` -> "EOF\r" after quote removal)
      // and the terminator line — compared RAW, bash strips nothing — carries them too.
      // Mirroring that here keeps the drain's raw comparison in lockstep with bash for
      // CRLF, LF, and mixed input alike: a CR-less "EOF" line under a CRLF opener stays
      // DATA (no early termination), and a CRLF "EOF\r" terminator matches exactly.
      const m = /^<<(-?)\s*(?:'([^']+)'|"([^"]+)"|\\?([A-Za-z_][A-Za-z0-9_.-]*))(\r*)/.exec(cmd.slice(i));
      if (m) {
        heredocs.push({ delim: (m[2] ?? m[3] ?? m[4]) + m[5], strip: m[1] === '-' });
        cur += m[0]; i += m[0].length; continue;
      }
    }
    if (c === '\n' || c === '\r') {                                            // newline = separator
      segs.push(cur); cur = ''; i++;
      if (c === '\r' && cmd[i] === '\n') i++;
      while (heredocs.length) {                                                // drop heredoc bodies
        const { delim, strip } = heredocs.shift();
        while (i < n) {
          let j = i;
          while (j < n && cmd[j] !== '\n') j++;
          // RAW comparison, exactly like bash (it strips nothing — CR handling lives
          // in the delimiter capture above, which keeps CRLF terminators matching).
          const line = cmd.slice(i, j);
          i = j < n ? j + 1 : j;
          if ((strip ? line.replace(/^\t+/, '') : line) === delim) break;
        }
      }
      continue;
    }
    if (c === '&' && nx === '&') { segs.push(cur); cur = ''; i += 2; continue; }
    if (c === '|' && nx === '|') { segs.push(cur); cur = ''; i += 2; continue; }
    if (c === ';' || c === '|' || c === '&') {
      if (c === '&' && meta) meta.background = true;
      segs.push(cur); cur = ''; i++; continue;
    }
    cur += c; i++;
  }
  segs.push(cur);
  return segs;
}

// Quote-aware tokenizer: splits on unquoted whitespace and ( ) metacharacters, stripping
// the quotes. Bash-exact backslash semantics (review 2026-07-24 round 3):
//   unquoted `\x`  -> folds to `x` (`repo\ x` is ONE word, `\git` is the program `git`);
//   double-quoted  -> folds ONLY before $ ` " \ and newline; any other `\x` keeps BOTH
//                     characters, exactly like bash (`"/tmp/a\q"` stays `/tmp/a\q`).
// `{`/`}` are NOT split (bash keeps `x{}` literal without comma/range); grouping braces
// arrive whitespace-separated and still become their own reserved-word tokens.
function tokenize(s) {
  const toks = [];
  let cur = '', i = 0, q = null, started = false;
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (q) {
      if (q === '"' && c === '\\' && n !== undefined) {
        if (n === '\n') { i += 2; continue; }            // line continuation: bash removes BOTH, even in ""
        // NOTE deliberately NO CRLF case: bash preserves `\` + CR + LF bytes verbatim in
        // double quotes (measured 5c 0d 0a in argv) — only backslash+LF is a continuation.
        if (n === '$' || n === '`' || n === '"' || n === '\\') { cur += n; i += 2; }
        else { cur += c; i += 1; }                       // bash keeps the backslash here
        started = true; continue;
      }
      if (c === q) { q = null; i++; continue; }
      cur += c; i++; started = true; continue;
    }
    if (c === '\\' && n !== undefined) { cur += n; i += 2; started = true; continue; }
    if (c === "'" || c === '"') { q = c; i++; started = true; continue; }
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '(' || c === ')') {
      if (started) { toks.push(cur); cur = ''; started = false; }
      i++; continue;
    }
    cur += c; i++; started = true;
  }
  if (started) toks.push(cur);
  return toks;
}

// Enumerate ALL plausible program positions. Wrapper option ARITY is not modelled, so an
// option VALUE spelled like a program (`sudo -u git -E git commit`, `sudo -u git /usr/bin/env
// git …`) is indistinguishable from the program itself. Commit-scan paths therefore try
// EVERY candidate — any parse that reaches `commit` counts (fail-closed detection), and
// the resolver collapses multi-candidate ambiguity to unresolved.
function programCandidates(toks) {
  // Skip leading assignments, reserved words, AND redirections (`> f git commit -a` is a
  // legal bash form — the redirection must not hide the program from detection; the
  // standalone rule then rejects the redirection token itself).
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (isAssign(t) || RESERVED.has(t)) { i++; continue; }
    const r = redirToken(t);
    if (r) { i += r.standalone ? 2 : 1; continue; }
    break;
  }
  if (i >= toks.length) return [];
  const b = basename(toks[i]);
  if (isShellProg(b)) return [i];
  if (WRAPPER.has(b)) {
    const out = [];
    for (let k = i + 1; k < toks.length; k++) {
      if (WRAPPER_TERMINAL_OPT.has(toks[k])) break;      // wrapper prints help/version
      if (isShellProg(basename(toks[k]))) out.push(k);
    }
    return out;
  }
  return [i];                                            // some other program -> analyzed, non-git
}

// An option-VALUE token produced by tokenize() from a shredded command substitution:
// `$(cmd)` loses its parens, so `-C $(pwd)` yields value `$` and `-C /tmp/$(x)` yields
// value `/tmp/$` — any value ENDING in `$` (or carrying a backtick) marks the position
// scan as untrustworthy; consumers keep scanning for `commit` and fail closed. A literal
// dirname ending in `$` is over-rejected — conservative by design.
const substShredValue = (v) => v.endsWith('$') || v.includes('`');

// If toks is a bash/sh invocation, return the inner `-c` script string, else null.
function bashDashCPayload(toks) {
  let i = 1;
  while (i < toks.length) {
    const t = toks[i];
    if (!t.startsWith('-')) return null;            // a script FILE arg, not -c "string"
    if (/^-[A-Za-z]*c$/.test(t)) return i + 1 < toks.length ? toks[i + 1] : null; // …c takes next token
    if (SHELL_OPT_WITH_ARG.has(t)) { i += 2; continue; }
    i += 1;                                          // boolean option (-l, --noprofile, …)
  }
  return null;
}

function gitSubcommandIs(toks, verb) {
  let i = 1, subst = false;
  while (i < toks.length) {
    const t = toks[i];
    if (!t.startsWith('-')) break;
    if (GIT_TERMINAL_OPT.has(t) || t.startsWith('--list-cmds')) return false;
    if (GIT_OPT_WITH_ARG.has(t)) {
      const v = toks[i + 1] ?? '';
      if (substShredValue(v)) subst = true;              // `$(…)` shreds to `$`/`…$` value tokens
      i += 2; continue;
    }
    i += 1;                                              // --opt=value or boolean global flag
  }
  if (toks[i] === verb) return true;
  // A substitution swallowed as an option value hides the true subcommand position
  // (`git -C $(pwd) commit`): fail closed if the verb appears anywhere after it.
  if (subst) { for (; i < toks.length; i++) if (toks[i] === verb) return true; }
  return false;
}

function segmentIsGitVerb(seg, depth, verb) {
  const toks = tokenize(seg);
  for (const pi of programCandidates(toks)) {
    const rest = toks.slice(pi);
    const b = basename(rest[0]);
    if (b === 'bash' || b === 'sh') {
      const inner = bashDashCPayload(rest);
      if (inner === null) continue;
      if (depth >= MAX_DEPTH) return true;               // fail CLOSED on pathological nesting
      if (anySegmentIsVerb(inner, depth + 1, verb)) return true;
      continue;
    }
    if (b === 'git' && gitSubcommandIs(rest, verb)) return true;
  }
  return false;
}

function anySegmentIsVerb(cmd, depth, verb) {
  if (!cmd || typeof cmd !== 'string') return false;
  for (const seg of lexSegments(cmd)) {
    if (segmentIsGitVerb(seg, depth, verb)) return true;
  }
  return false;
}

// Kept as a named helper: commitSegInfo's fallback reads as "is there a commit here at all".
const segmentIsGitCommit = (seg, depth) => segmentIsGitVerb(seg, depth, 'commit');

export function isGitCommit(command) {
  return anySegmentIsVerb(command, 0, 'commit');
}

// Same detector for `git push` (the cross-repo guard, #15 ②, blocks a push into another
// repo exactly like a commit; .githooks/pre-push is that repo's own boundary).
export function isGitPush(command) {
  return anySegmentIsVerb(command, 0, 'push');
}

// --- command-layer tripwire (AC3) --------------------------------------------
// Enforcement lives in .githooks/pre-commit. The command layer therefore stops
// trying to recognize every shell spelling that could reach a commit (the 6th
// review proved that game unwinnable) and watches exactly ONE finite, git-DEFINED
// surface: the documented handles that make git SKIP or RELOCATE its own hooks.
// A missed exotic spelling is harmless here — if the hook was not skipped, the hook
// still enforces. Only a declared bypass needs to be caught.
//
// Deliberately NOT checked: the session's ambient process environment. The
// 2026-07-27 incident (Orca launcher exporting GIT_CONFIG_COUNT for credentials)
// blocked every commit in the session because ambient GIT_CONFIG_* was read as
// retargeting. Ambient variables apply to git AND its hooks alike, so they cannot
// desynchronize the two; only what a CALL injects can. GIT_CONFIG_* is therefore
// judged by KEY, not by prefix (test-attack A-3).
const TRIPWIRE_RETARGET_ENV = /^GIT_(DIR|WORK_TREE|INDEX_FILE|NAMESPACE|COMMON_DIR|CEILING_DIRECTORIES|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES)$/;
// Config keys that move the repo root/worktree/hooks, directly or via file indirection.
const TRIPWIRE_RETARGET_CONFIG_KEY = /^(core\.hooks?path|core\.worktree|core\.bare|core\.git-?dir|core\.common-?dir|include\.|includeif\.)/i;
// `--no-verify` by git's unambiguous-prefix rule, plus its independent short alias `-n`.
const TRIPWIRE_NO_VERIFY_LONG = /^--no-v(?:e(?:r(?:i(?:f(?:y)?)?)?)?)?$/;
const TRIPWIRE_RETARGET_LONG = /^--(git-dir|work-tree|namespace)$/;
// Long options whose value is the NEXT token when not attached with `=`. Skipping their
// value is what keeps `git commit -m --no-verify` (a message that looks like a flag) and
// `git commit -F -n` (a path) from reading as a declared bypass.
const TRIPWIRE_LONG_VALUE = new Set([
  '--message', '--file', '--author', '--date', '--template', '--reuse-message',
  '--reedit-message', '--fixup', '--squash', '--trailer', '--cleanup', '--config-env',
  '--git-dir', '--work-tree', '--namespace', '--pathspec-from-file', '-C', '-c',
  // Separated-value forms MEASURED against git 2.43 (`git --attr-source HEAD commit` consumes
  // HEAD). Only options whose value is REQUIRED belong here: `--gpg-sign`/`--untracked-files`
  // take OPTIONAL values, so git reads `--gpg-sign -n` as a bare flag plus `-n` — consuming the
  // next token there would swallow a real bypass (round 5, L4; `--super-prefix` no longer
  // exists and `--exec-path` with no `=` is the query form).
  '--attr-source',
]);
// Short options whose value is the rest of the cluster, else the next token.
const TRIPWIRE_SHORT_VALUE = new Set(['m', 'F', 'C', 'c', 't']);
// Short options whose value attaches ONLY glued/`=` (never the next token): the glued
// remainder is a VALUE, so its letters must not be read as flags — `-unormal` is
// `-u normal`, not a `-n`. classifyCommitArgs models this the same way.
const TRIPWIRE_SHORT_GLUED_VALUE = new Set(['S', 'u']);

function tripwireEnvReason(env) {
  if (!env || typeof env !== 'object') return null;
  for (const [k, v] of Object.entries(env)) {
    if (TRIPWIRE_RETARGET_ENV.test(k)) {
      return `the call injects ${k}, which points git at another repository/index than the one whose hooks would run`;
    }
    if (/^GIT_CONFIG_KEY_\d+$/.test(k) && typeof v === 'string' && TRIPWIRE_RETARGET_CONFIG_KEY.test(v.trim())) {
      return `the call injects ${k}=${v}, a config key that relocates the repo root, worktree, or hooks path`;
    }
    // GIT_CONFIG_PARAMETERS is git's own internal config channel and honors the same keys. It
    // carries MANY pairs — modern git quotes them ("'a.b'='x' 'c.d'='y'"), older forms do not
    // ("a.b=x c.d=y") — so every pair's KEY is inspected in either shape (review rounds 2–3).
    // The shapes are checked EXCLUSIVELY: splitting a quoted string on whitespace also walks
    // into VALUES, so a credential helper whose value merely contained "core.hooksPath" was
    // falsely blocked (review round 4).
    if (k === 'GIT_CONFIG_PARAMETERS' && typeof v === 'string') {
      const quoted = v.match(/'([^']*)'\s*=/g);
      const keys = quoted && quoted.length > 0
        ? quoted
        : v.split(/\s+/).filter(Boolean).map((pair) => pair.split('=')[0]);
      if (keys.some((raw) => TRIPWIRE_RETARGET_CONFIG_KEY.test(raw.replace(/['"=\s]/g, '')))) {
        return `the call injects ${k}, which sets a config key that relocates the repo root, worktree, or hooks path`;
      }
    }
    if ((k === 'GIT_CONFIG_GLOBAL' || k === 'GIT_CONFIG_SYSTEM') && v !== '/dev/null') {
      return `the call injects ${k}=${v}, an alternate config source that can set core.hooksPath`;
    }
  }
  return null;
}

// Walk ONE git invocation's arguments the way git parses them: `--` ends option parsing,
// value-taking options consume their value, and a glued value is never re-read as flags.
// Without that model the tripwire both missed real bypasses and blocked ordinary commits
// whose message happened to look like a flag (review round 1 high #3 + medium).
//
// `kind` scopes the surface to WRITE-side invocations. Round 2 measured the cost of not
// doing that: `git -c core.hooksPath=/tmp/x status`, `GIT_INDEX_FILE=… git read-tree HEAD`
// and `GIT_DIR=… git log` were all blocked though they cannot skip a commit gate, and
// `git merge --no-verify` was blocked although merges are deliberately never gated.
//   'commit' — every handle applies (the gates run for this invocation)
//   'push'   — only `--no-verify`, which skips .githooks/pre-push (`-n` there is --dry-run)
//   'other'  — nothing: reading or rewriting history cannot bypass the commit gates
function tripwireArgReason(toks, kind = 'commit', postVerb = false) {
  // `-c`/`--config-env` are GLOBAL options: git only honors them before the verb. After it, `-c`
  // is `--reedit-message` and takes a commit-ish, so reading it as config could block an ordinary
  // commit (review round 4). The first bare token IS the verb — except in an alias BODY, which by
  // construction starts after the verb it defines (round 5, L5).
  let sawVerb = postVerb;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (typeof t !== 'string' || t.length === 0) continue;
    if (t === '--') return null;                                  // pathspecs only from here
    if (kind === 'commit' && /^GIT_[A-Z0-9_]*\+?=/.test(t)) {
      const eq = t.indexOf('=');
      const inline = tripwireEnvReason({ [t.slice(0, eq).replace(/\+$/, '')]: t.slice(eq + 1) });
      if (inline) return inline;
      continue;
    }
    if (t.startsWith('--')) {
      const eq = t.indexOf('=');
      const name = eq === -1 ? t : t.slice(0, eq);
      const attached = eq === -1 ? null : t.slice(eq + 1);
      if (TRIPWIRE_NO_VERIFY_LONG.test(name)) {
        if (kind === 'commit') {
          return 'the commit passes --no-verify, which makes git skip the pre-commit gates entirely';
        }
        if (kind === 'push') {
          return 'the push passes --no-verify, which skips .githooks/pre-push (the archive-leak and docs-drift boundary)';
        }
      }
      if (kind === 'commit' && TRIPWIRE_RETARGET_LONG.test(name)) {
        return `the commit carries ${name}, which relocates the repository whose hooks would run`;
      }
      if (kind === 'commit' && !sawVerb && name === '--config-env') {
        const val = attached ?? toks[i + 1];
        if (typeof val === 'string' && TRIPWIRE_RETARGET_CONFIG_KEY.test(val.trim())) {
          return `the call sets ${val.split('=')[0]} via --config-env, a config key that relocates the repo root, worktree, or hooks path`;
        }
      }
      if (attached === null && TRIPWIRE_LONG_VALUE.has(name)) i += 1;   // value is the next token
      continue;
    }
    if (t.startsWith('-') && t.length > 1) {
      const letters = t.slice(1);
      for (let j = 0; j < letters.length; j++) {
        const c = letters[j];
        if (TRIPWIRE_SHORT_GLUED_VALUE.has(c)) break;               // rest of the cluster is a value
        if (c === 'n' && kind === 'commit') {
          return 'the commit passes -n (--no-verify), which makes git skip the pre-commit gates entirely';
        }
        if (c === 'c' || c === 'C') {
          const val = j === letters.length - 1 ? toks[i + 1] : letters.slice(j + 1);
          if (kind === 'commit' && !sawVerb && c === 'c' && typeof val === 'string' && TRIPWIRE_RETARGET_CONFIG_KEY.test(val.trim())) {
            return `the call sets ${val.split('=')[0]}, a config key that relocates the repo root, worktree, or hooks path`;
          }
          if (j === letters.length - 1) i += 1;
          break;
        }
        if (TRIPWIRE_SHORT_VALUE.has(c)) {
          if (j === letters.length - 1) i += 1;                      // value is the next token
          break;                                                     // else glued value
        }
      }
      continue;
    }
    sawVerb = true;
  }
  return null;
}

// Classify ONE git invocation: which enforcement surface could this call skip, and what did an
// argv-local alias definition put in its argv? `-c alias.c=commit` resolves to a commit at
// runtime, and `-c "alias.c=commit --no-verify"` ALSO carries the bypass flag inside the
// definition — reading only the verb missed it entirely (review round 3, M4).
function gitInvocationInfo(rest) {
  const aliases = new Map();          // alias name -> { verb, body }
  let verb = null;
  const noteAlias = (raw) => {
    // Config section/key names are case-insensitive to git, so `-c ALIAS.c=commit` defines the
    // same alias (review round 4). The alias NAME is matched case-insensitively below for the
    // same reason.
    const m = /^alias\.([A-Za-z0-9_.-]+)=\s*!?\s*(?:git\s+)?([A-Za-z0-9_-]+)(.*)$/i.exec(raw);
    if (m) aliases.set(m[1].toLowerCase(), { verb: m[2], body: m[3] ?? '' });
  };
  for (let i = 1; i < rest.length; i++) {
    const t = rest[i];
    if (typeof t !== 'string' || t.length === 0) continue;
    if (t === '-c' || t === '--config-env') {
      noteAlias(rest[i + 1] ?? '');
      i += 1;
      continue;
    }
    if (t.startsWith('-')) {
      const name = t.includes('=') ? t.slice(0, t.indexOf('=')) : t;
      if (name === '--config-env' && t.includes('=')) { noteAlias(t.slice(t.indexOf('=') + 1)); continue; }
      if (!t.includes('=') && TRIPWIRE_LONG_VALUE.has(name)) i += 1;
      continue;
    }
    verb = t;
    break;
  }
  if (verb === null) return { kind: 'other', aliasBody: '' };
  const alias = aliases.get(verb.toLowerCase());
  const resolved = alias?.verb ?? verb;
  const kind = resolved === 'commit' ? 'commit' : resolved === 'push' ? 'push' : 'other';
  return { kind, aliasBody: alias?.body ?? '' };
}

/**
 * Reason string when a call declares a bypass of a harness hook, else null.
 * `env` is the CALL's injected environment (never the session's ambient environment).
 *
 * Scope is the WRITE side only: a commit invocation (including via an argv-local alias) can
 * skip the pre-commit gates, and a push can skip .githooks/pre-push. Read-only and
 * history-rewriting calls carry no gate to skip, so their `-c`/`GIT_*` idioms are left alone —
 * blocking them was pure friction (review round 2, measured). `bash -c`/`sh -c` payloads are
 * re-entered so a wrapped commit is not a blind spot.
 */
export function commitBypassTripwire(command, env = {}, depth = 0) {
  if (!command || typeof command !== 'string' || depth > 2) return null;
  for (const seg of lexSegments(command)) {
    const toks = tokenize(seg);
    for (const pi of programCandidates(toks)) {
      const rest = toks.slice(pi);
      const prog = basename(rest[0]);
      if (prog === 'bash' || prog === 'sh') {
        const inner = bashDashCPayload(rest);
        const nested = inner ? commitBypassTripwire(inner, env, depth + 1) : null;
        if (nested) return nested;
        continue;
      }
      if (prog !== 'git') continue;
      const { kind, aliasBody } = gitInvocationInfo(rest);
      // Inline `GIT_*=…` assignments sit BEFORE the program token, so scan the whole segment's
      // tokens for a commit invocation — and only for one, which keeps `GIT_DIR=… ls` (no git
      // program at all) and read-only git calls out of it. An argv-local alias DEFINITION can
      // also carry the flag (`-c "alias.c=commit --no-verify"`), so its body is walked too.
      const reason = tripwireArgReason(rest.slice(1), kind)
        ?? (aliasBody ? tripwireArgReason(tokenize(aliasBody), kind, true) : null)
        ?? (kind === 'commit' ? tripwireArgReason(toks.slice(0, pi), kind) : null)
        ?? (kind === 'commit' ? tripwireEnvReason(env) : null);
      if (reason) return reason;
    }
  }
  return null;
}

// --- commit FORM parsing (for review-gate effective-content hashing) ---------
// isGitCommit answers "does this line run a commit?"; parseCommitForm answers
// "can the review-gate statically hash what this commit will capture, and how?"
// so the gate hashes the EFFECTIVE committed diff instead of only the staged diff.
// This closes the gap where `git commit -a` pulled in tracked changes the staged
// hash never saw, letting a stale PASS review match the wrong content.
//
// parseCommitForm(command) -> { verifiable:true, all:bool } | { verifiable:false }
//   verifiable:true  => the committed content is exactly one of two diffs in the
//                       hook's cwd: all=true -> `git diff HEAD` (a -a/--all commit
//                       captures every tracked change); else -> `git diff --cached`
//                       (a plain commit captures the index).
//   verifiable:false => the content cannot be reproduced by a fixed diff in this
//                       cwd, so the gate fails closed (block on high/critical; the
//                       audited override — review-skip with reason/approved-by/
//                       `diff-hash: UNVERIFIABLE` — is the escape hatch). This
//                       covers, deliberately:
//                         • pathspec commits (`git commit foo.ts`) — the path set is
//                           shell-fragile (escapes, globs) and cwd-relative;
//                         • --amend / --include(-i) / --interactive(-p) /
//                           --pathspec-from-file — non-index or interactive content;
//                         • a commit behind bash -c, or >1 commit in one line;
//                         • a `&`-bearing shell redirection (`2>&1`, `>&2`, `&>x`):
//                           the reused lexer splits on its lone `&`, which would shred
//                           the arg list and hide a trailing `-a` — so we fail closed;
//                         • repo/worktree/index redirection — repo-redirecting globals
//                           (-C / --git-dir / --work-tree / --namespace), the matching
//                           GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE / GIT_NAMESPACE /
//                           GIT_COMMON_DIR env assignments, and `-c core.worktree|bare|
//                           gitdir` / `--config-env` — each targets another tree the
//                           cwd diff would mis-hash.
//
// Safety-gate bias (as in isGitCommit): only the two cleanly-reproducible forms are
// verifiable; ANYTHING else falls into verifiable:false (fail-closed), never a
// wrong-but-confident plain/all classification (which would fail OPEN). Long options
// are matched the way git resolves them — by unambiguous PREFIX — so `--amen` /
// `--inc` cannot sneak past the unverifiable set. Two rounds of adversarial review
// (codex + code-reviewer) drove this: exact-string option matching, pathspec hashing,
// ignoring shell redirections / bash-c siblings, and the `&`-redirection segment split
// were each a fail-open or a self-commit regression.
//
// Known NON-ADVERSARIAL limitations (consistent with isGitCommit's stated model —
// these are wrong-tree hashes or detection misses, not honored here):
//   • a `cd`/`pushd`/`popd` sharing a line with a commit is not attributed to a repo here at
//     all: this parser answers only "which enforcement surface could this call skip?", and the
//     repo question moved to the hook, which fires in the real target repo whatever the cwd
//     dance was. Standalone same-repo cd lines are likewise untouched;
//   • a pathspec quoted to look like a redirection (`git commit -- '>f.ts'`) —
//     tokenize() discards the quote, an absurd filename;
//   • forms isGitCommit itself does not detect ($(…) / `env -S` / leading `>out …` /
//     process substitution) bypass this gate upstream — see isGitCommit's header.
//
// Hook mode does not use this parser at all: .githooks/pre-commit hands the gates an
// explicit form (staged index, or `HEAD^ --cached` for an amend), because at index-commit
// time there is no command string to classify. parseCommitForm remains for the gates'
// standalone/debug path and for callers that only have a command line.

// git commit options that consume a SEPARATE value token (long form). Excludes
// --gpg-sign / -S: their <keyid> is optional and attaches only with `=`, so a
// following token is NOT their value.
const COMMIT_LONG_VALUE_OPT = new Set(['--message', '--file', '--author', '--date',
  '--template', '--reuse-message', '--reedit-message', '--fixup', '--squash',
  '--trailer', '--cleanup']);
// Long options that defeat static effective-content hashing -> unverifiable. Matched
// by git's unambiguous-prefix rule (see isUnverifiableLong), so abbreviations count.
const COMMIT_UNVERIFIABLE_LONG = ['--amend', '--include', '--interactive', '--patch',
  '--pathspec-from-file'];
// Short value-taking commit flags; may be the tail of a bundle (`-am "msg"`).
const COMMIT_SHORT_VALUE = new Set(['m', 'F', 'C', 'c', 't']);
// git global options that redirect to another repo/worktree/dir: a cwd diff would
// hash the wrong tree, so any commit carrying one is unverifiable.
const GIT_REPO_REDIRECT_OPT = new Set(['-C', '--git-dir', '--work-tree', '--namespace', '--bare']);
// Same, via the environment: a leading `GIT_DIR=… git commit` retargets the repo.
// GIT_CONFIG* covers `GIT_CONFIG_COUNT/KEY_n/VALUE_n` (injects e.g. core.worktree) and
// GIT_CONFIG_GLOBAL/SYSTEM redirection — over-matching harmless GIT_CONFIG_NOSYSTEM only
// errs toward fail-closed.
const GIT_REPO_REDIRECT_ENV = /^GIT_(DIR|WORK_TREE|INDEX_FILE|NAMESPACE|COMMON_DIR|CONFIG\w*)\+?=/;
// `-c <key>` / `--config-env` keys that move the repo root/worktree/index — directly
// (core.*) or via config-file indirection (include.path / includeIf.* can inject
// core.worktree from an arbitrary file).
const GIT_REPO_REDIRECT_CONFIG = /^(core\.(worktree|bare|git-?dir|common-?dir)|include\.|includeif\.)/i;

// True if the command contains an unquoted `&` that is part of a shell redirection
// (`2>&1`, `>&2`, `<&3`, `&>file`): the `&` is adjacent to a `<`/`>`. The reused
// lexSegments() treats any lone `&` as a control operator and splits on it, which
// would shred a commit's arg list (hiding a later `-a`); detecting it lets us fail
// closed before that happens. Quote-aware; not heredoc-aware, so a commit message
// body literally containing `2>&1` fails closed too (rare, and safe).
function hasAmpRedirection(cmd) {
  let q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) { if (c === q) q = null; else if (q === '"' && c === '\\') i++; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === '\\') { i++; continue; }
    if (c === '&' && (cmd[i - 1] === '>' || cmd[i - 1] === '<' || cmd[i + 1] === '>')) return true;
  }
  return false;
}

// True when `name` (a long option as typed, sans `=value`) resolves to one of the
// unverifiable options under git's unambiguous-prefix rule: `name` is a prefix of
// (or equal to) such an option. An abbreviation that is ALSO a prefix of some safe
// option is ambiguous and git itself rejects it (no commit runs), so treating it as
// unverifiable only ever errs toward blocking — never toward a false allow.
const isUnverifiableLong = (name) =>
  COMMIT_UNVERIFIABLE_LONG.some((opt) => opt.startsWith(name));

// tokenize() is quote-aware but NOT redirection-aware, so shell redirections survive
// as tokens (`>out`, `2>&1`, `<`, `<<MSG`, `<<'EOF'`→`<<EOF`). They are NOT git args
// and must be dropped before classification — otherwise the repo's own self-commit
// `git commit -F - <<'MSG'` would read `<<MSG` as a pathspec and mis-hash. Returns
// null (not a redirection) or { standalone } where standalone means the operator has
// no glued operand and the NEXT token is its target.


function redirToken(t) {
  const m = /^(?:\d+|&|\{[A-Za-z_][A-Za-z0-9_]*\})?(?:>>|>\||>&|<<-|<<<|<<|<>|<|>)/.exec(t); // {fd}>x varfd form included
  if (!m) return null;
  return { standalone: t.length === m[0].length };
}

// Inspect one segment. Returns null (not a commit here), { unverifiable:true } (an
// indirect/bash-c commit or a repo-redirecting global), or { args } (the tokens after
// `commit` in a direct `git … commit`).
function commitSegInfo(seg) {
  const toks = tokenize(seg);
  const cands = programCandidates(toks);
  if (cands.length === 0) return null;
  let found = null, hits = 0;
  for (const pi of cands) {
    // A repo-redirecting env assignment or xargs before the program makes the cwd diff
    // hash the wrong tree / unseen argv.
    if (toks.slice(0, pi).some((t) => GIT_REPO_REDIRECT_ENV.test(t) || basename(t) === 'xargs')) {
      return segmentIsGitCommit(seg, 0) ? { unverifiable: true } : null;
    }
    const rest = toks.slice(pi);
    if (basename(rest[0]) !== 'git') continue;           // bash -c handled by the fallback below
    let i = 1, redirect = false, subst = false;
    while (i < rest.length) {
      const t = rest[i];
      if (!t.startsWith('-')) break;
      if (GIT_TERMINAL_OPT.has(t) || t.startsWith('--list-cmds')) { i = -1; break; }
      const nameOnly = t.includes('=') ? t.slice(0, t.indexOf('=')) : t;
      if (GIT_REPO_REDIRECT_OPT.has(nameOnly)) redirect = true;
      if (nameOnly === '--config-env') redirect = true;                 // -> alternate config
      if (t === '-c' && GIT_REPO_REDIRECT_CONFIG.test(rest[i + 1] || '')) redirect = true;
      if (GIT_OPT_WITH_ARG.has(t)) {
        const v = rest[i + 1] ?? '';
        if (substShredValue(v)) subst = true;            // swallowed substitution hides the subcommand
        i += 2; continue;
      }
      i += 1;
    }
    if (i < 0) continue;                                 // terminal option: prints and exits
    let hit = rest[i] === 'commit';
    if (!hit && subst) { for (let k = i; k < rest.length; k++) if (rest[k] === 'commit') { hit = true; redirect = true; break; } }
    if (!hit) continue;
    hits += 1;
    found = (redirect || subst) ? { unverifiable: true } : { args: rest.slice(i + 1) };
  }
  if (hits > 1) return { unverifiable: true };           // ambiguous program position
  if (hits === 1) return found;
  // No direct parse hit: a wrapper/bash -c may still hide a commit (detection-only).
  return segmentIsGitCommit(seg, 0) ? { unverifiable: true } : null;
}

// Classify the post-`commit` argument tokens. Any pathspec, interactive/include
// form, or unverifiable option collapses to { verifiable:false }.
function classifyCommitArgs(args) {
  let all = false, endOpts = false, hasPathspec = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const r = redirToken(a);                          // drop shell redirections first
    if (r) { if (r.standalone) i += 1; continue; }    // (a standalone operator eats its target)
    if (endOpts) { hasPathspec = true; continue; }
    if (a === '--') { endOpts = true; continue; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq >= 0 ? a.slice(0, eq) : a;
      if (isUnverifiableLong(name)) return { verifiable: false };
      if (name === '--all') { all = true; continue; }
      if (name === '--no-all') { all = false; continue; }
      if (name === '--only') continue;                // --only without a pathspec is a git error; harmless
      if (COMMIT_LONG_VALUE_OPT.has(name) && eq < 0) i += 1;  // consume separate value
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {          // short flag bundle
      for (let j = 1; j < a.length; j++) {
        const ch = a[j];
        if (ch === 'a') { all = true; continue; }
        if (ch === 'i' || ch === 'p') return { verifiable: false };
        if (ch === 'S' || ch === 'u') break;          // optional GLUED value: rest isn't flags
        if (COMMIT_SHORT_VALUE.has(ch)) {             // value-taker ends the bundle
          if (j + 1 >= a.length) i += 1;              // value is the NEXT token
          break;                                      // (a glued value needs no consume)
        }
        // other boolean short flag (o/e/q/v/n/s/z/…) -> ignored
      }
      continue;
    }
    hasPathspec = true;                               // bare positional token -> pathspec
  }
  if (hasPathspec) return { verifiable: false };      // pathspec commits: fail-closed
  return { verifiable: true, all };
}

export function parseCommitForm(command) {
  if (!command || typeof command !== 'string') return { verifiable: false };
  // A `&`-bearing redirection would split mid-args in lexSegments below and could
  // hide a trailing -a; fail closed before trusting the segmentation.
  if (hasAmpRedirection(command)) return { verifiable: false };
  let found = null;
  for (const seg of lexSegments(command)) {
    const info = commitSegInfo(seg);
    if (!info) continue;
    if (info.unverifiable) return { verifiable: false };
    if (found) return { verifiable: false };          // >1 direct commit in one line
    found = info.args;
  }
  if (!found) return { verifiable: false };
  return classifyCommitArgs(found);
}

// --- WIP marker detection (for acceptance-gate's in-progress bypass) ---------
// A WIP commit is an intentional mid-task checkpoint: the acceptance-gate should
// not force all AC checked (nor the blunt acceptance-done flag) for every such
// commit. We detect a `wip:` / `[wip]` marker in the commit MESSAGE, taken from
// -m / --message (separate, `=`, glued `-mmsg`, or bundled `-am "msg"`) of the
// ACTUAL commit segment(s) — scoped via lexSegments/commitSegInfo, NOT a whole-line
// scan, so a `-m "wip…"` in a comment / heredoc body / sibling command (`grep -m`)
// does not false-trigger. A message via -F / heredoc carries no -m token -> not WIP
// (the gate applies normally; use acceptance-done for those). Multi-commit lines
// bypass only if EVERY commit is WIP (a non-WIP completion commit must still gate).
// Best-effort, not a safety gate.
// WIP_MARKER: subject begins with the word "wip" (wip:, wip(x):, WIP …) OR carries a
// [wip] tag. `wip\b` requires a full word, so "wiping"/"wipe" do NOT match.
const WIP_MARKER = /(^\s*wip\b)|(\[wip\])/i;

// Scan one commit's post-`commit` arg tokens for a WIP marker in -m/--message.
function commitArgsHaveWip(args) {
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (t === '-m' || t === '--message') { if (WIP_MARKER.test(args[i + 1] || '')) return true; i++; continue; }
    if (t.startsWith('--message=')) { if (WIP_MARKER.test(t.slice(10))) return true; continue; }
    if (t.startsWith('-m') && !t.startsWith('--')) { if (WIP_MARKER.test(t.slice(2))) return true; continue; } // -mmsg
    if (/^-[A-Za-z]*m$/.test(t)) { if (WIP_MARKER.test(args[i + 1] || '')) return true; i++; continue; }        // -am "msg"
  }
  return false;
}

export function isWipCommit(command) {
  if (!command || typeof command !== 'string') return false;
  let sawCommit = false;
  for (const seg of lexSegments(command)) {
    const info = commitSegInfo(seg);
    if (!info) continue;                                  // not a commit segment
    if (info.unverifiable || !info.args) return false;    // unreadable commit (bash -c / redirect) -> don't bypass
    sawCommit = true;
    if (!commitArgsHaveWip(info.args)) return false;       // a non-WIP commit present -> don't bypass
  }
  return sawCommit;
}

// --- commit target repo (index.ts HEAD snapshot; #22 / #48-6) ------------------
// The directory whose HEAD a `git commit` in `command` would move — so the extension can
// snapshot HEAD before the call and tell a landed commit from a gate-blocked one (HEAD
// unchanged), in the repo the commit actually targets (`git -C other commit` moved the
// OTHER repo's HEAD, not the session's — issue #22). Static and best-effort:
//   `git -C <dir> commit`    -> <dir>, chained -C resolved relative to the previous (like git)
//   plain `git commit`       -> baseDir (the bash tool's cwd input, else the session cwd)
//   `bash -c "git … commit"` -> recursed with the same base
// Returns null when the target cannot be trusted — a `cd`/`pushd`/`eval` token anywhere, a -C
// value the shell would still expand (`~`, `$VAR`, `$(…)`, glob), `env -C`/`--chdir`,
// --git-dir/--work-tree/GIT_DIR= retargeting, or two commit segments naming different repos.
// Callers treat null as "unknown" and fall back to the exit code rather than guessing a HEAD.
// A token that moves the cwd or re-executes text makes the commit's target unknowable
// statically. `cd`/`pushd`/`popd`/`eval`/`source` are matched as ANY token so `command cd x`,
// `builtin source e.sh`, `eval "cd x"` are caught; `.` (the source builtin) only at the program
// position or right after `command`/`builtin` — it is also the everyday pathspec in `git add .`.
// A quoted message stays ONE token, so `-m "cd x"` does not over-match; an unquoted over-match
// only costs the exit-code fallback, never a wrong repo.
const CWD_SHIFTERS = new Set(['cd', 'pushd', 'popd', 'eval', 'source']);
const BUILTIN_RUNNERS = new Set(['command', 'builtin']);
// A wrapper's own chdir option — GNU env `-C dir` / `-Cdir` / `--chdir=dir` and its unambiguous
// abbreviations (`--ch`, `--chd`, …), sudo `-D dir` — moves the program's cwd.
const WRAPPER_CHDIR = /^(-C|-D|--ch)/;
// A -C value the shell would still expand — `~`, `$VAR`, `$(…)`/backticks (quoted forms survive
// tokenize() with their `$`), globs, brace expansion — is not the literal directory git will see.
const UNEXPANDED = /[$`*?[{]|^~/;
// Change directory the way git's chdir does: component by component, following symlinks at
// each step, so `-C link/..` is the PARENT OF THE LINK TARGET (lexical `resolve()` would
// collapse `link/..` to the link's own parent first — and so does Node's JS `realpathSync`,
// which normalizes before walking; only the libc-backed `.native` follows the link first). A
// component that does not exist stays lexical — readHead fails there anyway.
function physical(p) {
  try { return realpathSync.native(p); } catch { return p; }
}
function chdir(from, v) {
  let cur = v.startsWith('/') ? '/' : physical(from);
  for (const part of v.split('/')) {
    if (part === '' || part === '.') continue;
    cur = part === '..' ? dirname(cur) : physical(join(cur, part));
  }
  return cur;
}

// Walk ONE git invocation's global options from `baseDir` the way git does: `-C` chains (each
// relative to the previous). Returns { target, verb } — verb is the subcommand token (undefined
// when a terminal option like --help short-circuits, or nothing follows) — or { unknown:true, verb }
// when a repo-redirecting global (--git-dir/--work-tree/--namespace/--bare/--config-env,
// `-c core.worktree…`) makes the target unknowable; verb is still reported when the walk could
// reach it, and is undefined after a `-C` value the shell would expand or a shredded substitution.
function gitInvocationTarget(rest, baseDir) {
  let i = 1, target = physical(baseDir), unknown = false;
  while (i < rest.length) {
    const t = rest[i];
    if (!t.startsWith('-')) break;
    if (GIT_TERMINAL_OPT.has(t) || t.startsWith('--list-cmds')) return { target, verb: undefined, terminal: true };
    const nameOnly = t.includes('=') ? t.slice(0, t.indexOf('=')) : t;
    if (t === '-C') {
      const v = rest[i + 1];
      // A value the shell would still expand: the target is unknowable, but a single `$VAR`
      // token still leaves the verb readable (so `git -C "$D" init` is not mistaken for a
      // commit); a shredded `$(…)` hides the verb position as well.
      if (v === undefined || substShredValue(v)) return { unknown: true, verb: undefined };
      if (UNEXPANDED.test(v)) unknown = true; else target = chdir(target, v);
      i += 2; continue;
    }
    if (GIT_REPO_REDIRECT_OPT.has(nameOnly) || nameOnly === '--config-env') unknown = true;
    if (t === '-c' && GIT_REPO_REDIRECT_CONFIG.test(rest[i + 1] || '')) unknown = true;
    if (GIT_OPT_WITH_ARG.has(t)) { if (substShredValue(rest[i + 1] ?? '')) return { unknown: true, verb: undefined }; i += 2; continue; }
    i += 1;
  }
  return unknown ? { unknown, verb: rest[i], index: i } : { target, verb: rest[i], index: i };
}

function scanCommitTarget(command, baseDir, depth) {
  if (depth > MAX_DEPTH) return { unknown: true };
  let dir = null;
  const merge = (d) => { if (dir !== null && dir !== d) return false; dir = d; return true; };
  for (const seg of lexSegments(command)) {
    const toks = tokenize(seg);
    if (toks.length === 0) continue;
    if (toks.some((t, i) => CWD_SHIFTERS.has(basename(t)) || GIT_REPO_REDIRECT_ENV.test(t)
      || (t === '.' && i > 0 && BUILTIN_RUNNERS.has(toks[i - 1])))) return { unknown: true };
    const cands = programCandidates(toks);
    if (cands.length === 0) continue;
    if (toks[cands[0]] === '.') return { unknown: true };
    for (const pi of cands) {
      // Anything before THIS program position is wrapper territory (`sudo -u git env -C /o git …`).
      if (toks.slice(0, pi).some((t) => WRAPPER_CHDIR.test(t))) return { unknown: true };
      const rest = toks.slice(pi);
      const b = basename(rest[0]);
      if (b === 'bash' || b === 'sh') {
        const inner = bashDashCPayload(rest);
        if (inner === null) continue;
        const r = scanCommitTarget(inner, baseDir, depth + 1);
        if (r === null) continue;
        if (r.unknown || !merge(r.dir)) return { unknown: true };
        continue;
      }
      if (b !== 'git') continue;
      const r = gitInvocationTarget(rest, baseDir);
      if (r.unknown) return { unknown: true };
      if (r.verb !== 'commit') continue;
      if (!merge(r.target)) return { unknown: true };
    }
  }
  return dir === null ? null : { dir };
}

export function commitTargetDir(command, baseDir) {
  if (!command || typeof command !== 'string' || !baseDir) return null;
  const r = scanCommitTarget(command, baseDir, 0);
  return r && !r.unknown ? r.dir : null;
}

// --- shell write targets (cross-repo guard, #15 ①②) -------------------------------
// What a command line WRITES, statically: the repos its `git commit` / `git push` invocations
// target and the files its mutators name. Unlike commitTargetDir (which refuses any `cd`), the
// running cwd is TRACKED through ONE literal `cd <dir>` segment — `cd ../other && git commit` is
// the everyday cross-repo spelling the guard must attribute. The model is a single cwd, so every
// form it cannot follow makes the cwd UNKNOWN from that segment on (fail-closed): a second `cd`
// in the same line (`cd a || cd b`), a `cd` whose target does not exist (the shell stays put), a
// `cd` beside an unquoted parenthesis (a subshell restores the cwd on exit), `cd "$D"`, bare
// `cd`, `cd -`, `pushd`/`popd`, `eval`/`source`, a wrapper's own chdir, `GIT_DIR=…` in the line
// or in the call's env. A git commit/push met in an unknown cwd, or behind an `eval`/`source`
// whose arguments mention one, is reported in `unknown`; a relative file operand there is
// dropped (absolute operands are still attributed). Over-collection is harmless — the guard
// only compares repo identities.
//
//   shellWriteTargets(command, baseDir, env) -> { git: [{ dir, verb }], files: [abs], unknown }
//
// File mutators are a small fixed set — every operand of rm/rmdir/unlink/mv/touch/mkdir/
// truncate/tee/patch (and `install -d`), the DESTINATION (last operand, `-t DIR`, `-tDIR`) of
// cp/ln/install/rsync, every operand of an in-place `sed -i`, and the target of an unquoted
// output redirection (`>`, `>>`, glued or spaced, with any fd prefix; `>&N` duplicates an fd).
// Operands the shell would still expand (`$VAR`, globs, `~`) are not literal paths and are
// dropped. Residuals: non-commit git writes (`git -C other add`), `>|` (the lexer splits on
// `|`), a commit inside `$(…)` (isGitCommit's own limit), `git push <url-or-path>` (the target
// is the cwd repo's remote, not a directory), and a `-C` after an unknown cwd (fails closed).
const MUTATOR_ALL = new Set(['rm', 'rmdir', 'unlink', 'mv', 'touch', 'mkdir', 'truncate', 'tee', 'patch', 'chmod', 'chown', 'chgrp']);
const MUTATOR_DEST = new Set(['cp', 'ln', 'install', 'rsync']);
const isMutator = (b) => MUTATOR_ALL.has(b) || MUTATOR_DEST.has(b) || b === 'sed';
const SED_IN_PLACE = /^(?:-[A-Za-z]*i|--in-place)/;
// Option arity per mutator (review r4-3): short letters that TAKE A VALUE (glued remainder or
// next token — `-Stmp` is a suffix, not `-t mp`), and long options that take a SEPARATE value
// when not `=`-attached. `t` (cp/mv/ln/install) names the target DIRECTORY; `d` (install) means
// "create directories", read only when it precedes any value-taking letter in the bundle.
const TARGET_DIR_PROGS = new Set(['cp', 'mv', 'ln', 'install']);
const VALUE_SHORT = { cp: 'St', mv: 'St', ln: 'St', install: 'Stogm', touch: 'rdt', sed: 'ef', rsync: 'e', chmod: '', chown: '', chgrp: '' };
const VALUE_LONG = {
  cp: ['--suffix'], mv: ['--suffix'], ln: ['--suffix'], install: ['--suffix', '--owner', '--group', '--mode', '--context'],
  touch: ['--reference', '--date', '--time'], sed: ['--expression', '--file', '--line-length'], rsync: ['--rsh', '--exclude', '--include', '--files-from', '--exclude-from', '--include-from'],
  chown: ['--reference'], chgrp: ['--reference'], chmod: ['--reference'],
};
const isTargetDirLong = (name) => name.length >= 3 && '--target-directory'.startsWith(name);   // GNU unambiguous prefixes
const isFlag = (t) => t.startsWith('-') && t.length > 1;
const isGitWriteVerb = (v) => v === 'commit' || v === 'push';
const EVAL_LIKE = new Set(['eval', 'source', '.']);
const EXPORTERS = new Set(['export', 'declare', 'typeset']);
// An argv-local alias whose body is a commit/push (or a shell alias, opaque): `-c alias.c=commit`.
const ALIAS_WRITE_DEF = /^alias\.[^=]+=\s*(?:!|(?:git\s+)?(?:commit|push)\b)/i;
// git verbs that are certainly not a commit/push, so a repo-redirecting global beside them is
// not a finding (`git --git-dir=/x status && git commit`). Anything else in the verb position —
// including a value swallowed as a verb by an option the walk does not know — fails closed.
const GIT_NON_WRITE_VERBS = new Set(['status', 'log', 'diff', 'show', 'rev-parse', 'ls-files', 'ls-tree',
  'ls-remote', 'cat-file', 'blame', 'describe', 'branch', 'tag', 'remote', 'config', 'fetch', 'pull', 'clone',
  'init', 'add', 'rm', 'mv', 'checkout', 'switch', 'restore', 'reset', 'stash', 'merge', 'rebase', 'cherry-pick',
  'revert', 'worktree', 'submodule', 'grep', 'shortlog', 'reflog', 'for-each-ref', 'update-ref', 'write-tree',
  'read-tree', 'hash-object', 'check-attr', 'var', 'version', 'help', 'range-diff', 'rev-list', 'name-rev',
  'show-ref', 'symbolic-ref', 'merge-base', 'check-ignore', 'diff-tree', 'diff-index', 'diff-files', 'archive',
  'bundle', 'count-objects', 'fsck', 'gc', 'prune', 'repack', 'notes', 'apply', 'am', 'format-patch', 'whatchanged',
  'bisect', 'clean', 'mailinfo', 'check-ref-format', 'verify-pack', 'verify-commit', 'verify-tag', 'show-branch']);

// Walk one short bundle (`-rvt`, `-Stmp`, `-dm755`) letter by letter: the first value-taking
// letter owns the rest (or the next token). Returns { dest, dirFlag, consumeNext }.
function shortBundle(prog, t) {
  const valueLetters = VALUE_SHORT[prog] ?? '';
  let dirFlag = false;
  for (let k = 1; k < t.length; k++) {
    const ch = t[k];
    if (ch === 't' && TARGET_DIR_PROGS.has(prog)) return { dest: t.slice(k + 1) || null, dirFlag, consumeNext: t.length === k + 1 };
    if (valueLetters.includes(ch)) return { dest: null, dirFlag, consumeNext: t.length === k + 1 };
    if (ch === 'd' && prog === 'install') dirFlag = true;
  }
  return { dest: null, dirFlag, consumeNext: false };
}

function mutatorOperands(prog, args) {
  if (prog === 'sed' && !args.some((t) => SED_IN_PLACE.test(t))) return [];
  const operands = [];
  let dest = null, dashdash = false, installDir = args.some((t) => t === '--directory');
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    // Redirections are the shell's, not the program's (`cp a E/x 2>/dev/null` — r3 N1): the
    // output ones were collected from the raw segment already.
    const r = redirToken(t);
    if (r) { if (r.standalone) i += 1; continue; }
    if (!dashdash && t === '--') { dashdash = true; continue; }
    if (!dashdash && isFlag(t)) {
      if (t.startsWith('--')) {
        if (t.includes('=')) {
          if (TARGET_DIR_PROGS.has(prog) && isTargetDirLong(t.slice(0, t.indexOf('=')))) dest = t.slice(t.indexOf('=') + 1);
          continue;
        }
        if (TARGET_DIR_PROGS.has(prog) && isTargetDirLong(t)) { dest = args[++i] ?? null; continue; }
        if ((VALUE_LONG[prog] ?? []).some((opt) => t.length >= 3 && opt.startsWith(t))) i += 1;
        continue;
      }
      const b = shortBundle(prog, t);
      if (b.dirFlag) installDir = true;
      if (b.dest !== null) dest = b.dest;
      else if (b.consumeNext) { const v = args[++i] ?? null; if (t.endsWith('t') && TARGET_DIR_PROGS.has(prog)) dest = v; }
      continue;
    }
    operands.push(t);
  }
  const all = MUTATOR_ALL.has(prog) || prog === 'sed' || (prog === 'install' && installDir);
  if (all) return dest !== null ? [...operands, dest] : operands;
  if (dest !== null) return [dest];
  return operands.length >= 2 ? operands.slice(-1) : [];
}

// Tokens of a segment with the shell's redirections removed (`cd X 2>/dev/null` — r4-1).
function withoutRedirections(toks) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const r = redirToken(toks[i]);
    if (r) { if (r.standalone) i += 1; continue; }
    out.push(toks[i]);
  }
  return out;
}

// Targets of unquoted output redirections in a RAW segment. Quote-aware, so a `>` inside a quoted
// commit message is not a redirection, and glued targets (`echo hi>/f`) are seen — tokenize()
// would fold `hi>/f` into one word. `>&N` / `>&-` duplicate or close an fd and are skipped;
// `>&word` (bash: both streams to a file) and `<>` count as writes.
function outputRedirectTargets(seg) {
  const targets = [];
  const n = seg.length;
  let i = 0, q = null;
  while (i < n) {
    const c = seg[i];
    if (q) { if (c === '\\' && q === '"') i += 2; else { if (c === q) q = null; i += 1; } continue; }
    if (c === '\\') { i += 2; continue; }
    if (c === "'" || c === '"') { q = c; i += 1; continue; }
    if (c !== '>') { i += 1; continue; }
    let j = i + 1;
    if (seg[j] === '>') j += 1;
    if (seg[j] === '&') {
      j += 1;
      let k = j;
      while (k < n && (seg[k] === ' ' || seg[k] === '\t')) k += 1;
      if (k >= n || /[0-9-]/.test(seg[k])) { i = j; continue; }       // fd duplicate / close
    }
    while (j < n && (seg[j] === ' ' || seg[j] === '\t')) j += 1;
    const word = tokenize(seg.slice(j))[0];
    if (word !== undefined && word !== '') targets.push(word);
    i = j;
  }
  return targets;
}

function hasUnquotedParen(seg) {
  let q = null;
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (q) { if (c === '\\' && q === '"') i += 1; else if (c === q) q = null; continue; }
    if (c === '\\') { i += 1; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === '(' || c === ')') return true;
  }
  return false;
}

// Index of the program token: past assignments, reserved words, redirections and a builtin
// runner (`command cd x`, `builtin cd x`). toks.length when the segment runs nothing.
function programStart(toks) {
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (isAssign(t) || RESERVED.has(t)) { i += 1; continue; }
    const r = redirToken(t);
    if (r) { i += r.standalone ? 2 : 1; continue; }
    break;
  }
  if (i < toks.length && BUILTIN_RUNNERS.has(toks[i])) {
    i += 1;
    while (i < toks.length && isFlag(toks[i])) i += 1;                  // `command -p rm`, `command -- rm` (r4-2)
    if (i < toks.length && toks[i] === '--') i += 1;
  }
  return i;
}

// The cwd after a `cd` segment, or null when it cannot be followed: unknown current cwd, flags
// aside not exactly one literal operand, `cd -`, or a target that is not an existing directory
// (the shell would stay where it was — and `cd missing || cd elsewhere` is two cds anyway).
// Resolved LOGICALLY like bash's cd (`..` on the path as spelled) unless `-P` asks for the
// physical walk git's `-C` uses (r3 C1).
function cdTarget(cwd, args) {
  const operands = args.filter((t) => !isFlag(t));
  if (cwd === null || operands.length !== 1 || operands[0] === '-' || UNEXPANDED.test(operands[0])) return null;
  const physicalWalk = args.some((t) => /^-[A-Za-z]*P/.test(t));
  const dir = physicalWalk ? chdir(cwd, operands[0]) : resolve(cwd, operands[0]);
  try { return statSync(dir).isDirectory() ? dir : null; } catch { return null; }
}

// Attributed as spelled: `cwd/p` is NOT normalized here, so a `link/..` inside `p` is resolved
// component-wise (physically) by repo-root later, not collapsed lexically first (review r2 X3).
function addFiles(out, paths, cwd) {
  for (const p of paths) {
    if (UNEXPANDED.test(p)) continue;
    if (p.startsWith('/')) out.files.push(p);
    else if (cwd !== null) out.files.push(`${cwd}/${p}`);
  }
}

function scanGitCall(argv, cwd, retarget, out) {
  const rest = withoutRedirections(argv);                              // `git -C E 2>/dev/null push` (r4-5)
  const aliased = rest.some((t, k) => (k > 0 && ALIAS_WRITE_DEF.test(t) && (rest[k - 1] === '-c' || rest[k - 1] === '--config-env')) || /^--config-env=alias\.[^=]+=\s*(?:!|(?:git\s+)?(?:commit|push)\b)/i.test(t));
  if (cwd === null || retarget) {
    // Only a commit/push here is a finding; `git status` after `cd "$D"` is not.
    if (aliased || gitSubcommandIs(rest, 'commit') || gitSubcommandIs(rest, 'push')) {
      out.unknown ??= retarget ? 'GIT_* environment retargets the repo' : 'the working directory at this git call cannot be resolved statically';
    }
    return;
  }
  const r = gitInvocationTarget(rest, cwd);
  if (r.terminal) return;                                              // --help/--version: git prints and exits
  if (rest[r.index + 1] === '--help') return;                          // `git commit --help` likewise (r4-8)
  if (aliased) { out.unknown ??= 'an argv-local git alias stands for commit/push'; return; }
  if (r.unknown) {
    if (r.verb === undefined || !GIT_NON_WRITE_VERBS.has(r.verb)) out.unknown ??= 'repo-redirecting git option (-C with an unexpanded value, --git-dir, --work-tree, …)';
    return;
  }
  if (isGitWriteVerb(r.verb)) out.git.push({ dir: r.target, verb: r.verb });
}

function scanWriteTargets(command, baseDir, depth, out, envRetarget) {
  if (depth > MAX_DEPTH) { out.unknown ??= 'bash -c nesting too deep'; return; }
  let cwd = baseDir, cdSeen = 0, lineRetarget = envRetarget;
  for (const seg of lexSegments(command)) {
    const toks = tokenize(seg);
    if (toks.length === 0) continue;
    addFiles(out, outputRedirectTargets(seg), cwd);
    const i = programStart(toks);
    // A standalone `GIT_DIR=…` assignment, or `export`/`declare -x`/`typeset -x GIT_DIR=…`,
    // retargets every later segment of the line (review r2 A2, r3 C2) — unlike a prefix
    // assignment, which scopes to its own command. (`unset` is not modelled: conservative.)
    if ((i >= toks.length && toks.some((t) => GIT_REPO_REDIRECT_ENV.test(t)))
      || (i < toks.length && EXPORTERS.has(basename(toks[i])) && toks.slice(i + 1).some((t) => GIT_REPO_REDIRECT_ENV.test(t)))) lineRetarget = true;
    if (i >= toks.length) continue;
    const prog = basename(toks[i]);
    if (prog === 'cd') {
      cwd = (++cdSeen === 1 && !hasUnquotedParen(seg)) ? cdTarget(cwd, withoutRedirections(toks.slice(i + 1))) : null;
      continue;
    }
    if (EVAL_LIKE.has(prog) || CWD_SHIFTERS.has(prog)) {
      cwd = null;
      if (toks.some((t) => /\bgit\b/.test(t)) && toks.some((t) => /\b(?:commit|push)\b/.test(t))) {
        out.unknown ??= `a \`${prog}\` argument mentions a git commit/push`;
      }
      continue;
    }
    // A mutator at the program position (plain, or behind `command`/`builtin` which programStart
    // already skipped — r3 N3).
    if (isMutator(prog)) { addFiles(out, mutatorOperands(prog, toks.slice(i + 1)), cwd); continue; }
    if (WRAPPER.has(prog)) {
      // A mutator behind a wrapper (`sudo rm …`, `env VAR=1 tee …`) — programCandidates only
      // enumerates shell programs there.
      const k = toks.findIndex((t, idx) => idx > i && isMutator(basename(t)));
      if (k >= 0) addFiles(out, mutatorOperands(basename(toks[k]), toks.slice(k + 1)), toks.slice(i, k).some((t) => WRAPPER_CHDIR.test(t)) ? null : cwd);
    }
    for (const pi of programCandidates(toks)) {
      const before = toks.slice(0, pi);
      const segCwd = before.some((t) => WRAPPER_CHDIR.test(t)) ? null : cwd;
      const retarget = lineRetarget || before.some((t) => GIT_REPO_REDIRECT_ENV.test(t));
      const rest = toks.slice(pi);
      const b = basename(rest[0]);
      if (b === 'bash' || b === 'sh') {
        const inner = bashDashCPayload(rest);
        if (inner !== null) scanWriteTargets(inner, segCwd, depth + 1, out, retarget);
      } else if (b === 'git') {
        scanGitCall(rest, segCwd, retarget, out);
      }
    }
  }
}

export function shellWriteTargets(command, baseDir, env = {}) {
  const out = { git: [], files: [], unknown: null };
  if (!command || typeof command !== 'string' || !baseDir) return out;
  const envRetarget = Boolean(env && typeof env === 'object' && Object.keys(env).some((k) => TRIPWIRE_RETARGET_ENV.test(k)));
  scanWriteTargets(command, baseDir, 0, out, envRetarget);
  return out;
}


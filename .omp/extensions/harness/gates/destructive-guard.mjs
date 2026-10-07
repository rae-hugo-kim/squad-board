#!/usr/bin/env node
// destructive-guard.mjs - PreToolUse hook for Bash
// Purpose: Warn when dangerous shell commands are detected

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

function getStateDir(cwd) {
  const dir = join(cwd, '.omp', 'harness-state');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const input = readFileSync(0, 'utf-8');

let data;
try {
  data = JSON.parse(input);
} catch {
  console.error('HARNESS WARNING: Hook received invalid input, skipping check.');
  process.exit(0);
}

const cwd = data?.session_state?.cwd || process.cwd();
const stateDir = getStateDir(cwd);
const logFile = join(stateDir, 'hook-debug.log');

function log(msg) {
  if (!process.env.HARNESS_DEBUG) return;
  const timestamp = new Date().toISOString();
  appendFileSync(logFile, `[${timestamp}] destructive-guard: ${msg}\n`);
}

log('Hook started');

const command = data?.tool_input?.command || '';
log(`Command: ${command.slice(0, 120)}`);

// Blank ONLY the value of a commit-message flag (-m / -am / --message) before the
// keyword scan. A message that mentions a destructive command (e.g.
// `git commit -m "remove the rm -rf call"`) is the common false positive. This is
// deliberately narrow: real destructive commands — including quoted `sh -c`
// payloads and overwrite targets — are left intact and still match, because they
// are not commit-message values. (Heuristic, not a shell parser; an attached
// `-m"msg"` form is not stripped — uncommon and only costs an extra warning.)
function stripCommitMessageValue(cmd) {
  return cmd.replace(
    /(^|\s)(--message|-[a-z]*m)(\s+|=)("(?:\\.|[^"\\])*"|'[^']*'|[^\s'";|&]+)/g,
    (match, pre, flag, sep, value) => {
      // Keep a message value that contains a command substitution: the shell
      // executes $(...) / `...` before git ever sees the message, so blanking it
      // would hide a real destructive command. (Errs toward warning — the rare
      // single-quoted literal `$(...)` just gets an extra advisory warning.)
      if (/\$\(|`/.test(value)) return match;
      return `${pre}${flag}${sep}""`;
    },
  );
}
const keywordScan = stripCommitMessageValue(command);

// Code file extensions to detect overwrite-via-redirect
const CODE_EXTS = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|sh|sql)$/;

const DESTRUCTIVE_PATTERNS = [
  { pattern: /rm\s+-[a-z]*r[a-z]*f|rm\s+-[a-z]*f[a-z]*r/, label: 'rm -rf' },
  { pattern: /rm\s+-r\b/, label: 'rm -r' },
  { pattern: /\brmdir\b/, label: 'rmdir' },
  { pattern: /git\s+checkout\s+--\s+\./, label: 'git checkout -- .' },
  { pattern: /git\s+checkout\s+\.$/, label: 'git checkout .' },
  { pattern: /git\s+clean\s+-[a-z]*f/, label: 'git clean -f' },
  { pattern: /git\s+reset\s+--hard/, label: 'git reset --hard' },
  { pattern: /sed\s+-i/, label: 'sed -i (in-place edit bypasses edit gates)' },
];

// Check for truncation via redirect on code files: "> some/file.ts"
// (uses keywordScan so a "> file.ts" inside a commit message doesn't false-fire,
// while a real quoted target like `> "file.ts"` is preserved and still detected.)
const redirectMatch = keywordScan.match(/>\s*(['"]?)([^\s'";&|]+\.[a-z]+)\1/);
if (redirectMatch) {
  const targetFile = redirectMatch[2];
  if (CODE_EXTS.test(targetFile)) {
    DESTRUCTIVE_PATTERNS.push({ pattern: /./, label: `> ${targetFile} (truncation of code file)` });
  }
}

// Check for mv/cp overwriting code files (keywordScan: a "mv a.ts b.ts" inside a
// commit message is blanked, but a real mv/cp with a quoted target still matches.)
const mvCpMatch = keywordScan.match(/\b(?:mv|cp)\b[^|;&\n]*\s+(['"]?)([^\s'";&|]+\.[a-z]+)\1/);
if (mvCpMatch) {
  const targetFile = mvCpMatch[2];
  if (CODE_EXTS.test(targetFile)) {
    DESTRUCTIVE_PATTERNS.push({ pattern: /./, label: `mv/cp overwriting ${targetFile}` });
  }
}

const matched = DESTRUCTIVE_PATTERNS.find(({ pattern }) => pattern.test(keywordScan));

if (!matched) {
  log('No destructive pattern matched, allowing');
  process.exit(0);
}

log(`Destructive pattern matched: ${matched.label}`);
console.error(`HARNESS WARNING: Destructive command detected: ${matched.label}. Consider using Edit tool instead.`);

process.exit(0);

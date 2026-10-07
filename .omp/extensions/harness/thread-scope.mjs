#!/usr/bin/env node
// thread-scope.mjs — P2 iteration helper (seed AC4/AC7, analysis Q8).
//
// Regenerates docs/harness/current-scope.md from the ACTIVE seed for a new iteration thread and
// records provenance/verdict in docs/harness/audit.jsonl, so partial-feature/rebuild work (P2) is
// tracked by acceptance-gate instead of escaping into untracked commits (the gap the L2 backstop
// in acceptance-gate.mjs catches).
//
//   node thread-scope.mjs open  [--ac id1,id2] [--name "label"]   regen scope + thread_opened
//   node thread-scope.mjs close [--verdict PASS|FAIL|...]          thread_closed verdict
//
// Active = draft|approved. A closed seed (done|superseded) is REOPENED in place for same-feature
// iteration (status->approved, version+1, audit seed_reopened; closeout history kept in audit + git).
// Genuinely new work uses /kickoff. No git; reads/writes docs/harness/ only.
//
// Test seam: THREAD_SCOPE_CWD overrides cwd, THREAD_ID overrides the generated thread id.

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

function parseArgs(argv) {
  const mode = argv[0];
  const opts = {};
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--ac') opts.ac = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (argv[i] === '--name') opts.name = argv[++i] || '';
    else if (argv[i] === '--verdict') opts.verdict = argv[++i] || '';
  }
  return { mode, opts };
}

// Top-level scalar field from the seed (regex, no yaml dep — matches the gates' style).
function field(src, key) {
  const m = src.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)`, 'm'));
  return m ? m[1].trim() : null;
}

// [{ id, label }] from the acceptance_criteria block. Supports the richer object form
// (- id: X / title: Y) and the flat string form (- some text).
function parseAC(src) {
  // Normalize leading tabs (YAML forbids them, but agent-authored seeds may slip) so a
  // tab-indented item doesn't desync the space-based indent match.
  const lines = src.split('\n').map((l) => l.replace(/^\t+/, (m) => '  '.repeat(m.length)));
  const startIdx = lines.findIndex((l) => /^acceptance_criteria:\s*$/.test(l));
  if (startIdx < 0) return [];
  // Collect the block until the next real top-level YAML key. Comments (any indent) are
  // SKIPPED, not treated as the terminator — a column-0 `# ...` between items must not
  // truncate the block (that would silently undercount AC, the exact failure this guards).
  const body = [];
  for (const line of lines.slice(startIdx + 1)) {
    if (/^\s*#/.test(line)) continue;
    if (/^\S.*:/.test(line) && !/^\s*-/.test(line)) break;
    body.push(line);
  }
  // AC items are list entries at the FIRST list indent; deeper `-` lines (must/should/verify
  // sub-bullets of the richer schema) are sub-content and must NOT be counted as AC.
  const firstItem = body.find((l) => /^\s*-\s/.test(l));
  if (!firstItem) return [];
  const indent = firstItem.match(/^(\s*)-/)[1].length;
  // `\S.*` (not `.*\S` with a trailing \s* alternation) keeps the match linear; trim() tidies.
  const itemRe = new RegExp(`^\\s{${indent}}-\\s+(\\S.*)$`);
  const out = [];
  let cur = null;
  for (const line of body) {
    const im = line.match(itemRe);
    if (im) {
      if (cur) out.push(cur);
      const content = im[1].trim();
      const idm = content.match(/^id:\s*(\S+)/);
      cur = idm ? { id: idm[1], label: idm[1] }
                : { id: null, label: content.replace(/^["']|["']$/g, '') };
      continue;
    }
    if (cur && cur.id && cur.label === cur.id) {
      const tm = line.match(/^\s*title:\s*(.+\S)\s*$/);
      if (tm) cur.label = `${cur.id} — ${tm[1].trim()}`;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const cwd = process.env.THREAD_SCOPE_CWD || process.cwd();
const H = join(cwd, 'docs', 'harness');
const seedPath = join(H, 'seed.yaml');
const scopePath = join(H, 'current-scope.md');
const auditPath = join(H, 'audit.jsonl');
const now = () => new Date().toISOString();

function appendAudit(event, meta) {
  mkdirSync(H, { recursive: true });
  appendFileSync(auditPath, JSON.stringify({ ts: now(), event, actor: 'assistant', meta }) + '\n');
}

const { mode, opts } = parseArgs(process.argv.slice(2));

if (mode === 'open') {
  if (!existsSync(seedPath)) {
    console.error('thread-scope: no docs/harness/seed.yaml — run /kickoff first.');
    process.exit(1);
  }
  let seed;
  try { seed = readFileSync(seedPath, 'utf-8'); }
  catch (e) { console.error(`thread-scope: cannot read seed.yaml: ${e.message}`); process.exit(1); }
  let seedSrc = seed;
  const status = (field(seed, 'status') || '').toLowerCase();
  if (status === 'done' || status === 'superseded') {
    // Reopen in place: a feature's seed is a living SSOT, not a terminal record. done/superseded
    // is a RESTING state — same-feature iteration reactivates it (history stays in audit + git).
    // Genuinely new work should use /kickoff (a new seed). (analysis Q10/(i); seed_evolution_policy.md)
    const fromV = field(seed, 'version') || '1';
    const toV = String((Number(fromV) || 0) + 1);
    seedSrc = seed
      .replace(/^status:[^\n]*$/m, 'status: approved')
      .replace(/^version:[^\n]*$/m, `version: ${toV}`)
      .replace(/^completed:[^\n]*\n?/m, '');
    writeFileSync(seedPath, seedSrc);
    appendAudit('seed_reopened', {
      seed_task_id: field(seed, 'task_id') || field(seed, 'name') || 'unknown',
      from_status: status, from_version: Number(fromV) || fromV, to_version: Number(toV) || toV,
    });
    console.error(`thread-scope: reopened closed seed (${status} v${fromV} -> approved v${toV}); history in audit.jsonl + git.`);
  }
  const taskId = field(seedSrc, 'task_id') || field(seedSrc, 'name') || 'unknown';
  const version = field(seedSrc, 'version') || '1';
  const seedName = field(seedSrc, 'name') || taskId;
  const acs = parseAC(seedSrc);
  let targeted = acs;
  if (opts.ac && opts.ac.length) targeted = acs.filter((a) => a.id && opts.ac.includes(a.id));
  if (targeted.length === 0) {
    console.error('thread-scope: no acceptance_criteria selected/found in seed.');
    process.exit(1);
  }
  const threadId = process.env.THREAD_ID || `T-${now().replace(/[-:T.Z]/g, '').slice(0, 14)}-${Math.random().toString(16).slice(2, 6)}`;
  const name = (opts.name || `iteration on ${seedName}`).replace(/[\r\n]+/g, ' ');
  const scope = [
    `# Current Scope: ${seedName} (P2 thread)`,
    '',
    `**Created**: ${now().slice(0, 10)}`,
    `**Seed**: docs/harness/seed.yaml (task_id ${taskId}, v${version})`,
    `**Thread-ID**: ${threadId}`,
    `**Thread**: ${name}`,
    '',
    '## Acceptance Criteria',
    ...targeted.map((a) => `- [ ] ${a.label}`),
    '',
  ].join('\n');
  writeFileSync(scopePath, scope);
  appendAudit('thread_opened', {
    thread_id: threadId,
    seed_task_id: taskId,
    seed_version: Number.isFinite(Number(version)) ? Number(version) : version,
    ac_targeted: targeted.map((a) => a.id || a.label),
  });
  console.log(`thread-scope opened: ${threadId} — ${targeted.length} AC -> docs/harness/current-scope.md`);
  process.exit(0);
}

if (mode === 'close') {
  let threadId = 'unknown';
  if (existsSync(scopePath)) {
    const m = readFileSync(scopePath, 'utf-8').match(/^\*\*Thread-ID\*\*:\s*(\S+)/m);
    if (m) threadId = m[1];
  }
  const verdict = opts.verdict || 'UNSPECIFIED';
  appendAudit('thread_closed', { thread_id: threadId, verdict });
  console.log(`thread-scope closed: ${threadId} — verdict=${verdict}`);
  process.exit(0);
}

console.error('thread-scope: usage — open [--ac ids] [--name s] | close [--verdict v]');
process.exit(1);

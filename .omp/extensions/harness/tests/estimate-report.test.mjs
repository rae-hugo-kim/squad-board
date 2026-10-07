// Tests for estimate-report.mjs (seed 20260918-023000-e5a1, AC6; #79 §3): a fixture audit.jsonl
// must render the bias table, the cell table and the gh-loop dispatch table deterministically.
//
// Run: node --test .omp/extensions/harness/tests/estimate-report.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEvents, renderReport } from '../estimate-report.mjs';
import { readLoopEvents } from '../gh-loop-record.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'estimate-report.mjs');

const ev = (predicted, actual, fails) => JSON.stringify({
  ts: '2026-09-18T03:00:00.000Z', event: 'estimate_vs_actual', actor: 't',
  meta: { predicted: { model: 'fable', effort: 'high', ts: '2026-09-18T02:00:00Z', ...predicted }, actual: { reason: 'r', diffSize: 10, ...actual }, fails_since_estimate: fails },
});

const dispatched = (issue, meta, ts) => JSON.stringify({ ts, event: 'gh_loop_dispatched', actor: 'assistant', meta: { issue, risk: 'medium', files: 6, depth: 'high', ac_count: 3, model: 'fable', effort: 'high', dispatched_at: ts, ...meta } });
const closed = (issue, meta, ts) => JSON.stringify({ ts, event: 'gh_loop_closed', actor: 'assistant', meta: { issue, pr: null, model: 'fable', effort: 'high', risk: 'medium', depth: 'high', files_predicted: 6, files_changed: 5, insertions: 100, deletions: 10, review_rounds: 1, verifier: 'PASS', decisions: 0, dispatched_at: ts, duration_min: 60, ...meta } });

const FIXTURE = [
  '{"ts":"2026-09-18T00:00:00Z","event":"kickoff_completed","actor":"assistant","meta":{}}',   // unrelated event
  ev({ risk: 'medium', files: 3, depth: 'high' }, { risk: 'high', files: 5 }, 1),
  ev({ risk: 'medium', files: 2, depth: 'low' }, { risk: 'medium', files: 2 }, 0),
  ev({ risk: 'low', files: 1, depth: 'low' }, { risk: 'low', files: 1 }, 0),
  ev({ risk: 'high', files: 8, depth: 'high', model: 'gpt' }, { risk: 'high', files: 4 }, 2),
  'not json at all',
  ev({ risk: 'high', files: 12, depth: 'high' }, { risk: 'high', files: 6 }, 0),
  // gh-loop: #71 dispatched twice (both counted — one row per (issue, dispatched_at)), closed for the newer dispatch with
  // PASS WITH NOTES (a pass) and later retro-closed for the older one (must not hide the newer closeout); #72 closed with
  // r3 + FAIL; #73 open (no closeout); #74 closed without any dispatch row (model carried by the closeout itself, size
  // unknown); a malformed later closeout for #74 must not supersede the valid one.
  dispatched(71, { model: 'astra', effort: 'xhigh', files: 7 }, '2026-10-02T23:00:00Z'),
  dispatched(71, { model: 'astra', effort: 'xhigh', files: 9 }, '2026-10-02T23:30:00Z'),
  closed(71, { model: 'astra', effort: 'xhigh', files_predicted: 9, files_changed: 7, insertions: 83, deletions: 41, review_rounds: 3, verifier: 'PASS WITH NOTES', decisions: 1, dispatched_at: '2026-10-02T23:30:00Z', duration_min: 40 }, '2026-10-03T00:10:00Z'),
  dispatched(72, {}, '2026-10-03T01:00:00Z'),
  closed(72, { review_rounds: 3, verifier: 'FAIL', dispatched_at: '2026-10-03T01:00:00Z', duration_min: 90 }, '2026-10-03T02:30:00Z'),
  dispatched(73, { risk: 'low', depth: 'low', files: 2 }, '2026-10-03T03:00:00Z'),
  closed(74, { model: 'opus', effort: null, risk: null, depth: null, files_predicted: null, dispatched_at: null, duration_min: null, review_rounds: 2 }, '2026-10-03T04:00:00Z'),
  '{"ts":"2026-10-03T05:00:00Z","event":"gh_loop_dispatched","actor":"assistant","meta":{"issue":"75","risk":"medium"}}',   // malformed: dropped
  '{"ts":"2026-10-03T06:00:00Z","event":"gh_loop_closed","actor":"assistant","meta":{"issue":74,"model":null}}',   // incomplete: dropped
  closed(71, { model: 'astra', effort: 'xhigh', files_predicted: 7, files_changed: 2, insertions: 5, deletions: 1, review_rounds: 1, dispatched_at: '2026-10-02T23:00:00Z', duration_min: 20 }, '2026-10-03T07:00:00Z'),   // retro close of the OLDER dispatch
].join('\n') + '\n';

const EXPECTED = `# estimate-vs-actual — 5 commit(s)

## 1. Bias — predicted (rows) × measured (columns)

| predicted \\ actual | low | medium | high | total |
|--------------------|-----|--------|------|-------|
| low                | 1   | 0      | 0    | 1     |
| medium             | 0   | 1      | 1    | 2     |
| high               | 0   | 0      | 2    | 2     |

exact-level matches: 4/5
files predicted/actual — median ratio: 1.00 over 5 commit(s) with files>0

## 2. Cells — (predicted risk, depth, model)

| risk   | depth | model | commits | FAILs after estimate |
|--------|-------|-------|---------|----------------------|
| low    | low   | fable | 1       | 0                    |
| medium | high  | fable | 1       | 1                    |
| medium | low   | fable | 1       | 0                    |
| high   | high  | fable | 1       | 0                    |
| high   | high  | gpt   | 1       | 2                    |

## 3. Dispatch — (model, risk/depth/size) — 4 dispatch(es), 4 closeout(s)

| model       | size          | dispatched | closed | review rounds (median) | verifier FAIL | decisions (median) | minutes (median) |
|-------------|---------------|------------|--------|------------------------|---------------|--------------------|------------------|
| astra:xhigh | medium/high/L | 1          | 1      | 3                      | 0             | 1                  | 40               |
| astra:xhigh | medium/high/M | 1          | 1      | 1                      | 0             | 0                  | 20               |
| fable:high  | low/low/S     | 1          | 0      | n/a                    | 0             | n/a                | n/a              |
| fable:high  | medium/high/M | 1          | 1      | 3                      | 1             | 0                  | 90               |
| opus        | unknown       | 0          | 1      | 2                      | 0             | 0                  | n/a              |
`;

const render = (text) => renderReport(readEvents(text), readLoopEvents(text));

test('readEvents: keeps only well-formed estimate_vs_actual events', () => {
  const events = readEvents(FIXTURE);
  assert.equal(events.length, 5);
  assert.ok(events.every((e) => e.event === 'estimate_vs_actual'));
});

test('renderReport: the fixture renders the expected tables byte-for-byte', () => {
  assert.equal(render(FIXTURE), EXPECTED);
});

test('readEvents/renderReport: prototype-named risk strings neither pass the shape check nor corrupt the tables', () => {
  // predicted.risk outside LEVELS is dropped at readEvents.
  const badP = JSON.stringify({ event: 'estimate_vs_actual', meta: { predicted: { risk: '__proto__', files: 1, depth: 'low', model: 'm' }, actual: { risk: 'low', files: 1 } } });
  assert.equal(readEvents(FIXTURE + badP + '\n').length, 5);
  // actual.risk is a free string (risk-assess may say unknown/none): '__proto__' must render as a
  // plain extra column with a count of 1, never as inherited object members.
  const badA = ev({ risk: 'low', files: 1, depth: 'low' }, { risk: '__proto__', files: 1 }, 0);
  const out = render(FIXTURE + badA + '\n');
  assert.match(out, /\| predicted \\ actual \| low \| medium \| high \| __proto__ \| total \|/);
  assert.match(out, /\| low +\| 1 +\| 0 +\| 0 +\| 1 +\| 2 +\|/);
  assert.doesNotMatch(out, /\[object Object\]|NaN/);
});

test('renderReport: empty input renders headers with no rows', () => {
  const out = renderReport([]);
  assert.match(out, /^# estimate-vs-actual — 0 commit\(s\)/);
  assert.match(out, /median ratio: n\/a over 0 commit/);
  assert.match(out, /## 3\. Dispatch — \(model, risk\/depth\/size\) — 0 dispatch\(es\), 0 closeout\(s\)\n\n\| model \| size \| dispatched \| closed \|[^\n]*\n\|[-|]+\|\n$/);
});

test('CLI: prints the report for a given audit path and fails on a missing file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'estrep-'));
  const p = join(dir, 'audit.jsonl');
  writeFileSync(p, FIXTURE);
  const ok = spawnSync(process.execPath, [SCRIPT, p], { encoding: 'utf-8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout, EXPECTED);
  const missing = spawnSync(process.execPath, [SCRIPT, join(dir, 'nope.jsonl')], { encoding: 'utf-8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /cannot read/);
});

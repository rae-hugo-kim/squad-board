#!/usr/bin/env node
// estimate-report.mjs — read `estimate_vs_actual` events out of docs/harness/audit.jsonl and print
// the tables a human reads before touching .omp/rules/harness-agent_routing.md (seed 20260918-023000-e5a1,
// AC6; .omp/rules/harness-cycle_definition.md "예상 레코드"):
//
//   1. Bias table   — predicted risk × measured risk cross-tab, plus the median of
//                     predicted_files / actual_files (how far off the file-count guesses run).
//   2. Cell table   — (predicted risk, depth, model) groups: commit count and summed
//                     fails_since_estimate.
//   3. Dispatch     — gh-loop `gh_loop_dispatched` ⋈ `gh_loop_closed` on (issue, dispatched_at) (#79):
//                     per (model:effort, risk/depth/size) cell the dispatch and closeout counts, median
//                     review rounds, verifier FAIL count (any verdict not starting with PASS — so
//                     PASS WITH NOTES is a pass), median decision round-trips and median
//                     dispatch→closeout minutes. The data for retuning gh-loop-record's rule table.
//
// No thresholds, no recommendations: the tables are raw material. Reading + rendering are pure
// (readEvents / renderReport) so a fixture pins the output byte-for-byte.
//
// CLI: node .omp/extensions/harness/estimate-report.mjs [path/to/audit.jsonl]
//      (default: docs/harness/audit.jsonl under the cwd)

import { readFileSync, realpathSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { readLoopEvents, byDispatch, sizeBucket } from './gh-loop-record.mjs';

export const LEVELS = ['low', 'medium', 'high', 'critical'];

const isLevel = (v) => LEVELS.includes(v);

/** Parse audit JSONL text into the well-formed estimate_vs_actual events it holds. A line that is
 *  not JSON, not this event, or whose predicted/actual fields are not the gate's shape is skipped —
 *  a hand-edited audit line must not corrupt the tables (only `actual.risk` may be an unknown
 *  level: risk-assess reports `unknown`/`none` on odd repos). */
export function readEvents(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let e;
    try { e = JSON.parse(t); } catch { continue; }
    if (!e || e.event !== 'estimate_vs_actual' || !e.meta) continue;
    const p = e.meta.predicted;
    const a = e.meta.actual;
    if (!p || typeof p !== 'object' || !a || typeof a !== 'object') continue;
    if (!isLevel(p.risk) || typeof p.depth !== 'string' || typeof p.model !== 'string') continue;
    if (typeof a.risk !== 'string') continue;
    out.push(e);
  }
  return out;
}

function median(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function table(header, rows) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const fmt = (r) => '| ' + r.map((c, i) => String(c).padEnd(widths[i])).join(' | ') + ' |';
  return [fmt(header), '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|', ...rows.map(fmt)].join('\n');
}

/** Render the tables from events (+ the gh-loop dispatch/closeout rows). Deterministic for a given input. */
export function renderReport(events, loop = { dispatched: [], closed: [] }) {
  const lines = [`# estimate-vs-actual — ${events.length} commit(s)`, ''];

  // 1. bias: predicted × actual
  // Maps, not object literals: `actual.risk` is a free string from audit.jsonl ('__proto__' or
  // 'constructor' would resolve to inherited members on a plain object and corrupt the counts).
  const cross = new Map();
  const actualLevels = new Set();
  const ratios = [];
  for (const e of events) {
    const p = e.meta.predicted.risk;
    const a = e.meta.actual.risk;
    actualLevels.add(a);
    if (!cross.has(p)) cross.set(p, new Map());
    const row = cross.get(p);
    row.set(a, (row.get(a) ?? 0) + 1);
    const pf = e.meta.predicted.files;
    const af = e.meta.actual.files;
    if (Number.isFinite(pf) && Number.isFinite(af) && af > 0) ratios.push(pf / af);
  }
  const cols = [...LEVELS.filter((l) => actualLevels.has(l)), ...[...actualLevels].filter((l) => !LEVELS.includes(l)).sort()];
  lines.push('## 1. Bias — predicted (rows) × measured (columns)', '');
  lines.push(table(['predicted \\ actual', ...cols, 'total'],
    LEVELS.filter((l) => cross.has(l)).map((p) => {
      const row = cols.map((a) => cross.get(p).get(a) ?? 0);
      return [p, ...row, row.reduce((x, y) => x + y, 0)];
    })));
  const exact = events.filter((e) => e.meta.predicted.risk === e.meta.actual.risk).length;
  lines.push('', `exact-level matches: ${exact}/${events.length}`);
  const m = median(ratios);
  lines.push(`files predicted/actual — median ratio: ${m === null ? 'n/a' : m.toFixed(2)} over ${ratios.length} commit(s) with files>0`, '');

  // 2. cells: (predicted risk, depth, model)
  const cells = new Map();
  for (const e of events) {
    const { risk, depth, model } = e.meta.predicted;
    const key = `${risk}\u0000${depth}\u0000${model}`;
    const c = cells.get(key) ?? { risk, depth, model, n: 0, fails: 0 };
    c.n += 1;
    c.fails += Number.isFinite(e.meta.fails_since_estimate) ? e.meta.fails_since_estimate : 0;
    cells.set(key, c);
  }
  const order = (c) => `${LEVELS.indexOf(c.risk)}\u0000${c.depth}\u0000${c.model}`;
  lines.push('## 2. Cells — (predicted risk, depth, model)', '');
  lines.push(table(['risk', 'depth', 'model', 'commits', 'FAILs after estimate'],
    [...cells.values()].sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0))
      .map((c) => [c.risk, c.depth, c.model, c.n, c.fails])));
  lines.push('');

  // 3. dispatch: (model:effort, risk/depth/size) ← one row per (issue, dispatched_at) on both sides —
  // the key the CLI's idempotency uses, so a re-dispatch counts as a second dispatch and a retro
  // closeout for an older dispatch never hides the newer dispatch's closeout.
  const dispatched = byDispatch(loop.dispatched);
  const closed = byDispatch(loop.closed);
  const modelKey = (m) => (m.effort ? `${m.model}:${m.effort}` : String(m.model));
  const sizeKey = (m) => (m.risk && m.depth && Number.isInteger(m.files_predicted ?? m.files) ? `${m.risk}/${m.depth}/${sizeBucket(m.files_predicted ?? m.files)}` : 'unknown');
  const dcells = new Map();
  const cell = (m) => {
    const key = `${modelKey(m)}\u0000${sizeKey(m)}`;
    if (!dcells.has(key)) dcells.set(key, { model: modelKey(m), size: sizeKey(m), dispatched: 0, closed: 0, rounds: [], fails: 0, decisions: [], minutes: [] });
    return dcells.get(key);
  };
  for (const m of dispatched) cell(m).dispatched += 1;
  for (const m of closed) {
    const c = cell(m);
    c.closed += 1;
    c.rounds.push(m.review_rounds);
    if (!/^PASS\b/.test(m.verifier)) c.fails += 1;   // PASS / PASS WITH NOTES pass; everything else is a FAIL
    c.decisions.push(m.decisions);
    if (m.duration_min !== null) c.minutes.push(m.duration_min);
  }
  const med = (xs) => { const v = median(xs); return v === null ? 'n/a' : Number.isInteger(v) ? String(v) : v.toFixed(1); };
  lines.push(`## 3. Dispatch — (model, risk/depth/size) — ${dispatched.length} dispatch(es), ${closed.length} closeout(s)`, '');
  lines.push(table(['model', 'size', 'dispatched', 'closed', 'review rounds (median)', 'verifier FAIL', 'decisions (median)', 'minutes (median)'],
    [...dcells.values()].sort((a, b) => (a.model < b.model ? -1 : a.model > b.model ? 1 : a.size < b.size ? -1 : a.size > b.size ? 1 : 0))
      .map((c) => [c.model, c.size, c.dispatched, c.closed, med(c.rounds), c.fails, med(c.decisions), med(c.minutes)])));
  lines.push('');
  return lines.join('\n');
}

const isMain = (() => {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();

if (isMain) {
  const path = process.argv[2] || join(process.cwd(), 'docs', 'harness', 'audit.jsonl');
  let text;
  try { text = readFileSync(path, 'utf-8'); }
  catch (e) { console.error(`estimate-report: cannot read ${path} (${e.message})`); process.exit(1); }
  process.stdout.write(renderReport(readEvents(text), readLoopEvents(text)));
}

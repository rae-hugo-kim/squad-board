// Tests for gh-loop-record.mjs (issue #79): the dispatch tuple, the two audit events whose schema
// the estimate report consumes, the size-based recommendation table, and the CLI seams the gh-loop
// skill calls (dispatch --out, ingest idempotency, close joining the dispatch row).
//
// Run: node --test .omp/extensions/harness/tests/gh-loop-record.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DISPATCH_MAGIC, buildDispatchTuple, parseDispatch, findDispatchTuples, sizeBucket, recommendTier,
  renderRecommendation, renderDispatchComment, buildDispatchEvent, buildCloseoutEvent, readLoopEvents, findDispatch, byDispatch, parseArgs,
} from '../gh-loop-record.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'gh-loop-record.mjs');
function runCli(args, env = {}) {
  try { return { code: 0, out: execFileSync('node', [CLI, ...args], { encoding: 'utf-8', env: { ...process.env, ...env } }) }; }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') }; }
}

const FIELDS = { issue: 79, risk: 'medium', files: 8, depth: 'high', ac_count: 4, model: 'anthropic/claude-fable-5-1', effort: 'high', ts: '2026-10-03T14:09:58Z' };
const VALID = [DISPATCH_MAGIC, 79, 'medium', 8, 'high', 4, 'anthropic/claude-fable-5-1', 'high', '2026-10-03T14:09:58Z'];
const ROLES = { smol: 'a/x:medium', default: 'a/x:high', slow: 'a/y:high', plan: 'a/y:xhigh' };

test('buildDispatchTuple/parseDispatch round-trip the 9-element tuple', () => {
  assert.deepEqual(buildDispatchTuple(FIELDS), VALID);
  const { fields, problems } = parseDispatch(JSON.stringify(VALID));
  assert.deepEqual(problems, []);
  assert.deepEqual(fields, FIELDS);
});

test('parseDispatch: effort may be null, files/ac_count may be 0', () => {
  const t = [...VALID]; t[3] = 0; t[5] = 0; t[7] = null;
  const { fields, problems } = parseDispatch(JSON.stringify(t));
  assert.deepEqual(problems, []);
  assert.equal(fields.effort, null);
  assert.equal(fields.files, 0);
  assert.equal(fields.ac_count, 0);
});

test('parseDispatch: malformed tuples are rejected with a named problem and no fields', () => {
  const cases = [
    ['not json', 'garbage', /not valid JSON/],
    ['object form', JSON.stringify({ issue: 79 }), /not a JSON array/],
    ['wrong arity (estimate tuple)', JSON.stringify(['omp-estimate/v1', 'medium', 3, 'high', 'm', 'high', '2026-10-03T14:09:58Z']), /wrong arity/],
    ['wrong magic', JSON.stringify(['omp-dispatch/v0', ...VALID.slice(1)]), /element 0/],
    ['issue 0', JSON.stringify([VALID[0], 0, ...VALID.slice(2)]), /element 1 \(issue\)/],
    ['issue as string', JSON.stringify([VALID[0], '79', ...VALID.slice(2)]), /element 1 \(issue\)/],
    ['bad risk', JSON.stringify([...VALID.slice(0, 2), 'severe', ...VALID.slice(3)]), /element 2 \(risk\)/],
    ['negative files', JSON.stringify([...VALID.slice(0, 3), -1, ...VALID.slice(4)]), /element 3 \(files\)/],
    ['bad depth', JSON.stringify([...VALID.slice(0, 4), 'medium', ...VALID.slice(5)]), /element 4 \(depth\)/],
    ['fractional ac_count', JSON.stringify([...VALID.slice(0, 5), 1.5, ...VALID.slice(6)]), /element 5 \(ac_count\)/],
    ['empty model', JSON.stringify([...VALID.slice(0, 6), '', ...VALID.slice(7)]), /element 6 \(model\)/],
    ['empty effort', JSON.stringify([...VALID.slice(0, 7), ' ', VALID[8]]), /element 7 \(effort\)/],
    ['ts without zone', JSON.stringify([...VALID.slice(0, 8), '2026-10-03T14:09:58']), /element 8 \(ts\)/],
    ['ts calendar overflow', JSON.stringify([...VALID.slice(0, 8), '2026-02-30T00:00:00Z']), /element 8 \(ts\)/],
  ];
  for (const [name, text, re] of cases) {
    const { fields, problems } = parseDispatch(text);
    assert.equal(fields, null, `${name}: fields must be null`);
    assert.ok(problems.some((p) => re.test(p)), `${name}: expected ${re}, got ${JSON.stringify(problems)}`);
  }
});

test('findDispatchTuples: every valid inline-code tuple in comment text; prose candidates skipped; malformed surfaced only when nothing is valid', () => {
  const comment = renderDispatchComment(FIELDS);
  assert.match(comment, /^gh-loop dispatch 모델: anthropic\/claude-fable-5-1 \/ thinking: high\n<!-- gh-loop:model:anthropic\/claude-fable-5-1:high -->\n`\[/);
  assert.deepEqual(findDispatchTuples(comment), { tuples: [FIELDS], problems: [] });
  // Two comments concatenated (re-dispatch) → both tuples, in order.
  const second = { ...FIELDS, model: 'other', ts: '2026-10-03T16:00:00Z' };
  assert.deepEqual(findDispatchTuples(comment + renderDispatchComment(second)).tuples, [FIELDS, second]);
  // No tuple at all → empty, no problems.
  assert.deepEqual(findDispatchTuples('gh-loop dispatch 모델: x / thinking: y\n<!-- gh-loop:model:x:y -->\n'), { tuples: [], problems: [] });
  // A prose line that starts with `[` and mentions the magic is not JSON → ignored, the valid tuple after it still counts.
  assert.deepEqual(findDispatchTuples('[omp-dispatch/v1 tuple below]\n' + comment).tuples, [FIELDS]);
  // Only a malformed tuple → its problems are surfaced so ingest can name them.
  const bad = findDispatchTuples('`["omp-dispatch/v1", 79]`');
  assert.deepEqual(bad.tuples, []);
  assert.match(bad.problems[0], /wrong arity/);
});

test('renderDispatchComment: null effort drops the :level suffix from the marker', () => {
  const c = renderDispatchComment({ ...FIELDS, effort: null });
  assert.match(c, /<!-- gh-loop:model:anthropic\/claude-fable-5-1 -->/);
  assert.match(c, /thinking: \(모델 기본\)/);
});

test('sizeBucket: S ≤ 3, M 4–8, L ≥ 9', () => {
  assert.deepEqual([0, 3, 4, 8, 9, 40].map(sizeBucket), ['S', 'S', 'M', 'M', 'L', 'L']);
});

// The rule table itself — pinned so a retune is a visible diff, never an accidental drift.
test('recommendTier: risk × depth × files bucket → tier', () => {
  const cases = [
    [{ risk: 'low', depth: 'low', files: 2 }, 'smol'],
    [{ risk: 'low', depth: 'low', files: 5 }, 'default'],
    [{ risk: 'medium', depth: 'low', files: 1 }, 'default'],
    [{ risk: 'medium', depth: 'low', files: 12 }, 'slow'],
    [{ risk: 'high', depth: 'low', files: 1 }, 'slow'],
    [{ risk: 'low', depth: 'high', files: 2 }, 'slow'],
    [{ risk: 'medium', depth: 'high', files: 8 }, 'slow'],
    [{ risk: 'medium', depth: 'high', files: 9 }, 'plan'],
    [{ risk: 'high', depth: 'high', files: 1 }, 'plan'],
    [{ risk: 'critical', depth: 'low', files: 1 }, 'plan'],
  ];
  for (const [input, tier] of cases) assert.equal(recommendTier(input).tier, tier, JSON.stringify(input));
});

test('renderRecommendation: one line with the modelRoles id, or the missing role named', () => {
  assert.equal(renderRecommendation({ risk: 'medium', depth: 'high', files: 8 }, ROLES),
    '규모 기반 추천: a/y:high (slow — deep reasoning; risk medium × depth high × files 8 [M])');
  assert.equal(renderRecommendation({ risk: 'low', depth: 'low', files: 1 }, {}),
    '규모 기반 추천: <modelRoles.smol 미설정> (smol — low risk, small, shallow; risk low × depth low × files 1 [S])');
});

// Event schemas: estimate-report §3 reads exactly these keys.
test('buildDispatchEvent: gh_loop_dispatched row shape', () => {
  assert.deepEqual(buildDispatchEvent(FIELDS, 'assistant', '2026-10-03T15:00:00Z'), {
    ts: '2026-10-03T15:00:00Z', event: 'gh_loop_dispatched', actor: 'assistant',
    meta: { issue: 79, risk: 'medium', files: 8, depth: 'high', ac_count: 4, model: 'anthropic/claude-fable-5-1', effort: 'high', dispatched_at: '2026-10-03T14:09:58Z' },
  });
});

test('buildCloseoutEvent: gh_loop_closed row shape, joined with the dispatch meta and timed from it', () => {
  const dispatched = buildDispatchEvent(FIELDS, 'assistant', '2026-10-03T15:00:00Z').meta;
  const actual = { issue: 79, pr: 81, files_changed: 9, insertions: 400, deletions: 20, review_rounds: 2, verifier: 'PASS', decisions: 1 };
  assert.deepEqual(buildCloseoutEvent(actual, dispatched, 'assistant', '2026-10-03T17:30:00Z'), {
    ts: '2026-10-03T17:30:00Z', event: 'gh_loop_closed', actor: 'assistant',
    meta: {
      issue: 79, pr: 81, model: 'anthropic/claude-fable-5-1', effort: 'high', risk: 'medium', depth: 'high', files_predicted: 8,
      files_changed: 9, insertions: 400, deletions: 20, review_rounds: 2, verifier: 'PASS', decisions: 1,
      dispatched_at: '2026-10-03T14:09:58Z', duration_min: 200,
    },
  });
  // No dispatch row: predicted fields are null, duration unknown unless --dispatched-at is supplied.
  const bare = buildCloseoutEvent(actual, null, 'assistant', '2026-10-03T17:30:00Z').meta;
  assert.equal(bare.model, null);
  assert.equal(bare.risk, null);
  assert.equal(bare.files_predicted, null);
  assert.equal(bare.duration_min, null);
  const retro = buildCloseoutEvent({ ...actual, model: 'm', effort: 'e', dispatched_at: '2026-10-03T17:00:00Z' }, null, 'assistant', '2026-10-03T17:30:00Z').meta;
  assert.equal(retro.model, 'm');
  assert.equal(retro.duration_min, 30);
});

test('readLoopEvents: only rows with the exact event shapes; a malformed closeout cannot supersede a valid one', () => {
  const validClosed = buildCloseoutEvent({ issue: 79, files_changed: 1, insertions: 1, deletions: 0, review_rounds: 1, verifier: 'PASS', decisions: 0 }, null, 'a', '2026-10-03T17:00:00Z');
  const rows = [
    JSON.stringify(buildDispatchEvent(FIELDS, 'a', '2026-10-03T15:00:00Z')),
    JSON.stringify(buildDispatchEvent({ ...FIELDS, model: 'other', ts: '2026-10-03T16:00:00Z' }, 'a', '2026-10-03T16:00:00Z')),
    JSON.stringify({ event: 'gh_loop_dispatched', meta: { issue: 'x', risk: 'medium' } }),   // bad issue
    JSON.stringify({ event: 'gh_loop_dispatched', meta: { ...FIELDS, ts: undefined, dispatched_at: '2026-10-03T16:00' } }),   // ts without zone
    JSON.stringify({ event: 'gh_loop_dispatched', meta: { ...FIELDS, ts: undefined, dispatched_at: FIELDS.ts, risk: 'severe' } }),   // bad risk
    JSON.stringify(validClosed),
    JSON.stringify({ event: 'gh_loop_closed', meta: { issue: 79, model: null } }),   // incomplete closeout
    JSON.stringify({ event: 'gh_loop_closed', meta: { ...validClosed.meta, effort: { toString: null } } }),   // non-primitive effort
    JSON.stringify({ event: 'gh_loop_closed', meta: { ...validClosed.meta, verifier: '' } }),   // empty verdict
    JSON.stringify({ event: 'gh_loop_closed', meta: { ...validClosed.meta, review_rounds: 'three' } }),   // ill-typed metric
    JSON.stringify({ event: 'gh_loop_closed', meta: [] }),   // array meta
    'not json',
  ].join('\n') + '\n';
  const { dispatched, closed } = readLoopEvents(rows);
  assert.equal(dispatched.length, 2);
  assert.deepEqual(closed.map((e) => e.meta), [validClosed.meta]);
});

test('findDispatch: latest dispatched_at per issue (not append order) by default; exact dispatched_at match (or null) when asked', () => {
  const { dispatched } = readLoopEvents([
    JSON.stringify(buildDispatchEvent({ ...FIELDS, model: 'new', files: 9, ts: '2026-10-03T16:00:00Z' }, 'a', '2026-10-03T16:00:00Z')),
    JSON.stringify(buildDispatchEvent({ ...FIELDS, model: 'old', files: 1 }, 'a', '2026-10-03T16:30:00Z')),   // backfilled later, older dispatched_at
  ].join('\n'));
  assert.equal(findDispatch(dispatched, 79).model, 'new');
  assert.equal(findDispatch(dispatched, 80), null);
  assert.equal(findDispatch(dispatched, 79, '2026-10-03T14:09:58Z').model, 'old');
  assert.equal(findDispatch(dispatched, 79, '2026-10-03T16:00:00Z').model, 'new');
  assert.equal(findDispatch(dispatched, 79, '2026-10-03T12:00:00Z'), null, 'an unmatched timestamp inherits nothing');
});

test('byDispatch: one meta per (issue, dispatched_at), last row wins for a repeated key', () => {
  const a = buildDispatchEvent(FIELDS, 'a', '2026-10-03T15:00:00Z');
  const b = buildDispatchEvent({ ...FIELDS, ts: '2026-10-03T16:00:00Z' }, 'a', '2026-10-03T16:00:00Z');
  const a2 = buildDispatchEvent({ ...FIELDS, model: 'again' }, 'a', '2026-10-03T17:00:00Z');   // same key as a
  assert.deepEqual(byDispatch([a, b, a2]).map((m) => [m.dispatched_at, m.model]), [['2026-10-03T14:09:58Z', 'again'], ['2026-10-03T16:00:00Z', 'anthropic/claude-fable-5-1']]);
});

test('parseArgs: mode first; every flag needs one non-empty value; --flag values, unknown tokens, empty values and off-mode flags are errors', () => {
  assert.deepEqual(parseArgs(['dispatch', '--issue', '79', '--model', 'm', '--effort', 'high']), { mode: 'dispatch', opts: { issue: 79, model: 'm', effort: 'high' }, errors: [] });
  assert.deepEqual(parseArgs(['dispatch', '--model', '--effort', 'high']).errors, ['--model needs a non-empty value']);
  assert.deepEqual(parseArgs(['dispatch', '--out']).errors, ['--out needs a non-empty value']);
  assert.deepEqual(parseArgs(['close', '--audit', '']).errors, ['--audit needs a non-empty value']);
  assert.deepEqual(parseArgs(['close', '--model', '  ']).errors, ['--model needs a non-empty value']);
  assert.deepEqual(parseArgs(['recommend', '--unknown', 'v']).errors, ['unknown argument "--unknown"', 'unknown argument "v"']);
  assert.deepEqual(parseArgs(['recommend', 'constructor', 'toString']).errors, ['unknown argument "constructor"', 'unknown argument "toString"']);
  assert.deepEqual(parseArgs(['close', '--ts', 'x']).errors, ['--ts is not a close flag']);
  assert.deepEqual(parseArgs(['--issue', '1']).errors.slice(0, 1), ['unknown mode "--issue"']);
  assert.deepEqual(parseArgs([]).errors, ['unknown mode ""']);
});

test('CLI dispatch --out: writes model.md (marker + tuple), tuple and recommendation; rejects bad fields', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ghrec-'));
  try {
    const r = runCli(['dispatch', '--issue', '79', '--risk', 'medium', '--files', '8', '--depth', 'high', '--ac-count', '4',
      '--model', 'anthropic/claude-fable-5-1', '--effort', 'high', '--ts', '2026-10-03T14:09:58Z', '--roles-json', JSON.stringify(ROLES), '--out', dir]);
    assert.equal(r.code, 0, r.out);
    const out = JSON.parse(r.out);
    assert.deepEqual(out.tuple, VALID);
    assert.equal(readFileSync(join(dir, 'model.md'), 'utf-8'), renderDispatchComment(FIELDS));
    assert.equal(readFileSync(join(dir, 'tuple'), 'utf-8'), JSON.stringify(VALID) + '\n');
    assert.equal(readFileSync(join(dir, 'recommendation'), 'utf-8'), renderRecommendation(FIELDS, ROLES) + '\n');
    const bad = runCli(['dispatch', '--issue', '79', '--risk', 'severe', '--files', '8', '--depth', 'high', '--ac-count', '4', '--model', 'm']);
    assert.equal(bad.code, 1);
    assert.match(bad.out, /invalid dispatch fields — element 2 \(risk\)/);
    const badRoles = runCli(['recommend', '--risk', 'low', '--depth', 'low', '--files', '1', '--roles-json', '[1]']);
    assert.equal(badRoles.code, 1);
    assert.match(badRoles.out, /invalid --roles-json/);
    // Fail-closed argument parsing: a swallowed flag must never become a model id, an empty --audit
    // must not fall back to the tracked ledger, and a valueless --out must not pass.
    const swallowed = runCli(['dispatch', '--issue', '79', '--risk', 'low', '--files', '1', '--depth', 'low', '--ac-count', '1', '--model', '--effort', 'high']);
    assert.equal(swallowed.code, 1);
    assert.match(swallowed.out, /--model needs a non-empty value/);
    const noOut = runCli(['dispatch', '--issue', '79', '--risk', 'low', '--files', '1', '--depth', 'low', '--ac-count', '1', '--model', 'm', '--out']);
    assert.equal(noOut.code, 1);
    assert.match(noOut.out, /--out needs a non-empty value/);
    const emptyAudit = runCli(['close', '--issue', '1', '--files-changed', '1', '--insertions', '1', '--deletions', '0', '--review-rounds', '1', '--verifier', 'PASS', '--decisions', '0', '--audit', '']);
    assert.equal(emptyAudit.code, 1);
    assert.match(emptyAudit.out, /--audit needs a non-empty value/);
    const unknown = runCli(['recommend', '--risk', 'low', '--depth', 'low', '--files', '1', '--unknown', 'v']);
    assert.equal(unknown.code, 1);
    assert.match(unknown.out, /unknown argument "--unknown"/);
    const noMode = runCli(['--issue', '1']);
    assert.equal(noMode.code, 1);
    assert.match(noMode.out, /usage/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI recommend: prints the single line', () => {
  const r = runCli(['recommend', '--risk', 'high', '--depth', 'high', '--files', '3', '--roles-json', JSON.stringify(ROLES)]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, '규모 기반 추천: a/y:xhigh (plan — deep reasoning on a high-risk change; risk high × depth high × files 3 [S])\n');
});

test('CLI ingest → close: appends once each (idempotent on issue + dispatched_at), close joins the dispatch row', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ghrec-'));
  try {
    const audit = join(dir, 'audit.jsonl');
    const comment = join(dir, 'model.md');
    writeFileSync(comment, renderDispatchComment(FIELDS));
    // A ledger without a trailing newline must not have the new row glued onto its last line.
    writeFileSync(audit, '{"ts":"2026-10-03T00:00:00Z","event":"kickoff_completed","actor":"assistant","meta":{}}');
    const a = runCli(['ingest', '--issue', '79', '--comment-file', comment, '--audit', audit], { GHLOOP_RECORD_NOW: '2026-10-03T15:00:00Z' });
    assert.equal(a.code, 0, a.out);
    assert.match(a.out, /gh_loop_dispatched #79 anthropic\/claude-fable-5-1:high \(medium\/high\/8 files, 4 AC\)/);
    const b = runCli(['ingest', '--issue', '79', '--comment-file', comment, '--audit', audit], { GHLOOP_RECORD_NOW: '2026-10-03T15:05:00Z' });
    assert.equal(b.code, 0, b.out);
    assert.match(b.out, /already recorded — skipped/);
    const c = runCli(['close', '--issue', '79', '--files-changed', '9', '--insertions', '400', '--deletions', '20', '--review-rounds', '2', '--verifier', 'PASS', '--decisions', '0', '--audit', audit], { GHLOOP_RECORD_NOW: '2026-10-03T17:30:00Z' });
    assert.equal(c.code, 0, c.out);
    assert.match(c.out, /gh_loop_closed #79 anthropic\/claude-fable-5-1 — 9 files \+400\/-20, r2, verifier PASS, 0 decision\(s\), 200 min/);
    const d = runCli(['close', '--issue', '79', '--files-changed', '9', '--insertions', '400', '--deletions', '20', '--review-rounds', '2', '--verifier', 'PASS', '--decisions', '0', '--audit', audit], { GHLOOP_RECORD_NOW: '2026-10-03T17:31:00Z' });
    assert.equal(d.code, 0, d.out);
    assert.match(d.out, /already recorded — skipped/);
    const lines = readFileSync(audit, 'utf-8').split('\n');
    assert.equal(lines.length, 4, 'kickoff + dispatched + closed + trailing newline');
    assert.equal(lines[3], '');
    assert.deepEqual(JSON.parse(lines[1]), buildDispatchEvent(FIELDS, 'assistant', '2026-10-03T15:00:00Z'));
    assert.deepEqual(JSON.parse(lines[2]).meta, {
      issue: 79, pr: null, model: 'anthropic/claude-fable-5-1', effort: 'high', risk: 'medium', depth: 'high', files_predicted: 8,
      files_changed: 9, insertions: 400, deletions: 20, review_rounds: 2, verifier: 'PASS', decisions: 0,
      dispatched_at: '2026-10-03T14:09:58Z', duration_min: 200,
    });
    // Missing required close flags and a comment without a tuple fail with a named reason.
    const e = runCli(['close', '--issue', '79', '--audit', audit]);
    assert.equal(e.code, 1);
    assert.match(e.out, /close needs --files-changed, --insertions, --deletions, --review-rounds, --decisions, --verifier/);
    writeFileSync(comment, 'no tuple here\n');
    const f = runCli(['ingest', '--issue', '79', '--comment-file', comment, '--audit', audit]);
    assert.equal(f.code, 1);
    assert.match(f.out, /no omp-dispatch\/v1 tuple/);
    writeFileSync(comment, '`["omp-dispatch/v1", 79]`\n');
    const g = runCli(['ingest', '--issue', '79', '--comment-file', comment, '--audit', audit]);
    assert.equal(g.code, 1);
    assert.match(g.out, /malformed dispatch tuple — wrong arity/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI close: --dispatched-at joins only the matching dispatch; a close without any dispatch is idempotent on the issue', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ghrec-'));
  try {
    const audit = join(dir, 'audit.jsonl');
    const comments = join(dir, 'comments.md');
    // Re-dispatch: two tuples for #1 in one comment dump → both recorded by one ingest; a quoted
    // tuple naming #2 is ignored (issue binding), and ingest without --issue is refused.
    const old = { ...FIELDS, issue: 1, model: 'old', risk: 'low', files: 1, ts: '2026-10-03T10:00:00Z' };
    const fresh = { ...FIELDS, issue: 1, model: 'new', risk: 'high', files: 9, ts: '2026-10-03T12:00:00Z' };
    writeFileSync(comments, renderDispatchComment(old) + renderDispatchComment({ ...FIELDS, issue: 2 }) + renderDispatchComment(fresh));
    const noIssue = runCli(['ingest', '--comment-file', comments, '--audit', audit]);
    assert.equal(noIssue.code, 1);
    assert.match(noIssue.out, /ingest needs --issue N/);
    const a = runCli(['ingest', '--issue', '1', '--comment-file', comments, '--audit', audit], { GHLOOP_RECORD_NOW: '2026-10-03T12:30:00Z' });
    assert.equal(a.code, 0, a.out);
    assert.equal((a.out.match(/gh_loop_dispatched #1 /g) || []).length, 2);
    assert.match(a.out, /tuple for #2 @ 2026-10-03T14:09:58Z ignored — ingesting #1/);
    const other = runCli(['ingest', '--issue', '3', '--comment-file', comments, '--audit', audit]);
    assert.equal(other.code, 1);
    assert.match(other.out, /no omp-dispatch\/v1 tuple for #3/);
    const base = ['--files-changed', '1', '--insertions', '1', '--deletions', '0', '--review-rounds', '1', '--verifier', 'PASS', '--decisions', '0', '--audit', audit];
    // Retro close bound to the OLD dispatch: its own model/risk/size, duration from its own ts.
    const retro = runCli(['close', '--issue', '1', '--dispatched-at', '2026-10-03T10:00:00Z', ...base], { GHLOOP_RECORD_NOW: '2026-10-03T11:00:00Z' });
    assert.equal(retro.code, 0, retro.out);
    const rows = readFileSync(audit, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(rows[2].meta, {
      issue: 1, pr: null, model: 'old', effort: 'high', risk: 'low', depth: 'high', files_predicted: 1,
      files_changed: 1, insertions: 1, deletions: 0, review_rounds: 1, verifier: 'PASS', decisions: 0,
      dispatched_at: '2026-10-03T10:00:00Z', duration_min: 60,
    });
    // An unmatched --dispatched-at inherits nothing from the issue's other dispatches.
    const unmatched = runCli(['close', '--issue', '1', '--dispatched-at', '2026-10-03T09:00:00Z', ...base], { GHLOOP_RECORD_NOW: '2026-10-03T09:30:00Z' });
    assert.equal(unmatched.code, 0, unmatched.out);
    const um = readFileSync(audit, 'utf-8').trim().split('\n').map((l) => JSON.parse(l))[3].meta;
    assert.equal(um.model, null);
    assert.equal(um.risk, null);
    assert.equal(um.files_predicted, null);
    assert.equal(um.duration_min, 30);
    // No dispatch at all for #5: first close appends, second is a re-run → skipped.
    const n1 = runCli(['close', '--issue', '5', ...base]);
    assert.equal(n1.code, 0, n1.out);
    const n2 = runCli(['close', '--issue', '5', ...base]);
    assert.equal(n2.code, 0, n2.out);
    assert.match(n2.out, /\(dispatch none\) already recorded — skipped/);
    assert.equal(readFileSync(audit, 'utf-8').trim().split('\n').length, 5, '2 dispatched + 3 closed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

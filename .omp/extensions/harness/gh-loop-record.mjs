#!/usr/bin/env node
// gh-loop-record.mjs — gh-loop dispatch / closeout records (issue #79; .omp/rules/harness-cycle_definition.md
// "예상 레코드" companion). Observation only: nothing here reads or influences a gate verdict, and no
// model is ever chosen automatically — the user picks the worker model every time (2026-10-02 decision).
//
// Two audit events, both appended to docs/harness/audit.jsonl by the WORKER (the coordinator never
// touches the tree — Non-Negotiables in .omp/skills/gh-loop/SKILL.md):
//
//   gh_loop_dispatched — what the coordinator predicted when it picked the model. The coordinator
//     leaves ONE strict positional tuple in the model-marker issue comment,
//       ["omp-dispatch/v1", <issue>, <risk>, <files>, <depth>, <ac_count>, <model>, <effort>, <ts>]
//     and the worker ingests it at start (`ingest`) — so the record rides in the worker's seed commit.
//   gh_loop_closed — what actually happened, written by the worker at closeout (`close`): changed
//     files/lines, review rounds, verifier verdict, decision round-trips, dispatch→closeout minutes.
//
// Plus a size-based RECOMMENDATION line the coordinator appends to the `ask` options
// (`recommend`): a plain rule table (risk × depth × files bucket → modelRoles tier). It is text
// only — no default, no auto-pick; `estimate-report.mjs` §3 is the data for retuning the table.
//
// CLI (for the skill):
//   node gh-loop-record.mjs dispatch  --issue N --risk r --files n --depth d --ac-count n --model m [--effort e] [--ts iso] [--roles-json J] [--out dir]
//   node gh-loop-record.mjs recommend --risk r --depth d --files n [--roles-json J]
//   node gh-loop-record.mjs ingest    --issue N --comment-file f [--audit path]
//   node gh-loop-record.mjs close     --issue N --files-changed n --insertions n --deletions n --review-rounds n --verifier V --decisions n
//                                     [--pr M] [--model m] [--effort e] [--dispatched-at iso] [--audit path]
//   Test seam: GHLOOP_RECORD_NOW overrides the row timestamp.

import { RISK_LEVELS, DEPTH_LEVELS, isIsoTimestamp } from './gates/estimate.mjs';

export const DISPATCH_MAGIC = 'omp-dispatch/v1';
export const DISPATCHED_EVENT = 'gh_loop_dispatched';
export const CLOSED_EVENT = 'gh_loop_closed';
/** modelRoles tiers the recommendation can name, weakest first. */
export const TIERS = ['smol', 'default', 'slow', 'plan'];

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';
const nonNegInt = (v) => Number.isInteger(v) && v >= 0;

/** Build the dispatch tuple from named fields (no validation — parseDispatch is the validator). */
export function buildDispatchTuple({ issue, risk, files, depth, ac_count, model, effort = null, ts }) {
  return [DISPATCH_MAGIC, issue, risk, files, depth, ac_count, model, effort, ts];
}

const posInt = (v) => Number.isInteger(v) && v > 0;
const strOrNull = (v) => v === null || nonEmpty(v);

/** Problems with named dispatch fields (shared by the tuple parser and the audit-row reader so a
 *  hand-edited audit line is held to the same shape as a fresh tuple). `label(i, name)` renders the
 *  element/key name for the message. */
function dispatchProblems(f, label) {
  const problems = [];
  if (!posInt(f.issue)) problems.push(`${label(1, 'issue')} must be a positive integer`);
  if (!RISK_LEVELS.has(f.risk)) problems.push(`${label(2, 'risk')} must be one of low|medium|high|critical`);
  if (!nonNegInt(f.files)) problems.push(`${label(3, 'files')} must be a non-negative integer`);
  if (!DEPTH_LEVELS.has(f.depth)) problems.push(`${label(4, 'depth')} must be low|high`);
  if (!nonNegInt(f.ac_count)) problems.push(`${label(5, 'ac_count')} must be a non-negative integer`);
  if (!nonEmpty(f.model)) problems.push(`${label(6, 'model')} must be a non-empty string`);
  if (!strOrNull(f.effort)) problems.push(`${label(7, 'effort')} must be a non-empty string or null`);
  if (!isIsoTimestamp(f.ts)) problems.push(`${label(8, 'ts')} must be an ISO 8601 date-time with a zone (e.g. 2026-10-03T14:09:58Z)`);
  return problems;
}

/** Parse the tuple text. Returns { fields | null, problems: [] } — [] means valid (mirrors parseEstimate). */
export function parseDispatch(text) {
  let t;
  try {
    t = JSON.parse(text);
  } catch (e) {
    return { fields: null, problems: [`not valid JSON (${String(e.message).slice(0, 120)})`] };
  }
  if (!Array.isArray(t)) return { fields: null, problems: ['not a JSON array — the record is a positional tuple'] };
  if (t.length !== 9) return { fields: null, problems: [`wrong arity: expected exactly 9 elements, got ${t.length}`] };
  const fields = { issue: t[1], risk: t[2], files: t[3], depth: t[4], ac_count: t[5], model: t[6], effort: t[7], ts: t[8] };
  const problems = t[0] === DISPATCH_MAGIC ? [] : [`element 0 must be the literal "${DISPATCH_MAGIC}"`];
  problems.push(...dispatchProblems(fields, (i, name) => `element ${i} (${name})`));
  if (problems.length > 0) return { fields: null, problems };
  return { fields, problems: [] };
}

/** All valid tuples inside comment text (one per line; a surrounding pair of backticks is stripped
 *  so the skill can render them as inline code). Returns { tuples: [fields…], problems: [] } — when
 *  no line is valid, `problems` carries the first malformed candidate's problems (a prose line that
 *  merely mentions the magic is not a candidate unless it parses as JSON). Several comments may be
 *  concatenated: a re-dispatch leaves a second tuple and both are worth recording. Provenance is the
 *  caller's seam — `ingest --issue N` drops tuples naming another issue, and the skill fetches only
 *  write+ authors' comments. */
export function findDispatchTuples(commentText) {
  const tuples = [];
  let problems = [];
  for (const raw of String(commentText ?? '').split('\n')) {
    const line = raw.trim().replace(/^`+|`+$/g, '');
    if (!line.startsWith('[') || !line.includes(DISPATCH_MAGIC)) continue;
    const r = parseDispatch(line);
    if (r.fields) tuples.push(r.fields);
    else if (problems.length === 0 && !r.problems[0].startsWith('not valid JSON')) problems = r.problems;
  }
  return { tuples, problems: tuples.length === 0 ? problems : [] };
}

/** files → size bucket (S ≤ 3, M 4–8, L ≥ 9). Shared by the recommendation and the report cells. */
export function sizeBucket(files) {
  return files <= 3 ? 'S' : files <= 8 ? 'M' : 'L';
}

/** Rule table — risk × depth × files bucket → tier. Plain and deliberately coarse: the point is a
 *  visible, retunable starting line, not a scoring model. */
export function recommendTier({ risk, depth, files }) {
  const bucket = sizeBucket(files);
  if (risk === 'critical') return { tier: 'plan', reason: 'critical risk' };
  if (depth === 'high' && (risk === 'high' || bucket === 'L')) return { tier: 'plan', reason: `deep reasoning on a ${risk === 'high' ? 'high-risk' : 'large'} change` };
  if (depth === 'high') return { tier: 'slow', reason: 'deep reasoning' };
  if (risk === 'high' || bucket === 'L') return { tier: 'slow', reason: risk === 'high' ? 'high risk' : 'large change' };
  if (risk === 'medium' || bucket === 'M') return { tier: 'default', reason: risk === 'medium' ? 'medium risk' : 'medium-sized change' };
  return { tier: 'smol', reason: 'low risk, small, shallow' };
}

/** The one line appended to the `ask` options. `roles` is the parsed `omp config get modelRoles`
 *  object; a missing tier names the role to configure instead of inventing an id. */
export function renderRecommendation(fields, roles = {}) {
  const { tier, reason } = recommendTier(fields);
  const id = typeof roles[tier] === 'string' && roles[tier] !== '' ? roles[tier] : `<modelRoles.${tier} 미설정>`;
  return `규모 기반 추천: ${id} (${tier} — ${reason}; risk ${fields.risk} × depth ${fields.depth} × files ${fields.files} [${sizeBucket(fields.files)}])`;
}

/** The model-marker comment body the coordinator posts (marker + tuple as inline code). */
export function renderDispatchComment(fields) {
  const level = fields.effort === null ? '' : `:${fields.effort}`;
  return [
    `gh-loop dispatch 모델: ${fields.model} / thinking: ${fields.effort ?? '(모델 기본)'}`,
    `<!-- gh-loop:model:${fields.model}${level} -->`,
    `\`${JSON.stringify(buildDispatchTuple(fields))}\``,
    '',
  ].join('\n');
}

/** Audit row for a parsed dispatch tuple ({ts,event,actor,meta} convention). */
export function buildDispatchEvent(fields, actor = 'assistant', now = new Date().toISOString()) {
  return {
    ts: now,
    event: DISPATCHED_EVENT,
    actor,
    meta: {
      issue: fields.issue,
      risk: fields.risk,
      files: fields.files,
      depth: fields.depth,
      ac_count: fields.ac_count,
      model: fields.model,
      effort: fields.effort,
      dispatched_at: fields.ts,
    },
  };
}

/** Audit row for the worker's closeout. `dispatched` is the matching gh_loop_dispatched meta (or
 *  null when none was recorded); explicit fields win over it so a retro record stays possible. */
export function buildCloseoutEvent(actual, dispatched = null, actor = 'assistant', now = new Date().toISOString()) {
  const d = dispatched ?? {};
  const dispatchedAt = actual.dispatched_at ?? d.dispatched_at ?? null;
  const start = dispatchedAt === null ? NaN : Date.parse(dispatchedAt);
  const end = Date.parse(now);
  const duration = Number.isNaN(start) || Number.isNaN(end) ? null : Math.round((end - start) / 60000);
  return {
    ts: now,
    event: CLOSED_EVENT,
    actor,
    meta: {
      issue: actual.issue,
      pr: actual.pr ?? null,
      model: actual.model ?? d.model ?? null,
      effort: actual.effort ?? d.effort ?? null,
      risk: d.risk ?? null,
      depth: d.depth ?? null,
      files_predicted: Number.isInteger(d.files) ? d.files : null,
      files_changed: actual.files_changed,
      insertions: actual.insertions,
      deletions: actual.deletions,
      review_rounds: actual.review_rounds,
      verifier: actual.verifier,
      decisions: actual.decisions,
      dispatched_at: dispatchedAt,
      duration_min: duration,
    },
  };
}

/** Well-formed dispatch/closeout rows out of audit JSONL text. A row that is not JSON, not one of the
 *  two events, or whose meta is not the shape buildDispatchEvent/buildCloseoutEvent write is skipped —
 *  a hand-edited or half-written line must neither skew the §3 cells nor crash the report. */
export function readLoopEvents(text) {
  const dispatched = [];
  const closed = [];
  const intOrNull = (v) => v === null || Number.isInteger(v);
  for (const line of String(text ?? '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let e;
    try { e = JSON.parse(t); } catch { continue; }
    if (!e || !e.meta || typeof e.meta !== 'object' || Array.isArray(e.meta)) continue;
    const m = e.meta;
    if (e.event === DISPATCHED_EVENT) {
      if (dispatchProblems({ ...m, ts: m.dispatched_at }, (i, name) => name).length === 0) dispatched.push(e);
    } else if (e.event === CLOSED_EVENT) {
      const ok = posInt(m.issue) && (m.pr === null || posInt(m.pr))
        && strOrNull(m.model) && strOrNull(m.effort)
        && (m.risk === null || RISK_LEVELS.has(m.risk)) && (m.depth === null || DEPTH_LEVELS.has(m.depth))
        && (m.files_predicted === null || nonNegInt(m.files_predicted))
        && nonNegInt(m.files_changed) && nonNegInt(m.insertions) && nonNegInt(m.deletions)
        && nonNegInt(m.review_rounds) && nonEmpty(m.verifier) && nonNegInt(m.decisions)
        && (m.dispatched_at === null || isIsoTimestamp(m.dispatched_at)) && intOrNull(m.duration_min);
      if (ok) closed.push(e);
    }
  }
  return { dispatched, closed };
}

/** Dispatch meta for an issue: with `dispatchedAt`, the row whose dispatched_at matches exactly (or
 *  null — a retro close must not inherit another dispatch's size); without it, the dispatch with the
 *  latest dispatched_at (a re-dispatch supersedes; append order is irrelevant so a backfilled row
 *  cannot shadow a newer one). */
export function findDispatch(dispatched, issue, dispatchedAt = null) {
  let found = null;
  for (const e of dispatched) {
    if (e.meta.issue !== issue) continue;
    if (dispatchedAt !== null) { if (e.meta.dispatched_at === dispatchedAt) return e.meta; continue; }
    if (found === null || Date.parse(e.meta.dispatched_at) >= Date.parse(found.dispatched_at)) found = e.meta;
  }
  return dispatchedAt === null ? found : null;
}

/** One meta per (issue, dispatched_at) — the key both CLI idempotency checks use; the last row wins
 *  for a repeated key. Pairing closeouts with dispatches on this key keeps a retro close for an older
 *  dispatch from hiding the newer dispatch's closeout in the report. */
export function byDispatch(rows) {
  const m = new Map();
  for (const e of rows) m.set(`${e.meta.issue}\u0000${e.meta.dispatched_at}`, e.meta);
  return [...m.values()];
}

// --- CLI ---------------------------------------------------------------------------------------
// Every flag takes exactly one non-empty value; a missing/empty value, a value that is another
// `--flag`, a flag the mode does not take, and any unknown token are errors — this CLI publishes
// comments and appends to the tracked ledger, so a swallowed flag must not become a model id and an
// empty `--audit` must not silently retarget the repository ledger.
const STRING_FLAGS = { '--risk': 'risk', '--depth': 'depth', '--model': 'model', '--effort': 'effort', '--ts': 'ts', '--dispatched-at': 'dispatched_at', '--roles-json': 'rolesJson', '--out': 'out', '--audit': 'audit', '--comment-file': 'commentFile', '--verifier': 'verifier' };
const NUMBER_FLAGS = { '--issue': 'issue', '--pr': 'pr', '--files': 'files', '--ac-count': 'ac_count', '--files-changed': 'files_changed', '--insertions': 'insertions', '--deletions': 'deletions', '--review-rounds': 'review_rounds', '--decisions': 'decisions' };
const MODE_FLAGS = {
  recommend: ['--risk', '--depth', '--files', '--roles-json'],
  dispatch: ['--issue', '--risk', '--files', '--depth', '--ac-count', '--model', '--effort', '--ts', '--roles-json', '--out'],
  ingest: ['--issue', '--comment-file', '--audit'],
  close: ['--issue', '--pr', '--files-changed', '--insertions', '--deletions', '--review-rounds', '--verifier', '--decisions', '--model', '--effort', '--dispatched-at', '--audit'],
};

export function parseArgs(argv) {
  const mode = argv[0];
  const allowed = Object.hasOwn(MODE_FLAGS, mode) ? MODE_FLAGS[mode] : null;
  const o = {};
  const errors = allowed ? [] : [`unknown mode ${JSON.stringify(mode ?? '')}`];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const isNum = Object.hasOwn(NUMBER_FLAGS, a);
    if (!isNum && !Object.hasOwn(STRING_FLAGS, a)) { errors.push(`unknown argument ${JSON.stringify(a)}`); continue; }
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) { errors.push(`${a} needs a non-empty value`); continue; }
    i++;   // the token is this flag's value even when empty or off-mode — consume it so it is not reported twice
    if (allowed && !allowed.includes(a)) { errors.push(`${a} is not a ${mode} flag`); continue; }
    if (v.trim() === '') { errors.push(`${a} needs a non-empty value`); continue; }
    o[isNum ? NUMBER_FLAGS[a] : STRING_FLAGS[a]] = isNum ? Number(v) : v;
  }
  return { mode, opts: o, errors };
}

import { realpathSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const isMain = (() => {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();

const USAGE = 'gh-loop-record: usage — dispatch --issue N --risk r --files n --depth d --ac-count n --model m [--effort e] [--ts iso] [--roles-json J] [--out dir] | recommend --risk r --depth d --files n [--roles-json J] | ingest --issue N --comment-file f [--audit path] | close --issue N --files-changed n --insertions n --deletions n --review-rounds n --verifier V --decisions n [--pr M] [--model m] [--effort e] [--dispatched-at iso] [--audit path]';

function die(msg) {
  console.error(`gh-loop-record: ${msg}`);
  process.exit(1);
}

function parseRoles(json) {
  if (json === undefined) return {};
  let parsed;
  try { parsed = JSON.parse(json); } catch { parsed = undefined; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) die('invalid --roles-json (supplied but not a JSON object)');
  return parsed;
}

function readAudit(path) {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

/** Append one row and return the ledger text as it now stands. `prev` is the text the caller already
 *  read for its join — a ledger that lost its final newline must not swallow the new row into the
 *  previous line. */
function appendRow(path, prev, row) {
  mkdirSync(dirname(path), { recursive: true });
  const sep = prev === '' || prev.endsWith('\n') ? '' : '\n';
  const chunk = `${sep}${JSON.stringify(row)}\n`;
  appendFileSync(path, chunk);
  return prev + chunk;
}

if (isMain) {
  const { mode, opts: o, errors } = parseArgs(process.argv.slice(2));
  if (errors.length > 0) die(`${errors.join('; ')}\n${USAGE}`);
  const now = process.env.GHLOOP_RECORD_NOW || new Date().toISOString();
  const auditPath = o.audit || join(process.cwd(), 'docs', 'harness', 'audit.jsonl');

  if (mode === 'recommend') {
    if (!RISK_LEVELS.has(o.risk) || !DEPTH_LEVELS.has(o.depth) || !nonNegInt(o.files)) die('recommend needs --risk low|medium|high|critical --depth low|high --files <non-negative int>');
    process.stdout.write(renderRecommendation({ risk: o.risk, depth: o.depth, files: o.files }, parseRoles(o.rolesJson)) + '\n');
    process.exit(0);
  }

  if (mode === 'dispatch') {
    const fields = { issue: o.issue, risk: o.risk, files: o.files, depth: o.depth, ac_count: o.ac_count, model: o.model, effort: o.effort ?? null, ts: o.ts || now.replace(/\.\d{3}Z$/, 'Z') };
    const { problems } = parseDispatch(JSON.stringify(buildDispatchTuple(fields)));
    if (problems.length > 0) die(`invalid dispatch fields — ${problems.join('; ')}`);
    const recommendation = renderRecommendation(fields, parseRoles(o.rolesJson));
    const comment = renderDispatchComment(fields);
    if (o.out) {
      // One file per artifact so the skill consumes them with --body-file / $(cat), no shell JSON parsing.
      mkdirSync(o.out, { recursive: true });
      writeFileSync(join(o.out, 'recommendation'), `${recommendation}\n`);
      writeFileSync(join(o.out, 'tuple'), `${JSON.stringify(buildDispatchTuple(fields))}\n`);
      writeFileSync(join(o.out, 'model.md'), comment);
    }
    process.stdout.write(JSON.stringify({ tuple: buildDispatchTuple(fields), recommendation, comment }));
    process.exit(0);
  }

  if (mode === 'ingest') {
    if (!o.commentFile || !posInt(o.issue)) die(`ingest needs --issue N and --comment-file f\n${USAGE}`);
    let text;
    try { text = readFileSync(o.commentFile, 'utf-8'); }
    catch (e) { die(`cannot read ${o.commentFile} (${e.message})`); }
    const { tuples, problems } = findDispatchTuples(text);
    if (tuples.length === 0) die(problems.length > 0 ? `malformed dispatch tuple — ${problems.join('; ')}` : `no ${DISPATCH_MAGIC} tuple in ${o.commentFile}`);
    // Issue binding: a tuple naming another issue (quoted, pasted, or posted on the wrong thread) is
    // never recorded under this one.
    const mine = tuples.filter((f) => f.issue === o.issue);
    for (const f of tuples) if (f.issue !== o.issue) console.log(`gh-loop-record: tuple for #${f.issue} @ ${f.ts} ignored — ingesting #${o.issue}`);
    if (mine.length === 0) die(`no ${DISPATCH_MAGIC} tuple for #${o.issue} in ${o.commentFile}`);
    let ledger = readAudit(auditPath);
    for (const fields of mine) {
      // Idempotency key = (issue, dispatched_at); the in-memory ledger grows with each append so a
      // comment file holding the same tuple twice records it once.
      if (findDispatch(readLoopEvents(ledger).dispatched, fields.issue, fields.ts)) {
        console.log(`gh-loop-record: ${DISPATCHED_EVENT} for #${fields.issue} @ ${fields.ts} already recorded — skipped`);
        continue;
      }
      const row = buildDispatchEvent(fields, 'assistant', now);
      ledger = appendRow(auditPath, ledger, row);
      console.log(`gh-loop-record: ${DISPATCHED_EVENT} #${row.meta.issue} ${row.meta.model}${row.meta.effort ? `:${row.meta.effort}` : ''} (${row.meta.risk}/${row.meta.depth}/${row.meta.files} files, ${row.meta.ac_count} AC) -> ${auditPath}`);
    }
    process.exit(0);
  }

  if (mode === 'close') {
    const need = { issue: posInt, files_changed: nonNegInt, insertions: nonNegInt, deletions: nonNegInt, review_rounds: nonNegInt, decisions: nonNegInt, verifier: nonEmpty };
    const missing = Object.entries(need).filter(([k, ok]) => !ok(o[k])).map(([k]) => `--${k.replace(/_/g, '-')}`);
    if (missing.length > 0) die(`close needs ${missing.join(', ')}`);
    if (o.dispatched_at !== undefined && !isIsoTimestamp(o.dispatched_at)) die('--dispatched-at must be an ISO 8601 date-time with a zone');
    if (o.pr !== undefined && !posInt(o.pr)) die('--pr must be a positive integer');
    const ledger = readAudit(auditPath);
    const { dispatched, closed } = readLoopEvents(ledger);
    // With --dispatched-at, join ONLY the dispatch with that exact timestamp (a retro close must not
    // inherit another dispatch's size); without it, the issue's latest dispatch.
    const d = findDispatch(dispatched, o.issue, o.dispatched_at ?? null);
    const dispatchedAt = o.dispatched_at ?? d?.dispatched_at ?? null;
    // Idempotency key = (issue, dispatched_at) — including the no-dispatch case (null), where a second
    // run is a re-run rather than a second closeout.
    if (closed.some((e) => e.meta.issue === o.issue && e.meta.dispatched_at === dispatchedAt)) {
      console.log(`gh-loop-record: ${CLOSED_EVENT} for #${o.issue} (dispatch ${dispatchedAt ?? 'none'}) already recorded — skipped`);
      process.exit(0);
    }
    const row = buildCloseoutEvent(o, d, 'assistant', now);
    appendRow(auditPath, ledger, row);
    console.log(`gh-loop-record: ${CLOSED_EVENT} #${row.meta.issue} ${row.meta.model ?? '(model unknown)'} — ${row.meta.files_changed} files +${row.meta.insertions}/-${row.meta.deletions}, r${row.meta.review_rounds}, verifier ${row.meta.verifier}, ${row.meta.decisions} decision(s), ${row.meta.duration_min ?? 'n/a'} min -> ${auditPath}`);
    process.exit(0);
  }

  die(USAGE);
}

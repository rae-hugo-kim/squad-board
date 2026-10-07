#!/usr/bin/env node
// gh-loop-controller.mjs — the multisession fan-out controller's DECISION logic (autonomy Q3): how
// many worker sessions to run, which task each takes, when to scale, and which issues are free to
// claim. It is the testable core of a THIN on-demand orchestrator (analysis Q3) — NOT a daemon/dashboard.
//
// The controller skill launches omp workers in Orca-managed worktrees (one worktree/branch/issue),
// observes GitHub labels/comments plus Orca cards, and never auto-merges. Orca/gh calls are SEAMS
// owned by that skill; THIS file is pure decision logic with no processes or network.
//
//   planPool(tasks, { cap })        -> { workers:[{taskId,kind,role}], queued:[...], cap }
//   nextScale(state, { cap })       -> { action:"up"|"down"|"hold", delta?, retire? }
//   assign(issues, { claimed })     -> { assignable:[{issue}], skipped:[{issue,reason}] }
//
// cap is a CONFIGURABLE ceiling (default 3); dynamic scaling uses 1..cap (cap is NOT a system limit —
// the real bound is the model provider's rate-limit/budget). A fix task = 1 worker; a review task
// scales by changed files (+1 heterogeneous reviewer when risk is high/critical), capped by `cap`.

const FILES_PER_REVIEWER = 8;

// How many worker sessions a single task wants (before the global cap is applied).
export function desiredWorkers(task) {
  if (!task) return 0;
  if (task.kind === 'review') {
    const files = Number.isFinite(task.changedFiles) ? task.changedFiles : 1;
    const base = Math.max(1, Math.ceil(files / FILES_PER_REVIEWER));
    return task.risk === 'high' || task.risk === 'critical' ? base + 1 : base; // +1 heterogeneous pass
  }
  return 1; // fix/default: one session per issue (worktree-isolated)
}

// Allocate worker slots across tasks, bounded by `cap`; overflow is queued (picked up by nextScale).
export function planPool(tasks, { cap = 3 } = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const ceiling = Number.isFinite(cap) && cap >= 1 ? Math.floor(cap) : 3; // integer ceiling; fractional/<1 -> 3
  const workers = [];
  const queued = [];
  for (const t of list) {
    if (!t || t.id == null) continue;
    const role = t.kind === 'review' ? 'reviewer' : 'fixer';
    for (let i = 0; i < Math.min(desiredWorkers(t), ceiling); i++) { // clamp per task -> bounded queued (no DoS)
      const slot = { taskId: t.id, kind: t.kind || 'fix', role };
      if (workers.length < ceiling) workers.push(slot);
      else queued.push(slot);
    }
  }
  return { workers, queued, cap: ceiling };
}

// Decide the next scaling action from the live pool state. Drains idle workers when the backlog is
// empty; grows toward `cap` (never past it) when there is backlog and room.
export function nextScale(state = {}, { cap = 3 } = {}) {
  const ceiling = Number.isFinite(cap) && cap >= 1 ? Math.floor(cap) : 3;
  const running = Math.max(0, Number.isFinite(state.running) ? Math.floor(state.running) : 0);
  const backlog = Math.max(0, Number.isFinite(state.backlog) ? Math.floor(state.backlog) : 0);
  const idle = Array.isArray(state.idle) ? state.idle : [];
  if (backlog > 0 && running < ceiling) {
    return { action: 'up', delta: Math.min(backlog, ceiling - running) };
  }
  if (backlog === 0 && idle.length > 0) {
    return { action: 'down', retire: idle };
  }
  return { action: 'hold' };
}

// Which open issues are free to claim. Only an issue WITHOUT a status label is agent backlog (gh-loop
// SKILL.md "상태 라벨"): one in `claimed` (numbers or {number}) or carrying `agent-working` is held by a
// worker — two workers never grab the same issue — and `needs-decision` / `needs-review` wait for a human.
const HUMAN_STATUS_LABELS = ['needs-decision', 'needs-review'];
export function assign(issues, { claimed = [] } = {}) {
  const num = (x) => (x && x.number != null ? x.number : x);
  const key = (x) => String(num(x)); // normalize so 1 and "1" match (cross-source type drift)
  const claimedSet = new Set((Array.isArray(claimed) ? claimed : []).map(key));
  const labelName = (l) => (l && l.name ? l.name : l);
  const seen = new Set();
  const assignable = [];
  const skipped = [];
  for (const iss of (Array.isArray(issues) ? issues : [])) {
    if (!iss) continue;
    const n = num(iss);
    const k = String(n);
    if (seen.has(k)) { skipped.push({ issue: n, reason: 'duplicate in list' }); continue; } // never double-assign
    seen.add(k);
    const names = Array.isArray(iss.labels) ? iss.labels.map(labelName) : [];
    const waiting = HUMAN_STATUS_LABELS.find((l) => names.includes(l));
    if (claimedSet.has(k) || names.includes('agent-working')) skipped.push({ issue: n, reason: 'already claimed' });
    else if (waiting) skipped.push({ issue: n, reason: `awaiting human (${waiting})` });
    else assignable.push({ issue: n });
  }
  return { assignable, skipped };
}

// --- CLI (for the controller skill) ------------------------------------------------------------
function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
function parseJson(s, fallback) {
  if (s === undefined) return fallback;
  try { return JSON.parse(s); } catch { return undefined; }
}

import { realpathSync } from 'fs';
import { fileURLToPath } from 'url';
const isMain = (() => {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();

if (isMain) {
  const mode = process.argv[2];
  const argv = process.argv.slice(3);
  const cap = Number(arg(argv, '--cap'));
  const opt = { cap: Number.isFinite(cap) ? cap : 3 };
  let out;
  if (mode === 'plan') {
    const tasks = parseJson(arg(argv, '--tasks-json'), []);
    if (!Array.isArray(tasks)) { process.stdout.write(JSON.stringify({ error: 'invalid --tasks-json' })); process.exit(0); }
    out = planPool(tasks, opt);
  } else if (mode === 'scale') {
    const state = parseJson(arg(argv, '--state-json'), {});
    if (state === undefined || typeof state !== 'object') { process.stdout.write(JSON.stringify({ error: 'invalid --state-json' })); process.exit(0); }
    out = nextScale(state, opt);
  } else if (mode === 'assign') {
    const issues = parseJson(arg(argv, '--issues-json'), []);
    const claimed = parseJson(arg(argv, '--claimed-json'), []);
    if (!Array.isArray(issues)) { process.stdout.write(JSON.stringify({ error: 'invalid --issues-json' })); process.exit(0); }
    out = assign(issues, { claimed: Array.isArray(claimed) ? claimed : [] });
  } else {
    console.error('gh-loop-controller: usage — plan|scale|assign [--cap N] [--tasks-json|--state-json|--issues-json|--claimed-json JSON]');
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

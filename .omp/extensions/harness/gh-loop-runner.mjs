#!/usr/bin/env node
// gh-loop-runner.mjs — decide what the autonomous gh-loop runtime (option A) should do for a GitHub
// event: START a loop, RESUME a paused one, or IGNORE. This is the EXECUTABLE form of the gh-loop
// guard policy (.omp/skills/gh-loop/SKILL.md) — the workflow template (templates/) is thin glue that
// feeds this helper the event context and, only on start/resume, invokes the agent CLI headlessly.
//
// Not a hook. Pure decision: the `gh api` calls that produce its inputs (issue labels, the actor's
// permission, the bot login) are the workflow's SEAM, so this logic is unit-testable with no live
// GitHub. It NEVER decides to merge — merge stays human-approved inside the agent run (AC6).
//
//   decideRun({ event, action, labels, state, actor, actorPermission, botLogin, commentBody })
//     -> { action: "start"|"resume"|"ignore", reason }
//
// Guard policy enforced here (structural half; the agent does the semantic half = LLM-interpret the
// comment, handle ambiguity/conflict, gate the merge):
//   - bot self-exclusion: never act on the loop's OWN events (actor === botLogin, or a comment that
//     carries the agent's `<!-- gh-loop:* -->` marker) — stops self-triggering loops.
//   - permission: only a write+ actor (write/maintain/admin) can drive the loop; triage/read/none ignored.
//   - label gating: must be an OPEN `gh-loop` issue; resume needs `needs-decision`.
//   - routing: issue_comment(created) on needs-decision -> resume; issues(opened/labeled) -> start; else ignore.
//
// CLI (for the workflow):
//   node gh-loop-runner.mjs decide --event issue_comment --action created \
//     --labels "gh-loop,needs-decision" --state open --actor alice --permission write \
//     --bot-login my-bot --comment-body "merge it"
//   -> prints the decision JSON on stdout (exit 0). Malformed/unknown input -> a fail-safe IGNORE
//      (the loop does nothing rather than mis-fire), never a crash.

const WRITE_PLUS = new Set(['write', 'maintain', 'admin']);

function hasLabel(labels, name) {
  return (Array.isArray(labels) ? labels : []).some((l) => (l && l.name ? l.name : l) === name);
}

export function decideRun({
  event = '', action = '', labels = [], state = 'open',
  actor = '', actorPermission = '', botLogin = '', commentBody = '',
} = {}) {
  // 0. FAIL CLOSED if the loop's own identity is not configured. Without botLogin we cannot reliably
  //    exclude the loop's OWN events, and an autonomous repo-write loop could self-trigger (runaway).
  //    An unset GH_LOOP_BOT_LOGIN therefore refuses to run rather than guess. (Guard policy: bot id.)
  if (!botLogin) return { action: 'ignore', reason: 'bot identity (botLogin) not configured — fail-closed' };
  // 1. bot self-exclusion — never react to the loop's own issue/comment (else it self-triggers, e.g.
  //    the agent's needs-decision question would "resume" itself). Marker check is case-insensitive.
  if (actor && actor === botLogin) {
    return { action: 'ignore', reason: 'actor is the loop bot (self)' };
  }
  if (typeof commentBody === 'string' && /<!--\s*gh-loop:/i.test(commentBody)) {
    return { action: 'ignore', reason: "comment carries the agent's gh-loop marker (self)" };
  }
  // 2. only an OPEN loop issue is actionable.
  if (state !== 'open') return { action: 'ignore', reason: `issue not open (${state})` };
  if (!hasLabel(labels, 'gh-loop')) return { action: 'ignore', reason: 'not a gh-loop issue' };
  // 3. permission guard — write+ required to drive the loop (Guard policy: write+).
  if (!WRITE_PLUS.has(String(actorPermission).toLowerCase())) {
    return { action: 'ignore', reason: `actor lacks write+ permission (${actorPermission || 'none'})` };
  }
  // 4. routing. The agent (not this helper) interprets the comment and handles ambiguity/merge.
  if (event === 'issue_comment' && action === 'created' && hasLabel(labels, 'needs-decision')) {
    return { action: 'resume', reason: 'authorized comment on a needs-decision issue' };
  }
  if (event === 'issues' && (action === 'opened' || action === 'labeled')) {
    return { action: 'start', reason: 'gh-loop issue opened/labeled by an authorized actor' };
  }
  return { action: 'ignore', reason: 'no matching trigger' };
}

// --- CLI ---------------------------------------------------------------------------------------
function parseArgs(argv) {
  const o = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--event') o.event = argv[++i];
    else if (a === '--action') o.action = argv[++i];
    else if (a === '--labels') o.labels = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--state') o.state = argv[++i];
    else if (a === '--actor') o.actor = argv[++i];
    else if (a === '--permission') o.actorPermission = argv[++i];
    else if (a === '--bot-login') o.botLogin = argv[++i];
    else if (a === '--comment-body') o.commentBody = argv[++i];
  }
  return o;
}

import { realpathSync } from 'fs';
import { fileURLToPath } from 'url';
const isMain = (() => {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();

if (isMain) {
  if (process.argv[2] !== 'decide') {
    console.error('gh-loop-runner: usage — decide --event E --action A --labels "a,b" --state open --actor U --permission write --bot-login B [--comment-body S]');
    process.exit(1);
  }
  let decision;
  try { decision = decideRun(parseArgs(process.argv.slice(2))); }
  catch { decision = { action: 'ignore', reason: 'malformed input (fail-safe)' }; } // never mis-fire
  process.stdout.write(JSON.stringify(decision));
  process.exit(0);
}

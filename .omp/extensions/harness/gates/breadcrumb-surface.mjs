#!/usr/bin/env node
// breadcrumb-surface.mjs - session_start hook
// Purpose (seed AC3, analysis Q1.5/Q1.2-C): surface recent docs/sum/*.md so prior
// trouble-shooting narratives aren't orphaned (buried until someone re-opens them).
// no-LLM: lists the most recent summaries by mtime. Advisory (stdout note), never blocks.

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

let data;
try {
  data = JSON.parse(readFileSync(0, 'utf-8'));
} catch {
  process.exit(0);
}

const cwd = data?.session_state?.cwd || process.cwd();
const sumDir = join(cwd, 'docs', 'sum');
if (!existsSync(sumDir)) process.exit(0);

let recent;
try {
  recent = readdirSync(sumDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => { try { return { f, m: statSync(join(sumDir, f)).mtimeMs }; } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => b.m - a.m)
    .slice(0, 3)
    .map((x) => x.f);
} catch {
  process.exit(0);
}

if (recent.length) {
  console.log(`prior session summaries (docs/sum/): ${recent.join(', ')} — read to resume context.`);
}
process.exit(0);

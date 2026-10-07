#!/usr/bin/env node
// write-tracker.mjs - PostToolUse hook for Edit|Write
// Purpose: Record files written/edited so context-gate does not re-block a later
//   Edit of a file this session just created with Write (the Write->Edit false block,
//   audit finding F1 — the most repeated friction in normal authoring loops).
//
// Safety: PostToolUse fires only on SUCCESS, and context-gate (PreToolUse: Edit|Write)
//   has already gated the Write/Edit that triggered us — it only succeeds for a new
//   file or an already-read file. Logging the path here therefore cannot bypass the
//   read-before-edit invariant; it only removes redundant re-reads of our own writes.
//
// Mirrors read-tracker.mjs's path normalization and append/dedup exactly so that
//   context-gate's lookup (`readPaths.has(filePath) || readPaths.has(normalizedPath)`)
//   matches identically regardless of which tracker recorded the path.

import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const input = readFileSync(0, 'utf-8');
let data;

try {
  data = JSON.parse(input);
} catch {
  console.error('HARNESS WARNING: Hook received invalid input, skipping check.');
  process.exit(0);
}

const filePath = data?.tool_input?.file_path || data?.tool_input?.filePath;
if (!filePath) process.exit(0);

const cwd = data?.session_state?.cwd || process.cwd();
const stateDir = join(cwd, '.omp', 'harness-state');
const readLogPath = join(stateDir, 'read-log.txt');

if (!existsSync(stateDir)) {
  mkdirSync(stateDir, { recursive: true });
}

const normalizedPath = filePath.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/');

const existing = existsSync(readLogPath) ? readFileSync(readLogPath, 'utf-8') : '';
const existingSet = new Set(existing.split('\n').filter(Boolean));

if (!existingSet.has(filePath) && !existingSet.has(normalizedPath)) {
  appendFileSync(readLogPath, filePath + '\n');
  appendFileSync(readLogPath, normalizedPath + '\n');
}

process.exit(0);

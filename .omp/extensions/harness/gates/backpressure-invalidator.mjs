#!/usr/bin/env node
// backpressure-invalidator.mjs - PostToolUse hook for Edit|Write
// Purpose: Reset backpressure-status to UNKNOWN when a code file is edited
// Code files: .ts .tsx .js .jsx .mjs .cjs .py .go .rs .java .rb .php .sql .sh
// Non-code files (.md .txt .json .yaml etc.) do NOT reset status

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'fs';
import { join, extname } from 'path';

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.rb', '.php', '.sql', '.sh'
]);

const input = readFileSync(0, 'utf-8');

let data;
try {
  data = JSON.parse(input);
} catch (e) {
  console.error('HARNESS WARNING: Hook received invalid input, skipping check.');
  process.exit(0);
}

const cwd = data?.session_state?.cwd || process.cwd();
const stateDir = join(cwd, '.omp', 'harness-state');
if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });

const logFile = join(stateDir, 'hook-debug.log');

function log(msg) {
  if (!process.env.HARNESS_DEBUG) return;
  const timestamp = new Date().toISOString();
  appendFileSync(logFile, `[${timestamp}] backpressure-invalidator: ${msg}\n`);
}

log('Hook started');

const filePath = data?.tool_input?.file_path || '';
log(`File: ${filePath}`);

if (!filePath) {
  log('No file_path, skipping');
  process.exit(0);
}

const ext = extname(filePath).toLowerCase();
log(`Extension: ${ext}`);

if (!CODE_EXTENSIONS.has(ext)) {
  log(`Non-code extension (${ext}), not resetting backpressure status`);
  process.exit(0);
}

log(`Code file edited (${ext}), resetting backpressure-status to UNKNOWN`);

const statusFile = join(stateDir, 'backpressure-status');
writeFileSync(statusFile, 'UNKNOWN');

log('backpressure-status reset to UNKNOWN');
process.exit(0);

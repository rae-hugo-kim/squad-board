#!/usr/bin/env node
// context-gate.mjs - PreToolUse hook for Edit|Write
// Purpose: Block edits to files that haven't been read first
// Exit 0 = allow, Exit 2 = block (uses stderr for messages)

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

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
  appendFileSync(logFile, `[${timestamp}] context-gate: ${msg}\n`);
}

log('Hook started');

const filePath = data?.tool_input?.file_path || data?.tool_input?.filePath;
log(`File path: ${filePath}`);

if (!filePath) {
  log('No file path, allowing');
  process.exit(0);
}

// New files don't need to be read first
if (!existsSync(filePath)) {
  log('File does not exist (new file), allowing');
  process.exit(0);
}

const normalizedPath = filePath.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/');
const readLogPath = join(stateDir, 'read-log.txt');

if (!existsSync(readLogPath)) {
  log('No read log, blocking');
  console.error(`HARNESS BLOCK: You must read '${filePath}' before editing it.`);
  process.exit(2);
}

const readLog = readFileSync(readLogPath, 'utf-8');

const readPaths = new Set(readLog.split('\n').map(l => l.trim()).filter(Boolean));
if (readPaths.has(filePath) || readPaths.has(normalizedPath)) {
  log('File was read, allowing');
  process.exit(0);
} else {
  log(`File not in read log, blocking`);
  console.error(`HARNESS BLOCK: You must read '${filePath}' before editing it.`);
  process.exit(2);
}

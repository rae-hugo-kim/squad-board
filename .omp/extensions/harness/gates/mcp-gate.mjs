#!/usr/bin/env node
// mcp-gate.mjs - PreToolUse hook for MCP tools
// Purpose: Warn when MCP tools perform destructive operations

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

function getStateDir(cwd) {
  const dir = join(cwd, '.omp', 'harness-state');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const input = readFileSync(0, 'utf-8');

let data;
try {
  data = JSON.parse(input);
} catch {
  console.error('HARNESS WARNING: Hook received invalid input, skipping check.');
  process.exit(0);
}

const cwd = data?.session_state?.cwd || process.cwd();
const stateDir = getStateDir(cwd);
const logFile = join(stateDir, 'hook-debug.log');

function log(msg) {
  if (!process.env.HARNESS_DEBUG) return;
  const timestamp = new Date().toISOString();
  appendFileSync(logFile, `[${timestamp}] mcp-gate: ${msg}\n`);
}

log('Hook started');

const toolName = data?.tool_name || '';
log(`Tool: ${toolName}`);

// Patterns for destructive MCP tool names. Scoped to operations that REMOVE,
// REPLACE, or DEPLOY — `create_`/`update_` were dropped because they fire on
// benign additive/edit tools (slack_create_canvas, create_draft, create_label,
// update_label, create_branch, write/create_*_file, ...) and produced almost
// all of this gate's false positives. DDL via execute_sql is still caught below.
const DESTRUCTIVE_NAME_PATTERNS = [
  /apply_migration/,
  /delete_/,
  /(^|_)drop_/, // `_` is a word char, so `\bdrop_` never matches `..__drop_table`
  /truncate_/,
  /deploy_/,
  /reset_branch/,
];

const isDestructiveByName = DESTRUCTIVE_NAME_PATTERNS.some(p => p.test(toolName));

// For execute_sql, check if the query contains DDL keywords
let isDestructiveSQL = false;
if (/execute_sql/.test(toolName)) {
  const query = (data?.tool_input?.query || data?.tool_input?.sql || '').toUpperCase();
  // Word-bounded so identifiers like CREATED_AT, DROPDOWN, ALTERATION don't match.
  isDestructiveSQL = /\b(ALTER|DROP|CREATE|TRUNCATE)\b/.test(query);
  if (isDestructiveSQL) {
    log(`DDL keyword detected in execute_sql query`);
  }
}

if (!isDestructiveByName && !isDestructiveSQL) {
  log('No destructive pattern matched, allowing');
  process.exit(0);
}

log(`Destructive MCP tool detected: ${toolName}`);

// Check out_of_scope from seed.yaml for advisory context
const seedPath = join(cwd, 'docs', 'harness', 'seed.yaml');
let outOfScopeNote = '';
if (existsSync(seedPath)) {
  try {
    const seedContent = readFileSync(seedPath, 'utf-8');
    const match = seedContent.match(/out_of_scope:\s*\n((?:\s+-[^\n]*\n?)*)/);
    if (match) {
      outOfScopeNote = `\nOut-of-scope items from seed.yaml:\n${match[1].trim()}`;
    }
  } catch { /* ignore */ }
}

console.error(`HARNESS WARNING: Destructive MCP tool detected: ${toolName}. Verify this is intentional and in scope.${outOfScopeNote}`);
log('Warning emitted (advisory only, exit 0)');

process.exit(0);

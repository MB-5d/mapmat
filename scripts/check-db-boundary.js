#!/usr/bin/env node

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET_PATHS = [
  path.join(ROOT, 'server.js'),
  path.join(ROOT, 'routes'),
  path.join(ROOT, 'stores'),
];

const ALLOWLIST = new Set([
  path.join(ROOT, 'db.js'),
  path.join(ROOT, 'stores', 'dbAdapter.js'),
]);

const BLOCKED_PATTERNS = [
  /db\.prepare\s*\(/g,
  /db\.transaction\s*\(/g,
  /db\.exec\s*\(/g,
  /new\s+Database\s*\(/g,
];

function collectFiles(target, out = []) {
  if (!fs.existsSync(target)) return out;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (target.endsWith('.js')) out.push(target);
    return out;
  }
  for (const entry of fs.readdirSync(target)) {
    collectFiles(path.join(target, entry), out);
  }
  return out;
}

function findLineNumber(text, index) {
  return text.slice(0, index).split('\n').length;
}

function main() {
  const files = TARGET_PATHS.flatMap((target) => collectFiles(target));
  const violations = [];

  for (const file of files) {
    if (ALLOWLIST.has(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of BLOCKED_PATTERNS) {
      pattern.lastIndex = 0;
      let match = pattern.exec(text);
      while (match) {
        violations.push({
          file: path.relative(ROOT, file),
          line: findLineNumber(text, match.index),
          snippet: match[0],
        });
        match = pattern.exec(text);
      }
    }
  }

  if (violations.length > 0) {
    console.error('[db-boundary] Violations found:');
    for (const v of violations) {
      console.error(`- ${v.file}:${v.line} (${v.snippet})`);
    }
    process.exit(1);
  }

  console.log('[db-boundary] Passed. No direct DB calls outside adapter.');
}

main();

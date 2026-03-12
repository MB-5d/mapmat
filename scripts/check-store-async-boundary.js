#!/usr/bin/env node

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET_PATHS = [
  path.join(ROOT, 'server.js'),
  path.join(ROOT, 'routes'),
];

const STORE_CALL_PATTERN = /\b(authStore|projectStore|mapStore|historyStore|shareStore|usageStore|jobStore|pageStore|collaborationStore)\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

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
    const text = fs.readFileSync(file, 'utf8');
    STORE_CALL_PATTERN.lastIndex = 0;
    let match = STORE_CALL_PATTERN.exec(text);
    while (match) {
      const storeName = match[1];
      const methodName = match[2];
      if (!methodName.endsWith('Async')) {
        violations.push({
          file: path.relative(ROOT, file),
          line: findLineNumber(text, match.index),
          call: `${storeName}.${methodName}()`,
        });
      }
      match = STORE_CALL_PATTERN.exec(text);
    }
  }

  if (violations.length > 0) {
    console.error('[store-async-boundary] Violations found (non-async store calls):');
    for (const violation of violations) {
      console.error(`- ${violation.file}:${violation.line} (${violation.call})`);
    }
    process.exit(1);
  }

  console.log('[store-async-boundary] Passed. Only async store APIs are used by server/routes.');
}

main();

const adapter = require('../stores/dbAdapter');
const fs = require('fs');
const path = require('path');

const forbiddenSyncExports = ['queryOne', 'queryAll', 'execute', 'transaction'];
const forbiddenAdapterCalls = ['queryAsync'];

const found = forbiddenSyncExports.filter((name) => Object.prototype.hasOwnProperty.call(adapter, name));

if (found.length > 0) {
  console.error(`[db-adapter-exports] Forbidden sync exports found: ${found.join(', ')}`);
  process.exit(1);
}

const storesDir = path.join(__dirname, '..', 'stores');
const badCalls = [];
for (const entry of fs.readdirSync(storesDir)) {
  if (!entry.endsWith('.js')) continue;
  const filePath = path.join(storesDir, entry);
  const text = fs.readFileSync(filePath, 'utf8');
  forbiddenAdapterCalls.forEach((methodName) => {
    const index = text.indexOf(`adapter.${methodName}(`);
    if (index === -1) return;
    badCalls.push({
      file: path.relative(path.join(__dirname, '..'), filePath),
      line: text.slice(0, index).split('\n').length,
      methodName,
    });
  });
}

if (badCalls.length > 0) {
  console.error('[db-adapter-exports] Forbidden adapter calls found:');
  badCalls.forEach((call) => {
    console.error(`- ${call.file}:${call.line} adapter.${call.methodName}()`);
  });
  process.exit(1);
}

console.log('[db-adapter-exports] Passed. dbAdapter exports async-only query APIs.');

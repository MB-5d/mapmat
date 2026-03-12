const adapter = require('../stores/dbAdapter');

const forbiddenSyncExports = ['queryOne', 'queryAll', 'execute', 'transaction'];

const found = forbiddenSyncExports.filter((name) => Object.prototype.hasOwnProperty.call(adapter, name));

if (found.length > 0) {
  console.error(`[db-adapter-exports] Forbidden sync exports found: ${found.join(', ')}`);
  process.exit(1);
}

console.log('[db-adapter-exports] Passed. dbAdapter exports async-only query APIs.');

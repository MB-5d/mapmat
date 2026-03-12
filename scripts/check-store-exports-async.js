const path = require('path');

const STORE_MODULES = [
  'authStore',
  'collaborationStore',
  'historyStore',
  'jobStore',
  'mapStore',
  'pageStore',
  'projectStore',
  'shareStore',
  'usageStore',
];

let hasError = false;

for (const storeName of STORE_MODULES) {
  const storePath = path.join(__dirname, '..', 'stores', storeName);
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const store = require(storePath);
  const fnNames = Object.entries(store)
    .filter(([, value]) => typeof value === 'function')
    .map(([name]) => name);

  const nonAsync = fnNames.filter((name) => !name.endsWith('Async'));
  if (nonAsync.length > 0) {
    hasError = true;
    console.error(
      `[store-export-async] ${storeName} exports non-async functions: ${nonAsync.join(', ')}`
    );
  }
}

if (hasError) {
  process.exit(1);
}

console.log('[store-export-async] Passed. Targeted stores export async-only APIs.');

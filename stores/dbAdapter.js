const db = require('../db');

const runtime = db.runtime || {
  requestedProvider: 'sqlite',
  activeProvider: 'sqlite',
  supportedProviders: ['sqlite'],
  fallback: false,
};

function ensureSupportedRuntime() {
  if (runtime.activeProvider !== 'sqlite') {
    throw new Error(
      `DB runtime "${runtime.activeProvider}" is not implemented in store adapter yet.`
    );
  }
}

function queryOne(sql, params = []) {
  ensureSupportedRuntime();
  return db.prepare(sql).get(...params) || null;
}

function queryAll(sql, params = []) {
  ensureSupportedRuntime();
  return db.prepare(sql).all(...params);
}

function execute(sql, params = []) {
  ensureSupportedRuntime();
  return db.prepare(sql).run(...params);
}

function transaction(fn) {
  ensureSupportedRuntime();
  return db.transaction(fn);
}

function placeholders(count) {
  return new Array(Math.max(0, count)).fill('?').join(', ');
}

module.exports = {
  runtime,
  queryOne,
  queryAll,
  execute,
  transaction,
  placeholders,
};

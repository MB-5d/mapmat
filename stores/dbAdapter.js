const { AsyncLocalStorage } = require('async_hooks');
const { Pool } = require('pg');
const db = require('../db');

const runtime = db.runtime || {
  requestedProvider: 'sqlite',
  activeProvider: 'sqlite',
  supportedProviders: ['sqlite'],
  fallback: false,
};

const txStorage = new AsyncLocalStorage();
let pgPool = null;

function ensureSqliteRuntime() {
  if (runtime.activeProvider !== 'sqlite') {
    throw new Error(
      `DB runtime "${runtime.activeProvider}" is not implemented in sync store adapter APIs.`
    );
  }
}

function ensurePostgresPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for postgres runtime.');
  }
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
    });
  }
  return pgPool;
}

function toPostgresSql(sql) {
  let index = 0;
  return String(sql || '').replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

async function runPostgresQuery(sql, params = []) {
  const text = toPostgresSql(sql);
  const txClient = txStorage.getStore() || null;
  if (txClient) return txClient.query(text, params);
  return ensurePostgresPool().query(text, params);
}

function queryOneSync(sql, params = []) {
  ensureSqliteRuntime();
  return db.prepare(sql).get(...params) || null;
}

function queryAllSync(sql, params = []) {
  ensureSqliteRuntime();
  return db.prepare(sql).all(...params);
}

function executeSync(sql, params = []) {
  ensureSqliteRuntime();
  return db.prepare(sql).run(...params);
}


async function queryOneAsync(sql, params = []) {
  if (runtime.activeProvider === 'sqlite') {
    return queryOneSync(sql, params);
  }
  const result = await runPostgresQuery(sql, params);
  return result.rows[0] || null;
}

async function queryAllAsync(sql, params = []) {
  if (runtime.activeProvider === 'sqlite') {
    return queryAllSync(sql, params);
  }
  const result = await runPostgresQuery(sql, params);
  return result.rows;
}

async function executeAsync(sql, params = []) {
  if (runtime.activeProvider === 'sqlite') {
    return executeSync(sql, params);
  }
  const result = await runPostgresQuery(sql, params);
  return {
    changes: Number(result.rowCount || 0),
    lastInsertRowid: null,
  };
}

function transactionAsync(fn) {
  if (runtime.activeProvider === 'sqlite') {
    return async (...args) => {
      db.exec('BEGIN');
      try {
        const result = await fn(...args);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // Ignore rollback errors.
        }
        throw error;
      }
    };
  }

  return async (...args) => {
    const pool = ensurePostgresPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await txStorage.run(client, () => fn(...args));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback errors.
      }
      throw error;
    } finally {
      client.release();
    }
  };
}

function placeholders(count) {
  return new Array(Math.max(0, count)).fill('?').join(', ');
}

module.exports = {
  runtime,
  queryOneAsync,
  queryAllAsync,
  executeAsync,
  transactionAsync,
  placeholders,
};

#!/usr/bin/env node

/* eslint-disable no-console */

const DEFAULT_PARITY_URL = 'http://localhost:4002/health/db/parity';
const PARITY_URL = process.env.PARITY_URL || DEFAULT_PARITY_URL;

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.text();
    let json = null;
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error(`Expected JSON from ${url}, got: ${body.slice(0, 300)}`);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(json)}`);
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

async function run() {
  console.log(`[db-parity] Checking ${PARITY_URL}`);
  const payload = await fetchJson(PARITY_URL);
  const parity = payload?.postgresParity || {};
  const rows = Array.isArray(parity.tables) ? parity.tables : [];
  const mismatches = rows.filter((row) => !row.match);

  console.table(rows.map((row) => ({
    table: row.table,
    sqlite: row.sqlite,
    postgres: row.postgres,
    match: row.match,
  })));

  const summary = {
    ok: Boolean(payload?.ok),
    runtime: payload?.runtime || null,
    configured: Boolean(parity.configured),
    reachable: Boolean(parity.reachable),
    allMatch: Boolean(parity.allMatch),
    mismatchCount: mismatches.length,
    error: parity.error || null,
  };
  console.log('[db-parity] Summary:', summary);

  if (!summary.ok || !summary.configured || !summary.reachable || !summary.allMatch) {
    throw new Error('DB parity check failed.');
  }

  console.log('[db-parity] Passed.');
}

run().catch((error) => {
  console.error('[db-parity] Failed:', error.message);
  process.exit(1);
});

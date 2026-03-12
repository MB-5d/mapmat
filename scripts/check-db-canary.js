#!/usr/bin/env node

/* eslint-disable no-console */

const DEFAULT_HEALTH_URL = 'http://localhost:4002/health/db';
const DEFAULT_PARITY_URL = 'http://localhost:4002/health/db/parity';

const HEALTH_DB_URL = process.env.HEALTH_DB_URL || DEFAULT_HEALTH_URL;
const PARITY_URL = process.env.PARITY_URL || DEFAULT_PARITY_URL;

const REQUIRE_RUNTIME = process.env.REQUIRE_RUNTIME || 'sqlite';
const REQUIRE_RUNTIME_REQUESTED = process.env.REQUIRE_RUNTIME_REQUESTED || 'postgres';
const EXPECT_RUNTIME_FALLBACK = !['0', 'false', 'no', 'off'].includes(
  String(process.env.EXPECT_RUNTIME_FALLBACK || 'true').trim().toLowerCase()
);
const PARITY_MAX_TOTAL_DRIFT = Number(process.env.PARITY_MAX_TOTAL_DRIFT || 0);

async function fetchJson(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.text();
    let json = null;
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error(`Expected JSON from ${url}, got: ${body.slice(0, 200)}`);
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
  console.log(`[db-canary] Checking health: ${HEALTH_DB_URL}`);
  const health = await fetchJson(HEALTH_DB_URL);
  const pg = health?.postgres || {};
  const healthSummary = {
    ok: Boolean(health?.ok),
    runtime: health?.runtime || null,
    runtimeRequested: health?.runtimeRequested || null,
    runtimeFallback: Boolean(health?.runtimeFallback),
    configured: Boolean(pg.configured),
    reachable: Boolean(pg.reachable),
    missingTableCount: Array.isArray(pg.missingTables) ? pg.missingTables.length : null,
    error: pg.error || null,
  };
  console.log('[db-canary] Health summary:', healthSummary);

  if (!healthSummary.ok) throw new Error('Health `ok` is false.');
  if (healthSummary.runtime !== REQUIRE_RUNTIME) {
    throw new Error(`Expected runtime="${REQUIRE_RUNTIME}", got "${healthSummary.runtime}".`);
  }
  if (healthSummary.runtimeRequested !== REQUIRE_RUNTIME_REQUESTED) {
    throw new Error(
      `Expected runtimeRequested="${REQUIRE_RUNTIME_REQUESTED}", got "${healthSummary.runtimeRequested}".`
    );
  }
  if (healthSummary.runtimeFallback !== EXPECT_RUNTIME_FALLBACK) {
    throw new Error(
      `Expected runtimeFallback=${EXPECT_RUNTIME_FALLBACK}, got ${healthSummary.runtimeFallback}.`
    );
  }
  if (!healthSummary.configured || !healthSummary.reachable || healthSummary.missingTableCount !== 0) {
    throw new Error('Postgres readiness failed.');
  }

  console.log(`[db-canary] Checking parity: ${PARITY_URL}`);
  const parityPayload = await fetchJson(PARITY_URL, 15000);
  const parity = parityPayload?.postgresParity || {};
  const rows = Array.isArray(parity.tables) ? parity.tables : [];
  const mismatches = rows.filter((row) => !row.match);
  const totalDrift = mismatches.reduce((sum, row) => {
    const sqlite = Number(row.sqlite);
    const postgres = Number(row.postgres);
    if (!Number.isFinite(sqlite) || !Number.isFinite(postgres)) return sum;
    return sum + Math.abs(sqlite - postgres);
  }, 0);
  console.table(rows.map((row) => ({
    table: row.table,
    sqlite: row.sqlite,
    postgres: row.postgres,
    match: row.match,
  })));
  const paritySummary = {
    ok: Boolean(parityPayload?.ok),
    runtime: parityPayload?.runtime || null,
    configured: Boolean(parity.configured),
    reachable: Boolean(parity.reachable),
    allMatch: Boolean(parity.allMatch),
    mismatchCount: mismatches.length,
    totalDrift,
    maxTotalDrift: PARITY_MAX_TOTAL_DRIFT,
    error: parity.error || null,
  };
  console.log('[db-canary] Parity summary:', paritySummary);

  const parityWithinTolerance = paritySummary.allMatch || totalDrift <= PARITY_MAX_TOTAL_DRIFT;
  if (!paritySummary.ok || !paritySummary.configured || !paritySummary.reachable || !parityWithinTolerance) {
    throw new Error('Parity check failed.');
  }

  console.log('[db-canary] Passed.');
}

run().catch((error) => {
  console.error('[db-canary] Failed:', error.message);
  process.exit(1);
});

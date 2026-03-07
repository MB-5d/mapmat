#!/usr/bin/env node

/* eslint-disable no-console */

const DEFAULT_HEALTH_URL = 'http://localhost:4002/health/db';
const HEALTH_DB_URL = process.env.HEALTH_DB_URL || DEFAULT_HEALTH_URL;
const REQUIRE_RUNTIME = process.env.REQUIRE_RUNTIME || '';
const REQUIRE_RUNTIME_REQUESTED = process.env.REQUIRE_RUNTIME_REQUESTED || '';
const EXPECT_RUNTIME_FALLBACK_RAW = process.env.EXPECT_RUNTIME_FALLBACK;
const REQUIRE_POSTGRES_READY = !['0', 'false', 'no', 'off'].includes(
  String(process.env.REQUIRE_POSTGRES_READY || 'true').trim().toLowerCase()
);

function parseOptionalBool(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Invalid boolean value "${value}"`);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
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
  console.log(`[db-health] Checking ${HEALTH_DB_URL}`);
  const payload = await fetchJson(HEALTH_DB_URL);
  const pg = payload?.postgres || {};
  const summary = {
    ok: Boolean(payload?.ok),
    runtime: payload?.runtime || null,
    runtimeRequested: payload?.runtimeRequested || null,
    runtimeFallback: Boolean(payload?.runtimeFallback),
    configured: Boolean(pg.configured),
    reachable: Boolean(pg.reachable),
    missingTableCount: Array.isArray(pg.missingTables) ? pg.missingTables.length : null,
    error: pg.error || null,
  };

  console.log('[db-health] Summary:', summary);

  if (!summary.ok) {
    throw new Error('Service health check failed (`ok` is false).');
  }

  if (REQUIRE_RUNTIME && summary.runtime !== REQUIRE_RUNTIME) {
    throw new Error(
      `Expected runtime "${REQUIRE_RUNTIME}" but got "${summary.runtime}".`
    );
  }

  if (REQUIRE_RUNTIME_REQUESTED && summary.runtimeRequested !== REQUIRE_RUNTIME_REQUESTED) {
    throw new Error(
      `Expected runtimeRequested "${REQUIRE_RUNTIME_REQUESTED}" but got "${summary.runtimeRequested}".`
    );
  }

  const expectedFallback = parseOptionalBool(EXPECT_RUNTIME_FALLBACK_RAW);
  if (expectedFallback !== null && summary.runtimeFallback !== expectedFallback) {
    throw new Error(
      `Expected runtimeFallback=${expectedFallback} but got runtimeFallback=${summary.runtimeFallback}.`
    );
  }

  if (REQUIRE_POSTGRES_READY) {
    if (!summary.configured || !summary.reachable || summary.missingTableCount !== 0) {
      throw new Error('Postgres readiness check failed.');
    }
  }

  console.log('[db-health] Passed.');
}

run().catch((error) => {
  console.error('[db-health] Failed:', error.message);
  process.exit(1);
});

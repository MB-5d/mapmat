#!/usr/bin/env node

const { probePostgres, REQUIRED_TABLES } = require('../utils/postgresProbe');

const DATABASE_URL = process.env.DATABASE_URL;

async function run() {
  const startedAt = Date.now();
  const result = await probePostgres(DATABASE_URL);
  const elapsedMs = Date.now() - startedAt;

  console.log('[pg-check] Required tables:', REQUIRED_TABLES.join(', '));
  console.log('[pg-check] Result:', {
    configured: result.configured,
    reachable: result.reachable,
    missingTableCount: result.missingTables.length,
    elapsedMs,
  });

  if (!result.configured || !result.reachable || result.missingTables.length) {
    if (result.error) console.error('[pg-check] Error:', result.error);
    if (result.missingTables.length) {
      console.error('[pg-check] Missing tables:', result.missingTables.join(', '));
    }
    process.exit(1);
  }

  console.log('[pg-check] PostgreSQL readiness check passed.');
}

run().catch((error) => {
  console.error('[pg-check] Unexpected error:', error);
  process.exit(1);
});


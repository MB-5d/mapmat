#!/usr/bin/env node

/* eslint-disable no-console */

const HEALTH_URL = process.env.COEDITING_HEALTH_URL || 'http://localhost:4002/health/coediting';
const EXPECT_STATUSES = String(process.env.COEDITING_EXPECT_STATUSES || 'disabled,healthy,read_only')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

async function main() {
  const response = await fetch(HEALTH_URL);
  if (!response.ok) {
    throw new Error(`Health request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || payload.ok !== true) {
    throw new Error('Coediting health payload did not report ok=true');
  }
  if (!EXPECT_STATUSES.includes(payload.status)) {
    throw new Error(`Unexpected coediting status: ${payload.status}`);
  }
  if (!payload.health || !payload.rollout) {
    throw new Error('Coediting health payload is missing health/rollout sections');
  }

  console.log('[coediting-health] Passed.', {
    url: HEALTH_URL,
    status: payload.status,
    readOnlyFallbackActive: !!payload.health.readOnlyFallbackActive,
  });
}

main().catch((error) => {
  console.error('[coediting-health] Failed:', error.message);
  process.exit(1);
});

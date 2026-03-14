#!/usr/bin/env node

/* eslint-disable no-console */

const {
  splitCsv,
  fetchJsonWithRetries,
  validatePublicHealthPayload,
} = require('./lib/coeditingHealthCheckUtils');

const HEALTH_URL = process.env.COEDITING_HEALTH_URL || 'http://localhost:4002/health/coediting';
const EXPECT_STATUSES = splitCsv(
  process.env.COEDITING_EXPECT_STATUSES,
  ['disabled', 'healthy', 'read_only']
);

async function main() {
  const payload = await fetchJsonWithRetries(HEALTH_URL, {
    label: 'coediting health request',
  });
  const summary = validatePublicHealthPayload(payload, {
    expectedStatuses: EXPECT_STATUSES,
  });

  console.log('[coediting-health] Passed.', {
    url: HEALTH_URL,
    status: summary.status,
    readOnlyFallbackActive: summary.readOnlyFallbackActive,
  });
}

main().catch((error) => {
  console.error('[coediting-health] Failed:', error.message);
  process.exit(1);
});

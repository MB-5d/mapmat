#!/usr/bin/env node

/* eslint-disable no-console */

const {
  parseEnvBool,
  splitCsv,
  parseNonNegativeInt,
  fetchJsonWithRetries,
  validatePublicHealthPayload,
  validateAdminCanaryPayload,
} = require('./lib/coeditingHealthCheckUtils');

const HEALTH_URL = process.env.COEDITING_HEALTH_URL || 'http://localhost:4002/health/coediting';
const ADMIN_URL = process.env.COEDITING_ADMIN_URL || '';
const ADMIN_KEY = process.env.COEDITING_ADMIN_KEY || '';
const EXPECT_PUBLIC_STATUSES = splitCsv(process.env.COEDITING_EXPECT_PUBLIC_STATUSES, ['healthy']);
const EXPECT_ADMIN_STATUSES = splitCsv(process.env.COEDITING_EXPECT_ADMIN_STATUSES, ['healthy']);
const REQUIRE_READ_ONLY_FALLBACK_INACTIVE = parseEnvBool(
  process.env.COEDITING_REQUIRE_READ_ONLY_FALLBACK_INACTIVE,
  true
);
const REQUIRE_EXPERIMENT_ENABLED = parseEnvBool(process.env.COEDITING_REQUIRE_EXPERIMENT_ENABLED, true);
const REQUIRE_SYNC_ENGINE_ENABLED = parseEnvBool(process.env.COEDITING_REQUIRE_SYNC_ENGINE_ENABLED, true);
const REQUIRE_ROLLOUT_ENABLED = parseEnvBool(process.env.COEDITING_REQUIRE_ROLLOUT_ENABLED, true);
const REQUIRE_DISTRIBUTED_SOURCE = parseEnvBool(process.env.COEDITING_REQUIRE_DISTRIBUTED_SOURCE, true);
const MAX_RECENT_CONFLICTS = parseNonNegativeInt(process.env.COEDITING_MAX_RECENT_CONFLICTS, 20);
const MAX_RECENT_RECONNECTS = parseNonNegativeInt(process.env.COEDITING_MAX_RECENT_RECONNECTS, 5);
const MAX_RECENT_DROPPED = parseNonNegativeInt(process.env.COEDITING_MAX_RECENT_DROPPED, 5);
const MAX_RECENT_READ_ONLY_BLOCKS = parseNonNegativeInt(
  process.env.COEDITING_MAX_RECENT_READ_ONLY_BLOCKS,
  0
);
const MIN_SCOPED_ENTITIES = parseNonNegativeInt(process.env.COEDITING_MIN_SCOPED_ENTITIES, 1);

async function main() {
  if (!ADMIN_URL) {
    throw new Error('COEDITING_ADMIN_URL is required');
  }
  if (!ADMIN_KEY) {
    throw new Error('COEDITING_ADMIN_KEY is required');
  }

  const publicPayload = await fetchJsonWithRetries(HEALTH_URL, {
    label: 'coediting health request',
  });
  const publicSummary = validatePublicHealthPayload(publicPayload, {
    expectedStatuses: EXPECT_PUBLIC_STATUSES,
    requireReadOnlyFallbackInactive: REQUIRE_READ_ONLY_FALLBACK_INACTIVE,
  });

  const adminPayload = await fetchJsonWithRetries(ADMIN_URL, {
    label: 'coediting admin request',
    headers: {
      'x-admin-key': ADMIN_KEY,
    },
  });
  const adminSummary = validateAdminCanaryPayload(adminPayload, {
    expectedStatuses: EXPECT_ADMIN_STATUSES,
    requireReadOnlyFallbackInactive: REQUIRE_READ_ONLY_FALLBACK_INACTIVE,
    requireExperimentEnabled: REQUIRE_EXPERIMENT_ENABLED,
    requireSyncEngineEnabled: REQUIRE_SYNC_ENGINE_ENABLED,
    requireRolloutEnabled: REQUIRE_ROLLOUT_ENABLED,
    requireDistributedSource: REQUIRE_DISTRIBUTED_SOURCE,
    maxRecentConflicts: MAX_RECENT_CONFLICTS,
    maxRecentReconnects: MAX_RECENT_RECONNECTS,
    maxRecentDropped: MAX_RECENT_DROPPED,
    maxRecentReadOnlyBlocks: MAX_RECENT_READ_ONLY_BLOCKS,
    minScopedEntities: MIN_SCOPED_ENTITIES,
  });

  console.log('[coediting-canary] Passed.', {
    healthUrl: HEALTH_URL,
    adminUrl: ADMIN_URL,
    publicStatus: publicSummary.status,
    adminStatus: adminSummary.status,
    source: adminSummary.source,
    scopedEntities: adminSummary.scopedEntities,
    conflictsRecent: adminSummary.conflictsRecent,
    reconnectsRecent: adminSummary.reconnectsRecent,
    droppedRecent: adminSummary.droppedRecent,
    readOnlyBlocksRecent: adminSummary.readOnlyBlocksRecent,
  });
}

main().catch((error) => {
  console.error('[coediting-canary] Failed:', error.message);
  process.exit(1);
});

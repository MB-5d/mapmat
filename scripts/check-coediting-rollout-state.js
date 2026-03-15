#!/usr/bin/env node

/* eslint-disable no-console */

const {
  parseEnvBool,
  fetchCoeditingCanarySampleAsync,
  buildCoeditingRolloutStateSummary,
  diffCoeditingRolloutStateSummaries,
} = require('./lib/coeditingHealthCheckUtils');

function createRolloutStateCompareConfig(env = process.env) {
  return {
    left: {
      label: env.COEDITING_LEFT_NAME || 'staging',
      healthUrl: env.COEDITING_LEFT_HEALTH_URL || 'https://mapmat-staging.up.railway.app/health/coediting',
      adminUrl: env.COEDITING_LEFT_ADMIN_URL || 'https://mapmat-staging.up.railway.app/api/admin/coediting',
      adminKey: env.COEDITING_LEFT_ADMIN_KEY || env.COEDITING_STAGING_ADMIN_KEY || '',
    },
    right: {
      label: env.COEDITING_RIGHT_NAME || 'production',
      healthUrl: env.COEDITING_RIGHT_HEALTH_URL || 'https://mapmat-production.up.railway.app/health/coediting',
      adminUrl: env.COEDITING_RIGHT_ADMIN_URL || 'https://mapmat-production.up.railway.app/api/admin/coediting',
      adminKey: env.COEDITING_RIGHT_ADMIN_KEY || env.COEDITING_PRODUCTION_ADMIN_KEY || '',
    },
    requireNoDiff: parseEnvBool(env.COEDITING_REQUIRE_NO_DIFF, false),
  };
}

async function fetchEnvironmentStateAsync(config) {
  const sample = await fetchCoeditingCanarySampleAsync({
    healthUrl: config.healthUrl,
    adminUrl: config.adminUrl,
    adminKey: config.adminKey,
  });

  return buildCoeditingRolloutStateSummary({
    label: config.label,
    publicPayload: sample.publicPayload,
    adminPayload: sample.adminPayload,
  });
}

async function main() {
  const config = createRolloutStateCompareConfig();
  const [leftSummary, rightSummary] = await Promise.all([
    fetchEnvironmentStateAsync(config.left),
    fetchEnvironmentStateAsync(config.right),
  ]);
  const differences = diffCoeditingRolloutStateSummaries(leftSummary, rightSummary);

  console.log('[coediting-rollout-state] Summaries.', {
    left: leftSummary,
    right: rightSummary,
    deltaCount: differences.length,
  });

  if (differences.length > 0) {
    console.log('[coediting-rollout-state] Deltas.', differences);
  } else {
    console.log('[coediting-rollout-state] No rollout policy deltas detected.');
  }

  if (config.requireNoDiff && differences.length > 0) {
    throw new Error(`Found ${differences.length} rollout policy delta(s).`);
  }
}

main().catch((error) => {
  console.error('[coediting-rollout-state] Failed:', error.message);
  process.exit(1);
});

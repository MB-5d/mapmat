#!/usr/bin/env node

/* eslint-disable no-console */

const {
  createCanaryGateConfigFromEnv,
  fetchCoeditingCanarySampleAsync,
  validateCoeditingCanarySample,
} = require('./lib/coeditingHealthCheckUtils');

async function main() {
  const gateConfig = createCanaryGateConfigFromEnv();
  const sample = await fetchCoeditingCanarySampleAsync(gateConfig);
  const { publicSummary, adminSummary } = validateCoeditingCanarySample(sample, gateConfig);

  console.log('[coediting-canary] Passed.', {
    healthUrl: gateConfig.healthUrl,
    adminUrl: gateConfig.adminUrl,
    publicStatus: publicSummary.status,
    adminStatus: adminSummary.status,
    configValid: adminSummary.configValid,
    instanceAgreementStatus: adminSummary.instanceAgreementStatus,
    allowGlobalRollout: adminSummary.allowGlobalRollout,
    globalRolloutApproved: adminSummary.globalRolloutApproved,
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

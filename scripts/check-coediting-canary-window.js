#!/usr/bin/env node

/* eslint-disable no-console */

const {
  createCanaryGateConfigFromEnv,
  createCanaryWindowConfigFromEnv,
  fetchCoeditingCanarySampleAsync,
  runCoeditingCanaryWindowCheckAsync,
} = require('./lib/coeditingHealthCheckUtils');

async function main() {
  const gateConfig = createCanaryGateConfigFromEnv();
  const windowConfig = createCanaryWindowConfigFromEnv();

  const result = await runCoeditingCanaryWindowCheckAsync({
    fetchSampleAsync: async () => fetchCoeditingCanarySampleAsync(gateConfig),
    gateConfig,
    windowMs: windowConfig.windowSec * 1000,
    pollIntervalMs: windowConfig.pollIntervalSec * 1000,
    minSamples: windowConfig.minSamples,
    requireStableScopeCount: windowConfig.requireStableScopeCount,
    onSample: (sample) => {
      console.log('[coediting-canary-window] Sample ok.', {
        sample: sample.index,
        publicStatus: sample.publicSummary.status,
        adminStatus: sample.adminSummary.status,
        configValid: sample.adminSummary.configValid,
        source: sample.adminSummary.source,
        scopedEntities: sample.adminSummary.scopedEntities,
        conflictsRecent: sample.adminSummary.conflictsRecent,
        reconnectsRecent: sample.adminSummary.reconnectsRecent,
        droppedRecent: sample.adminSummary.droppedRecent,
        readOnlyBlocksRecent: sample.adminSummary.readOnlyBlocksRecent,
      });
    },
  });

  console.log('[coediting-canary-window] Passed.', {
    healthUrl: gateConfig.healthUrl,
    adminUrl: gateConfig.adminUrl,
    windowSec: windowConfig.windowSec,
    pollIntervalSec: windowConfig.pollIntervalSec,
    minSamples: windowConfig.minSamples,
    sampleCount: result.sampleCount,
    durationMs: result.durationMs,
    configValid: result.samples.every((sample) => sample.adminSummary.configValid),
    scopedEntities: result.baseline?.scopedEntities || 0,
    source: result.baseline?.source || null,
    maxConflictsRecent: result.maxConflictsRecent,
    maxReconnectsRecent: result.maxReconnectsRecent,
    maxDroppedRecent: result.maxDroppedRecent,
    maxReadOnlyBlocksRecent: result.maxReadOnlyBlocksRecent,
  });
}

main().catch((error) => {
  console.error('[coediting-canary-window] Failed:', error.message);
  process.exit(1);
});

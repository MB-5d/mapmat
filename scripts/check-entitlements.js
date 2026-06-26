const assert = require('assert');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');

process.env.DB_PATH = path.join(os.tmpdir(), `vellic-entitlements-${process.pid}-${Date.now()}.db`);
process.env.TEST_AUTH_ENABLED = 'false';

const authStore = require('../stores/authStore');
const billingStore = require('../stores/billingStore');
const mapStore = require('../stores/mapStore');
const projectStore = require('../stores/projectStore');
const {
  ACTIONS,
  METERS,
  resolveAccountEntitlementsAsync,
  checkAccountActionAsync,
  recordMeterDebitAsync,
  getScreenshotCreditCost,
} = require('../utils/entitlements');

function parseSqlUtcTimestamp(value) {
  return new Date(`${String(value || '').replace(' ', 'T')}Z`).getTime();
}

async function main() {
  const email = `entitlements-${Date.now()}@example.test`;
  const user = await authStore.createUserAsync({
    email,
    passwordHash: 'test',
    name: 'Entitlements Test',
    emailVerifiedAt: new Date().toISOString(),
  });

  const summary = await resolveAccountEntitlementsAsync(user);
  assert.equal(summary.plan.key, 'free');
  assert.equal(summary.account.state, 'active');
  assert.equal(summary.meters.activePages.limit, 1000);
  assert.equal(summary.meters.screenshotCredits.included, 25);
  assert.equal(summary.meters.downloads.included, 5);
  assert.equal(summary.limits.activeProjects.limit, 1);
  assert.equal(summary.limits.activeMaps.unlimited, true);
  assert.equal(summary.limits.activeMaps.used, 0);
  assert.equal(summary.limits.editors.used, 1);
  assert.equal(summary.limits.editors.remaining, 0);
  assert.equal(summary.limits.scanPagesPerRun.limit, 100);
  assert.equal(summary.screenshotCreditCosts.desktop_full_page, 1);
  assert.equal(getScreenshotCreditCost({ type: 'full' }), 1);

  const freeScanCheck = await checkAccountActionAsync(user, ACTIONS.scanStart, { requestedPages: 5000 });
  assert.equal(freeScanCheck.allowed, true);
  assert.equal(freeScanCheck.allowedQuantity, 100);
  assert.equal(freeScanCheck.capped, true);

  const freeScreenshotCheck = await checkAccountActionAsync(user, ACTIONS.screenshotCapture, { credits: 26 });
  assert.equal(freeScreenshotCheck.allowed, false);
  assert.equal(freeScreenshotCheck.code, 'ENTITLEMENT_REQUIRED');
  const freeEditorInviteCheck = await checkAccountActionAsync(user, ACTIONS.seatInvite);
  assert.equal(freeEditorInviteCheck.allowed, false);
  assert.equal(freeEditorInviteCheck.code, 'ENTITLEMENT_REQUIRED');
  const freeXmlDownloadCheck = await checkAccountActionAsync(user, ACTIONS.organizedExportCreate, { eventType: 'export_xml' });
  assert.equal(freeXmlDownloadCheck.allowed, true);
  const freeIndexDownloadCheck = await checkAccountActionAsync(user, ACTIONS.organizedExportCreate, { eventType: 'export_site_index' });
  assert.equal(freeIndexDownloadCheck.allowed, true);
  const freePdfDownloadCheck = await checkAccountActionAsync(user, ACTIONS.organizedExportCreate, { eventType: 'export_report_pdf' });
  assert.equal(freePdfDownloadCheck.allowed, false);
  assert.equal(freePdfDownloadCheck.code, 'DOWNLOAD_FORMAT_PLAN_REQUIRED');
  const freeViewerShareCheck = await checkAccountActionAsync(user, ACTIONS.shareCreate, { accessLevel: 'view' });
  assert.equal(freeViewerShareCheck.allowed, true);
  const freeCommentShareCheck = await checkAccountActionAsync(user, ACTIONS.shareCreate, { accessLevel: 'comment' });
  assert.equal(freeCommentShareCheck.allowed, true);
  const freeEditShareCheck = await checkAccountActionAsync(user, ACTIONS.shareCreate, { accessLevel: 'edit' });
  assert.equal(freeEditShareCheck.allowed, false);
  assert.equal(freeEditShareCheck.code, 'ENTITLEMENT_REQUIRED');
  const exactPageLimitMapWriteCheck = await checkAccountActionAsync(user, ACTIONS.mapWrite, { pageDelta: 1000 });
  assert.equal(exactPageLimitMapWriteCheck.allowed, true);

  const tierUser = await authStore.createUserAsync({
    email: `entitlements-tier-${Date.now()}@example.test`,
    passwordHash: 'test',
    name: 'Entitlements Tier Fixture Test',
    emailVerifiedAt: new Date().toISOString(),
  });
  const tierAccount = (await resolveAccountEntitlementsAsync(tierUser)).account;
  for (const [planKey, expectedAllowedQuantity, expectedResolvedPlanKey = planKey] of [
    ['free', 100],
    ['pro', 10000],
    ['studio', 50000],
    ['agency', 200000],
    ['solo', 10000, 'pro'],
  ]) {
    await billingStore.updateBillingAccountForAdminAsync({
      accountId: tierAccount.id,
      planKey,
      accountState: 'active',
      trialState: 'none',
      trialKind: null,
      trialStartedAt: null,
      trialEndsAt: null,
    });
    const tierSummary = await resolveAccountEntitlementsAsync(tierUser);
    assert.equal(tierSummary.plan.key, expectedResolvedPlanKey);
    const tierScanCheck = await checkAccountActionAsync(tierUser, ACTIONS.scanStart, { requestedPages: 300000 });
    assert.equal(tierScanCheck.allowed, true);
    assert.equal(tierScanCheck.allowedQuantity, expectedAllowedQuantity);
    assert.equal(tierScanCheck.capped, true);
  }

  await billingStore.updateBillingAccountForAdminAsync({
    accountId: tierAccount.id,
    planKey: 'test_unlimited',
    accountState: 'active',
    trialState: 'none',
    trialKind: null,
    trialStartedAt: null,
    trialEndsAt: null,
  });
  const testUnlimited = await resolveAccountEntitlementsAsync(tierUser);
  assert.equal(testUnlimited.plan.key, 'test_unlimited');
  assert.equal(testUnlimited.plan.name, 'Test Unlimited');
  assert.equal(testUnlimited.meters.activePages.unlimited, true);
  assert.equal(testUnlimited.meters.screenshotCredits.unlimited, true);
  assert.equal(testUnlimited.meters.downloads.unlimited, true);
  assert.equal(testUnlimited.limits.activeProjects.unlimited, true);
  assert.equal(testUnlimited.limits.editors.unlimited, true);
  assert.equal(testUnlimited.limits.scanPagesPerRun.unlimited, true);
  assert.equal(testUnlimited.features.clientShareLinks, true);
  assert.equal(testUnlimited.features.scheduledRescans, true);

  const testUnlimitedScanCheck = await checkAccountActionAsync(tierUser, ACTIONS.scanStart, { requestedPages: 300000 });
  assert.equal(testUnlimitedScanCheck.allowed, true);
  assert.equal(testUnlimitedScanCheck.allowedQuantity, 300000);
  assert.equal(testUnlimitedScanCheck.capped, false);
  const testUnlimitedScreenshotCheck = await checkAccountActionAsync(tierUser, ACTIONS.screenshotCapture, { credits: 99999 });
  assert.equal(testUnlimitedScreenshotCheck.allowed, true);
  assert.equal(testUnlimitedScreenshotCheck.allowedQuantity, 99999);

  await recordMeterDebitAsync({
    user,
    accountSummary: summary,
    meter: METERS.screenshotCredits,
    quantity: 3,
    idempotencyKey: 'entitlements-test:screenshot',
    metadata: { test: true },
  });
  await recordMeterDebitAsync({
    user,
    accountSummary: summary,
    meter: METERS.screenshotCredits,
    quantity: 3,
    idempotencyKey: 'entitlements-test:screenshot',
    metadata: { test: true },
  });

  const afterDebit = await resolveAccountEntitlementsAsync(user);
  assert.equal(afterDebit.meters.screenshotCredits.used, 3);
  assert.equal(afterDebit.meters.screenshotCredits.remaining, 22);

  await mapStore.createMapAsync({
    id: randomUUID(),
    userId: user.id,
    accountId: summary.account.id,
    projectId: null,
    name: 'Full free page allowance',
    notes: null,
    url: 'https://example.test',
    rootData: JSON.stringify({ id: 'root', url: 'https://example.test' }),
    orphansData: null,
    connectionsData: null,
    colors: null,
    connectionColors: null,
    pageCount: 1000,
  });
  const afterPageUse = await resolveAccountEntitlementsAsync(user);
  assert.equal(afterPageUse.meters.activePages.used, 1000);
  assert.equal(afterPageUse.meters.activePages.remaining, 0);
  assert.equal(afterPageUse.limits.activeMaps.used, 1);
  const noGrowthPageLimitCheck = await checkAccountActionAsync(user, ACTIONS.mapWrite, { pageDelta: 0 });
  assert.equal(noGrowthPageLimitCheck.allowed, true);
  const pageLimitCheck = await checkAccountActionAsync(user, ACTIONS.mapWrite, { pageDelta: 1 });
  assert.equal(pageLimitCheck.allowed, false);
  assert.equal(pageLimitCheck.code, 'ENTITLEMENT_REQUIRED');

  await projectStore.createProjectAsync({
    id: randomUUID(),
    userId: user.id,
    accountId: summary.account.id,
    name: 'One project',
  });
  const projectCheck = await checkAccountActionAsync(user, ACTIONS.projectCreate);
  assert.equal(projectCheck.allowed, false);
  assert.equal(projectCheck.code, 'ENTITLEMENT_REQUIRED');

  await billingStore.startTrialAsync({
    accountId: summary.account.id,
    kind: 'personal',
    days: 7,
  });
  const personalTrial = await resolveAccountEntitlementsAsync(user);
  assert.equal(personalTrial.trial.active, true);
  assert.equal(personalTrial.trial.kind, 'personal');
  assert.equal(personalTrial.trial.effectivePlanKey, 'pro');
  assert.equal(personalTrial.meters.activePages.limit, 10000);
  assert.equal(personalTrial.meters.screenshotCredits.included, 15);
  assert.equal(personalTrial.meters.downloads.included, 15);
  assert.equal(personalTrial.trial.organizedDownloadsAllowed, true);
  assert.equal(personalTrial.limits.editors.limit, 1);
  assert.equal(personalTrial.limits.editors.used, 1);
  assert.equal(personalTrial.limits.editors.remaining, 0);
  const personalTrialEndsAt = parseSqlUtcTimestamp(personalTrial.trial.endsAt);
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  assert.ok(personalTrialEndsAt - Date.now() > sevenDaysMs - 60 * 1000);
  assert.ok(personalTrialEndsAt - Date.now() <= sevenDaysMs + 60 * 1000);

  const trialDownloadCheck = await checkAccountActionAsync(user, ACTIONS.organizedExportCreate);
  assert.equal(trialDownloadCheck.allowed, true);
  await recordMeterDebitAsync({
    user,
    accountSummary: personalTrial,
    meter: METERS.downloads,
    quantity: 1,
    idempotencyKey: 'entitlements-test:trial-download',
    metadata: { test: true },
  });
  const afterTrialDownload = await resolveAccountEntitlementsAsync(user);
  assert.equal(afterTrialDownload.meters.downloads.used, 1);
  assert.equal(afterTrialDownload.meters.downloads.remaining, 14);

  await billingStore.startTrialAsync({
    accountId: summary.account.id,
    kind: 'team',
    days: 7,
  });
  const teamTrial = await resolveAccountEntitlementsAsync(user);
  assert.equal(teamTrial.trial.active, true);
  assert.equal(teamTrial.trial.kind, 'team');
  assert.equal(teamTrial.limits.editors.limit, 4);
  assert.equal(teamTrial.limits.editors.used, 1);
  assert.equal(teamTrial.limits.editors.remaining, 3);

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await billingStore.updateBillingAccountForAdminAsync({
    accountId: summary.account.id,
    planKey: 'free',
    accountState: 'active',
    trialState: 'active',
    trialKind: 'team',
    trialStartedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
    trialEndsAt: yesterday,
    currentPeriodStartedAt: now,
    currentPeriodEndsAt: nextMonth,
    cancelAtPeriodEnd: false,
    archiveStartedAt: null,
    downloadAccessEndsAt: null,
    assetRetentionEndsAt: null,
    lightweightRetentionEndsAt: null,
  });
  const endedTrial = await resolveAccountEntitlementsAsync(user);
  assert.equal(endedTrial.trial.active, false);
  assert.equal(endedTrial.trial.state, 'active');
  assert.equal(endedTrial.trial.kind, 'team');
  assert.equal(endedTrial.plan.key, 'free');
  assert.equal(endedTrial.archived, false);

  await billingStore.updateBillingAccountForAdminAsync({
    accountId: summary.account.id,
    accountState: 'archived',
    cancelAtPeriodEnd: true,
    cancelledAt: yesterday,
    archiveStartedAt: now,
    downloadAccessEndsAt: nextMonth,
    assetRetentionEndsAt: nextMonth,
    lightweightRetentionEndsAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
  });
  const archivedSummary = await resolveAccountEntitlementsAsync(user);
  assert.equal(archivedSummary.archived, true);
  assert.equal(archivedSummary.account.state, 'archived');
  const archivedScanCheck = await checkAccountActionAsync(user, ACTIONS.scanStart, { requestedPages: 1 });
  assert.equal(archivedScanCheck.allowed, false);
  assert.equal(archivedScanCheck.code, 'ACCOUNT_ARCHIVED');

  console.log('Entitlement checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

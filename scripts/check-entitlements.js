const assert = require('assert');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');

process.env.DB_PATH = path.join(os.tmpdir(), `vellic-entitlements-${process.pid}-${Date.now()}.db`);
process.env.TEST_AUTH_ENABLED = 'false';

const authStore = require('../stores/authStore');
const billingStore = require('../stores/billingStore');
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
  assert.equal(summary.meters.crawlPages.included, 100);
  assert.equal(summary.meters.screenshotCredits.included, 0);
  assert.equal(summary.limits.activeProjects.limit, 1);
  assert.equal(summary.limits.scanPagesPerRun.limit, 25);
  assert.equal(summary.screenshotCreditCosts.desktop_full_page, 3);
  assert.equal(getScreenshotCreditCost({ type: 'full' }), 3);

  const freeScanCheck = await checkAccountActionAsync(user, ACTIONS.scanStart, { requestedPages: 5000 });
  assert.equal(freeScanCheck.allowed, true);
  assert.equal(freeScanCheck.allowedQuantity, 25);
  assert.equal(freeScanCheck.capped, true);

  const freeScreenshotCheck = await checkAccountActionAsync(user, ACTIONS.screenshotCapture, { credits: 1 });
  assert.equal(freeScreenshotCheck.allowed, false);
  assert.equal(freeScreenshotCheck.code, 'ENTITLEMENT_REQUIRED');

  const originalInternalTestingEmails = process.env.VELLIC_INTERNAL_TEST_ACCOUNT_EMAILS;
  const internalTestingEmail = 'vinyl103@gmail.com';
  process.env.VELLIC_INTERNAL_TEST_ACCOUNT_EMAILS = `Someone@Example.Test, ${internalTestingEmail.toUpperCase()}`;
  const internalTestingUser = await authStore.createUserAsync({
    email: internalTestingEmail,
    passwordHash: 'test',
    name: 'Internal Testing User',
    emailVerifiedAt: new Date().toISOString(),
  });
  const internalTestingSummary = await resolveAccountEntitlementsAsync(internalTestingUser);
  assert.equal(internalTestingSummary.internalTesting, true);
  assert.equal(internalTestingSummary.features.clientShareLinks, true);
  assert.equal(internalTestingSummary.meters.crawlPages.unlimited, true);
  assert.equal(internalTestingSummary.meters.screenshotCredits.unlimited, true);
  assert.equal(internalTestingSummary.meters.organizedExports.unlimited, true);
  assert.equal(internalTestingSummary.limits.activeProjects.unlimited, true);
  assert.equal(internalTestingSummary.limits.seats.unlimited, true);
  assert.equal(internalTestingSummary.limits.scanPagesPerRun.unlimited, true);
  const internalShareCheck = await checkAccountActionAsync(internalTestingUser, ACTIONS.shareCreate);
  assert.equal(internalShareCheck.allowed, true);

  const soloTierUser = await authStore.createUserAsync({
    email: `solo-tier-${Date.now()}@example.test`,
    passwordHash: 'test',
    name: 'Solo Tier User',
    emailVerifiedAt: new Date().toISOString(),
  });
  const soloTierAccount = await billingStore.getOrCreateBillingAccountForUserAsync(soloTierUser);
  await billingStore.updateBillingAccountForAdminAsync({
    accountId: soloTierAccount.id,
    planKey: 'solo',
    accountState: 'active',
    trialState: 'none',
  });
  const soloShareCheck = await checkAccountActionAsync(soloTierUser, ACTIONS.shareCreate);
  assert.equal(soloShareCheck.allowed, false);
  assert.equal(soloShareCheck.code, 'ENTITLEMENT_REQUIRED');
  if (originalInternalTestingEmails === undefined) {
    delete process.env.VELLIC_INTERNAL_TEST_ACCOUNT_EMAILS;
  } else {
    process.env.VELLIC_INTERNAL_TEST_ACCOUNT_EMAILS = originalInternalTestingEmails;
  }

  await recordMeterDebitAsync({
    user,
    accountSummary: summary,
    meter: METERS.crawlPages,
    quantity: 3,
    idempotencyKey: 'entitlements-test:crawl',
    metadata: { test: true },
  });
  await recordMeterDebitAsync({
    user,
    accountSummary: summary,
    meter: METERS.crawlPages,
    quantity: 3,
    idempotencyKey: 'entitlements-test:crawl',
    metadata: { test: true },
  });

  const afterDebit = await resolveAccountEntitlementsAsync(user);
  assert.equal(afterDebit.meters.crawlPages.used, 3);
  assert.equal(afterDebit.meters.crawlPages.remaining, 97);

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
  assert.equal(personalTrial.trial.effectivePlanKey, 'solo');
  assert.equal(personalTrial.meters.crawlPages.included, 1000);
  assert.equal(personalTrial.meters.crawlPages.graceLimit, 0);
  assert.equal(personalTrial.meters.screenshotCredits.included, 15);
  assert.equal(personalTrial.meters.organizedExports.included, 15);
  assert.equal(personalTrial.trial.organizedDownloadsAllowed, true);
  assert.equal(personalTrial.limits.seats.limit, 1);
  const personalTrialEndsAt = parseSqlUtcTimestamp(personalTrial.trial.endsAt);
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  assert.ok(personalTrialEndsAt - Date.now() > sevenDaysMs - 60 * 1000);
  assert.ok(personalTrialEndsAt - Date.now() <= sevenDaysMs + 60 * 1000);

  const trialDownloadCheck = await checkAccountActionAsync(user, ACTIONS.organizedExportCreate);
  assert.equal(trialDownloadCheck.allowed, true);
  await recordMeterDebitAsync({
    user,
    accountSummary: personalTrial,
    meter: METERS.organizedExports,
    quantity: 1,
    idempotencyKey: 'entitlements-test:trial-download',
    metadata: { test: true },
  });
  const afterTrialDownload = await resolveAccountEntitlementsAsync(user);
  assert.equal(afterTrialDownload.meters.organizedExports.used, 1);
  assert.equal(afterTrialDownload.meters.organizedExports.remaining, 14);

  await billingStore.startTrialAsync({
    accountId: summary.account.id,
    kind: 'team',
    days: 7,
  });
  const teamTrial = await resolveAccountEntitlementsAsync(user);
  assert.equal(teamTrial.trial.active, true);
  assert.equal(teamTrial.trial.kind, 'team');
  assert.equal(teamTrial.limits.seats.limit, 4);
  assert.equal(teamTrial.limits.seats.remaining, 3);

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

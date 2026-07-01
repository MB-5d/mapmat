#!/usr/bin/env node

/* eslint-disable no-console */

const bcrypt = require('bcryptjs');

const authStore = require('../stores/authStore');
const billingStore = require('../stores/billingStore');
const { resolveAccountEntitlementsAsync } = require('../utils/entitlements');

const PASSWORD = process.env.VELLIC_TEST_ACCOUNT_PASSWORD || 'Test1234!';
const TEST_ACCOUNTS = [
  { email: 'free@test.vellic.local', name: 'Free Tier Test', planKey: 'free' },
  { email: 'solo@test.vellic.local', name: 'Solo Tier Test', planKey: 'solo' },
  { email: 'pro@test.vellic.local', name: 'Pro Tier Test', planKey: 'pro' },
  { email: 'studio@test.vellic.local', name: 'Studio Tier Test', planKey: 'studio' },
  { email: 'agency@test.vellic.local', name: 'Agency Tier Test', planKey: 'agency' },
];

async function upsertTestUser({ email, name, planKey }, passwordHash) {
  let user = await authStore.getUserByEmailAsync(email);
  if (user) {
    user = await authStore.updateSeedUserCredentialsAsync({
      userId: user.id,
      passwordHash,
      name,
    });
  } else {
    user = await authStore.createUserAsync({
      email,
      passwordHash,
      name,
      emailVerifiedAt: new Date().toISOString(),
      emailVerificationRequired: false,
      authProvider: 'password',
    });
  }

  const account = await billingStore.getOrCreateBillingAccountForUserAsync(user);
  const period = billingStore.getCurrentMonthPeriod();
  await billingStore.updateBillingAccountForAdminAsync({
    accountId: account.id,
    planKey,
    accountState: 'active',
    trialState: 'none',
    trialKind: null,
    trialStartedAt: null,
    trialEndsAt: null,
    currentPeriodStartedAt: period.start,
    currentPeriodEndsAt: period.end,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    archiveStartedAt: null,
    downloadAccessEndsAt: null,
    assetRetentionEndsAt: null,
    lightweightRetentionEndsAt: null,
  });

  const entitlements = await resolveAccountEntitlementsAsync(user);
  return {
    email,
    password: PASSWORD,
    plan: entitlements?.plan?.name || planKey,
    activePages: entitlements?.meters?.activePages?.limit,
    screenshotCredits: entitlements?.meters?.screenshotCredits?.included,
    activeProjects: entitlements?.limits?.activeProjects?.limit,
    editors: entitlements?.limits?.editors?.limit,
  };
}

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const seeded = [];
  for (const account of TEST_ACCOUNTS) {
    seeded.push(await upsertTestUser(account, passwordHash));
  }

  console.log('Seeded Vellic entitlement test accounts:');
  seeded.forEach((account) => {
    console.log(
      `- ${account.email} / ${account.password} (${account.plan}: `
      + `${account.activePages ?? 'unlimited'} pages, `
      + `${account.screenshotCredits ?? 'unlimited'} screenshot credits, `
      + `${account.activeProjects ?? 'unlimited'} projects, `
      + `${account.editors ?? 'unlimited'} editors)`
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

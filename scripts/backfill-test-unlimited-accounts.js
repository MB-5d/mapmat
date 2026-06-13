#!/usr/bin/env node

/* eslint-disable no-console */

const adapter = require('../stores/dbAdapter');
const authStore = require('../stores/authStore');
const billingStore = require('../stores/billingStore');
const { resolveAccountEntitlementsAsync } = require('../utils/entitlements');

const TEST_UNLIMITED_PLAN_KEY = 'test_unlimited';
const FIXTURE_PLAN_KEYS = new Set(['free', 'solo', 'pro', 'studio', 'agency']);
const DEFAULT_FIXTURE_EMAILS = [
  'free@test.vellic.local',
  'solo@test.vellic.local',
  'pro@test.vellic.local',
  'studio@test.vellic.local',
  'agency@test.vellic.local',
];

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeAccountStatus(value) {
  return normalizeText(value) || 'active';
}

function parseList(value) {
  return String(value || '')
    .split(/[,\n]/)
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

function parseArgs(argv) {
  const options = {
    apply: false,
    includeDisabled: false,
    json: false,
    onlyEmails: new Set(),
    extraFixtureEmails: new Set(),
  };

  argv.forEach((arg) => {
    if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--dry-run') {
      options.apply = false;
    } else if (arg === '--include-disabled') {
      options.includeDisabled = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg.startsWith('--only-email=')) {
      parseList(arg.slice('--only-email='.length)).forEach((email) => options.onlyEmails.add(email));
    } else if (arg.startsWith('--fixture-email=')) {
      parseList(arg.slice('--fixture-email='.length)).forEach((email) => options.extraFixtureEmails.add(email));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  });

  parseList(process.env.TEST_UNLIMITED_ONLY_EMAILS).forEach((email) => options.onlyEmails.add(email));
  parseList(process.env.TEST_UNLIMITED_FIXTURE_EMAILS).forEach((email) => options.extraFixtureEmails.add(email));

  return options;
}

function isFixtureUser(user, fixtureEmails) {
  const email = normalizeText(user.email);
  const name = normalizeText(user.name);
  const emailLocalPart = email.split('@')[0] || '';
  if (fixtureEmails.has(email)) return true;
  if (FIXTURE_PLAN_KEYS.has(emailLocalPart)) return true;
  if (FIXTURE_PLAN_KEYS.has(name)) return true;
  if (FIXTURE_PLAN_KEYS.has(name.replace(/\s+tier\s+test$/, ''))) return true;
  return false;
}

function getSkipReason(user, account, options, fixtureEmails) {
  const email = normalizeText(user.email);
  if (options.onlyEmails.size > 0 && !options.onlyEmails.has(email)) return 'not selected';
  if (!options.includeDisabled && normalizeAccountStatus(user.account_status) === 'disabled') return 'disabled';
  if (isFixtureUser(user, fixtureEmails)) return 'tier fixture';
  if (normalizeText(account?.plan_key) === TEST_UNLIMITED_PLAN_KEY) return 'already test_unlimited';
  return null;
}

async function listUsersWithBillingAsync() {
  await authStore.ensureAuthSchemaAsync();
  await billingStore.ensureBillingSchemaAsync();
  return adapter.queryAllAsync(`
    SELECT
      u.id,
      u.email,
      u.name,
      u.account_status,
      u.created_at,
      u.updated_at,
      COALESCE(ba_by_user.id, ba_by_owner.id) AS billing_account_id,
      COALESCE(ba_by_user.plan_key, ba_by_owner.plan_key) AS plan_key,
      COALESCE(ba_by_user.account_state, ba_by_owner.account_state) AS account_state,
      COALESCE(ba_by_user.trial_state, ba_by_owner.trial_state) AS trial_state
    FROM users u
    LEFT JOIN billing_accounts ba_by_user ON ba_by_user.id = u.account_id
    LEFT JOIN billing_accounts ba_by_owner ON ba_by_owner.owner_user_id = u.id
    ORDER BY LOWER(u.email) ASC
  `);
}

async function applyTestUnlimitedAsync(userId) {
  const user = await authStore.getUserByIdAsync(userId);
  if (!user) throw new Error(`User not found: ${userId}`);
  const account = await billingStore.getOrCreateBillingAccountForUserAsync(user);
  const period = billingStore.getCurrentMonthPeriod();
  await billingStore.updateBillingAccountForAdminAsync({
    accountId: account.id,
    planKey: TEST_UNLIMITED_PLAN_KEY,
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
  return resolveAccountEntitlementsAsync(user);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const fixtureEmails = new Set([
    ...DEFAULT_FIXTURE_EMAILS,
    ...options.extraFixtureEmails,
  ]);
  const users = await listUsersWithBillingAsync();
  const result = {
    mode: options.apply ? 'apply' : 'dry-run',
    planKey: TEST_UNLIMITED_PLAN_KEY,
    totalUsers: users.length,
    selected: [],
    skipped: [],
    updated: [],
  };

  for (const user of users) {
    const account = {
      id: user.billing_account_id,
      plan_key: user.plan_key,
      account_state: user.account_state,
      trial_state: user.trial_state,
    };
    const skipReason = getSkipReason(user, account, options, fixtureEmails);
    const summary = {
      id: user.id,
      email: user.email,
      name: user.name || null,
      accountStatus: normalizeAccountStatus(user.account_status),
      currentPlan: account.plan_key || 'free',
    };

    if (skipReason) {
      result.skipped.push({ ...summary, reason: skipReason });
      continue;
    }

    result.selected.push(summary);
    if (options.apply) {
      const entitlements = await applyTestUnlimitedAsync(user.id);
      result.updated.push({
        ...summary,
        newPlan: entitlements?.plan?.key || TEST_UNLIMITED_PLAN_KEY,
        screenshotCreditsUnlimited: entitlements?.meters?.screenshotCredits?.unlimited === true,
        crawlPagesUnlimited: entitlements?.meters?.crawlPages?.unlimited === true,
      });
    }
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Test unlimited backfill ${result.mode}`);
  console.log(`Users: ${result.totalUsers}; selected: ${result.selected.length}; skipped: ${result.skipped.length}; updated: ${result.updated.length}`);
  if (!options.apply) {
    console.log('Dry run only. Re-run with --apply to update selected accounts.');
  }
  result.selected.forEach((entry) => {
    console.log(`SELECT ${entry.email} (${entry.currentPlan} -> ${TEST_UNLIMITED_PLAN_KEY})`);
  });
  result.skipped.forEach((entry) => {
    console.log(`SKIP ${entry.email} (${entry.currentPlan}): ${entry.reason}`);
  });
}

(async () => {
  try {
    await main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  } finally {
    await adapter.closeAsync();
  }
})();

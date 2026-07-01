#!/usr/bin/env node

/* eslint-disable no-console */

const bcrypt = require('bcryptjs');

const adapter = require('../stores/dbAdapter');
const authStore = require('../stores/authStore');
const billingStore = require('../stores/billingStore');
const collaborationStore = require('../stores/collaborationStore');
const emailDeliveryStore = require('../stores/emailDeliveryStore');
const imageAssetStore = require('../stores/imageAssetStore');
const { resolveAccountEntitlementsAsync } = require('../utils/entitlements');

const PASSWORD = process.env.VELLIC_TEST_ACCOUNT_PASSWORD || 'Test1234!';
const ROLE_PASSWORD = process.env.VELLIC_ROLE_TEST_ACCOUNT_PASSWORD || 'Admin123!';
const RESET = process.argv.includes('--reset');

const PLAN_ACCOUNTS = [
  { email: 'free@test.vellic.local', name: 'Free Plan QA Owner', planKey: 'free', password: PASSWORD, group: 'plan' },
  { email: 'pro@test.vellic.local', name: 'Pro Plan QA Owner', planKey: 'pro', password: PASSWORD, group: 'plan' },
  { email: 'studio@test.vellic.local', name: 'Studio Plan QA Owner', planKey: 'studio', password: PASSWORD, group: 'plan' },
  { email: 'agency@test.vellic.local', name: 'Agency Plan QA Owner', planKey: 'agency', password: PASSWORD, group: 'plan' },
  { email: 'solo@test.vellic.local', name: 'Solo Alias QA Owner', planKey: 'pro', password: PASSWORD, group: 'compatibility' },
];

const ROLE_ACCOUNTS = [
  { email: 'vellic-owner@example.com', name: 'Owner Role QA', planKey: 'studio', password: ROLE_PASSWORD, group: 'role' },
  { email: 'vellic-editor@example.com', name: 'Editor Role QA', planKey: 'free', password: ROLE_PASSWORD, group: 'role' },
  { email: 'vellic-commenter@example.com', name: 'Commenter Role QA', planKey: 'free', password: ROLE_PASSWORD, group: 'role' },
  { email: 'vellic-viewer@example.com', name: 'Viewer Role QA', planKey: 'free', password: ROLE_PASSWORD, group: 'role' },
];

const COLLABORATOR_ACCOUNTS = [
  { email: 'studio-editor@test.vellic.local', name: 'Studio Editor Invite QA', planKey: 'free', password: PASSWORD, group: 'studio collaborator' },
  { email: 'studio-extra-owner@test.vellic.local', name: 'Studio Owner Invite QA', planKey: 'free', password: PASSWORD, group: 'studio collaborator' },
  { email: 'agency-editor@test.vellic.local', name: 'Agency Editor Invite QA', planKey: 'free', password: PASSWORD, group: 'agency collaborator' },
  { email: 'agency-extra-owner@test.vellic.local', name: 'Agency Owner Invite QA', planKey: 'free', password: PASSWORD, group: 'agency collaborator' },
];

const QA_ACCOUNTS = [
  ...PLAN_ACCOUNTS,
  ...ROLE_ACCOUNTS,
  ...COLLABORATOR_ACCOUNTS,
];

function parseBool(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function assertStagingTarget() {
  const targetText = [
    process.env.RAILWAY_ENVIRONMENT_NAME,
    process.env.RAILWAY_ENVIRONMENT,
    process.env.APP_BASE_URL,
    process.env.FRONTEND_URL,
    process.env.DATABASE_URL,
  ].join(' ');
  const looksStaging = /\bstaging\b|api-staging|staging\.vellic\.io/i.test(targetText);
  const looksProduction = /\bproduction\b|api\.vellic\.io|app\.vellic\.io/i.test(targetText)
    && !looksStaging;

  if (looksProduction) {
    throw new Error('Refusing to seed QA accounts against a production-looking target.');
  }
  if (!looksStaging && !parseBool(process.env.ALLOW_STAGING_QA_ACCOUNT_SEED)) {
    throw new Error('Refusing to seed QA accounts unless the target looks like staging or ALLOW_STAGING_QA_ACCOUNT_SEED=true is set.');
  }
}

async function tableExistsAsync(tableName) {
  if (adapter.runtime?.activeProvider === 'postgres') {
    const row = await adapter.queryOneAsync(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = ?
      LIMIT 1
    `, [tableName]);
    return !!row;
  }
  const row = await adapter.queryOneAsync(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  return !!row;
}

function buildInClause(column, values) {
  const cleanValues = unique(values);
  if (cleanValues.length === 0) return null;
  return {
    sql: `${column} IN (${adapter.placeholders(cleanValues.length)})`,
    params: cleanValues,
  };
}

async function queryRowsIfTableExistsAsync(tableName, sql, params = []) {
  if (!(await tableExistsAsync(tableName))) return [];
  return adapter.queryAllAsync(sql, params);
}

async function deleteWhereAsync(tableName, clauses) {
  const activeClauses = clauses.filter(Boolean);
  if (activeClauses.length === 0 || !(await tableExistsAsync(tableName))) return 0;
  const whereSql = activeClauses.map((clause) => `(${clause.sql})`).join(' OR ');
  const params = activeClauses.flatMap((clause) => clause.params);
  const result = await adapter.executeAsync(`DELETE FROM ${tableName} WHERE ${whereSql}`, params);
  return Number(result?.changes || 0);
}

async function ensureKnownSchemasAsync() {
  await Promise.all([
    billingStore.ensureBillingSchemaAsync(),
    collaborationStore.ensureCollaborationSchemaAsync(),
    emailDeliveryStore.ensureEmailDeliverySchemaAsync(),
    imageAssetStore.ensureImageAssetSchemaAsync(),
  ]);
}

async function resetQaAccountsAsync(emails) {
  const normalizedEmails = emails.map(normalizeEmail);
  const emailClause = buildInClause('LOWER(email)', normalizedEmails);
  const userRows = await queryRowsIfTableExistsAsync(
    'users',
    `SELECT id, email, account_id FROM users WHERE ${emailClause.sql}`,
    emailClause.params
  );
  const userIds = unique(userRows.map((row) => row.id));

  const accountMembershipRows = await queryRowsIfTableExistsAsync(
    'account_memberships',
    `
      SELECT account_id
      FROM account_memberships
      WHERE ${[
        buildInClause('user_id', userIds),
        buildInClause('LOWER(email)', normalizedEmails),
      ].filter(Boolean).map((clause) => `(${clause.sql})`).join(' OR ') || '1 = 0'}
    `,
    [
      ...((buildInClause('user_id', userIds) || { params: [] }).params),
      ...((buildInClause('LOWER(email)', normalizedEmails) || { params: [] }).params),
    ]
  );
  const ownedAccountRows = await queryRowsIfTableExistsAsync(
    'billing_accounts',
    userIds.length > 0
      ? `SELECT id FROM billing_accounts WHERE owner_user_id IN (${adapter.placeholders(userIds.length)})`
      : 'SELECT id FROM billing_accounts WHERE 1 = 0',
    userIds
  );
  const accountIds = unique([
    ...userRows.map((row) => row.account_id),
    ...accountMembershipRows.map((row) => row.account_id),
    ...ownedAccountRows.map((row) => row.id),
  ]);

  const mapClauses = [
    buildInClause('user_id', userIds),
    buildInClause('account_id', accountIds),
  ].filter(Boolean);
  const mapRows = await queryRowsIfTableExistsAsync(
    'maps',
    mapClauses.length > 0
      ? `SELECT id FROM maps WHERE ${mapClauses.map((clause) => `(${clause.sql})`).join(' OR ')}`
      : 'SELECT id FROM maps WHERE 1 = 0',
    mapClauses.flatMap((clause) => clause.params)
  );
  const mapIds = unique(mapRows.map((row) => row.id));

  const inviteClauses = [
    buildInClause('map_id', mapIds),
    buildInClause('inviter_user_id', userIds),
    buildInClause('accepted_by_user_id', userIds),
    buildInClause('LOWER(invitee_email)', normalizedEmails),
  ].filter(Boolean);
  const inviteRows = await queryRowsIfTableExistsAsync(
    'map_invites',
    inviteClauses.length > 0
      ? `SELECT id FROM map_invites WHERE ${inviteClauses.map((clause) => `(${clause.sql})`).join(' OR ')}`
      : 'SELECT id FROM map_invites WHERE 1 = 0',
    inviteClauses.flatMap((clause) => clause.params)
  );
  const inviteIds = unique(inviteRows.map((row) => row.id));

  const jobRows = await queryRowsIfTableExistsAsync(
    'jobs',
    userIds.length > 0
      ? `SELECT id FROM jobs WHERE user_id IN (${adapter.placeholders(userIds.length)})`
      : 'SELECT id FROM jobs WHERE 1 = 0',
    userIds
  );
  const jobIds = unique(jobRows.map((row) => row.id));

  const deliveryClauses = [
    buildInClause('map_id', mapIds),
    buildInClause('invite_id', inviteIds),
    buildInClause('job_id', jobIds),
    buildInClause('LOWER(to_email)', normalizedEmails),
  ].filter(Boolean);
  const deliveryRows = await queryRowsIfTableExistsAsync(
    'email_deliveries',
    deliveryClauses.length > 0
      ? `SELECT id FROM email_deliveries WHERE ${deliveryClauses.map((clause) => `(${clause.sql})`).join(' OR ')}`
      : 'SELECT id FROM email_deliveries WHERE 1 = 0',
    deliveryClauses.flatMap((clause) => clause.params)
  );
  const deliveryIds = unique(deliveryRows.map((row) => row.id));

  const counts = {};
  counts.emailDeliveryEvents = await deleteWhereAsync('email_delivery_events', [
    buildInClause('delivery_id', deliveryIds),
  ]);
  counts.emailDeliveries = await deleteWhereAsync('email_deliveries', deliveryClauses);
  counts.mapPresenceSessions = await deleteWhereAsync('map_presence_sessions', [
    buildInClause('map_id', mapIds),
    buildInClause('user_id', userIds),
  ]);
  counts.mapLiveOps = await deleteWhereAsync('map_live_ops', [buildInClause('map_id', mapIds)]);
  counts.mapLiveSnapshots = await deleteWhereAsync('map_live_snapshots', [buildInClause('map_id', mapIds)]);
  counts.mapActivityEvents = await deleteWhereAsync('map_activity_events', [
    buildInClause('map_id', mapIds),
    buildInClause('actor_user_id', userIds),
  ]);
  counts.mapComments = await deleteWhereAsync('map_comments', [
    buildInClause('map_id', mapIds),
    buildInClause('author_user_id', userIds),
    buildInClause('completed_by_user_id', userIds),
  ]);
  counts.mapAccessRequests = await deleteWhereAsync('map_access_requests', [
    buildInClause('map_id', mapIds),
    buildInClause('requester_user_id', userIds),
    buildInClause('decision_user_id', userIds),
  ]);
  counts.mapInvites = await deleteWhereAsync('map_invites', inviteClauses);
  counts.mapMemberships = await deleteWhereAsync('map_memberships', [
    buildInClause('map_id', mapIds),
    buildInClause('user_id', userIds),
  ]);
  counts.mapCollaborationSettings = await deleteWhereAsync('map_collaboration_settings', [buildInClause('map_id', mapIds)]);
  counts.mapImageAssets = await deleteWhereAsync('map_image_assets', [buildInClause('map_id', mapIds)]);
  counts.mapVersions = await deleteWhereAsync('map_versions', [
    buildInClause('map_id', mapIds),
    buildInClause('user_id', userIds),
    buildInClause('bookmarked_by_user_id', userIds),
  ]);
  counts.shares = await deleteWhereAsync('shares', [
    buildInClause('map_id', mapIds),
    buildInClause('user_id', userIds),
  ]);
  counts.scanHistory = await deleteWhereAsync('scan_history', [
    buildInClause('map_id', mapIds),
    buildInClause('user_id', userIds),
  ]);
  counts.usageEvents = await deleteWhereAsync('usage_events', [buildInClause('user_id', userIds)]);
  counts.jobs = await deleteWhereAsync('jobs', [buildInClause('id', jobIds), buildInClause('user_id', userIds)]);
  counts.authChallenges = await deleteWhereAsync('auth_challenges', [
    buildInClause('user_id', userIds),
    buildInClause('LOWER(email)', normalizedEmails),
  ]);
  counts.usageLedgerEntries = await deleteWhereAsync('usage_ledger_entries', [
    buildInClause('account_id', accountIds),
    buildInClause('user_id', userIds),
  ]);
  counts.entitlementGrants = await deleteWhereAsync('entitlement_grants', [buildInClause('account_id', accountIds)]);
  counts.accountMemberships = await deleteWhereAsync('account_memberships', [
    buildInClause('account_id', accountIds),
    buildInClause('user_id', userIds),
    buildInClause('LOWER(email)', normalizedEmails),
  ]);
  counts.billingAccounts = await deleteWhereAsync('billing_accounts', [
    buildInClause('id', accountIds),
    buildInClause('owner_user_id', userIds),
  ]);
  counts.maps = await deleteWhereAsync('maps', [
    buildInClause('id', mapIds),
    buildInClause('user_id', userIds),
    buildInClause('account_id', accountIds),
  ]);
  counts.projects = await deleteWhereAsync('projects', [
    buildInClause('user_id', userIds),
    buildInClause('account_id', accountIds),
  ]);
  counts.users = await deleteWhereAsync('users', [
    buildInClause('id', userIds),
    buildInClause('LOWER(email)', normalizedEmails),
  ]);

  return {
    users: userIds.length,
    accounts: accountIds.length,
    maps: mapIds.length,
    counts,
  };
}

async function upsertQaUserAsync(account, passwordHash) {
  let user = await authStore.getUserByEmailAsync(account.email);
  if (user) {
    user = await authStore.updateSeedUserCredentialsAsync({
      userId: user.id,
      passwordHash,
      name: account.name,
    });
  } else {
    user = await authStore.createUserAsync({
      email: account.email,
      passwordHash,
      name: account.name,
      emailVerifiedAt: new Date().toISOString(),
      emailVerificationRequired: false,
      authProvider: 'password',
    });
  }

  const billingAccount = await billingStore.getOrCreateBillingAccountForUserAsync(user);
  const period = billingStore.getCurrentMonthPeriod();
  await billingStore.updateBillingAccountForAdminAsync({
    accountId: billingAccount.id,
    planKey: account.planKey,
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
    group: account.group,
    email: account.email,
    password: account.password,
    plan: entitlements?.plan?.name || account.planKey,
    accountRole: entitlements?.account?.membershipRole || 'owner',
    activeProjects: entitlements?.limits?.activeProjects?.limit,
    activePages: entitlements?.limits?.activePages?.limit,
    screenshotCredits: entitlements?.meters?.screenshotCredits?.included,
    editors: entitlements?.limits?.editors?.limit,
  };
}

async function main() {
  assertStagingTarget();
  await ensureKnownSchemasAsync();

  if (RESET) {
    const resetSummary = await resetQaAccountsAsync(QA_ACCOUNTS.map((account) => account.email));
    console.log('[staging-qa-accounts] Reset old QA rows:', JSON.stringify(resetSummary));
  }

  const passwordHashes = new Map();
  const seeded = [];
  for (const account of QA_ACCOUNTS) {
    if (!passwordHashes.has(account.password)) {
      passwordHashes.set(account.password, await bcrypt.hash(account.password, 10));
    }
    seeded.push(await upsertQaUserAsync(account, passwordHashes.get(account.password)));
  }

  console.log('[staging-qa-accounts] Seeded accounts:');
  seeded.forEach((account) => {
    console.log(
      `- ${account.group}: ${account.email} / ${account.password} `
      + `(${account.plan}, ${account.accountRole}, `
      + `${account.activeProjects ?? 'unlimited'} projects, `
      + `${account.activePages ?? 'unlimited'} pages, `
      + `${account.screenshotCredits ?? 'unlimited'} screenshots, `
      + `${account.editors ?? 'unlimited'} editors)`
    );
  });

  await adapter.closeAsync();
}

main().catch(async (error) => {
  console.error('[staging-qa-accounts] Failed:', error);
  try {
    await adapter.closeAsync();
  } catch {
    // Ignore close errors while reporting the original failure.
  }
  process.exit(1);
});

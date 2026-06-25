const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');

let ensureBillingSchemaPromise = null;

function toSqlTimestamp(value = new Date()) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function getCurrentMonthPeriod(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  return {
    start: toSqlTimestamp(start),
    end: toSqlTimestamp(end),
  };
}

async function ensureColumnAsync(table, column, type) {
  let rows = [];
  if (adapter.runtime?.activeProvider === 'postgres') {
    rows = await adapter.queryAllAsync(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ?
    `, [table]);
  } else {
    rows = await adapter.queryAllAsync(`PRAGMA table_info(${table})`);
  }

  const columns = rows.map((row) => row.column_name || row.name).filter(Boolean);
  if (!columns.includes(column)) {
    await adapter.executeAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

async function ensureBillingSchemaAsync() {
  if (ensureBillingSchemaPromise) return ensureBillingSchemaPromise;

  ensureBillingSchemaPromise = (async () => {
    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS billing_accounts (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        plan_key TEXT NOT NULL DEFAULT 'free',
        account_state TEXT NOT NULL DEFAULT 'active',
        trial_state TEXT NOT NULL DEFAULT 'none',
        trial_kind TEXT,
        trial_started_at TIMESTAMP,
        trial_ends_at TIMESTAMP,
        current_period_started_at TIMESTAMP,
        current_period_ends_at TIMESTAMP,
        cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
        cancelled_at TIMESTAMP,
        archive_started_at TIMESTAMP,
        download_access_ends_at TIMESTAMP,
        asset_retention_ends_at TIMESTAMP,
        lightweight_retention_ends_at TIMESTAMP,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        stripe_price_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS account_memberships (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        user_id TEXT,
        email TEXT,
        role TEXT NOT NULL DEFAULT 'member',
        seat_status TEXT NOT NULL DEFAULT 'accepted',
        invited_at TIMESTAMP,
        accepted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS entitlement_grants (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        source TEXT NOT NULL,
        meter TEXT,
        feature_key TEXT,
        quantity INTEGER,
        remaining_quantity INTEGER,
        reset_behavior TEXT NOT NULL DEFAULT 'rollover',
        starts_at TIMESTAMP,
        ends_at TIMESTAMP,
        metadata TEXT,
        created_by_user_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP
      )
    `);

    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS usage_ledger_entries (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        user_id TEXT,
        meter TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        source TEXT,
        grant_id TEXT,
        idempotency_key TEXT UNIQUE,
        metadata TEXT,
        period_start TIMESTAMP,
        period_end TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await ensureColumnAsync('users', 'account_id', 'TEXT');
    await ensureColumnAsync('billing_accounts', 'trial_kind', 'TEXT');
    await ensureColumnAsync('billing_accounts', 'stripe_subscription_status', 'TEXT');
    await ensureColumnAsync('billing_accounts', 'stripe_product_id', 'TEXT');
    await ensureColumnAsync('billing_accounts', 'stripe_latest_invoice_id', 'TEXT');
    await ensureColumnAsync('billing_accounts', 'stripe_cancel_at', 'TIMESTAMP');
    await ensureColumnAsync('projects', 'account_id', 'TEXT');
    await ensureColumnAsync('projects', 'status', "TEXT NOT NULL DEFAULT 'active'");
    await ensureColumnAsync('projects', 'archived_at', 'TIMESTAMP');
    await ensureColumnAsync('maps', 'account_id', 'TEXT');
    await ensureColumnAsync('maps', 'status', "TEXT NOT NULL DEFAULT 'active'");
    await ensureColumnAsync('maps', 'archived_at', 'TIMESTAMP');
    await ensureColumnAsync('maps', 'page_count', 'INTEGER');
    await ensureColumnAsync('entitlement_grants', 'remaining_quantity', 'INTEGER');
    await ensureColumnAsync('entitlement_grants', 'external_ref', 'TEXT');
    await ensureColumnAsync('entitlement_grants', 'updated_at', 'TIMESTAMP');

    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS stripe_webhook_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        object_id TEXT,
        account_id TEXT,
        status TEXT NOT NULL DEFAULT 'processing',
        error TEXT,
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await adapter.executeAsync('CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_accounts_owner ON billing_accounts(owner_user_id)');
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_billing_accounts_plan_state ON billing_accounts(plan_key, account_state)');
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_billing_accounts_stripe_customer ON billing_accounts(stripe_customer_id)');
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_billing_accounts_stripe_subscription ON billing_accounts(stripe_subscription_id)');
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_account_memberships_account ON account_memberships(account_id, seat_status)');
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_account_memberships_user ON account_memberships(user_id)');
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_entitlement_grants_account_meter ON entitlement_grants(account_id, meter)');
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_entitlement_grants_account_feature ON entitlement_grants(account_id, feature_key)');
    await adapter.executeAsync('CREATE UNIQUE INDEX IF NOT EXISTS idx_entitlement_grants_external_ref ON entitlement_grants(external_ref) WHERE external_ref IS NOT NULL');
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_usage_ledger_account_meter ON usage_ledger_entries(account_id, meter, created_at)');
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_projects_account_status ON projects(account_id, status)');
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_maps_account_status ON maps(account_id, status)');
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status ON stripe_webhook_events(status, created_at)');
  })();

  try {
    await ensureBillingSchemaPromise;
  } catch (error) {
    ensureBillingSchemaPromise = null;
    throw error;
  }
}

function normalizeAccount(row) {
  if (!row) return null;
  return {
    ...row,
    cancel_at_period_end: Number(row.cancel_at_period_end || 0),
  };
}

async function getBillingAccountByIdAsync(accountId) {
  await ensureBillingSchemaAsync();
  return normalizeAccount(await adapter.queryOneAsync('SELECT * FROM billing_accounts WHERE id = ?', [accountId]));
}

async function getBillingAccountByOwnerUserIdAsync(userId) {
  await ensureBillingSchemaAsync();
  return normalizeAccount(await adapter.queryOneAsync('SELECT * FROM billing_accounts WHERE owner_user_id = ?', [userId]));
}

async function getBillingAccountByStripeCustomerIdAsync(stripeCustomerId) {
  await ensureBillingSchemaAsync();
  const normalizedId = String(stripeCustomerId || '').trim();
  if (!normalizedId) return null;
  return normalizeAccount(await adapter.queryOneAsync(
    'SELECT * FROM billing_accounts WHERE stripe_customer_id = ?',
    [normalizedId]
  ));
}

async function getBillingAccountByStripeSubscriptionIdAsync(stripeSubscriptionId) {
  await ensureBillingSchemaAsync();
  const normalizedId = String(stripeSubscriptionId || '').trim();
  if (!normalizedId) return null;
  return normalizeAccount(await adapter.queryOneAsync(
    'SELECT * FROM billing_accounts WHERE stripe_subscription_id = ?',
    [normalizedId]
  ));
}

async function updateBillingAccountStripeCustomerAsync({ accountId, stripeCustomerId }) {
  await ensureBillingSchemaAsync();
  const normalizedCustomerId = String(stripeCustomerId || '').trim();
  if (!accountId || !normalizedCustomerId) return null;
  await adapter.executeAsync(`
    UPDATE billing_accounts
    SET stripe_customer_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [normalizedCustomerId, accountId]);
  return getBillingAccountByIdAsync(accountId);
}

async function insertOwnerMembershipIfMissingAsync({ accountId, userId, email }) {
  const existing = await adapter.queryOneAsync(
    'SELECT id FROM account_memberships WHERE account_id = ? AND user_id = ?',
    [accountId, userId]
  );
  if (existing) {
    await adapter.executeAsync(`
      UPDATE account_memberships
      SET role = 'owner',
          seat_status = 'accepted',
          accepted_at = COALESCE(accepted_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [existing.id]);
    return existing.id;
  }

  const membershipId = uuidv4();
  await adapter.executeAsync(`
    INSERT INTO account_memberships (
      id, account_id, user_id, email, role, seat_status, accepted_at
    ) VALUES (?, ?, ?, ?, 'owner', 'accepted', CURRENT_TIMESTAMP)
  `, [membershipId, accountId, userId, email || null]);
  return membershipId;
}

async function backfillOwnedRowsToAccountAsync({ accountId, userId }) {
  await adapter.executeAsync(
    'UPDATE users SET account_id = ? WHERE id = ? AND (account_id IS NULL OR account_id = ?)',
    [accountId, userId, '']
  );
  await adapter.executeAsync(
    'UPDATE projects SET account_id = ? WHERE user_id = ? AND (account_id IS NULL OR account_id = ?)',
    [accountId, userId, '']
  );
  await adapter.executeAsync(
    'UPDATE maps SET account_id = ? WHERE user_id = ? AND (account_id IS NULL OR account_id = ?)',
    [accountId, userId, '']
  );
}

async function createBillingAccountForUserAsync(user) {
  const period = getCurrentMonthPeriod();
  const accountId = uuidv4();
  await adapter.executeAsync(`
    INSERT INTO billing_accounts (
      id,
      owner_user_id,
      plan_key,
      account_state,
      trial_state,
      current_period_started_at,
      current_period_ends_at
    ) VALUES (?, ?, 'free', 'active', 'none', ?, ?)
  `, [accountId, user.id, period.start, period.end]);
  await insertOwnerMembershipIfMissingAsync({
    accountId,
    userId: user.id,
    email: user.email || null,
  });
  await backfillOwnedRowsToAccountAsync({ accountId, userId: user.id });
  return getBillingAccountByIdAsync(accountId);
}

async function startTrialAsync({ accountId, kind = 'personal', days = 7 }) {
  await ensureBillingSchemaAsync();
  const safeDays = Math.max(1, Math.min(Number(days || 7), 90));
  const now = new Date();
  const endsAt = new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000);
  const normalizedKind = String(kind || 'personal').trim().toLowerCase() === 'team' ? 'team' : 'personal';
  await adapter.executeAsync(`
    UPDATE billing_accounts
    SET trial_state = 'active',
        trial_kind = ?,
        trial_started_at = ?,
        trial_ends_at = ?,
        account_state = CASE WHEN account_state = 'archived' THEN 'active' ELSE account_state END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    normalizedKind,
    toSqlTimestamp(now),
    toSqlTimestamp(endsAt),
    accountId,
  ]);
  return getBillingAccountByIdAsync(accountId);
}

function normalizeSqlTimestampInput(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return toSqlTimestamp(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return toSqlTimestamp(date);
}

async function updateBillingAccountForAdminAsync({
  accountId,
  planKey,
  accountState,
  trialState,
  trialKind,
  trialStartedAt,
  trialEndsAt,
  currentPeriodStartedAt,
  currentPeriodEndsAt,
  cancelAtPeriodEnd,
  cancelledAt,
  archiveStartedAt,
  downloadAccessEndsAt,
  assetRetentionEndsAt,
  lightweightRetentionEndsAt,
}) {
  await ensureBillingSchemaAsync();
  if (!accountId) return null;

  const fields = [];
  const values = [];
  const addField = (column, value) => {
    fields.push(`${column} = ?`);
    values.push(value);
  };
  const addTimestampField = (column, value) => {
    addField(column, normalizeSqlTimestampInput(value));
  };

  if (planKey !== undefined) addField('plan_key', String(planKey || 'free').trim().toLowerCase() || 'free');
  if (accountState !== undefined) addField('account_state', String(accountState || 'active').trim().toLowerCase() || 'active');
  if (trialState !== undefined) addField('trial_state', String(trialState || 'none').trim().toLowerCase() || 'none');
  if (trialKind !== undefined) addField('trial_kind', trialKind ? String(trialKind).trim().toLowerCase() : null);
  if (trialStartedAt !== undefined) addTimestampField('trial_started_at', trialStartedAt);
  if (trialEndsAt !== undefined) addTimestampField('trial_ends_at', trialEndsAt);
  if (currentPeriodStartedAt !== undefined) addTimestampField('current_period_started_at', currentPeriodStartedAt);
  if (currentPeriodEndsAt !== undefined) addTimestampField('current_period_ends_at', currentPeriodEndsAt);
  if (cancelAtPeriodEnd !== undefined) addField('cancel_at_period_end', cancelAtPeriodEnd ? 1 : 0);
  if (cancelledAt !== undefined) addTimestampField('cancelled_at', cancelledAt);
  if (archiveStartedAt !== undefined) addTimestampField('archive_started_at', archiveStartedAt);
  if (downloadAccessEndsAt !== undefined) addTimestampField('download_access_ends_at', downloadAccessEndsAt);
  if (assetRetentionEndsAt !== undefined) addTimestampField('asset_retention_ends_at', assetRetentionEndsAt);
  if (lightweightRetentionEndsAt !== undefined) addTimestampField('lightweight_retention_ends_at', lightweightRetentionEndsAt);

  if (fields.length === 0) return getBillingAccountByIdAsync(accountId);

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(accountId);

  await adapter.executeAsync(`
    UPDATE billing_accounts
    SET ${fields.join(', ')}
    WHERE id = ?
  `, values);
  return getBillingAccountByIdAsync(accountId);
}

async function updateBillingAccountFromStripeSubscriptionAsync({
  accountId,
  planKey,
  accountState,
  currentPeriodStartedAt,
  currentPeriodEndsAt,
  cancelAtPeriodEnd,
  cancelledAt,
  stripeCustomerId,
  stripeSubscriptionId,
  stripePriceId,
  stripeProductId,
  stripeSubscriptionStatus,
  stripeLatestInvoiceId,
  stripeCancelAt,
  clearTrial = true,
}) {
  await ensureBillingSchemaAsync();
  if (!accountId) return null;

  const fields = [];
  const values = [];
  const addField = (column, value) => {
    fields.push(`${column} = ?`);
    values.push(value);
  };
  const addTimestampField = (column, value) => {
    addField(column, normalizeSqlTimestampInput(value));
  };

  if (planKey !== undefined) addField('plan_key', String(planKey || 'free').trim().toLowerCase() || 'free');
  if (accountState !== undefined) addField('account_state', String(accountState || 'active').trim().toLowerCase() || 'active');
  if (currentPeriodStartedAt !== undefined) addTimestampField('current_period_started_at', currentPeriodStartedAt);
  if (currentPeriodEndsAt !== undefined) addTimestampField('current_period_ends_at', currentPeriodEndsAt);
  if (cancelAtPeriodEnd !== undefined) addField('cancel_at_period_end', cancelAtPeriodEnd ? 1 : 0);
  if (cancelledAt !== undefined) addTimestampField('cancelled_at', cancelledAt);
  if (stripeCustomerId !== undefined) addField('stripe_customer_id', stripeCustomerId ? String(stripeCustomerId).trim() : null);
  if (stripeSubscriptionId !== undefined) addField('stripe_subscription_id', stripeSubscriptionId ? String(stripeSubscriptionId).trim() : null);
  if (stripePriceId !== undefined) addField('stripe_price_id', stripePriceId ? String(stripePriceId).trim() : null);
  if (stripeProductId !== undefined) addField('stripe_product_id', stripeProductId ? String(stripeProductId).trim() : null);
  if (stripeSubscriptionStatus !== undefined) addField('stripe_subscription_status', stripeSubscriptionStatus ? String(stripeSubscriptionStatus).trim() : null);
  if (stripeLatestInvoiceId !== undefined) addField('stripe_latest_invoice_id', stripeLatestInvoiceId ? String(stripeLatestInvoiceId).trim() : null);
  if (stripeCancelAt !== undefined) addTimestampField('stripe_cancel_at', stripeCancelAt);

  if (clearTrial) {
    addField('trial_state', 'none');
    addField('trial_kind', null);
    addField('trial_started_at', null);
    addField('trial_ends_at', null);
  }

  if (fields.length === 0) return getBillingAccountByIdAsync(accountId);

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(accountId);

  await adapter.executeAsync(`
    UPDATE billing_accounts
    SET ${fields.join(', ')}
    WHERE id = ?
  `, values);
  return getBillingAccountByIdAsync(accountId);
}

async function archiveBillingAccountFromStripeAsync({
  accountId,
  stripeSubscriptionStatus = 'canceled',
  stripeSubscriptionId = null,
  stripeCustomerId = null,
  stripePriceId = null,
  cancelledAt = new Date(),
}) {
  await ensureBillingSchemaAsync();
  if (!accountId) return null;

  const now = normalizeSqlTimestampInput(cancelledAt) || toSqlTimestamp(new Date());
  const archiveStartDate = new Date(`${now.replace(' ', 'T')}Z`);
  const downloadEndDate = new Date(archiveStartDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const lightweightEndDate = new Date(archiveStartDate);
  lightweightEndDate.setUTCMonth(lightweightEndDate.getUTCMonth() + 12);

  await adapter.executeAsync(`
    UPDATE billing_accounts
    SET plan_key = 'free',
        account_state = 'archived',
        trial_state = 'none',
        trial_kind = NULL,
        trial_started_at = NULL,
        trial_ends_at = NULL,
        cancel_at_period_end = 1,
        cancelled_at = COALESCE(cancelled_at, ?),
        archive_started_at = COALESCE(archive_started_at, ?),
        download_access_ends_at = COALESCE(download_access_ends_at, ?),
        asset_retention_ends_at = COALESCE(asset_retention_ends_at, ?),
        lightweight_retention_ends_at = COALESCE(lightweight_retention_ends_at, ?),
        stripe_customer_id = COALESCE(?, stripe_customer_id),
        stripe_subscription_id = COALESCE(?, stripe_subscription_id),
        stripe_price_id = COALESCE(?, stripe_price_id),
        stripe_subscription_status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    now,
    now,
    toSqlTimestamp(downloadEndDate),
    toSqlTimestamp(downloadEndDate),
    toSqlTimestamp(lightweightEndDate),
    stripeCustomerId ? String(stripeCustomerId).trim() : null,
    stripeSubscriptionId ? String(stripeSubscriptionId).trim() : null,
    stripePriceId ? String(stripePriceId).trim() : null,
    stripeSubscriptionStatus ? String(stripeSubscriptionStatus).trim() : 'canceled',
    accountId,
  ]);
  return getBillingAccountByIdAsync(accountId);
}

async function refreshAccountPeriodIfNeededAsync(account) {
  if (!account) return null;
  const now = new Date();
  const periodEnd = account.current_period_ends_at ? new Date(account.current_period_ends_at) : null;
  if (periodEnd && Number.isFinite(periodEnd.getTime()) && periodEnd > now) {
    return account;
  }

  if (account.cancel_at_period_end && String(account.account_state || '').toLowerCase() !== 'archived') {
    const downloadEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const lightweightEnd = new Date(now);
    lightweightEnd.setUTCMonth(lightweightEnd.getUTCMonth() + 12);
    await adapter.executeAsync(`
      UPDATE billing_accounts
      SET account_state = 'archived',
          archive_started_at = COALESCE(archive_started_at, ?),
          download_access_ends_at = COALESCE(download_access_ends_at, ?),
          asset_retention_ends_at = COALESCE(asset_retention_ends_at, ?),
          lightweight_retention_ends_at = COALESCE(lightweight_retention_ends_at, ?),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      toSqlTimestamp(now),
      toSqlTimestamp(downloadEnd),
      toSqlTimestamp(downloadEnd),
      toSqlTimestamp(lightweightEnd),
      account.id,
    ]);
    return getBillingAccountByIdAsync(account.id);
  }

  const period = getCurrentMonthPeriod(now);
  await adapter.executeAsync(`
    UPDATE billing_accounts
    SET current_period_started_at = ?,
        current_period_ends_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [period.start, period.end, account.id]);
  return getBillingAccountByIdAsync(account.id);
}

async function getOrCreateBillingAccountForUserAsync(user) {
  await ensureBillingSchemaAsync();
  if (!user?.id) return null;

  const userRow = await adapter.queryOneAsync('SELECT id, email, account_id FROM users WHERE id = ?', [user.id]);
  if (!userRow) return null;

  let account = userRow.account_id ? await getBillingAccountByIdAsync(userRow.account_id) : null;
  if (!account) {
    account = await getBillingAccountByOwnerUserIdAsync(user.id);
  }
  if (!account) {
    try {
      account = await createBillingAccountForUserAsync({ ...userRow, ...user });
    } catch (error) {
      account = await getBillingAccountByOwnerUserIdAsync(user.id);
      if (!account) throw error;
    }
  }

  await insertOwnerMembershipIfMissingAsync({
    accountId: account.id,
    userId: user.id,
    email: user.email || userRow.email || null,
  });
  await backfillOwnedRowsToAccountAsync({ accountId: account.id, userId: user.id });
  return refreshAccountPeriodIfNeededAsync(account);
}

async function countActiveProjectsForAccountAsync(accountId, ownerUserId = null) {
  await ensureBillingSchemaAsync();
  const row = await adapter.queryOneAsync(`
    SELECT COUNT(*) AS count
    FROM projects
    WHERE (account_id = ? OR (account_id IS NULL AND user_id = ?))
      AND COALESCE(status, 'active') != 'archived'
  `, [accountId, ownerUserId || '']);
  return Number(row?.count || 0);
}

async function countBillableSeatsForAccountAsync(accountId) {
  await ensureBillingSchemaAsync();
  const row = await adapter.queryOneAsync(`
    SELECT COUNT(*) AS count
    FROM account_memberships
    WHERE account_id = ?
      AND seat_status IN ('accepted', 'invited', 'pending')
  `, [accountId]);
  return Number(row?.count || 0);
}

async function countBillableEditorsForAccountAsync(accountId) {
  await ensureBillingSchemaAsync();
  const row = await adapter.queryOneAsync(`
    SELECT COUNT(*) AS count
    FROM account_memberships am
    WHERE am.account_id = ?
      AND am.seat_status IN ('accepted', 'invited', 'pending')
      AND am.role IN ('editor', 'owner')
  `, [accountId]);
  return Number(row?.count || 0);
}

async function getAccountMembershipForUserAsync(accountId, userId) {
  await ensureBillingSchemaAsync();
  if (!accountId || !userId) return null;
  return adapter.queryOneAsync(`
    SELECT *
    FROM account_memberships
    WHERE account_id = ?
      AND user_id = ?
      AND seat_status IN ('accepted', 'invited', 'pending')
    ORDER BY
      CASE role
        WHEN 'owner' THEN 1
        WHEN 'editor' THEN 2
        WHEN 'commenter' THEN 3
        WHEN 'viewer' THEN 4
        ELSE 5
      END
    LIMIT 1
  `, [accountId, userId]);
}

async function countSeatRolesForAccountAsync(accountId) {
  await ensureBillingSchemaAsync();
  const rows = await adapter.queryAllAsync(`
    SELECT role, COUNT(*) AS count
    FROM account_memberships
    WHERE account_id = ?
      AND seat_status IN ('accepted', 'invited', 'pending')
    GROUP BY role
  `, [accountId]);
  return rows.reduce((acc, row) => {
    const role = String(row.role || 'member').trim().toLowerCase() || 'member';
    acc[role] = Number(row.count || 0);
    return acc;
  }, {});
}

async function upsertInvitedMembershipAsync({
  accountId,
  userId = null,
  email = null,
  role = 'member',
}) {
  await ensureBillingSchemaAsync();
  const safeEmail = String(email || '').trim().toLowerCase() || null;
  if (!accountId || (!userId && !safeEmail)) return null;

  const existing = userId
    ? await adapter.queryOneAsync(
      'SELECT * FROM account_memberships WHERE account_id = ? AND user_id = ?',
      [accountId, userId]
    )
    : await adapter.queryOneAsync(
      'SELECT * FROM account_memberships WHERE account_id = ? AND LOWER(COALESCE(email, ?)) = ?',
      [accountId, safeEmail, safeEmail]
    );

  if (existing) {
    await adapter.executeAsync(`
      UPDATE account_memberships
      SET user_id = COALESCE(user_id, ?),
          email = COALESCE(email, ?),
          role = CASE WHEN role = 'owner' THEN role ELSE ? END,
          seat_status = CASE WHEN seat_status = 'accepted' THEN seat_status ELSE 'invited' END,
          invited_at = COALESCE(invited_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [userId, safeEmail, role, existing.id]);
    return adapter.queryOneAsync('SELECT * FROM account_memberships WHERE id = ?', [existing.id]);
  }

  const id = uuidv4();
  await adapter.executeAsync(`
    INSERT INTO account_memberships (
      id, account_id, user_id, email, role, seat_status, invited_at
    ) VALUES (?, ?, ?, ?, ?, 'invited', CURRENT_TIMESTAMP)
  `, [id, accountId, userId, safeEmail, role]);
  return adapter.queryOneAsync('SELECT * FROM account_memberships WHERE id = ?', [id]);
}

async function markMembershipAcceptedAsync({ accountId, userId, email = null }) {
  await ensureBillingSchemaAsync();
  const safeEmail = String(email || '').trim().toLowerCase() || null;
  if (!accountId || !userId) return null;
  const existing = safeEmail
    ? await adapter.queryOneAsync(
      'SELECT * FROM account_memberships WHERE account_id = ? AND (user_id = ? OR LOWER(COALESCE(email, ?)) = ?)',
      [accountId, userId, safeEmail, safeEmail]
    )
    : await adapter.queryOneAsync(
      'SELECT * FROM account_memberships WHERE account_id = ? AND user_id = ?',
      [accountId, userId]
    );

  if (!existing) return null;
  await adapter.executeAsync(`
    UPDATE account_memberships
    SET user_id = ?,
        email = COALESCE(email, ?),
        seat_status = 'accepted',
        accepted_at = COALESCE(accepted_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [userId, safeEmail, existing.id]);
  return adapter.queryOneAsync('SELECT * FROM account_memberships WHERE id = ?', [existing.id]);
}

async function sumLedgerUsageForPeriodAsync({ accountId, meter, periodStart, periodEnd }) {
  await ensureBillingSchemaAsync();
  const row = await adapter.queryOneAsync(`
    SELECT COALESCE(SUM(
      CASE
        WHEN entry_type IN ('debit', 'reserve') THEN quantity
        WHEN entry_type IN ('release', 'refund') THEN -quantity
        ELSE 0
      END
    ), 0) AS total
    FROM usage_ledger_entries
    WHERE account_id = ?
      AND meter = ?
      AND created_at >= ?
      AND created_at < ?
  `, [accountId, meter, periodStart, periodEnd]);
  return Math.max(0, Number(row?.total || 0));
}

async function sumLedgerUsageForPeriodBySourceAsync({ accountId, meter, source, periodStart, periodEnd }) {
  await ensureBillingSchemaAsync();
  const row = await adapter.queryOneAsync(`
    SELECT COALESCE(SUM(
      CASE
        WHEN entry_type IN ('debit', 'reserve') THEN quantity
        WHEN entry_type IN ('release', 'refund') THEN -quantity
        ELSE 0
      END
    ), 0) AS total
    FROM usage_ledger_entries
    WHERE account_id = ?
      AND meter = ?
      AND source = ?
      AND created_at >= ?
      AND created_at < ?
  `, [accountId, meter, source, periodStart, periodEnd]);
  return Math.max(0, Number(row?.total || 0));
}

async function sumActiveMeterGrantsAsync({ accountId, meter, at = new Date() }) {
  await ensureBillingSchemaAsync();
  const now = toSqlTimestamp(at);
  const row = await adapter.queryOneAsync(`
    SELECT COALESCE(SUM(COALESCE(remaining_quantity, quantity)), 0) AS total
    FROM entitlement_grants
    WHERE account_id = ?
      AND meter = ?
      AND quantity IS NOT NULL
      AND COALESCE(remaining_quantity, quantity) > 0
      AND (starts_at IS NULL OR starts_at <= ?)
      AND (ends_at IS NULL OR ends_at > ?)
  `, [accountId, meter, now, now]);
  return Math.max(0, Number(row?.total || 0));
}

async function listActiveFeatureGrantKeysAsync({ accountId, at = new Date() }) {
  await ensureBillingSchemaAsync();
  const now = toSqlTimestamp(at);
  const rows = await adapter.queryAllAsync(`
    SELECT feature_key
    FROM entitlement_grants
    WHERE account_id = ?
      AND feature_key IS NOT NULL
      AND TRIM(feature_key) != ''
      AND (starts_at IS NULL OR starts_at <= ?)
      AND (ends_at IS NULL OR ends_at > ?)
  `, [accountId, now, now]);
  return new Set(rows.map((row) => String(row.feature_key || '').trim()).filter(Boolean));
}

async function insertLedgerEntryAsync({
  accountId,
  userId = null,
  meter,
  entryType,
  quantity,
  source = null,
  grantId = null,
  idempotencyKey = null,
  metadata = null,
  periodStart = null,
  periodEnd = null,
}) {
  await ensureBillingSchemaAsync();
  const safeQuantity = Math.max(0, Number(quantity || 0));
  if (!accountId || !meter || !entryType || safeQuantity <= 0) return { entry: null, deduped: false };

  if (idempotencyKey) {
    const existing = await adapter.queryOneAsync(
      'SELECT * FROM usage_ledger_entries WHERE idempotency_key = ?',
      [idempotencyKey]
    );
    if (existing) return { entry: existing, deduped: true };
  }

  const id = uuidv4();
  await adapter.executeAsync(`
    INSERT INTO usage_ledger_entries (
      id, account_id, user_id, meter, entry_type, quantity, source, grant_id,
      idempotency_key, metadata, period_start, period_end
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    accountId,
    userId,
    meter,
    entryType,
    safeQuantity,
    source,
    grantId,
    idempotencyKey,
    metadata ? JSON.stringify(metadata) : null,
    periodStart,
    periodEnd,
  ]);
  return {
    entry: await adapter.queryOneAsync('SELECT * FROM usage_ledger_entries WHERE id = ?', [id]),
    deduped: false,
  };
}

async function createEntitlementGrantAsync({
  accountId,
  source,
  externalRef = null,
  meter = null,
  featureKey = null,
  quantity = null,
  resetBehavior = 'rollover',
  startsAt = null,
  endsAt = null,
  metadata = null,
  createdByUserId = null,
}) {
  await ensureBillingSchemaAsync();
  const id = uuidv4();
  await adapter.executeAsync(`
    INSERT INTO entitlement_grants (
      id, account_id, source, external_ref, meter, feature_key, quantity, remaining_quantity, reset_behavior,
      starts_at, ends_at, metadata, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    accountId,
    source,
    externalRef ? String(externalRef).trim() : null,
    meter,
    featureKey,
    quantity === null || quantity === undefined ? null : Number(quantity),
    quantity === null || quantity === undefined ? null : Number(quantity),
    resetBehavior,
    startsAt ? toSqlTimestamp(startsAt) : null,
    endsAt ? toSqlTimestamp(endsAt) : null,
    metadata ? JSON.stringify(metadata) : null,
    createdByUserId,
  ]);
  return adapter.queryOneAsync('SELECT * FROM entitlement_grants WHERE id = ?', [id]);
}

async function upsertEntitlementGrantByExternalRefAsync({
  accountId,
  source,
  externalRef,
  meter = null,
  featureKey = null,
  quantity = null,
  resetBehavior = 'rollover',
  startsAt = null,
  endsAt = null,
  metadata = null,
  createdByUserId = null,
}) {
  await ensureBillingSchemaAsync();
  const normalizedExternalRef = String(externalRef || '').trim();
  if (!normalizedExternalRef) {
    const grant = await createEntitlementGrantAsync({
      accountId,
      source,
      meter,
      featureKey,
      quantity,
      resetBehavior,
      startsAt,
      endsAt,
      metadata,
      createdByUserId,
    });
    return { grant, created: true };
  }

  const existing = await adapter.queryOneAsync(
    'SELECT * FROM entitlement_grants WHERE external_ref = ?',
    [normalizedExternalRef]
  );
  if (existing) return { grant: existing, created: false };

  try {
    const grant = await createEntitlementGrantAsync({
      accountId,
      source,
      externalRef: normalizedExternalRef,
      meter,
      featureKey,
      quantity,
      resetBehavior,
      startsAt,
      endsAt,
      metadata,
      createdByUserId,
    });
    return { grant, created: true };
  } catch (error) {
    const raced = await adapter.queryOneAsync(
      'SELECT * FROM entitlement_grants WHERE external_ref = ?',
      [normalizedExternalRef]
    );
    if (raced) return { grant: raced, created: false };
    throw error;
  }
}

async function upsertAdjustableEntitlementGrantByExternalRefAsync({
  accountId,
  source,
  externalRef,
  meter = null,
  featureKey = null,
  quantity = null,
  resetBehavior = 'rollover',
  startsAt = null,
  endsAt = null,
  metadata = null,
  createdByUserId = null,
}) {
  await ensureBillingSchemaAsync();
  const normalizedExternalRef = String(externalRef || '').trim();
  if (!normalizedExternalRef) {
    const grant = await createEntitlementGrantAsync({
      accountId,
      source,
      meter,
      featureKey,
      quantity,
      resetBehavior,
      startsAt,
      endsAt,
      metadata,
      createdByUserId,
    });
    return { grant, created: true };
  }

  const existing = await adapter.queryOneAsync(
    'SELECT * FROM entitlement_grants WHERE external_ref = ?',
    [normalizedExternalRef]
  );
  if (existing) {
    const nextQuantity = quantity === null || quantity === undefined ? null : Number(quantity);
    const previousQuantity = existing.quantity === null || existing.quantity === undefined
      ? null
      : Number(existing.quantity);
    const previousRemaining = existing.remaining_quantity === null || existing.remaining_quantity === undefined
      ? previousQuantity
      : Number(existing.remaining_quantity);
    const nextRemaining = nextQuantity === null
      ? null
      : Math.max(0, Number(previousRemaining || 0) + (nextQuantity - Number(previousQuantity || 0)));

    await adapter.executeAsync(`
      UPDATE entitlement_grants
      SET account_id = ?,
          source = ?,
          meter = ?,
          feature_key = ?,
          quantity = ?,
          remaining_quantity = ?,
          reset_behavior = ?,
          starts_at = ?,
          ends_at = ?,
          metadata = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      accountId,
      source,
      meter,
      featureKey,
      nextQuantity,
      nextRemaining,
      resetBehavior,
      startsAt ? toSqlTimestamp(startsAt) : null,
      endsAt ? toSqlTimestamp(endsAt) : null,
      metadata ? JSON.stringify(metadata) : null,
      existing.id,
    ]);
    return {
      grant: await adapter.queryOneAsync('SELECT * FROM entitlement_grants WHERE id = ?', [existing.id]),
      created: false,
    };
  }

  try {
    const grant = await createEntitlementGrantAsync({
      accountId,
      source,
      externalRef: normalizedExternalRef,
      meter,
      featureKey,
      quantity,
      resetBehavior,
      startsAt,
      endsAt,
      metadata,
      createdByUserId,
    });
    return { grant, created: true };
  } catch (error) {
    const raced = await adapter.queryOneAsync(
      'SELECT * FROM entitlement_grants WHERE external_ref = ?',
      [normalizedExternalRef]
    );
    if (raced) return { grant: raced, created: false };
    throw error;
  }
}

async function listEntitlementGrantsForAccountAsync({ accountId, limit = 25, offset = 0 }) {
  await ensureBillingSchemaAsync();
  const safeLimit = Math.min(Math.max(Number(limit || 25), 1), 100);
  const safeOffset = Math.max(Number(offset || 0), 0);
  return adapter.queryAllAsync(`
    SELECT *
    FROM entitlement_grants
    WHERE account_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [accountId, safeLimit, safeOffset]);
}

async function consumeMeterGrantQuantityAsync({ accountId, meter, quantity, at = new Date() }) {
  await ensureBillingSchemaAsync();
  let remaining = Math.max(0, Number(quantity || 0));
  if (!accountId || !meter || remaining <= 0) return 0;

  const now = toSqlTimestamp(at);
  const rows = await adapter.queryAllAsync(`
    SELECT id, COALESCE(remaining_quantity, quantity) AS remaining_quantity
    FROM entitlement_grants
    WHERE account_id = ?
      AND meter = ?
      AND quantity IS NOT NULL
      AND COALESCE(remaining_quantity, quantity) > 0
      AND (starts_at IS NULL OR starts_at <= ?)
      AND (ends_at IS NULL OR ends_at > ?)
    ORDER BY created_at ASC, id ASC
  `, [accountId, meter, now, now]);

  let consumed = 0;
  for (const row of rows) {
    if (remaining <= 0) break;
    const available = Math.max(0, Number(row.remaining_quantity || 0));
    const take = Math.min(available, remaining);
    if (take <= 0) continue;
    await adapter.executeAsync(`
      UPDATE entitlement_grants
      SET remaining_quantity = ?,
          metadata = metadata
      WHERE id = ?
    `, [available - take, row.id]);
    remaining -= take;
    consumed += take;
  }
  return consumed;
}

async function startStripeWebhookEventAsync({
  eventId,
  eventType,
  objectId = null,
  accountId = null,
}) {
  await ensureBillingSchemaAsync();
  const normalizedEventId = String(eventId || '').trim();
  if (!normalizedEventId) return { event: null, duplicate: false };

  const existing = await adapter.queryOneAsync(
    'SELECT * FROM stripe_webhook_events WHERE id = ?',
    [normalizedEventId]
  );
  if (existing) {
    if (existing.status === 'processed') return { event: existing, duplicate: true };
    await adapter.executeAsync(`
      UPDATE stripe_webhook_events
      SET status = 'processing',
          event_type = ?,
          object_id = COALESCE(?, object_id),
          account_id = COALESCE(?, account_id),
          error = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      String(eventType || 'unknown').trim() || 'unknown',
      objectId ? String(objectId).trim() : null,
      accountId,
      normalizedEventId,
    ]);
    return {
      event: await adapter.queryOneAsync('SELECT * FROM stripe_webhook_events WHERE id = ?', [normalizedEventId]),
      duplicate: false,
    };
  }

  try {
    await adapter.executeAsync(`
      INSERT INTO stripe_webhook_events (
        id, event_type, object_id, account_id, status
      ) VALUES (?, ?, ?, ?, 'processing')
    `, [
      normalizedEventId,
      String(eventType || 'unknown').trim() || 'unknown',
      objectId ? String(objectId).trim() : null,
      accountId,
    ]);
  } catch (error) {
    const raced = await adapter.queryOneAsync(
      'SELECT * FROM stripe_webhook_events WHERE id = ?',
      [normalizedEventId]
    );
    if (raced) return { event: raced, duplicate: true };
    throw error;
  }

  return {
    event: await adapter.queryOneAsync('SELECT * FROM stripe_webhook_events WHERE id = ?', [normalizedEventId]),
    duplicate: false,
  };
}

async function markStripeWebhookEventProcessedAsync({
  eventId,
  accountId = null,
  objectId = null,
}) {
  await ensureBillingSchemaAsync();
  const normalizedEventId = String(eventId || '').trim();
  if (!normalizedEventId) return null;
  await adapter.executeAsync(`
    UPDATE stripe_webhook_events
    SET status = 'processed',
        account_id = COALESCE(?, account_id),
        object_id = COALESCE(?, object_id),
        error = NULL,
        processed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    accountId,
    objectId ? String(objectId).trim() : null,
    normalizedEventId,
  ]);
  return adapter.queryOneAsync('SELECT * FROM stripe_webhook_events WHERE id = ?', [normalizedEventId]);
}

async function markStripeWebhookEventFailedAsync({
  eventId,
  accountId = null,
  objectId = null,
  error = null,
}) {
  await ensureBillingSchemaAsync();
  const normalizedEventId = String(eventId || '').trim();
  if (!normalizedEventId) return null;
  await adapter.executeAsync(`
    UPDATE stripe_webhook_events
    SET status = 'failed',
        account_id = COALESCE(?, account_id),
        object_id = COALESCE(?, object_id),
        error = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    accountId,
    objectId ? String(objectId).trim() : null,
    error ? String(error).slice(0, 2000) : null,
    normalizedEventId,
  ]);
  return adapter.queryOneAsync('SELECT * FROM stripe_webhook_events WHERE id = ?', [normalizedEventId]);
}

module.exports = {
  ensureBillingSchemaAsync,
  getCurrentMonthPeriod,
  getBillingAccountByIdAsync,
  getBillingAccountByOwnerUserIdAsync,
  getBillingAccountByStripeCustomerIdAsync,
  getBillingAccountByStripeSubscriptionIdAsync,
  getOrCreateBillingAccountForUserAsync,
  updateBillingAccountStripeCustomerAsync,
  updateBillingAccountForAdminAsync,
  updateBillingAccountFromStripeSubscriptionAsync,
  archiveBillingAccountFromStripeAsync,
  startTrialAsync,
  countActiveProjectsForAccountAsync,
  countBillableSeatsForAccountAsync,
  countBillableEditorsForAccountAsync,
  getAccountMembershipForUserAsync,
  countSeatRolesForAccountAsync,
  upsertInvitedMembershipAsync,
  markMembershipAcceptedAsync,
  sumLedgerUsageForPeriodAsync,
  sumLedgerUsageForPeriodBySourceAsync,
  sumActiveMeterGrantsAsync,
  listActiveFeatureGrantKeysAsync,
  insertLedgerEntryAsync,
  createEntitlementGrantAsync,
  upsertEntitlementGrantByExternalRefAsync,
  upsertAdjustableEntitlementGrantByExternalRefAsync,
  listEntitlementGrantsForAccountAsync,
  consumeMeterGrantQuantityAsync,
  startStripeWebhookEventAsync,
  markStripeWebhookEventProcessedAsync,
  markStripeWebhookEventFailedAsync,
};

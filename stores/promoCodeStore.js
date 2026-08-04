const { randomUUID: uuidv4 } = require('node:crypto');
const adapter = require('./dbAdapter');

let ensureSchemaPromise = null;

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

async function ensurePromoCodeSchemaAsync() {
  if (ensureSchemaPromise) return ensureSchemaPromise;

  ensureSchemaPromise = (async () => {
    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS admin_promo_codes (
        id TEXT PRIMARY KEY,
        offer_key TEXT NOT NULL,
        offer_label TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'stripe',
        code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        stripe_coupon_id TEXT,
        stripe_promotion_code_id TEXT,
        max_redemptions INTEGER,
        times_redeemed INTEGER NOT NULL DEFAULT 0,
        first_time_order_only INTEGER NOT NULL DEFAULT 0,
        campaign_key TEXT,
        recipient_email TEXT,
        metadata TEXT,
        created_by_user_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await ensureColumnAsync('admin_promo_codes', 'provider', "TEXT NOT NULL DEFAULT 'stripe'");
    await ensureColumnAsync('admin_promo_codes', 'status', "TEXT NOT NULL DEFAULT 'active'");
    await ensureColumnAsync('admin_promo_codes', 'max_redemptions', 'INTEGER');
    await ensureColumnAsync('admin_promo_codes', 'times_redeemed', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumnAsync('admin_promo_codes', 'first_time_order_only', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumnAsync('admin_promo_codes', 'campaign_key', 'TEXT');
    await ensureColumnAsync('admin_promo_codes', 'recipient_email', 'TEXT');
    await ensureColumnAsync('admin_promo_codes', 'metadata', 'TEXT');
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_admin_promo_codes_created ON admin_promo_codes(created_at)');
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_admin_promo_codes_offer ON admin_promo_codes(offer_key, created_at)');
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_admin_promo_codes_stripe_promo ON admin_promo_codes(stripe_promotion_code_id)');
  })();

  try {
    await ensureSchemaPromise;
  } catch (error) {
    ensureSchemaPromise = null;
    throw error;
  }
}

function serializeMetadata(value) {
  if (!value) return null;
  return JSON.stringify(value);
}

function parseMetadata(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizePromoCodeRow(row) {
  if (!row) return null;
  return {
    ...row,
    max_redemptions: row.max_redemptions === null || row.max_redemptions === undefined
      ? null
      : Number(row.max_redemptions),
    times_redeemed: Number(row.times_redeemed || 0),
    first_time_order_only: Number(row.first_time_order_only || 0),
    metadata: parseMetadata(row.metadata),
  };
}

async function createPromoCodeRecordAsync({
  offerKey,
  offerLabel,
  provider = 'stripe',
  code,
  status = 'active',
  stripeCouponId = null,
  stripePromotionCodeId = null,
  maxRedemptions = null,
  timesRedeemed = 0,
  firstTimeOrderOnly = false,
  campaignKey = null,
  recipientEmail = null,
  metadata = null,
  createdByUserId = null,
}) {
  await ensurePromoCodeSchemaAsync();
  const id = uuidv4();
  await adapter.executeAsync(`
    INSERT INTO admin_promo_codes (
      id,
      offer_key,
      offer_label,
      provider,
      code,
      status,
      stripe_coupon_id,
      stripe_promotion_code_id,
      max_redemptions,
      times_redeemed,
      first_time_order_only,
      campaign_key,
      recipient_email,
      metadata,
      created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    String(offerKey || '').trim(),
    String(offerLabel || '').trim(),
    String(provider || 'stripe').trim().toLowerCase() || 'stripe',
    String(code || '').trim(),
    String(status || 'active').trim().toLowerCase() || 'active',
    stripeCouponId || null,
    stripePromotionCodeId || null,
    maxRedemptions === null || maxRedemptions === undefined ? null : Number(maxRedemptions),
    Number(timesRedeemed || 0),
    firstTimeOrderOnly ? 1 : 0,
    String(campaignKey || '').trim() || null,
    String(recipientEmail || '').trim().toLowerCase() || null,
    serializeMetadata(metadata),
    createdByUserId || null,
  ]);
  return getPromoCodeRecordByIdAsync(id);
}

async function getPromoCodeRecordByIdAsync(id) {
  await ensurePromoCodeSchemaAsync();
  return normalizePromoCodeRow(await adapter.queryOneAsync(
    'SELECT * FROM admin_promo_codes WHERE id = ?',
    [id]
  ));
}

async function listPromoCodeRecordsAsync({ limit = 50, offset = 0 } = {}) {
  await ensurePromoCodeSchemaAsync();
  const safeLimit = Math.max(1, Math.min(Number(limit || 50), 200));
  const safeOffset = Math.max(0, Number(offset || 0));
  const rows = await adapter.queryAllAsync(`
    SELECT *
    FROM admin_promo_codes
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `, [safeLimit, safeOffset]);
  return rows.map(normalizePromoCodeRow);
}

async function updatePromoCodeRecordAsync(id, patch = {}) {
  await ensurePromoCodeSchemaAsync();
  const fields = [];
  const values = [];
  const addField = (column, value) => {
    fields.push(`${column} = ?`);
    values.push(value);
  };

  if (patch.status !== undefined) addField('status', String(patch.status || 'active').trim().toLowerCase() || 'active');
  if (patch.timesRedeemed !== undefined) addField('times_redeemed', Number(patch.timesRedeemed || 0));
  if (patch.maxRedemptions !== undefined) {
    addField('max_redemptions', patch.maxRedemptions === null ? null : Number(patch.maxRedemptions));
  }
  if (patch.metadata !== undefined) addField('metadata', serializeMetadata(patch.metadata));

  if (fields.length === 0) return getPromoCodeRecordByIdAsync(id);
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  await adapter.executeAsync(`
    UPDATE admin_promo_codes
    SET ${fields.join(', ')}
    WHERE id = ?
  `, values);
  return getPromoCodeRecordByIdAsync(id);
}

module.exports = {
  ensurePromoCodeSchemaAsync,
  createPromoCodeRecordAsync,
  getPromoCodeRecordByIdAsync,
  listPromoCodeRecordsAsync,
  updatePromoCodeRecordAsync,
};

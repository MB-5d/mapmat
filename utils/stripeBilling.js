const Stripe = require('stripe');
const billingStore = require('../stores/billingStore');
const {
  getBillingPlanConfig,
  getCanonicalBillingPlanKey,
} = require('./entitlements');

class BillingError extends Error {
  constructor(message, status = 400, code = 'BILLING_ERROR') {
    super(message);
    this.name = 'BillingError';
    this.status = status;
    this.code = code;
  }
}

let stripeClient = null;
let stripeClientKey = null;

function parseEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeText(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeBillingCycle(value, fallback = 'monthly') {
  const normalized = String(value || '').trim().toLowerCase();
  if (['year', 'yearly', 'annual', 'annually'].includes(normalized)) return 'yearly';
  if (['month', 'monthly'].includes(normalized)) return 'monthly';
  return fallback;
}

function getStripeSecretKey() {
  return normalizeText(process.env.STRIPE_SECRET_KEY);
}

function isStripeBillingEnabled() {
  return parseEnvBool(process.env.BILLING_STRIPE_ENABLED, false) && !!getStripeSecretKey();
}

function getStripeClient({ requireEnabled = true } = {}) {
  const secretKey = getStripeSecretKey();
  if (requireEnabled && !isStripeBillingEnabled()) {
    throw new BillingError('Billing is not enabled yet.', 503, 'BILLING_NOT_ENABLED');
  }
  if (!secretKey) return null;
  if (!stripeClient || stripeClientKey !== secretKey) {
    stripeClient = new Stripe(secretKey);
    stripeClientKey = secretKey;
  }
  return stripeClient;
}

function getAppBaseUrl() {
  const configured = normalizeText(process.env.APP_BASE_URL);
  if (configured) return configured.replace(/\/+$/, '');
  const frontendUrl = String(process.env.FRONTEND_URL || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)[0];
  return (frontendUrl || 'http://localhost:3001').replace(/\/+$/, '');
}

function normalizeReturnPath(rawPath, fallback = '/app') {
  const value = String(rawPath || '').trim();
  if (!value) return fallback;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const parsed = new URL(value);
    return `${parsed.pathname || fallback}${parsed.search || ''}${parsed.hash || ''}`;
  } catch {
    return fallback;
  }
}

function buildReturnUrl(rawPath, result, params = {}) {
  const base = getAppBaseUrl();
  const path = normalizeReturnPath(rawPath);
  const url = new URL(path, base);
  if (result) url.searchParams.set('billing', result);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString().replace(/%7B([A-Z_]+)%7D/g, '{$1}');
}

function getEnvNameCandidates(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean);
  const key = normalizeText(value);
  return key ? [key] : [];
}

function getPriceEnvCandidates(entry) {
  const candidates = [];
  if (entry?.priceEnv) candidates.push(entry.priceEnv);
  if (Array.isArray(entry?.priceEnvFallbacks)) candidates.push(...entry.priceEnvFallbacks);
  if (Array.isArray(entry?.priceEnvCandidates)) candidates.push(...entry.priceEnvCandidates);
  return getEnvNameCandidates(candidates);
}

function resolveConfiguredPrice(envName) {
  for (const key of getEnvNameCandidates(envName)) {
    const value = normalizeText(process.env[key]);
    if (value) return value;
  }
  return null;
}

function getStripeConfig() {
  return getBillingPlanConfig().stripe || {};
}

function getStripePlanPriceEntries(planKey, entry) {
  if (entry?.prices && typeof entry.prices === 'object') {
    return Object.entries(entry.prices).map(([cycle, priceEntry]) => ({
      planKey,
      billingCycle: normalizeBillingCycle(cycle),
      entry: priceEntry || {},
    }));
  }
  const billingCycle = normalizeBillingCycle(entry?.billingCycle || entry?.cycle || entry?.interval);
  return [{
    planKey,
    billingCycle,
    entry: entry || {},
  }];
}

function listConfiguredPlanPrices() {
  const billingConfig = getBillingPlanConfig();
  const stripeConfig = billingConfig.stripe || {};
  return Object.entries(stripeConfig.plans || {}).flatMap(([planKey, entry]) => {
    const normalizedPlanKey = getCanonicalBillingPlanKey(billingConfig, planKey);
    const plan = billingConfig.plans?.[normalizedPlanKey] || null;
    return getStripePlanPriceEntries(normalizedPlanKey, entry).map((priceEntry) => {
      const priceEnvCandidates = getPriceEnvCandidates(priceEntry.entry);
      const priceId = resolveConfiguredPrice(priceEnvCandidates);
      const primaryPriceEnv = priceEnvCandidates[0] || null;
      const interval = priceEntry.entry.interval
        || (priceEntry.billingCycle === 'yearly' ? 'year' : 'month');
      return {
        key: normalizedPlanKey,
        name: plan?.name || normalizedPlanKey,
        billingCycle: priceEntry.billingCycle,
        priceEnv: primaryPriceEnv,
        priceEnvFallbacks: priceEnvCandidates.slice(1),
        priceId,
        interval,
        enabled: !!priceId,
      };
    });
  });
}

function listConfiguredPlanCatalogEntries() {
  const grouped = new Map();
  for (const { priceId, ...entry } of listConfiguredPlanPrices()) {
    const current = grouped.get(entry.key) || {
      key: entry.key,
      name: entry.name,
      configured: false,
      prices: {},
    };
    current.prices[entry.billingCycle] = {
      billingCycle: entry.billingCycle,
      priceEnv: entry.priceEnv,
      priceEnvFallbacks: entry.priceEnvFallbacks,
      interval: entry.interval,
      configured: !!priceId,
      enabled: !!priceId,
    };
    current.configured = current.configured || !!priceId;
    grouped.set(entry.key, current);
  }
  return Array.from(grouped.values()).map((entry) => ({
    ...entry,
    enabled: entry.configured,
  }));
}

function listConfiguredLegacyPlanPrices() {
  return listConfiguredPlanPrices().map(({ priceId, ...entry }) => ({
    ...entry,
    configured: !!priceId,
  }));
}

function getPlanPriceConfig(planKey, billingCycle = 'monthly') {
  const normalizedKey = getCanonicalBillingPlanKey(getBillingPlanConfig(), planKey);
  const normalizedCycle = normalizeBillingCycle(billingCycle);
  const entry = listConfiguredPlanPrices().find((item) => (
    item.key === normalizedKey && item.billingCycle === normalizedCycle
  ));
  if (!entry) {
    throw new BillingError('Choose a valid paid plan.', 400, 'INVALID_PLAN');
  }
  if (!entry.priceId) {
    throw new BillingError('This plan is not configured for checkout yet.', 503, 'BILLING_PRICE_NOT_CONFIGURED');
  }
  return entry;
}

function listConfiguredAddOnPrices() {
  const stripeConfig = getStripeConfig();
  return Object.entries(stripeConfig.addOns || {}).map(([addonKey, entry]) => {
    const priceId = resolveConfiguredPrice(entry.priceEnv);
    return {
      key: addonKey,
      name: entry.name || addonKey,
      priceEnv: entry.priceEnv || null,
      priceId,
      mode: entry.mode || 'payment',
      meter: entry.meter || null,
      featureKey: entry.featureKey || null,
      quantity: Math.max(0, Math.floor(Number(entry.quantity || 0))),
      resetBehavior: entry.resetBehavior || 'rollover',
      durationDays: entry.durationDays === undefined || entry.durationDays === null
        ? null
        : Math.max(1, Math.floor(Number(entry.durationDays || 0))),
      enabled: !!priceId,
    };
  });
}

function getBillingCatalogForClient() {
  return {
    enabled: isStripeBillingEnabled(),
    plans: listConfiguredPlanCatalogEntries(),
    planPrices: listConfiguredLegacyPlanPrices(),
    addOns: listConfiguredAddOnPrices().map(({ priceId, ...entry }) => ({
      ...entry,
      configured: !!priceId,
    })),
  };
}

function getAddOnPriceConfig(addonKey) {
  const normalizedKey = String(addonKey || '').trim().toLowerCase();
  const entry = listConfiguredAddOnPrices().find((item) => item.key === normalizedKey);
  if (!entry) {
    throw new BillingError('Choose a valid add-on.', 400, 'INVALID_ADDON');
  }
  if (!entry.priceId) {
    throw new BillingError('This add-on is not configured for checkout yet.', 503, 'BILLING_PRICE_NOT_CONFIGURED');
  }
  if (!entry.meter && !entry.featureKey) {
    throw new BillingError('This add-on does not map to a Vellic entitlement.', 500, 'BILLING_ADDON_MAPPING_INVALID');
  }
  return entry;
}

function getPlanPriceConfigByStripePrice(priceId) {
  const normalizedPriceId = normalizeText(priceId);
  if (!normalizedPriceId) return null;
  return listConfiguredPlanPrices().find((entry) => entry.priceId === normalizedPriceId) || null;
}

function getAddOnPriceConfigByStripePrice(priceId) {
  const normalizedPriceId = normalizeText(priceId);
  if (!normalizedPriceId) return null;
  return listConfiguredAddOnPrices().find((entry) => entry.priceId === normalizedPriceId) || null;
}

function getStripeObjectId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.id || null;
}

function stripeTimestampToDate(value) {
  const seconds = Number(value || 0);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

function getSubscriptionPeriod(subscription) {
  const firstItem = subscription?.items?.data?.[0] || null;
  return {
    start: stripeTimestampToDate(subscription?.current_period_start || firstItem?.current_period_start),
    end: stripeTimestampToDate(subscription?.current_period_end || firstItem?.current_period_end),
  };
}

function getSubscriptionPrice(subscription) {
  const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
  const matchingItem = items.find((item) => getPlanPriceConfigByStripePrice(item?.price?.id)) || items[0] || null;
  const price = matchingItem?.price || null;
  return {
    priceId: price?.id || null,
    productId: getStripeObjectId(price?.product),
    planPrice: getPlanPriceConfigByStripePrice(price?.id),
  };
}

function getLatestInvoiceId(subscription) {
  return getStripeObjectId(subscription?.latest_invoice);
}

function getSubscriptionAccountState(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'canceled' || normalized === 'incomplete_expired') return 'archived';
  return 'active';
}

async function findAccountForStripeObjectAsync({ accountId = null, customerId = null, subscriptionId = null }) {
  if (accountId) {
    const account = await billingStore.getBillingAccountByIdAsync(accountId);
    if (account) return account;
  }
  if (subscriptionId) {
    const account = await billingStore.getBillingAccountByStripeSubscriptionIdAsync(subscriptionId);
    if (account) return account;
  }
  if (customerId) {
    const account = await billingStore.getBillingAccountByStripeCustomerIdAsync(customerId);
    if (account) return account;
  }
  return null;
}

async function getOrCreateStripeCustomerAsync({ stripe, account, user }) {
  if (account?.stripe_customer_id) return account.stripe_customer_id;
  const customer = await stripe.customers.create({
    email: user?.email || undefined,
    name: user?.name || undefined,
    metadata: {
      vellicAccountId: account.id,
      vellicOwnerUserId: account.owner_user_id,
    },
  });
  await billingStore.updateBillingAccountStripeCustomerAsync({
    accountId: account.id,
    stripeCustomerId: customer.id,
  });
  return customer.id;
}

async function createPlanCheckoutSessionAsync({ user, account, planKey, billingCycle = 'monthly', returnPath = '/app' }) {
  const stripe = getStripeClient();
  const plan = getPlanPriceConfig(planKey, billingCycle);
  if (account?.stripe_subscription_id && ['active', 'trialing', 'past_due', 'unpaid'].includes(String(account.stripe_subscription_status || '').toLowerCase())) {
    throw new BillingError('Use the billing portal to change this subscription.', 409, 'BILLING_PORTAL_REQUIRED');
  }
  const customerId = await getOrCreateStripeCustomerAsync({ stripe, account, user });
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    success_url: buildReturnUrl(returnPath, 'success', {
      billingSessionId: '{CHECKOUT_SESSION_ID}',
    }),
    cancel_url: buildReturnUrl(returnPath, 'cancelled'),
    metadata: {
      checkoutType: 'plan',
      planKey: plan.key,
      billingCycle: plan.billingCycle,
      vellicAccountId: account.id,
      vellicOwnerUserId: account.owner_user_id,
    },
    subscription_data: {
      metadata: {
        planKey: plan.key,
        billingCycle: plan.billingCycle,
        vellicAccountId: account.id,
        vellicOwnerUserId: account.owner_user_id,
      },
    },
    allow_promotion_codes: true,
  });
  return session;
}

async function createAddOnCheckoutSessionAsync({ user, account, addonKey, quantity = 1, returnPath = '/app' }) {
  const stripe = getStripeClient();
  const addOn = getAddOnPriceConfig(addonKey);
  const customerId = await getOrCreateStripeCustomerAsync({ stripe, account, user });
  const safeQuantity = Math.min(Math.max(1, Math.floor(Number(quantity || 1))), 100);
  const sessionPayload = {
    mode: addOn.mode || 'payment',
    customer: customerId,
    line_items: [{ price: addOn.priceId, quantity: safeQuantity }],
    success_url: buildReturnUrl(returnPath, 'success', {
      billingSessionId: '{CHECKOUT_SESSION_ID}',
    }),
    cancel_url: buildReturnUrl(returnPath, 'cancelled'),
    metadata: {
      checkoutType: 'addon',
      addonKey: addOn.key,
      vellicAccountId: account.id,
      vellicOwnerUserId: account.owner_user_id,
    },
    allow_promotion_codes: true,
  };
  if (sessionPayload.mode === 'payment') {
    sessionPayload.payment_intent_data = {
      metadata: sessionPayload.metadata,
    };
  }
  const session = await stripe.checkout.sessions.create(sessionPayload);
  return session;
}

async function createPortalSessionAsync({ user, account, returnPath = '/app' }) {
  const stripe = getStripeClient();
  const customerId = await getOrCreateStripeCustomerAsync({ stripe, account, user });
  const stripeConfig = getStripeConfig();
  const portalConfigurationId = resolveConfiguredPrice(stripeConfig.portalConfigurationEnv);
  const payload = {
    customer: customerId,
    return_url: buildReturnUrl(returnPath, 'portal_return'),
  };
  if (portalConfigurationId) payload.configuration = portalConfigurationId;
  return stripe.billingPortal.sessions.create(payload);
}

async function applyStripeSubscriptionToAccountAsync(subscription, accountIdOverride = null) {
  const customerId = getStripeObjectId(subscription?.customer);
  const subscriptionId = subscription?.id || null;
  const account = await findAccountForStripeObjectAsync({
    accountId: accountIdOverride || subscription?.metadata?.vellicAccountId,
    customerId,
    subscriptionId,
  });
  if (!account) {
    throw new BillingError('Stripe subscription does not map to a Vellic billing account.', 404, 'BILLING_ACCOUNT_NOT_FOUND');
  }

  const { priceId, productId, planPrice } = getSubscriptionPrice(subscription);
  const status = String(subscription?.status || '').trim().toLowerCase() || null;
  if (status === 'canceled' || status === 'incomplete_expired') {
    return billingStore.archiveBillingAccountFromStripeAsync({
      accountId: account.id,
      stripeSubscriptionStatus: status,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      stripePriceId: priceId,
      cancelledAt: stripeTimestampToDate(subscription?.canceled_at) || new Date(),
    });
  }

  const period = getSubscriptionPeriod(subscription);
  return billingStore.updateBillingAccountFromStripeSubscriptionAsync({
    accountId: account.id,
    planKey: planPrice?.key,
    accountState: getSubscriptionAccountState(status),
    currentPeriodStartedAt: period.start,
    currentPeriodEndsAt: period.end,
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    cancelledAt: stripeTimestampToDate(subscription?.canceled_at),
    stripeCancelAt: stripeTimestampToDate(subscription?.cancel_at),
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripePriceId: priceId,
    stripeProductId: productId,
    stripeSubscriptionStatus: status,
    stripeLatestInvoiceId: getLatestInvoiceId(subscription),
    clearTrial: true,
  });
}

function getGrantEndDate(addOn) {
  if (!addOn?.durationDays) return null;
  return new Date(Date.now() + addOn.durationDays * 24 * 60 * 60 * 1000);
}

async function grantAddOnsForCheckoutSessionAsync({ stripe, session, account }) {
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
    expand: ['data.price.product'],
  });
  const grants = [];
  for (const item of lineItems.data || []) {
    const addOn = getAddOnPriceConfigByStripePrice(item?.price?.id);
    if (!addOn) continue;
    const purchasedQuantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
    const quantity = addOn.quantity ? addOn.quantity * purchasedQuantity : null;
    const externalRef = `stripe:checkout:${session.id}:${addOn.key}:${item.price.id}`;
    const result = await billingStore.upsertEntitlementGrantByExternalRefAsync({
      accountId: account.id,
      source: 'addon',
      externalRef,
      meter: addOn.meter || null,
      featureKey: addOn.featureKey || null,
      quantity,
      resetBehavior: addOn.resetBehavior || 'rollover',
      startsAt: new Date(),
      endsAt: getGrantEndDate(addOn),
      metadata: {
        provider: 'stripe',
        checkoutSessionId: session.id,
        customerId: getStripeObjectId(session.customer),
        paymentIntentId: getStripeObjectId(session.payment_intent),
        priceId: item.price.id,
        addonKey: addOn.key,
        purchasedQuantity,
      },
    });
    grants.push(result);
  }
  return grants;
}

async function handleCheckoutSessionCompletedAsync({ stripe, session }) {
  const accountId = session?.metadata?.vellicAccountId || null;
  const customerId = getStripeObjectId(session?.customer);
  const account = await findAccountForStripeObjectAsync({
    accountId,
    customerId,
  });
  if (!account) {
    throw new BillingError('Stripe checkout does not map to a Vellic billing account.', 404, 'BILLING_ACCOUNT_NOT_FOUND');
  }
  if (customerId && !account.stripe_customer_id) {
    await billingStore.updateBillingAccountStripeCustomerAsync({
      accountId: account.id,
      stripeCustomerId: customerId,
    });
  }

  if (session.mode === 'subscription' && session.subscription) {
    const subscription = await stripe.subscriptions.retrieve(getStripeObjectId(session.subscription));
    await applyStripeSubscriptionToAccountAsync(subscription, account.id);
    return { accountId: account.id, grants: [] };
  }

  if (session.mode === 'payment') {
    const grants = await grantAddOnsForCheckoutSessionAsync({ stripe, session, account });
    return { accountId: account.id, grants };
  }

  return { accountId: account.id, grants: [] };
}

function assertCheckoutSessionBelongsToAccount({ session, account }) {
  const sessionAccountId = session?.metadata?.vellicAccountId || null;
  const customerId = getStripeObjectId(session?.customer);
  if (sessionAccountId && sessionAccountId !== account.id) {
    throw new BillingError('Stripe checkout does not belong to this Vellic billing account.', 403, 'BILLING_ACCOUNT_MISMATCH');
  }
  if (!sessionAccountId && (!customerId || !account.stripe_customer_id || customerId !== account.stripe_customer_id)) {
    throw new BillingError('Stripe checkout does not belong to this Vellic billing account.', 403, 'BILLING_ACCOUNT_MISMATCH');
  }
}

async function refreshBillingAccountFromStripeAsync({ account, checkoutSessionId = null, stripeClient = null }) {
  if (!account) {
    throw new BillingError('Billing account is not available.', 404, 'BILLING_ACCOUNT_NOT_FOUND');
  }
  const stripe = stripeClient || getStripeClient();
  const sessionId = normalizeText(checkoutSessionId);

  if (sessionId) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    assertCheckoutSessionBelongsToAccount({ session, account });
    if (session.mode === 'payment' && session.payment_status && session.payment_status !== 'paid') {
      return {
        accountId: account.id,
        refreshed: false,
        source: 'checkout_session',
        status: session.payment_status,
      };
    }
    const result = await handleCheckoutSessionCompletedAsync({ stripe, session });
    return {
      ...result,
      refreshed: true,
      source: 'checkout_session',
      status: session.status || null,
    };
  }

  if (account.stripe_subscription_id) {
    const subscription = await stripe.subscriptions.retrieve(account.stripe_subscription_id);
    const updatedAccount = await applyStripeSubscriptionToAccountAsync(subscription, account.id);
    return {
      accountId: updatedAccount?.id || account.id,
      refreshed: true,
      source: 'subscription',
      status: subscription.status || null,
    };
  }

  return {
    accountId: account.id,
    refreshed: false,
    source: 'none',
    status: null,
  };
}

async function handleInvoiceStatusAsync({ stripe, invoice, failed = false }) {
  const subscriptionId = getStripeObjectId(invoice?.subscription);
  const customerId = getStripeObjectId(invoice?.customer);
  const account = await findAccountForStripeObjectAsync({ subscriptionId, customerId });
  if (!account) return { accountId: null };
  if (failed) {
    await billingStore.updateBillingAccountFromStripeSubscriptionAsync({
      accountId: account.id,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripeSubscriptionStatus: 'past_due',
      stripeLatestInvoiceId: invoice?.id || null,
      clearTrial: false,
    });
    return { accountId: account.id };
  }
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await applyStripeSubscriptionToAccountAsync(subscription, account.id);
  }
  return { accountId: account.id };
}

async function processVerifiedStripeEventAsync({ stripe, event }) {
  const object = event?.data?.object || {};
  if (event.type === 'checkout.session.completed') {
    return handleCheckoutSessionCompletedAsync({ stripe, session: object });
  }
  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const account = await applyStripeSubscriptionToAccountAsync(object);
    return { accountId: account?.id || null };
  }
  if (event.type === 'customer.subscription.deleted') {
    const account = await applyStripeSubscriptionToAccountAsync({ ...object, status: 'canceled' });
    return { accountId: account?.id || null };
  }
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
    return handleInvoiceStatusAsync({ stripe, invoice: object, failed: false });
  }
  if (event.type === 'invoice.payment_failed') {
    return handleInvoiceStatusAsync({ stripe, invoice: object, failed: true });
  }
  return { accountId: null };
}

async function processStripeWebhookAsync({ rawBody, signature }) {
  const webhookSecret = normalizeText(process.env.STRIPE_WEBHOOK_SECRET);
  if (!webhookSecret) {
    throw new BillingError('Stripe webhook secret is not configured.', 503, 'BILLING_WEBHOOK_NOT_CONFIGURED');
  }
  if (!signature) {
    throw new BillingError('Missing Stripe webhook signature.', 401, 'BILLING_WEBHOOK_SIGNATURE_MISSING');
  }
  const stripe = getStripeClient();
  const tolerance = Number(process.env.STRIPE_WEBHOOK_TOLERANCE_SEC || 0);
  const eventArgs = [rawBody, signature, webhookSecret];
  if (Number.isFinite(tolerance) && tolerance > 0) eventArgs.push(tolerance);
  const event = stripe.webhooks.constructEvent(...eventArgs);
  const objectId = event?.data?.object?.id || null;
  const started = await billingStore.startStripeWebhookEventAsync({
    eventId: event.id,
    eventType: event.type,
    objectId,
  });
  if (started.duplicate) {
    return {
      ok: true,
      duplicate: true,
      eventId: event.id,
      eventType: event.type,
    };
  }

  try {
    const result = await processVerifiedStripeEventAsync({ stripe, event });
    await billingStore.markStripeWebhookEventProcessedAsync({
      eventId: event.id,
      accountId: result?.accountId || null,
      objectId,
    });
    return {
      ok: true,
      duplicate: false,
      eventId: event.id,
      eventType: event.type,
      accountId: result?.accountId || null,
    };
  } catch (error) {
    await billingStore.markStripeWebhookEventFailedAsync({
      eventId: event.id,
      objectId,
      error: error?.message || String(error),
    });
    throw error;
  }
}

module.exports = {
  BillingError,
  isStripeBillingEnabled,
  getBillingCatalogForClient,
  getPlanPriceConfigByStripePrice,
  getAddOnPriceConfigByStripePrice,
  createPlanCheckoutSessionAsync,
  createAddOnCheckoutSessionAsync,
  createPortalSessionAsync,
  refreshBillingAccountFromStripeAsync,
  applyStripeSubscriptionToAccountAsync,
  processStripeWebhookAsync,
};

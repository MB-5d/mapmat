const Stripe = require('stripe');
const billingStore = require('../stores/billingStore');
const {
  getBillingPlanConfig,
  getCanonicalBillingPlanKey,
  METERS,
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
let stripePriceDisplayCache = {
  key: '',
  expiresAt: 0,
  displays: new Map(),
};

const STRIPE_PRICE_DISPLAY_CACHE_MS = 5 * 60 * 1000;
const ZERO_TOTAL_PAYMENT_METHOD_COLLECTION = 'if_required';

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
    throw new BillingError('Checkout is unavailable.', 503, 'BILLING_NOT_ENABLED');
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

function getCanonicalAddOnKey(addonKey) {
  const normalizedKey = String(addonKey || '').trim().toLowerCase();
  const aliases = getStripeConfig().addOnAliases || {};
  return String(aliases[normalizedKey] || normalizedKey).trim().toLowerCase();
}

function getCanonicalRecurringAddOnKey(addonKey) {
  const normalizedKey = String(addonKey || '').trim().toLowerCase();
  const aliases = getStripeConfig().recurringAddOnAliases || {};
  return String(aliases[normalizedKey] || normalizedKey).trim().toLowerCase();
}

function normalizeMeterKey(value) {
  const key = String(value || '').trim();
  const aliases = {
    activePages: METERS.activePages,
    crawlPages: METERS.activePages,
    activeMaps: METERS.activeMaps,
    screenshotCredits: METERS.screenshotCredits,
    organizedExports: METERS.organizedExports,
    downloads: METERS.downloads,
    editors: METERS.editors,
    seats: METERS.editors,
  };
  return aliases[key] || key || null;
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

function normalizeCurrency(value) {
  return String(value || 'usd').trim().toUpperCase() || 'USD';
}

function formatCurrencyAmount(amount, currency = 'usd') {
  const safeAmount = Math.max(0, Math.floor(Number(amount || 0)));
  const normalizedCurrency = normalizeCurrency(currency);
  const majorAmount = safeAmount / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: safeAmount % 100 === 0 ? 0 : 2,
      maximumFractionDigits: safeAmount % 100 === 0 ? 0 : 2,
    }).format(majorAmount);
  } catch {
    return `$${majorAmount.toLocaleString('en-US', {
      minimumFractionDigits: safeAmount % 100 === 0 ? 0 : 2,
      maximumFractionDigits: safeAmount % 100 === 0 ? 0 : 2,
    })}`;
  }
}

function getBillingCyclePriceSuffix(billingCycle) {
  return normalizeBillingCycle(billingCycle) === 'yearly' ? '/yr' : '/mo';
}

function getBillingCycleIntervalLabel(billingCycle) {
  return normalizeBillingCycle(billingCycle) === 'yearly' ? 'Yearly' : 'Monthly';
}

function getPlanDisplay(plan) {
  return plan?.display && typeof plan.display === 'object' ? plan.display : {};
}

function getStaticPlanPriceDisplay(plan, billingCycle) {
  const cycle = normalizeBillingCycle(billingCycle);
  const configured = getPlanDisplay(plan).prices?.[cycle] || null;
  if (!configured) return null;
  const amount = Math.max(0, Math.floor(Number(configured.amount || configured.unitAmount || 0)));
  const currency = String(configured.currency || 'usd').trim().toLowerCase() || 'usd';
  return {
    amount,
    unitAmount: amount,
    currency,
    formatted: configured.formatted || formatCurrencyAmount(amount, currency),
    suffix: configured.suffix || getBillingCyclePriceSuffix(cycle),
    intervalLabel: configured.intervalLabel || getBillingCycleIntervalLabel(cycle),
    source: 'config',
  };
}

function formatPlanLimitValue(value, singular, plural = `${singular}s`, {
  zeroLabel = null,
  unlimitedLabel = null,
} = {}) {
  if (value === null) return unlimitedLabel || `Unlimited ${plural}`;
  const number = Math.max(0, Math.floor(Number(value || 0)));
  if (number === 0 && zeroLabel) return zeroLabel;
  return `${number.toLocaleString('en-US')} ${number === 1 ? singular : plural}`;
}

function buildPlanFeatureHighlights(plan) {
  const limits = plan?.limits || {};
  const highlights = [
    formatPlanLimitValue(limits.activeProjects, 'active project', 'active projects', {
      unlimitedLabel: 'Unlimited projects',
    }),
    `${formatPlanLimitValue(limits.activePages ?? limits.crawlPages, 'active page', 'active pages')} total on account`,
  ];

  if (limits.scanPagesPerRun !== undefined && limits.scanPagesPerRun !== null) {
    highlights.push(formatPlanLimitValue(limits.scanPagesPerRun, 'page per scan', 'pages per scan'));
  }

  const screenshotLimit = limits.screenshotCredits;
  if (screenshotLimit === null) {
    highlights.push('Unlimited screenshots');
  } else {
    const screenshotCount = Math.max(0, Math.floor(Number(screenshotLimit || 0)));
    highlights.push(screenshotCount === 0 ? 'No screenshots' : `${screenshotCount.toLocaleString('en-US')} screenshots incl.`);
  }
  const downloadsLimit = Object.prototype.hasOwnProperty.call(limits, 'downloads')
    ? limits.downloads
    : limits.organizedScreenshotExports;
  if (downloadsLimit === null) {
    highlights.push('Unlimited downloads (any format)');
  } else {
    const downloadCount = Math.max(0, Math.floor(Number(downloadsLimit || 0)));
    if (downloadCount === 0) {
      highlights.push('No downloads');
    } else if (plan?.features?.standardExports === false) {
      highlights.push(`${downloadCount.toLocaleString('en-US')} downloads (XML and Index)`);
    } else {
      highlights.push(`${downloadCount.toLocaleString('en-US')} ${downloadCount === 1 ? 'download' : 'downloads'}`);
    }
  }
  highlights.push(formatPlanLimitValue(limits.editors ?? limits.seats, 'editor', 'editors'));

  return highlights.filter(Boolean);
}

function mergePriceDisplay({ plan, billingCycle, priceId = null, liveDisplayByPriceId = new Map() }) {
  const cycle = normalizeBillingCycle(billingCycle);
  const staticDisplay = getStaticPlanPriceDisplay(plan, cycle) || {
    amount: 0,
    unitAmount: 0,
    currency: 'usd',
    formatted: formatCurrencyAmount(0, 'usd'),
    suffix: getBillingCyclePriceSuffix(cycle),
    intervalLabel: getBillingCycleIntervalLabel(cycle),
    source: 'config',
  };
  const liveDisplay = priceId ? liveDisplayByPriceId.get(priceId) : null;
  return {
    ...staticDisplay,
    ...(liveDisplay || {}),
    suffix: liveDisplay?.suffix || staticDisplay.suffix || getBillingCyclePriceSuffix(cycle),
    intervalLabel: liveDisplay?.intervalLabel || staticDisplay.intervalLabel || getBillingCycleIntervalLabel(cycle),
    source: liveDisplay ? 'stripe' : staticDisplay.source,
  };
}

function getPublicPlans(config) {
  return Object.values(config.plans || {})
    .filter((plan) => plan && !plan.internal)
    .sort((a, b) => {
      const order = ['free', 'pro', 'studio', 'agency'];
      return order.indexOf(a.key) - order.indexOf(b.key);
    });
}

function buildFreePlanPriceEntries(plan) {
  return ['monthly', 'yearly'].map((billingCycle) => ({
    key: plan.key,
    name: plan.name,
    billingCycle,
    priceEnv: null,
    priceEnvFallbacks: [],
    priceId: null,
    interval: billingCycle === 'yearly' ? 'year' : 'month',
    enabled: true,
  }));
}

function listConfiguredPlanCatalogEntries(liveDisplayByPriceId = new Map()) {
  const billingConfig = getBillingPlanConfig();
  const planPriceEntries = listConfiguredPlanPrices();
  const entriesByPlan = planPriceEntries.reduce((acc, entry) => {
    if (!acc.has(entry.key)) acc.set(entry.key, []);
    acc.get(entry.key).push(entry);
    return acc;
  }, new Map());

  return getPublicPlans(billingConfig).map((plan) => {
    const display = getPlanDisplay(plan);
    const priceEntries = plan.paid ? (entriesByPlan.get(plan.key) || []) : buildFreePlanPriceEntries(plan);
    const prices = {};
    priceEntries.forEach((entry) => {
      const displayPrice = mergePriceDisplay({
        plan,
        billingCycle: entry.billingCycle,
        priceId: entry.priceId,
        liveDisplayByPriceId,
      });
      prices[entry.billingCycle] = {
        billingCycle: entry.billingCycle,
        priceEnv: entry.priceEnv,
        priceEnvFallbacks: entry.priceEnvFallbacks,
        interval: entry.interval,
        configured: plan.paid ? !!entry.priceId : true,
        enabled: plan.paid ? !!entry.priceId : true,
        ...displayPrice,
      };
    });
    const configured = plan.paid
      ? Object.values(prices).some((price) => price.configured)
      : true;
    return {
      key: plan.key,
      name: plan.name,
      paid: Boolean(plan.paid),
      configured,
      enabled: configured,
      description: display.description || '',
      appNote: display.appNote || display.description || '',
      accent: display.accent || 'brand',
      marketingCta: display.marketingCta || (plan.paid ? 'Subscribe' : 'Get started'),
      marketingAction: display.marketingAction || (plan.paid ? 'checkout' : 'signup'),
      prices,
      limits: plan.limits || {},
      features: plan.features || {},
      featureHighlights: buildPlanFeatureHighlights(plan),
    };
  });
}

function listConfiguredLegacyPlanPrices(liveDisplayByPriceId = new Map()) {
  const billingConfig = getBillingPlanConfig();
  return listConfiguredPlanPrices().map(({ priceId, ...entry }) => {
    const plan = billingConfig.plans?.[entry.key] || null;
    return {
      ...entry,
      configured: !!priceId,
      ...mergePriceDisplay({
        plan,
        billingCycle: entry.billingCycle,
        priceId,
        liveDisplayByPriceId,
      }),
    };
  });
}

async function getLiveStripePriceDisplaysAsync() {
  const entries = [
    ...listConfiguredPlanPrices(),
    ...listConfiguredAddOnPrices(),
    ...listConfiguredRecurringAddOnPrices(),
  ].filter((entry) => entry.priceId);
  if (!isStripeBillingEnabled() || entries.length === 0) return new Map();
  const cacheKey = entries.map((entry) => entry.priceId).sort().join('|');
  const now = Date.now();
  if (
    stripePriceDisplayCache.key === cacheKey
    && stripePriceDisplayCache.expiresAt > now
  ) {
    return stripePriceDisplayCache.displays;
  }

  const stripe = getStripeClient();
  const displays = new Map();
  await Promise.all(entries.map(async (entry) => {
    try {
      const price = await stripe.prices.retrieve(entry.priceId, { expand: ['product'] });
      const unitAmount = Number(price.unit_amount ?? 0);
      const currency = String(price.currency || 'usd').trim().toLowerCase() || 'usd';
      const productName = typeof price.product === 'object' ? normalizeText(price.product?.name) : null;
      displays.set(entry.priceId, {
        amount: unitAmount,
        unitAmount,
        currency,
        formatted: formatCurrencyAmount(unitAmount, currency),
        suffix: entry.billingCycle ? getBillingCyclePriceSuffix(entry.billingCycle) : '',
        intervalLabel: entry.billingCycle ? getBillingCycleIntervalLabel(entry.billingCycle) : 'One-time',
        productName,
        source: 'stripe',
      });
    } catch (error) {
      console.warn('Stripe price display lookup failed:', {
        priceEnv: entry.priceEnv,
        billingCycle: entry.billingCycle,
        message: error?.message || String(error),
      });
    }
  }));

  stripePriceDisplayCache = {
    key: cacheKey,
    expiresAt: now + STRIPE_PRICE_DISPLAY_CACHE_MS,
    displays,
  };
  return displays;
}

function buildBillingCatalog(liveDisplayByPriceId = new Map()) {
  return {
    enabled: isStripeBillingEnabled(),
    plans: listConfiguredPlanCatalogEntries(liveDisplayByPriceId),
    planPrices: listConfiguredLegacyPlanPrices(liveDisplayByPriceId),
    addOns: listConfiguredAddOnPrices().map(({ priceId, ...entry }) => {
      const liveDisplay = priceId ? liveDisplayByPriceId.get(priceId) : null;
      return {
        ...entry,
        configured: !!priceId,
        amount: liveDisplay?.amount ?? null,
        unitAmount: liveDisplay?.unitAmount ?? null,
        currency: liveDisplay?.currency || 'usd',
        formatted: liveDisplay?.formatted || null,
        price: liveDisplay?.formatted || null,
        suffix: liveDisplay?.suffix || '',
        intervalLabel: liveDisplay?.intervalLabel || 'One-time',
        productName: liveDisplay?.productName || null,
        source: liveDisplay ? 'stripe' : null,
      };
    }),
    recurringAddOns: listConfiguredRecurringAddOnPrices().map(({ priceId, ...entry }) => {
      const liveDisplay = priceId ? liveDisplayByPriceId.get(priceId) : null;
      return {
        ...entry,
        configured: !!priceId,
        amount: liveDisplay?.amount ?? null,
        unitAmount: liveDisplay?.unitAmount ?? null,
        currency: liveDisplay?.currency || 'usd',
        formatted: liveDisplay?.formatted || null,
        price: liveDisplay?.formatted || null,
        suffix: liveDisplay?.suffix || getBillingCyclePriceSuffix(entry.billingCycle),
        intervalLabel: liveDisplay?.intervalLabel || getBillingCycleIntervalLabel(entry.billingCycle),
        productName: liveDisplay?.productName || null,
        source: liveDisplay ? 'stripe' : null,
      };
    }),
  };
}

function getBillingCatalogForClient() {
  return buildBillingCatalog();
}

async function getBillingCatalogForClientAsync() {
  const liveDisplayByPriceId = await getLiveStripePriceDisplaysAsync();
  return buildBillingCatalog(liveDisplayByPriceId);
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
    const priceEnvCandidates = getPriceEnvCandidates(entry);
    const priceId = resolveConfiguredPrice(priceEnvCandidates);
    return {
      key: addonKey,
      name: entry.name || addonKey,
      priceEnv: priceEnvCandidates[0] || null,
      priceEnvFallbacks: priceEnvCandidates.slice(1),
      priceId,
      mode: entry.mode || 'payment',
      meter: normalizeMeterKey(entry.meter) || null,
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

function getRecurringAddOnPriceEntries(addonKey, entry) {
  if (entry?.prices && typeof entry.prices === 'object') {
    return Object.entries(entry.prices).map(([cycle, priceEntry]) => ({
      addonKey,
      billingCycle: normalizeBillingCycle(cycle),
      entry: priceEntry || {},
    }));
  }
  const billingCycle = normalizeBillingCycle(entry?.billingCycle || entry?.cycle || entry?.interval);
  return [{
    addonKey,
    billingCycle,
    entry: entry || {},
  }];
}

function listConfiguredRecurringAddOnPrices() {
  const stripeConfig = getStripeConfig();
  return Object.entries(stripeConfig.recurringAddOns || {}).flatMap(([addonKey, entry]) => (
    getRecurringAddOnPriceEntries(addonKey, entry).map((priceEntry) => {
      const priceEnvCandidates = getPriceEnvCandidates(priceEntry.entry);
      const priceId = resolveConfiguredPrice(priceEnvCandidates);
      const interval = priceEntry.entry.interval
        || (priceEntry.billingCycle === 'yearly' ? 'year' : 'month');
      return {
        key: addonKey,
        name: entry.name || addonKey,
        billingCycle: priceEntry.billingCycle,
        priceEnv: priceEnvCandidates[0] || null,
        priceEnvFallbacks: priceEnvCandidates.slice(1),
        priceId,
        interval,
        mode: 'subscription',
        entitlements: entry.entitlements || {},
        enabled: !!priceId,
      };
    })
  ));
}

function getAddOnPriceConfig(addonKey) {
  const normalizedKey = getCanonicalAddOnKey(addonKey);
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

function getRecurringAddOnPriceConfig(addonKey, billingCycle = 'monthly') {
  const normalizedKey = getCanonicalRecurringAddOnKey(addonKey);
  const normalizedCycle = normalizeBillingCycle(billingCycle);
  const entry = listConfiguredRecurringAddOnPrices().find((item) => (
    item.key === normalizedKey && item.billingCycle === normalizedCycle
  ));
  if (!entry) {
    throw new BillingError('Choose a valid recurring add-on.', 400, 'INVALID_RECURRING_ADDON');
  }
  if (!entry.priceId) {
    throw new BillingError('This recurring add-on is not configured for checkout yet.', 503, 'BILLING_PRICE_NOT_CONFIGURED');
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

function getRecurringAddOnPriceConfigByStripePrice(priceId) {
  const normalizedPriceId = normalizeText(priceId);
  if (!normalizedPriceId) return null;
  return listConfiguredRecurringAddOnPrices().find((entry) => entry.priceId === normalizedPriceId) || null;
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

function getRecurringAddOnGrantEntries({ addOn, item, subscription, account }) {
  const entitlements = addOn?.entitlements || {};
  const itemQuantity = Math.max(0, Math.floor(Number(item?.quantity || 0)));
  if (itemQuantity <= 0) return [];
  const subscriptionId = subscription?.id || 'unknown';
  const priceId = item?.price?.id || 'unknown';
  const period = getSubscriptionPeriod(subscription);
  const periodStart = period.start || new Date();
  const periodEnd = period.end || null;
  const periodKey = periodStart.toISOString();

  return Object.entries(entitlements).flatMap(([key, value]) => {
    const meter = normalizeMeterKey(key);
    const baseQuantity = Math.max(0, Math.floor(Number(value || 0)));
    const quantity = baseQuantity * itemQuantity;
    if (!meter || quantity <= 0) return [];
    return [{
      accountId: account.id,
      source: 'subscription_addon',
      externalRef: `stripe:subscription:${subscriptionId}:${addOn.key}:${priceId}:${periodKey}:${meter}`,
      meter,
      featureKey: null,
      quantity,
      resetBehavior: 'period',
      startsAt: periodStart,
      endsAt: periodEnd,
      metadata: {
        provider: 'stripe',
        subscriptionId,
        customerId: getStripeObjectId(subscription.customer),
        priceId,
        addonKey: addOn.key,
        billingCycle: addOn.billingCycle,
        itemQuantity,
        entitlementKey: key,
      },
    }];
  });
}

function getSubscriptionModeAddOnGrantEntries({ addOn, item, subscription, account }) {
  const itemQuantity = Math.max(0, Math.floor(Number(item?.quantity || 0)));
  if (itemQuantity <= 0) return [];
  const subscriptionId = subscription?.id || 'unknown';
  const priceId = item?.price?.id || 'unknown';
  const period = getSubscriptionPeriod(subscription);
  const periodStart = period.start || new Date();
  const periodEnd = period.end || null;
  const periodKey = periodStart.toISOString();
  const quantity = addOn.quantity ? addOn.quantity * itemQuantity : null;
  if (!addOn.meter && !addOn.featureKey) return [];
  if (addOn.meter && (!quantity || quantity <= 0)) return [];
  return [{
    accountId: account.id,
    source: 'subscription_addon',
    externalRef: `stripe:subscription:${subscriptionId}:${addOn.key}:${priceId}:${periodKey}:${addOn.meter || addOn.featureKey}`,
    meter: addOn.meter || null,
    featureKey: addOn.featureKey || null,
    quantity,
    resetBehavior: addOn.resetBehavior || 'period',
    startsAt: periodStart,
    endsAt: periodEnd,
    metadata: {
      provider: 'stripe',
      subscriptionId,
      customerId: getStripeObjectId(subscription.customer),
      priceId,
      addonKey: addOn.key,
      itemQuantity,
    },
  }];
}

async function syncRecurringAddOnGrantsForSubscriptionAsync(subscription, account) {
  const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
  const grants = [];
  for (const item of items) {
    const addOn = getRecurringAddOnPriceConfigByStripePrice(item?.price?.id);
    const subscriptionModeAddOn = addOn
      ? null
      : getAddOnPriceConfigByStripePrice(item?.price?.id);
    if (!addOn && String(subscriptionModeAddOn?.mode || '').trim().toLowerCase() !== 'subscription') continue;
    const grantEntries = addOn
      ? getRecurringAddOnGrantEntries({ addOn, item, subscription, account })
      : getSubscriptionModeAddOnGrantEntries({ addOn: subscriptionModeAddOn, item, subscription, account });
    for (const entry of grantEntries) {
      grants.push(await billingStore.upsertAdjustableEntitlementGrantByExternalRefAsync(entry));
    }
  }
  return grants;
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

async function createPlanCheckoutSessionAsync({
  user,
  account,
  planKey,
  billingCycle = 'monthly',
  returnPath = '/app',
  extraEditorQuantity = 0,
  stripeClient: providedStripeClient = null,
}) {
  const stripe = providedStripeClient || getStripeClient();
  const plan = getPlanPriceConfig(planKey, billingCycle);
  const safeExtraEditorQuantity = Math.min(Math.max(0, Math.floor(Number(extraEditorQuantity || 0))), 100);
  const extraEditorAddOn = safeExtraEditorQuantity > 0
    ? getRecurringAddOnPriceConfig('extra_editor', plan.billingCycle)
    : null;
  if (account?.stripe_subscription_id && ['active', 'trialing', 'past_due', 'unpaid'].includes(String(account.stripe_subscription_status || '').toLowerCase())) {
    throw new BillingError('Use the billing portal to change this subscription.', 409, 'BILLING_PORTAL_REQUIRED');
  }
  const customerId = await getOrCreateStripeCustomerAsync({ stripe, account, user });
  const lineItems = [{ price: plan.priceId, quantity: 1 }];
  if (extraEditorAddOn) {
    lineItems.push({ price: extraEditorAddOn.priceId, quantity: safeExtraEditorQuantity });
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: lineItems,
    success_url: buildReturnUrl(returnPath, 'success', {
      billingSessionId: '{CHECKOUT_SESSION_ID}',
    }),
    cancel_url: buildReturnUrl(returnPath, 'cancelled'),
    metadata: {
      checkoutType: 'plan',
      planKey: plan.key,
      billingCycle: plan.billingCycle,
      extraEditorQuantity: String(safeExtraEditorQuantity),
      vellicAccountId: account.id,
      vellicOwnerUserId: account.owner_user_id,
    },
    subscription_data: {
      metadata: {
        planKey: plan.key,
        billingCycle: plan.billingCycle,
        extraEditorQuantity: String(safeExtraEditorQuantity),
        vellicAccountId: account.id,
        vellicOwnerUserId: account.owner_user_id,
      },
    },
    allow_promotion_codes: true,
    payment_method_collection: ZERO_TOTAL_PAYMENT_METHOD_COLLECTION,
  });
  return session;
}

async function createAddOnCheckoutSessionAsync({ user, account, addonKey, quantity = 1, returnPath = '/app', stripeClient: providedStripeClient = null }) {
  const stripe = providedStripeClient || getStripeClient();
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
    sessionPayload.invoice_creation = {
      enabled: true,
      invoice_data: {
        metadata: sessionPayload.metadata,
      },
    };
  } else if (sessionPayload.mode === 'subscription') {
    sessionPayload.payment_method_collection = ZERO_TOTAL_PAYMENT_METHOD_COLLECTION;
    sessionPayload.subscription_data = {
      metadata: sessionPayload.metadata,
    };
  }
  const session = await stripe.checkout.sessions.create(sessionPayload);
  return session;
}

function normalizeBundleAddOns(addOns = []) {
  const byKey = new Map();
  (Array.isArray(addOns) ? addOns : []).forEach((entry) => {
    const addOn = getAddOnPriceConfig(entry?.addonKey || entry?.key);
    const quantity = Math.min(Math.max(1, Math.floor(Number(entry?.quantity || 1))), 100);
    const current = byKey.get(addOn.key);
    byKey.set(addOn.key, {
      addOn,
      quantity: Math.min(100, (current?.quantity || 0) + quantity),
    });
  });
  return Array.from(byKey.values());
}

async function createBundleCheckoutSessionAsync({
  user,
  account,
  planKey = null,
  billingCycle = 'monthly',
  addOns = [],
  returnPath = '/app',
  stripeClient: providedStripeClient = null,
}) {
  const stripe = providedStripeClient || getStripeClient();
  const normalizedAddOns = normalizeBundleAddOns(addOns);
  const plan = planKey ? getPlanPriceConfig(planKey, billingCycle) : null;
  if (!plan && normalizedAddOns.length === 0) {
    throw new BillingError('Choose a plan or credit pack before checkout.', 400, 'BILLING_SELECTION_REQUIRED');
  }
  if (
    plan
    && account?.stripe_subscription_id
    && ['active', 'trialing', 'past_due', 'unpaid'].includes(String(account.stripe_subscription_status || '').toLowerCase())
  ) {
    throw new BillingError('Use the billing portal to change this subscription.', 409, 'BILLING_PORTAL_REQUIRED');
  }
  const customerId = await getOrCreateStripeCustomerAsync({ stripe, account, user });
  const hasSubscriptionAddOns = normalizedAddOns.some(({ addOn }) => (
    String(addOn?.mode || '').trim().toLowerCase() === 'subscription'
  ));
  const mode = plan || hasSubscriptionAddOns ? 'subscription' : 'payment';
  const lineItems = [
    ...(plan ? [{ price: plan.priceId, quantity: 1 }] : []),
    ...normalizedAddOns.map(({ addOn, quantity }) => ({ price: addOn.priceId, quantity })),
  ];
  const metadata = {
    checkoutType: plan ? 'bundle' : 'addon_bundle',
    planKey: plan?.key || '',
    billingCycle: plan?.billingCycle || '',
    addonKeys: normalizedAddOns.map(({ addOn }) => addOn.key).join(','),
    vellicAccountId: account.id,
    vellicOwnerUserId: account.owner_user_id,
  };
  const sessionPayload = {
    mode,
    customer: customerId,
    line_items: lineItems,
    success_url: buildReturnUrl(returnPath, 'success', {
      billingSessionId: '{CHECKOUT_SESSION_ID}',
    }),
    cancel_url: buildReturnUrl(returnPath, 'cancelled'),
    metadata,
    allow_promotion_codes: true,
  };
  if (mode === 'payment') {
    sessionPayload.payment_intent_data = { metadata };
    sessionPayload.invoice_creation = {
      enabled: true,
      invoice_data: { metadata },
    };
  } else {
    sessionPayload.payment_method_collection = ZERO_TOTAL_PAYMENT_METHOD_COLLECTION;
    sessionPayload.subscription_data = {
      metadata: {
        ...metadata,
        planKey: plan?.key || '',
        billingCycle: plan?.billingCycle || '',
      },
    };
  }
  return stripe.checkout.sessions.create(sessionPayload);
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
  if (!planPrice) {
    if (customerId && !account.stripe_customer_id) {
      await billingStore.updateBillingAccountStripeCustomerAsync({
        accountId: account.id,
        stripeCustomerId: customerId,
      });
    }
    if (status !== 'canceled' && status !== 'incomplete_expired') {
      await syncRecurringAddOnGrantsForSubscriptionAsync(subscription, account);
    }
    return billingStore.getBillingAccountByIdAsync(account.id);
  }
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
  const updatedAccount = await billingStore.updateBillingAccountFromStripeSubscriptionAsync({
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
  await syncRecurringAddOnGrantsForSubscriptionAsync(subscription, updatedAccount || account);
  return updatedAccount;
}

function getGrantEndDate(addOn) {
  if (!addOn?.durationDays) return null;
  return new Date(Date.now() + addOn.durationDays * 24 * 60 * 60 * 1000);
}

async function getCheckoutSessionLineItemsAsync({ stripe, session }) {
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
    expand: ['data.price.product'],
  });
  return Array.isArray(lineItems.data) ? lineItems.data : [];
}

function summarizeCheckoutLineItems(lineItems = []) {
  const metersByKey = new Map();
  let plan = null;

  for (const item of lineItems) {
    const priceId = item?.price?.id || null;
    const purchasedQuantity = Math.max(1, Math.floor(Number(item?.quantity || 1)));
    const planPrice = getPlanPriceConfigByStripePrice(priceId);
    if (planPrice && !plan) {
      plan = {
        key: planPrice.key,
        name: planPrice.name,
        billingCycle: planPrice.billingCycle,
      };
      continue;
    }

    const addOn = getAddOnPriceConfigByStripePrice(priceId);
    if (!addOn?.meter || !addOn?.quantity) continue;
    const quantity = Math.max(0, Math.floor(Number(addOn.quantity || 0))) * purchasedQuantity;
    if (quantity <= 0) continue;
    const current = metersByKey.get(addOn.meter) || {
      meter: addOn.meter,
      quantity: 0,
    };
    current.quantity += quantity;
    metersByKey.set(addOn.meter, current);
  }

  return {
    plan,
    meters: Array.from(metersByKey.values()),
  };
}

async function grantAddOnsForCheckoutSessionAsync({
  stripe,
  session,
  account,
  lineItems = null,
}) {
  const checkoutLineItems = lineItems || await getCheckoutSessionLineItemsAsync({ stripe, session });
  const grants = [];
  for (const item of checkoutLineItems) {
    const addOn = getAddOnPriceConfigByStripePrice(item?.price?.id);
    if (!addOn) continue;
    if (String(addOn.mode || '').trim().toLowerCase() === 'subscription') continue;
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
  const lineItems = await getCheckoutSessionLineItemsAsync({ stripe, session });
  const purchaseSummary = summarizeCheckoutLineItems(lineItems);

  if (session.mode === 'subscription' && session.subscription) {
    const subscription = await stripe.subscriptions.retrieve(getStripeObjectId(session.subscription));
    await applyStripeSubscriptionToAccountAsync(subscription, account.id);
    const grants = await grantAddOnsForCheckoutSessionAsync({
      stripe,
      session,
      account,
      lineItems,
    });
    return { accountId: account.id, grants, purchaseSummary };
  }

  if (session.mode === 'payment') {
    const grants = await grantAddOnsForCheckoutSessionAsync({
      stripe,
      session,
      account,
      lineItems,
    });
    return { accountId: account.id, grants, purchaseSummary };
  }

  return { accountId: account.id, grants: [], purchaseSummary };
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
  getBillingCatalogForClientAsync,
  getPlanPriceConfigByStripePrice,
  getAddOnPriceConfig,
  getAddOnPriceConfigByStripePrice,
  getRecurringAddOnPriceConfig,
  getRecurringAddOnPriceConfigByStripePrice,
  createPlanCheckoutSessionAsync,
  createAddOnCheckoutSessionAsync,
  createBundleCheckoutSessionAsync,
  createPortalSessionAsync,
  refreshBillingAccountFromStripeAsync,
  applyStripeSubscriptionToAccountAsync,
  processStripeWebhookAsync,
};

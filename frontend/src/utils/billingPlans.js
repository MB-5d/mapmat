export const BILLING_CYCLE_OPTIONS = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

export const PAID_BILLING_PLAN_KEYS = ['pro', 'studio', 'agency'];

const PLAN_ORDER = ['free', 'pro', 'studio', 'agency'];
const SCREENSHOT_CREDITS_METER = 'screenshot_credits';
const PAGE_CREDITS_METERS = new Set(['active_pages', 'crawl_pages']);

const FALLBACK_PLAN_CARDS = [
  {
    key: 'free',
    name: 'Free',
    paid: false,
    accent: 'green',
    description: 'For trying Vellic on a small site or one-off audit.',
    appNote: 'For trying Vellic on a small site or one-off audit.',
    marketingCta: 'Get started',
    marketingAction: 'signup',
    features: ['1 active project', '1,000 active pages total on account', '100 pages per scan', '25 screenshots incl.', '5 downloads (XML and Index)', '1 editor'],
    prices: {
      monthly: { amount: 0, currency: 'usd', formatted: '$0', suffix: '/mo', intervalLabel: 'Monthly', configured: true },
      yearly: { amount: 0, currency: 'usd', formatted: '$0', suffix: '/yr', intervalLabel: 'Yearly', configured: true },
    },
  },
  {
    key: 'pro',
    name: 'Pro',
    paid: true,
    accent: 'blue',
    description: 'For solo audits with screenshots and saved work.',
    appNote: 'For solo audits with screenshots and saved work.',
    marketingCta: 'Subscribe',
    marketingAction: 'checkout',
    features: ['5 active projects', '10,000 active pages total on account', '300 screenshots incl.', 'Unlimited downloads (any format)', '1 editor'],
    prices: {
      monthly: { amount: 800, currency: 'usd', formatted: '$8', suffix: '/mo', intervalLabel: 'Monthly', configured: true },
      yearly: { amount: 7200, currency: 'usd', formatted: '$72', suffix: '/yr', intervalLabel: 'Yearly', configured: true },
    },
  },
  {
    key: 'studio',
    name: 'Studio',
    paid: true,
    accent: 'purple',
    description: 'For small teams handling recurring site work.',
    appNote: 'For small teams handling recurring site work.',
    marketingCta: 'Subscribe',
    marketingAction: 'checkout',
    features: ['15 active projects', '50,000 active pages total on account', '1,000 screenshots incl.', 'Unlimited downloads (any format)', '3 editors'],
    prices: {
      monthly: { amount: 1800, currency: 'usd', formatted: '$18', suffix: '/mo', intervalLabel: 'Monthly', configured: true },
      yearly: { amount: 14400, currency: 'usd', formatted: '$144', suffix: '/yr', intervalLabel: 'Yearly', configured: true },
    },
  },
  {
    key: 'agency',
    name: 'Agency',
    paid: true,
    accent: 'coral',
    description: 'For heavier client audits and shared delivery.',
    appNote: 'For heavier client audits and shared delivery.',
    marketingCta: 'Subscribe',
    marketingAction: 'checkout',
    features: ['Unlimited projects', '200,000 active pages total on account', '5,000 screenshots incl.', 'Unlimited downloads (any format)', '10 editors'],
    prices: {
      monthly: { amount: 8800, currency: 'usd', formatted: '$88', suffix: '/mo', intervalLabel: 'Monthly', configured: true },
      yearly: { amount: 96000, currency: 'usd', formatted: '$960', suffix: '/yr', intervalLabel: 'Yearly', configured: true },
    },
  },
];

function normalizeBillingCycle(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['year', 'yearly', 'annual', 'annually'].includes(normalized)) return 'yearly';
  return 'monthly';
}

function getFallbackPlan(key) {
  return FALLBACK_PLAN_CARDS.find((plan) => plan.key === key) || null;
}

function formatCurrencyMajorAmount(value, currency = 'usd') {
  const safeValue = Math.max(0, Number(value) || 0);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency || 'usd').trim().toUpperCase() || 'USD',
      minimumFractionDigits: Number.isInteger(safeValue) ? 0 : 2,
      maximumFractionDigits: Number.isInteger(safeValue) ? 0 : 2,
    }).format(safeValue);
  } catch {
    return `$${safeValue.toLocaleString('en-US', {
      minimumFractionDigits: Number.isInteger(safeValue) ? 0 : 2,
      maximumFractionDigits: Number.isInteger(safeValue) ? 0 : 2,
    })}`;
  }
}

function formatBillingCount(value) {
  return Math.max(0, Math.floor(Number(value || 0))).toLocaleString('en-US');
}

function getPriceMajorAmount(price) {
  const amount = price?.amount ?? price?.unitAmount;
  if (Number.isFinite(Number(amount))) return Number(amount) / 100;
  const formatted = String(price?.formatted || '').replace(/[^0-9.]/g, '');
  const parsed = Number(formatted);
  return Number.isFinite(parsed) ? parsed : null;
}

function getYearlyMonthlyEquivalentPrice(price) {
  const yearlyMajorAmount = getPriceMajorAmount(price);
  if (yearlyMajorAmount === null) return price;
  return {
    ...price,
    formatted: formatCurrencyMajorAmount(yearlyMajorAmount / 12, price?.currency),
    suffix: '/mo',
  };
}

function getAnnualTotalPrice(price, cycle) {
  const majorAmount = getPriceMajorAmount(price);
  if (majorAmount === null) return price;
  const annualMajorAmount = normalizeBillingCycle(cycle) === 'yearly' ? majorAmount : majorAmount * 12;
  return {
    ...price,
    formatted: formatCurrencyMajorAmount(annualMajorAmount, price?.currency),
    suffix: '/year',
  };
}

function normalizePlanEntry(entry, billingCycle) {
  const fallback = getFallbackPlan(entry?.key) || {};
  const cycle = normalizeBillingCycle(billingCycle);
  const selectedPrice = entry?.prices?.[cycle] || fallback.prices?.[cycle] || fallback.prices?.monthly || {};
  const price = cycle === 'yearly' ? getAnnualTotalPrice(selectedPrice, cycle) : selectedPrice;
  const comparisonPrice = cycle === 'yearly'
    ? getYearlyMonthlyEquivalentPrice(selectedPrice)
    : getAnnualTotalPrice(selectedPrice, cycle);
  const features = Array.isArray(entry?.featureHighlights) && entry.featureHighlights.length
    ? entry.featureHighlights
    : (fallback.features || []);

  return {
    key: entry?.key || fallback.key,
    name: entry?.name || fallback.name,
    title: entry?.name || fallback.name,
    paid: Boolean(entry?.paid ?? fallback.paid),
    accent: entry?.accent || fallback.accent || 'brand',
    description: entry?.description || fallback.description || '',
    note: entry?.appNote || entry?.description || fallback.appNote || fallback.description || '',
    details: features,
    features,
    cta: entry?.marketingCta || fallback.marketingCta || 'Subscribe',
    action: entry?.marketingAction || fallback.marketingAction || 'checkout',
    price: price.formatted || fallback.prices?.monthly?.formatted || '$0',
    priceSuffix: price.suffix || (cycle === 'yearly' ? '/yr' : '/mo'),
    priceIntervalLabel: price.intervalLabel || (cycle === 'yearly' ? 'Yearly' : 'Monthly'),
    priceComparison: comparisonPrice.formatted ? {
      price: comparisonPrice.formatted,
      suffix: comparisonPrice.suffix || (cycle === 'yearly' ? '/mo' : '/year'),
      billingCycle: cycle,
    } : null,
    prices: entry?.prices || fallback.prices || {},
    catalogEntry: entry || null,
  };
}

export function buildPlanCardsFromBillingCatalog(catalog, {
  billingCycle = 'monthly',
  includeFree = true,
  paidOnly = false,
} = {}) {
  const catalogPlansByKey = new Map((catalog?.plans || []).map((entry) => [entry.key, entry]));
  return PLAN_ORDER
    .filter((key) => {
      if (!includeFree && key === 'free') return false;
      if (paidOnly && key === 'free') return false;
      return true;
    })
    .map((key) => normalizePlanEntry(catalogPlansByKey.get(key) || getFallbackPlan(key), billingCycle))
    .filter((entry) => entry.key);
}

export function hasYearlyBillingPrices(catalog) {
  if (!catalog?.plans?.length) return true;
  return catalog.plans.some((plan) => plan?.key !== 'free' && !!plan?.prices?.yearly);
}

export function buildScreenshotCreditPackCards(catalog) {
  return (catalog?.addOns || [])
    .filter((entry) => entry?.meter === SCREENSHOT_CREDITS_METER)
    .map((entry) => {
      const quantity = Math.max(0, Math.floor(Number(entry.quantity || 0)));
      return {
        ...entry,
        quantity,
        label: `${formatBillingCount(quantity)} credits*`,
        priceLabel: entry.formatted || entry.price || (entry.configured ? 'Stripe checkout' : ''),
      };
    })
    .sort((left, right) => (left.quantity - right.quantity) || String(left.key).localeCompare(String(right.key)));
}

export function buildPageCreditPackCards(catalog) {
  return (catalog?.addOns || [])
    .filter((entry) => PAGE_CREDITS_METERS.has(entry?.meter))
    .map((entry) => {
      const quantity = Math.max(0, Math.floor(Number(entry.quantity || 0)));
      return {
        ...entry,
        quantity,
        label: entry.name || `${formatBillingCount(quantity)} pages`,
        priceLabel: entry.formatted || entry.price || (entry.configured ? 'Stripe checkout' : ''),
      };
    })
    .sort((left, right) => (left.quantity - right.quantity) || String(left.key).localeCompare(String(right.key)));
}

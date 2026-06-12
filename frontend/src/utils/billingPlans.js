export const BILLING_CYCLE_OPTIONS = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

export const PAID_BILLING_PLAN_KEYS = ['pro', 'studio', 'agency'];

const PLAN_ORDER = ['free', 'pro', 'studio', 'agency'];

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
    features: ['1 active project', '100 crawl pages', '25 pages per run', 'No screenshot credits', 'No organized exports', '1 editor'],
    prices: {
      monthly: { formatted: '$0', suffix: '/mo', intervalLabel: 'Monthly', configured: true },
      yearly: { formatted: '$0', suffix: '/yr', intervalLabel: 'Yearly', configured: true },
    },
  },
  {
    key: 'pro',
    name: 'Pro',
    paid: true,
    accent: 'blue',
    description: 'For solo audits with screenshots and saved work.',
    appNote: 'For solo audits with screenshots and saved work.',
    marketingCta: 'Start trial',
    marketingAction: 'trial',
    features: ['5 active projects', '1,000 crawl pages', '100 screenshot credits', '2 organized exports', '1 editor'],
    prices: {
      monthly: { formatted: '$8', suffix: '/mo', intervalLabel: 'Monthly', configured: true },
      yearly: { formatted: '$72', suffix: '/yr', intervalLabel: 'Yearly', configured: true },
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
    features: ['50 active projects', '50,000 crawl pages', '3,000 screenshot credits', 'Unlimited organized exports', '5 seats'],
    prices: {
      monthly: { formatted: '$18', suffix: '/mo', intervalLabel: 'Monthly', configured: true },
      yearly: { formatted: '$144', suffix: '/yr', intervalLabel: 'Yearly', configured: true },
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
    features: ['Unlimited projects', '200,000 crawl pages', '10,000 screenshot credits', 'Unlimited organized exports', '15 seats'],
    prices: {
      monthly: { formatted: '$88', suffix: '/mo', intervalLabel: 'Monthly', configured: true },
      yearly: { formatted: '$960', suffix: '/yr', intervalLabel: 'Yearly', configured: true },
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

function normalizePlanEntry(entry, billingCycle) {
  const fallback = getFallbackPlan(entry?.key) || {};
  const cycle = normalizeBillingCycle(billingCycle);
  const price = entry?.prices?.[cycle] || fallback.prices?.[cycle] || fallback.prices?.monthly || {};
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

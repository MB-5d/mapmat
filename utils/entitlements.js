const fs = require('fs');
const path = require('path');
const billingStore = require('../stores/billingStore');

const PLAN_CONFIG_PATH = path.join(__dirname, '..', 'config', 'billing', 'plans.json');
const INTERNAL_TEST_ACCOUNT_EMAILS_ENV = 'VELLIC_INTERNAL_TEST_ACCOUNT_EMAILS';
const STAGING_INTERNAL_TESTING_ENV = 'VELLIC_STAGING_INTERNAL_TESTING';
const TEST_ACCOUNT_EMAIL_SUFFIX_ENV = 'TEST_AUTH_FIXED_CODE_EMAIL_SUFFIX';
const DEFAULT_TEST_ACCOUNT_EMAIL_SUFFIX = '@test.vellic.local';
const TIER_TEST_ACCOUNT_LOCAL_PARTS = new Set(['free', 'solo', 'pro', 'studio', 'agency']);

const METERS = Object.freeze({
  crawlPages: 'crawl_pages',
  screenshotCredits: 'screenshot_credits',
  organizedExports: 'organized_exports',
  activeProjects: 'active_projects',
  seats: 'seats',
});

const ACTIONS = Object.freeze({
  projectCreate: 'project.create',
  mapWrite: 'map.write',
  scanStart: 'scan.start',
  screenshotCapture: 'screenshot.capture',
  organizedExportCreate: 'organized_export.create',
  shareCreate: 'share.create',
  seatInvite: 'seat.invite',
  scheduledRescanCreate: 'scheduled_rescan.create',
});

const ARCHIVE_BLOCKED_ACTIONS = new Set(Object.values(ACTIONS));

function loadPlanConfig() {
  try {
    return JSON.parse(fs.readFileSync(PLAN_CONFIG_PATH, 'utf8'));
  } catch (error) {
    console.error('Load billing plan config error:', error);
    return {
      fallbackPlan: 'free',
      trialDefaults: {
        fallbackPlan: 'free',
        basePlan: 'solo',
        personalDays: 7,
        teamDays: 7,
        teamSeatCap: 4,
        screenshotCredits: 15,
        organizedScreenshotExports: 15,
      },
      plans: {
        free: {
          key: 'free',
          name: 'Free',
          paid: false,
          limits: {
            activeProjects: 1,
            crawlPages: 100,
            scanPagesPerRun: 25,
            screenshotCredits: 0,
            organizedScreenshotExports: 0,
            seats: 1,
          },
          features: {},
        },
      },
    };
  }
}

function getBillingPlanConfig() {
  return loadPlanConfig();
}

function getPlan(config, planKey) {
  const fallback = config.fallbackPlan || 'free';
  return config.plans?.[planKey] || config.plans?.[fallback] || config.plans?.free;
}

function getInternalTestingEmailSet() {
  return new Set(
    String(process.env[INTERNAL_TEST_ACCOUNT_EMAILS_ENV] || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function getTestAccountEmailSuffix() {
  const suffix = String(process.env[TEST_ACCOUNT_EMAIL_SUFFIX_ENV] || DEFAULT_TEST_ACCOUNT_EMAIL_SUFFIX)
    .trim()
    .toLowerCase();
  if (!suffix) return '';
  return suffix.startsWith('@') ? suffix : `@${suffix}`;
}

function isTierTestAccountEmail(email) {
  const suffix = getTestAccountEmailSuffix();
  if (!email || !suffix || suffix === '@') return false;
  if (!email.endsWith(suffix)) return false;
  const localPart = email.slice(0, -suffix.length);
  return TIER_TEST_ACCOUNT_LOCAL_PARTS.has(localPart);
}

function isAutoInternalTestingEmail(email) {
  const suffix = getTestAccountEmailSuffix();
  if (!email || !suffix || suffix === '@') return false;
  if (!email.endsWith(suffix)) return false;
  const localPart = email.slice(0, -suffix.length);
  return !!localPart && !isTierTestAccountEmail(email);
}

function parseEnvBoolean(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function isStagingRuntime() {
  const explicit = parseEnvBoolean(process.env[STAGING_INTERNAL_TESTING_ENV], null);
  if (explicit !== null) return explicit;
  const runtimeValues = [
    process.env.APP_BASE_URL,
    process.env.FRONTEND_URL,
    process.env.GOOGLE_REDIRECT_URI,
    process.env.RAILWAY_ENVIRONMENT_NAME,
    process.env.RAILWAY_SERVICE_NAME,
  ];
  return runtimeValues.some((value) => String(value || '').toLowerCase().includes('staging'));
}

function isStagingInternalTestingEmail(email) {
  return !!email && isStagingRuntime() && !isTierTestAccountEmail(email);
}

function isInternalTestingAccount(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  return !!email && (
    getInternalTestingEmailSet().has(email)
    || isAutoInternalTestingEmail(email)
    || isStagingInternalTestingEmail(email)
  );
}

async function getEntitlementUserAsync(user) {
  if (!user?.id || user.email) return user;
  try {
    const authStore = require('../stores/authStore');
    const storedUser = await authStore.getUserByIdAsync(user.id);
    return storedUser ? { ...storedUser, ...user, email: storedUser.email } : user;
  } catch {
    return user;
  }
}

function normalizeLimit(value) {
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

function isUnlimited(value) {
  return value === null;
}

function isTrialActive(account) {
  if (String(account?.trial_state || '').toLowerCase() !== 'active') return false;
  if (!account?.trial_ends_at) return true;
  const end = new Date(account.trial_ends_at);
  return Number.isFinite(end.getTime()) && end > new Date();
}

function isArchived(account) {
  const state = String(account?.account_state || 'active').trim().toLowerCase();
  return state === 'archived' || state === 'free_limited';
}

function calculatePaidGrace(plan, included) {
  if (!plan?.paid || !Number.isFinite(Number(included)) || Number(included) <= 0) return 0;
  return Math.max(Math.ceil(Number(included) * 0.05), 25);
}

async function buildMeterSummary({ account, meter, included, grace = 0 }) {
  const periodStart = account.current_period_started_at;
  const periodEnd = account.current_period_ends_at;
  const [
    used,
    includedUsed,
    addonUsed,
    graceUsed,
    grantRemaining,
  ] = await Promise.all([
    billingStore.sumLedgerUsageForPeriodAsync({
      accountId: account.id,
      meter,
      periodStart,
      periodEnd,
    }),
    billingStore.sumLedgerUsageForPeriodBySourceAsync({
      accountId: account.id,
      meter,
      source: 'included',
      periodStart,
      periodEnd,
    }),
    billingStore.sumLedgerUsageForPeriodBySourceAsync({
      accountId: account.id,
      meter,
      source: 'addon',
      periodStart,
      periodEnd,
    }),
    billingStore.sumLedgerUsageForPeriodBySourceAsync({
      accountId: account.id,
      meter,
      source: 'grace',
      periodStart,
      periodEnd,
    }),
    billingStore.sumActiveMeterGrantsAsync({
      accountId: account.id,
      meter,
    }),
  ]);

  if (isUnlimited(included)) {
    return {
      meter,
      included: null,
      used,
      includedUsed,
      addonUsed,
      grantRemaining,
      graceLimit: 0,
      graceUsed: 0,
      includedRemaining: null,
      graceRemaining: 0,
      remaining: null,
      unlimited: true,
    };
  }

  const safeIncluded = normalizeLimit(included);
  const fallbackIncludedUsed = Math.min(used, safeIncluded);
  const effectiveIncludedUsed = Math.max(Number(includedUsed || 0), fallbackIncludedUsed);
  const includedRemaining = Math.max(0, safeIncluded - effectiveIncludedUsed);
  const graceRemaining = Math.max(0, normalizeLimit(grace) - Number(graceUsed || 0));

  return {
    meter,
    included: safeIncluded,
    used,
    includedUsed: effectiveIncludedUsed,
    addonUsed,
    grantRemaining,
    graceLimit: normalizeLimit(grace),
    graceUsed,
    includedRemaining,
    graceRemaining,
    remaining: includedRemaining + grantRemaining + graceRemaining,
    unlimited: false,
  };
}

async function buildCountLimitSummary({ account, meter, baseLimit, currentCount }) {
  const grantExtra = await billingStore.sumActiveMeterGrantsAsync({
    accountId: account.id,
    meter,
  });
  if (isUnlimited(baseLimit)) {
    return {
      limit: null,
      used: currentCount,
      grantExtra,
      remaining: null,
      unlimited: true,
    };
  }
  const limit = normalizeLimit(baseLimit) + grantExtra;
  return {
    limit,
    used: currentCount,
    grantExtra,
    remaining: Math.max(0, limit - currentCount),
    unlimited: false,
  };
}

async function resolveAccountEntitlementsAsync(user) {
  if (!user?.id) return null;
  const entitlementUser = await getEntitlementUserAsync(user);
  const config = loadPlanConfig();
  const account = await billingStore.getOrCreateBillingAccountForUserAsync(entitlementUser);
  if (!account) return null;

  const plan = getPlan(config, account.plan_key);
  const trialActive = isTrialActive(account);
  const trialBasePlan = trialActive
    ? getPlan(config, config.trialDefaults?.basePlan || plan.key)
    : null;
  const entitlementPlan = trialBasePlan || plan;
  const featureGrants = await billingStore.listActiveFeatureGrantKeysAsync({ accountId: account.id });
  const features = {
    ...(plan.features || {}),
    ...(trialBasePlan?.features || {}),
  };
  featureGrants.forEach((featureKey) => {
    features[featureKey] = true;
  });

  const [activeProjectCount, seatCount] = await Promise.all([
    billingStore.countActiveProjectsForAccountAsync(account.id, account.owner_user_id),
    billingStore.countBillableSeatsForAccountAsync(account.id),
  ]);

  const trialKind = String(account.trial_kind || 'personal').trim().toLowerCase() === 'team'
    ? 'team'
    : 'personal';
  const seatBaseLimit = trialActive && trialKind === 'team'
    ? Math.max(
      normalizeLimit(entitlementPlan.limits?.seats ?? 1),
      normalizeLimit(config.trialDefaults?.teamSeatCap ?? 4)
    )
    : entitlementPlan.limits?.seats;
  const organizedExportLimit = trialActive
    ? normalizeLimit(config.trialDefaults?.organizedScreenshotExports ?? 0)
    : entitlementPlan.limits?.organizedScreenshotExports;
  const screenshotCreditLimit = trialActive
    ? normalizeLimit(config.trialDefaults?.screenshotCredits ?? 15)
    : entitlementPlan.limits?.screenshotCredits;

  const [crawlPages, screenshotCredits, organizedExports, activeProjects, seats] = await Promise.all([
    buildMeterSummary({
      account,
      meter: METERS.crawlPages,
      included: entitlementPlan.limits?.crawlPages,
      grace: trialActive ? 0 : calculatePaidGrace(entitlementPlan, entitlementPlan.limits?.crawlPages),
    }),
    buildMeterSummary({
      account,
      meter: METERS.screenshotCredits,
      included: screenshotCreditLimit,
    }),
    buildMeterSummary({
      account,
      meter: METERS.organizedExports,
      included: organizedExportLimit,
    }),
    buildCountLimitSummary({
      account,
      meter: METERS.activeProjects,
      baseLimit: entitlementPlan.limits?.activeProjects,
      currentCount: activeProjectCount,
    }),
    buildCountLimitSummary({
      account,
      meter: METERS.seats,
      baseLimit: seatBaseLimit,
      currentCount: seatCount,
    }),
  ]);

  const summary = {
    account: {
      id: account.id,
      ownerUserId: account.owner_user_id,
      planKey: plan.key || account.plan_key || 'free',
      state: account.account_state || 'active',
      trialState: account.trial_state || 'none',
      currentPeriodStartedAt: account.current_period_started_at,
      currentPeriodEndsAt: account.current_period_ends_at,
      cancelAtPeriodEnd: Boolean(Number(account.cancel_at_period_end || 0)),
      cancelledAt: account.cancelled_at || null,
      archiveStartedAt: account.archive_started_at || null,
      downloadAccessEndsAt: account.download_access_ends_at || null,
      assetRetentionEndsAt: account.asset_retention_ends_at || null,
      lightweightRetentionEndsAt: account.lightweight_retention_ends_at || null,
      stripeCustomerId: account.stripe_customer_id || null,
      stripeSubscriptionId: account.stripe_subscription_id || null,
      stripeSubscriptionStatus: account.stripe_subscription_status || null,
      stripePriceId: account.stripe_price_id || null,
      stripeProductId: account.stripe_product_id || null,
      stripeLatestInvoiceId: account.stripe_latest_invoice_id || null,
      stripeCancelAt: account.stripe_cancel_at || null,
    },
    plan: {
      key: plan.key || account.plan_key || 'free',
      name: plan.name || 'Free',
      paid: Boolean(plan.paid),
    },
    trial: {
      active: trialActive,
      state: account.trial_state || 'none',
      startedAt: account.trial_started_at || null,
      endsAt: account.trial_ends_at || null,
      kind: trialKind,
      effectivePlanKey: trialBasePlan?.key || null,
      teamSeatCap: normalizeLimit(config.trialDefaults?.teamSeatCap ?? 4),
      organizedDownloadsAllowed: organizedExportLimit !== 0,
    },
    features,
    meters: {
      crawlPages,
      screenshotCredits,
      organizedExports,
    },
    limits: {
      activeProjects,
      seats,
      scanPagesPerRun: isUnlimited(entitlementPlan.limits?.scanPagesPerRun)
        ? { limit: null, remaining: null, unlimited: true }
        : {
          limit: normalizeLimit(entitlementPlan.limits?.scanPagesPerRun),
          remaining: normalizeLimit(entitlementPlan.limits?.scanPagesPerRun),
          unlimited: !entitlementPlan.limits?.scanPagesPerRun,
        },
    },
    retention: config.retentionDefaults || {},
    screenshotCreditCosts: config.screenshotCreditCosts || {},
    archived: isArchived(account),
    internalTesting: false,
  };

  if (!isInternalTestingAccount(entitlementUser)) return summary;

  Object.keys(config.plans || {}).forEach((planKey) => {
    const planFeatures = config.plans?.[planKey]?.features || {};
    Object.keys(planFeatures).forEach((featureKey) => {
      summary.features[featureKey] = true;
    });
  });

  Object.keys(summary.meters || {}).forEach((key) => {
    summary.meters[key] = {
      ...summary.meters[key],
      included: null,
      graceLimit: 0,
      includedRemaining: null,
      graceRemaining: 0,
      remaining: null,
      unlimited: true,
    };
  });

  Object.keys(summary.limits || {}).forEach((key) => {
    summary.limits[key] = {
      ...summary.limits[key],
      limit: null,
      remaining: null,
      unlimited: true,
    };
  });

  return {
    ...summary,
    internalTesting: true,
  };
}

function entitlementErrorPayload(result) {
  return {
    error: result.message || 'Your plan does not allow this action.',
    code: result.code || 'ENTITLEMENT_REQUIRED',
    action: result.action,
    entitlement: result.entitlement || null,
    allowedQuantity: result.allowedQuantity ?? null,
    entitlements: result.summary || null,
  };
}

function sendEntitlementError(res, result) {
  return res.status(result.status || 402).json(entitlementErrorPayload(result));
}

function buildAllowed(action, summary, extra = {}) {
  return {
    allowed: true,
    status: 200,
    action,
    summary,
    ...extra,
  };
}

function buildDenied(action, summary, message, extra = {}) {
  return {
    allowed: false,
    status: extra.status || 402,
    code: extra.code || 'ENTITLEMENT_REQUIRED',
    action,
    summary,
    message,
    entitlement: extra.entitlement || null,
    ...extra,
  };
}

async function checkAccountActionAsync(user, action, options = {}) {
  const summary = await resolveAccountEntitlementsAsync(user);
  if (!summary) {
    return buildDenied(action, null, 'Sign in is required to continue.', {
      status: 401,
      code: 'AUTH_REQUIRED',
    });
  }

  if (summary.archived && ARCHIVE_BLOCKED_ACTIONS.has(action)) {
    return buildDenied(action, summary, 'This account is archived. Upgrade or reactivate to create new work.', {
      status: 403,
      code: 'ACCOUNT_ARCHIVED',
      entitlement: { accountState: summary.account.state },
    });
  }

  if (action === ACTIONS.projectCreate) {
    const limit = summary.limits.activeProjects;
    if (!limit.unlimited && limit.remaining <= 0) {
      return buildDenied(action, summary, 'Your plan has reached its active project limit.', {
        entitlement: limit,
      });
    }
    return buildAllowed(action, summary);
  }

  if (action === ACTIONS.scanStart) {
    const requestedPages = Math.max(1, Math.floor(Number(options.requestedPages || 1)));
    const meter = summary.meters.crawlPages;
    if (!meter.unlimited && meter.remaining <= 0) {
      return buildDenied(action, summary, 'Your plan has no crawl pages remaining for this billing period.', {
        entitlement: meter,
      });
    }
    const perScanLimit = summary.limits?.scanPagesPerRun;
    const allowedByMeter = meter.unlimited ? requestedPages : Math.min(requestedPages, meter.remaining);
    const allowedQuantity = perScanLimit?.unlimited
      ? allowedByMeter
      : Math.min(allowedByMeter, Math.max(1, normalizeLimit(perScanLimit?.limit || allowedByMeter)));
    return buildAllowed(action, summary, {
      allowedQuantity,
      capped: allowedQuantity < requestedPages,
      requestedQuantity: requestedPages,
      entitlement: meter,
    });
  }

  if (action === ACTIONS.screenshotCapture) {
    const requestedCredits = Math.max(1, Math.floor(Number(options.credits || 1)));
    const meter = summary.meters.screenshotCredits;
    if (!meter.unlimited && meter.remaining < requestedCredits) {
      return buildDenied(action, summary, 'Your plan does not have enough screenshot credits remaining.', {
        entitlement: meter,
      });
    }
    return buildAllowed(action, summary, {
      allowedQuantity: requestedCredits,
      entitlement: meter,
    });
  }

  if (action === ACTIONS.organizedExportCreate) {
    const meter = summary.meters.organizedExports;
    if (!meter.unlimited && meter.remaining <= 0) {
      const message = summary.trial?.active
        ? 'This trial has no screenshot downloads remaining.'
        : 'Your plan has reached its screenshot download limit.';
      return buildDenied(action, summary, message, {
        entitlement: meter,
      });
    }
    return buildAllowed(action, summary, {
      allowedQuantity: 1,
      entitlement: meter,
    });
  }

  if (action === ACTIONS.shareCreate) {
    if (!summary.features.clientShareLinks) {
      return buildDenied(action, summary, 'Client share links are not available on this plan.', {
        entitlement: { feature: 'clientShareLinks' },
      });
    }
    return buildAllowed(action, summary);
  }

  if (action === ACTIONS.seatInvite) {
    const limit = summary.limits.seats;
    if (!limit.unlimited && limit.remaining <= 0) {
      return buildDenied(action, summary, 'Your account has reached its seat limit.', {
        entitlement: limit,
      });
    }
    return buildAllowed(action, summary);
  }

  if (action === ACTIONS.scheduledRescanCreate) {
    if (!summary.features.scheduledRescans) {
      return buildDenied(action, summary, 'Scheduled rescans are not available on this plan.', {
        entitlement: { feature: 'scheduledRescans' },
      });
    }
    return buildAllowed(action, summary);
  }

  return buildAllowed(action, summary);
}

async function requireAccountActionAsync(req, res, action, options = {}) {
  const result = await checkAccountActionAsync(req.user, action, options);
  if (!result.allowed) {
    sendEntitlementError(res, result);
    return null;
  }
  return result;
}

async function recordMeterDebitAsync({
  user,
  accountSummary = null,
  meter,
  quantity,
  idempotencyKey,
  metadata = null,
}) {
  const summary = accountSummary || await resolveAccountEntitlementsAsync(user);
  if (!summary?.account?.id) return [];
  const safeQuantity = Math.max(0, Math.floor(Number(quantity || 0)));
  if (safeQuantity <= 0) return [];

  const meterSummary = Object.values(summary.meters || {}).find((entry) => entry.meter === meter);
  if (!meterSummary) return [];
  if (!meterSummary.unlimited && meterSummary.remaining < safeQuantity) {
    const error = new Error('Not enough remaining entitlement for this usage.');
    error.status = 402;
    error.code = 'ENTITLEMENT_REQUIRED';
    throw error;
  }

  let remaining = safeQuantity;
  const allocations = [];
  if (meterSummary.unlimited) {
    allocations.push({ source: 'included', quantity: remaining });
    remaining = 0;
  } else {
    const includedQuantity = Math.min(remaining, meterSummary.includedRemaining || 0);
    if (includedQuantity > 0) {
      allocations.push({ source: 'included', quantity: includedQuantity });
      remaining -= includedQuantity;
    }

    const addonQuantity = Math.min(remaining, meterSummary.grantRemaining || 0);
    if (addonQuantity > 0) {
      allocations.push({ source: 'addon', quantity: addonQuantity });
      remaining -= addonQuantity;
    }

    const graceQuantity = Math.min(remaining, meterSummary.graceRemaining || 0);
    if (graceQuantity > 0) {
      allocations.push({ source: 'grace', quantity: graceQuantity });
      remaining -= graceQuantity;
    }
  }

  if (remaining > 0) {
    const error = new Error('Not enough remaining entitlement for this usage.');
    error.status = 402;
    error.code = 'ENTITLEMENT_REQUIRED';
    throw error;
  }

  const results = [];
  for (const allocation of allocations) {
    const result = await billingStore.insertLedgerEntryAsync({
      accountId: summary.account.id,
      userId: user?.id || null,
      meter,
      entryType: 'debit',
      quantity: allocation.quantity,
      source: allocation.source,
      idempotencyKey: idempotencyKey ? `${idempotencyKey}:${allocation.source}` : null,
      metadata: {
        ...(metadata || {}),
        allocationSource: allocation.source,
      },
      periodStart: summary.account.currentPeriodStartedAt,
      periodEnd: summary.account.currentPeriodEndsAt,
    });
    if (allocation.source === 'addon' && !result.deduped) {
      await billingStore.consumeMeterGrantQuantityAsync({
        accountId: summary.account.id,
        meter,
        quantity: allocation.quantity,
      });
    }
    results.push(result);
  }
  return results;
}

function getScreenshotCreditCost({ type = 'thumb', viewport = 'desktop', pair = false } = {}) {
  const config = loadPlanConfig();
  const costs = config.screenshotCreditCosts || {};
  const normalizedType = String(type || '').trim().toLowerCase();
  const normalizedViewport = String(viewport || 'desktop').trim().toLowerCase();
  if (pair && normalizedType === 'full') return normalizeLimit(costs.desktop_mobile_full_page_pair ?? 5);
  if (pair) return normalizeLimit(costs.desktop_mobile_viewport_pair ?? 2);
  if (normalizedType === 'full' && normalizedViewport === 'mobile') {
    return normalizeLimit(costs.mobile_full_page ?? 2);
  }
  if (normalizedType === 'full') return normalizeLimit(costs.desktop_full_page ?? 3);
  if (normalizedViewport === 'mobile') return normalizeLimit(costs.mobile_viewport ?? 1);
  return normalizeLimit(costs.desktop_viewport ?? 1);
}

module.exports = {
  ACTIONS,
  METERS,
  getBillingPlanConfig,
  resolveAccountEntitlementsAsync,
  checkAccountActionAsync,
  requireAccountActionAsync,
  sendEntitlementError,
  recordMeterDebitAsync,
  getScreenshotCreditCost,
};

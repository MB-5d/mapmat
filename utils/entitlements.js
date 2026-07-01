const fs = require('fs');
const path = require('path');
const billingStore = require('../stores/billingStore');
const mapStore = require('../stores/mapStore');

const PLAN_CONFIG_PATH = path.join(__dirname, '..', 'config', 'billing', 'plans.json');

const METERS = Object.freeze({
  activePages: 'active_pages',
  crawlPages: 'crawl_pages',
  activeMaps: 'active_maps',
  screenshotCredits: 'screenshot_credits',
  organizedExports: 'organized_exports',
  downloads: 'organized_exports',
  activeProjects: 'active_projects',
  seats: 'seats',
  editors: 'editors',
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
const FREE_LIMITED_DOWNLOAD_EVENT_TYPES = new Set(['export_xml', 'export_site_index']);
const UNMETERED_DOWNLOAD_EVENT_TYPES = new Set(['export_xml', 'export_site_index', 'export_report_pdf']);

function loadPlanConfig() {
  try {
    return JSON.parse(fs.readFileSync(PLAN_CONFIG_PATH, 'utf8'));
  } catch (error) {
    console.error('Load billing plan config error:', error);
    return {
      fallbackPlan: 'free',
      trialDefaults: {
        fallbackPlan: 'free',
        basePlan: 'pro',
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
            activePages: 1000,
            scanPagesPerRun: 100,
            screenshotCredits: 25,
            downloads: 5,
            editors: 1,
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

function getCanonicalBillingPlanKey(config, planKey) {
  const rawKey = String(planKey || '').trim().toLowerCase();
  if (!rawKey) return config.fallbackPlan || 'free';
  const aliasKey = config.planAliases?.[rawKey];
  return aliasKey || rawKey;
}

function getPlan(config, planKey) {
  const fallback = config.fallbackPlan || 'free';
  const canonicalPlanKey = getCanonicalBillingPlanKey(config, planKey);
  return config.plans?.[canonicalPlanKey] || config.plans?.[fallback] || config.plans?.free;
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

function getLimitValue(limits, primaryKey, fallbackKey = null) {
  if (!limits) return undefined;
  if (Object.prototype.hasOwnProperty.call(limits, primaryKey)) return limits[primaryKey];
  if (fallbackKey && Object.prototype.hasOwnProperty.call(limits, fallbackKey)) return limits[fallbackKey];
  return undefined;
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

async function buildCountLimitSummary({
  account,
  meter,
  baseLimit,
  currentCount,
  grantMeters = [meter],
}) {
  const grantTotals = await Promise.all((grantMeters || [meter]).map((grantMeter) => (
    billingStore.sumActiveMeterGrantsAsync({
      accountId: account.id,
      meter: grantMeter,
    })
  )));
  const grantExtra = grantTotals.reduce((total, value) => total + Number(value || 0), 0);
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
  const config = loadPlanConfig();
  const account = await billingStore.getOrCreateBillingAccountForUserAsync(user);
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

  const [activeProjectCount, activePageCount, activeMapCount, editorCount, membership] = await Promise.all([
    billingStore.countActiveProjectsForAccountAsync(account.id, account.owner_user_id),
    mapStore.sumActivePagesForAccountAsync(account.id, account.owner_user_id),
    mapStore.countActiveMapsForAccountAsync(account.id, account.owner_user_id),
    billingStore.countBillableEditorsForAccountAsync(account.id),
    billingStore.getAccountMembershipForUserAsync(account.id, user.id),
  ]);

  const trialKind = String(account.trial_kind || 'personal').trim().toLowerCase() === 'team'
    ? 'team'
    : 'personal';
  const editorBaseLimit = trialActive && trialKind === 'team'
    ? Math.max(
      normalizeLimit(getLimitValue(entitlementPlan.limits, 'editors', 'seats') ?? 1),
      normalizeLimit(config.trialDefaults?.teamSeatCap ?? 4)
    )
    : getLimitValue(entitlementPlan.limits, 'editors', 'seats');
  const downloadLimit = trialActive
    ? normalizeLimit(config.trialDefaults?.organizedScreenshotExports ?? 0)
    : getLimitValue(entitlementPlan.limits, 'downloads', 'organizedScreenshotExports');
  const screenshotCreditLimit = trialActive
    ? normalizeLimit(config.trialDefaults?.screenshotCredits ?? 15)
    : getLimitValue(entitlementPlan.limits, 'screenshotCredits');

  const [activePages, activeMaps, screenshotCredits, downloads, activeProjects, editors] = await Promise.all([
    buildCountLimitSummary({
      account,
      meter: METERS.activePages,
      baseLimit: getLimitValue(entitlementPlan.limits, 'activePages', 'crawlPages'),
      currentCount: activePageCount,
      grantMeters: [METERS.activePages, METERS.crawlPages],
    }),
    buildCountLimitSummary({
      account,
      meter: METERS.activeMaps,
      baseLimit: getLimitValue(entitlementPlan.limits, 'activeMaps') ?? null,
      currentCount: activeMapCount,
    }),
    buildMeterSummary({
      account,
      meter: METERS.screenshotCredits,
      included: screenshotCreditLimit,
    }),
    buildMeterSummary({
      account,
      meter: METERS.downloads,
      included: downloadLimit,
    }),
    buildCountLimitSummary({
      account,
      meter: METERS.activeProjects,
      baseLimit: getLimitValue(entitlementPlan.limits, 'activeProjects'),
      currentCount: activeProjectCount,
    }),
    buildCountLimitSummary({
      account,
      meter: METERS.editors,
      baseLimit: editorBaseLimit,
      currentCount: editorCount,
      grantMeters: [METERS.editors, METERS.seats],
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
      membershipRole: membership?.role || (account.owner_user_id === user.id ? 'owner' : null),
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
      organizedDownloadsAllowed: downloadLimit !== 0,
    },
    features,
    meters: {
      activePages,
      crawlPages: activePages,
      activeMaps,
      screenshotCredits,
      downloads,
      organizedExports: downloads,
    },
    limits: {
      activeProjects,
      activeMaps,
      activePages,
      editors,
      seats: editors,
      scanPagesPerRun: isUnlimited(getLimitValue(entitlementPlan.limits, 'scanPagesPerRun'))
        ? { limit: null, remaining: null, unlimited: true }
        : {
          limit: normalizeLimit(getLimitValue(entitlementPlan.limits, 'scanPagesPerRun')),
          remaining: normalizeLimit(getLimitValue(entitlementPlan.limits, 'scanPagesPerRun')),
          unlimited: !getLimitValue(entitlementPlan.limits, 'scanPagesPerRun'),
        },
    },
    retention: config.retentionDefaults || {},
    screenshotCreditCosts: config.screenshotCreditCosts || {},
    archived: isArchived(account),
  };

  return summary;
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

  if (action === ACTIONS.mapWrite) {
    const requestedPageDelta = Math.max(0, Math.floor(Number(options.pageDelta || 0)));
    const limit = summary.limits.activePages;
    if (requestedPageDelta > 0 && !limit.unlimited && limit.remaining < requestedPageDelta) {
      return buildDenied(action, summary, 'Your account has reached its active page limit.', {
        entitlement: limit,
        requestedQuantity: requestedPageDelta,
        allowedQuantity: Math.max(0, Number(limit.remaining || 0)),
      });
    }
    return buildAllowed(action, summary, {
      allowedQuantity: requestedPageDelta,
      entitlement: limit,
    });
  }

  if (action === ACTIONS.scanStart) {
    const requestedPages = Math.max(1, Math.floor(Number(options.requestedPages || 1)));
    const limit = summary.limits.activePages;
    if (!limit.unlimited && limit.remaining <= 0) {
      return buildDenied(action, summary, 'Your plan has no active pages remaining.', {
        entitlement: limit,
      });
    }
    const perScanLimit = summary.limits?.scanPagesPerRun;
    const allowedByActivePages = limit.unlimited ? requestedPages : Math.min(requestedPages, limit.remaining);
    const allowedQuantity = perScanLimit?.unlimited
      ? allowedByActivePages
      : Math.min(allowedByActivePages, Math.max(1, normalizeLimit(perScanLimit?.limit || allowedByActivePages)));
    return buildAllowed(action, summary, {
      allowedQuantity,
      capped: allowedQuantity < requestedPages,
      requestedQuantity: requestedPages,
      entitlement: limit,
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
    const eventType = String(options.eventType || '').trim();
    if (UNMETERED_DOWNLOAD_EVENT_TYPES.has(eventType)) {
      return buildAllowed(action, summary, {
        allowedQuantity: 1,
        entitlement: summary.meters.downloads || summary.meters.organizedExports || null,
        unmetered: true,
      });
    }
    if (
      eventType
      && summary.features?.standardExports === false
      && !FREE_LIMITED_DOWNLOAD_EVENT_TYPES.has(eventType)
    ) {
      return buildDenied(action, summary, 'This download format requires a paid plan.', {
        code: 'DOWNLOAD_FORMAT_PLAN_REQUIRED',
        entitlement: { feature: 'standardExports', eventType },
      });
    }
    const meter = summary.meters.downloads || summary.meters.organizedExports;
    if (!meter.unlimited && meter.remaining <= 0) {
      const message = summary.trial?.active
        ? 'This trial has no downloads remaining.'
        : 'Your plan has reached its download limit.';
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
    const accessLevel = String(options.accessLevel || 'view').trim().toLowerCase();
    if (!summary.features.clientShareLinks && accessLevel === 'edit') {
      return buildDenied(action, summary, 'Client share links are not available on this plan.', {
        entitlement: { feature: 'clientShareLinks' },
      });
    }
    return buildAllowed(action, summary);
  }

  if (action === ACTIONS.seatInvite) {
    const limit = summary.limits.editors || summary.limits.seats;
    if (!limit.unlimited && limit.remaining <= 0) {
      return buildDenied(action, summary, 'Your account has reached its editor limit.', {
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
  if (normalizedType === 'full') return normalizeLimit(costs.desktop_full_page ?? 1);
  if (normalizedViewport === 'mobile') return normalizeLimit(costs.mobile_viewport ?? 1);
  return normalizeLimit(costs.desktop_viewport ?? 1);
}

module.exports = {
  ACTIONS,
  METERS,
  getBillingPlanConfig,
  getCanonicalBillingPlanKey,
  resolveAccountEntitlementsAsync,
  checkAccountActionAsync,
  requireAccountActionAsync,
  sendEntitlementError,
  recordMeterDebitAsync,
  getScreenshotCreditCost,
};

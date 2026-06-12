const express = require('express');
const billingStore = require('../stores/billingStore');
const { authMiddleware, requireAuth } = require('./auth');
const { getBillingPlanConfig, resolveAccountEntitlementsAsync } = require('../utils/entitlements');
const {
  BillingError,
  getBillingCatalogForClientAsync,
  createPlanCheckoutSessionAsync,
  createAddOnCheckoutSessionAsync,
  createPortalSessionAsync,
  refreshBillingAccountFromStripeAsync,
} = require('../utils/stripeBilling');

const router = express.Router();

function getReturnPath(req) {
  return req.body?.returnPath || req.query?.returnPath || '/app';
}

function handleBillingError(res, error, label) {
  const status = Number.isFinite(error?.status) ? error.status : 500;
  if (status >= 500) {
    console.error(`${label} error:`, error);
  } else {
    console.warn(`${label} rejected:`, error?.message || error);
  }
  return res.status(status).json({
    error: error?.message || 'Billing request failed.',
    code: error?.code || 'BILLING_ERROR',
  });
}

function isActiveStripeSubscriptionStatus(status) {
  return ['active', 'trialing', 'past_due', 'unpaid'].includes(String(status || '').trim().toLowerCase());
}

function isTrialActive(account) {
  if (String(account?.trial_state || '').trim().toLowerCase() !== 'active') return false;
  if (!account?.trial_ends_at) return true;
  const trialEnd = new Date(account.trial_ends_at);
  return Number.isFinite(trialEnd.getTime()) && trialEnd > new Date();
}

function hasUsedTrial(account) {
  return Boolean(account?.trial_started_at || account?.trial_ends_at);
}

function getTrialDays(kind) {
  const defaults = getBillingPlanConfig().trialDefaults || {};
  return kind === 'team'
    ? Number(defaults.teamDays || 7)
    : Number(defaults.personalDays || 7);
}

router.get('/config', async (_req, res) => {
  try {
    return res.json(await getBillingCatalogForClientAsync());
  } catch (error) {
    return handleBillingError(res, error, 'Billing config');
  }
});

router.use(authMiddleware);
router.use(requireAuth);

router.post('/checkout/sessions', async (req, res) => {
  try {
    const type = String(req.body?.type || '').trim().toLowerCase();
    const account = await billingStore.getOrCreateBillingAccountForUserAsync(req.user);
    if (!account) {
      throw new BillingError('Billing account is not available.', 404, 'BILLING_ACCOUNT_NOT_FOUND');
    }

    let session = null;
    if (type === 'plan') {
      session = await createPlanCheckoutSessionAsync({
        user: req.user,
        account,
        planKey: req.body?.planKey,
        billingCycle: req.body?.billingCycle,
        returnPath: getReturnPath(req),
      });
    } else if (type === 'addon') {
      session = await createAddOnCheckoutSessionAsync({
        user: req.user,
        account,
        addonKey: req.body?.addonKey,
        quantity: req.body?.quantity,
        returnPath: getReturnPath(req),
      });
    } else {
      throw new BillingError('Choose a plan or add-on checkout type.', 400, 'INVALID_CHECKOUT_TYPE');
    }

    return res.status(201).json({
      id: session.id,
      url: session.url,
    });
  } catch (error) {
    return handleBillingError(res, error, 'Create billing checkout session');
  }
});

router.post('/portal/sessions', async (req, res) => {
  try {
    const account = await billingStore.getOrCreateBillingAccountForUserAsync(req.user);
    if (!account) {
      throw new BillingError('Billing account is not available.', 404, 'BILLING_ACCOUNT_NOT_FOUND');
    }
    const session = await createPortalSessionAsync({
      user: req.user,
      account,
      returnPath: getReturnPath(req),
    });
    return res.status(201).json({
      id: session.id,
      url: session.url,
    });
  } catch (error) {
    return handleBillingError(res, error, 'Create billing portal session');
  }
});

router.post('/trials', async (req, res) => {
  try {
    const account = await billingStore.getOrCreateBillingAccountForUserAsync(req.user);
    if (!account) {
      throw new BillingError('Billing account is not available.', 404, 'BILLING_ACCOUNT_NOT_FOUND');
    }
    if (account.stripe_subscription_id && isActiveStripeSubscriptionStatus(account.stripe_subscription_status)) {
      throw new BillingError('This account already has an active subscription.', 409, 'BILLING_SUBSCRIPTION_ACTIVE');
    }
    if (isTrialActive(account)) {
      return res.json({
        success: true,
        trialAlreadyActive: true,
        entitlements: await resolveAccountEntitlementsAsync(req.user),
      });
    }
    if (hasUsedTrial(account)) {
      throw new BillingError('This account has already used its trial.', 409, 'BILLING_TRIAL_ALREADY_USED');
    }

    const kind = String(req.body?.kind || 'personal').trim().toLowerCase() === 'team'
      ? 'team'
      : 'personal';
    await billingStore.startTrialAsync({
      accountId: account.id,
      kind,
      days: getTrialDays(kind),
    });
    return res.status(201).json({
      success: true,
      trialAlreadyActive: false,
      entitlements: await resolveAccountEntitlementsAsync(req.user),
    });
  } catch (error) {
    return handleBillingError(res, error, 'Start billing trial');
  }
});

router.post('/account/refresh', async (req, res) => {
  try {
    const account = await billingStore.getOrCreateBillingAccountForUserAsync(req.user);
    if (!account) {
      throw new BillingError('Billing account is not available.', 404, 'BILLING_ACCOUNT_NOT_FOUND');
    }
    const result = await refreshBillingAccountFromStripeAsync({
      account,
      checkoutSessionId: req.body?.checkoutSessionId,
    });
    const entitlements = await resolveAccountEntitlementsAsync(req.user);
    return res.json({
      ...result,
      entitlements,
    });
  } catch (error) {
    return handleBillingError(res, error, 'Refresh billing account');
  }
});

module.exports = router;

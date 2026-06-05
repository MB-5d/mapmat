const express = require('express');
const billingStore = require('../stores/billingStore');
const { authMiddleware, requireAuth } = require('./auth');
const {
  BillingError,
  getBillingCatalogForClient,
  createPlanCheckoutSessionAsync,
  createAddOnCheckoutSessionAsync,
  createPortalSessionAsync,
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

router.get('/config', (_req, res) => {
  try {
    return res.json(getBillingCatalogForClient());
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

module.exports = router;

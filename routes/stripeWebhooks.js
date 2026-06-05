const express = require('express');
const { processStripeWebhookAsync } = require('../utils/stripeBilling');

const router = express.Router();
const rawJsonParser = express.raw({
  type: ['application/json', 'application/*+json', '*/*'],
  limit: '2mb',
});

function handleWebhookError(res, error) {
  const status = Number.isFinite(error?.status) ? error.status : 500;
  if (status >= 500) {
    console.error('Stripe webhook error:', error);
  } else {
    console.warn('Stripe webhook rejected:', error?.message || error);
  }
  return res.status(status).json({
    error: error?.message || 'Failed to process Stripe webhook.',
    code: error?.code || 'STRIPE_WEBHOOK_ERROR',
  });
}

router.post('/', rawJsonParser, async (req, res) => {
  try {
    const result = await processStripeWebhookAsync({
      rawBody: req.body,
      signature: req.get('stripe-signature'),
    });
    return res.status(200).json(result);
  } catch (error) {
    return handleWebhookError(res, error);
  }
});

module.exports = router;

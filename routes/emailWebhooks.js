const express = require('express');
const {
  processResendWebhookAsync,
  processPostmarkWebhookAsync,
} = require('../utils/emailWebhooks');

const router = express.Router();
const rawJsonParser = express.raw({
  type: ['application/json', 'application/*+json', '*/*'],
  limit: '2mb',
});

function handleWebhookError(res, error, label) {
  const statusCode = Number.isFinite(error?.statusCode) ? error.statusCode : 500;
  if (statusCode >= 500) {
    console.error(`${label} error:`, error);
  } else {
    console.warn(`${label} rejected: ${error?.message || 'unknown error'}`);
  }

  return res.status(statusCode).json({
    error: error?.message || 'Failed to process email webhook',
  });
}

router.post('/resend', rawJsonParser, async (req, res) => {
  try {
    const result = await processResendWebhookAsync({
      rawBody: req.body,
      headers: req.headers,
    });
    return res.status(200).json({
      ok: true,
      provider: 'resend',
      duplicate: result.duplicate,
      deliveryId: result.deliveryId,
      providerMessageId: result.providerMessageId,
      eventType: result.eventType,
      deliveryStatus: result.deliveryStatus,
      occurredAt: result.occurredAt,
    });
  } catch (error) {
    return handleWebhookError(res, error, 'Resend webhook');
  }
});

router.post('/postmark', rawJsonParser, async (req, res) => {
  try {
    const result = await processPostmarkWebhookAsync({
      rawBody: req.body,
      headers: req.headers,
    });
    return res.status(200).json({
      ok: true,
      provider: 'postmark',
      duplicate: result.duplicate,
      deliveryId: result.deliveryId,
      providerMessageId: result.providerMessageId,
      eventType: result.eventType,
      deliveryStatus: result.deliveryStatus,
      occurredAt: result.occurredAt,
    });
  } catch (error) {
    return handleWebhookError(res, error, 'Postmark webhook');
  }
});

module.exports = router;

#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert/strict');

process.env.EMAIL_PROVIDER = 'log';
process.env.EMAIL_COPY_TO_ADDRESSES = 'hello@vellic.io, qa-copy@test.vellic.local';
process.env.EMAIL_COPY_MODE = 'cc';
process.env.EMAIL_RECIPIENT_OVERRIDE_ADDRESSES = 'qa-inbox@vellic.io';

const { buildHealthSnapshot, sendEmailAsync } = require('../utils/emailProvider');
const { EMAIL_TEMPLATE_KEYS } = require('../utils/emailTemplates');

async function main() {
  const health = buildHealthSnapshot();
  assert.equal(health.provider, 'log');
  assert.equal(health.copyToConfigured, true);
  assert.equal(health.copyToCount, 2);
  assert.equal(health.copyMode, 'cc');
  assert.equal(health.recipientOverrideConfigured, true);
  assert.equal(health.recipientOverrideCount, 1);

  const result = await sendEmailAsync({
    toEmail: 'free@test.vellic.local',
    subject: 'QA email copy check',
    text: 'Your code: 123456',
    html: '<p>Your code: 123456</p>',
    metadata: { scope: 'check-email-copy' },
  });

  assert.equal(result.status, 'sent');
  assert.equal(result.provider, 'log');
  assert.equal(result.providerResponse.originalToEmail, 'free@test.vellic.local');
  assert.deepEqual(result.providerResponse.toEmails, ['qa-inbox@vellic.io']);
  assert.deepEqual(result.providerResponse.ccEmails, ['hello@vellic.io', 'qa-copy@test.vellic.local']);
  assert.deepEqual(result.providerResponse.bccEmails, []);
  assert.equal(result.providerResponse.copySuppressed, false);
  assert.equal(result.providerResponse.recipientOverridden, true);

  const authResult = await sendEmailAsync({
    toEmail: 'signup@test.vellic.local',
    subject: 'Verify your Vellic email',
    text: 'Your code: 123456',
    html: '<p>Your code: 123456</p>',
    metadata: { templateKey: EMAIL_TEMPLATE_KEYS.AUTH_EMAIL_VERIFICATION },
  });

  assert.equal(authResult.status, 'sent');
  assert.deepEqual(authResult.providerResponse.toEmails, ['qa-inbox@vellic.io']);
  assert.deepEqual(authResult.providerResponse.ccEmails, []);
  assert.deepEqual(authResult.providerResponse.bccEmails, []);
  assert.equal(authResult.providerResponse.copySuppressed, true);
  assert.equal(authResult.providerResponse.recipientOverridden, true);

  const resetResult = await sendEmailAsync({
    toEmail: 'reset@test.vellic.local',
    subject: 'Reset your Vellic password',
    text: 'Your code: 654321',
    html: '<p>Your code: 654321</p>',
    metadata: { templateKey: EMAIL_TEMPLATE_KEYS.AUTH_PASSWORD_RESET },
  });

  assert.equal(resetResult.status, 'sent');
  assert.deepEqual(resetResult.providerResponse.ccEmails, []);
  assert.deepEqual(resetResult.providerResponse.bccEmails, []);
  assert.equal(resetResult.providerResponse.copySuppressed, true);

  console.log('[email-copy-check] Passed.');
}

main().catch((error) => {
  console.error('[email-copy-check] Failed:', error);
  process.exit(1);
});

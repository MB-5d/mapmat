#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert');
const { EMAIL_TEMPLATE_KEYS, renderTemplatedEmail } = require('../utils/emailTemplates');
const { getFeedbackRecipientEmail } = require('../utils/emailDelivery');

const intents = ['broken', 'confusing', 'idea', 'like', 'dislike'];
const scopes = ['whole_app', 'flow', 'specific_thing'];
const expectedRecipients = {
  broken: 'support@vellic.io',
  confusing: 'support@vellic.io',
  idea: 'hello@vellic.io',
  like: 'hello@vellic.io',
  dislike: 'hello@vellic.io',
};

function assertEmail(result, label) {
  assert(result.subject, `${label} must have a subject.`);
  assert(result.text, `${label} must have plain text.`);
  assert(result.html.includes('<!doctype html>'), `${label} must use the shared HTML shell.`);
  assert(result.html.includes('role="presentation"'), `${label} must use email-safe tables.`);
  assert(result.html.includes('Vellic'), `${label} must include the brand fallback text.`);
  assert(result.html.includes('/vellic-logo.png'), `${label} must use the full Vellic lockup asset.`);
  assert(!result.html.toLowerCase().includes('#dbeafe'), `${label} must not use the blue info fill.`);
}

function main() {
  for (const intent of intents) {
    assert.strictEqual(getFeedbackRecipientEmail(intent), expectedRecipients[intent]);
    for (const scope of scopes) {
      const result = renderTemplatedEmail({
        templateKey: EMAIL_TEMPLATE_KEYS.FEEDBACK_INTERNAL,
        payload: {
          intent,
          scope,
          actorName: 'QA User',
          actorEmail: 'qa@example.com',
          rating: 4,
          message: 'Representative feedback message.',
          surface: 'feedback-tab',
          routePath: '/app/maps/qa',
          mapId: 'map-qa',
          shareId: 'share-qa',
          componentLabel: scope === 'specific_thing' ? 'Share button' : null,
          screenshotUrl: scope === 'specific_thing' ? 'https://api.vellic.io/uploads/feedback/qa.png' : null,
          allowFollowUp: true,
        },
      });
      assertEmail(result, `${intent}/${scope}`);
      assert(result.text.includes(`Intent: ${intent}`));
      if (scope === 'specific_thing') {
        assert(result.text.includes('Selected component: Share button'));
        assert(result.text.includes('Screenshot: https://api.vellic.io/uploads/feedback/qa.png'));
      }
    }
  }

  const minimal = renderTemplatedEmail({
    templateKey: EMAIL_TEMPLATE_KEYS.FEEDBACK_INTERNAL,
    payload: { intent: 'idea', scope: 'whole_app', actorName: 'Anonymous', allowFollowUp: false },
  });
  assertEmail(minimal, 'minimal anonymous feedback');
  assert(!minimal.text.includes('Contact:'), 'Missing contact details should be omitted.');
  assert(!minimal.text.includes('Message:'), 'Missing messages should be omitted.');
  assert(minimal.text.includes('Follow-up: Not permitted'));

  const unsafeMessage = `<script>alert('x')</script>${' long'.repeat(700)}`;
  const longMessage = renderTemplatedEmail({
    templateKey: EMAIL_TEMPLATE_KEYS.FEEDBACK_INTERNAL,
    payload: { intent: 'broken', scope: 'flow', message: unsafeMessage },
  });
  assert(!longMessage.html.includes('<script>'), 'Feedback HTML must escape submitted markup.');
  assert(longMessage.html.includes('&lt;script&gt;'), 'Escaped long feedback should remain visible.');

  const confirmations = {
    broken: 'We’ll look into this',
    confusing: 'Thanks for flagging this',
    idea: 'Thanks for the idea',
    like: 'Glad to hear it',
    dislike: 'Thanks for being direct',
  };

  const verification = renderTemplatedEmail({
    templateKey: EMAIL_TEMPLATE_KEYS.AUTH_EMAIL_VERIFICATION,
    payload: { name: 'QA User', code: '123456', expiresMinutes: 10 },
  });
  assertEmail(verification, 'verification email');
  assert(
    verification.html.includes('rgba(99, 102, 241, 0.12)'),
    'Code blocks must use Surface/Accent/Soft.',
  );
  for (const intent of intents) {
    const result = renderTemplatedEmail({
      templateKey: EMAIL_TEMPLATE_KEYS.FEEDBACK_CONFIRMATION,
      payload: { intent, scope: 'whole_app', allowFollowUp: true },
    });
    assertEmail(result, `${intent} confirmation`);
    assert.strictEqual(result.subject, confirmations[intent]);
  }

  for (const targetKey of ['inquiries', 'support']) {
    const internal = renderTemplatedEmail({
      templateKey: EMAIL_TEMPLATE_KEYS.MARKETING_CONTACT,
      payload: {
        targetKey,
        name: 'QA Contact',
        email: 'contact@example.com',
        reason: 'QA request',
        message: 'Please follow up.',
      },
    });
    const confirmation = renderTemplatedEmail({
      templateKey: EMAIL_TEMPLATE_KEYS.MARKETING_CONTACT_CONFIRMATION,
      payload: { targetKey, name: 'QA Contact', reason: 'QA request' },
    });
    assertEmail(internal, `${targetKey} contact`);
    assertEmail(confirmation, `${targetKey} contact confirmation`);
  }

  console.log('[email-template-check] Passed 15 feedback states, optional fields, routing, escaping, and confirmations.');
}

main();

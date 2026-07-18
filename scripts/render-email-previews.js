#!/usr/bin/env node

/* eslint-disable no-console */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { EMAIL_TEMPLATE_KEYS, renderTemplatedEmail } = require('../utils/emailTemplates');

const outputDirectory = process.env.EMAIL_PREVIEW_DIR
  ? path.resolve(process.env.EMAIL_PREVIEW_DIR)
  : path.join(os.tmpdir(), 'vellic-email-previews');

const previews = [
  ['contact-inquiry', EMAIL_TEMPLATE_KEYS.MARKETING_CONTACT, { targetKey: 'inquiries', name: 'Jordan Lee', email: 'jordan@example.com', reason: 'Demo request', reasonDetail: 'Team plan', message: 'We would like to see Vellic with our website.', sourceUrl: 'https://vellic.io/contact', submittedAt: new Date().toISOString() }],
  ['contact-support', EMAIL_TEMPLATE_KEYS.MARKETING_CONTACT, { targetKey: 'support', name: 'Jordan Lee', email: 'jordan@example.com', reason: 'Scan issue', message: 'A scan stopped before completing.', sourceUrl: 'https://vellic.io/contact', submittedAt: new Date().toISOString() }],
  ['contact-inquiry-confirmation', EMAIL_TEMPLATE_KEYS.MARKETING_CONTACT_CONFIRMATION, { targetKey: 'inquiries', name: 'Jordan Lee', reason: 'Demo request' }],
  ['contact-support-confirmation', EMAIL_TEMPLATE_KEYS.MARKETING_CONTACT_CONFIRMATION, { targetKey: 'support', name: 'Jordan Lee', reason: 'Scan issue' }],
];

const intents = ['broken', 'confusing', 'idea', 'like', 'dislike'];
const scopes = ['whole_app', 'flow', 'specific_thing'];
for (const intent of intents) {
  for (const scope of scopes) {
    previews.push([
      `feedback-${intent}-${scope}`,
      EMAIL_TEMPLATE_KEYS.FEEDBACK_INTERNAL,
      {
        intent,
        scope,
        actorName: scope === 'whole_app' ? 'Anonymous' : 'Jordan Lee',
        actorEmail: scope === 'whole_app' ? null : 'jordan@example.com',
        rating: intent === 'like' ? 5 : (intent === 'dislike' ? 2 : null),
        message: intent === 'like' ? null : `Example ${intent} feedback for ${scope}.`,
        surface: 'feedback-tab',
        routePath: '/app/maps/example',
        mapId: 'map_example',
        shareId: scope === 'flow' ? 'share_example' : null,
        componentLabel: scope === 'specific_thing' ? 'Share access selector' : null,
        screenshotUrl: scope === 'specific_thing' ? 'https://api.vellic.io/uploads/feedback/example.png' : null,
        allowFollowUp: scope !== 'whole_app',
        context: { viewport: 'desktop', plan: 'pro' },
        submittedAt: new Date().toISOString(),
      },
    ]);
  }
  previews.push([
    `feedback-${intent}-confirmation`,
    EMAIL_TEMPLATE_KEYS.FEEDBACK_CONFIRMATION,
    { intent, scope: 'whole_app', allowFollowUp: true },
  ]);
}

fs.mkdirSync(outputDirectory, { recursive: true });
const links = [];
for (const [name, templateKey, payload] of previews) {
  const rendered = renderTemplatedEmail({ templateKey, payload });
  const htmlName = `${name}.html`;
  const textName = `${name}.txt`;
  fs.writeFileSync(path.join(outputDirectory, htmlName), rendered.html);
  fs.writeFileSync(path.join(outputDirectory, textName), `${rendered.subject}\n\n${rendered.text}\n`);
  links.push(`<li><a href="${htmlName}">${name}</a> <small>${rendered.subject}</small></li>`);
}
fs.writeFileSync(path.join(outputDirectory, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Vellic email previews</title></head><body><h1>Vellic email previews</h1><ul>${links.join('')}</ul></body></html>`);

console.log(`[email-previews] Wrote ${previews.length} previews to ${outputDirectory}`);

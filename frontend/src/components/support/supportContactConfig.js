export const GENERAL_INQUIRY_REASON = 'General inquiry';

export const CONTACT_TARGETS = Object.freeze({
  inquiries: Object.freeze({
    key: 'inquiries',
    title: 'Inquiries and feedback',
    text: 'Questions, demo requests, ideas, partnerships, and early product feedback.',
    cta: 'Contact us',
    email: 'hello@vellic.io',
    reasonOptions: Object.freeze([
      GENERAL_INQUIRY_REASON,
      'Demo request',
      'Product feedback',
      'Partnership',
      'Other',
    ]),
  }),
  support: Object.freeze({
    key: 'support',
    title: 'Product support',
    text: 'Help with maps, scans, screenshots, exports, account access, or product issues.',
    cta: 'Get help',
    email: 'support@vellic.io',
    reasonOptions: Object.freeze([
      GENERAL_INQUIRY_REASON,
      'Scan issue',
      'Screenshots',
      'Exports',
      'Account access',
      'Other',
    ]),
  }),
});

export const CONTACT_CARDS = Object.freeze([
  CONTACT_TARGETS.inquiries,
  CONTACT_TARGETS.support,
]);

export const CONTACT_SUBMIT_STATUS = Object.freeze({
  IDLE: 'idle',
  SUBMITTING: 'submitting',
  SUCCESS: 'success',
  ERROR: 'error',
});

export const emptyContactForm = {
  name: '',
  email: '',
  reason: GENERAL_INQUIRY_REASON,
  reasonDetail: '',
  message: '',
};

export function createContactFormState(target = CONTACT_TARGETS.support, user = null) {
  const name = String(user?.name || '').trim();
  const email = String(user?.email || '').trim();
  return {
    ...emptyContactForm,
    name,
    email,
    reason: target?.reasonOptions?.[0] || GENERAL_INQUIRY_REASON,
  };
}

export function validateContactForm(form = {}) {
  const nextErrors = {};
  const name = String(form.name || '').trim();
  const email = String(form.email || '').trim();
  const message = String(form.message || '').trim();

  if (!name) nextErrors.name = 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = 'Enter a valid email address.';
  if (!message) nextErrors.message = 'Enter a message.';

  return {
    errors: nextErrors,
    values: {
      name,
      email,
      reason: String(form.reason || GENERAL_INQUIRY_REASON).trim() || GENERAL_INQUIRY_REASON,
      reasonDetail: String(form.reasonDetail || '').trim(),
      message,
    },
  };
}

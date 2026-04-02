function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const SUPPORT_ADMIN_EMAILS = new Set(
  String(process.env.ADMIN_SUPPORT_EMAILS || '')
    .split(',')
    .map((email) => normalizeEmail(email))
    .filter(Boolean)
);

function isSupportAdminEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return SUPPORT_ADMIN_EMAILS.has(normalized);
}

module.exports = {
  isSupportAdminEmail,
  normalizeEmail,
};

// Separate pilot entry point. Never use this against an existing Vellic environment.
const { helperConfig } = require('./config.cjs');

async function main({ dataDirectory = '/tmp/vellic-auth-helper-pilot' } = {}) {
  const config = helperConfig();
  if (config?.mode !== 'hosted') throw Error('Hosted pilot configuration is required.');
  for (const name of ['JWT_SECRET', 'PRIVATE_SCAN_CAPTURE_KEY', 'SCAN_AUTH_HELPER_OWNER_PASSWORD']) {
    if (!/^[a-f0-9]{64}$/.test(process.env[name] || '')) throw Error('Generate a fresh random 32-byte pilot secret for ' + name);
  }
  if (['DATABASE_URL', 'STRIPE_SECRET_KEY', 'RESEND_API_KEY', 'GOOGLE_CLIENT_SECRET', 'BROWSERBASE_API_KEY', 'SENTRY_DSN'].some(name => process.env[name])) {
    throw Error('Do not reuse external service credentials in the pilot.');
  }
  require('node:fs').mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  require('node:fs').chmodSync(dataDirectory, 0o700);
  Object.assign(process.env, {
    DB_PROVIDER: 'sqlite', DB_PATH: require('node:path').join(dataDirectory, 'pilot.db'),
    SCREENSHOT_STORAGE_PROVIDER: 'local', SCREENSHOT_STORAGE_DIR: require('node:path').join(dataDirectory, 'images'),
    RUN_MODE: 'web', HOST: '0.0.0.0', EMAIL_PROVIDER: 'log', AUTH_HEADER_FALLBACK: 'false',
    APP_BASE_URL: config.origin, REQUEST_JSON_LIMIT: '1mb',
    SCAN_PAGE_BATCH_SIZE: '20', SCAN_PAGE_SAFETY_CAP: '20', SCAN_JOB_MAX_PAGES_DEFAULT: '10',
    SCAN_MAX_DEPTH_HARD: '3', SCAN_AUTH_SESSION_TTL_MS: '600000',
  });
  const authStore = require('../../stores/authStore');
  const billingStore = require('../../stores/billingStore');
  const bcrypt = require('bcryptjs');
  let user = await authStore.getUserByEmailAsync(config.ownerEmail);
  const passwordHash = await bcrypt.hash(process.env.SCAN_AUTH_HELPER_OWNER_PASSWORD, 12);
  delete process.env.SCAN_AUTH_HELPER_OWNER_PASSWORD;
  if (user) {
    user = await authStore.updateSeedUserCredentialsAsync({ userId: user.id, passwordHash, name: 'Cloud pilot owner' });
  } else {
    user = await authStore.createUserAsync({ email: config.ownerEmail, passwordHash, name: 'Cloud pilot owner',
      emailVerifiedAt: new Date().toISOString(), emailVerificationRequired: false });
  }
  const account = await billingStore.getOrCreateBillingAccountForUserAsync(user);
  const period = billingStore.getCurrentMonthPeriod();
  await billingStore.updateBillingAccountForAdminAsync({ accountId: account.id, planKey: 'pro', accountState: 'active',
    trialState: 'none', currentPeriodStartedAt: period.start, currentPeriodEndsAt: period.end });
  require('../../server');
  // Railway pilot uses NEVER restart. This ends the test process at its deadline;
  // infrastructure still needs explicit teardown after the trial.
  setTimeout(() => process.kill(process.pid, 'SIGTERM'), Math.max(1, config.expiresAt - Date.now())).unref();
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };

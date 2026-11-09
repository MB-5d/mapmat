const protectedProject = '78076aad-fdc1-4248-9730-4f265a7f2129';
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;

function hostedOrigin(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.origin !== raw || url.port
    || !/^[a-z0-9-]+\.up\.railway\.app$/.test(url.hostname)) {
    throw Error('Set the exact HTTPS origin of the separate Railway pilot.');
  }
  return url.origin;
}

function helperConfig(env = process.env, now = Date.now()) {
  if (env.SCAN_AUTH_BROWSER_HELPER !== 'true') return null;
  const extensionId = env.SCAN_AUTH_HELPER_EXTENSION_ID;
  if (!/^[a-p]{32}$/.test(extensionId || '')) throw Error('Set the exact browser helper extension ID.');
  const mode = env.SCAN_AUTH_HELPER_MODE || 'local';
  if (mode === 'local') {
    if (env.NODE_ENV !== 'test' || env.HOST !== '127.0.0.1'
      || env.RAILWAY_ENVIRONMENT_ID || env.RAILWAY_PUBLIC_DOMAIN || env.VERCEL) {
      throw Error('Browser helper is restricted to the isolated local test backend.');
    }
    return { mode, extensionId, appOrigin: 'http://127.0.0.1:5179', origin: 'http://127.0.0.1:4349', destination: 'Local Vellic only — http://127.0.0.1:4349' };
  }
  if (mode === 'staging') {
    // Explicitly limited rollout. Sessions are memory-only and must stay on one web instance.
    const origin = 'https://api-staging.vellic.io';
    const appOrigin = 'https://app-staging.vellic.io';
    const allowedUserIds = (env.SCAN_AUTH_HELPER_ALLOWED_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
    if (env.NODE_ENV !== 'production' || env.RAILWAY_PROJECT_ID !== protectedProject
      || env.RAILWAY_ENVIRONMENT_NAME !== 'staging' || !uuid.test(env.SCAN_AUTH_HELPER_ENVIRONMENT_ID || '')
      || env.RAILWAY_ENVIRONMENT_ID !== env.SCAN_AUTH_HELPER_ENVIRONMENT_ID
      || env.SCAN_AUTH_HELPER_PUBLIC_ORIGIN !== origin || env.SCAN_AUTH_HELPER_APP_ORIGIN !== appOrigin
      || env.SCAN_AUTH_HELPER_SINGLE_INSTANCE !== 'true' || env.RUN_MODE !== 'web'
      || !['scan', 'all'].some(type => (env.JOB_WORKER_TYPES || 'scan').split(',').includes(type))
      || env.DB_PROVIDER !== 'postgres' || !allowedUserIds.length
      || env.TEST_AUTH_ENABLED !== 'false' || env.ALLOW_PRIVATE_NETWORKS !== 'false'
      || env.SCAN_AUTH_LOCAL_PROTOTYPE !== 'false' || env.SCAN_AUTH_HELPER_ALLOW_FIXTURE !== 'false'
      || env.SCAN_AUTH_FEATURE_ENABLED !== 'true' || env.ALLOW_VERCEL_PREVIEWS !== 'false'
      || !env.FRONTEND_URL?.split(',').includes(appOrigin)
      || !env.FRONTEND_URL?.split(',').includes('chrome-extension://' + extensionId)
      || !env.SCAN_AUTH_HELPER_ARTIFACT_DIR) {
      throw Error('Staging helper requires exact environment, single web instance, reviewed package and scoped user access.');
    }
    return { mode, origin, appOrigin, extensionId, allowedUserIds, destination: 'Vellic staging — ' + origin };
  }
  if (mode !== 'hosted') throw Error('Unsupported browser helper mode.');
  const origin = hostedOrigin(env.SCAN_AUTH_HELPER_PUBLIC_ORIGIN);
  const expiresAt = Date.parse(env.SCAN_AUTH_HELPER_PILOT_EXPIRES_AT);
  if (env.NODE_ENV !== 'production' || env.RAILWAY_PROJECT_ID === protectedProject
    || !uuid.test(env.SCAN_AUTH_HELPER_PROJECT_ID || '')
    || !uuid.test(env.SCAN_AUTH_HELPER_ENVIRONMENT_ID || '')
    || env.RAILWAY_PROJECT_ID !== env.SCAN_AUTH_HELPER_PROJECT_ID
    || env.RAILWAY_ENVIRONMENT_ID !== env.SCAN_AUTH_HELPER_ENVIRONMENT_ID
    || env.RAILWAY_ENVIRONMENT_NAME !== 'auth-helper-pilot'
    || 'https://' + env.RAILWAY_PUBLIC_DOMAIN !== origin || env.VERCEL
    || !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 48 * 60 * 60 * 1000
    || env.TEST_AUTH_ENABLED !== 'false' || env.ALLOW_PRIVATE_NETWORKS !== 'false'
    || env.SCAN_AUTH_LOCAL_PROTOTYPE !== 'false' || env.SCAN_AUTH_HELPER_ALLOW_FIXTURE !== 'false'
    || env.SCAN_AUTH_FEATURE_ENABLED !== 'true' || env.ALLOW_VERCEL_PREVIEWS !== 'false'
    || env.FRONTEND_URL !== origin + ',chrome-extension://' + extensionId
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SCAN_AUTH_HELPER_OWNER_EMAIL || '')) {
    throw Error('Hosted helper requires a separate, time-limited pilot with private-network and account controls enabled.');
  }
  return { mode, origin, extensionId, expiresAt, ownerEmail: env.SCAN_AUTH_HELPER_OWNER_EMAIL.toLowerCase(),
    destination: 'Isolated Vellic cloud test — ' + origin };
}
module.exports = { helperConfig, hostedOrigin };

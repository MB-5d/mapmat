#!/usr/bin/env node

const VALID_TARGETS = new Set(['backend', 'frontend', 'all']);

function getTargetArg(argv) {
  const arg = argv.find((value) => value.startsWith('--target='));
  if (!arg) return 'all';
  const target = String(arg.split('=')[1] || '').trim().toLowerCase();
  if (!VALID_TARGETS.has(target)) {
    throw new Error(`Unsupported --target value: ${target}`);
  }
  return target;
}

function getEnvValue(name) {
  return String(process.env[name] || '').trim();
}

function parseBool(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function isHttpsUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function createReporter() {
  const rows = [];

  const add = (level, scope, key, message) => {
    rows.push({ level, scope, key, message });
  };

  return {
    error(scope, key, message) {
      add('error', scope, key, message);
    },
    warn(scope, key, message) {
      add('warn', scope, key, message);
    },
    info(scope, key, message) {
      add('info', scope, key, message);
    },
    rows,
  };
}

function requireValue(report, scope, key, { label = key } = {}) {
  const value = getEnvValue(key);
  if (!value) {
    report.error(scope, key, `${label} is required`);
    return '';
  }
  report.info(scope, key, `${label} is set`);
  return value;
}

function requireBoolean(report, scope, key, expected, { label = key, severity = 'error' } = {}) {
  const value = getEnvValue(key);
  const parsed = parseBool(value);
  if (parsed === null) {
    report[severity](scope, key, `${label} must be ${expected}`);
    return null;
  }
  if (parsed !== expected) {
    report[severity](scope, key, `${label} should be ${expected}`);
    return parsed;
  }
  report.info(scope, key, `${label}=${expected}`);
  return parsed;
}

function requireExact(report, scope, key, expected, { label = key, severity = 'error' } = {}) {
  const value = getEnvValue(key);
  if (!value) {
    report[severity](scope, key, `${label} is required`);
    return '';
  }
  if (value !== expected) {
    report[severity](scope, key, `${label} should be ${expected}`);
    return value;
  }
  report.info(scope, key, `${label}=${expected}`);
  return value;
}

function requireHttps(report, scope, key, { label = key } = {}) {
  const value = requireValue(report, scope, key, { label });
  if (!value) return '';
  if (!isHttpsUrl(value)) {
    report.error(scope, key, `${label} must be an https URL`);
    return value;
  }
  report.info(scope, key, `${label} uses https`);
  return value;
}

function checkBackend(report) {
  const scope = 'backend';

  requireExact(report, scope, 'NODE_ENV', 'production');
  requireExact(report, scope, 'DB_PROVIDER', 'postgres');
  requireValue(report, scope, 'DATABASE_URL');
  requireHttps(report, scope, 'FRONTEND_URL');
  requireValue(report, scope, 'JWT_SECRET');
  requireValue(report, scope, 'ADMIN_API_KEY');

  const jwtSecret = getEnvValue('JWT_SECRET');
  if (jwtSecret && jwtSecret.length < 32) {
    report.warn(scope, 'JWT_SECRET', 'JWT_SECRET should be at least 32 characters for staging');
  }

  const adminKey = getEnvValue('ADMIN_API_KEY');
  if (adminKey && adminKey.length < 24) {
    report.warn(scope, 'ADMIN_API_KEY', 'ADMIN_API_KEY looks short for a shared staging environment');
  }

  requireBoolean(report, scope, 'ALLOW_VERCEL_PREVIEWS', true);
  requireBoolean(report, scope, 'COLLABORATION_BACKEND_ENABLED', true);
  requireBoolean(report, scope, 'REALTIME_BASELINE_ENABLED', true);
  requireBoolean(report, scope, 'COEDITING_EXPERIMENT_ENABLED', true);
  requireBoolean(report, scope, 'COEDITING_SYNC_ENGINE_ENABLED', true);
  requireBoolean(report, scope, 'COEDITING_ROLLOUT_ENABLED', true);
  requireBoolean(report, scope, 'AUTH_HEADER_FALLBACK', true, { severity: 'warn' });

  const testAuth = parseBool(getEnvValue('TEST_AUTH_ENABLED'));
  if (testAuth === true) {
    report.warn(scope, 'TEST_AUTH_ENABLED', 'TEST_AUTH_ENABLED=true is acceptable for temporary internal staging, but real-account flow is preferred before broader alpha');
  } else if (testAuth === false) {
    report.info(scope, 'TEST_AUTH_ENABLED', 'TEST_AUTH_ENABLED=false');
  } else {
    report.warn(scope, 'TEST_AUTH_ENABLED', 'TEST_AUTH_ENABLED is unset; decide explicitly whether staging should allow test auth');
  }

  const emailProvider = getEnvValue('EMAIL_PROVIDER');
  if (!emailProvider) {
    report.warn(scope, 'EMAIL_PROVIDER', 'EMAIL_PROVIDER is unset; invite/access emails may not be testable');
  } else if (emailProvider === 'log') {
    report.warn(scope, 'EMAIL_PROVIDER', 'EMAIL_PROVIDER=log means emails are auditable in logs only and will not reach real inboxes');
  } else {
    report.info(scope, 'EMAIL_PROVIDER', `EMAIL_PROVIDER=${emailProvider}`);
  }

  const runMode = getEnvValue('RUN_MODE') || 'both';
  if (!['both', 'web', 'worker'].includes(runMode)) {
    report.warn(scope, 'RUN_MODE', `RUN_MODE=${runMode} is unusual`);
  } else {
    report.info(scope, 'RUN_MODE', `RUN_MODE=${runMode}`);
  }

  report.warn(scope, 'SCREENSHOT_STORAGE', 'Screenshots still use backend filesystem storage. Shared staging should stay single-instance or use a persistent volume.');
}

function checkFrontend(report) {
  const scope = 'frontend';

  requireHttps(report, scope, 'REACT_APP_API_BASE');
  requireBoolean(report, scope, 'REACT_APP_COLLABORATION_UI_ENABLED', true);
  requireBoolean(report, scope, 'REACT_APP_REALTIME_BASELINE_ENABLED', true);
  requireBoolean(report, scope, 'REACT_APP_COEDITING_EXPERIMENT_ENABLED', true);
  requireBoolean(report, scope, 'REACT_APP_PERMISSION_GATING_ENABLED', true);
  requireBoolean(report, scope, 'REACT_APP_SCREENSHOT_JOB_PIPELINE_ENABLED', true);

  const heartbeat = getEnvValue('REACT_APP_REALTIME_PRESENCE_HEARTBEAT_SEC');
  if (!heartbeat) {
    report.info(scope, 'REACT_APP_REALTIME_PRESENCE_HEARTBEAT_SEC', 'using frontend default heartbeat cadence');
  }
}

function printReport(rows) {
  const iconByLevel = {
    error: 'x',
    warn: '!',
    info: '-',
  };

  rows.forEach((row) => {
    const icon = iconByLevel[row.level] || '-';
    console.log(`${icon} [${row.scope}] ${row.key}: ${row.message}`);
  });
}

function main() {
  const target = getTargetArg(process.argv.slice(2));
  const report = createReporter();

  if (target === 'backend' || target === 'all') {
    checkBackend(report);
  }
  if (target === 'frontend' || target === 'all') {
    checkFrontend(report);
  }

  printReport(report.rows);

  const errorCount = report.rows.filter((row) => row.level === 'error').length;
  const warnCount = report.rows.filter((row) => row.level === 'warn').length;

  console.log(`\nSummary: ${errorCount} error(s), ${warnCount} warning(s)`);
  if (errorCount > 0) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(`[check-staging-readiness] ${error.message}`);
  process.exit(1);
}

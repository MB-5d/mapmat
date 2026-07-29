import { defineConfig, loadEnv, transformWithOxc } from 'vite';
import react from '@vitejs/plugin-react';

const PUBLIC_ENV_KEYS = [
  'REACT_APP_API_BASE',
  'REACT_APP_APP_ONLY_MODE',
  'REACT_APP_APP_ORIGIN',
  'REACT_APP_AUTHENTICATED_SCAN_ENABLED',
  'REACT_APP_CLARITY_PROJECT_ID',
  'REACT_APP_COEDITING_EXPERIMENT_ENABLED',
  'REACT_APP_COEDITING_SELECTION_BROADCAST_MS',
  'REACT_APP_COLLABORATION_UI_ENABLED',
  'REACT_APP_ENABLE_ADMIN_CONSOLE',
  'REACT_APP_ENABLE_ANALYTICS',
  'REACT_APP_ENABLE_DEMO_AUTH',
  'REACT_APP_GA_MEASUREMENT_ID',
  'REACT_APP_GOOGLE_AUTH_ENABLED',
  'REACT_APP_MARKETING_ORIGIN',
  'REACT_APP_PERMISSION_GATING_ENABLED',
  'REACT_APP_REALTIME_BASELINE_ENABLED',
  'REACT_APP_REALTIME_PRESENCE_HEARTBEAT_SEC',
  'REACT_APP_SCAN_MAX_DEPTH',
  'REACT_APP_SCAN_MAX_PAGES',
  'REACT_APP_SCREENSHOT_JOB_PIPELINE_ENABLED',
  'REACT_APP_SENTRY_DSN',
  'REACT_APP_SHOW_THEME_TOGGLE',
];

const treatSourceJsAsJsx = () => ({
  name: 'vellic-source-js-as-jsx',
  enforce: 'pre',
  async transform(code, id) {
    const filePath = id.split('?')[0];
    if (!filePath.includes('/src/') || !filePath.endsWith('.js')) return null;
    return transformWithOxc(code, filePath, {
      lang: 'jsx',
      jsx: {
        runtime: 'automatic',
      },
    });
  },
});

export default defineConfig(({ mode }) => {
  const loadedEnv = loadEnv(mode, process.cwd(), '');
  const define = mode === 'test'
    ? {}
    : Object.fromEntries([
      ['process.env.NODE_ENV', JSON.stringify(mode === 'production' ? 'production' : 'development')],
      ...PUBLIC_ENV_KEYS.map((key) => [
        `process.env.${key}`,
        JSON.stringify(loadedEnv[key] ?? process.env[key] ?? ''),
      ]),
    ]);

  return {
    plugins: [treatSourceJsAsJsx(), react()],
    define,
    server: {
      port: 3000,
    },
    build: {
      outDir: 'build',
      target: 'es2018',
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/setupTests.js',
      testTimeout: 15000,
    },
  };
});

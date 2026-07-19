import runtimePalettes from './runtimePalettes.json';

export const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4002';

const getDefaultAppOrigin = () => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'app-staging.vellic.io' || hostname === 'mapmat-staging.vercel.app') {
      return 'https://app-staging.vellic.io';
    }
  }
  return 'https://app.vellic.io';
};

export const APP_ORIGIN = String(process.env.REACT_APP_APP_ORIGIN || getDefaultAppOrigin()).replace(/\/+$/, '');
export const MARKETING_ORIGIN = String(process.env.REACT_APP_MARKETING_ORIGIN || 'https://vellic.io').replace(/\/+$/, '');

function parseEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export const APP_ONLY_MODE = parseEnvBool(process.env.REACT_APP_APP_ONLY_MODE, false);
export const GOOGLE_AUTH_ENABLED = parseEnvBool(process.env.REACT_APP_GOOGLE_AUTH_ENABLED, false);
// Temporarily paused while primary scan stability work continues. See docs/authenticated-scan-paused.md.
export const AUTHENTICATED_SCAN_ENABLED = parseEnvBool(process.env.REACT_APP_AUTHENTICATED_SCAN_ENABLED, false);
export const APP_BRAND_NAME = 'Vellic';
export const MIN_PASSWORD_LENGTH = 8;
export const ENABLE_ADMIN_CONSOLE = parseEnvBool(process.env.REACT_APP_ENABLE_ADMIN_CONSOLE, false);
export const ENABLE_ANALYTICS = parseEnvBool(process.env.REACT_APP_ENABLE_ANALYTICS, false);
export const CLARITY_PROJECT_ID = String(process.env.REACT_APP_CLARITY_PROJECT_ID || '').trim();
export const GA_MEASUREMENT_ID = String(process.env.REACT_APP_GA_MEASUREMENT_ID || '').trim();
export const SENTRY_DSN = String(process.env.REACT_APP_SENTRY_DSN || '').trim();
export const TESTER_NOT_READY_MESSAGE = 'Not ready for testing yet';

export const DEFAULT_COLORS = runtimePalettes.pageDepthPalette;
export const DEFAULT_CONNECTION_COLORS = runtimePalettes.connectionPalette;

export const getDepthColor = (colors, depth = 0) => {
  const index = Math.max(0, Number(depth) || 0);
  if (Array.isArray(colors) && colors[index]) return colors[index];
  return DEFAULT_COLORS[index] || DEFAULT_COLORS[index % DEFAULT_COLORS.length] || '#94a3b8';
};

// Permission levels for sharing
export const ACCESS_LEVELS = {
  VIEW: 'view',       // Can only look at map
  COMMENT: 'comment', // Can view + add comments
  EDIT: 'edit'        // Full access (owner)
};

export const SCAN_MESSAGES = [
  "Discovering pages...",
  "Mapping your site structure...",
  "Finding all the hidden gems...",
  "Building your sitemap...",
  "Analyzing page hierarchy...",
  "Almost there...",
  "Connecting the dots...",
  "Exploring your website...",
  "Gathering page information...",
  "Creating something beautiful...",
  "Following the links...",
  "Deep diving into your site...",
  "Organizing your pages...",
  "Making progress...",
  "This is looking great!",
];

export const REPORT_TYPE_OPTIONS = [
  { key: 'standard', label: 'Standard' },
  { key: 'missing', label: 'Missing' },
  { key: 'duplicates', label: 'Duplicate' },
  { key: 'brokenLinks', label: 'Broken links' },
  { key: 'inactivePages', label: 'Inactive pages' },
  { key: 'errorPages', label: 'Error pages' },
  { key: 'orphanPages', label: 'Orphan pages' },
  { key: 'subdomains', label: 'Subdomains' },
  { key: 'files', label: 'Files / downloads' },
  { key: 'authenticatedPages', label: 'Authenticated pages' },
  { key: 'missingTitle', label: 'No title' },
  { key: 'shortTitle', label: 'Short title' },
  { key: 'longTitle', label: 'Very long title' },
  { key: 'missingDescription', label: 'No description' },
  { key: 'shortDescription', label: 'Short description' },
  { key: 'longDescription', label: 'Very long description' },
  { key: 'missingH1', label: 'No H1' },
];

export const ANNOTATION_STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'moved', label: 'Moved' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'to_move', label: 'To Move' },
  { value: 'to_delete', label: 'To Delete' },
];

export const ANNOTATION_STATUS_LABELS = ANNOTATION_STATUS_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, { none: 'None', note: 'Note' });

// Layout constants (Single Source of Truth)
export const LAYOUT = {
  NODE_W: 288,
  NODE_H_COLLAPSED: 200, // Must match CSS .node-card min-height
  NODE_H_THUMB: 278,     // Must match CSS .node-card.with-thumb height
  GAP_L1_X: 80,         // Horizontal gap between Level 1 siblings (and orphans) - increased for drop zones
  GAP_STACK_Y: 56,      // Vertical gap between bottom of parent and top of child - increased for drop zones
  INDENT_X: 40,         // Per-depth indentation for depth >= 2
  BUS_Y_GAP: 80,        // Vertical gap from root bottom to Level 1 row
  ORPHAN_GROUP_GAP: 160, // Gap between main tree and first orphan only
  STROKE_PAD_X: 20,     // Padding between connector line and card edge
  ROOT_Y: 0,            // Root node Y position
};

// Minimum number of similar children to trigger stacking
export const STACK_THRESHOLD = 5;

export const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4002';

function parseEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseEnvInt(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export const APP_ONLY_MODE = parseEnvBool(process.env.REACT_APP_APP_ONLY_MODE, false);
export const SHOW_DEMO_AUTH = parseEnvBool(process.env.REACT_APP_ENABLE_DEMO_AUTH, !APP_ONLY_MODE);
export const APP_BRAND_NAME = APP_ONLY_MODE ? 'IA Tool' : 'Map Mat';
export const ENABLE_ADMIN_CONSOLE = parseEnvBool(process.env.REACT_APP_ENABLE_ADMIN_CONSOLE, false);
export const ENABLE_ANALYTICS = parseEnvBool(process.env.REACT_APP_ENABLE_ANALYTICS, false);
export const CLARITY_PROJECT_ID = String(process.env.REACT_APP_CLARITY_PROJECT_ID || '').trim();
export const GA_MEASUREMENT_ID = String(process.env.REACT_APP_GA_MEASUREMENT_ID || '').trim();
export const SENTRY_DSN = String(process.env.REACT_APP_SENTRY_DSN || '').trim();
export const SCAN_MAX_DEPTH_UI = parseEnvInt(process.env.REACT_APP_SCAN_MAX_DEPTH, 8, { min: 1, max: 10 });
export const SCAN_MAX_PAGES_UI = parseEnvInt(process.env.REACT_APP_SCAN_MAX_PAGES, 300, { min: 1, max: 5000 });
export const TESTER_NOT_READY_MESSAGE = 'Not ready for testing yet';

export const DEFAULT_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

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
  { key: 'brokenLinks', label: 'Broken Links' },
  { key: 'inactivePages', label: 'Inactive Pages' },
  { key: 'errorPages', label: 'Error Pages' },
  { key: 'orphanPages', label: 'Orphan Pages' },
  { key: 'subdomains', label: 'Subdomains' },
  { key: 'files', label: 'Files / Downloads' },
  { key: 'authenticatedPages', label: 'Authenticated Pages' },
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
  NODE_H_THUMB: 262,     // header 8 + thumb 152 + content ~60 + actions ~42
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

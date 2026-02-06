export const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4002';

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

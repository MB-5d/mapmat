const runtimePalettes = require('../frontend/src/utils/runtimePalettes.json');

const COLOR_STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

const colorAliases = {
  family: {},
  token: {
    neutral: {
      '50': 'white',
    },
  },
};

const primitiveColors = {
  neutral: {
    'white': '#ffffff',
    '100': '#f8fafc',
    '200': '#f1f5f9',
    '300': '#e2e8f0',
    '400': '#cbd5e1',
    '500': '#94a3b8',
    '600': '#64748b',
    '700': '#475569',
    '800': '#334155',
    '900': '#1e293b',
    '950': '#0f172a',
    'black': '#000000',
  },
  brand: {
    '50': '#eef2ff',
    '100': '#e0e7ff',
    '200': '#c7d2fe',
    '300': '#a5b4fc',
    '400': '#818cf8',
    '500': '#6366f1',
    '600': '#4f46e5',
    '700': '#4338ca',
    '800': '#3730a3',
    '900': '#312e81',
    '950': '#1e1b4b',
  },
  blue: {
    '50': '#eff6ff',
    '100': '#dbeafe',
    '200': '#bfdbfe',
    '300': '#93c5fd',
    '400': '#60a5fa',
    '500': '#3b82f6',
    '600': '#2563eb',
    '700': '#1d4ed8',
    '800': '#1e40af',
    '900': '#1e3a8a',
    '950': '#172554',
  },
  green: {
    '50': '#f0fdf4',
    '100': '#dcfce7',
    '200': '#bbf7d0',
    '300': '#86efac',
    '400': '#4ade80',
    '500': '#22c55e',
    '600': '#16a34a',
    '700': '#15803d',
    '800': '#166534',
    '900': '#14532d',
    '950': '#052e16',
  },
  yellow: {
    '50': '#fffbeb',
    '100': '#fef3c7',
    '200': '#fde68a',
    '300': '#fcd34d',
    '400': '#fbbf24',
    '500': '#f59e0b',
    '600': '#d97706',
    '700': '#b45309',
    '800': '#92400e',
    '900': '#78350f',
    '950': '#451a03',
  },
  red: {
    '50': '#fef2f2',
    '100': '#fee2e2',
    '200': '#fecaca',
    '300': '#fca5a5',
    '400': '#f87171',
    '500': '#ef4444',
    '600': '#dc2626',
    '700': '#b91c1c',
    '800': '#991b1b',
    '900': '#7f1d1d',
    '950': '#450a0a',
  },
  plum: {
    '50': '#f5effa',
    '100': '#e7ddef',
    '200': '#d4c8e0',
    '300': '#b8add1',
    '400': '#9f8fb8',
    '500': '#6b5a80',
    '600': '#56456e',
    '700': '#3d2a52',
    '800': '#301e3f',
    '900': '#1a1022',
    '950': '#0d0812',
  },
};

const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
};

const radius = {
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '999px',
};

const icon = {
  size: {
    xs: 12,
    sm: 16,
    md: 18,
    lg: 20,
    xl: 24,
  },
};

const elevation = {
  card: '0 1px 3px rgba(15, 23, 42, 0.1), 0 1px 2px rgba(15, 23, 42, 0.06)',
  raised: '0 4px 12px rgba(15, 23, 42, 0.12)',
  overlay: '0 12px 24px rgba(15, 23, 42, 0.12)',
  modal: '0 20px 25px rgba(15, 23, 42, 0.15)',
  drawer: '-12px 0 24px rgba(15, 23, 42, 0.15)',
  focus: '0 0 0 3px rgba(99, 102, 241, 0.1)',
  'focus-danger': '0 0 0 3px rgba(239, 68, 68, 0.14)',
};

const typography = {
  display: {
    xl: {
      cssSize: 'clamp(2.9rem, 5vw, 4.7rem)',
      figmaSize: 72,
      lineHeight: '1.02',
      weight: 700,
      letterSpacing: '-0.04em',
    },
  },
  heading: {
    xl: {
      cssSize: 'clamp(2rem, 3vw, 3rem)',
      figmaSize: 48,
      lineHeight: '1.08',
      weight: 600,
      letterSpacing: '-0.03em',
    },
    lg: {
      cssSize: '32px',
      figmaSize: 32,
      lineHeight: '40px',
      weight: 700,
      letterSpacing: '-0.02em',
    },
  },
  title: {
    lg: {
      cssSize: '20px',
      figmaSize: 20,
      lineHeight: '26px',
      weight: 600,
      letterSpacing: '-0.02em',
    },
    md: {
      cssSize: '18px',
      figmaSize: 18,
      lineHeight: '24px',
      weight: 600,
      letterSpacing: '-0.01em',
    },
  },
  subtitle: {
    md: {
      cssSize: '16px',
      figmaSize: 16,
      lineHeight: '24px',
      weight: 600,
      letterSpacing: '-0.01em',
    },
    sm: {
      cssSize: '14px',
      figmaSize: 14,
      lineHeight: '20px',
      weight: 600,
      letterSpacing: '0',
    },
  },
  body: {
    lg: {
      cssSize: '20px',
      figmaSize: 20,
      lineHeight: '30px',
      weight: 400,
      letterSpacing: '0',
    },
    md: {
      cssSize: '16px',
      figmaSize: 16,
      lineHeight: '24px',
      weight: 400,
      letterSpacing: '0',
    },
    sm: {
      cssSize: '14px',
      figmaSize: 14,
      lineHeight: '20px',
      weight: 400,
      letterSpacing: '0',
    },
    xs: {
      cssSize: '12px',
      figmaSize: 12,
      lineHeight: '16px',
      weight: 400,
      letterSpacing: '0',
    },
    '2xs': {
      cssSize: '10px',
      figmaSize: 10,
      lineHeight: '14px',
      weight: 400,
      letterSpacing: '0',
    },
  },
  label: {
    md: {
      cssSize: '14px',
      figmaSize: 14,
      lineHeight: '20px',
      weight: 600,
      letterSpacing: '0',
    },
    sm: {
      cssSize: '12px',
      figmaSize: 12,
      lineHeight: '16px',
      weight: 600,
      letterSpacing: '0',
    },
  },
  button: {
    sm: {
      cssSize: '14px',
      figmaSize: 14,
      lineHeight: '20px',
      weight: 700,
      letterSpacing: '0',
    },
    md: {
      cssSize: '14px',
      figmaSize: 14,
      lineHeight: '20px',
      weight: 700,
      letterSpacing: '0',
    },
    lg: {
      cssSize: '14px',
      figmaSize: 14,
      lineHeight: '20px',
      weight: 700,
      letterSpacing: '0',
    },
  },
  caption: {
    md: {
      cssSize: '12px',
      figmaSize: 12,
      lineHeight: '16px',
      weight: 500,
      letterSpacing: '0',
    },
  },
  badge: {
    md: {
      cssSize: '10px',
      figmaSize: 10,
      lineHeight: '12px',
      weight: 700,
      letterSpacing: '0.04em',
    },
  },
  tag: {
    md: {
      cssSize: '14px',
      figmaSize: 14,
      lineHeight: '20px',
      weight: 500,
      letterSpacing: '0',
    },
  },
};

const appSemantics = {
  light: {
    'ui-color-primary': 'var(--color-brand-500)',
    'ui-color-primary-hover': 'var(--color-brand-600)',
    'ui-color-danger': 'var(--color-red-500)',
    'ui-color-danger-hover': 'var(--color-red-600)',
    'ui-button-brand-fill': 'var(--color-brand-700)',
    'ui-button-brand-fill-hover': 'var(--color-brand-800)',
    'ui-button-brand-fill-disabled': 'var(--color-brand-300)',
    'ui-button-brand-contrast': 'var(--color-neutral-white)',
    'ui-button-brand-quiet': 'var(--color-brand-700)',
    'ui-button-brand-quiet-hover': 'var(--color-brand-800)',
    'ui-button-brand-quiet-disabled': 'var(--color-brand-300)',
    'ui-button-mono-fill': 'var(--color-neutral-900)',
    'ui-button-mono-fill-hover': 'var(--color-neutral-800)',
    'ui-button-mono-fill-disabled': 'var(--color-neutral-400)',
    'ui-button-mono-contrast': 'var(--color-neutral-white)',
    'ui-button-mono-quiet': 'var(--color-neutral-900)',
    'ui-button-mono-quiet-hover': 'var(--color-neutral-800)',
    'ui-button-mono-quiet-disabled': 'var(--color-neutral-400)',
    'ui-button-danger-fill': 'var(--color-red-800)',
    'ui-button-danger-fill-hover': 'var(--color-red-900)',
    'ui-button-danger-fill-disabled': 'var(--color-red-300)',
    'ui-button-danger-contrast': 'var(--color-neutral-white)',
    'ui-button-danger-quiet': 'var(--color-red-800)',
    'ui-button-danger-quiet-hover': 'var(--color-red-900)',
    'ui-button-danger-quiet-disabled': 'var(--color-red-300)',
    'ui-color-surface': 'var(--color-neutral-white)',
    'ui-color-surface-muted': 'var(--color-neutral-100)',
    'ui-color-border': 'var(--color-neutral-300)',
    'ui-color-border-strong': 'var(--color-neutral-400)',
    'ui-color-text': 'var(--color-neutral-900)',
    'ui-color-muted': 'var(--color-neutral-600)',
    'ui-color-input-bg': 'var(--color-neutral-white)',
    'ui-color-input-placeholder': 'var(--color-neutral-500)',
    'ui-input-brand-border': 'var(--color-brand-300)',
    'ui-input-brand-border-hover': 'var(--color-brand-400)',
    'ui-input-brand-border-focus': 'var(--color-brand-500)',
    'ui-input-mono-border': 'var(--color-neutral-300)',
    'ui-input-mono-border-hover': 'var(--color-neutral-400)',
    'ui-input-mono-border-focus': 'var(--color-neutral-500)',
    'ui-input-error-border': 'var(--color-red-400)',
    'ui-input-error-border-hover': 'var(--color-red-500)',
    'ui-input-disabled-bg': 'var(--color-neutral-100)',
    'ui-input-disabled-border': 'var(--color-neutral-300)',
    'ui-input-disabled-text': 'var(--color-neutral-400)',
    'ui-icon-default': 'var(--color-neutral-900)',
    'ui-icon-muted': 'var(--color-neutral-600)',
    'ui-icon-brand': 'var(--color-brand-600)',
    'ui-icon-danger': 'var(--color-red-600)',
    'ui-icon-inverse': 'var(--color-neutral-white)',
    'ui-input-icon': 'var(--color-neutral-500)',
    'ui-input-icon-active': 'var(--color-brand-500)',
    'ui-color-icon-hover': 'var(--color-neutral-200)',
    'ui-color-accent-soft': 'rgba(99, 102, 241, 0.12)',
    'ui-color-accent-soft-border': 'rgba(99, 102, 241, 0.28)',
    'ui-canvas-scrim': 'rgba(248, 250, 252, 0.92)',
    'ui-route-gate-surface': 'rgba(255, 255, 255, 0.96)',
    'ui-route-gate-warning-surface': 'linear-gradient(180deg, rgba(255, 251, 235, 0.98) 0%, rgba(255, 255, 255, 0.98) 100%)',
    'ui-selection-highlight-border': 'rgba(14, 165, 233, 0.65)',
    'ui-selection-highlight-bg': 'rgba(14, 165, 233, 0.08)',
    'ui-selection-highlight-inset': 'rgba(255, 255, 255, 0.72)',
    'ui-status-warning-bg': 'var(--color-yellow-100)',
    'ui-status-warning-border': 'var(--color-yellow-400)',
    'ui-status-warning-text': 'var(--color-yellow-800)',
    'ui-status-warning-icon': 'var(--color-yellow-600)',
    'ui-status-info-bg': 'var(--color-blue-100)',
    'ui-status-info-border': 'var(--color-blue-300)',
    'ui-status-info-text': 'var(--color-blue-900)',
    'ui-status-info-icon': 'var(--color-blue-600)',
    'ui-status-success-bg': 'var(--color-green-100)',
    'ui-status-success-border': 'var(--color-green-300)',
    'ui-status-success-text': 'var(--color-green-800)',
    'ui-status-success-icon': 'var(--color-green-600)',
    'ui-status-danger-bg': 'var(--color-red-100)',
    'ui-status-danger-border': 'var(--color-red-300)',
    'ui-status-danger-text': 'var(--color-red-800)',
    'ui-status-danger-icon': 'var(--color-red-600)',
    'ui-tag-bg': 'var(--ui-color-surface-muted)',
    'ui-tag-border': 'var(--ui-color-border)',
    'ui-tag-text': 'var(--ui-color-muted)',
    'ui-tag-icon': 'var(--ui-color-muted)',
    'ui-node-badge-bg': 'var(--ui-tag-bg)',
    'ui-node-badge-border': 'var(--ui-tag-border)',
    'ui-node-badge-text': 'var(--ui-tag-text)',
    'ui-node-status-new-bg': 'var(--ui-status-info-bg)',
    'ui-node-status-new-border': 'var(--ui-status-info-border)',
    'ui-node-status-new-text': 'var(--ui-status-info-text)',
    'ui-node-status-to-move-bg': 'var(--ui-status-warning-bg)',
    'ui-node-status-to-move-border': 'var(--ui-status-warning-border)',
    'ui-node-status-to-move-text': 'var(--ui-status-warning-text)',
    'ui-node-status-moved-bg': 'var(--ui-status-info-bg)',
    'ui-node-status-moved-border': 'var(--ui-status-info-border)',
    'ui-node-status-moved-text': 'var(--ui-status-info-text)',
    'ui-node-status-to-delete-bg': 'var(--ui-status-danger-bg)',
    'ui-node-status-to-delete-border': 'var(--ui-status-danger-border)',
    'ui-node-status-to-delete-text': 'var(--ui-status-danger-text)',
    'ui-node-status-deleted-bg': 'var(--ui-status-danger-bg)',
    'ui-node-status-deleted-border': 'var(--ui-status-danger-border)',
    'ui-node-status-deleted-text': 'var(--ui-status-danger-text)',
    'ui-node-status-note-bg': 'var(--ui-color-surface-muted)',
    'ui-node-status-note-border': 'var(--ui-color-border-strong)',
    'ui-node-status-note-text': 'var(--ui-color-muted)',
    'ui-comment-badge-bg': 'var(--color-yellow-500)',
    'ui-comment-badge-hover': 'var(--color-yellow-600)',
    'ui-comment-badge-text': 'var(--color-neutral-white)',
    'ui-connection-map-default': 'var(--color-neutral-500)',
    'ui-connection-userflow': runtimePalettes.connectionPalette.userFlows,
    'ui-connection-crosslink': runtimePalettes.connectionPalette.crossLinks,
    'ui-connection-broken': 'var(--color-red-400)',
    'ui-inline-badge-bg': 'rgba(99, 102, 241, 0.12)',
    'ui-inline-badge-text': 'var(--color-brand-600)',
    'ui-overlay-shadow': 'var(--shadow-overlay)',
    'ui-focus-ring': 'var(--shadow-focus)',
    'shadow-soft': 'var(--shadow-raised)',
    'shadow-strong': 'var(--shadow-overlay)',
    'shadow-rgb': '15, 23, 42',
    'shadow-rgb-deep': '15, 23, 42',
    'modal-bg': 'var(--color-neutral-white)',
    'modal-overlay-bg': 'rgba(0, 0, 0, 0.5)',
    'modal-shadow': 'var(--shadow-modal)',
    'modal-card-bg': 'var(--color-neutral-white)',
    'modal-card-bg-hover': 'var(--color-neutral-100)',
    'modal-card-border': 'var(--color-neutral-300)',
    'feedback-tab-bg': 'linear-gradient(180deg, rgba(234, 247, 255, 0.98) 0%, rgba(225, 241, 251, 0.98) 100%)',
    'feedback-tab-bg-hover': 'linear-gradient(180deg, rgba(240, 250, 255, 1) 0%, rgba(230, 244, 253, 1) 100%)',
    'feedback-tab-border': 'rgba(184, 213, 235, 0.92)',
    'feedback-tab-text': '#1f2937',
    'feedback-tab-icon': 'var(--color-neutral-600)',
    'feedback-tab-shadow': 'rgba(112, 144, 176, 0.18)',
    'feedback-tab-shadow-hover': 'rgba(112, 144, 176, 0.22)',
  },
  dark: {
    'ui-button-brand-fill': 'var(--color-brand-700)',
    'ui-button-brand-fill-hover': 'var(--color-brand-800)',
    'ui-button-brand-fill-disabled': 'var(--color-brand-300)',
    'ui-button-brand-contrast': 'var(--color-neutral-white)',
    'ui-button-brand-quiet': 'var(--color-brand-700)',
    'ui-button-brand-quiet-hover': 'var(--color-brand-800)',
    'ui-button-brand-quiet-disabled': 'var(--color-brand-300)',
    'ui-button-mono-fill': 'var(--color-neutral-white)',
    'ui-button-mono-fill-hover': 'var(--color-neutral-100)',
    'ui-button-mono-fill-disabled': 'var(--color-neutral-300)',
    'ui-button-mono-contrast': 'var(--color-neutral-900)',
    'ui-button-mono-quiet': 'var(--color-neutral-white)',
    'ui-button-mono-quiet-hover': 'var(--color-neutral-100)',
    'ui-button-mono-quiet-disabled': 'var(--color-neutral-300)',
    'ui-button-danger-fill': 'var(--color-red-800)',
    'ui-button-danger-fill-hover': 'var(--color-red-900)',
    'ui-button-danger-fill-disabled': 'var(--color-red-300)',
    'ui-button-danger-contrast': 'var(--color-neutral-white)',
    'ui-button-danger-quiet': 'var(--color-red-800)',
    'ui-button-danger-quiet-hover': 'var(--color-red-900)',
    'ui-button-danger-quiet-disabled': 'var(--color-red-300)',
    'ui-color-surface': 'var(--color-plum-900)',
    'ui-color-surface-muted': 'var(--color-plum-700)',
    'ui-color-border': 'var(--color-plum-700)',
    'ui-color-border-strong': 'var(--color-plum-600)',
    'ui-color-text': 'var(--color-plum-200)',
    'ui-color-muted': 'var(--color-plum-400)',
    'ui-color-input-bg': 'var(--color-plum-700)',
    'ui-color-input-placeholder': 'var(--color-plum-500)',
    'ui-input-brand-border': 'var(--color-brand-500)',
    'ui-input-brand-border-hover': 'var(--color-brand-400)',
    'ui-input-brand-border-focus': 'var(--color-brand-300)',
    'ui-input-mono-border': 'var(--color-plum-600)',
    'ui-input-mono-border-hover': 'var(--color-plum-500)',
    'ui-input-mono-border-focus': 'var(--color-neutral-300)',
    'ui-input-error-border': 'var(--color-red-500)',
    'ui-input-error-border-hover': 'var(--color-red-400)',
    'ui-input-disabled-bg': 'var(--color-plum-800)',
    'ui-input-disabled-border': 'var(--color-plum-700)',
    'ui-input-disabled-text': 'var(--color-plum-500)',
    'ui-icon-default': 'var(--color-plum-200)',
    'ui-icon-muted': 'var(--color-plum-400)',
    'ui-icon-brand': 'var(--color-brand-300)',
    'ui-icon-danger': 'var(--color-red-400)',
    'ui-icon-inverse': 'var(--color-neutral-white)',
    'ui-input-icon': 'var(--color-plum-400)',
    'ui-input-icon-active': 'var(--color-brand-300)',
    'ui-color-icon-hover': 'var(--color-plum-800)',
    'ui-color-accent-soft': 'rgba(99, 102, 241, 0.18)',
    'ui-color-accent-soft-border': 'rgba(129, 140, 248, 0.36)',
    'ui-canvas-scrim': 'rgba(13, 8, 18, 0.9)',
    'ui-route-gate-surface': 'rgba(26, 16, 34, 0.96)',
    'ui-route-gate-warning-surface': 'linear-gradient(180deg, rgba(42, 29, 8, 0.98) 0%, rgba(26, 16, 34, 0.98) 100%)',
    'ui-selection-highlight-border': 'rgba(56, 189, 248, 0.8)',
    'ui-selection-highlight-bg': 'rgba(14, 165, 233, 0.12)',
    'ui-selection-highlight-inset': 'rgba(15, 23, 42, 0.88)',
    'ui-status-warning-bg': '#2a1d08',
    'ui-status-warning-border': 'var(--color-yellow-600)',
    'ui-status-warning-text': 'var(--color-yellow-200)',
    'ui-status-warning-icon': 'var(--color-yellow-400)',
    'ui-status-info-bg': '#0f1d3a',
    'ui-status-info-border': 'var(--color-blue-700)',
    'ui-status-info-text': 'var(--color-blue-200)',
    'ui-status-info-icon': 'var(--color-blue-400)',
    'ui-status-success-bg': '#102417',
    'ui-status-success-border': 'var(--color-green-800)',
    'ui-status-success-text': 'var(--color-green-200)',
    'ui-status-success-icon': 'var(--color-green-400)',
    'ui-status-danger-bg': '#2d1313',
    'ui-status-danger-border': 'var(--color-red-900)',
    'ui-status-danger-text': 'var(--color-red-200)',
    'ui-status-danger-icon': 'var(--color-red-400)',
    'ui-tag-bg': 'var(--color-plum-950)',
    'ui-tag-border': 'var(--ui-color-border-strong)',
    'ui-tag-text': 'var(--ui-color-muted)',
    'ui-tag-icon': 'var(--ui-color-muted)',
    'ui-node-badge-bg': 'var(--ui-tag-bg)',
    'ui-node-badge-border': 'var(--ui-tag-border)',
    'ui-node-badge-text': 'var(--ui-tag-text)',
    'ui-node-status-new-bg': 'rgba(59, 130, 246, 0.2)',
    'ui-node-status-new-border': 'rgba(59, 130, 246, 0.45)',
    'ui-node-status-new-text': 'var(--color-blue-200)',
    'ui-node-status-to-move-bg': 'rgba(251, 191, 36, 0.18)',
    'ui-node-status-to-move-border': 'rgba(251, 191, 36, 0.4)',
    'ui-node-status-to-move-text': 'var(--color-yellow-200)',
    'ui-node-status-moved-bg': 'rgba(14, 165, 233, 0.2)',
    'ui-node-status-moved-border': 'rgba(14, 165, 233, 0.45)',
    'ui-node-status-moved-text': 'var(--color-blue-200)',
    'ui-node-status-to-delete-bg': 'rgba(248, 113, 113, 0.18)',
    'ui-node-status-to-delete-border': 'rgba(248, 113, 113, 0.4)',
    'ui-node-status-to-delete-text': 'var(--color-red-200)',
    'ui-node-status-deleted-bg': 'rgba(248, 113, 113, 0.18)',
    'ui-node-status-deleted-border': 'rgba(248, 113, 113, 0.4)',
    'ui-node-status-deleted-text': 'var(--color-red-200)',
    'ui-node-status-note-bg': 'rgba(148, 163, 184, 0.12)',
    'ui-node-status-note-border': 'rgba(148, 163, 184, 0.3)',
    'ui-node-status-note-text': 'var(--color-neutral-200)',
    'ui-comment-badge-bg': 'var(--color-yellow-500)',
    'ui-comment-badge-hover': 'var(--color-yellow-400)',
    'ui-comment-badge-text': 'var(--color-neutral-white)',
    'ui-connection-map-default': 'var(--color-neutral-700)',
    'ui-connection-userflow': runtimePalettes.connectionPalette.userFlows,
    'ui-connection-crosslink': runtimePalettes.connectionPalette.crossLinks,
    'ui-connection-broken': 'var(--color-red-500)',
    'ui-inline-badge-bg': 'rgba(167, 139, 250, 0.16)',
    'ui-inline-badge-text': 'var(--color-brand-200)',
    'ui-overlay-shadow': '0 12px 24px rgba(0, 0, 0, 0.4)',
    'ui-focus-ring': 'var(--shadow-focus)',
    'shadow-soft': '0 4px 12px rgba(180, 180, 180, 0.12)',
    'shadow-strong': '0 12px 24px rgba(160, 160, 160, 0.18)',
    'shadow-rgb': '180, 180, 180',
    'shadow-rgb-deep': '160, 160, 160',
    'modal-bg': 'var(--color-plum-900)',
    'modal-card-bg': 'var(--color-plum-950)',
    'modal-card-bg-hover': '#1a1025',
    'modal-card-border': 'var(--color-plum-800)',
    'modal-shadow': '0 20px 25px rgba(180, 180, 180, 0.12)',
    'feedback-tab-bg': 'linear-gradient(180deg, rgba(39, 27, 53, 0.98) 0%, rgba(28, 18, 39, 0.98) 100%)',
    'feedback-tab-bg-hover': 'linear-gradient(180deg, rgba(49, 34, 67, 1) 0%, rgba(35, 23, 48, 1) 100%)',
    'feedback-tab-border': 'rgba(86, 69, 110, 0.9)',
    'feedback-tab-text': 'var(--color-plum-200)',
    'feedback-tab-icon': 'var(--color-plum-300)',
    'feedback-tab-shadow': 'rgba(4, 1, 8, 0.34)',
    'feedback-tab-shadow-hover': 'rgba(4, 1, 8, 0.42)',
  },
};

const landing = {
  'landing-bg': '#f6f8fc',
  'landing-surface': 'rgba(255, 255, 255, 0.86)',
  'landing-surface-strong': 'var(--color-neutral-white)',
  'landing-surface-alt': '#eef3ff',
  'landing-border': 'rgba(99, 102, 241, 0.16)',
  'landing-border-strong': 'rgba(99, 102, 241, 0.26)',
  'landing-text': '#172033',
  'landing-text-muted': '#5a6478',
  'landing-title': 'var(--color-neutral-950)',
  'landing-primary': 'var(--color-brand-600)',
  'landing-primary-strong': 'var(--color-brand-800)',
  'landing-primary-soft': 'rgba(79, 70, 229, 0.12)',
  'landing-accent': '#0f766e',
  'landing-success': 'var(--color-green-700)',
  'landing-success-soft': 'rgba(21, 128, 61, 0.12)',
  'landing-warning': '#a16207',
  'landing-warning-soft': 'rgba(161, 98, 7, 0.14)',
  'landing-muted-soft': 'rgba(71, 85, 105, 0.14)',
  'landing-shadow': '0 24px 80px rgba(15, 23, 42, 0.08)',
  'landing-radius-xl': '28px',
  'landing-radius-lg': '20px',
  'landing-radius-md': '16px',
};

const layout = {
  NODE_W: 288,
  NODE_H_COLLAPSED: 200,
  NODE_H_THUMB: 262,
  GAP_L1_X: 80,
  GAP_STACK_Y: 56,
  INDENT_X: 40,
  BUS_Y_GAP: 80,
  ORPHAN_GROUP_GAP: 160,
  STROKE_PAD_X: 20,
  ROOT_Y: 0,
};

const border = {
  width: {
    none: '0px',
    subtle: '1px',
    strong: '2px',
  },
  radius,
};

function parsePixelValue(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/);
  if (!match) return null;
  return Number(match[1]);
}

function collectUnitScale() {
  const values = new Set([0, 1, 2]);

  const add = (candidate) => {
    const numeric = parsePixelValue(candidate);
    if (numeric == null) return;
    if (numeric < 0 || numeric > 200) return;
    values.add(numeric);
  };

  Object.values(spacing).forEach(add);
  Object.values(radius).forEach(add);
  Object.values(border.width).forEach(add);
  Object.values(layout).forEach((value) => {
    if (typeof value === 'number' && value <= 80) values.add(value);
  });

  const buttonHeights = [32, 40, 48];
  buttonHeights.forEach((value) => values.add(value));

  for (const groupValues of Object.values(typography)) {
    for (const token of Object.values(groupValues)) {
      if (typeof token.figmaSize === 'number') values.add(token.figmaSize);
      add(token.lineHeight);
    }
  }

  return Array.from(values)
    .sort((left, right) => left - right)
    .reduce((accumulator, value) => {
      accumulator[String(value)] = value;
      return accumulator;
    }, {});
}

const unitScale = collectUnitScale();

const typePrimitives = {
  family: {
    sans: 'Sora',
  },
  size: {
    '2xs': 10,
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
    '4xl': 48,
    '5xl': 72,
  },
  lineHeight: {
    '12': 12,
    '14': 14,
    '16': 16,
    '20': 20,
    '24': 24,
    '26': 26,
    '30': 30,
    '32': 32,
    '40': 40,
    '48': 48,
    compact: '1.02',
    relaxed: '1.08',
  },
  weight: {
    regular: 400,
    medium: 500,
    semiBold: 600,
    bold: 700,
  },
  tracking: {
    tightXl: '-0.04em',
    tightLg: '-0.03em',
    tightMd: '-0.02em',
    tightSm: '-0.01em',
    none: '0',
    wide: '0.04em',
  },
};

const typeSemantic = typography;

const runtimeColorTokens = {
  'ui-page-depth-1': runtimePalettes.pageDepthPalette[0],
  'ui-page-depth-2': runtimePalettes.pageDepthPalette[1],
  'ui-page-depth-3': runtimePalettes.pageDepthPalette[2],
  'ui-page-depth-4': runtimePalettes.pageDepthPalette[3],
  'ui-page-depth-5': runtimePalettes.pageDepthPalette[4],
  'ui-page-depth-6': runtimePalettes.pageDepthPalette[5],
  'ui-connection-userflow': runtimePalettes.connectionPalette.userFlows,
  'ui-connection-crosslink': runtimePalettes.connectionPalette.crossLinks,
  'ui-connection-broken': 'var(--color-red-300)',
};

const figmaCollections = {
  colorPrimitives: { name: 'Color - Primitives', modes: ['Value'] },
  colorSemantic: { name: 'Color - Semantic', modes: ['Light', 'Dark'] },
  runtimeMap: { name: 'Runtime - Map', modes: ['Value'] },
  spacing: { name: 'Spacing', modes: ['Value'] },
  border: { name: 'Border', modes: ['Value'] },
  unitScale: { name: 'Unit Scale', modes: ['Value'] },
  typePrimitives: { name: 'Type - Primitives', modes: ['Value'] },
  typeSemantic: { name: 'Type - Semantic', modes: ['Desktop', 'Mobile'] },
};

const semanticColorNames = {
  'ui-color-primary': 'Content/Brand/Primary',
  'ui-color-primary-hover': 'Content/Brand/Hover',
  'ui-color-danger': 'Content/Danger/Primary',
  'ui-color-danger-hover': 'Content/Danger/Hover',
  'ui-button-brand-fill': 'Button/Brand/Primary/Default',
  'ui-button-brand-fill-hover': 'Button/Brand/Primary/Hover',
  'ui-button-brand-fill-disabled': 'Button/Brand/Primary/Disabled',
  'ui-button-brand-contrast': 'Button/Brand/Primary/Foreground',
  'ui-button-brand-quiet': 'Button/Brand/Secondary/Default',
  'ui-button-brand-quiet-hover': 'Button/Brand/Secondary/Hover',
  'ui-button-brand-quiet-disabled': 'Button/Brand/Secondary/Disabled',
  'ui-button-mono-fill': 'Button/Mono/Primary/Default',
  'ui-button-mono-fill-hover': 'Button/Mono/Primary/Hover',
  'ui-button-mono-fill-disabled': 'Button/Mono/Primary/Disabled',
  'ui-button-mono-contrast': 'Button/Mono/Primary/Foreground',
  'ui-button-mono-quiet': 'Button/Mono/Secondary/Default',
  'ui-button-mono-quiet-hover': 'Button/Mono/Secondary/Hover',
  'ui-button-mono-quiet-disabled': 'Button/Mono/Secondary/Disabled',
  'ui-button-danger-fill': 'Button/Danger/Primary/Default',
  'ui-button-danger-fill-hover': 'Button/Danger/Primary/Hover',
  'ui-button-danger-fill-disabled': 'Button/Danger/Primary/Disabled',
  'ui-button-danger-contrast': 'Button/Danger/Primary/Foreground',
  'ui-button-danger-quiet': 'Button/Danger/Secondary/Default',
  'ui-button-danger-quiet-hover': 'Button/Danger/Secondary/Hover',
  'ui-button-danger-quiet-disabled': 'Button/Danger/Secondary/Disabled',
  'ui-color-surface': 'Surface/App/Default',
  'ui-color-surface-muted': 'Surface/App/Subtle',
  'ui-color-border': 'Border/App/Subtle',
  'ui-color-border-strong': 'Border/App/Strong',
  'ui-color-text': 'Content/App/Primary',
  'ui-color-muted': 'Content/App/Secondary',
  'ui-color-input-bg': 'Surface/Input/Default',
  'ui-color-input-placeholder': 'Content/Input/Placeholder',
  'ui-input-brand-border': 'Input/Brand/Border/Default',
  'ui-input-brand-border-hover': 'Input/Brand/Border/Hover',
  'ui-input-brand-border-focus': 'Input/Brand/Border/Focus',
  'ui-input-mono-border': 'Input/Mono/Border/Default',
  'ui-input-mono-border-hover': 'Input/Mono/Border/Hover',
  'ui-input-mono-border-focus': 'Input/Mono/Border/Focus',
  'ui-input-error-border': 'Input/Error/Border/Default',
  'ui-input-error-border-hover': 'Input/Error/Border/Hover',
  'ui-input-disabled-bg': 'Input/Disabled/Surface',
  'ui-input-disabled-border': 'Input/Disabled/Border',
  'ui-input-disabled-text': 'Input/Disabled/Content',
  'ui-icon-default': 'Content/Icon/Default',
  'ui-icon-muted': 'Content/Icon/Muted',
  'ui-icon-brand': 'Content/Icon/Brand',
  'ui-icon-danger': 'Content/Icon/Danger',
  'ui-icon-inverse': 'Content/Icon/Inverse',
  'ui-input-icon': 'Input/Icon/Default',
  'ui-input-icon-active': 'Input/Icon/Active',
  'ui-color-icon-hover': 'Surface/Icon/Hover',
  'ui-color-accent-soft': 'Surface/Accent/Soft',
  'ui-color-accent-soft-border': 'Border/Accent/Soft',
  'ui-canvas-scrim': 'Surface/Canvas/Scrim',
  'ui-route-gate-surface': 'Surface/Route Gate/Default',
  'ui-route-gate-warning-surface': 'Surface/Route Gate/Warning',
  'ui-selection-highlight-border': 'Selection/Border/Default',
  'ui-selection-highlight-bg': 'Selection/Surface/Default',
  'ui-selection-highlight-inset': 'Selection/Inset/Default',
  'ui-status-warning-bg': 'Status/Warning/Surface',
  'ui-status-warning-border': 'Status/Warning/Border',
  'ui-status-warning-text': 'Status/Warning/Content',
  'ui-status-warning-icon': 'Status/Warning/Icon',
  'ui-status-info-bg': 'Status/Info/Surface',
  'ui-status-info-border': 'Status/Info/Border',
  'ui-status-info-text': 'Status/Info/Content',
  'ui-status-info-icon': 'Status/Info/Icon',
  'ui-status-success-bg': 'Status/Success/Surface',
  'ui-status-success-border': 'Status/Success/Border',
  'ui-status-success-text': 'Status/Success/Content',
  'ui-status-success-icon': 'Status/Success/Icon',
  'ui-status-danger-bg': 'Status/Danger/Surface',
  'ui-status-danger-border': 'Status/Danger/Border',
  'ui-status-danger-text': 'Status/Danger/Content',
  'ui-status-danger-icon': 'Status/Danger/Icon',
  'ui-tag-bg': 'Tag/Default/Surface',
  'ui-tag-border': 'Tag/Default/Border',
  'ui-tag-text': 'Tag/Default/Content',
  'ui-tag-icon': 'Tag/Default/Icon',
  'ui-node-badge-bg': 'Node/Badge/Surface',
  'ui-node-badge-border': 'Node/Badge/Border',
  'ui-node-badge-text': 'Node/Badge/Content',
  'ui-node-status-new-bg': 'Node/Status/New/Surface',
  'ui-node-status-new-border': 'Node/Status/New/Border',
  'ui-node-status-new-text': 'Node/Status/New/Content',
  'ui-node-status-to-move-bg': 'Node/Status/To Move/Surface',
  'ui-node-status-to-move-border': 'Node/Status/To Move/Border',
  'ui-node-status-to-move-text': 'Node/Status/To Move/Content',
  'ui-node-status-moved-bg': 'Node/Status/Moved/Surface',
  'ui-node-status-moved-border': 'Node/Status/Moved/Border',
  'ui-node-status-moved-text': 'Node/Status/Moved/Content',
  'ui-node-status-to-delete-bg': 'Node/Status/To Delete/Surface',
  'ui-node-status-to-delete-border': 'Node/Status/To Delete/Border',
  'ui-node-status-to-delete-text': 'Node/Status/To Delete/Content',
  'ui-node-status-deleted-bg': 'Node/Status/Deleted/Surface',
  'ui-node-status-deleted-border': 'Node/Status/Deleted/Border',
  'ui-node-status-deleted-text': 'Node/Status/Deleted/Content',
  'ui-node-status-note-bg': 'Node/Status/Note/Surface',
  'ui-node-status-note-border': 'Node/Status/Note/Border',
  'ui-node-status-note-text': 'Node/Status/Note/Content',
  'ui-comment-badge-bg': 'Node/Comment Badge/Surface',
  'ui-comment-badge-hover': 'Node/Comment Badge/Hover',
  'ui-comment-badge-text': 'Node/Comment Badge/Content',
  'ui-connection-map-default': 'Connection/Map/Default',
  'ui-connection-userflow': 'Connection/User Flow/Default',
  'ui-connection-crosslink': 'Connection/Crosslink/Default',
  'ui-connection-broken': 'Connection/Map/Broken/Default',
  'ui-inline-badge-bg': 'Badge/Inline/Surface',
  'ui-inline-badge-text': 'Badge/Inline/Content',
  'ui-overlay-shadow': 'Effect/Shadow/Overlay',
  'ui-focus-ring': 'Effect/Focus/Ring',
  'shadow-soft': 'Effect/Shadow/Soft',
  'shadow-strong': 'Effect/Shadow/Strong',
  'shadow-rgb': 'Effect/Shadow/Rgb/Base',
  'shadow-rgb-deep': 'Effect/Shadow/Rgb/Deep',
  'modal-bg': 'Surface/Modal/Default',
  'modal-overlay-bg': 'Surface/Modal/Backdrop',
  'modal-shadow': 'Effect/Shadow/Modal',
  'modal-card-bg': 'Surface/Modal Card/Default',
  'modal-card-bg-hover': 'Surface/Modal Card/Hover',
  'modal-card-border': 'Border/Modal Card/Default',
  'feedback-tab-bg': 'Surface/Feedback Tab/Default',
  'feedback-tab-bg-hover': 'Surface/Feedback Tab/Hover',
  'feedback-tab-border': 'Border/Feedback Tab/Default',
  'feedback-tab-text': 'Content/Feedback Tab/Primary',
  'feedback-tab-icon': 'Content/Feedback Tab/Icon',
  'feedback-tab-shadow': 'Effect/Shadow/Feedback Tab',
  'feedback-tab-shadow-hover': 'Effect/Shadow/Feedback Tab Hover',
};

const runtimeColorNames = {
  'ui-page-depth-1': 'Page Depth/Level 1',
  'ui-page-depth-2': 'Page Depth/Level 2',
  'ui-page-depth-3': 'Page Depth/Level 3',
  'ui-page-depth-4': 'Page Depth/Level 4',
  'ui-page-depth-5': 'Page Depth/Level 5',
  'ui-page-depth-6': 'Page Depth/Level 6',
  'ui-connection-userflow': 'Connection/User Flow',
  'ui-connection-crosslink': 'Connection/Crosslink',
  'ui-connection-broken': 'Connection/Broken',
};

function setNestedValue(target, path, value) {
  const parts = path.split('/');
  let cursor = target;

  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      cursor[part] = value;
      return;
    }

    if (!cursor[part]) {
      cursor[part] = {};
    }

    cursor = cursor[part];
  });
}

function buildSemanticColorVariables() {
  const semanticVariables = {};
  const allKeys = new Set([
    ...Object.keys(appSemantics.light),
    ...Object.keys(appSemantics.dark),
  ]);

  for (const legacyName of allKeys) {
    const semanticName = semanticColorNames[legacyName];
    if (!semanticName) {
      throw new Error(`Missing semantic color name mapping for ${legacyName}`);
    }

    semanticVariables[semanticName] = {
      light: appSemantics.light[legacyName],
      dark: appSemantics.dark[legacyName] ?? appSemantics.light[legacyName],
      source: legacyName,
    };
  }

  return semanticVariables;
}

function buildSemanticColorTree() {
  const semanticTree = {};

  for (const [semanticName, value] of Object.entries(buildSemanticColorVariables())) {
    setNestedValue(semanticTree, semanticName, value);
  }

  return semanticTree;
}

const semanticColorVariables = buildSemanticColorVariables();
const semanticColors = buildSemanticColorTree();

function resolvePrimitiveFamilyAlias(family) {
  return colorAliases.family?.[family] || family;
}

function resolvePrimitiveTokenAlias(family, token) {
  return colorAliases.token?.[family]?.[token] || token;
}

function normalizePrimitiveColorTokenName(cssValue) {
  if (typeof cssValue !== 'string') return null;

  const varMatch = cssValue.trim().match(/^var\(--color-([a-z]+)-([a-z0-9-]+)\)$/);
  if (varMatch) {
    const canonicalFamily = resolvePrimitiveFamilyAlias(varMatch[1]);
    const canonicalToken = resolvePrimitiveTokenAlias(canonicalFamily, varMatch[2]);
    if (primitiveColors[canonicalFamily]?.[canonicalToken] !== undefined) {
      return `${canonicalFamily}/${canonicalToken}`;
    }
  }

  const normalizedValue = cssValue.trim().toLowerCase();
  for (const [family, scale] of Object.entries(primitiveColors)) {
    for (const [token, value] of Object.entries(scale)) {
      if (String(value).trim().toLowerCase() === normalizedValue) {
        return `${family}/${token}`;
      }
    }
  }

  return null;
}

function buildSemanticColorBindings() {
  return Object.fromEntries(
    Object.entries(semanticColorVariables).map(([semanticName, value]) => [
      semanticName,
      {
        source: value.source,
        lightAlias: normalizePrimitiveColorTokenName(value.light),
        darkAlias: normalizePrimitiveColorTokenName(value.dark),
        lightValue: value.light,
        darkValue: value.dark,
      },
    ])
  );
}

const semanticColorBindings = buildSemanticColorBindings();

function buildRuntimeColorVariables() {
  return Object.fromEntries(
    Object.entries(runtimeColorTokens).map(([sourceName, value]) => {
      const runtimeName = runtimeColorNames[sourceName];
      if (!runtimeName) {
        throw new Error(`Missing runtime color name mapping for ${sourceName}`);
      }

      return [
        runtimeName,
        {
          value,
          source: sourceName,
        },
      ];
    })
  );
}

function buildRuntimeColorTree() {
  const runtimeTree = {};

  for (const [runtimeName, value] of Object.entries(buildRuntimeColorVariables())) {
    setNestedValue(runtimeTree, runtimeName, value);
  }

  return runtimeTree;
}

const runtimeColorVariables = buildRuntimeColorVariables();
const runtimeColors = buildRuntimeColorTree();

function buildRuntimeColorBindings() {
  return Object.fromEntries(
    Object.entries(runtimeColorVariables).map(([runtimeName, value]) => [
      runtimeName,
      {
        source: value.source,
        alias: normalizePrimitiveColorTokenName(value.value),
        value: value.value,
      },
    ])
  );
}

const runtimeColorBindings = buildRuntimeColorBindings();

const components = [
  {
    name: 'Avatar',
    kind: 'primitive',
    source: 'frontend/src/components/ui/Avatar.js',
    props: {
      src: 'string',
      label: 'string',
      icon: 'node',
      size: ['xs', 'sm', 'md', 'lg', 'xl'],
      shape: ['circle', 'rounded'],
      tone: ['0', '1', '2', '3'],
      bordered: 'boolean',
    },
    states: ['image', 'fallback label', 'fallback icon'],
  },
  {
    name: 'Icon',
    kind: 'primitive',
    source: 'frontend/src/components/ui/Icon.js',
    props: {
      icon: 'node',
      size: ['xs', 'sm', 'md', 'lg', 'xl'],
      tone: ['inherit', 'default', 'muted', 'brand', 'danger', 'inverse'],
    },
    states: ['rest'],
  },
  {
    name: 'Button',
    kind: 'primitive',
    source: 'frontend/src/components/ui/Button.js',
    props: {
      type: ['primary', 'secondary', 'ghost', 'link'],
      style: ['brand', 'mono', 'danger'],
      variant: 'legacy alias: primary | secondary | danger | ghost',
      size: ['sm', 'md', 'lg'],
      label: 'string',
      startIcon: 'node',
      endIcon: 'node',
      iconOnly: 'boolean',
      htmlType: 'native button type override',
      loading: 'boolean',
      disabled: 'native button prop',
    },
    states: ['rest', 'hover', 'focus-visible', 'disabled', 'loading'],
  },
  {
    name: 'IconButton',
    kind: 'primitive',
    source: 'frontend/src/components/ui/IconButton.js',
    props: {
      type: ['primary', 'secondary', 'ghost', 'link'],
      style: ['brand', 'mono', 'danger'],
      variant: 'legacy alias: default | primary | danger | ghost',
      size: ['sm', 'md', 'lg'],
      icon: 'node',
      label: 'string',
      htmlType: 'native button type override',
      loading: 'boolean',
    },
    states: ['rest', 'hover', 'focus-visible', 'disabled', 'loading'],
  },
  {
    name: 'MenuItem',
    kind: 'primitive',
    source: 'frontend/src/components/ui/Menu.js',
    props: {
      icon: 'node',
      label: 'string',
      description: 'string',
      badge: 'node',
      endSlot: 'node',
      selected: 'boolean',
      danger: 'boolean',
      disabled: 'boolean',
    },
    states: ['rest', 'hover', 'selected', 'focus-visible', 'disabled'],
  },
  {
    name: 'MenuSectionHeader',
    kind: 'primitive',
    source: 'frontend/src/components/ui/Menu.js',
    props: {
      children: 'string',
    },
    states: ['rest', 'dark theme'],
  },
  {
    name: 'TextInput',
    kind: 'form',
    source: 'frontend/src/components/ui/TextInput.js',
    props: {
      size: ['sm', 'md', 'lg'],
      inputStyle: ['brand', 'mono'],
      invalid: 'boolean',
      label: 'string',
      labelHidden: 'boolean',
      hint: 'string',
      error: 'string',
      leftIcon: 'node',
      rightIcon: 'node',
      placeholder: 'string',
      framed: 'boolean',
    },
    states: ['rest', 'hover', 'focus', 'invalid', 'disabled via native input props'],
  },
  {
    name: 'SelectInput',
    kind: 'form',
    source: 'frontend/src/components/ui/SelectInput.js',
    props: {
      size: ['sm', 'md', 'lg'],
      inputStyle: ['brand', 'mono'],
      invalid: 'boolean',
      label: 'string',
      labelHidden: 'boolean',
      hint: 'string',
      error: 'string',
      leftIcon: 'node',
      placeholder: 'native select placeholder option',
    },
    states: ['rest', 'hover', 'focus', 'invalid', 'disabled via native select props'],
    notes: ['Native select implementation does not expose a shared expanded menu state.'],
  },
  {
    name: 'TextareaInput',
    kind: 'form',
    source: 'frontend/src/components/ui/TextareaInput.js',
    props: {
      size: ['sm', 'md', 'lg'],
      invalid: 'boolean',
    },
    states: ['rest', 'focus', 'invalid', 'disabled via native textarea props'],
  },
  {
    name: 'Field',
    kind: 'form-shell',
    source: 'frontend/src/components/ui/Field.js',
    props: {
      label: 'string',
      labelHidden: 'boolean',
      htmlFor: 'string',
      required: 'boolean',
      hint: 'string',
      error: 'string',
    },
    subparts: ['FieldLabel', 'FieldHint', 'FieldError'],
  },
  {
    name: 'CheckboxField',
    kind: 'selection',
    source: 'frontend/src/components/ui/CheckboxField.js',
    props: {
      label: 'string',
      description: 'string',
      disabled: 'boolean',
      indeterminate: 'boolean',
    },
    states: ['unchecked', 'checked', 'indeterminate', 'focus-visible', 'disabled'],
  },
  {
    name: 'ToggleSwitch',
    kind: 'selection',
    source: 'frontend/src/components/ui/ToggleSwitch.js',
    props: {
      label: 'string',
      description: 'string',
      disabled: 'boolean',
    },
    states: ['off', 'on', 'focus-visible', 'disabled'],
  },
  {
    name: 'RadioCardGroup',
    kind: 'selection',
    source: 'frontend/src/components/ui/RadioCardGroup.js',
    props: {
      options: 'array of { value, label, description?, icon?, disabled? }',
      value: 'selected option value',
      name: 'string',
    },
    states: ['rest', 'hover', 'selected', 'focus-visible', 'disabled'],
  },
  {
    name: 'SegmentedControl',
    kind: 'choice',
    source: 'frontend/src/components/ui/SegmentedControl.js',
    props: {
      variant: ['pill', 'tabs', 'grid'],
      size: ['sm', 'md'],
      fullWidth: 'boolean',
      options: 'array of { value, label, icon?, disabled? }',
      optionRole: ['tab'],
    },
    states: ['rest', 'hover', 'active', 'focus-visible', 'disabled'],
  },
  {
    name: 'OptionCard',
    kind: 'choice',
    source: 'frontend/src/components/ui/OptionCard.js',
    props: {
      title: 'string',
      description: 'string',
      icon: 'node',
      badge: 'node',
      disabled: 'native button prop',
    },
    states: ['rest', 'hover', 'focus-visible', 'disabled'],
  },
  {
    name: 'Modal',
    kind: 'shell',
    source: 'frontend/src/components/ui/Modal.js',
    props: {
      size: ['sm', 'md', 'lg'],
      subtitle: 'string',
      scrollable: 'boolean',
      hideCloseButton: 'boolean',
      footer: 'node',
    },
    states: ['open', 'dark theme'],
  },
  {
    name: 'AccountDrawer',
    kind: 'shell',
    source: 'frontend/src/components/drawers/AccountDrawer.js',
    props: {
      title: 'string',
      subtitle: 'string',
      icon: 'node',
      actions: 'node',
      bodyRef: 'ref',
      onBodyScroll: 'function',
    },
    states: ['open', 'closing', 'dark theme'],
  },
  {
    name: 'ScanBar',
    kind: 'shared-surface',
    source: 'frontend/src/components/scan/ScanBar.js',
    props: {
      canEdit: 'boolean',
      urlInput: 'string',
      showOptions: 'boolean',
      showClearUrl: 'boolean',
      scanDisabled: 'boolean',
      sharedTitle: 'string',
    },
    states: ['rest', 'focus', 'options open', 'scan disabled', 'read-only title'],
  },
  {
    name: 'Topbar',
    kind: 'shared-surface',
    source: 'frontend/src/components/toolbar/Topbar.js',
    props: {
      title: 'string',
      urlInput: 'string',
      authenticated: 'boolean',
      collaborators: 'array',
    },
    states: ['default', 'signed out', 'account menu open', 'dark theme'],
  },
  {
    name: 'AccountMenu',
    kind: 'shared-surface',
    source: 'frontend/src/components/toolbar/Topbar.js',
    props: {
      pendingInviteCount: 'number',
      pendingAccessRequestCount: 'number',
      isOpen: 'boolean',
    },
    states: ['closed', 'open', 'section headers', 'item hover', 'dark theme'],
  },
  {
    name: 'InlineBadge',
    kind: 'shared-surface',
    source: 'frontend/src/components/ui/InlineBadge.js',
    props: {
      label: 'string',
    },
    states: ['rest', 'dark theme'],
  },
  {
    name: 'Tag',
    kind: 'shared-surface',
    source: 'frontend/src/components/ui/Tag.js',
    props: {
      label: 'string',
      startIcon: 'icon',
      endIcon: 'icon',
    },
    states: ['rest', 'dark theme'],
  },
  {
    name: 'NodeMenu',
    kind: 'shared-surface',
    source: 'frontend/src/App.js',
    props: {
      nodeId: 'string',
      activeStatus: 'annotation state',
    },
    states: ['open', 'active row', 'clear action hover', 'dark theme'],
  },
  {
    name: 'NodeCard',
    kind: 'shared-surface',
    source: 'frontend/src/components/nodes/NodeCard.js',
    props: {
      showThumbnails: 'boolean',
      showCommentBadges: 'boolean',
      showPageNumbers: 'boolean',
      showAnnotations: 'boolean',
      isGhosted: 'boolean',
      isSelected: 'boolean',
      stackInfo: 'object',
    },
    states: ['collapsed', 'with thumbnail', 'selected', 'ghosted', 'deleted', 'dark theme'],
  },
  {
    name: 'NodeBadge',
    kind: 'shared-surface',
    source: 'frontend/src/components/nodes/NodeBadge.js',
    props: {
      label: 'string',
    },
    states: ['rest', 'dark theme'],
  },
  {
    name: 'NodeStatusBadge',
    kind: 'shared-surface',
    source: 'frontend/src/components/nodes/NodeStatusBadge.js',
    props: {
      status: ['new', 'to_move', 'moved', 'to_delete', 'deleted', 'note'],
      label: 'string',
      note: 'boolean',
    },
    states: ['new', 'to_move', 'moved', 'to_delete', 'deleted', 'note', 'dark theme'],
  },
  {
    name: 'CommentBadge',
    kind: 'shared-surface',
    source: 'frontend/src/components/nodes/CommentBadge.js',
    props: {
      count: 'number',
    },
    states: ['rest', 'hover', 'icon only', 'dark theme'],
  },
];

const omittedDueToAmbiguity = [
  'Admin console pills, tabs, and table presentation remain page-specific.',
  'Canvas connector layout logic and minimap internals are still product-level systems rather than shared primitives.',
  'Landing-only section compositions remain part of the marketing track rather than the shared app component library.',
];

module.exports = {
  COLOR_STEPS,
  colorAliases,
  primitiveColors,
  spacing,
  icon,
  unitScale,
  border,
  radius,
  elevation,
  typePrimitives,
  typeSemantic,
  typography,
  appSemantics,
  semanticColorNames,
  semanticColorVariables,
  semanticColorBindings,
  semanticColors,
  runtimeColorNames,
  runtimeColorVariables,
  runtimeColorBindings,
  runtimeColors,
  runtimeColorTokens,
  landing,
  layout,
  runtimePalettes,
  figmaCollections,
  components,
  omittedDueToAmbiguity,
};

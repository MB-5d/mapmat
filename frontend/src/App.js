import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  Loader2,
  MessageSquare,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';

import './App.css';
import * as api from './api';
import createIllustrationDark from './assets/home/create-illustration-dark.png';
import createIllustration from './assets/home/create-illustration.png';
import modifyIllustrationDark from './assets/home/modify-illustration-dark.png';
import modifyIllustration from './assets/home/modify-illustration.png';
import uploadIllustrationDark from './assets/home/upload-illustration-dark.png';
import uploadIllustration from './assets/home/upload-illustration.png';
import MapSurfaceV2 from './components/canvas/MapSurfaceV2';
import { DraggableNodeCard, DragOverlayTree } from './components/nodes/NodeCard';
import CommentPopover from './components/comments/CommentPopover';
import CommentsPanel from './components/comments/CommentsPanel';
import FeedbackWidget from './components/feedback/FeedbackWidget';
import InviteAcceptGate from './components/routes/InviteAcceptGate';
import MapAccessGate from './components/routes/MapAccessGate';
import AuthModal from './components/modals/AuthModal';
import CreateMapModal from './components/modals/CreateMapModal';
import DeleteConfirmModal from './components/modals/DeleteConfirmModal';
import EditNodeModal from './components/modals/EditNodeModal';
import EditColorModal from './components/modals/EditColorModal';
import ExportModal from './components/modals/ExportModal';
import HistoryModal from './components/modals/HistoryModal';
import ImageOverlay from './components/modals/ImageOverlay';
import ImportModal from './components/modals/ImportModal';
import AccessRequestInboxModal from './components/modals/AccessRequestInboxModal';
import InviteInboxModal from './components/modals/InviteInboxModal';
import WelcomeModal from './components/modals/WelcomeModal';
import ProfileDrawer from './components/drawers/ProfileDrawer';
import SettingsDrawer from './components/drawers/SettingsDrawer';
import VersionHistoryDrawer from './components/drawers/VersionHistoryDrawer';
import ProjectsModal from './components/modals/ProjectsModal';
import PromptModal from './components/modals/PromptModal';
import ImageReportDrawer from './components/reports/ImageReportDrawer';
import ReportDrawer from './components/reports/ReportDrawer';
import SaveMapModal from './components/modals/SaveMapModal';
import ShareModal from './components/modals/ShareModal';
import ScanBar from './components/scan/ScanBar';
import ScanProgressModal from './components/scan/ScanProgressModal';
import VersionEditPromptModal from './components/modals/VersionEditPromptModal';
import Button from './components/ui/Button';
import Avatar from './components/ui/Avatar';
import { MenuDivider, MenuItem, MenuPanel, MenuSectionHeader } from './components/ui/Menu';
import Modal from './components/ui/Modal';
import StatusAlert from './components/ui/StatusAlert';
import Toast from './components/ui/Toast';
import ColorKey from './components/toolbar/ColorKey';
import LayersPanel from './components/toolbar/LayersPanel';
import RightRail from './components/toolbar/RightRail';
import CanvasMapHeader from './components/toolbar/CanvasMapHeader';
import Topbar from './components/toolbar/Topbar';
import { getHostname, isRenderableTextUrl } from './utils/url';
import { getNodeHttpErrorLabel, isVirtualMissingNode } from './utils/scanStatus';
import {
  APP_ONLY_MODE,
  API_BASE,
  DEFAULT_COLORS,
  DEFAULT_CONNECTION_COLORS,
  getDepthColor,
  ACCESS_LEVELS,
  SCAN_MESSAGES,
  REPORT_TYPE_OPTIONS,
  ANNOTATION_STATUS_OPTIONS,
  LAYOUT,
  TESTER_NOT_READY_MESSAGE,
} from './utils/constants';
import {
  findMapNameConflict,
  getMapNameConflictMessage,
} from './utils/mapNameConflicts';
import { sanitizeUrl, downloadText, clamp } from './utils/helpers';
import {
  buildExpandedStackMap,
  getMaxDepth,
  countNodes,
  findNodeById,
  findParent,
  isDescendantOf,
  shouldStackChildren,
  checkLayoutInvariants,
} from './utils/treeUtils';
import {
  buildReportEntries,
  comparePageNumbers,
} from './utils/reportUtils';
import { getSeoValue } from './utils/seoMetadata';
import {
  parseXmlSitemap,
  parseRssAtom,
  parseHtml,
  parseCsv,
  parseMarkdown,
  parsePlainText,
  buildTreeFromUrls,
} from './utils/importParsers';
import { computeLayout, getNodeH } from './layout/computeLayout';
import { AuthProvider } from './contexts/AuthContext';
import { useConsent } from './contexts/ConsentContext';
import { useCoeditingLive, COEDITING_LIVE_STATUS } from './hooks/useCoeditingLive';
import {
  ROUTE_SURFACES,
  MAP_ORIENTATIONS,
  buildRouteUrl,
  createAppHomeRoute,
  createAccessRequestsRoute,
  createInviteInboxRoute,
  createMapRoute,
  createShareRoute,
  normalizeMapOrientation,
} from './utils/appRoutes';
import {
  getCollapsedScanMessage,
  shouldPreserveExistingMapForCollapsedScan,
} from './utils/scanCompletion';
import {
  clearAnalyticsUser,
  identifyAnalyticsUser,
  trackEvent,
} from './utils/analytics';
import {
  buildCaptureIssueFromResult,
  formatImageCaptureCompletionToast,
  getReconciledCaptureProgress,
  normalizeCaptureIssue,
  shouldShowImageCaptureProgressToast,
} from './utils/captureIssues';
import {
  countVisibleThumbnails,
  filterVisibleLayoutConnectors,
  filterVisibleLayoutNodes,
  getCanvasViewportWorldBounds,
  isDataImageUrl,
  shouldRenderConnectionForVisibleNodes,
} from './utils/canvasPerformance';
import {
  countMapNodes as countLargeMapNodes,
  shouldUseLargeMapSurface,
} from './utils/largeMapPerformance';
const treeMoveUtils = require('./utils/treeMoveUtils');

const MODIFY_AUTH_CONTEXT_MESSAGE = 'Log in or sign up to select and modify maps.';
const GOOGLE_AUTH_MESSAGE_TYPE = 'vellic:google-auth';
const GOOGLE_AUTH_STORAGE_KEY = 'vellic:google-auth:result';
const {
  DEFAULT_ORPHAN_CONTAINER_ID,
  DEFAULT_SUBDOMAIN_CONTAINER_ID,
  applyBranchMoveToMap,
  collectNodeIds: collectBranchNodeIds,
  getBranchMoveBlockReason,
} = treeMoveUtils;

function getImageCaptureJobErrorMessage(error, fallback = 'Image capture failed') {
  const message = String(error?.message || error?.error || '').trim();
  if (error?.code === 'IMAGE_CAPTURE_JOB_ACTIVE' || error?.payload?.code === 'IMAGE_CAPTURE_JOB_ACTIVE') {
    return 'A previous image capture is still finishing. Wait a moment, then retry.';
  }
  if (/unknown job type:\s*image_capture/i.test(message)) {
    return 'Screenshot capture did not start because staging is still updating. Refresh in a minute and retry.';
  }
  return message || fallback;
}

// ============================================================================
// SITEMAP TREE COMPONENT (Deterministic Layout with Absolute Positioning)
// ============================================================================
// Layout engine extracted to layout/computeLayout.js

const MIN_SCALE = 0.05;
const MAX_SCALE = 4;
const INTERACTIVE_MIN_SCALE = 0.1;
const CANVAS_EDGE_PADDING_MAX = 400;
const CANVAS_NODE_OVERSCAN_PX = 1200;
const CANVAS_PERF_PROBE_INTERVAL_MS = 2000;
const CANVAS_TRANSFORM_COMMIT_IDLE_MS = 120;
const FOCUS_NODE_MAX_ATTEMPTS = 14;
const FOCUS_NODE_RETRY_MS = 160;

const getExpandedStackIds = (expandedStacks = {}) => (
  Object.entries(expandedStacks || {})
    .filter(([, expanded]) => !!expanded)
    .map(([id]) => id)
    .filter(Boolean)
    .sort()
);

const clampCanvasPanAxis = (value, min, max) => {
  if (min <= max) return Math.max(min, Math.min(max, value));
  return Math.max(max, Math.min(min, value));
};

const getCanvasGridMetrics = (scaleValue) => {
  const canvasGridScale = scaleValue || 1;
  return {
    size: Math.max(4, Math.round(16 * canvasGridScale)),
    dotRadius: canvasGridScale < 0.5 ? 0.25 : (canvasGridScale > 2 ? 1 : 0.75),
  };
};

const waitForNextPaint = () => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
});

const parseEnvBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const normalizeBriefText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const getAiExportPageType = (node = {}, fallback = 'Page') => {
  const isRenderableText = isRenderableTextUrl(node.url);
  if (node.pageType && !(isRenderableText && String(node.pageType).toLowerCase() === 'file')) return node.pageType;
  if (node.subdomainRoot) return 'Subdomain';
  if (!isRenderableText && (node.isFile || node.orphanType === 'file')) return 'File';
  if (isVirtualMissingNode(node)) return 'Missing';
  if (node.isDuplicate) return 'Duplicate';
  if (node.isBroken || node.orphanType === 'broken') return 'Broken';
  if (node.orphanType === 'orphan') return 'Orphan';
  return fallback;
};

const buildAiExportRows = (rootNode, orphanNodes = []) => {
  const rows = [];

  const visit = (node, number, depth, section) => {
    if (!node) return;
    const annotations = node.annotations || {};
    rows.push({
      id: node.id || '',
      number,
      depth,
      section,
      title: normalizeBriefText(node.title) || 'Untitled',
      url: normalizeBriefText(node.url),
      pageType: getAiExportPageType(node, section === 'orphan' ? 'Orphan' : 'Page'),
      description: getSeoValue(node, 'description'),
      metaKeywords: getSeoValue(node, 'keywords'),
      canonicalUrl: getSeoValue(node, 'canonicalUrl'),
      h1: getSeoValue(node, 'h1'),
      h2: getSeoValue(node, 'h2'),
      robots: getSeoValue(node, 'robots'),
      annotationStatus: annotations.status || 'none',
      annotationTags: Array.isArray(annotations.tags) ? annotations.tags : [],
      annotationNote: normalizeBriefText(annotations.note),
      thumbnailUrl: node.thumbnailUrl || '',
      thumbnailFullUrl: node.thumbnailFullUrl || '',
      fullScreenshotUrl: node.fullScreenshotUrl || '',
      childCount: Array.isArray(node.children) ? node.children.length : 0,
    });

    (node.children || []).forEach((child, index) => {
      visit(child, `${number}.${index + 1}`, depth + 1, section);
    });
  };

  if (rootNode) visit(rootNode, '1', 0, 'main');
  (orphanNodes || []).forEach((orphan, index) => {
    visit(orphan, `O${index + 1}`, 0, 'orphan');
  });

  return rows;
};

const buildAiSiteMapXml = (rows) => {
  const urls = rows
    .map((row) => row.url)
    .filter(Boolean)
    .filter((url, index, allUrls) => allUrls.indexOf(url) === index);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`),
    '</urlset>',
  ].join('\n');
};

const buildAiSiteBriefMarkdown = ({ hostname, mode, rows, generatedAt }) => {
  const mainRows = rows.filter((row) => row.section === 'main');
  const orphanRows = rows.filter((row) => row.section === 'orphan');
  const pageList = (list) => list.map((row) => {
    const indent = '  '.repeat(row.depth);
    const details = [
      `type: ${row.pageType}`,
      row.url ? `url: ${row.url}` : '',
      row.description ? `description: ${row.description}` : '',
      row.h1 ? `h1: ${row.h1}` : '',
      row.annotationStatus && row.annotationStatus !== 'none' ? `status: ${row.annotationStatus}` : '',
      row.annotationTags.length ? `tags: ${row.annotationTags.join(', ')}` : '',
      row.annotationNote ? `note: ${row.annotationNote}` : '',
    ].filter(Boolean).join('; ');
    return `${indent}- ${row.number}. ${row.title} (${details})`;
  }).join('\n');

  return `# AI Site Brief

Generated from Vellic for ${hostname}
Generated: ${generatedAt}
Mode: ${mode}

## How to use this with other files
- Treat this file as the site structure and information architecture brief.
- Brand guidelines, design system files, and reference images override visual style notes here.
- Copy docs or content matrices override placeholder copy or page descriptions here.
- Existing code, routes, CMS fields, analytics, SEO settings, and working behavior should be preserved unless the user explicitly asks to change them.
- If this brief conflicts with another supplied file, ask the user before choosing.

## Build instruction
Use the Vellic map to ${mode === 'Improve Existing Site' ? 'improve the existing site structure without blindly replacing the current implementation' : 'build a new site from this structure'}. Page types should guide the layout pattern for each page. Use URLs, hierarchy, SEO fields, annotations, and relationships to decide navigation, routing, redirects, and content gaps.

## Recommended IA changes
- Preserve important existing behavior unless a requested IA change requires a careful update.
- Use moved, missing, duplicate, orphan, file, subdomain, and broken-page signals as recommendations, not automatic destructive changes.
- For an existing site, propose redirects for renamed, moved, or removed URLs before changing routes.

## Main site structure
${pageList(mainRows) || '- No main pages found.'}

## Orphan, file, subdomain, or exception pages
${pageList(orphanRows) || '- None found.'}

## Companion files
- site-map.json contains the full structured map data.
- sitemap.xml contains the URL list for tools that expect XML.
- Screenshots and thumbnails are referenced in site-map.json when available.
`;
};

const buildAiSiteData = ({
  root,
  orphans,
  connections,
  colors,
  connectionColors,
  rows,
  mode,
  hostname,
  generatedAt,
}) => ({
  exportType: 'vellic-ai-site-build',
  version: 1,
  mode,
  hostname,
  generatedAt,
  instructions: {
    sourcePriority: [
      'Brand and design-system files override visual style notes.',
      'Copy docs and content matrices override placeholder copy.',
      'Reference images override visual assumptions.',
      'Vellic map data defines structure, navigation, URLs, page relationships, page types, and IA recommendations.',
      'Ask the user before choosing when supplied files conflict.',
    ],
    existingSiteSafety: 'Preserve existing design system, routes, components, CMS fields, analytics, SEO settings, and working behavior unless explicitly asked to change them.',
  },
  pages: rows,
  root,
  orphans: Array.isArray(orphans) ? orphans : [],
  connections: Array.isArray(connections) ? connections : [],
  colors,
  connectionColors,
});

const zipCrcTable = Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return c >>> 0;
});

const getZipCrc32 = (bytes) => {
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc = zipCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });
  return (crc ^ 0xffffffff) >>> 0;
};

const getZipDosTimestamp = (date = new Date()) => ({
  time: (
    (date.getHours() << 11)
    | (date.getMinutes() << 5)
    | Math.floor(date.getSeconds() / 2)
  ) & 0xffff,
  date: (
    ((date.getFullYear() - 1980) << 9)
    | ((date.getMonth() + 1) << 5)
    | date.getDate()
  ) & 0xffff,
});

const createZipPackageBlob = (files) => {
  const encoder = new TextEncoder();
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;
  const timestamp = getZipDosTimestamp();

  const pushHeader = (values) => {
    const bytes = new Uint8Array(values.length * 2);
    const view = new DataView(bytes.buffer);
    values.forEach((value, index) => view.setUint16(index * 2, value, true));
    chunks.push(bytes);
    offset += bytes.length;
  };

  files.forEach(({ path, content }) => {
    const nameBytes = encoder.encode(path);
    const dataBytes = encoder.encode(content);
    const crc = getZipCrc32(dataBytes);
    const localOffset = offset;
    const commonHeader = [
      0x0014, 0x0800, 0x0000, timestamp.time, timestamp.date,
      crc & 0xffff, crc >>> 16,
      dataBytes.length & 0xffff, dataBytes.length >>> 16,
      dataBytes.length & 0xffff, dataBytes.length >>> 16,
      nameBytes.length, 0x0000,
    ];

    pushHeader([0x4b50, 0x0403, ...commonHeader]);
    chunks.push(nameBytes, dataBytes);
    offset += nameBytes.length + dataBytes.length;

    centralDirectory.push({
      nameBytes,
      commonHeader,
      localOffset,
    });
  });

  const centralStart = offset;
  centralDirectory.forEach(({ nameBytes, commonHeader, localOffset }) => {
    pushHeader([
      0x4b50, 0x0201, 0x0014,
      ...commonHeader,
      0x0000, 0x0000, 0x0000,
      0x0000, 0x0000,
      localOffset & 0xffff, localOffset >>> 16,
    ]);
    chunks.push(nameBytes);
    offset += nameBytes.length;
  });

  const centralSize = offset - centralStart;
  pushHeader([
    0x4b50, 0x0605, 0x0000, 0x0000,
    files.length, files.length,
    centralSize & 0xffff, centralSize >>> 16,
    centralStart & 0xffff, centralStart >>> 16,
    0x0000,
  ]);

  return new Blob(chunks, { type: 'application/zip' });
};

const downloadBlob = (filename, blob) => {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
};

const COLLABORATION_UI_ENABLED = parseEnvBool(
  process.env.REACT_APP_COLLABORATION_UI_ENABLED,
  false
);
const REALTIME_BASELINE_ENABLED = parseEnvBool(
  process.env.REACT_APP_REALTIME_BASELINE_ENABLED,
  false
);

const extractCommentMentions = (text) => (
  Array.from(
    new Set((String(text || '').match(/@(\w+)/g) || []).map((mention) => mention.slice(1)))
  )
);

const COMMENT_MENTION_READ_STORAGE_PREFIX = 'vellic-comment-mentions';
const LEGACY_COMMENT_MENTION_READ_STORAGE_PREFIX = 'mapmat-comment-mentions';
const THEME_STORAGE_KEY = 'vellic-theme';
const LEGACY_THEME_STORAGE_KEY = 'mapmat-theme';
export const WELCOME_MODAL_STORAGE_KEY = 'vellic:welcome-modal-hidden:v1';
const LEGACY_WELCOME_MODAL_STORAGE_KEY = 'mapmat:welcome-modal-hidden:v1';

export const readWelcomeModalHidden = (
  storage = typeof window !== 'undefined' ? window.localStorage : null
) => {
  if (!storage) return false;
  try {
    if (storage.getItem(WELCOME_MODAL_STORAGE_KEY) === 'true') return true;
    if (storage.getItem(LEGACY_WELCOME_MODAL_STORAGE_KEY) === 'true') {
      storage.setItem(WELCOME_MODAL_STORAGE_KEY, 'true');
      storage.removeItem(LEGACY_WELCOME_MODAL_STORAGE_KEY);
      return true;
    }
    return false;
  } catch (error) {
    console.warn('Failed to load welcome modal dismissal state', error);
    return false;
  }
};

export const writeWelcomeModalHidden = (
  hidden,
  storage = typeof window !== 'undefined' ? window.localStorage : null
) => {
  if (!storage) return;
  try {
    if (hidden) {
      storage.setItem(WELCOME_MODAL_STORAGE_KEY, 'true');
      storage.removeItem(LEGACY_WELCOME_MODAL_STORAGE_KEY);
      return;
    }
    storage.removeItem(WELCOME_MODAL_STORAGE_KEY);
    storage.removeItem(LEGACY_WELCOME_MODAL_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to persist welcome modal dismissal state', error);
  }
};
const flattenCommentsForNode = (comments = [], nodeId, entries = []) => {
  (comments || []).forEach((comment) => {
    if (!comment?.id) return;
    entries.push({ comment, nodeId });
    if (Array.isArray(comment.replies) && comment.replies.length > 0) {
      flattenCommentsForNode(comment.replies, nodeId, entries);
    }
  });
  return entries;
};

const collectCommentEntriesFromTree = (node, entries = []) => {
  if (!node) return entries;
  flattenCommentsForNode(node.comments || [], node.id, entries);
  (node.children || []).forEach((child) => collectCommentEntriesFromTree(child, entries));
  return entries;
};

const buildUserMentionKeys = (user) => {
  const tokens = new Set();
  const addTokens = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return;
    tokens.add(normalized);
    normalized
      .split(/[^a-z0-9_]+/i)
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean)
      .forEach((token) => tokens.add(token));
  };

  addTokens(user?.name);
  addTokens(user?.email ? String(user.email).split('@')[0] : '');
  addTokens(user?.username);
  addTokens(user?.id);

  return tokens;
};

const getCommentMentionReadStorageKey = (user, mapKey) => {
  const userKey = String(user?.id || user?.email || user?.name || 'anonymous')
    .trim()
    .toLowerCase();
  const normalizedMapKey = String(mapKey || 'draft').trim().toLowerCase();
  return `${COMMENT_MENTION_READ_STORAGE_PREFIX}:${userKey}:${normalizedMapKey}`;
};

const getLegacyCommentMentionReadStorageKey = (user, mapKey) => {
  const userKey = String(user?.id || user?.email || user?.name || 'anonymous')
    .trim()
    .toLowerCase();
  const normalizedMapKey = String(mapKey || 'draft').trim().toLowerCase();
  return `${LEGACY_COMMENT_MENTION_READ_STORAGE_PREFIX}:${userKey}:${normalizedMapKey}`;
};

const attachCommentsToNodeTree = (node, commentsByNode) => {
  if (!node) return node;
  return {
    ...node,
    comments: Array.isArray(commentsByNode?.[node.id]) ? commentsByNode[node.id] : [],
    children: Array.isArray(node.children)
      ? node.children.map((child) => attachCommentsToNodeTree(child, commentsByNode))
      : [],
  };
};

const findCommentInThread = (comments, commentId) => {
  for (const comment of comments || []) {
    if (comment?.id === commentId) return comment;
    const replyMatch = findCommentInThread(comment?.replies, commentId);
    if (replyMatch) return replyMatch;
  }
  return null;
};

const ACTIVITY_POLL_INTERVAL_MS = 5000;
const MAX_TRACKED_ACTIVITY_IDS = 80;
const AUTOSAVE_CHECKPOINT_MIN_INTERVAL_MS = 15000;
const ASSET_AUTOSAVE_SUPPRESSION_MS = 2500;
const IMAGE_CAPTURE_BATCH_SIZE = 25;
const IMAGE_CAPTURE_SCALE_TIERS = Object.freeze({
  small: 'small',
  medium: 'medium',
  large: 'large',
});
const IMAGE_CAPTURE_SCALE_LIMITS = Object.freeze({
  thumbnail: Object.freeze({
    smallMax: 250,
    mediumMax: 2000,
    stageSize: 500,
  }),
  screenshot: Object.freeze({
    smallMax: 50,
    mediumMax: 500,
    stageSize: 100,
  }),
});
const SCREENSHOT_ASSET_VALIDATION_BATCH_SIZE = 100;
const SCREENSHOT_ASSET_FILENAME_PATTERN = /(?:^|\/)[a-f0-9]{64}_(?:full|thumb|thumb_preview|thumb_small|full_thumb|full_viewport)_v\d+\.(?:jpe?g|png|webp)$/i;
const CLEARABLE_NODE_ASSET_KEYS = new Set([
  'thumbnailUrl',
  'thumbnailFullUrl',
  'fullScreenshotUrl',
]);
const IMAGE_CAPTURE_ASSET_FIELDS = [
  'thumbnailUrl',
  'thumbnailFullUrl',
  'fullScreenshotUrl',
  'fullScreenshotTruncated',
  'authRequired',
  'thumbnailCaptureFailed',
  'thumbnailCaptureError',
  'thumbnailCaptureFailedAt',
];
const collectImageAssetUpdatesFromNode = (node) => {
  if (!node) return {};
  return IMAGE_CAPTURE_ASSET_FIELDS.reduce((acc, field) => {
    if (node[field] !== undefined) acc[field] = node[field];
    return acc;
  }, {});
};
const getCaptureAssetUrl = (nodeOrAssets, mode) => (
  mode === 'screenshot'
    ? nodeOrAssets?.fullScreenshotUrl
    : nodeOrAssets?.thumbnailUrl
);
const getImageCaptureScaleTierForCount = (mode, count) => {
  const limits = IMAGE_CAPTURE_SCALE_LIMITS[mode === 'screenshot' ? 'screenshot' : 'thumbnail'];
  const total = Math.max(0, Number(count) || 0);
  if (total <= limits.smallMax) return IMAGE_CAPTURE_SCALE_TIERS.small;
  if (total <= limits.mediumMax) return IMAGE_CAPTURE_SCALE_TIERS.medium;
  return IMAGE_CAPTURE_SCALE_TIERS.large;
};
const getImageCaptureStageTotalForCount = (mode, count) => {
  const limits = IMAGE_CAPTURE_SCALE_LIMITS[mode === 'screenshot' ? 'screenshot' : 'thumbnail'];
  const total = Math.max(0, Number(count) || 0);
  if (getImageCaptureScaleTierForCount(mode, total) !== IMAGE_CAPTURE_SCALE_TIERS.large) return 1;
  return Math.max(1, Math.ceil(total / limits.stageSize));
};
const DEFAULT_COLLABORATION_SETTINGS = Object.freeze({
  accessPolicy: 'private',
  nonViewerInvitesRequireOwner: true,
  accessRequestsEnabled: true,
  presenceIdentityMode: 'named',
});

const sameId = (left, right) => {
  if (left === undefined || left === null || right === undefined || right === null) return false;
  return String(left) === String(right);
};

const trimActivityText = (value, maxLength = 72) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
};

const formatActivityActorLabel = (actor = {}, fallback = 'Collaborator') => {
  const name = trimActivityText(actor?.name, 40);
  if (name) return name;
  const email = trimActivityText(actor?.email, 60);
  if (email) return email.split('@')[0];
  const role = trimActivityText(actor?.role, 24);
  if (role) return role.charAt(0).toUpperCase() + role.slice(1);
  return fallback;
};

const buildActivityToastMessage = (event) => {
  if (!event?.summary || event.eventScope === 'content') return null;
  return `${formatActivityActorLabel(event.actor)}: ${event.summary}`;
};

const buildLiveOperationToastMessage = (operation, participant = null) => {
  if (!operation?.type) return null;
  const actorLabel = trimActivityText(participant?.displayName, 40) || 'Collaborator';
  const operationType = String(operation.type || '').trim();
  const changes = operation.payload?.changes || {};
  switch (operationType) {
    case 'metadata.update': {
      const nextName = trimActivityText(changes.name, 60);
      return nextName
        ? `${actorLabel} renamed the map to "${nextName}"`
        : `${actorLabel} updated the map details`;
    }
    case 'node.add': {
      const nodeTitle = trimActivityText(operation.payload?.node?.title, 60) || 'a node';
      return `${actorLabel} added "${nodeTitle}"`;
    }
    case 'node.update': {
      const title = trimActivityText(changes.title, 60);
      return title
        ? `${actorLabel} renamed a node to "${title}"`
        : `${actorLabel} updated a node`;
    }
    case 'node.delete':
      return `${actorLabel} deleted a node`;
    case 'node.move':
      return `${actorLabel} moved a branch`;
    case 'link.add':
      return `${actorLabel} added a link`;
    case 'link.update':
      return `${actorLabel} updated a link`;
    case 'link.delete':
      return `${actorLabel} removed a link`;
    default:
      return `${actorLabel} updated the map`;
  }
};

const mergeCollaborationSettingsPatch = (currentSettings, patch = {}) => {
  const nextSettings = {
    ...DEFAULT_COLLABORATION_SETTINGS,
    ...(currentSettings || {}),
  };

  if (Object.prototype.hasOwnProperty.call(patch, 'access_policy')) {
    nextSettings.accessPolicy = patch.access_policy;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'accessPolicy')) {
    nextSettings.accessPolicy = patch.accessPolicy;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'non_viewer_invites_require_owner')) {
    nextSettings.nonViewerInvitesRequireOwner = !!patch.non_viewer_invites_require_owner;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'nonViewerInvitesRequireOwner')) {
    nextSettings.nonViewerInvitesRequireOwner = !!patch.nonViewerInvitesRequireOwner;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'access_requests_enabled')) {
    nextSettings.accessRequestsEnabled = !!patch.access_requests_enabled;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'accessRequestsEnabled')) {
    nextSettings.accessRequestsEnabled = !!patch.accessRequestsEnabled;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'presence_identity_mode')) {
    nextSettings.presenceIdentityMode = patch.presence_identity_mode;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'presenceIdentityMode')) {
    nextSettings.presenceIdentityMode = patch.presenceIdentityMode;
  }

  return nextSettings;
};

const COEDITING_EXPERIMENT_UI_ENABLED = parseEnvBool(
  process.env.REACT_APP_COEDITING_EXPERIMENT_ENABLED,
  false
);
const PERMISSION_GATING_UI_ENABLED = parseEnvBool(
  process.env.REACT_APP_PERMISSION_GATING_ENABLED,
  false
);
const REALTIME_PRESENCE_HEARTBEAT_SEC = clamp(
  Number.parseInt(process.env.REACT_APP_REALTIME_PRESENCE_HEARTBEAT_SEC || '20', 10) || 20,
  5,
  60
);
const UNCATEGORIZED_PROJECT_ID = 'uncategorized';
const SHARED_PROJECT_ID = 'shared-with-me';
const PRESENCE_PREVIEW_LIMIT = 4;

const normalizeProjectSelection = (projectId) => {
  const normalized = String(projectId || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === UNCATEGORIZED_PROJECT_ID || normalized === SHARED_PROJECT_ID) {
    return null;
  }
  return String(projectId).trim();
};

const createPresenceSessionId = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return `web-${window.crypto.randomUUID()}`;
  }
  return `web-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
};

const formatPresenceAccessLabel = (accessMode) => {
  switch (String(accessMode || '').trim().toLowerCase()) {
    case 'edit':
      return 'Editing';
    case 'comment':
      return 'Commenting';
    default:
      return 'Viewing';
  }
};

const buildPresenceCollaborators = (
  entries = [],
  { excludeSessionId = null, excludeActorId = null } = {}
) => {
  const seen = new Set();

  return (entries || []).reduce((collaborators, entry) => {
    if (!entry || (excludeSessionId && entry.sessionId && entry.sessionId === excludeSessionId)) {
      return collaborators;
    }
    const actorOrUserId = entry.actorId || entry.userId || null;
    if (excludeActorId && actorOrUserId && sameId(actorOrUserId, excludeActorId)) {
      return collaborators;
    }

    const dedupeKey = actorOrUserId
      ? `actor:${actorOrUserId}`
      : (entry.sessionId ? `session:${entry.sessionId}` : null);

    if (!dedupeKey || seen.has(dedupeKey)) {
      return collaborators;
    }

    seen.add(dedupeKey);

    const label = trimActivityText(
      entry.displayName || entry.userEmail || entry.clientName,
      40,
    ) || 'Collaborator';
    const avatarLabel = trimActivityText(entry.avatarLabel, 4)
      || label.slice(0, 2).toUpperCase();
    const tone = Number.isFinite(Number(entry.tone))
      ? Math.abs(Number(entry.tone)) % 4
      : 0;

    collaborators.push({
      id: dedupeKey,
      label,
      avatarLabel,
      avatarUrl: entry.avatarUrl || null,
      tone,
      accessMode: String(entry.accessMode || '').trim().toLowerCase() || 'view',
    });

    return collaborators;
  }, []);
};

const PresenceChipList = ({ collaborators = [] }) => {
  if (!collaborators.length) return null;

  const visibleCollaborators = collaborators.slice(0, PRESENCE_PREVIEW_LIMIT);
  const overflowCount = Math.max(0, collaborators.length - visibleCollaborators.length);

  return (
    <div
      className="presence-chip-list"
      role="list"
      aria-label={`${collaborators.length} active collaborator${collaborators.length === 1 ? '' : 's'}`}
    >
      {visibleCollaborators.map((collaborator) => (
        <div
          key={collaborator.id}
          className={`presence-chip tone-${collaborator.tone}`}
          role="listitem"
          title={`${collaborator.label} • ${formatPresenceAccessLabel(collaborator.accessMode)}`}
        >
          <Avatar
            className="presence-chip-avatar"
            imageClassName="presence-chip-avatar-image"
            src={collaborator.avatarUrl}
            label={collaborator.avatarLabel}
            size="sm"
            tone={collaborator.tone}
            aria-hidden="true"
          />
          <span className="presence-chip-label">{collaborator.label}</span>
        </div>
      ))}
      {overflowCount > 0 && (
        <span className="presence-chip presence-chip-more" role="listitem">
          +{overflowCount}
        </span>
      )}
    </div>
  );
};

const stripNodeForMapSave = (node) => {
  if (!node || typeof node !== 'object') return node;
  const next = { ...node };
  delete next.internalLinks;
  delete next._childUrls;
  delete next._treeDepth;
  delete next._treeSize;
  ['thumbnailUrl', 'thumbnailFullUrl', 'fullScreenshotUrl'].forEach((field) => {
    if (isDataImageUrl(next[field])) {
      delete next[field];
    }
  });
  if (Array.isArray(node.children)) {
    next.children = node.children.map(stripNodeForMapSave);
  }
  return next;
};

const prepareMapTreeForSave = ({ root, orphans } = {}) => ({
  root: root ? stripNodeForMapSave(root) : root,
  orphans: Array.isArray(orphans) ? orphans.map(stripNodeForMapSave) : [],
});

const buildMapSavePayload = (payload = {}) => {
  const tree = prepareMapTreeForSave({
    root: payload.root,
    orphans: payload.orphans,
  });
  const next = { ...payload };
  if (Object.prototype.hasOwnProperty.call(payload, 'root')) next.root = tree.root || null;
  if (Object.prototype.hasOwnProperty.call(payload, 'orphans')) next.orphans = tree.orphans;
  return next;
};

const cloneNodeTree = (tree) => (
  typeof structuredClone === 'function'
    ? structuredClone(tree)
    : JSON.parse(JSON.stringify(tree))
);

const applyNodeAssetUpdates = (tree, nodeId, assetEntries) => {
  if (!tree || !nodeId || !assetEntries?.length || !findNodeById(tree, nodeId)) {
    return { tree, updated: false };
  }
  const nextTree = cloneNodeTree(tree);
  const target = findNodeById(nextTree, nodeId);
  if (!target) return { tree, updated: false };
  assetEntries.forEach(([key, value]) => {
    target[key] = value;
  });
  return { tree: nextTree, updated: true };
};

const applyNodeAssetUpdatesToMap = ({ root, orphans, nodeId, assetEntries }) => {
  const rootUpdate = applyNodeAssetUpdates(root, nodeId, assetEntries);
  let updated = rootUpdate.updated;
  let nextOrphans = Array.isArray(orphans) ? orphans : [];

  if (nextOrphans.length > 0) {
    nextOrphans = nextOrphans.map((orphan) => {
      const orphanUpdate = applyNodeAssetUpdates(orphan, nodeId, assetEntries);
      if (!orphanUpdate.updated) return orphan;
      updated = true;
      return orphanUpdate.tree;
    });
  }

  return {
    root: rootUpdate.tree,
    orphans: nextOrphans,
    updated,
  };
};

const waitForUiResponse = () => new Promise((resolve) => setTimeout(resolve, 0));

const serializeMapAutosaveSnapshot = ({
  root,
  orphans,
  connections,
  colors,
  connectionColors,
} = {}) => {
  const payload = buildMapSavePayload({ root, orphans });
  return JSON.stringify({
    root: payload.root || null,
    orphans: Array.isArray(payload.orphans) ? payload.orphans : [],
    connections: Array.isArray(connections) ? connections : [],
    colors: colors || DEFAULT_COLORS,
    connectionColors: connectionColors || DEFAULT_CONNECTION_COLORS,
  });
};

function organizeProjectsWithMaps(projectRows = [], mapRows = []) {
  const projectsById = new Map();
  const orderedProjects = (projectRows || []).map((project) => {
    const nextProject = { ...project, maps: [] };
    projectsById.set(project.id, nextProject);
    return nextProject;
  });

  const sharedMaps = [];
  const uncategorizedMaps = [];

  (mapRows || []).forEach((map) => {
    if (map?.project_id && projectsById.has(map.project_id)) {
      projectsById.get(map.project_id).maps.push(map);
      return;
    }
    if (map?.membership_role && map.membership_role !== 'owner') {
      sharedMaps.push(map);
      return;
    }
    uncategorizedMaps.push(map);
  });

  if (sharedMaps.length > 0) {
    orderedProjects.push({
      id: SHARED_PROJECT_ID,
      name: 'Shared With Me',
      maps: sharedMaps,
      isVirtual: true,
    });
  }

  if (uncategorizedMaps.length > 0) {
    orderedProjects.push({
      id: UNCATEGORIZED_PROJECT_ID,
      name: 'Uncategorized',
      maps: uncategorizedMaps,
      isVirtual: true,
    });
  }

  return orderedProjects;
}

const SitemapTree = ({
  data,
  orphans = [],
  showThumbnails,
  showCommentBadges,
  canEdit,
  canComment,
  showCommentAction,
  commentActionLabel,
  showExternalLinkAction,
  showDeleteAction,
  connectionTool,
  snapTarget,
  onAnchorMouseDown,
  colors,
  scale = 1,
  onDelete,
  onEdit,
  onDuplicate,
  onViewImage,
  onAddNote,
  onViewNotes,
  onNodeDoubleClick,
  onNodeClick,
  onNodeContextMenu,
  activeId,
  badgeVisibility,
  layerVisibility,
  changeFilters,
  showPageNumbers,
  thumbnailRequestIds,
  thumbnailSessionId,
  thumbnailReloadMap,
  thumbnailCaptureStopped,
  onThumbnailLoad,
  onThumbnailError,
  expandedStacks,
  onToggleStack,
  layout: layoutOverride,
  orientation = MAP_ORIENTATIONS.VERTICAL,
  viewportBounds = null,
  selectedNodeIds,
  activeBranchNodeIds,
  children,
}) => {
  const toggleStack = (nodeId) => {
    onToggleStack?.(nodeId);
  };

  // Compute layout using explicit coordinate formulas
  const computedLayout = useMemo(() => {
    if (layoutOverride) return null;
    return computeLayout(data, orphans, showThumbnails, expandedStacks, {
      mode: 'after-root', // or 'after-tree'
      renderOrphanChildren: true,
      orientation,
    });
  }, [data, orphans, showThumbnails, expandedStacks, layoutOverride, orientation]);

  const layout = layoutOverride || computedLayout;

  // Run invariant checks in development
  useEffect(() => {
    if (!layout || process.env.NODE_ENV === 'production') return;
    if (layout.orientation === MAP_ORIENTATIONS.HORIZONTAL) return;
    checkLayoutInvariants(layout.nodes, orphans, layout.connectors);
  }, [layout, orphans]);

  const alwaysVisibleNodeIds = useMemo(() => {
    const ids = new Set();
    if (activeId) ids.add(activeId);
    if (activeBranchNodeIds) {
      activeBranchNodeIds.forEach((id) => ids.add(id));
    }
    return ids;
  }, [activeId, activeBranchNodeIds]);

  const visibleNodeData = useMemo(() => (
    layout
      ? filterVisibleLayoutNodes(layout.nodes, viewportBounds, { alwaysIncludeIds: alwaysVisibleNodeIds })
      : []
  ), [layout, viewportBounds, alwaysVisibleNodeIds]);

  const visibleLayoutConnectors = useMemo(() => (
    layout ? filterVisibleLayoutConnectors(layout.connectors, viewportBounds) : []
  ), [layout, viewportBounds]);

  if (!data || !layout) return null;

  const statusFilters = changeFilters?.statuses || {};

  const getBadgesForNode = (node, nodeMeta) => {
    const badges = [];
    if (node.isDuplicate) badges.push('Duplicate');
    if (isVirtualMissingNode(node)) badges.push('Missing');
    const orphanType = nodeMeta?.orphanType || node.orphanType;
    const isRenderableText = isRenderableTextUrl(node.url);
    const isSubdomainTree = node.subdomainRoot || nodeMeta?.isSubdomainTree || orphanType === 'subdomain';
    const isOrphanRoot = isTopLevelOrphanRoot(nodeMeta);
    if (isSubdomainTree && badgeVisibility?.subdomains) badges.push('Subdomain');
    if (orphanType === 'orphan' && badgeVisibility?.orphanPages) badges.push('Orphan');
    if (!isRenderableText && orphanType === 'file' && badgeVisibility?.files) badges.push('File');
    if (orphanType === 'broken' && !isOrphanRoot && badgeVisibility?.brokenLinks) badges.push('Broken Link');
    if (!isRenderableText && node.isFile && badgeVisibility?.files && !badges.includes('File')) badges.push('File');
    if (node.isBroken && !isOrphanRoot && badgeVisibility?.brokenLinks && !badges.includes('Broken Link')) {
      badges.push('Broken Link');
    }
    if (node.authRequired && badgeVisibility?.authenticatedPages) {
      badges.push('Auth');
    } else if (node.isError && badgeVisibility?.errorPages) {
      badges.push(getNodeHttpErrorLabel(node) || 'Error');
    } else if ((node.isInactive || orphanType === 'inactive') && badgeVisibility?.inactivePages && !badges.includes('Inactive')) {
      badges.push('Inactive');
    }
    return badges;
  };

  // Convert connector data to SVG path strings
  const connectorPaths = visibleLayoutConnectors.map(c => {
    if (c.type === 'horizontal-bus' || c.type === 'horizontal-tick') {
      return `M ${c.x1} ${c.y1} L ${c.x2} ${c.y2}`;
    }
    return `M ${c.x1} ${c.y1} L ${c.x2} ${c.y2}`;
  });

  return (
    <div
      className="sitemap-tree-absolute"
      style={{
        position: 'relative',
        width: layout.bounds.w,
        height: layout.bounds.h,
        minWidth: layout.bounds.w,
        minHeight: layout.bounds.h,
      }}
      data-layout-node-count={layout.nodes.size}
      data-rendered-node-count={visibleNodeData.length}
      data-rendered-connector-count={visibleLayoutConnectors.length}
    >
      {/* Single SVG overlay for all connectors */}
      <svg
        className="connector-overlay"
        aria-hidden="true"
      >
        {connectorPaths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--ui-connection-map-default)"
            strokeWidth="var(--ui-connection-map-stroke-width)"
          />
        ))}
      </svg>

      {children}

      {/* Render all nodes with absolute positioning */}
      {visibleNodeData.map(nodeData => {
        const color = getDepthColor(colors, nodeData.depth);
        const isRoot = nodeData.node.id === data.id;
        const badges = getBadgesForNode(nodeData.node, nodeData);
        const annotations = nodeData.node?.annotations || {};
        const status = annotations.status || 'none';
        const note = typeof annotations.note === 'string' ? annotations.note.trim() : '';
        const hasAnnotation = status !== 'none'
          || note.length > 0
          || (Array.isArray(annotations.tags) && annotations.tags.length > 0);
        const isDeleted = status === 'deleted';
        const markerFilteredOut = status !== 'none' && statusFilters[status] === false;
        const isGhosted = isNodeGhosted(nodeData.node, nodeData, layerVisibility)
          || markerFilteredOut
          || (isDeleted && hasAnnotation);
        const stackInfo = nodeData.stackInfo;
        const stackToggleParentId = stackInfo?.parentId;
        const shouldWrapStack = !!stackInfo?.collapsed;

        const isSelected = selectedNodeIds?.has(nodeData.node.id);
        const isBranchDragging = activeBranchNodeIds?.has(nodeData.node.id);
        const card = (
          <DraggableNodeCard
            node={nodeData.node}
            number={nodeData.number}
            color={color}
            showThumbnails={showThumbnails}
            showCommentBadges={showCommentBadges}
            canEdit={canEdit}
            canComment={canComment}
            showCommentAction={showCommentAction}
            commentActionLabel={commentActionLabel}
            showExternalLinkAction={showExternalLinkAction}
            showDeleteAction={showDeleteAction}
            connectionTool={connectionTool}
            snapTarget={snapTarget}
            onAnchorMouseDown={onAnchorMouseDown}
            isRoot={isRoot}
            onDelete={onDelete}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onViewImage={onViewImage}
            onAddNote={onAddNote}
            onViewNotes={onViewNotes}
            activeId={isBranchDragging ? nodeData.node.id : activeId}
            isGhosted={isGhosted}
            badges={badges}
            showPageNumbers={showPageNumbers}
            showAnnotations={!markerFilteredOut}
            thumbnailRequestIds={thumbnailRequestIds}
            thumbnailSessionId={thumbnailSessionId}
            thumbnailReloadKey={thumbnailReloadMap?.[nodeData.node.id] || 0}
            thumbnailCaptureStopped={thumbnailCaptureStopped}
            onThumbnailLoad={onThumbnailLoad}
            onThumbnailError={onThumbnailError}
            stackInfo={stackInfo}
            onToggleStack={() => {
              if (stackToggleParentId !== undefined && stackToggleParentId !== null) {
                toggleStack(stackToggleParentId);
              }
            }}
            isSelected={isSelected}
          />
        );

        return (
          <div
            key={nodeData.node.id}
            className="sitemap-node-positioned"
            data-node-id={nodeData.node.id}
            data-depth={nodeData.depth}
            style={{
              position: 'absolute',
              left: nodeData.x,
              top: nodeData.y,
            }}
            onDoubleClick={() => onNodeDoubleClick?.(nodeData.node.id)}
            onClick={(e) => onNodeClick?.(nodeData.node, e)}
            onContextMenu={(e) => onNodeContextMenu?.(nodeData.node.id, e)}
          >
            {shouldWrapStack ? (
              <div className="stacked-node-wrapper">
                <div className="stacked-node-ghost stacked-node-ghost-3" />
                <div className="stacked-node-ghost stacked-node-ghost-2" />
                <div className="stacked-node-ghost stacked-node-ghost-1" />
                {card}
              </div>
            ) : (
              card
            )}
          </div>
        );
      })}

    </div>
  );
};

const collectAllNodesWithOrphans = (rootNode, orphanNodes = []) => {
  const result = [];
  const walk = (node) => {
    if (!node) return;
    result.push(node);
    node.children?.forEach(walk);
  };
  if (rootNode) walk(rootNode);
  orphanNodes.forEach(walk);
  return result;
};

const mapHasThumbnailAsset = (rootNode, orphanNodes = []) => {
  let found = false;
  const walk = (node) => {
    if (!node || found) return;
    if (node.thumbnailUrl) {
      found = true;
      return;
    }
    node.children?.forEach(walk);
  };
  if (rootNode) walk(rootNode);
  (Array.isArray(orphanNodes) ? orphanNodes : []).forEach(walk);
  return found;
};

const isStoredScreenshotAsset = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (raw.startsWith('/screenshots/') || raw.includes('/screenshots/')) return true;
  const withoutQuery = raw.split(/[?#]/)[0];
  if (SCREENSHOT_ASSET_FILENAME_PATTERN.test(withoutQuery)) return true;
  try {
    const parsed = new URL(raw);
    return parsed.pathname.includes('/screenshots/')
      || SCREENSHOT_ASSET_FILENAME_PATTERN.test(parsed.pathname);
  } catch {
    return false;
  }
};

const getImageCaptureStats = ({
  rootNode,
  orphanNodes = [],
  assetKey,
  invalidAssetIds = new Set(),
  isUnavailable = () => false,
}) => {
  if (!rootNode) {
    return {
      total: 0,
      captured: 0,
      unavailable: 0,
      remaining: 0,
      hasPartial: false,
      allCaptured: false,
    };
  }
  const nodes = collectAllNodesWithOrphans(rootNode, orphanNodes).filter((node) => node?.url);
  const hasCapturedAsset = (node) => (
    isStoredScreenshotAsset(node?.[assetKey])
    && !invalidAssetIds.has(node?.id)
  );
  const captured = nodes.filter(hasCapturedAsset).length;
  const unavailable = nodes.filter(
    (node) => !hasCapturedAsset(node) && isUnavailable(node)
  ).length;
  const remaining = Math.max(0, nodes.length - captured - unavailable);
  return {
    total: nodes.length,
    captured,
    unavailable,
    remaining,
    hasPartial: captured > 0 && remaining > 0,
    allCaptured: nodes.length > 0 && remaining === 0,
  };
};

const collectNodeAndDescendantIds = (node, result = []) => {
  if (!node?.id) return result;
  result.push(node.id);
  node.children?.forEach((child) => collectNodeAndDescendantIds(child, result));
  return result;
};

const hasAssignedUrl = (node) => typeof node?.url === 'string' && node.url.trim() !== '';
const ORPHAN_CONTAINER_ID = DEFAULT_ORPHAN_CONTAINER_ID;
const SUBDOMAIN_CONTAINER_ID = DEFAULT_SUBDOMAIN_CONTAINER_ID;
const HOME_PARENT_ID = '__home__';
const ORPHAN_PARENT_ID = '__orphan_root__';
const SUBDOMAIN_PARENT_ID = '__subdomain_root__';
const PAGE_TYPE_HOME = 'Home';
const PAGE_TYPE_PAGE = 'Page';

// Build a unified index for root + orphan + subdomain trees
const buildForestIndex = (rootNode, orphanNodes = []) => {
  const index = {
    nodes: new Map(), // nodeId -> { treeRootId, treeType, parentId, hasUrl }
    trees: new Map(), // treeRootId -> { type, hasUrl, nodeIds }
  };

  const registerTree = (treeRoot, treeType, treeIndex = 0) => {
    if (!treeRoot?.id) return;
    const treeRootId = treeRoot.id;
    const nodeIds = new Set();
    let visitOrder = 0;
    const stack = [{
      node: treeRoot,
      parentId: null,
      depth: 0,
      siblingIndex: 0,
      orderPath: '00000',
    }];

    while (stack.length > 0) {
      const { node, parentId, depth, siblingIndex, orderPath } = stack.pop();
      if (!node?.id) continue;
      nodeIds.add(node.id);
      index.nodes.set(node.id, {
        treeRootId,
        treeType,
        treeIndex,
        parentId,
        depth,
        siblingIndex,
        order: visitOrder,
        orderPath,
        hasUrl: hasAssignedUrl(node),
      });
      visitOrder += 1;

      const children = node.children || [];
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push({
          node: children[i],
          parentId: node.id,
          depth: depth + 1,
          siblingIndex: i,
          orderPath: `${orderPath}.${String(i).padStart(5, '0')}`,
        });
      }
    }

    index.trees.set(treeRootId, {
      type: treeType,
      treeIndex,
      hasUrl: hasAssignedUrl(treeRoot),
      nodeIds,
    });
  };

  if (rootNode) registerTree(rootNode, 'root', 0);
  const list = Array.isArray(orphanNodes) ? orphanNodes : [];
  list.forEach((orphan, index) => {
    const treeType = orphan?.subdomainRoot ? 'subdomain' : 'orphan';
    registerTree(orphan, treeType, index + 1);
  });

  return index;
};

const makeNodeIdFromUrl = (url) => `url_${url.replace(/[^a-z0-9]/gi, '_')}`;

const getUrlLabel = (url) => {
  try {
    const { hostname, pathname } = new URL(url);
    const slug = pathname.split('/').filter(Boolean).pop();
    return decodeURIComponent(slug || hostname);
  } catch {
    return url;
  }
};

const buildUrlNodeMap = (rootNode, orphanNodes = []) => {
  const map = new Map();
  const walk = (node) => {
    if (!node?.url) return;
    if (!map.has(node.url)) map.set(node.url, node);
    node.children?.forEach(walk);
  };
  walk(rootNode);
  orphanNodes.forEach((orphan) => {
    if (orphan?.url && !map.has(orphan.url)) map.set(orphan.url, orphan);
  });
  return map;
};

const removeNodeFromTreeById = (tree, nodeId) => {
  if (!tree?.children?.length) return null;
  const idx = tree.children.findIndex((child) => child.id === nodeId);
  if (idx !== -1) {
    return tree.children.splice(idx, 1)[0];
  }
  for (const child of tree.children) {
    const removed = removeNodeFromTreeById(child, nodeId);
    if (removed) return removed;
  }
  return null;
};

const normalizeUrlForCompare = (raw) => {
  try {
    const u = new URL(raw);
    u.hash = '';
    if (/\/index\.(html?|php|aspx)$/i.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\/index\.(html?|php|aspx)$/i, '/');
    }
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    u.hostname = u.hostname.replace(/^www\./i, '');
    const port = u.port ? `:${u.port}` : '';
    return `${u.hostname}${port}${u.pathname}${u.search}`;
  } catch {
    return raw;
  }
};

const normalizeScanHost = (hostname) => String(hostname || '').replace(/^www\./i, '').toLowerCase();

const isLocalOrIpHost = (hostname) => {
  const host = normalizeScanHost(hostname).replace(/^\[|\]$/g, '');
  return host === 'localhost'
    || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
    || host.includes(':');
};

const getRootDomain = (hostname) => {
  const host = normalizeScanHost(hostname);
  if (!host || isLocalOrIpHost(host)) return host;
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  const secondLevel = parts[parts.length - 2] || '';
  if (secondLevel.length <= 3 && parts.length > 2) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
};

const buildScanScope = (rootNode, scanResult = {}) => {
  try {
    const seed = scanResult.scanScope?.seed || rootNode?.url;
    const parsed = new URL(seed);
    const baseHost = normalizeScanHost(scanResult.scanScope?.baseHost || parsed.hostname);
    const rootDomain = scanResult.scanScope?.rootDomain || getRootDomain(baseHost);
    return {
      baseHost,
      rootDomain,
      allowSubdomains: Boolean(scanResult.scanScope?.allowSubdomains),
      exactOnly: Boolean(scanResult.scanScope?.exactOnly) || isLocalOrIpHost(baseHost),
    };
  } catch {
    return null;
  }
};

const isUrlInScanScope = (url, scanScope) => {
  if (!scanScope || !url) return true;
  try {
    const host = normalizeScanHost(new URL(url).hostname);
    if (host === scanScope.baseHost) return true;
    return Boolean(
      scanScope.allowSubdomains
        && !scanScope.exactOnly
        && getRootDomain(host) === scanScope.rootDomain
    );
  } catch {
    return false;
  }
};

const buildRootUrlSet = (rootNode) => {
  const set = new Set();
  const addUrl = (url) => {
    if (url) set.add(normalizeUrlForCompare(url));
  };
  const walk = (node) => {
    if (!node?.url) return;
    addUrl(node.url);
    addUrl(node.finalUrl);
    addUrl(node.canonicalUrl);
    node.children?.forEach(walk);
  };
  walk(rootNode);
  return set;
};

const isTopLevelOrphanRoot = (nodeMeta) => {
  if (!nodeMeta) return false;
  if (nodeMeta.depth !== 0) return false;
  return Boolean(nodeMeta.orphanType && nodeMeta.orphanType !== 'subdomain');
};

const getNodePlacement = (nodeMeta) => {
  if (!nodeMeta) return 'primary';
  if (nodeMeta.isSubdomainTree || nodeMeta.orphanType === 'subdomain') return 'subdomain';
  if (nodeMeta.orphanType && nodeMeta.orphanType !== 'subdomain') return 'orphan';
  return 'primary';
};

const getNodeType = (node, nodeMeta) => {
  if (!isRenderableTextUrl(node?.url) && (node?.isFile || nodeMeta?.orphanType === 'file')) return 'file';
  return 'page';
};

const getNodeStatusFlags = (node, nodeMeta) => {
  const isOrphanRoot = isTopLevelOrphanRoot(nodeMeta);
  return {
    broken: !isOrphanRoot && (node?.isBroken || nodeMeta?.orphanType === 'broken'),
    error: Boolean(node?.isError),
    inactive: Boolean(!node?.isError && !node?.authRequired && (node?.isInactive || nodeMeta?.orphanType === 'inactive')),
    auth: Boolean(node?.authRequired),
    duplicate: Boolean(node?.isDuplicate),
  };
};

const isNodeGhosted = (node, nodeMeta, visibility) => {
  if (!visibility) return false;
  const placement = getNodePlacement(nodeMeta);
  const type = getNodeType(node, nodeMeta);
  const status = getNodeStatusFlags(node, nodeMeta);

  if (placement === 'primary' && !visibility.placementPrimary) return true;
  if (placement === 'subdomain' && !visibility.placementSubdomain) return true;
  if (placement === 'orphan' && !visibility.placementOrphan) return true;
  if (type === 'page' && !visibility.typePages) return true;
  if (type === 'file' && !visibility.typeFiles) return true;
  if (status.broken && !visibility.statusBroken) return true;
  if (status.error && !visibility.statusError) return true;
  if (status.inactive && !visibility.statusInactive) return true;
  if (status.auth && !visibility.statusAuth) return true;
  if (status.duplicate && !visibility.statusDuplicate) return true;
  return false;
};

const applyScanArtifacts = (rootNode, orphanNodes, scanResult) => {
  const mergedOrphans = (orphanNodes || []).map((orphan) => ({
    ...orphan,
    orphanType: orphan.orphanType || 'orphan',
  }));
  const scanScope = buildScanScope(rootNode, scanResult);
  const isArtifactInScope = (url) => isUrlInScanScope(url, scanScope);
  const rootUrlSet = buildRootUrlSet(rootNode);
  const urlNodeMap = buildUrlNodeMap(rootNode, mergedOrphans);
  const normalizedUrlNodeMap = new Map();

  const addNormalizedUrl = (url, node) => {
    if (!url) return;
    const normalized = normalizeUrlForCompare(url);
    if (!normalizedUrlNodeMap.has(normalized)) normalizedUrlNodeMap.set(normalized, node);
  };

  const indexNodeUrls = (node) => {
    if (!node?.url) return;
    if (!urlNodeMap.has(node.url)) urlNodeMap.set(node.url, node);
    addNormalizedUrl(node.url, node);
    addNormalizedUrl(node.finalUrl, node);
    addNormalizedUrl(node.canonicalUrl, node);
    node.children?.forEach(indexNodeUrls);
  };

  const addOrphanNode = (node, orphanType) => {
    if (!node?.url) return null;
    if (urlNodeMap.has(node.url)) {
      const existing = urlNodeMap.get(node.url);
      if (!rootUrlSet.has(normalizeUrlForCompare(node.url))) {
        if (orphanType === 'subdomain') existing.subdomainRoot = true;
        if (orphanType && !existing.orphanType) existing.orphanType = orphanType;
        if (existing.isMissing && !node.isMissing) {
          Object.assign(existing, {
            title: node.title || existing.title,
            parentUrl: node.parentUrl || existing.parentUrl,
            referrerUrl: node.referrerUrl || existing.referrerUrl,
            authRequired: node.authRequired ?? existing.authRequired,
            thumbnailUrl: node.thumbnailUrl || existing.thumbnailUrl,
            thumbnailFullUrl: node.thumbnailFullUrl || existing.thumbnailFullUrl,
            fullScreenshotUrl: node.fullScreenshotUrl || existing.fullScreenshotUrl,
            thumbnailCaptureFailed: node.thumbnailCaptureFailed ?? existing.thumbnailCaptureFailed,
            thumbnailCaptureError: node.thumbnailCaptureError || existing.thumbnailCaptureError,
            thumbnailCaptureFailedAt: node.thumbnailCaptureFailedAt || existing.thumbnailCaptureFailedAt,
            description: node.description || existing.description,
            metaTags: node.metaTags || existing.metaTags,
            canonicalUrl: node.canonicalUrl || existing.canonicalUrl,
            seoMetadata: node.seoMetadata || existing.seoMetadata,
            titleSource: node.titleSource || existing.titleSource,
            blockedReason: node.blockedReason || existing.blockedReason,
            httpStatus: node.httpStatus ?? existing.httpStatus,
            statusCode: node.statusCode ?? existing.statusCode,
            errorStatus: node.errorStatus ?? existing.errorStatus,
            httpErrorType: node.httpErrorType || existing.httpErrorType,
            httpErrorLabel: node.httpErrorLabel || existing.httpErrorLabel,
            isViewableError: node.isViewableError ?? existing.isViewableError,
            isError: node.isError ?? existing.isError,
            isChallengePage: false,
            isBlocked: false,
            scanStatus: node.scanStatus || existing.scanStatus,
            metadataAvailable: node.metadataAvailable ?? existing.metadataAvailable,
            isMissing: false,
            isVirtualMissing: false,
          });
        }
        if (node.children?.length) {
          existing.children = node.children;
          indexNodeUrls(existing);
        }
      }
      return existing;
    }

    const normalized = {
      ...node,
      children: node.children || [],
      orphanType,
    };
    if (orphanType === 'subdomain') normalized.subdomainRoot = true;
    mergedOrphans.push(normalized);
    indexNodeUrls(normalized);
    return normalized;
  };

  indexNodeUrls(rootNode);
  mergedOrphans.forEach(indexNodeUrls);

  (scanResult.subdomains || []).forEach((node) => {
    if (!isArtifactInScope(node?.url)) return;
    addOrphanNode({ ...node, subdomainRoot: true }, 'subdomain');
  });

  (scanResult.files || []).forEach((file) => {
    if (!file?.url) return;
    if (!isArtifactInScope(file.url)) return;
    const existing = urlNodeMap.get(file.url);
    if (existing) {
      existing.isFile = true;
      existing.contentType = file.contentType || existing.contentType || null;
      existing.fileType = file.fileType || existing.fileType || null;
      existing.extension = file.extension || existing.extension || null;
      existing.isInactive = false;
      existing.isError = false;
      existing.errorStatus = null;
      existing.httpErrorType = null;
      existing.httpErrorLabel = null;
      existing.isViewableError = false;
      existing.isMissing = false;
      existing.isVirtualMissing = false;
      if (existing.scanStatus === 'inactive') existing.scanStatus = null;
      if (existing.orphanType === 'inactive') existing.orphanType = 'file';
      return;
    }

    const newNode = {
      id: makeNodeIdFromUrl(file.url),
      url: file.url,
      title: getUrlLabel(file.url),
      children: [],
      isFile: true,
      contentType: file.contentType || null,
      fileType: file.fileType || null,
      extension: file.extension || null,
      parentUrl: file.sourceUrl || null,
    };
    if (file.sourceUrl && urlNodeMap.has(file.sourceUrl)) {
      const parent = urlNodeMap.get(file.sourceUrl);
      parent.children = parent.children || [];
      parent.children.push(newNode);
    } else {
      addOrphanNode(newNode, 'file');
    }
    urlNodeMap.set(newNode.url, newNode);
    addNormalizedUrl(newNode.url, newNode);
  });

  (scanResult.errors || []).forEach((error) => {
    if (!error?.url) return;
    if (!isArtifactInScope(error.url)) return;
    const node = urlNodeMap.get(error.url);
    if (!node) return;
    if (node.isFile || node.orphanType === 'file') return;
    if (node.scanStatus === 'scan_limited') return;
    node.isError = true;
    node.errorStatus = error.status;
    node.httpStatus = node.httpStatus ?? error.status ?? null;
    node.statusCode = node.statusCode ?? error.status ?? null;
    node.httpErrorType = error.httpErrorType || node.httpErrorType || null;
    node.httpErrorLabel = error.httpErrorLabel || node.httpErrorLabel || getNodeHttpErrorLabel(node) || null;
    node.isViewableError = Boolean(error.isViewableError || node.isViewableError);
    node.blockedReason = error.blockedReason || node.blockedReason || null;
    node.scanStatus = 'error';
    node.isMissing = false;
    node.isVirtualMissing = false;
    if (error.authRequired) node.authRequired = true;
  });

  (scanResult.brokenLinks || []).forEach((link) => {
    if (!link?.url) return;
    if (!isArtifactInScope(link.url)) return;
    let existing = urlNodeMap.get(link.url);
    if (!existing) {
      const normalized = normalizeUrlForCompare(link.url);
      existing = normalizedUrlNodeMap.get(normalized);
    }
    if (!existing) return;
    existing.isBroken = true;
  });

  (scanResult.inactivePages || []).forEach((inactive) => {
    if (!inactive?.url) return;
    if (!isArtifactInScope(inactive.url)) return;
    const inactiveStatus = Number(inactive.status || 0);
    if (inactiveStatus >= 400) return;
    const existing = urlNodeMap.get(inactive.url);
    if (existing) {
      if (existing.scanStatus === 'scan_limited' || existing.isError || existing.authRequired) return;
      if (existing.isFile || existing.orphanType === 'file') return;
      existing.isInactive = true;
      existing.scanStatus = 'inactive';
      existing.isMissing = false;
      existing.isVirtualMissing = false;
      return;
    }
    addOrphanNode({
      id: makeNodeIdFromUrl(inactive.url),
      url: inactive.url,
      title: getUrlLabel(inactive.url),
      children: [],
      isInactive: true,
      isVirtualMissing: false,
    }, 'inactive');
  });

  // Refresh normalized map with any artifact nodes added above.
  indexNodeUrls(rootNode);
  mergedOrphans.forEach(indexNodeUrls);

  const seenOrphanUrls = new Set();
  const dedupedOrphans = mergedOrphans.filter((orphan) => {
    if (!orphan?.url) return true;
    const normalized = normalizeUrlForCompare(orphan.url);
    if (rootUrlSet.has(normalized)) return false;
    if (seenOrphanUrls.has(normalized)) return false;
    seenOrphanUrls.add(normalized);
    return true;
  });

  return { root: rootNode, orphans: dedupedOrphans };
};

const normalizeOrphans = (list) => (list || [])
  .filter(Boolean)
  .map((orphan) => ({
    ...orphan,
    orphanType: orphan.orphanType || 'orphan',
  }));

const normalizeScanConfig = ({ url, options }) => ({
  url: normalizeUrlForCompare(url || ''),
  options: Object.keys(options || {})
    .sort()
    .reduce((acc, key) => {
      acc[key] = Boolean(options[key]);
      return acc;
    }, {}),
});

const scanConfigsHaveOptionChanges = (nextConfig, previousConfig) => {
  if (!nextConfig || !previousConfig) return false;
  const keys = new Set([
    ...Object.keys(nextConfig.options || {}),
    ...Object.keys(previousConfig.options || {}),
  ]);
  return Array.from(keys).some((key) => Boolean(nextConfig.options?.[key]) !== Boolean(previousConfig.options?.[key]));
};

const collectNodesDeep = (rootNode, orphanNodes = []) => {
  const result = [];
  const walk = (node) => {
    if (!node) return;
    result.push(node);
    (node.children || []).forEach(walk);
  };
  walk(rootNode);
  (orphanNodes || []).forEach(walk);
  return result;
};

const nodeKey = (node) => {
  if (!node) return '';
  if (node.url) return `url:${normalizeUrlForCompare(node.url)}`;
  return node.id ? `id:${node.id}` : '';
};

const hasUserPreservedNodeState = (node, manualNodeIds = new Set()) => {
  if (!node) return false;
  const annotations = node.annotations || {};
  return manualNodeIds.has(node.id)
    || Boolean(node.comments?.length)
    || Boolean(annotations.status && annotations.status !== 'none')
    || Boolean(String(annotations.note || '').trim())
    || Boolean(annotations.tags?.length)
    || Boolean(node.thumbnailUrl || node.thumbnailFullUrl || node.fullScreenshotUrl)
    || Boolean(node.thumbnailCaptureFailed);
};

const mergeRescanResults = ({
  existingRoot,
  existingOrphans,
  nextRoot,
  nextOrphans,
  manualConnections = [],
}) => {
  const existingByKey = new Map();
  collectNodesDeep(existingRoot, existingOrphans).forEach((node) => {
    const key = nodeKey(node);
    if (key && !existingByKey.has(key)) existingByKey.set(key, node);
    if (node?.id && !existingByKey.has(`id:${node.id}`)) existingByKey.set(`id:${node.id}`, node);
  });

  const hydratedKeys = new Set();
  const preserveFields = [
    'id',
    'title',
    'pageType',
    'annotations',
    'comments',
    'thumbnailUrl',
    'thumbnailFullUrl',
    'fullScreenshotUrl',
    'thumbnailCaptureFailed',
    'thumbnailCaptureError',
    'thumbnailCaptureFailedAt',
    'description',
    'metaTags',
    'canonicalUrl',
    'seoMetadata',
  ];

  const hydrateNode = (node) => {
    if (!node) return node;
    const key = nodeKey(node);
    const existing = existingByKey.get(key) || existingByKey.get(`id:${node.id}`);
    const next = {
      ...node,
      children: (node.children || []).map(hydrateNode),
    };
    if (existing) {
      if (key) hydratedKeys.add(key);
      if (existing.id) hydratedKeys.add(`id:${existing.id}`);
      preserveFields.forEach((field) => {
        const value = existing[field];
        if (value !== undefined && value !== null && value !== '') {
          next[field] = value;
        }
      });
    }
    return next;
  };

  const manualNodeIds = new Set();
  manualConnections.forEach((connection) => {
    if (connection?.sourceNodeId) manualNodeIds.add(connection.sourceNodeId);
    if (connection?.targetNodeId) manualNodeIds.add(connection.targetNodeId);
  });

  const nextRootHydrated = hydrateNode(nextRoot);
  const nextOrphansHydrated = (nextOrphans || []).map(hydrateNode);
  const nextKeys = new Set(collectNodesDeep(nextRootHydrated, nextOrphansHydrated).map(nodeKey).filter(Boolean));
  const preservedMissing = collectNodesDeep(existingRoot, existingOrphans)
    .filter((node) => {
      const key = nodeKey(node);
      if (!key || hydratedKeys.has(key) || nextKeys.has(key)) return false;
      return hasUserPreservedNodeState(node, manualNodeIds);
    })
    .map((node) => ({
      ...node,
      children: [],
      orphanType: node.orphanType || 'orphan',
    }));

  return {
    root: nextRootHydrated,
    orphans: normalizeOrphans([...nextOrphansHydrated, ...preservedMissing]),
  };
};

export const __testing = {
  normalizeScanConfig,
  scanConfigsHaveOptionChanges,
  mergeRescanResults,
  buildMapSavePayload,
  serializeMapAutosaveSnapshot,
  applyNodeAssetUpdatesToMap,
  isStoredScreenshotAsset,
  getImageCaptureStats,
};

export default function App({ currentRoute, navigateToRoute }) {
  const { consent, openSettings: openPrivacySettings } = useConsent();
  const [urlInput, setUrlInput] = useState('');
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [thumbnailScopeIds, setThumbnailScopeIds] = useState(null);
  const [scanOptions, setScanOptions] = useState({
    inactivePages: false,
    subdomains: false,
    authenticatedPages: false,
    orphanPages: false,
    errorPages: false,
    brokenLinks: false,
    duplicates: false,
    files: false,
    crosslinks: false,
  });
  const [showScanOptions, setShowScanOptions] = useState(false);
  const [lastCompletedScanConfig, setLastCompletedScanConfig] = useState(null);
  const [scanMeta, setScanMeta] = useState({
    brokenLinks: [],
  });
  const [mapInsights, setMapInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState('');
  const [scanLayerAvailability, setScanLayerAvailability] = useState({
    placementPrimary: false,
    placementSubdomain: false,
    placementOrphan: false,
    typePages: false,
    typeFiles: false,
    statusBroken: false,
    statusError: false,
    statusInactive: false,
    statusAuth: false,
    statusDuplicate: false,
  });
  const [scanLayerVisibility, setScanLayerVisibility] = useState({
    placementPrimary: true,
    placementSubdomain: true,
    placementOrphan: true,
    typePages: true,
    typeFiles: true,
    statusBroken: true,
    statusError: true,
    statusInactive: true,
    statusAuth: true,
    statusDuplicate: true,
  });
  const [mapName, setMapName] = useState('');
  const [isEditingMapName, setIsEditingMapName] = useState(false);
  const [root, setRoot] = useState(null);
  const [orphans, setOrphans] = useState([]); // Pages with no parent (numbered 0.x)
  const rootRef = useRef(root);
  const orphansRef = useRef(orphans);
  const [customPageTypes, setCustomPageTypes] = useState([]); // User-added page types
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [fullImageUrl, setFullImageUrl] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [disableCanvasCulling, setDisableCanvasCulling] = useState(false);
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const transformCommitRef = useRef({ raf: null, timer: null });
  const canvasPerformanceRef = useRef({
    fullImageRequests: 0,
    longTasks: 0,
    longTaskMs: 0,
  });
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [connectionColors, setConnectionColors] = useState(DEFAULT_CONNECTION_COLORS);
  const [showColorKey, setShowColorKey] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const [editingColorDepth, setEditingColorDepth] = useState(null);
  const [editingConnectionKey, setEditingConnectionKey] = useState(null);
  const [colorPickerPosition, setColorPickerPosition] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [projects, setProjects] = useState([]); // Project folders
  const [currentMap, setCurrentMap] = useState(null); // Currently loaded map
  const [isImportedMap, setIsImportedMap] = useState(false); // Whether current map is from import
  const [accessLevel, setAccessLevel] = useState(ACCESS_LEVELS.EDIT); // Permission level
  const [showShareModal, setShowShareModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [showCreateMapModal, setShowCreateMapModal] = useState(false);
  const [showSaveMapModal, setShowSaveMapModal] = useState(false);
  const [isSavingMap, setIsSavingMap] = useState(false);
  const [showVersionHistoryDrawer, setShowVersionHistoryDrawer] = useState(false);
  const [welcomeModalDismissedForSession, setWelcomeModalDismissedForSession] = useState(false);
  const [welcomeModalHidden, setWelcomeModalHidden] = useState(() => readWelcomeModalHidden());
  const [welcomeDontShowAgain, setWelcomeDontShowAgain] = useState(false);
  const [mapVersions, setMapVersions] = useState([]);
  const [mapActivity, setMapActivity] = useState([]);
  const [draftVersions, setDraftVersions] = useState([]);
  const [draftLatestVersionId, setDraftLatestVersionId] = useState(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [activeVersionId, setActiveVersionId] = useState(null);
  const [latestVersionId, setLatestVersionId] = useState(null);
  const [showVersionEditPrompt, setShowVersionEditPrompt] = useState(false);
  const [duplicateMapConfig, setDuplicateMapConfig] = useState(null);
  const [pendingLoadMap, setPendingLoadMap] = useState(null);
  const [createMapMode, setCreateMapMode] = useState(false);
  const [createMapDefaults, setCreateMapDefaults] = useState(null);
  const [pendingMapCreation, setPendingMapCreation] = useState(null);
  const [pendingCreateAfterSave, setPendingCreateAfterSave] = useState(null);
  const [pendingLogoutAfterSave, setPendingLogoutAfterSave] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState({});
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [editingMapId, setEditingMapId] = useState(null);
  const [editingMapName, setEditingMapName] = useState('');
  const [shareEmails, setShareEmails] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [sharePermission, setSharePermission] = useState(ACCESS_LEVELS.VIEW); // Permission for shared link
  const [mapSaveConflict, setMapSaveConflict] = useState(null);
  const [collaborationLoading, setCollaborationLoading] = useState(false);
  const [collaborationError, setCollaborationError] = useState('');
  const [collaborationMemberships, setCollaborationMemberships] = useState([]);
  const [collaborationInvites, setCollaborationInvites] = useState([]);
  const [collaborationSettings, setCollaborationSettings] = useState(null);
  const [collaborationAccessRequests, setCollaborationAccessRequests] = useState([]);
  const [collaborationInviteEmail, setCollaborationInviteEmail] = useState('');
  const [collaborationInviteRole, setCollaborationInviteRole] = useState('viewer');
  const [showInviteInboxModal, setShowInviteInboxModal] = useState(false);
  const [showAccessRequestsInboxModal, setShowAccessRequestsInboxModal] = useState(false);
  const [pendingMapInvites, setPendingMapInvites] = useState([]);
  const [pendingMapInvitesLoading, setPendingMapInvitesLoading] = useState(false);
  const [pendingMapInvitesError, setPendingMapInvitesError] = useState('');
  const [pendingAccessRequests, setPendingAccessRequests] = useState([]);
  const [pendingAccessRequestsLoading, setPendingAccessRequestsLoading] = useState(false);
  const [pendingAccessRequestsError, setPendingAccessRequestsError] = useState('');
  const [routeMapGateState, setRouteMapGateState] = useState(null);
  const [routeAccessRequestMessage, setRouteAccessRequestMessage] = useState('');
  const [inviteAcceptState, setInviteAcceptState] = useState(null);
  const [presenceSessions, setPresenceSessions] = useState([]);
  const [mapPermissions, setMapPermissions] = useState(null);
  const [hasCreatedShareLink, setHasCreatedShareLink] = useState(() => {
    return currentRoute?.surface === ROUTE_SURFACES.SHARE;
  });
  const [currentShareAccess, setCurrentShareAccess] = useState(() => {
    const access = currentRoute?.surface === ROUTE_SURFACES.SHARE ? currentRoute?.accessLevel : null;
    return Object.values(ACCESS_LEVELS).includes(access) ? access : null;
  });
  const [scanMessage, setScanMessage] = useState('');
  const [scanElapsed, setScanElapsed] = useState(0);
  const [scanProgress, setScanProgress] = useState({ scanned: 0, queued: 0 });
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [isStoppingScan, setIsStoppingScan] = useState(false);
  const [scanErrorMessage, setScanErrorMessage] = useState('');
  const [scanHistory, setScanHistory] = useState([]);
  const [lastHistoryId, setLastHistoryId] = useState(null);
  const [lastScanUrl, setLastScanUrl] = useState('');
  const [autosaveCheckpointRequest, setAutosaveCheckpointRequest] = useState(null);
  const autosaveTimerRef = useRef(null);
  const lastAutosaveSnapshotRef = useRef('');
  const autosavePendingRef = useRef(null);
  const autosaveInFlightRef = useRef(false);
  const autosaveRetryTimerRef = useRef(null);
  const autosaveRetryDelayRef = useRef(1000);
  const lastAutosaveVersionAtRef = useRef(0);
  const autosaveCheckpointInFlightRef = useRef(new Set());
  const lastAutosaveCheckpointKeyRef = useRef('');
  const assetAutosaveSuppressionUntilRef = useRef(0);
  const versionBaselineRef = useRef(null);
  const lastVersionSnapshotRef = useRef('');
  const clearLoadedMapViewRef = useRef(null);
  const loadSavedMapByIdRef = useRef(null);
  const versionInfoToastRef = useRef(false);
  const seenActivityIdsRef = useRef(new Set());
  const primedActivityMapIdRef = useRef(null);
  const presenceSessionIdRef = useRef('');
  const mapNameEditStartRef = useRef('');
  const scheduleResetViewRef = useRef(null);
  const centerHomeRef = useRef(null);
  const largeMapHomeSceneKeyRef = useRef('');
  const handledAuthRedirectKeyRef = useRef('');

  useEffect(() => {
    const authSuccess = currentRoute?.searchParams?.get('auth_success') || '';
    const authError = currentRoute?.searchParams?.get('auth_error') || '';
    const authProvider = currentRoute?.searchParams?.get('auth_provider') || '';
    const isGoogleAuthPopup = window.opener || window.name === 'vellic_google_auth';

    if (!isGoogleAuthPopup || (!authSuccess && !authError)) return;

    const payload = {
      type: GOOGLE_AUTH_MESSAGE_TYPE,
      success: authSuccess === 'google',
      error: authError || null,
      provider: authProvider || 'google',
      redirectUrl: window.location.href,
      timestamp: Date.now(),
    };

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
    }

    try {
      window.localStorage.setItem(GOOGLE_AUTH_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage failures; postMessage above is still the primary path.
    }

    window.close();
  }, [
    currentRoute?.searchParams,
  ]);

  const resetAutosaveTracking = useCallback(({ snapshot = '' } = {}) => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (autosaveRetryTimerRef.current) {
      clearTimeout(autosaveRetryTimerRef.current);
      autosaveRetryTimerRef.current = null;
    }
    autosavePendingRef.current = null;
    autosaveRetryDelayRef.current = 1000;
    lastAutosaveSnapshotRef.current = snapshot;
  }, []);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedHistoryItems, setSelectedHistoryItems] = useState(new Set());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authContextMessage, setAuthContextMessage] = useState('');
  const [pendingAuthPostSuccessAction, setPendingAuthPostSuccessAction] = useState(null);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [blankUploadDragActive, setBlankUploadDragActive] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [editModalNode, setEditModalNode] = useState(null);
  const [editModalMode, setEditModalMode] = useState('edit'); // 'edit', 'duplicate', 'add'
  const [deleteConfirmNode, setDeleteConfirmNode] = useState(null); // Node pending deletion
  // Generic confirmation modal
  const [confirmModal, setConfirmModal] = useState(null);
  // Shape: { title, message, onConfirm, onCancel, confirmText, cancelText, danger }

  // Generic prompt modal
  const [promptModal, setPromptModal] = useState(null);
  // Shape: { title, message, onConfirm, onCancel, placeholder, defaultValue }

  const [isPanning, setIsPanning] = useState(false); // Track canvas panning state
  const [activeTool, setActiveTool] = useState('select'); // 'select', 'addNode', 'link', 'comments'
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [showCommentsPanel, setShowCommentsPanel] = useState(false);
  const [showReportDrawer, setShowReportDrawer] = useState(false);
  const [showImageReportDrawer, setShowImageReportDrawer] = useState(false);

  useEffect(() => {
    rootRef.current = root;
  }, [root]);

  useEffect(() => {
    orphansRef.current = orphans;
  }, [orphans]);
  const [lastScanAt, setLastScanAt] = useState(null);
  const [expandedStacks, setExpandedStacks] = useState({});
  const [commentingNodeId, setCommentingNodeId] = useState(null); // Node currently showing comment popover
  const [commentingNodeSnapshot, setCommentingNodeSnapshot] = useState(null);
  const [commentPopoverPos, setCommentPopoverPos] = useState({ x: 0, y: 0, side: 'right' }); // Position for popover
  const [savedMapCommentsByNode, setSavedMapCommentsByNode] = useState({});
  const [collaborators] = useState(['matt', 'sarah', 'alex']); // For @ mentions
  const [readMentionCommentIds, setReadMentionCommentIds] = useState(() => new Set());
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [showViewDropdown, setShowViewDropdown] = useState(false);
  const [showOrientationMenu, setShowOrientationMenu] = useState(false);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [mapOrientation, setMapOrientation] = useState(() => (
    currentRoute?.orientation || normalizeMapOrientation(currentRoute?.searchParams?.get('orientation'))
  ));
  const [layers, setLayers] = useState({
    userFlows: true,    // User journey connections
    crossLinks: true,   // Non-hierarchical links
    brokenLinks: true,  // Broken link connections
    pageNumbers: true,
  });
  const [changeFilters, setChangeFilters] = useState(() => ({
    statuses: ANNOTATION_STATUS_OPTIONS.reduce((acc, option) => {
      acc[option.value] = true;
      return acc;
    }, {}),
  }));
  const [selectedNodeIds, setSelectedNodeIds] = useState(new Set());
  const [selectionBox, setSelectionBox] = useState(null);

  // Connection lines state
  const [connectionTool, setConnectionTool] = useState(null); // 'userflow' | 'crosslink' | null
  const [connections, setConnections] = useState([]); // Array of connection objects
  const [drawingConnection, setDrawingConnection] = useState(null); // { type, sourceNodeId, sourceAnchor, currentX, currentY }
  const [hoveredConnection, setHoveredConnection] = useState(null); // ID of hovered connection
  const [connectionMenu, setConnectionMenu] = useState(null); // { connectionId, x, y }
  const [draggingEndpoint, setDraggingEndpoint] = useState(null); // { connectionId, endpoint: 'source'|'target', ... }
  const [nodeMenu, setNodeMenu] = useState(null); // { nodeId, x, y, targetIds }

  // Theme: 'light', 'dark', or 'auto'
  const [theme, setTheme] = useState('auto');

  // Drag & Drop state (dnd-kit)
  const [activeId, setActiveId] = useState(null);
  const [activeNode, setActiveNode] = useState(null);
  const [activeDragData, setActiveDragData] = useState(null); // {number, color}
  const [activeDropZone, setActiveDropZone] = useState(null);
  const [dropZones, setDropZones] = useState([]);
  const [dragCursor, setDragCursor] = useState({ x: 0, y: 0 }); // Track cursor for proximity filtering
  const activeBranchNodeIds = useMemo(
    () => (activeNode ? collectBranchNodeIds(activeNode) : new Set()),
    [activeNode]
  );

  useEffect(() => {
    if (currentRoute?.orientation) {
      setMapOrientation(currentRoute.orientation);
    }
  }, [currentRoute?.orientation]);

  const canvasRef = useRef(null);
  const scanJobIdRef = useRef(null);
  const scanJobAccessTokenRef = useRef(null);
  const eventSourceRef = useRef(null);
  const scanTimerRef = useRef(null);
  const messageTimerRef = useRef(null);
  const contentRef = useRef(null);
  const contentShellRef = useRef(null);
  const layoutRef = useRef(null);
  const lastPointerRef = useRef(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });
  const selectionStartRef = useRef(null);
  const selectionStartClientRef = useRef(null);
  const selectionActiveRef = useRef(false);
  const selectionAdditiveRef = useRef(false);
  const selectionBaseRef = useRef(new Set());
  const selectionStartNodeRef = useRef(null);
  const selectionStartedOnNodeRef = useRef(false);
  const suppressNodeClickRef = useRef(false);
  const viewDropdownRef = useRef(null);
  const colorKeyRef = useRef(null);
  const orientationMenuRef = useRef(null);
  const imageMenuRef = useRef(null);
  const scanOptionsRef = useRef(null);
  const blankUploadInputRef = useRef(null);
  const thumbnailInFlightRef = useRef(new Set());
  const thumbnailAbortControllersRef = useRef(new Map());
  const thumbnailActiveRef = useRef(0);
  const thumbnailLoadStartRef = useRef(new Map());
  const thumbnailTotalTimeRef = useRef(0);
  const thumbnailAttemptsRef = useRef(new Map());
  const thumbnailExpectedRef = useRef(new Set());
  const thumbnailLoadedRef = useRef(new Set());
  const thumbnailFinishedRef = useRef(new Set());
  const thumbnailErrorRef = useRef(new Set());
  const imageCaptureSavedRef = useRef(new Set());
  const imageCaptureAppliedRef = useRef(new Set());
  const imageCaptureAssetCursorRef = useRef(0);
  const captureIssuesRef = useRef(new Map());
  const thumbnailBatchIndexRef = useRef(0);
  const thumbnailBatchTotalRef = useRef(0);
  const thumbnailCompletedRef = useRef(false);
  const thumbnailStopRequestedRef = useRef(false);
  const screenshotStopRequestedRef = useRef(false);
  const thumbnailSessionRef = useRef(0);
  const thumbnailElapsedStartRef = useRef(0);
  const thumbnailElapsedTimerRef = useRef(null);
  const thumbnailAutosaveTimerRef = useRef(null);
  const pendingNodeAssetUpdatesRef = useRef(new Map());
  const nodeAssetSaveInFlightRef = useRef(false);
  const nodeAssetSaveRetryTimerRef = useRef(null);
  const imageCaptureJobRef = useRef(null);
  const imageCaptureAppliedUpdateKeysRef = useRef(new Set());
  const imageCaptureReattachMapRef = useRef(null);
  const screenshotAssetValidationSignatureRef = useRef('');
  const thumbnailAuthToastShownRef = useRef(false);
  const thumbnailFailureToastShownRef = useRef(false);
  const MAX_THUMBNAIL_CONCURRENCY = 3;
  const FULL_SCREENSHOT_CONCURRENCY = 2;
  const MAX_THUMBNAIL_ATTEMPTS = 3;
  const THUMBNAIL_RETRY_BASE_DELAY = 800;
  const [thumbnailSessionId, setThumbnailSessionId] = useState(0);
  const [, setThumbnailQueueSize] = useState(0);
  const [, setThumbnailActiveCount] = useState(0);
  const [thumbnailReloadMap, setThumbnailReloadMap] = useState({});
  const [invalidThumbnailAssetIds, setInvalidThumbnailAssetIds] = useState(() => new Set());
  const [invalidFullScreenshotAssetIds, setInvalidFullScreenshotAssetIds] = useState(() => new Set());
  const [thumbnailElapsedMs, setThumbnailElapsedMs] = useState(0);
  const [activeImageCaptureJob, setActiveImageCaptureJob] = useState(null);
  const [thumbnailStats, setThumbnailStats] = useState({
    mode: null,
    total: 0,
    saved: 0,
    verified: 0,
    loaded: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    avgMs: 0,
    cached: 0,
    unavailable: 0,
    phase: null,
    recoveryPass: 0,
    retrying: 0,
    scaleTier: null,
    stageIndex: 0,
    stageTotal: 0,
    paused: false,
    finalizing: false,
    stopped: false,
  });
  const [captureIssues, setCaptureIssues] = useState([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateSize = () => {
      setCanvasSize({
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Close view dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (viewDropdownRef.current && !viewDropdownRef.current.contains(e.target)) {
        setShowViewDropdown(false);
      }
    };
    if (showViewDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showViewDropdown]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (colorKeyRef.current && !colorKeyRef.current.contains(e.target)) {
        setShowColorKey(false);
      }
    };
    if (showColorKey) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showColorKey]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (orientationMenuRef.current && !orientationMenuRef.current.contains(e.target)) {
        setShowOrientationMenu(false);
      }
    };
    if (showOrientationMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showOrientationMenu]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Shift') setIsShiftPressed(true);
    };
    const handleKeyUp = (e) => {
      if (e.key === 'Shift') setIsShiftPressed(false);
    };
    const handleBlur = () => setIsShiftPressed(false);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (imageMenuRef.current && !imageMenuRef.current.contains(e.target)) {
        setShowImageMenu(false);
      }
    };
    if (showImageMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showImageMenu]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (scanOptionsRef.current && !scanOptionsRef.current.contains(e.target)) {
        setShowScanOptions(false);
      }
    };
    if (showScanOptions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showScanOptions]);

  // Apply theme to document and listen for system changes
  useEffect(() => {
    const root = document.documentElement;

    const applyTheme = () => {
      if (theme === 'auto') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.setAttribute('data-theme', systemTheme);
      } else {
        root.setAttribute('data-theme', theme);
      }
    };

    applyTheme();

    // Listen for system theme changes when in auto mode
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'auto') {
        applyTheme();
      }
    };

    mediaQuery.addEventListener('change', handleChange);

    // Only save to localStorage if user explicitly changed it
    if (theme !== 'auto') {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    } else {
      localStorage.removeItem(THEME_STORAGE_KEY);
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    }

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const hasMap = !!root;
  const isUnsavedScannedMap = hasMap && !currentMap?.id && !isImportedMap;
  const currentScanConfig = useMemo(() => normalizeScanConfig({
    url: urlInput,
    options: scanOptions,
  }), [urlInput, scanOptions]);
  const hasTopbarRescanChanges = isUnsavedScannedMap
    && scanConfigsHaveOptionChanges(currentScanConfig, lastCompletedScanConfig);
  useEffect(() => {
    if (!hasMap) {
      setSelectedNodeIds(new Set());
      setSelectionBox(null);
      setThumbnailScopeIds(null);
      setShowImageMenu(false);
      setShowImageReportDrawer(false);
    }
  }, [hasMap]);

  useEffect(() => {
    setInvalidThumbnailAssetIds(new Set());
    setInvalidFullScreenshotAssetIds(new Set());
    screenshotAssetValidationSignatureRef.current = '';
  }, [currentMap?.id]);

  const hasAnyThumbnails = useMemo(() => {
    if (!root) return false;
    const nodes = collectAllNodesWithOrphans(root, orphans);
    return nodes.some((node) => isStoredScreenshotAsset(node.thumbnailUrl) && !invalidThumbnailAssetIds.has(node.id));
  }, [root, orphans, invalidThumbnailAssetIds]);

  const hasStoredImageAsset = useCallback(isStoredScreenshotAsset, []);

  const hasTerminalThumbnailFailure = useCallback(() => false, []);

  const hasAnyDownloadableThumbnails = useMemo(() => {
    if (!root) return false;
    const nodes = collectAllNodesWithOrphans(root, orphans);
    return nodes.some((node) => hasStoredImageAsset(node.thumbnailUrl) && !invalidThumbnailAssetIds.has(node.id));
  }, [root, orphans, hasStoredImageAsset, invalidThumbnailAssetIds]);

  const hasAnyFullScreenshotAssets = useMemo(() => {
    if (!root) return false;
    const nodes = collectAllNodesWithOrphans(root, orphans);
    return nodes.some((node) => hasStoredImageAsset(node.fullScreenshotUrl) && !invalidFullScreenshotAssetIds.has(node.id));
  }, [root, orphans, hasStoredImageAsset, invalidFullScreenshotAssetIds]);

  const hasSelectedDownloadableThumbnails = useMemo(() => {
    if (!root || selectedNodeIds.size === 0) return false;
    const selectedIds = selectedNodeIds;
    const nodes = collectAllNodesWithOrphans(root, orphans);
    return nodes.some((node) => selectedIds.has(node.id) && hasStoredImageAsset(node.thumbnailUrl) && !invalidThumbnailAssetIds.has(node.id));
  }, [orphans, root, selectedNodeIds, hasStoredImageAsset, invalidThumbnailAssetIds]);

  const hasSelectedFullScreenshotAssets = useMemo(() => {
    if (!root || selectedNodeIds.size === 0) return false;
    const selectedIds = selectedNodeIds;
    const nodes = collectAllNodesWithOrphans(root, orphans);
    return nodes.some((node) => selectedIds.has(node.id) && hasStoredImageAsset(node.fullScreenshotUrl) && !invalidFullScreenshotAssetIds.has(node.id));
  }, [orphans, root, selectedNodeIds, hasStoredImageAsset, invalidFullScreenshotAssetIds]);

  const hasAnyDownloadableImages = hasAnyDownloadableThumbnails || hasAnyFullScreenshotAssets;
  const hasSelectedDownloadableImages = hasSelectedDownloadableThumbnails || hasSelectedFullScreenshotAssets;

  const thumbnailCaptureStats = useMemo(() => {
    return getImageCaptureStats({
      rootNode: root,
      orphanNodes: orphans,
      assetKey: 'thumbnailUrl',
      invalidAssetIds: invalidThumbnailAssetIds,
      isUnavailable: hasTerminalThumbnailFailure,
    });
  }, [root, orphans, invalidThumbnailAssetIds, hasTerminalThumbnailFailure]);
  const allThumbnailsCaptured = thumbnailCaptureStats.allCaptured;

  const fullScreenshotCaptureStats = useMemo(() => {
    return getImageCaptureStats({
      rootNode: root,
      orphanNodes: orphans,
      assetKey: 'fullScreenshotUrl',
      invalidAssetIds: invalidFullScreenshotAssetIds,
    });
  }, [root, orphans, invalidFullScreenshotAssetIds]);

  const maxDepth = useMemo(() => {
    const orphanDepth = (orphans || []).reduce((max, orphan) => {
      return Math.max(max, getMaxDepth(orphan));
    }, 0);
    return Math.max(getMaxDepth(root), orphanDepth);
  }, [root, orphans]);
  const totalNodes = useMemo(() => countNodes(root), [root]);
  const layerVisibility = useMemo(() => ({
    placementPrimary: scanLayerAvailability.placementPrimary ? scanLayerVisibility.placementPrimary : true,
    placementSubdomain: scanLayerAvailability.placementSubdomain ? scanLayerVisibility.placementSubdomain : true,
    placementOrphan: scanLayerAvailability.placementOrphan ? scanLayerVisibility.placementOrphan : true,
    typePages: scanLayerAvailability.typePages ? scanLayerVisibility.typePages : true,
    typeFiles: scanLayerAvailability.typeFiles ? scanLayerVisibility.typeFiles : true,
    statusBroken: scanLayerAvailability.statusBroken ? scanLayerVisibility.statusBroken : true,
    statusError: scanLayerAvailability.statusError ? scanLayerVisibility.statusError : true,
    statusInactive: scanLayerAvailability.statusInactive ? scanLayerVisibility.statusInactive : true,
    statusAuth: scanLayerAvailability.statusAuth ? scanLayerVisibility.statusAuth : true,
    statusDuplicate: scanLayerAvailability.statusDuplicate ? scanLayerVisibility.statusDuplicate : true,
  }), [scanLayerAvailability, scanLayerVisibility]);

  const badgeVisibility = useMemo(() => ({
    subdomains: false,
    orphanPages: false,
    files: true,
    brokenLinks: true,
    inactivePages: true,
    authenticatedPages: true,
    errorPages: true,
    duplicates: true,
  }), []);

  const hasScannedNodeData = useMemo(() => {
    if (!hasMap) return false;
    return collectAllNodesWithOrphans(root, orphans).some((node) => (
      node?.statusCode != null
      || node?.httpStatus != null
      || node?.responseTime != null
      || !!node?.scanStatus
      || !!node?.titleSource
    ));
  }, [hasMap, root, orphans]);
  const isScanOrImportMap = hasMap && (isImportedMap || !!lastScanAt || hasScannedNodeData);
  const showDirectNodeDeleteAction = !isScanOrImportMap;

  const reportLayout = useMemo(() => {
    if (!root) return null;
    const expanded = buildExpandedStackMap(root, orphans);
    return computeLayout(root, orphans, showThumbnails, expanded, {
      mode: 'after-root',
      renderOrphanChildren: true,
    });
  }, [root, orphans, showThumbnails]);

  const reportNumberMap = useMemo(() => {
    const map = new Map();
    if (!reportLayout) return map;
    reportLayout.nodes.forEach((value, id) => {
      map.set(id, value.number);
    });
    return map;
  }, [reportLayout]);

  const visibleCaptureIssues = useMemo(() => {
    const issueMap = new Map(captureIssues.map((issue) => [issue.id, issue]));
    const nodes = collectAllNodesWithOrphans(root, orphans);
    nodes.forEach((node) => {
      if (!node?.id) return;
      if (node.thumbnailCaptureFailed) {
        const issue = normalizeCaptureIssue({
          nodeId: node.id,
          pageNumber: reportNumberMap.get(node.id) || node.number || node.pageNumber || '',
          title: node.title,
          url: node.url,
          status: 'failed',
          error: node.thumbnailCaptureError || 'Preview unavailable',
          detail: node.thumbnailCaptureError || 'Preview unavailable',
          node,
        });
        issueMap.set(issue.id, issue);
      }
      if (invalidThumbnailAssetIds.has(node.id) && node.thumbnailUrl) {
        const issue = normalizeCaptureIssue({
          nodeId: node.id,
          pageNumber: reportNumberMap.get(node.id) || node.number || node.pageNumber || '',
          title: node.title,
          url: node.url,
          status: 'image_load',
          error: 'Image failed to load',
          node,
        });
        issueMap.set(issue.id, issue);
      }
      if (invalidFullScreenshotAssetIds.has(node.id) && node.fullScreenshotUrl) {
        const issue = normalizeCaptureIssue({
          nodeId: node.id,
          pageNumber: reportNumberMap.get(node.id) || node.number || node.pageNumber || '',
          title: node.title,
          url: node.url,
          status: 'missing_asset',
          error: 'Missing saved asset',
          node,
        });
        issueMap.set(issue.id, issue);
      }
    });
    return Array.from(issueMap.values());
  }, [captureIssues, invalidFullScreenshotAssetIds, invalidThumbnailAssetIds, orphans, reportNumberMap, root]);

  const parentOptions = useMemo(() => {
    if (!root) return [];
    const result = [];
    const seen = new Set();
    const walk = (node) => {
      if (!node || seen.has(node.id)) return;
      seen.add(node.id);
      const pageNumber = reportNumberMap.get(node.id) || '';
      const depth = reportLayout?.nodes.get(node.id)?.depth ?? 0;
      result.push({
        id: node.id,
        title: node.title,
        url: node.url,
        pageType: node.pageType,
        pageNumber,
        depth,
      });
      node.children?.forEach(walk);
    };
    walk(root);
    (orphans || []).forEach(walk);
    return result;
  }, [root, orphans, reportNumberMap, reportLayout]);

  const specialParentOptions = useMemo(() => {
    const showHomeOption = editModalMode === 'add' && !root;
    if (showHomeOption) {
      return [{ value: HOME_PARENT_ID, label: 'No Parent (Home)' }];
    }
    return [
      { value: ORPHAN_PARENT_ID, label: 'No Parent (Orphan)', type: 'orphan' },
      { value: SUBDOMAIN_PARENT_ID, label: 'No Parent (Subdomain)', type: 'subdomain' },
    ];
  }, [editModalMode, root]);

  useEffect(() => {
    if (!root) return;
    const nodesForCounts = collectAllNodesWithOrphans(root, orphans);
    const forestIndexForCounts = buildForestIndex(root, orphans);
    const isTopLevelOrphanRootMeta = (meta) => meta?.treeType === 'orphan' && meta.parentId === null;
    const hasInactive = nodesForCounts.some((node) => (
      node.scanStatus !== 'scan_limited' && !node.isError && !node.authRequired && (!!node.isInactive || node.orphanType === 'inactive')
    ));
    const hasAuth = nodesForCounts.some((node) => !!node.authRequired);
    const hasErrors = nodesForCounts.some((node) => !!node.isError);
    const hasBroken = nodesForCounts.some((node) => {
      const meta = forestIndexForCounts.nodes.get(node.id);
      if (isTopLevelOrphanRootMeta(meta)) return false;
      return !!node.isBroken || node.orphanType === 'broken';
    });
    const hasDuplicates = nodesForCounts.some((node) => !!node.isDuplicate);
    const hasSubdomains = (orphans || []).some((orphan) => !!orphan.subdomainRoot);
    const hasOrphans = (orphans || []).some((orphan) => !orphan.subdomainRoot);

    setScanLayerAvailability((prev) => ({
      ...prev,
      placementPrimary: !!root,
      placementSubdomain: hasSubdomains,
      placementOrphan: hasOrphans,
      // Type layers hidden for now (until scan can classify templates)
      typePages: false,
      typeFiles: false,
      statusBroken: hasBroken,
      statusError: hasErrors,
      statusInactive: hasInactive,
      statusAuth: hasAuth,
      statusDuplicate: hasDuplicates,
    }));
  }, [root, orphans]);

  const reportEntries = useMemo(() => {
    if (!root) return [];
    const entries = buildReportEntries(root, orphans, reportNumberMap, reportLayout, colors);
    return entries.sort((a, b) => {
      const groupRank = (entry) => {
        if (entry.number.startsWith('s')) return 1;
        if (entry.number.startsWith('0.')) return 2;
        return 0;
      };
      const groupDiff = groupRank(a) - groupRank(b);
      if (groupDiff !== 0) return groupDiff;
      return comparePageNumbers(a.number, b.number);
    });
  }, [root, orphans, reportNumberMap, reportLayout, colors]);

  const reportRows = useMemo(
    () => reportEntries,
    [reportEntries]
  );

  const reportStats = useMemo(() => {
    const stats = { total: reportEntries.length };
    REPORT_TYPE_OPTIONS.forEach((option) => {
      stats[option.key] = 0;
    });
    reportEntries.forEach((entry) => {
      entry.types.forEach((type) => {
        stats[type] = (stats[type] || 0) + 1;
      });
    });
    return stats;
  }, [reportEntries]);

  const pageInsightLookup = useMemo(() => {
    const map = new Map();
    (mapInsights?.pageInsights || []).forEach((entry) => {
      if (entry.pageId) map.set(entry.pageId, entry);
      if (entry.url) map.set(entry.url, entry);
    });
    return map;
  }, [mapInsights]);

  const getPageInsightForNode = useCallback((node) => {
    if (!node) return null;
    return pageInsightLookup.get(node.id) || pageInsightLookup.get(node.url) || null;
  }, [pageInsightLookup]);

  const getVersionSnapshot = useCallback(() => {
    const latestRoot = rootRef.current || root;
    const latestOrphans = orphansRef.current || orphans;
    const tree = prepareMapTreeForSave({ root: latestRoot, orphans: latestOrphans });
    return {
      root: tree.root,
      orphans: tree.orphans,
      connections,
      colors,
      connectionColors,
    };
  }, [root, orphans, connections, colors, connectionColors]);

  const serializeVersionSnapshot = useCallback((snapshot) => {
    try {
      return JSON.stringify(snapshot);
    } catch {
      return '';
    }
  }, []);

  const applyLiveDocumentToCanvas = useCallback((document) => {
    if (!document) return;
    setRoot(document.root || null);
    setOrphans(normalizeOrphans(document.orphans));
    setConnections(document.connections || []);
    setColors(document.colors || DEFAULT_COLORS);
    setConnectionColors(document.connectionColors || DEFAULT_CONNECTION_COLORS);
    setMapName(document.name || 'Untitled Map');
    setProjects((prev) => prev.map((project) => ({
      ...project,
      maps: (project.maps || []).map((map) => (
        map.id === document.mapId
          ? {
            ...map,
            name: document.name || map.name || 'Untitled Map',
            url: document.root?.url || map.url || '',
            updated_at: document.mapUpdatedAt || map.updated_at || null,
          }
          : map
      )),
    })));
    setCurrentMap((prev) => (
      prev
        ? {
          ...prev,
          name: document.name || prev.name || 'Untitled Map',
          notes: document.notes ?? prev.notes ?? null,
          url: document.root?.url || prev.url || '',
          updated_at: document.mapUpdatedAt || prev.updated_at || null,
        }
        : prev
    ));
  }, []);

  const getLocalLiveDocument = useCallback(() => ({
    mapId: currentMap?.id || null,
    version: 0,
    name: (mapName || currentMap?.name || 'Untitled Map').trim() || 'Untitled Map',
    notes: currentMap?.notes ?? null,
    root,
    orphans,
    connections,
    colors,
    connectionColors,
    mapUpdatedAt: currentMap?.updated_at || null,
    lastOpId: null,
    lastActorId: currentUser?.id || null,
  }), [
    colors,
    connectionColors,
    connections,
    currentMap?.id,
    currentMap?.name,
    currentMap?.notes,
    currentMap?.updated_at,
    currentUser?.id,
    mapName,
    orphans,
    root,
  ]);

  const setDraftVersionFromSnapshot = useCallback((snapshot, label) => {
    if (!snapshot?.root) return;
    const id = `draft-${Date.now()}`;
    setDraftVersions([{
      id,
      version_number: 1,
      created_at: new Date().toISOString(),
      name: (label || 'Updated').trim() || 'Updated',
      notes: '',
      root: snapshot.root,
      orphans: snapshot.orphans || [],
      connections: snapshot.connections || [],
      colors: snapshot.colors || DEFAULT_COLORS,
      connectionColors: snapshot.connectionColors || DEFAULT_CONNECTION_COLORS,
    }]);
    setDraftLatestVersionId(id);
  }, []);

  const isViewingHistoricalVersion = useMemo(() => {
    if (!activeVersionId || !latestVersionId) return false;
    return activeVersionId !== latestVersionId;
  }, [activeVersionId, latestVersionId]);

  const featureGatesEnabled = PERMISSION_GATING_UI_ENABLED || COEDITING_EXPERIMENT_UI_ENABLED;
  const resolvedCoeditingMode = featureGatesEnabled && currentMap?.id
    ? String(mapPermissions?.coediting?.mode || 'disabled').trim().toLowerCase()
    : 'disabled';
  const coeditingModeReason = String(mapPermissions?.coediting?.reason || '').trim().toLowerCase();
  const isCoeditingReadOnlyMode = !!(
    COEDITING_EXPERIMENT_UI_ENABLED
    && currentMap?.id
    && resolvedCoeditingMode === 'read_only'
  );
  const coeditingReadOnlyMessage = useMemo(() => {
    if (!isCoeditingReadOnlyMode) return '';
    if (coeditingModeReason === 'health_degraded') {
      return 'Live editing is temporarily read-only while the realtime service recovers.';
    }
    if (coeditingModeReason === 'role_read_only') {
      return 'Live editing is read-only for your current role on this map.';
    }
    return 'Live editing is currently read-only for this map.';
  }, [coeditingModeReason, isCoeditingReadOnlyMode]);

  const liveModeCanEdit = (
    featureGatesEnabled
    && isLoggedIn
    && currentMap?.id
    && mapPermissions?.features
      ? !!mapPermissions.features.mapEdit
      : accessLevel === ACCESS_LEVELS.EDIT
  );

  const isLiveEditingModeActive = !!(
    COEDITING_EXPERIMENT_UI_ENABLED
    && isLoggedIn
    && currentMap?.id
    && root
    && liveModeCanEdit
    && resolvedCoeditingMode === 'enabled'
    && !isImportedMap
    && !isViewingHistoricalVersion
  );

  const isLiveRealtimeModeActive = !!(
    COEDITING_EXPERIMENT_UI_ENABLED
    && isLoggedIn
    && currentMap?.id
    && root
    && resolvedCoeditingMode !== 'disabled'
    && !isImportedMap
    && !isViewingHistoricalVersion
  );
  const areMapPermissionsPending = !!(
    featureGatesEnabled
    && isLoggedIn
    && currentMap?.id
    && !mapPermissions
  );

  const isMapUpdateConflictError = useCallback((error) => {
    return error?.status === 409 && error?.code === 'MAP_UPDATE_CONFLICT';
  }, []);

  const isMapNameConflictError = useCallback((error) => {
    return error?.status === 409 && error?.code === 'MAP_NAME_CONFLICT';
  }, []);

  const registerMapConflict = useCallback(({ error, mapId, source }) => {
    setMapSaveConflict({
      mapId,
      source: source || 'update',
      detectedAt: Date.now(),
      expectedUpdatedAt: error?.payload?.conflict?.expected_updated_at || null,
      actualUpdatedAt: error?.payload?.conflict?.actual_updated_at || null,
    });
  }, []);

  const getMapConflictActualUpdatedAt = useCallback((error) => (
    error?.payload?.conflict?.actual_updated_at
    || error?.payload?.latest?.updated_at
    || null
  ), []);

  const updateMapWithLatestTimestamp = useCallback(async (mapId, payload, { expectedUpdatedAt } = {}) => {
    try {
      return await api.updateMap(mapId, payload, { expectedUpdatedAt });
    } catch (error) {
      const actualUpdatedAt = getMapConflictActualUpdatedAt(error);
      if (!isMapUpdateConflictError(error) || !actualUpdatedAt || actualUpdatedAt === expectedUpdatedAt) {
        throw error;
      }
      return api.updateMap(mapId, payload, { expectedUpdatedAt: actualUpdatedAt });
    }
  }, [getMapConflictActualUpdatedAt, isMapUpdateConflictError]);

  const flushAutosave = useCallback(() => {
    if (isCoeditingReadOnlyMode) {
      autosavePendingRef.current = null;
      if (autosaveRetryTimerRef.current) {
        clearTimeout(autosaveRetryTimerRef.current);
        autosaveRetryTimerRef.current = null;
      }
      return;
    }
    if (autosaveInFlightRef.current) return;
    const pending = autosavePendingRef.current;
    if (!pending) return;

    autosaveInFlightRef.current = true;
    updateMapWithLatestTimestamp(pending.mapId, pending.payload, {
      expectedUpdatedAt: pending.expectedUpdatedAt,
    })
      .then(({ map }) => {
        autosaveInFlightRef.current = false;
        autosaveRetryDelayRef.current = 1000;
        lastAutosaveSnapshotRef.current = pending.snapshot;
        setCurrentMap(map);
        setMapSaveConflict(null);
        setProjects(prev => prev.map(p => ({
          ...p,
          maps: (p.maps || []).map(m => (m.id === map.id ? map : m)),
        })));
        setAutosaveCheckpointRequest({
          mapId: map.id,
          changedAt: Date.now(),
          skipVersionCheckpoint: Boolean(pending.skipVersionCheckpoint),
          force: Boolean(pending.forceVersionCheckpoint),
          snapshot: {
            root: pending.payload.root,
            orphans: pending.payload.orphans,
            connections: pending.payload.connections,
            colors: pending.payload.colors,
            connectionColors: pending.payload.connectionColors,
          },
        });

        if (autosavePendingRef.current?.snapshot === pending.snapshot) {
          autosavePendingRef.current = null;
        }

        if (autosavePendingRef.current) {
          flushAutosave();
        }
      })
      .catch((error) => {
        autosaveInFlightRef.current = false;
        if (isMapUpdateConflictError(error)) {
          if (autosavePendingRef.current?.snapshot === pending.snapshot) {
            autosavePendingRef.current = null;
          }
          const actualUpdatedAt = getMapConflictActualUpdatedAt(error);
          if (actualUpdatedAt) {
            setCurrentMap((current) => (
              current?.id === pending.mapId
                ? { ...current, updated_at: actualUpdatedAt }
                : current
            ));
            setProjects((prev) => prev.map((project) => ({
              ...project,
              maps: (project.maps || []).map((map) => (
                map.id === pending.mapId ? { ...map, updated_at: actualUpdatedAt } : map
              )),
            })));
            setMapSaveConflict(null);
            return;
          }
          registerMapConflict({ error, mapId: pending.mapId, source: 'autosave' });
          return;
        }
        if (autosaveRetryTimerRef.current) return;
        const delay = autosaveRetryDelayRef.current;
        autosaveRetryDelayRef.current = Math.min(delay * 2, 30000);
        autosaveRetryTimerRef.current = setTimeout(() => {
          autosaveRetryTimerRef.current = null;
          flushAutosave();
        }, delay);
      });
  }, [getMapConflictActualUpdatedAt, isCoeditingReadOnlyMode, isMapUpdateConflictError, registerMapConflict, updateMapWithLatestTimestamp]);

  useEffect(() => {
    const handleOnline = () => flushAutosave();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flushAutosave]);

  useEffect(() => {
    return () => {
      if (autosaveRetryTimerRef.current) clearTimeout(autosaveRetryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isCoeditingReadOnlyMode) return;
    autosavePendingRef.current = null;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (autosaveRetryTimerRef.current) {
      clearTimeout(autosaveRetryTimerRef.current);
      autosaveRetryTimerRef.current = null;
    }
  }, [isCoeditingReadOnlyMode]);

  // Cleanup all timers and EventSource on unmount
  useEffect(() => {
    return () => {
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
      if (messageTimerRef.current) clearInterval(messageTimerRef.current);
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (thumbnailAutosaveTimerRef.current) clearTimeout(thumbnailAutosaveTimerRef.current);
      if (nodeAssetSaveRetryTimerRef.current) clearTimeout(nodeAssetSaveRetryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!currentMap?.id || !root || isViewingHistoricalVersion || isLiveEditingModeActive || isCoeditingReadOnlyMode) return;
      const snapshot = getVersionSnapshot();
      const serialized = serializeVersionSnapshot(snapshot);
      if (!serialized || serialized === lastVersionSnapshotRef.current) return;
      const payload = {
        ...snapshot,
        name: 'Updated',
      };
      const url = `${API_BASE}/api/maps/${currentMap.id}/versions`;
      const body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        const sent = navigator.sendBeacon(url, blob);
        if (sent) return;
      }
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body,
        keepalive: true,
      }).catch(() => {});
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentMap?.id, root, isViewingHistoricalVersion, getVersionSnapshot, serializeVersionSnapshot, isLiveEditingModeActive, isCoeditingReadOnlyMode]);

  const reportTitle = useMemo(() => {
    return root?.title || getHostname(root?.url) || 'Website';
  }, [root]);

  const otherPresenceSessions = useMemo(() => {
    const currentSessionId = presenceSessionIdRef.current;
    return (presenceSessions || []).filter(
      (session) => session?.sessionId && session.sessionId !== currentSessionId
    );
  }, [presenceSessions]);

  const presenceCollaborators = useMemo(
    () => buildPresenceCollaborators(otherPresenceSessions, { excludeActorId: currentUser?.id || null }),
    [currentUser?.id, otherPresenceSessions],
  );

  const reportTimestamp = useMemo(() => {
    if (!lastScanAt) return '';
    return new Date(lastScanAt).toLocaleString();
  }, [lastScanAt]);

  const toastTimeoutRef = useRef(null);

  const showToast = useCallback((msg, type = 'info', persistent = false) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setToast({ message: msg, type, persistent });
    if (!persistent) {
      toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
    }
  }, []);

  const dismissToast = () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setToast(null);
  };

  const versionsForDrawer = currentMap?.id ? mapVersions : (root ? draftVersions : []);
  const latestVersionForDrawer = currentMap?.id
    ? latestVersionId
    : (draftLatestVersionId || draftVersions[0]?.id || null);
  const activeVersionForDrawer = currentMap?.id ? activeVersionId : latestVersionForDrawer;
  const isVersionLoading = currentMap?.id ? isLoadingVersions : false;
  const activityForDrawer = currentMap?.id ? mapActivity : [];
  const isActivityDrawerLoading = currentMap?.id ? isLoadingActivity : false;
  const useBackendComments = !!(isLoggedIn && currentMap?.id);

  const loadSavedMapComments = useCallback(async (mapId = currentMap?.id) => {
    if (!mapId || !isLoggedIn) {
      setSavedMapCommentsByNode({});
      return;
    }
    try {
      const response = await api.getMapComments(mapId);
      setSavedMapCommentsByNode(response.commentsByNode || {});
    } catch (error) {
      console.error('Load map comments error:', error);
      if (error?.status === 404) {
        setSavedMapCommentsByNode({});
      }
    }
  }, [currentMap?.id, isLoggedIn]);

  const loadMapActivity = useCallback(async (
    mapId = currentMap?.id,
    { silent = false, allowToast = false } = {}
  ) => {
    if (!mapId || !isLoggedIn || !currentUser) {
      setMapActivity([]);
      seenActivityIdsRef.current = new Set();
      primedActivityMapIdRef.current = null;
      return;
    }

    if (!silent) {
      setIsLoadingActivity(true);
    }

    try {
      const response = await api.getMapActivity(mapId, { limit: 30, offset: 0 });
      const activity = Array.isArray(response.activity) ? response.activity : [];
      const previousIds = seenActivityIdsRef.current;
      const isPrimed = primedActivityMapIdRef.current === mapId;

      if (allowToast && isPrimed) {
        const nextToastEvent = activity.find((event) => (
          event?.id
          && !previousIds.has(event.id)
          && event?.actor?.userId
          && event.actor.userId !== currentUser.id
          && event.eventScope !== 'content'
        ));
        const toastMessage = buildActivityToastMessage(nextToastEvent);
        if (toastMessage) {
          showToast(toastMessage, 'info');
        }
      }

      seenActivityIdsRef.current = new Set(
        activity.slice(0, MAX_TRACKED_ACTIVITY_IDS).map((event) => event.id).filter(Boolean)
      );
      primedActivityMapIdRef.current = mapId;
      setMapActivity(activity);
    } catch (error) {
      console.error('Load map activity error:', error);
      if (error?.status === 404) {
        setMapActivity([]);
      }
    } finally {
      if (!silent) {
        setIsLoadingActivity(false);
      }
    }
  }, [currentMap?.id, currentUser, isLoggedIn, showToast]);

  useEffect(() => {
    if (!useBackendComments) {
      setSavedMapCommentsByNode({});
      return;
    }
    loadSavedMapComments(currentMap?.id);
  }, [currentMap?.id, loadSavedMapComments, useBackendComments]);

  useEffect(() => {
    if (!useBackendComments || !currentMap?.id) return undefined;

    const refreshComments = () => {
      loadSavedMapComments(currentMap.id);
    };

    const intervalId = window.setInterval(refreshComments, 4000);
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshComments();
      }
    };

    window.addEventListener('focus', refreshComments);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshComments);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentMap?.id, loadSavedMapComments, useBackendComments]);

  const visibleOrphans = useMemo(() => {
    const nextOrphans = (orphans || []).filter(Boolean);
    if (!useBackendComments) return nextOrphans;
    return nextOrphans.map((orphan) => attachCommentsToNodeTree(orphan, savedMapCommentsByNode));
  }, [orphans, savedMapCommentsByNode, useBackendComments]);

  const renderRoot = useMemo(() => {
    if (!useBackendComments) return root;
    return attachCommentsToNodeTree(root, savedMapCommentsByNode);
  }, [root, savedMapCommentsByNode, useBackendComments]);

  const largeMapNodeCount = useMemo(() => (
    currentMap?.largeMapShell
      ? Number(currentMap.nodeCount || 0)
      : countLargeMapNodes(root, orphans)
  ), [currentMap?.largeMapShell, currentMap?.nodeCount, orphans, root]);

  const useLargeMapSurface = shouldUseLargeMapSurface({
    nodeCount: largeMapNodeCount,
    hasSavedMap: !!currentMap?.id,
  });

  // Build a unified index for root + orphan + subdomain trees
  const forestIndex = useMemo(() => (
    useLargeMapSurface ? { nodes: new Map(), trees: new Map() } : buildForestIndex(root, orphans)
  ), [root, orphans, useLargeMapSurface]);

  const mapLayout = useMemo(() => {
    if (useLargeMapSurface) return null;
    if (!renderRoot) return null;
    return computeLayout(renderRoot, visibleOrphans, showThumbnails, expandedStacks, {
      mode: 'after-root',
      renderOrphanChildren: true,
      orientation: mapOrientation,
    });
  }, [expandedStacks, mapOrientation, renderRoot, showThumbnails, useLargeMapSurface, visibleOrphans]);

  useEffect(() => {
    layoutRef.current = mapLayout;
  }, [mapLayout]);

  useEffect(() => {
    if (!mapLayout?.nodes?.size) return;
    scheduleResetViewRef.current?.();
  }, [mapLayout?.orientation, mapLayout?.nodes?.size]);

  const getNodeStackSelectionIds = useCallback((nodeId) => {
    if (!nodeId) return [];
    const fallbackIds = [nodeId];
    const layoutNode = layoutRef.current?.nodes?.get(nodeId);
    const stackInfo = layoutNode?.stackInfo;
    if (!stackInfo?.collapsed || !stackInfo.parentId) {
      return fallbackIds;
    }

    const stackParent = collectAllNodesWithOrphans(root, orphans)
      .find((node) => sameId(node.id, stackInfo.parentId));
    const stackChildren = Array.isArray(stackParent?.children) ? stackParent.children : [];
    const stackIds = stackChildren.reduce((ids, child) => collectNodeAndDescendantIds(child, ids), []);
    return stackIds.length ? stackIds : fallbackIds;
  }, [root, orphans]);

  const addNodeAndStackSelection = useCallback((targetSet, nodeId) => {
    getNodeStackSelectionIds(nodeId).forEach((id) => targetSet.add(id));
  }, [getNodeStackSelectionIds]);

  const brokenConnections = useMemo(() => {
    if (useLargeMapSurface) return [];
    const visibleNodes = collectAllNodesWithOrphans(renderRoot, visibleOrphans);
    const nodeById = new Map(visibleNodes.map((node) => [node.id, node]));
    const urlToId = new Map();

    const addUrl = (url, nodeId) => {
      if (!url) return;
      const normalized = normalizeUrlForCompare(url);
      if (!urlToId.has(normalized)) urlToId.set(normalized, nodeId);
      if (!urlToId.has(url)) urlToId.set(url, nodeId);
    };

    forestIndex.nodes.forEach((_meta, nodeId) => {
      const node = nodeById.get(nodeId);
      if (!node) return;
      addUrl(node.url, nodeId);
      addUrl(node.finalUrl, nodeId);
      addUrl(node.canonicalUrl, nodeId);
    });

    const getNodeIdForUrl = (url) => {
      if (!url) return null;
      return urlToId.get(normalizeUrlForCompare(url)) || urlToId.get(url) || null;
    };

    const brokenInputs = (scanMeta.brokenLinks && scanMeta.brokenLinks.length > 0)
      ? scanMeta.brokenLinks
      : visibleNodes
        .filter((node) => !!node?.isBroken || node?.orphanType === 'broken')
        .map((node) => ({
          url: node.url,
          sourceUrl: node.referrerUrl || node.parentUrl || null,
        }));

    return brokenInputs
      .map((link, index) => {
        if (!link?.url) return null;
        const targetId = getNodeIdForUrl(link.url);
        if (!targetId) return null;

        const targetMeta = forestIndex.nodes.get(targetId);
        if (targetMeta?.treeType === 'orphan' && targetMeta.parentId === null) return null;

        const targetNode = nodeById.get(targetId);
        const isBroken = !!targetNode?.isBroken || targetNode?.orphanType === 'broken';
        if (!isBroken) return null;

        let sourceUrl = link.sourceUrl;
        if (!sourceUrl) {
          sourceUrl = targetNode?.referrerUrl || targetNode?.parentUrl || null;
        }
        let sourceId = getNodeIdForUrl(sourceUrl);
        if (!sourceId) {
          sourceId = forestIndex.nodes.get(targetId)?.parentId || null;
        }
        if (!sourceId || sourceId === targetId) return null;

        return { id: `broken-${sourceId}-${targetId}-${index}`, sourceId, targetId };
      })
      .filter(Boolean);
  }, [scanMeta.brokenLinks, renderRoot, visibleOrphans, forestIndex, useLargeMapSurface]);

  const autoCrosslinkConnections = useMemo(
    () => connections.filter((conn) => conn.type === 'crosslink' && conn.autoRoute),
    [connections]
  );

  const connectionAvailability = useMemo(() => ({
    userFlows: connections.some((conn) => conn.type === 'userflow'),
    crossLinks: connections.some((conn) => conn.type === 'crosslink'),
    brokenLinks: brokenConnections.length > 0,
  }), [connections, brokenConnections]);

  const connectionLegend = useMemo(() => {
    const hasUserFlows = layers.userFlows && connections.some((conn) => conn.type === 'userflow');
    const hasCrossLinks = layers.crossLinks && connections.some((conn) => conn.type === 'crosslink');
    const hasBrokenLinks = layers.brokenLinks && brokenConnections.length > 0;
    return {
      hasUserFlows,
      hasCrossLinks,
      hasBrokenLinks,
      hasAny: hasUserFlows || hasCrossLinks || hasBrokenLinks,
    };
  }, [connections, layers.userFlows, layers.crossLinks, layers.brokenLinks, brokenConnections]);

  const isCrosslinkGhosted = useCallback((conn) => {
    if (!conn || !layerVisibility) return false;
    const sourceMeta = forestIndex.nodes.get(conn.sourceNodeId);
    const targetMeta = forestIndex.nodes.get(conn.targetNodeId);
    const isPlacementHidden = (meta) => {
      if (!meta) return false;
      if (meta.treeType === 'subdomain' && !layerVisibility.placementSubdomain) return true;
      if (meta.treeType === 'orphan' && !layerVisibility.placementOrphan) return true;
      if (meta.treeType === 'root' && !layerVisibility.placementPrimary) return true;
      return false;
    };
    return isPlacementHidden(sourceMeta) || isPlacementHidden(targetMeta);
  }, [forestIndex, layerVisibility]);

  const currentCommentMentionMapKey = useMemo(() => {
    if (currentMap?.id) return currentMap.id;
    return root?.url || currentMap?.name || 'draft';
  }, [currentMap?.id, currentMap?.name, root?.url]);

  const currentCommentMentionStorageKey = useMemo(
    () => getCommentMentionReadStorageKey(currentUser, currentCommentMentionMapKey),
    [currentCommentMentionMapKey, currentUser],
  );
  const legacyCommentMentionStorageKey = useMemo(
    () => getLegacyCommentMentionReadStorageKey(currentUser, currentCommentMentionMapKey),
    [currentCommentMentionMapKey, currentUser],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      let raw = window.localStorage.getItem(currentCommentMentionStorageKey);
      if (!raw) {
        raw = window.localStorage.getItem(legacyCommentMentionStorageKey);
        if (raw) {
          window.localStorage.setItem(currentCommentMentionStorageKey, raw);
          window.localStorage.removeItem(legacyCommentMentionStorageKey);
        }
      }
      if (!raw) {
        setReadMentionCommentIds(new Set());
        return;
      }
      const parsed = JSON.parse(raw);
      const nextIds = Array.isArray(parsed?.commentIds) ? parsed.commentIds : [];
      setReadMentionCommentIds(new Set(nextIds.map((id) => String(id))));
    } catch (error) {
      console.warn('Failed to load comment mention read state', error);
      setReadMentionCommentIds(new Set());
    }
  }, [currentCommentMentionStorageKey, legacyCommentMentionStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        currentCommentMentionStorageKey,
        JSON.stringify({ commentIds: Array.from(readMentionCommentIds) }),
      );
      window.localStorage.removeItem(legacyCommentMentionStorageKey);
    } catch (error) {
      console.warn('Failed to persist comment mention read state', error);
    }
  }, [currentCommentMentionStorageKey, legacyCommentMentionStorageKey, readMentionCommentIds]);

  const commentEntries = useMemo(() => {
    const entries = [];
    if (renderRoot) {
      collectCommentEntriesFromTree(renderRoot, entries);
    }
    visibleOrphans.forEach((orphan) => collectCommentEntriesFromTree(orphan, entries));
    return entries;
  }, [renderRoot, visibleOrphans]);

  const unreadMentionCommentIds = useMemo(() => {
    const mentionKeys = buildUserMentionKeys(currentUser);
    if (!mentionKeys.size) return [];
    return commentEntries
      .filter(({ comment }) => (comment.mentions || []).some((mention) => mentionKeys.has(String(mention || '').trim().toLowerCase())))
      .map(({ comment }) => String(comment.id));
  }, [commentEntries, currentUser]);

  const hasUnreadCommentMentions = useMemo(
    () => unreadMentionCommentIds.some((commentId) => !readMentionCommentIds.has(commentId)),
    [readMentionCommentIds, unreadMentionCommentIds],
  );

  const markMentionCommentsRead = useCallback((filterFn = null) => {
    if (!unreadMentionCommentIds.length) return;
    const idsToRead = unreadMentionCommentIds.filter((commentId) => {
      if (!filterFn) return true;
      const entry = commentEntries.find(({ comment }) => String(comment.id) === commentId);
      return entry ? filterFn(entry) : false;
    });
    if (!idsToRead.length) return;
    setReadMentionCommentIds((prev) => {
      const next = new Set(prev);
      idsToRead.forEach((commentId) => next.add(String(commentId)));
      return next;
    });
  }, [commentEntries, unreadMentionCommentIds]);

  const markerStatusUsage = useMemo(() => {
    const usedStatuses = new Set();
    const nodes = collectAllNodesWithOrphans(root, orphans);
    nodes.forEach((node) => {
      const annotations = node?.annotations;
      if (!annotations) return;
      const status = annotations.status || 'none';
      if (status !== 'none') {
        usedStatuses.add(status);
      }
    });
    return { usedStatuses, hasAnyMarker: usedStatuses.size > 0 };
  }, [root, orphans]);

  const shouldAutoMarkMoved = useMemo(() => {
    if (!root || isImportedMap) return false;
    const nodes = collectAllNodesWithOrphans(root, orphans);
    return nodes.some((node) => {
      if (!node) return false;
      return !!node.parentUrl
        || !!node.referrerUrl
        || !!node.canonicalUrl
        || !!node.finalUrl
        || !!node.isBroken
        || !!node.isError
        || !!node.isInactive
        || !!node.authRequired
        || !!node.isDuplicate
        || !!node.isFile
        || !!node.isMissing;
    });
  }, [root, orphans, isImportedMap]);

  const markerStatusOptions = useMemo(
    () => ANNOTATION_STATUS_OPTIONS.filter((option) => markerStatusUsage.usedStatuses.has(option.value)),
    [markerStatusUsage],
  );

  const showMarkerSection = markerStatusOptions.length > 0 && markerStatusUsage.hasAnyMarker;

  const isAnnotationVisible = useCallback((node) => {
    if (!node) return true;
    const status = node?.annotations?.status || 'none';
    if (status === 'none') return true;
    return changeFilters?.statuses?.[status] !== false;
  }, [changeFilters]);

  // Read access level from the current share route.
  useEffect(() => {
    const access = currentRoute?.surface === ROUTE_SURFACES.SHARE ? currentRoute?.accessLevel : null;
    if (currentRoute?.surface === ROUTE_SURFACES.SHARE) {
      setHasCreatedShareLink(true);
    }
    if (access && Object.values(ACCESS_LEVELS).includes(access)) {
      setAccessLevel(access);
      setSharePermission(access);
      setCurrentShareAccess(access);
      return;
    }
    if (currentRoute?.surface !== ROUTE_SURFACES.SHARE) {
      setAccessLevel(ACCESS_LEVELS.EDIT);
      setCurrentShareAccess(null);
    }
  }, [currentRoute?.accessLevel, currentRoute?.surface]);

  const legacyFeatureGates = useMemo(() => {
    const isEdit = accessLevel === ACCESS_LEVELS.EDIT;
    const isComment = accessLevel === ACCESS_LEVELS.COMMENT;
    return {
      mapView: true,
      activityView: true,
      mapComment: isEdit || isComment,
      mapEdit: isEdit,
      versionSave: isEdit,
      historyManage: isEdit,
      shareManage: isEdit,
      discoveryRun: isEdit,
      collabPanelView: isEdit,
      collabInviteSend: isEdit,
      collabSettingsManage: isEdit,
      accessRequestsView: isEdit,
      accessRequestsCreate: false,
      presenceView: isEdit || isComment,
    };
  }, [accessLevel]);

  const effectiveFeatureGates = useMemo(() => {
    if (
      featureGatesEnabled
      && isLoggedIn
      && currentMap?.id
      && mapPermissions?.features
    ) {
      return { ...legacyFeatureGates, ...mapPermissions.features };
    }
    return legacyFeatureGates;
  }, [currentMap?.id, featureGatesEnabled, isLoggedIn, legacyFeatureGates, mapPermissions?.features]);

  const canEditValue = !!effectiveFeatureGates.mapEdit && !isCoeditingReadOnlyMode;
  const canCommentValue = canEditValue || !!effectiveFeatureGates.mapComment;
  const canViewCommentsValue = (!!currentMap?.id && !!effectiveFeatureGates.mapView) || canCommentValue;
  const canViewVersionHistoryValue = currentMap?.id
    ? !!effectiveFeatureGates.mapView
    : (!!root && canEditValue);
  const canSaveVersionValue = !!effectiveFeatureGates.versionSave && !isCoeditingReadOnlyMode;
  const canViewActivityValue = !!currentMap?.id && !!effectiveFeatureGates.activityView;
  const canManageSharesValue = !!effectiveFeatureGates.shareManage;
  const canViewCollaborationPanelValue = !!effectiveFeatureGates.collabPanelView;
  const canSendCollaborationInvitesValue = !!effectiveFeatureGates.collabInviteSend;
  const collaborationCapabilities = mapPermissions?.collaboration || null;
  const collaborationInviteRoleOptionsValue = useMemo(() => {
    const roles = Array.isArray(collaborationCapabilities?.inviteRoles)
      ? collaborationCapabilities.inviteRoles
      : [];
    return roles.filter((role) => ['viewer', 'commenter', 'editor'].includes(String(role || '').trim().toLowerCase()));
  }, [collaborationCapabilities?.inviteRoles]);
  const canSelfServeCollaborationInviteValue = collaborationInviteRoleOptionsValue.length > 0;
  const canSelfServeCollaborationValue = canSelfServeCollaborationInviteValue || !!collaborationCapabilities?.canRequestAccess;
  const canManageCollaborationSettingsValue = !!effectiveFeatureGates.collabSettingsManage;
  const canViewAccessRequestsValue = !!effectiveFeatureGates.accessRequestsView;
  const canViewPresenceValue = !!effectiveFeatureGates.presenceView;
  const inferredCollaborationRole = useMemo(() => {
    if (!currentUser?.id) return 'viewer';
    if (currentMap?.user_id && sameId(currentMap.user_id, currentUser.id)) return 'owner';
    return collaborationMemberships.find((member) => sameId(member.userId, currentUser.id))?.role || 'viewer';
  }, [collaborationMemberships, currentMap?.user_id, currentUser?.id]);
  const currentCollaborationRole = useMemo(
    () => String(mapPermissions?.role || inferredCollaborationRole || 'viewer').trim().toLowerCase() || 'viewer',
    [inferredCollaborationRole, mapPermissions?.role],
  );
  const pendingInviteForCurrentRoute = useMemo(() => {
    if (currentRoute?.surface !== ROUTE_SURFACES.APP || currentRoute?.section !== 'map' || !currentRoute?.mapId) {
      return null;
    }
    return (pendingMapInvites || []).find((invite) => sameId(invite.mapId, currentRoute.mapId)) || null;
  }, [currentRoute?.mapId, currentRoute?.section, currentRoute?.surface, pendingMapInvites]);
  const canManageCollaborationMembersValue = (
    ['owner', 'editor'].includes(currentCollaborationRole)
    || (canManageSharesValue && canViewCollaborationPanelValue)
  );
  const canSendCollaborationInvitesResolvedValue = (
    canSendCollaborationInvitesValue
    || canManageCollaborationMembersValue
    || canSelfServeCollaborationInviteValue
  );
  const canManageCollaborationSettingsResolvedValue = canManageCollaborationSettingsValue || currentCollaborationRole === 'owner';
  const canViewAccessRequestsResolvedValue = canViewAccessRequestsValue || currentCollaborationRole === 'owner';
  const canOpenShareModalValue = canEditValue || canSelfServeCollaborationValue;

  // Permission helper functions
  const canEdit = () => canEditValue;
  const canComment = () => canCommentValue;
  const canViewComments = () => canViewCommentsValue;
  const canViewVersionHistory = () => canViewVersionHistoryValue;
  const canSaveVersion = () => canSaveVersionValue;
  const canViewActivity = () => canViewActivityValue;
  const canManageShares = () => canManageSharesValue;
  const canViewCollaborationPanel = () => canViewCollaborationPanelValue;
  const canSendCollaborationInvites = () => canSendCollaborationInvitesResolvedValue;
  const canManageCollaborationSettings = () => canManageCollaborationSettingsResolvedValue;
  const canViewAccessRequests = () => canViewAccessRequestsResolvedValue;

  useEffect(() => {
    if (!collaborationInviteRoleOptionsValue.length) return;
    if (collaborationInviteRoleOptionsValue.includes(collaborationInviteRole)) return;
    setCollaborationInviteRole(collaborationInviteRoleOptionsValue[0]);
  }, [collaborationInviteRole, collaborationInviteRoleOptionsValue]);

  useEffect(() => {
    seenActivityIdsRef.current = new Set();
    primedActivityMapIdRef.current = null;
    if (!currentMap?.id || !isLoggedIn || !currentUser || !canViewActivityValue) {
      setIsLoadingActivity(false);
      setMapActivity([]);
      return;
    }
    loadMapActivity(currentMap.id, { silent: false, allowToast: false });
  }, [canViewActivityValue, currentMap?.id, currentUser, isLoggedIn, loadMapActivity]);

  useEffect(() => {
    if (!currentMap?.id || !isLoggedIn || !currentUser || !canViewActivityValue || showVersionHistoryDrawer) {
      return undefined;
    }

    const refreshActivity = () => {
      loadMapActivity(currentMap.id, { silent: true, allowToast: true });
    };

    const intervalId = window.setInterval(refreshActivity, ACTIVITY_POLL_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshActivity();
      }
    };

    window.addEventListener('focus', refreshActivity);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [canViewActivityValue, currentMap?.id, currentUser, isLoggedIn, loadMapActivity, showVersionHistoryDrawer]);

  // Show confirmation modal and return promise
  const showConfirm = useCallback(({ title, message, confirmText = 'OK', cancelText = 'Cancel', danger = false }) => {
    return new Promise((resolve) => {
      setConfirmModal({
        title,
        message,
        confirmText,
        cancelText,
        danger,
        onConfirm: () => { setConfirmModal(null); resolve(true); },
        onCancel: () => { setConfirmModal(null); resolve(false); },
      });
    });
  }, []);

  const resetScanLayers = useCallback(() => {
    setScanMeta({ brokenLinks: [] });
    setScanLayerAvailability({
      placementPrimary: false,
      placementSubdomain: false,
      placementOrphan: false,
      typePages: false,
      typeFiles: false,
      statusBroken: false,
      statusError: false,
      statusInactive: false,
      statusAuth: false,
      statusDuplicate: false,
    });
    setScanLayerVisibility({
      placementPrimary: true,
      placementSubdomain: true,
      placementOrphan: true,
      typePages: true,
      typeFiles: true,
      statusBroken: true,
      statusError: true,
      statusInactive: true,
      statusAuth: true,
      statusDuplicate: true,
    });
  }, []);

  const clearCanvas = async () => {
    if (hasMap && !currentMap?.id) {
      const wantsSave = await showConfirm({
        title: 'Save Map?',
        message: 'You have an unsaved map. Save it before clearing?',
        confirmText: 'Save Map',
        cancelText: 'Clear',
      });
      if (wantsSave) {
        setCreateMapMode(false);
        setShowSaveMapModal(true);
        return false;
      }
      setRoot(null);
      setOrphans([]);
      setCurrentMap(null);
      navigateToRoute(createAppHomeRoute());
      setIsImportedMap(false);
      setShowThumbnails(false);
      setHasCreatedShareLink(false);
      setCurrentShareAccess(null);
      resetThumbnailQueue(0);
      applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
      setUrlInput('');
      resetScanLayers();
      return true;
    }
    const confirmed = await showConfirm({
      title: 'Clear Canvas',
      message: 'Clear the canvas? This cannot be undone.',
      confirmText: 'Clear',
      danger: true
    });
    if (!confirmed) return false;
    if (currentMap?.id && root && !isViewingHistoricalVersion) {
      try {
        await createVersionFromSnapshot({ mapId: currentMap.id });
      } catch (error) {
        console.error('Failed to save version before clearing', error);
      }
    }
    setRoot(null);
    setOrphans([]);
    setCurrentMap(null);
    navigateToRoute(createAppHomeRoute());
    setIsImportedMap(false);
    setShowThumbnails(false);
    setHasCreatedShareLink(false);
    setCurrentShareAccess(null);
    resetThumbnailQueue(0);
    applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
    setUrlInput('');
    resetScanLayers();
    return true;
  };

  const openCreateMapFlow = async ({ defaultProjectId = null } = {}) => {
    const normalizedProjectId = normalizeProjectSelection(defaultProjectId);

    if (!currentUser) {
      showToast('Please sign in to create a new map', 'warning');
      openAuthModal();
      return;
    }

    const hasUnsavedMap = hasMap && !currentMap?.id;
    if (hasUnsavedMap) {
      const wantsSave = await showConfirm({
        title: 'Save current map?',
        message: 'You have an unsaved map. Save it before creating a new one?',
        confirmText: 'Save',
        cancelText: "Don't Save",
      });

      if (wantsSave) {
        setPendingCreateAfterSave({ projectId: normalizedProjectId });
        setCreateMapMode(false);
        setCreateMapDefaults(null);
        setShowProjectsModal(false);
        setShowSaveMapModal(true);
        return;
      }
      setRoot(null);
      setOrphans([]);
      setCurrentMap(null);
      navigateToRoute(createAppHomeRoute());
      setIsImportedMap(false);
      setShowThumbnails(false);
      setHasCreatedShareLink(false);
      setCurrentShareAccess(null);
      resetThumbnailQueue(0);
      applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
      setUrlInput('');
      resetScanLayers();
    }

    setDuplicateMapConfig(null);
    setPendingLoadMap(null);
    setPendingCreateAfterSave(null);
    setShowProjectsModal(false);
    setShowCreateMapModal(false);
    setCreateMapMode(true);
    setCreateMapDefaults({
      projectId: normalizedProjectId,
      name: '',
      notes: '',
    });
    setShowSaveMapModal(true);
  };

  // Show prompt modal and return promise
  const showPrompt = ({ title, message, placeholder = '', defaultValue = '' }) => {
    return new Promise((resolve) => {
      setPromptModal({
        title,
        message,
        placeholder,
        defaultValue,
        onConfirm: (value) => { setPromptModal(null); resolve(value); },
        onCancel: () => { setPromptModal(null); resolve(null); },
      });
    });
  };

  const updateLastPointerFromEvent = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    lastPointerRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const getWorldPointFromClient = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scale = scaleRef.current || 1;
    return {
      x: (clientX - rect.left - panRef.current.x) / scale,
      y: (clientY - rect.top - panRef.current.y) / scale,
    };
  };

  // dnd-kit sensors - require 5px movement before activating drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Pan/zoom bounds derived from layout (world coordinates)
  const worldBounds = useMemo(() => {
    if (!mapLayout || !mapLayout.nodes || mapLayout.nodes.size === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    mapLayout.nodes.forEach((node) => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.w);
      maxY = Math.max(maxY, node.y + node.h);
    });

    return { minX, minY, maxX, maxY };
  }, [mapLayout]);

  const canvasViewportBounds = useMemo(() => {
    if (disableCanvasCulling) return null;
    return getCanvasViewportWorldBounds({
      pan,
      scale,
      canvasSize,
      overscanPx: CANVAS_NODE_OVERSCAN_PX,
    });
  }, [canvasSize, disableCanvasCulling, pan, scale]);

  const visibleCanvasNodeData = useMemo(() => (
    mapLayout
      ? filterVisibleLayoutNodes(mapLayout.nodes, canvasViewportBounds, {
          alwaysIncludeIds: activeBranchNodeIds,
        })
      : []
  ), [activeBranchNodeIds, canvasViewportBounds, mapLayout]);

  const visibleCanvasNodeIds = useMemo(() => (
    new Set(visibleCanvasNodeData.map((nodeData) => nodeData?.node?.id).filter(Boolean))
  ), [visibleCanvasNodeData]);

  const visibleAutoCrosslinkConnections = useMemo(() => (
    autoCrosslinkConnections.filter((conn) => (
      shouldRenderConnectionForVisibleNodes(conn, visibleCanvasNodeIds)
    ))
  ), [autoCrosslinkConnections, visibleCanvasNodeIds]);

  const visibleBrokenConnections = useMemo(() => (
    brokenConnections.filter((conn) => (
      shouldRenderConnectionForVisibleNodes(conn, visibleCanvasNodeIds)
    ))
  ), [brokenConnections, visibleCanvasNodeIds]);

  const visibleCanvasConnections = useMemo(() => (
    connections.filter((conn) => (
      shouldRenderConnectionForVisibleNodes(conn, visibleCanvasNodeIds)
    ))
  ), [connections, visibleCanvasNodeIds]);

  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return undefined;
    const observers = [];
    try {
      const resourceObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const name = String(entry?.name || '');
          if (entry?.initiatorType === 'img' && /\/screenshots\/[^/?#]+_full_v\d+\.(?:jpe?g|png|webp)/i.test(name)) {
            canvasPerformanceRef.current.fullImageRequests += 1;
          }
        });
      });
      resourceObserver.observe({ type: 'resource', buffered: true });
      observers.push(resourceObserver);
    } catch {
      // Resource timing support varies by browser.
    }
    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          canvasPerformanceRef.current.longTasks += 1;
          canvasPerformanceRef.current.longTaskMs += Number(entry.duration || 0);
        });
      });
      longTaskObserver.observe({ type: 'longtask', buffered: true });
      observers.push(longTaskObserver);
    } catch {
      // Long task timing is not supported in all browsers.
    }
    return () => observers.forEach((observer) => observer.disconnect());
  }, []);

  useEffect(() => {
    if (!mapLayout?.nodes?.size || typeof window === 'undefined') return undefined;
    const publishSnapshot = () => {
      const content = contentRef.current;
      const memory = typeof performance !== 'undefined' && performance?.memory?.usedJSHeapSize
        ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)
        : null;
      const renderedNodes = content?.querySelectorAll('[data-node-card="1"]').length || 0;
      const renderedThumbnails = content?.querySelectorAll('img.thumb-img').length || 0;
      const renderedFullImages = Array.from(content?.querySelectorAll('img') || [])
        .filter((image) => /\/screenshots\/[^/?#]+_full_v\d+\.(?:jpe?g|png|webp)/i.test(image.currentSrc || image.src || ''))
        .length;
      const snapshot = {
        totalNodes: mapLayout.nodes.size,
        visibleNodes: visibleCanvasNodeData.length,
        renderedNodes,
        visibleThumbnails: countVisibleThumbnails(visibleCanvasNodeData, showThumbnails),
        renderedThumbnails,
        renderedFullImages,
        fullImageRequests: canvasPerformanceRef.current.fullImageRequests,
        longTasks: canvasPerformanceRef.current.longTasks,
        longTaskMs: Math.round(canvasPerformanceRef.current.longTaskMs),
        memoryMb: memory,
      };
      window.__vellicCanvasPerf = snapshot;
      if (window.localStorage?.getItem('vellic:canvas-perf') === 'debug') {
        console.table(snapshot);
      }
    };
    publishSnapshot();
    const interval = window.setInterval(publishSnapshot, CANVAS_PERF_PROBE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [mapLayout, showThumbnails, visibleCanvasNodeData]);

  const clampPan = useCallback((newPan, scaleArg = scaleRef.current) => {
    if (!canvasRef.current || !worldBounds) return newPan;
    const bounds = worldBounds;

    const viewportWidth = canvasRef.current.clientWidth;
    const viewportHeight = canvasRef.current.clientHeight;

    const scaledLeft = bounds.minX * scaleArg;
    const scaledTop = bounds.minY * scaleArg;
    const scaledRight = bounds.maxX * scaleArg;
    const scaledBottom = bounds.maxY * scaleArg;

    // Keep the furthest node edge within 400px of the viewport edge when possible.
    const padding = CANVAS_EDGE_PADDING_MAX;
    const minPanX = viewportWidth - padding - scaledRight;
    const maxPanX = padding - scaledLeft;
    const minPanY = viewportHeight - padding - scaledBottom;
    const maxPanY = padding - scaledTop;

    const clampedX = clampCanvasPanAxis(newPan.x, minPanX, maxPanX);
    const clampedY = clampCanvasPanAxis(newPan.y, minPanY, maxPanY);

    return { x: clampedX, y: clampedY };
  }, [worldBounds]);

  const applyCanvasTransformDom = useCallback((nextScale, nextPan) => {
    const content = contentRef.current;
    if (content && content.dataset.largeMapSurface !== '1') {
      content.style.transform = `translate(${nextPan.x}px, ${nextPan.y}px) scale(${nextScale})`;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const grid = getCanvasGridMetrics(nextScale);
      canvas.style.setProperty('--canvas-pan-x', `${nextPan.x || 0}px`);
      canvas.style.setProperty('--canvas-pan-y', `${nextPan.y || 0}px`);
      canvas.style.setProperty('--canvas-grid-size', `${grid.size}px`);
      canvas.style.setProperty('--canvas-grid-dot-radius', `${grid.dotRadius}px`);
    }
  }, []);

  const scheduleTransformStateCommit = useCallback(() => {
    if (transformCommitRef.current.timer) {
      clearTimeout(transformCommitRef.current.timer);
    }
    transformCommitRef.current.timer = setTimeout(() => {
      transformCommitRef.current.timer = null;
      if (transformCommitRef.current.raf) return;
      transformCommitRef.current.raf = requestAnimationFrame(() => {
        transformCommitRef.current.raf = null;
        setScale(scaleRef.current);
        setPan(panRef.current);
      });
    }, CANVAS_TRANSFORM_COMMIT_IDLE_MS);
  }, []);

  useEffect(() => () => {
    if (transformCommitRef.current.timer) {
      clearTimeout(transformCommitRef.current.timer);
      transformCommitRef.current.timer = null;
    }
    if (transformCommitRef.current.raf) {
      cancelAnimationFrame(transformCommitRef.current.raf);
      transformCommitRef.current.raf = null;
    }
  }, []);

  const applyTransform = useCallback((next, { skipPanClamp = false } = {}) => {
    const rawScale = next?.scale ?? scaleRef.current;
    const safeScale = Number.isFinite(rawScale) ? rawScale : 1;
    const nextScale = clamp(
      safeScale,
      MIN_SCALE,
      MAX_SCALE
    );
    const nextPan = {
      x: next?.x ?? panRef.current.x,
      y: next?.y ?? panRef.current.y,
    };
    const clampedPan = skipPanClamp ? nextPan : clampPan(nextPan, nextScale);

    scaleRef.current = nextScale;
    panRef.current = clampedPan;
    applyCanvasTransformDom(nextScale, clampedPan);
    scheduleTransformStateCommit();
    return { scale: nextScale, pan: clampedPan };
  }, [applyCanvasTransformDom, clampPan, scheduleTransformStateCommit]);

  const getLargeMapViewState = useCallback(() => ({
    pan: panRef.current,
    scale: scaleRef.current,
  }), []);

  const handleLargeMapSceneLoaded = useCallback((scene) => {
    if (!useLargeMapSurface || !scene?.homeNode || !canvasRef.current) return;
    const sceneKey = [
      currentMap?.id || 'unsaved',
      scene.mapUpdatedAt || '',
      mapOrientation,
      showThumbnails ? 'thumbs' : 'cards',
    ].join(':');
    if (largeMapHomeSceneKeyRef.current === sceneKey) return;
    largeMapHomeSceneKeyRef.current = sceneKey;

    const node = scene.homeNode;
    const nextScale = scaleRef.current || 1;
    applyTransform({
      scale: nextScale,
      x: canvasRef.current.clientWidth / 2 - (node.x + node.w / 2) * nextScale,
      y: canvasRef.current.clientHeight / 2 - (node.y + node.h / 2) * nextScale,
    }, { skipPanClamp: true });
  }, [applyTransform, currentMap?.id, mapOrientation, showThumbnails, useLargeMapSurface]);

  const animatePanTo = useCallback((target, options = {}) => {
    const start = { ...panRef.current };
    const startTime = performance.now();
    const duration = 360;
    const { skipPanClamp = false } = options;

    const tick = (now) => {
      const elapsed = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - elapsed, 3);
      const next = {
        x: start.x + (target.x - start.x) * ease,
        y: start.y + (target.y - start.y) * ease,
      };
      applyTransform({ scale: scaleRef.current, x: next.x, y: next.y }, { skipPanClamp });
      if (elapsed < 1) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  }, [applyTransform]);

  const panToWorldPoint = useCallback((worldX, worldY) => {
    const nextPan = {
      x: -worldX * scaleRef.current,
      y: -worldY * scaleRef.current,
    };
    applyTransform({ scale: scaleRef.current, x: nextPan.x, y: nextPan.y });
  }, [applyTransform]);

  const centerOnWorldPoint = useCallback((worldX, worldY) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nextPan = {
      x: canvas.clientWidth / 2 - worldX * scaleRef.current,
      y: canvas.clientHeight / 2 - worldY * scaleRef.current,
    };
    applyTransform({ scale: scaleRef.current, x: nextPan.x, y: nextPan.y });
  }, [applyTransform]);

  const focusLargeMapNodeById = useCallback(async (nodeId) => {
    const canvas = canvasRef.current;
    if (!nodeId || !canvas || !currentMap?.id) return false;

    const scaleValue = scaleRef.current || 1;
    const panValue = panRef.current || { x: 0, y: 0 };
    const expandedStackIds = getExpandedStackIds(expandedStacks);

    try {
      const response = await api.getMapScene(currentMap.id, {
        x: (0 - panValue.x) / scaleValue,
        y: (0 - panValue.y) / scaleValue,
        w: (canvasSize.width || canvas.clientWidth || 1) / scaleValue,
        h: (canvasSize.height || canvas.clientHeight || 1) / scaleValue,
        zoom: scaleValue,
        orientation: mapOrientation,
        thumbnails: showThumbnails ? '1' : '0',
        overscan: CANVAS_NODE_OVERSCAN_PX,
        expandedStacks: expandedStackIds.join(','),
        targetNodeId: nodeId,
      });

      const scene = response?.scene || {};
      const targetNode = scene.targetNode
        || (scene.nodes || []).find((node) => node?.id === nodeId);
      if (!targetNode) return false;

      if (Array.isArray(scene.expandedStackIds) && scene.expandedStackIds.length) {
        setExpandedStacks((prev) => {
          const next = { ...prev };
          scene.expandedStackIds.forEach((id) => {
            if (id) next[id] = true;
          });
          return next;
        });
      }

      const leftShift = Math.min(240, canvas.clientWidth * 0.25);
      const nodeCenterX = targetNode.x + targetNode.w / 2;
      const nodeCenterY = targetNode.y + targetNode.h / 2;
      applyTransform({
        scale: scaleValue,
        x: (canvas.clientWidth / 2 - leftShift) - nodeCenterX * scaleValue,
        y: canvas.clientHeight / 2 - nodeCenterY * scaleValue,
      }, { skipPanClamp: true });
      return true;
    } catch (error) {
      console.warn('Large map focus failed', error);
      return false;
    }
  }, [
    applyTransform,
    canvasSize.height,
    canvasSize.width,
    currentMap?.id,
    expandedStacks,
    mapOrientation,
    showThumbnails,
  ]);

  const findStackParentsForNode = useCallback((node, targetId, depth = 0) => {
    if (!node) return null;
    if (node.id === targetId) return [];
    if (!node.children?.length) return null;

    const shouldStack = shouldStackChildren(node.children, depth);
    for (const child of node.children) {
      const path = findStackParentsForNode(child, targetId, depth + 1);
      if (path) {
        return shouldStack ? [node.id, ...path] : path;
      }
    }
    return null;
  }, []);

  const focusNodeById = useCallback((nodeId) => {
    if (!nodeId || !canvasRef.current) return;

    if (useLargeMapSurface) {
      focusLargeMapNodeById(nodeId);
      return;
    }

    let stackParents = findStackParentsForNode(root, nodeId, 0);
    if (!stackParents) {
      for (const orphan of orphans) {
        stackParents = findStackParentsForNode(orphan, nodeId, 0);
        if (stackParents) break;
      }
    }

    if (stackParents?.length) {
      setExpandedStacks((prev) => {
        const next = { ...prev };
        stackParents.forEach((id) => {
          next[id] = true;
        });
        return next;
      });
    }

    const moveToNode = (attempt = 0) => {
      const layout = layoutRef.current;
      if (!layout || !canvasRef.current) {
        if (attempt < FOCUS_NODE_MAX_ATTEMPTS) {
          setTimeout(() => moveToNode(attempt + 1), FOCUS_NODE_RETRY_MS);
        }
        return;
      }
      const nodeData = layout.nodes.get(nodeId);
      if (!nodeData) {
        if (attempt < FOCUS_NODE_MAX_ATTEMPTS) {
          setTimeout(() => moveToNode(attempt + 1), FOCUS_NODE_RETRY_MS);
        }
        return;
      }

      const canvas = canvasRef.current;
      const leftShift = Math.min(240, canvas.clientWidth * 0.25);
      const scale = scaleRef.current;
      const nodeCenterX = nodeData.x + nodeData.w / 2;
      const nodeCenterY = nodeData.y + nodeData.h / 2;
      const targetPan = {
        x: (canvas.clientWidth / 2 - leftShift) - nodeCenterX * scale,
        y: canvas.clientHeight / 2 - nodeCenterY * scale,
      };
      animatePanTo(targetPan, { skipPanClamp: true });
    };

    requestAnimationFrame(() => {
      setTimeout(() => moveToNode(0), 80);
    });
  }, [animatePanTo, findStackParentsForNode, focusLargeMapNodeById, orphans, root, useLargeMapSurface]);

  const findNodeByUrlInMap = useCallback((url) => {
    if (!url) return null;
    const urlMap = buildUrlNodeMap(root, orphans);
    let match = urlMap.get(url);
    if (!match?.id) {
      const normalized = normalizeUrlForCompare(url);
      for (const [candidateUrl, node] of urlMap.entries()) {
        if (normalizeUrlForCompare(candidateUrl) === normalized) {
          match = node;
          break;
        }
      }
    }
    return match?.id ? match : null;
  }, [orphans, root]);

  const locateUrlOnMap = useCallback((url) => {
    if (!url || !contentRef.current || !canvasRef.current) return false;
    const match = findNodeByUrlInMap(url);
    if (!match?.id) return false;
    focusNodeById(match.id);
    return true;
  }, [findNodeByUrlInMap, focusNodeById]);

  const canLocateUrlOnMap = useCallback((url) => !!findNodeByUrlInMap(url), [findNodeByUrlInMap]);

  const locateReportNodeOnMap = useCallback((nodeId) => {
    if (!nodeId) return;
    setSelectedNodeIds(new Set([nodeId]));
    setShowReportDrawer(false);
    requestAnimationFrame(() => {
      focusNodeById(nodeId);
    });
  }, [focusNodeById]);

  const locateReportUrlOnMap = useCallback((url) => {
    if (!url) return false;
    const match = findNodeByUrlInMap(url);
    if (!match?.id) return false;
    locateReportNodeOnMap(match.id);
    return true;
  }, [findNodeByUrlInMap, locateReportNodeOnMap]);

  const selectCaptureIssue = useCallback((issue) => {
    if (!issue?.nodeId) return;
    setSelectedNodeIds(new Set([issue.nodeId]));
    setShowImageMenu(false);
    setShowImageReportDrawer(false);
    focusNodeById(issue.nodeId);
  }, [focusNodeById]);

  const openCaptureIssueUrl = useCallback((issue) => {
    if (!issue?.url) return;
    window.open(issue.url, '_blank', 'noopener,noreferrer');
  }, []);

  useEffect(() => {
    if (!root) return;
    applyTransform({ scale: scaleRef.current, x: panRef.current.x, y: panRef.current.y });
  }, [layerVisibility, root, orphans, mapLayout, applyTransform]);

  const loadAuthenticatedWorkspace = useCallback(async () => {
    const [projectsData, mapsData, historyData] = await Promise.all([
      api.getProjects(),
      api.getMaps(),
      api.getHistory(),
    ]);

    setProjects(organizeProjectsWithMaps(
      projectsData.projects || [],
      mapsData.maps || []
    ));
    setScanHistory(historyData.history || []);
  }, []);

  const loadPendingMapInvites = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setPendingMapInvitesLoading(true);
    }
    setPendingMapInvitesError('');

    try {
      const { invites } = await api.getPendingMapInvites();
      setPendingMapInvites(invites || []);
    } catch (error) {
      setPendingMapInvites([]);
      setPendingMapInvitesError(error.message || 'Failed to load pending invites.');
    } finally {
      setPendingMapInvitesLoading(false);
    }
  }, []);

  const loadPendingAccessRequests = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setPendingAccessRequestsLoading(true);
    }
    setPendingAccessRequestsError('');

    try {
      const { accessRequests } = await api.getPendingAccessRequests();
      setPendingAccessRequests(accessRequests || []);
    } catch (error) {
      setPendingAccessRequests([]);
      setPendingAccessRequestsError(error.message || 'Failed to load pending access requests.');
    } finally {
      setPendingAccessRequestsLoading(false);
    }
  }, []);

  const applySharedMapPayload = useCallback((share) => {
    if (!share?.root) return;
    resetScanLayers();
    setRoot(share.root);
    setOrphans(normalizeOrphans(share.orphans));
    setConnections(share.connections || []);
    applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
    setColors(share.colors || DEFAULT_COLORS);
    setConnectionColors(share.connectionColors || DEFAULT_CONNECTION_COLORS);
    setUrlInput(share.root.url || '');
    setCurrentMap(null);
    setMapName(share.name || share.root.title || '');
    setHasCreatedShareLink(true);
    setIsImportedMap(false);
    setSelectedNodeIds(new Set());
    setSelectionBox(null);
    showToast('Shared map loaded!', 'success');
    scheduleResetViewRef.current?.();
  }, [applyTransform, resetScanLayers, showToast]);

  // Check auth and load data on mount
  React.useEffect(() => {
    const initAuth = async () => {
      try {
        // Check if user is logged in via API
        const { user } = await api.getMe();
        if (user) {
          setCurrentUser(user);
          setIsLoggedIn(true);

          // Load user's projects, maps, and history from API
          try {
            await loadAuthenticatedWorkspace();
            await loadPendingMapInvites({ silent: true });
            await loadPendingAccessRequests({ silent: true });
          } catch (e) {
            console.error('Failed to load user data:', e);
          }
        }
      } catch (e) {
        // Not logged in or error - that's fine
        console.log('Not authenticated');
      } finally {
        setAuthLoading(false);
      }
    };

    initAuth();
    // Intentionally run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAuthenticatedWorkspace, loadPendingAccessRequests, loadPendingMapInvites]);

  useEffect(() => {
    if (currentRoute?.surface !== ROUTE_SURFACES.SHARE || !currentRoute?.shareId) return undefined;

    let cancelled = false;
    api.getShare(currentRoute.shareId)
      .then(({ share }) => {
        if (cancelled || !share?.root) return;
        if (share?.map_id) {
          clearLoadedMapViewRef.current?.();
          navigateToRoute(createMapRoute(share.map_id), { replace: true });
          return;
        }
        applySharedMapPayload(share);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error?.code === 'SHARE_ACCESS_REQUIRED' && error?.payload?.mapId) {
          clearLoadedMapViewRef.current?.();
          navigateToRoute(createMapRoute(error.payload.mapId), { replace: true });
          return;
        }
        const sharedData = localStorage.getItem(currentRoute.shareId);
        if (sharedData) {
          try {
            const parsed = JSON.parse(sharedData);
            applySharedMapPayload({
              ...parsed,
              name: parsed?.name || null,
            });
            return;
          } catch (parseError) {
            console.error('Failed to parse shared map:', parseError);
            showToast('Failed to load shared map', 'error');
            return;
          }
        }
        showToast(error.message || 'Shared map not found or expired', 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [
    applySharedMapPayload,
    currentRoute?.shareId,
    currentRoute?.surface,
    navigateToRoute,
    showToast,
  ]);

  // (gesture handlers removed; zoom handled via wheel listener on canvas)

  useEffect(() => {
    if (!mapSaveConflict) return;
    const sourceLabel = mapSaveConflict.source === 'autosave' ? 'Autosave paused' : 'Save blocked';
    showToast(
      `${sourceLabel}: this map changed in another session. Reload latest before saving again.`,
      'warning'
    );
  }, [mapSaveConflict, showToast]);

  const warnLiveModeUnsupported = useCallback((message) => {
    showToast(message, 'info');
  }, [showToast]);

  const warnCoeditingReadOnly = useCallback((subject = 'This map') => {
    if (!isCoeditingReadOnlyMode || !currentMap?.id) return false;
    showToast(`${subject} is currently read-only. ${coeditingReadOnlyMessage}`, 'warning');
    return true;
  }, [coeditingReadOnlyMessage, currentMap?.id, isCoeditingReadOnlyMode, showToast]);

  const handleRemoteCommittedOperation = useCallback((operation, { participant } = {}) => {
    if (!operation?.type || !currentUser?.id || operation.actorId === currentUser.id) return;
    const message = buildLiveOperationToastMessage(operation, participant);
    if (message) {
      showToast(message, 'info');
    }
  }, [currentUser?.id, showToast]);

  const {
    liveStatus,
    liveStatusDetail,
    liveVersion,
    pendingCount: livePendingCount,
    participants: liveParticipants,
    remoteSelections,
    sessionId: liveSessionId,
    isLiveActive,
    submitDraft: submitLiveDraft,
    updateSelection: updateLiveSelection,
    resync: resyncLiveDocument,
    resetToDocument: resetLiveDocumentToSavedMap,
  } = useCoeditingLive({
    enabled: isLiveRealtimeModeActive,
    mapId: currentMap?.id || null,
    actorId: currentUser?.id || null,
    canEdit: canEditValue,
    accessMode: canEditValue ? 'edit' : (canCommentValue ? 'comment' : 'view'),
    getLocalDocument: getLocalLiveDocument,
    applyDocument: applyLiveDocumentToCanvas,
    onCommittedOperation: handleRemoteCommittedOperation,
    onWarn: warnLiveModeUnsupported,
  });
  const activeRemoteWriterCount = useMemo(() => {
    return (liveParticipants || []).filter((participant) => {
      if (!participant?.sessionId || participant.sessionId === liveSessionId) return false;
      if (currentUser?.id && sameId(participant.actorId, currentUser.id)) return false;
      return String(participant.accessMode || '').trim().toLowerCase() === 'edit';
    }).length;
  }, [currentUser?.id, liveParticipants, liveSessionId]);
  const isCollaborativeLiveEditingRestricted = !!(isLiveActive && activeRemoteWriterCount > 0);
  const liveUndoRedoDisabledReason = isCollaborativeLiveEditingRestricted
    ? (
      activeRemoteWriterCount === 1
        ? 'Undo/redo is unavailable while another owner or editor is actively in this map.'
        : 'Undo/redo is unavailable while other owners or editors are actively in this map.'
    )
    : '';

  const liveStatusLabel = useMemo(() => {
    switch (liveStatus) {
      case COEDITING_LIVE_STATUS.CONNECTED:
        return 'Connected';
      case COEDITING_LIVE_STATUS.RECONNECTING:
        return 'Reconnecting';
      case COEDITING_LIVE_STATUS.OUT_OF_SYNC:
        return 'Out of Sync';
      case COEDITING_LIVE_STATUS.CONNECTING:
        return 'Connecting';
      default:
        return 'Live Off';
    }
  }, [liveStatus]);
  const liveBannerTitle = isCoeditingReadOnlyMode && !canEditValue ? 'Live View' : 'Live Editing';

  const liveBannerTone = liveStatus === COEDITING_LIVE_STATUS.OUT_OF_SYNC
    ? 'warning'
    : (liveStatus === COEDITING_LIVE_STATUS.CONNECTED ? 'connected' : 'muted');
  const liveCollaborators = useMemo(
    () => buildPresenceCollaborators(liveParticipants, {
      excludeSessionId: liveSessionId,
      excludeActorId: currentUser?.id || null,
    }),
    [currentUser?.id, liveParticipants, liveSessionId],
  );
  const titleCollaborators = useMemo(() => {
    if (!hasMap || !currentMap?.id || !canViewPresenceValue) return [];
    return isLiveActive ? liveCollaborators : presenceCollaborators;
  }, [canViewPresenceValue, currentMap?.id, hasMap, isLiveActive, liveCollaborators, presenceCollaborators]);
  const showCoeditingReadOnlyBanner = !!(
    isCoeditingReadOnlyMode
    && hasMap
    && currentMap?.id
    && !isLiveActive
  );
  const showLiveStatusBanner = !!(
    isLiveActive
    && hasMap
    && currentMap?.id
    && liveStatus === COEDITING_LIVE_STATUS.OUT_OF_SYNC
  );
  const commentPopoverReadOnlyMessage = useMemo(() => {
    if (effectiveFeatureGates.mapComment) return '';
    if (showCoeditingReadOnlyBanner || canViewCommentsValue) {
      return 'You can view comments on this map, but you cannot add or edit them.';
    }
    return '';
  }, [canViewCommentsValue, effectiveFeatureGates.mapComment, showCoeditingReadOnlyBanner]);

  // Autosave for existing maps (debounced)
  useEffect(() => {
    if (
      !currentMap?.id
      || !root
      || currentMap?.largeMapShell
      || isImportedMap
      || isViewingHistoricalVersion
      || isCollaborativeLiveEditingRestricted
      || isCoeditingReadOnlyMode
      || areMapPermissionsPending
    ) return;
    const captureAssetSaveIsActive = Boolean(
      nodeAssetSaveInFlightRef.current
      || pendingNodeAssetUpdatesRef.current.size > 0
      || (
        thumbnailStats.mode
        && (thumbnailStats.total || 0) > 0
        && !thumbnailStats.stopped
        && (
          activeImageCaptureJob
          || thumbnailStats.finalizing
          || (thumbnailStats.completed || 0) < (thumbnailStats.total || 0)
        )
      )
    );
    if (assetAutosaveSuppressionUntilRef.current > Date.now() || captureAssetSaveIsActive) return;

    const payload = buildMapSavePayload({
      name: currentMap?.name || mapName,
      root,
      orphans,
      connections,
      colors,
      connectionColors,
      project_id: currentMap?.project_id || null,
    });
    const snapshot = serializeMapAutosaveSnapshot(payload);

    if (snapshot === lastAutosaveSnapshotRef.current) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      const checkpointRequest = {
        mapId: currentMap.id,
        changedAt: Date.now(),
        snapshot: {
          root: payload.root,
          orphans: payload.orphans,
          connections: payload.connections,
          colors: payload.colors,
          connectionColors: payload.connectionColors,
        },
      };

      if (isLiveEditingModeActive) {
        lastAutosaveSnapshotRef.current = snapshot;
        setAutosaveCheckpointRequest(checkpointRequest);
        return;
      }

      autosavePendingRef.current = {
        mapId: currentMap.id,
        expectedUpdatedAt: currentMap?.updated_at || null,
        payload: buildMapSavePayload({
          name: (currentMap?.name || mapName || '').trim() || 'Untitled Map',
          root,
          orphans,
          connections,
          colors,
          connectionColors,
          project_id: currentMap?.project_id || null,
        }),
        snapshot,
      };
      flushAutosave();
    }, 800);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [activeImageCaptureJob, areMapPermissionsPending, currentMap?.id, currentMap?.largeMapShell, currentMap?.name, currentMap?.project_id, currentMap?.updated_at, root, orphans, connections, colors, connectionColors, mapName, isImportedMap, isViewingHistoricalVersion, flushAutosave, isLiveEditingModeActive, isCollaborativeLiveEditingRestricted, isCoeditingReadOnlyMode, thumbnailStats.completed, thumbnailStats.finalizing, thumbnailStats.mode, thumbnailStats.stopped, thumbnailStats.total]);

  useEffect(() => {
    if (!isCollaborativeLiveEditingRestricted) return;
    setUndoStack([]);
    setRedoStack([]);
  }, [isCollaborativeLiveEditingRestricted]);

  useEffect(() => {
    if (!isLiveActive) return;
    updateLiveSelection(Array.from(selectedNodeIds || []));
  }, [isLiveActive, selectedNodeIds, updateLiveSelection]);

  const liveSelectionBadges = useMemo(() => {
    if (!mapLayout?.nodes || !remoteSelections?.length) return [];
    const grouped = new Map();

    remoteSelections.forEach((participant, participantIndex) => {
      const nodeIds = Array.isArray(participant?.selectedNodeIds) ? participant.selectedNodeIds : [];
      const label = String(participant?.displayName || participant?.clientName || 'Collaborator').trim();
      const tone = Number.isInteger(participant?.tone) ? participant.tone : (participantIndex % 4);
      nodeIds.forEach((nodeId) => {
        const nodeData = mapLayout.nodes.get(nodeId);
        if (!nodeData) return;
        if (!grouped.has(nodeId)) {
          grouped.set(nodeId, {
            nodeId,
            x: nodeData.x,
            y: nodeData.y,
            w: nodeData.w,
            h: nodeData.h,
            participants: [],
          });
        }
        grouped.get(nodeId).participants.push({
          sessionId: participant.sessionId,
          label,
          tone,
        });
      });
    });

    return Array.from(grouped.values());
  }, [mapLayout, remoteSelections]);

  const loadMapVersions = useCallback(async (mapId) => {
    if (!mapId) return;
    setIsLoadingVersions(true);
    try {
      const { versions } = await api.getMapVersions(mapId);
      const list = versions || [];
      setMapVersions(list);
      const latestId = list[0]?.id || null;
      setLatestVersionId(latestId);
      if (activeVersionId && !list.some((version) => version.id === activeVersionId)) {
        setActiveVersionId(null);
        versionBaselineRef.current = null;
      }
      if (list[0]) {
        const snapshot = serializeVersionSnapshot({
          root: list[0].root,
          orphans: list[0].orphans,
          connections: list[0].connections,
          colors: list[0].colors || DEFAULT_COLORS,
          connectionColors: list[0].connectionColors || DEFAULT_CONNECTION_COLORS,
        });
        lastVersionSnapshotRef.current = snapshot;
      } else {
        lastVersionSnapshotRef.current = '';
      }
      return list;
    } catch (error) {
      console.error('Failed to load map versions', error);
      showToast('Failed to load versions', 'error');
      return [];
    } finally {
      setIsLoadingVersions(false);
    }
  }, [activeVersionId, showToast, serializeVersionSnapshot]);

  const loadMapPermissions = useCallback(async () => {
    if (!featureGatesEnabled || !isLoggedIn || !currentMap?.id) {
      setMapPermissions(null);
      return;
    }

    try {
      const { permissions } = await api.getMapFeatureGates(currentMap.id);
      setMapPermissions(permissions || null);
    } catch (error) {
      if (error?.status !== 404) {
        console.warn('Failed to load map feature gates', error);
      }
      setMapPermissions(null);
    }
  }, [currentMap?.id, featureGatesEnabled, isLoggedIn]);

  useEffect(() => {
    loadMapPermissions();
  }, [loadMapPermissions]);

  useEffect(() => {
    if (isLoggedIn) return;
    setPendingMapInvites([]);
    setPendingMapInvitesError('');
    setPendingMapInvitesLoading(false);
    setPendingAccessRequests([]);
    setPendingAccessRequestsError('');
    setPendingAccessRequestsLoading(false);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return undefined;

    const refreshPendingCollaborationItems = () => {
      loadPendingMapInvites({ silent: true });
      loadPendingAccessRequests({ silent: true });
    };

    const intervalId = window.setInterval(refreshPendingCollaborationItems, 30000);
    window.addEventListener('focus', refreshPendingCollaborationItems);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshPendingCollaborationItems);
    };
  }, [isLoggedIn, loadPendingAccessRequests, loadPendingMapInvites]);

  const loadCollaborationData = useCallback(async () => {
    if (
      !COLLABORATION_UI_ENABLED
      || !canViewCollaborationPanelValue
      || !showShareModal
      || !currentMap?.id
      || !isLoggedIn
    ) return;
    setCollaborationLoading(true);
    setCollaborationError('');
    try {
      const { collaboration } = await api.getMapCollaboration(currentMap.id);
      setCollaborationMemberships(collaboration?.memberships || []);
      setCollaborationInvites(collaboration?.invites || []);
      setCollaborationSettings(collaboration?.settings || null);
      setCollaborationAccessRequests(collaboration?.accessRequests || []);
    } catch (error) {
      setCollaborationMemberships([]);
      setCollaborationInvites([]);
      setCollaborationSettings(null);
      setCollaborationAccessRequests([]);
      if (error?.status === 404) {
        setCollaborationError('Collaboration backend is currently disabled.');
      } else {
        setCollaborationError(error.message || 'Failed to load collaboration data.');
      }
    } finally {
      setCollaborationLoading(false);
    }
  }, [canViewCollaborationPanelValue, currentMap?.id, isLoggedIn, showShareModal]);

  const sendCollaborationInvite = useCallback(async () => {
    if (!canSendCollaborationInvitesResolvedValue) {
      showToast('You do not have permission to send invites on this map.', 'warning');
      return;
    }
    if (!currentMap?.id) {
      showToast('Save this map before inviting collaborators.', 'warning');
      return;
    }
    const email = String(collaborationInviteEmail || '').trim();
    if (!email) {
      showToast('Enter an email address to invite.', 'warning');
      return;
    }
    if (
      collaborationInviteRoleOptionsValue.length > 0
      && !collaborationInviteRoleOptionsValue.includes(collaborationInviteRole)
    ) {
      showToast('That invite role is not available for your access level on this map.', 'warning');
      return;
    }

    setCollaborationLoading(true);
    setCollaborationError('');
    try {
      await api.createMapInvite(currentMap.id, {
        email,
        role: collaborationInviteRole,
      });
      trackEvent('invite_sent', {
        map_id: String(currentMap.id),
        role: collaborationInviteRole,
      });
      setCollaborationInviteEmail('');
      showToast('Invite created', 'success');
      await loadCollaborationData();
    } catch (error) {
      setCollaborationError(error.message || 'Failed to create invite.');
      showToast(error.message || 'Failed to create invite.', 'error');
    } finally {
      setCollaborationLoading(false);
    }
  }, [
    canSendCollaborationInvitesResolvedValue,
    collaborationInviteEmail,
    collaborationInviteRole,
    collaborationInviteRoleOptionsValue,
    currentMap?.id,
    loadCollaborationData,
    showToast,
  ]);

  const revokeCollaborationInvite = useCallback(async (inviteId) => {
    if (!canSendCollaborationInvitesResolvedValue) {
      showToast('You do not have permission to revoke invites on this map.', 'warning');
      return;
    }
    if (!currentMap?.id || !inviteId) return;
    setCollaborationLoading(true);
    setCollaborationError('');
    try {
      await api.revokeMapInvite(currentMap.id, inviteId);
      showToast('Invite revoked', 'success');
      await loadCollaborationData();
    } catch (error) {
      setCollaborationError(error.message || 'Failed to revoke invite.');
      showToast(error.message || 'Failed to revoke invite.', 'error');
    } finally {
      setCollaborationLoading(false);
    }
  }, [canSendCollaborationInvitesResolvedValue, currentMap?.id, loadCollaborationData, showToast]);

  const updateCollaborationSettings = useCallback(async (patch) => {
    if (!canManageCollaborationSettingsResolvedValue) {
      showToast('Only owners can update collaboration settings on this map.', 'warning');
      return;
    }
    if (!currentMap?.id) return;
    const previousSettings = collaborationSettings || DEFAULT_COLLABORATION_SETTINGS;
    const nextSettings = mergeCollaborationSettingsPatch(previousSettings, patch);
    setCollaborationSettings(nextSettings);
    setCollaborationLoading(true);
    setCollaborationError('');
    try {
      const { settings } = await api.updateMapCollaborationSettings(currentMap.id, patch);
      setCollaborationSettings(settings || nextSettings);
      showToast('Collaboration settings updated', 'success');
      await loadCollaborationData();
    } catch (error) {
      setCollaborationSettings(previousSettings);
      setCollaborationError(error.message || 'Failed to update collaboration settings.');
      showToast(error.message || 'Failed to update collaboration settings.', 'error');
    } finally {
      setCollaborationLoading(false);
    }
  }, [
    canManageCollaborationSettingsResolvedValue,
    collaborationSettings,
    currentMap?.id,
    loadCollaborationData,
    showToast,
  ]);

  const updateCollaborationMemberRole = useCallback(async (userId, role) => {
    if (!canManageCollaborationMembersValue) {
      showToast('You do not have permission to manage members on this map.', 'warning');
      return;
    }
    if (!currentMap?.id || !userId || !role) return;
    if (sameId(userId, currentUser?.id)) {
      showToast('Manage your own access from another owner account instead.', 'info');
      return;
    }
    const previousMemberships = collaborationMemberships;
    setCollaborationMemberships((prev) => prev.map((member) => (
      sameId(member.userId, userId)
        ? { ...member, role }
        : member
    )));
    setCollaborationLoading(true);
    setCollaborationError('');
    try {
      const { membership } = await api.updateMapMemberRole(currentMap.id, userId, role);
      if (membership) {
        setCollaborationMemberships((prev) => prev.map((member) => (
          sameId(member.userId, userId)
            ? { ...member, ...membership }
            : member
        )));
      }
      showToast('Member role updated', 'success');
      await loadCollaborationData();
    } catch (error) {
      setCollaborationMemberships(previousMemberships);
      setCollaborationError(error.message || 'Failed to update member role.');
      showToast(error.message || 'Failed to update member role.', 'error');
    } finally {
      setCollaborationLoading(false);
    }
  }, [
    canManageCollaborationMembersValue,
    collaborationMemberships,
    currentMap?.id,
    currentUser?.id,
    loadCollaborationData,
    showToast,
  ]);

  const removeCollaborationMember = useCallback(async (member) => {
    if (!canManageCollaborationMembersValue) {
      showToast('You do not have permission to remove members on this map.', 'warning');
      return;
    }
    if (!currentMap?.id || !member?.userId) return;
    if (sameId(member.userId, currentUser?.id)) {
      showToast('Manage your own access from another owner account instead.', 'info');
      return;
    }

    const confirmed = await showConfirm({
      title: 'Remove Access',
      message: `Remove ${member.userName || member.userEmail || 'this member'} from this map?`,
      confirmText: 'Remove',
      danger: true,
    });
    if (!confirmed) return;

    const previousMemberships = collaborationMemberships;
    setCollaborationMemberships((prev) => prev.filter((entry) => !sameId(entry.userId, member.userId)));
    setCollaborationLoading(true);
    setCollaborationError('');
    try {
      await api.removeMapMember(currentMap.id, member.userId);
      showToast('Member removed', 'success');
      await loadCollaborationData();
    } catch (error) {
      setCollaborationMemberships(previousMemberships);
      setCollaborationError(error.message || 'Failed to remove member.');
      showToast(error.message || 'Failed to remove member.', 'error');
    } finally {
      setCollaborationLoading(false);
    }
  }, [
    canManageCollaborationMembersValue,
    collaborationMemberships,
    currentMap?.id,
    currentUser?.id,
    loadCollaborationData,
    showConfirm,
    showToast,
  ]);

  const reviewCollaborationAccessRequest = useCallback(async (requestId, status, role) => {
    if (!canViewAccessRequestsResolvedValue) {
      showToast('Only owners can review access requests on this map.', 'warning');
      return;
    }
    if (!currentMap?.id || !requestId || !status) return;
    const previousRequests = collaborationAccessRequests;
    setCollaborationAccessRequests((prev) => prev.filter((request) => request.id !== requestId));
    setCollaborationLoading(true);
    setCollaborationError('');
    try {
      await api.reviewMapAccessRequest(currentMap.id, requestId, { status, role });
      showToast(status === 'approved' ? 'Access request approved' : 'Access request denied', 'success');
      await Promise.all([
        loadCollaborationData(),
        loadPendingAccessRequests({ silent: true }),
      ]);
    } catch (error) {
      setCollaborationAccessRequests(previousRequests);
      setCollaborationError(error.message || 'Failed to review access request.');
      showToast(error.message || 'Failed to review access request.', 'error');
    } finally {
      setCollaborationLoading(false);
    }
  }, [
    canViewAccessRequestsResolvedValue,
    collaborationAccessRequests,
    currentMap?.id,
    loadCollaborationData,
    loadPendingAccessRequests,
    showToast,
  ]);

  useEffect(() => {
    if (!showShareModal) return;
    if (!COLLABORATION_UI_ENABLED) return;
    if (!canViewCollaborationPanelValue) return;
    loadCollaborationData();
  }, [canViewCollaborationPanelValue, loadCollaborationData, showShareModal]);

  useEffect(() => {
    if (!showShareModal || !COLLABORATION_UI_ENABLED || canViewCollaborationPanelValue) return;
    setCollaborationError('');
    setCollaborationMemberships([]);
    setCollaborationInvites([]);
  }, [canViewCollaborationPanelValue, showShareModal]);

  useEffect(() => {
    if (showShareModal) return;
    setCollaborationError('');
    setCollaborationMemberships([]);
    setCollaborationInvites([]);
  }, [showShareModal]);

  const resolvePresenceAccessMode = useCallback(() => {
    if (canEditValue) return 'edit';
    if (canCommentValue) return 'comment';
    return 'view';
  }, [canCommentValue, canEditValue]);

  const leavePresenceSession = useCallback(async (mapId) => {
    const sessionId = presenceSessionIdRef.current;
    if (!REALTIME_BASELINE_ENABLED || !mapId || !sessionId || !isLoggedIn) return;
    try {
      await api.leaveMapPresence(mapId, sessionId);
    } catch (error) {
      if (error?.status !== 404) {
        console.warn('Failed to leave map presence session', error);
      }
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (
      !REALTIME_BASELINE_ENABLED
      || !canViewPresenceValue
      || !isLoggedIn
      || !currentMap?.id
      || !currentUser?.id
    ) {
      setPresenceSessions([]);
      return;
    }

    let isActive = true;
    let timerId = null;

    const sendHeartbeat = async () => {
      if (!isActive) return;

      if (!presenceSessionIdRef.current) {
        presenceSessionIdRef.current = createPresenceSessionId();
      }

      try {
        const { presence } = await api.sendMapPresenceHeartbeat(currentMap.id, {
          sessionId: presenceSessionIdRef.current,
          accessMode: resolvePresenceAccessMode(),
          clientName: 'web',
        });
        if (!isActive) return;
        setPresenceSessions(presence?.sessions || []);
      } catch (error) {
        if (!isActive) return;
        if (error?.status === 404) {
          setPresenceSessions([]);
          return;
        }
        console.warn('Presence heartbeat failed', error);
      }

      if (!isActive) return;
      timerId = window.setTimeout(sendHeartbeat, REALTIME_PRESENCE_HEARTBEAT_SEC * 1000);
    };

    sendHeartbeat();

    return () => {
      isActive = false;
      if (timerId) window.clearTimeout(timerId);
    };
  }, [canViewPresenceValue, currentMap?.id, currentUser?.id, isLoggedIn, resolvePresenceAccessMode]);

  useEffect(() => {
    const mapId = currentMap?.id;
    return () => {
      if (!mapId) return;
      leavePresenceSession(mapId);
    };
  }, [currentMap?.id, leavePresenceSession]);

  useEffect(() => {
    if (!REALTIME_BASELINE_ENABLED) return undefined;

    const handleBeforeUnload = () => {
      if (!isLoggedIn || !canViewPresenceValue || !currentMap?.id || !presenceSessionIdRef.current) return;
      const endpoint = `${API_BASE}/api/maps/${currentMap.id}/presence/${encodeURIComponent(
        presenceSessionIdRef.current
      )}`;
      fetch(endpoint, {
        method: 'DELETE',
        credentials: 'include',
        keepalive: true,
      }).catch(() => {});
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [canViewPresenceValue, currentMap?.id, isLoggedIn]);

  useEffect(() => {
    if (!currentMap?.id) {
      setMapVersions([]);
      setActiveVersionId(null);
      setLatestVersionId(null);
      setShowVersionEditPrompt(false);
      setShowVersionHistoryDrawer(false);
      setShowImageReportDrawer(false);
      versionBaselineRef.current = null;
      lastVersionSnapshotRef.current = '';
      return;
    }
    if (currentMap?.largeMapShell) {
      setMapVersions([]);
      setActiveVersionId(null);
      setLatestVersionId(null);
      versionBaselineRef.current = null;
      lastVersionSnapshotRef.current = '';
      return;
    }
    loadMapVersions(currentMap.id);
    lastAutosaveVersionAtRef.current = 0;
  }, [currentMap?.id, currentMap?.largeMapShell, loadMapVersions]);

  useEffect(() => {
    if (currentMap?.id) {
      if (draftVersions.length > 0) setDraftVersions([]);
      if (draftLatestVersionId) setDraftLatestVersionId(null);
    }
  }, [currentMap?.id, draftVersions.length, draftLatestVersionId]);

  useEffect(() => {
    if (!root) {
      if (draftVersions.length > 0) setDraftVersions([]);
      if (draftLatestVersionId) setDraftLatestVersionId(null);
    }
  }, [root, draftVersions.length, draftLatestVersionId]);

  useEffect(() => {
    if (!showVersionHistoryDrawer || !currentMap?.id) return;
    let canceled = false;
    (async () => {
      await loadMapVersions(currentMap.id);
      if (!canceled && canViewActivityValue) {
        await loadMapActivity(currentMap.id, { silent: false, allowToast: false });
      }
    })();
    return () => {
      canceled = true;
    };
  }, [canViewActivityValue, currentMap?.id, loadMapActivity, loadMapVersions, showVersionHistoryDrawer]);

  const createVersionFromSnapshot = useCallback(async ({ mapId, name, notes, snapshot, allowDuplicate = false } = {}) => {
    const targetMapId = mapId || currentMap?.id;
    if (!targetMapId || !root) return null;
    if (targetMapId === currentMap?.id && warnCoeditingReadOnly('This map')) return null;
    const payload = snapshot || getVersionSnapshot();
    const serialized = serializeVersionSnapshot(payload);
    if (!allowDuplicate && serialized && serialized === lastVersionSnapshotRef.current) return null;
    const { version } = await api.createMapVersion(targetMapId, {
      ...payload,
      name,
      notes,
    });
    trackEvent('version_saved', {
      map_id: String(targetMapId),
      version_id: String(version?.id || ''),
      version_name: version?.name || name || '',
      autosaved: (version?.name || name || '').toLowerCase() === 'autosaved' ? 'true' : 'false',
    });
    lastVersionSnapshotRef.current = serialized;
    setMapVersions((prev) => [version, ...(prev || [])].slice(0, 25));
    setLatestVersionId(version.id);
    return version;
  }, [currentMap?.id, root, getVersionSnapshot, serializeVersionSnapshot, warnCoeditingReadOnly]);

  useEffect(() => {
    const request = autosaveCheckpointRequest;
    if (!request?.mapId || !request?.snapshot?.root) return;
    if (request.skipVersionCheckpoint) return;
    if (currentMap?.id && !sameId(currentMap.id, request.mapId)) return;
    if (!request.force && (request.changedAt || 0) - lastAutosaveVersionAtRef.current < AUTOSAVE_CHECKPOINT_MIN_INTERVAL_MS) return;
    const serialized = serializeVersionSnapshot(request.snapshot);
    if (!serialized || serialized === lastVersionSnapshotRef.current) return;
    const checkpointKey = `${request.mapId}:${request.changedAt || 0}:${serialized}`;
    if (
      checkpointKey === lastAutosaveCheckpointKeyRef.current
      || autosaveCheckpointInFlightRef.current.has(checkpointKey)
    ) return;
    autosaveCheckpointInFlightRef.current.add(checkpointKey);

    let cancelled = false;
    (async () => {
      try {
        const version = await createVersionFromSnapshot({
          mapId: request.mapId,
          snapshot: request.snapshot,
          name: 'Autosaved',
        });
        if (!cancelled && version) {
          lastAutosaveVersionAtRef.current = request.changedAt || Date.now();
          lastAutosaveCheckpointKeyRef.current = checkpointKey;
          if (showVersionHistoryDrawer && canViewActivityValue) {
            await loadMapActivity(request.mapId, { silent: true, allowToast: false });
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to create autosave checkpoint', error);
        }
      } finally {
        autosaveCheckpointInFlightRef.current.delete(checkpointKey);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    autosaveCheckpointRequest,
    canViewActivityValue,
    createVersionFromSnapshot,
    currentMap?.id,
    loadMapActivity,
    serializeVersionSnapshot,
    showVersionHistoryDrawer,
  ]);

  const refreshTimelineAfterImageCapture = useCallback(async () => {
    if (!currentMap?.id) return;
    try {
      const version = await createVersionFromSnapshot({
        mapId: currentMap.id,
        name: 'Autosaved',
      });
      if (version) {
        lastAutosaveVersionAtRef.current = Date.now();
      }
      if (showVersionHistoryDrawer) {
        await loadMapVersions(currentMap.id);
      }
      if (canViewActivityValue) {
        await loadMapActivity(currentMap.id, { silent: true, allowToast: false });
      }
    } catch (error) {
      console.warn('Failed to refresh timeline after image capture', error);
    }
  }, [
    canViewActivityValue,
    createVersionFromSnapshot,
    currentMap?.id,
    loadMapActivity,
    loadMapVersions,
    showVersionHistoryDrawer,
  ]);

  useEffect(() => {
    if (!isViewingHistoricalVersion) return;
    if (!versionBaselineRef.current || showVersionEditPrompt) return;
    const currentSnapshot = serializeVersionSnapshot(getVersionSnapshot());
    if (currentSnapshot && currentSnapshot !== versionBaselineRef.current) {
      setShowVersionEditPrompt(true);
    }
  }, [isViewingHistoricalVersion, showVersionEditPrompt, getVersionSnapshot, serializeVersionSnapshot]);

  useEffect(() => {
    const message = 'Viewing an older version. Changes will prompt you to save a copy or override the latest.';
    if (isViewingHistoricalVersion) {
      if (!versionInfoToastRef.current) {
        showToast(message, 'info', true);
        versionInfoToastRef.current = true;
      }
      return;
    }
    if (versionInfoToastRef.current) {
      if (toast?.message === message) {
        setToast(null);
      }
      versionInfoToastRef.current = false;
    }
  }, [isViewingHistoricalVersion, toast, showToast]);

  const closeAuthModal = useCallback(() => {
    setShowAuthModal(false);
    setAuthContextMessage('');
    setPendingAuthPostSuccessAction(null);
  }, []);

  const openAuthModal = useCallback(({ contextMessage = '', postSuccessAction = null } = {}) => {
    setAuthContextMessage(contextMessage);
    setPendingAuthPostSuccessAction(postSuccessAction);
    setShowAuthModal(true);
  }, []);

  const openProjectsPanel = useCallback(() => {
    setShowProjectsModal(true);
    setShowHistoryModal(false);
    setShowCommentsPanel(false);
    setShowReportDrawer(false);
    setShowImageReportDrawer(false);
    setShowProfileDrawer(false);
    setShowSettingsDrawer(false);
    setShowVersionHistoryDrawer(false);
  }, []);

  const handleLogin = useCallback(() => {
    openAuthModal();
  }, [openAuthModal]);

  const handleAuthSuccess = async (user) => {
    setCurrentUser(user);
    setIsLoggedIn(true);
    setAccessLevel(ACCESS_LEVELS.EDIT);
    identifyAnalyticsUser(user);
    const loginMethod = user?.authMode === 'demo'
      ? 'demo'
      : (user?.authProvider === 'google' || user?.authMode === 'google' ? 'google' : 'password');
    trackEvent('login', {
      method: loginMethod,
      app_mode: APP_ONLY_MODE ? 'app_only' : 'full',
    });

    // Load user's projects, maps, and history
    try {
      await loadAuthenticatedWorkspace();
      await Promise.all([
        loadPendingMapInvites({ silent: true }),
        loadPendingAccessRequests({ silent: true }),
      ]);
    } catch (e) {
      console.error('Failed to load user data:', e);
    }
    if (pendingAuthPostSuccessAction === 'open-projects') {
      openProjectsPanel();
    }
  };

  const handleDemoAccess = useCallback((user) => {
    setCurrentUser(user);
    setIsLoggedIn(true);
    setAccessLevel(ACCESS_LEVELS.EDIT);
    identifyAnalyticsUser(user);
    trackEvent('login', {
      method: 'demo',
      app_mode: APP_ONLY_MODE ? 'app_only' : 'full',
    });
    setProjects([]);
    setScanHistory([]);
    setPendingMapInvites([]);
    setPendingMapInvitesError('');
    setPendingAccessRequests([]);
    setPendingAccessRequestsError('');
    if (pendingAuthPostSuccessAction === 'open-projects') {
      openProjectsPanel();
    }
  }, [openProjectsPanel, pendingAuthPostSuccessAction]);

  useEffect(() => {
    if (authLoading) return;

    const authSuccess = currentRoute?.searchParams?.get('auth_success') || '';
    const authError = currentRoute?.searchParams?.get('auth_error') || '';
    const authProvider = currentRoute?.searchParams?.get('auth_provider') || '';

    if (!authSuccess && !authError) {
      handledAuthRedirectKeyRef.current = '';
      return;
    }

    const authRedirectKey = `${currentRoute?.pathname || ''}|${currentRoute?.search || ''}`;
    if (handledAuthRedirectKeyRef.current === authRedirectKey) return;
    handledAuthRedirectKeyRef.current = authRedirectKey;

    if (authSuccess === 'google' && currentUser) {
      showToast('Signed in with Google', 'success');
      trackEvent('login', {
        method: 'google',
        app_mode: APP_ONLY_MODE ? 'app_only' : 'full',
      });
    } else if (authError) {
      showToast('Google sign-in did not complete. Try again or use email instead.', 'error');
      if (!currentUser) {
        openAuthModal({
          contextMessage: authProvider === 'google'
            ? 'Google sign-in did not complete. You can try again or use email and password.'
            : '',
        });
      }
    }

    const nextSearchParams = new URLSearchParams(currentRoute?.search || '');
    nextSearchParams.delete('auth_success');
    nextSearchParams.delete('auth_error');
    nextSearchParams.delete('auth_provider');
    const nextSearch = nextSearchParams.toString();
    const nextUrl = `${currentRoute?.pathname || '/app'}${nextSearch ? `?${nextSearch}` : ''}`;
    window.history.replaceState({}, '', nextUrl);
  }, [
    authLoading,
    currentRoute?.pathname,
    currentRoute?.search,
    currentRoute?.searchParams,
    currentUser,
    openAuthModal,
    showToast,
  ]);

  useEffect(() => {
    if (currentUser) {
      identifyAnalyticsUser(currentUser);
      return;
    }
    clearAnalyticsUser();
  }, [currentUser]);


  const applyLoggedOutState = useCallback(({ preserveViewOnlyMap = false } = {}) => {
    try {
      if (preserveViewOnlyMap && root) {
        setCurrentUser(null);
        setIsLoggedIn(false);
        clearAnalyticsUser();
        setProjects([]);
        setScanHistory([]);
        setCurrentMap(null);
        setAccessLevel(ACCESS_LEVELS.VIEW);
        setShowSaveMapModal(false);
        setShowInviteInboxModal(false);
        setShowAccessRequestsInboxModal(false);
        setShowProfileDrawer(false);
        setShowSettingsDrawer(false);
        setShowVersionHistoryDrawer(false);
        setShowImageReportDrawer(false);
        if (currentRoute?.surface !== ROUTE_SURFACES.SHARE) {
          navigateToRoute(createAppHomeRoute(), { replace: true });
        }
        showToast('Logged out. Map is now view-only.', 'info');
        return;
      }

      setCurrentUser(null);
      setIsLoggedIn(false);
      clearAnalyticsUser();
      setProjects([]);
      setScanHistory([]);
      setRoot(null);
      setOrphans([]);
      setConnections([]);
      setCurrentMap(null);
      setIsImportedMap(false);
      setShowThumbnails(false);
      setSelectedNodeIds(new Set());
      setSelectionBox(null);
      setThumbnailScopeIds(null);
      setShowImageMenu(false);
      setShowImageReportDrawer(false);
      applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
      setUrlInput('');
      resetScanLayers();
      setShowSaveMapModal(false);
      setShowInviteInboxModal(false);
      setShowAccessRequestsInboxModal(false);
      setShowProfileDrawer(false);
      setShowSettingsDrawer(false);
      setShowVersionHistoryDrawer(false);
      if (currentRoute?.surface !== ROUTE_SURFACES.SHARE) {
        navigateToRoute(createAppHomeRoute(), { replace: true });
      }
      showToast('Logged out', 'info');
    } finally {
      setPendingLogoutAfterSave(false);
      setPendingCreateAfterSave(null);
      setCreateMapDefaults(null);
      setPendingLoadMap(null);
      setHasCreatedShareLink(false);
      setCurrentShareAccess(null);
    }
  }, [applyTransform, currentRoute?.surface, navigateToRoute, resetScanLayers, root, showToast]);

  const performLogout = useCallback(async ({ preserveViewOnlyMap = false } = {}) => {
    try {
      await api.logout();
    } catch (e) {
      console.error('Logout error:', e);
    }
    applyLoggedOutState({ preserveViewOnlyMap });
  }, [applyLoggedOutState]);

  const handleLogout = useCallback(async () => {
    const hasUnsavedMap = hasMap && !currentMap?.id;

    if (hasUnsavedMap) {
      const wantsSave = await showConfirm({
        title: 'Save before logout?',
        message: 'You have an unsaved map. Save it before logging out?',
        confirmText: 'Save Map',
        cancelText: 'Log Out',
      });
      if (wantsSave) {
        setPendingLogoutAfterSave(true);
        setCreateMapMode(false);
        setDuplicateMapConfig(null);
        setShowSaveMapModal(true);
        return;
      }
      await performLogout({ preserveViewOnlyMap: false });
      return;
    }

    const shouldPreserveAsViewOnly = Boolean(currentMap?.id)
      && (
        accessLevel === ACCESS_LEVELS.VIEW
        || (hasCreatedShareLink && currentShareAccess === ACCESS_LEVELS.VIEW)
      );

    await performLogout({ preserveViewOnlyMap: shouldPreserveAsViewOnly });
  }, [
    accessLevel,
    currentMap?.id,
    hasCreatedShareLink,
    hasMap,
    currentShareAccess,
    performLogout,
    showConfirm,
  ]);

  const getActiveAppRoute = useCallback(() => {
    if (currentMap?.id) return createMapRoute(currentMap.id);
    return createAppHomeRoute();
  }, [currentMap?.id]);

  const handleShowInviteInbox = useCallback(async () => {
    navigateToRoute(createInviteInboxRoute());
    setShowInviteInboxModal(true);
    await loadPendingMapInvites();
  }, [loadPendingMapInvites, navigateToRoute]);

  const handleShowAccessRequestsInbox = useCallback(async () => {
    navigateToRoute(createAccessRequestsRoute());
    setShowAccessRequestsInboxModal(true);
    await loadPendingAccessRequests();
  }, [loadPendingAccessRequests, navigateToRoute]);

  useEffect(() => {
    if (currentRoute?.surface !== ROUTE_SURFACES.APP || currentRoute?.section !== 'invites') return;
    if (authLoading) return;
    if (!isLoggedIn) {
      openAuthModal();
      return;
    }
    setShowInviteInboxModal(true);
    loadPendingMapInvites();
  }, [
    authLoading,
    currentRoute?.section,
    currentRoute?.surface,
    isLoggedIn,
    loadPendingMapInvites,
    openAuthModal,
  ]);

  useEffect(() => {
    if (currentRoute?.surface !== ROUTE_SURFACES.APP || currentRoute?.section !== 'access_requests') return;
    if (authLoading) return;
    if (!isLoggedIn) {
      openAuthModal();
      return;
    }
    setShowAccessRequestsInboxModal(true);
    loadPendingAccessRequests();
  }, [
    authLoading,
    currentRoute?.section,
    currentRoute?.surface,
    isLoggedIn,
    loadPendingAccessRequests,
    openAuthModal,
  ]);

  const handleAcceptPendingInvite = useCallback(async (invite) => {
    if (!invite?.id) return;
    setPendingMapInvitesLoading(true);
    setPendingMapInvitesError('');
    try {
      await api.acceptMapInviteById(invite.id);
      trackEvent('invite_accepted', {
        map_id: String(invite?.mapId || ''),
      });
      showToast(`Invite accepted for ${invite.mapName || 'shared map'}`, 'success');
      await Promise.all([
        loadAuthenticatedWorkspace(),
        loadPendingMapInvites({ silent: true }),
        loadPendingAccessRequests({ silent: true }),
      ]);
      if (invite.mapId && loadSavedMapByIdRef.current) {
        try {
          await loadSavedMapByIdRef.current(invite.mapId, { silent: true });
          setRouteMapGateState(null);
          setRouteAccessRequestMessage('');
        } catch {
          if (currentRoute?.surface === ROUTE_SURFACES.APP && currentRoute?.section === 'map' && sameId(currentRoute?.mapId, invite.mapId)) {
            setRouteMapGateState((previous) => previous ? { ...previous, loading: false } : previous);
          }
        }
      }
    } catch (error) {
      setPendingMapInvitesError(error.message || 'Failed to accept invite.');
      showToast(error.message || 'Failed to accept invite.', 'error');
    } finally {
      setPendingMapInvitesLoading(false);
    }
  }, [
    currentRoute?.mapId,
    currentRoute?.section,
    currentRoute?.surface,
    loadAuthenticatedWorkspace,
    loadPendingAccessRequests,
    loadPendingMapInvites,
    showToast,
  ]);

  const handleDeclinePendingInvite = useCallback(async (invite) => {
    if (!invite?.id) return;
    setPendingMapInvitesLoading(true);
    setPendingMapInvitesError('');
    try {
      await api.declineMapInviteById(invite.id);
      showToast(`Invite declined for ${invite.mapName || 'shared map'}`, 'info');
      await loadPendingMapInvites({ silent: true });
      if (invite.mapId && currentRoute?.surface === ROUTE_SURFACES.APP && currentRoute?.section === 'map' && sameId(currentRoute?.mapId, invite.mapId)) {
        setRouteMapGateState((previous) => previous ? { ...previous, loading: false } : previous);
      }
    } catch (error) {
      setPendingMapInvitesError(error.message || 'Failed to decline invite.');
      showToast(error.message || 'Failed to decline invite.', 'error');
    } finally {
      setPendingMapInvitesLoading(false);
    }
  }, [currentRoute?.mapId, currentRoute?.section, currentRoute?.surface, loadPendingMapInvites, showToast]);

  const handleApprovePendingAccessRequest = useCallback(async (request, role) => {
    if (!request?.id || !request?.mapId) return;
    setPendingAccessRequestsLoading(true);
    setPendingAccessRequestsError('');
    try {
      await api.reviewMapAccessRequest(request.mapId, request.id, {
        status: 'approved',
        role: role || request.requestedRole || 'viewer',
      });
      trackEvent('access_request_approved', {
        map_id: String(request.mapId),
        role: role || request.requestedRole || 'viewer',
      });
      showToast(`Approved access for ${request.requesterName || request.requesterEmail || 'user'}`, 'success');
      await Promise.all([
        loadPendingAccessRequests({ silent: true }),
        currentMap?.id && sameId(currentMap.id, request.mapId) ? loadCollaborationData() : Promise.resolve(),
      ]);
    } catch (error) {
      setPendingAccessRequestsError(error.message || 'Failed to approve access request.');
      showToast(error.message || 'Failed to approve access request.', 'error');
    } finally {
      setPendingAccessRequestsLoading(false);
    }
  }, [currentMap?.id, loadCollaborationData, loadPendingAccessRequests, showToast]);

  const handleDenyPendingAccessRequest = useCallback(async (request) => {
    if (!request?.id || !request?.mapId) return;
    setPendingAccessRequestsLoading(true);
    setPendingAccessRequestsError('');
    try {
      await api.reviewMapAccessRequest(request.mapId, request.id, {
        status: 'denied',
      });
      showToast(`Denied access for ${request.requesterName || request.requesterEmail || 'user'}`, 'info');
      await Promise.all([
        loadPendingAccessRequests({ silent: true }),
        currentMap?.id && sameId(currentMap.id, request.mapId) ? loadCollaborationData() : Promise.resolve(),
      ]);
    } catch (error) {
      setPendingAccessRequestsError(error.message || 'Failed to deny access request.');
      showToast(error.message || 'Failed to deny access request.', 'error');
    } finally {
      setPendingAccessRequestsLoading(false);
    }
  }, [currentMap?.id, loadCollaborationData, loadPendingAccessRequests, showToast]);

  const handleRequestRouteMapAccess = useCallback(async () => {
    const mapId = currentRoute?.surface === ROUTE_SURFACES.APP && currentRoute?.section === 'map'
      ? currentRoute.mapId
      : null;
    if (!mapId) return;
    if (!isLoggedIn) {
      openAuthModal();
      return;
    }

    setRouteMapGateState((previous) => ({
      mapId,
      loading: false,
      errorStatus: previous?.errorStatus || null,
      errorMessage: previous?.errorMessage || 'You do not currently have access to this map.',
      requestStatus: 'submitting',
      requestError: '',
    }));

    try {
      const response = await api.createMapAccessRequest(mapId, {
        requestedRole: 'viewer',
        message: routeAccessRequestMessage.trim() || undefined,
      });
      trackEvent('access_request_sent', {
        map_id: String(mapId),
        reused: response?.reused ? 'true' : 'false',
      });
      setRouteMapGateState((previous) => ({
        mapId,
        loading: false,
        errorStatus: previous?.errorStatus || 403,
        errorMessage: previous?.errorMessage || 'You do not currently have access to this map.',
        requestStatus: 'submitted',
        requestError: '',
        requestId: response?.accessRequest?.id || null,
      }));
      showToast(
        response?.reused
          ? 'Your access request is already pending review.'
          : 'Access request sent to the map owners.',
        'success'
      );
    } catch (error) {
      if (error?.status === 409 && /pending invite/i.test(error.message || '')) {
        await loadPendingMapInvites({ silent: true });
      }
      setRouteMapGateState((previous) => ({
        mapId,
        loading: false,
        errorStatus: previous?.errorStatus || error?.status || null,
        errorMessage: previous?.errorMessage || 'You do not currently have access to this map.',
        requestStatus: error?.status === 403 ? 'disabled' : 'idle',
        requestError: error?.message || 'Failed to send access request.',
      }));
      showToast(
        error?.message || 'Failed to send access request.',
        error?.status === 403 ? 'warning' : 'error'
      );
    }
  }, [
    currentRoute?.mapId,
    currentRoute?.section,
    currentRoute?.surface,
    isLoggedIn,
    loadPendingMapInvites,
    openAuthModal,
    routeAccessRequestMessage,
    showToast,
  ]);

  const handleShowProfile = useCallback(() => {
    setShowProfileDrawer(true);
    setShowSettingsDrawer(false);
    setShowCommentsPanel(false);
    setShowReportDrawer(false);
    setShowImageReportDrawer(false);
    setShowVersionHistoryDrawer(false);
    setShowProjectsModal(false);
    setShowHistoryModal(false);
  }, []);

  const handleShowSettings = useCallback(() => {
    setShowSettingsDrawer(true);
    setShowProfileDrawer(false);
    setShowCommentsPanel(false);
    setShowReportDrawer(false);
    setShowImageReportDrawer(false);
    setShowVersionHistoryDrawer(false);
    setShowProjectsModal(false);
    setShowHistoryModal(false);
  }, []);

  const handleShowProjects = openProjectsPanel;

  const handleShowHistory = useCallback(() => {
    setShowHistoryModal(true);
    setShowProjectsModal(false);
    setShowCommentsPanel(false);
    setShowReportDrawer(false);
    setShowImageReportDrawer(false);
    setShowProfileDrawer(false);
    setShowSettingsDrawer(false);
    setShowVersionHistoryDrawer(false);
  }, []);

  const authValue = useMemo(() => ({
    isLoggedIn,
    currentUser,
    onLogin: handleLogin,
    onLogout: handleLogout,
    onShowProfile: handleShowProfile,
    onShowSettings: handleShowSettings,
  }), [isLoggedIn, currentUser, handleLogin, handleLogout, handleShowProfile, handleShowSettings]);

  const startMapNameEdit = useCallback(() => {
    if (!canEdit()) return;
    mapNameEditStartRef.current = mapName || currentMap?.name || 'Untitled Map';
    setIsEditingMapName(true);
  }, [canEdit, currentMap?.name, mapName]);

  const cancelMapNameEdit = useCallback(() => {
    setMapName(mapNameEditStartRef.current || currentMap?.name || mapName || 'Untitled Map');
    setIsEditingMapName(false);
  }, [currentMap?.name, mapName]);

  const commitMapNameEdit = useCallback(() => {
    const trimmedName = (mapName || '').trim() || 'Untitled Map';
    if (currentMap?.id) {
      const conflict = findMapNameConflict(projects, {
        projectId: currentMap.project_id || null,
        name: trimmedName,
        excludeMapId: currentMap.id,
      });
      if (conflict) {
        showToast(getMapNameConflictMessage(trimmedName), 'error');
        return;
      }
    }
    setMapName(trimmedName);
    setIsEditingMapName(false);

    if (currentMap?.id) {
      setCurrentMap((prev) => (prev ? { ...prev, name: trimmedName } : prev));
    }

    if (isLiveActive && currentMap?.id && trimmedName !== ((currentMap?.name || '').trim() || 'Untitled Map')) {
      const result = submitLiveDraft({
        type: 'metadata.update',
        payload: {
          changes: {
            name: trimmedName,
          },
        },
      });
      if (!result.ok) {
        showToast(result.error || 'Failed to queue map rename', 'error');
      }
    }
  }, [currentMap?.id, currentMap?.name, currentMap?.project_id, isLiveActive, mapName, projects, showToast, submitLiveDraft]);

  const updateNodeScreenshotAssets = useCallback((nodeId, assetUpdates = {}, options = {}) => {
    if (!nodeId) return false;
    const queueSave = options?.queueSave !== false;
    const nextAssets = Object.entries(assetUpdates).filter(([key, value]) => {
      if (value === undefined) return false;
      if (value === null) return true;
      if (typeof value === 'string') {
        if (value.trim().length > 0) return true;
        return CLEARABLE_NODE_ASSET_KEYS.has(key);
      }
      return true;
    });
    if (nextAssets.length === 0) return false;
    const nextMap = applyNodeAssetUpdatesToMap({
      root: rootRef.current || root,
      orphans: orphansRef.current || orphans,
      nodeId,
      assetEntries: nextAssets,
    });
    if (!nextMap.updated) return false;
    assetAutosaveSuppressionUntilRef.current = Date.now() + ASSET_AUTOSAVE_SUPPRESSION_MS;
    rootRef.current = nextMap.root;
    orphansRef.current = nextMap.orphans;
    const normalizedAssets = nextAssets.reduce((acc, [key, value]) => {
      acc[key] = typeof value === 'string' && value.trim().length === 0 ? null : value;
      return acc;
    }, {});
    if (queueSave) {
      pendingNodeAssetUpdatesRef.current.set(nodeId, {
        ...(pendingNodeAssetUpdatesRef.current.get(nodeId) || {}),
        ...normalizedAssets,
      });
    }
    setRoot(nextMap.root);
    setOrphans(nextMap.orphans);
    return true;
  }, [orphans, root]);

  const getThumbnailAssetUpdates = (data) => {
    const smallUrl = data?.thumbnailUrl || data?.url || '';
    const previewUrl = data?.thumbnailFullUrl || data?.previewUrl || data?.fullSizeUrl || data?.url || '';
    const updates = {
      authRequired: false,
      thumbnailCaptureFailed: false,
      thumbnailCaptureError: null,
      thumbnailCaptureFailedAt: null,
    };
    if (smallUrl) updates.thumbnailUrl = smallUrl;
    if (previewUrl) updates.thumbnailFullUrl = previewUrl;
    return updates;
  };

  const markThumbnailCaptureFailed = (nodeId, message, extraUpdates = {}) => {
    if (!nodeId) return false;
    return updateNodeScreenshotAssets(nodeId, {
      thumbnailCaptureFailed: true,
      thumbnailCaptureError: message || 'Thumbnail capture failed',
      thumbnailCaptureFailedAt: new Date().toISOString(),
      ...extraUpdates,
    });
  };

  const isScreenshotAuthError = useCallback((message) => (
    String(message || '').toLowerCase().includes('requires authentication')
    || String(message || '').toLowerCase().includes('requires login')
  ), []);

  const bumpThumbnailReload = useCallback((nodeId) => {
    if (!nodeId) return;
    setThumbnailReloadMap((prev) => ({
      ...prev,
      [nodeId]: (prev[nodeId] || 0) + 1,
    }));
  }, []);

  const flushThumbnailAutosave = useCallback(({ createVersionCheckpoint = false, forceVersionCheckpoint = false } = {}) => {
    const latestRoot = rootRef.current || root;
    const latestOrphans = orphansRef.current || orphans;
    if (!currentMap?.id || !latestRoot || isImportedMap || isViewingHistoricalVersion || isCoeditingReadOnlyMode) {
      return Promise.resolve(false);
    }
    const payload = buildMapSavePayload({
      name: (currentMap?.name || mapName || '').trim() || 'Untitled Map',
      root: latestRoot,
      orphans: latestOrphans,
      connections,
      colors,
      connectionColors,
      project_id: currentMap?.project_id || null,
    });
    const snapshot = serializeMapAutosaveSnapshot(payload);
    const requestVersionCheckpoint = () => {
      if (createVersionCheckpoint) {
        setAutosaveCheckpointRequest({
          mapId: currentMap.id,
          changedAt: Date.now(),
          skipVersionCheckpoint: false,
          force: forceVersionCheckpoint,
          snapshot: {
            root: payload.root,
            orphans: payload.orphans,
            connections: payload.connections,
            colors: payload.colors,
            connectionColors: payload.connectionColors,
          },
        });
      }
    };

    if (nodeAssetSaveInFlightRef.current || autosaveInFlightRef.current) {
      if (!thumbnailAutosaveTimerRef.current) {
        thumbnailAutosaveTimerRef.current = setTimeout(() => {
          thumbnailAutosaveTimerRef.current = null;
          flushThumbnailAutosave({ createVersionCheckpoint, forceVersionCheckpoint });
        }, 600);
      }
      return Promise.resolve(false);
    }

    const pendingUpdates = Array.from(pendingNodeAssetUpdatesRef.current.entries())
      .map(([nodeId, assets]) => ({ nodeId, assets }));

    if (autosavePendingRef.current?.mapId === currentMap.id) {
      autosavePendingRef.current = {
        ...autosavePendingRef.current,
        payload,
        snapshot,
      };
    }

    if (pendingUpdates.length === 0) {
      if (snapshot === lastAutosaveSnapshotRef.current) {
        requestVersionCheckpoint();
        return Promise.resolve(true);
      }
      autosavePendingRef.current = {
        mapId: currentMap.id,
        expectedUpdatedAt: currentMap?.updated_at || null,
        payload,
        snapshot,
        skipVersionCheckpoint: !createVersionCheckpoint,
        forceVersionCheckpoint,
      };
      flushAutosave();
      return Promise.resolve(true);
    }

    pendingNodeAssetUpdatesRef.current.clear();
    nodeAssetSaveInFlightRef.current = true;
    if (nodeAssetSaveRetryTimerRef.current) {
      clearTimeout(nodeAssetSaveRetryTimerRef.current);
      nodeAssetSaveRetryTimerRef.current = null;
    }

    return api.updateMapNodeAssets(currentMap.id, pendingUpdates)
      .then((response) => {
        const updatedAt = response?.map?.updated_at || null;
        if (updatedAt) {
          setCurrentMap((prev) => (prev && prev.id === currentMap.id
            ? { ...prev, updated_at: updatedAt }
            : prev));
          setProjects((prev) => prev.map((project) => ({
            ...project,
            maps: (project.maps || []).map((map) => (
              map.id === currentMap.id ? { ...map, updated_at: updatedAt } : map
            )),
          })));
        }
        requestVersionCheckpoint();
        return true;
      })
      .catch((error) => {
        console.error('Thumbnail asset save failed:', error);
        pendingUpdates.forEach(({ nodeId, assets }) => {
          pendingNodeAssetUpdatesRef.current.set(nodeId, {
            ...assets,
            ...(pendingNodeAssetUpdatesRef.current.get(nodeId) || {}),
          });
        });
        nodeAssetSaveRetryTimerRef.current = setTimeout(() => {
          nodeAssetSaveRetryTimerRef.current = null;
          flushThumbnailAutosave({ createVersionCheckpoint, forceVersionCheckpoint });
        }, 1500);
        return false;
      })
      .finally(() => {
        nodeAssetSaveInFlightRef.current = false;
        if (pendingNodeAssetUpdatesRef.current.size > 0 && !thumbnailAutosaveTimerRef.current) {
          thumbnailAutosaveTimerRef.current = setTimeout(() => {
            thumbnailAutosaveTimerRef.current = null;
            flushThumbnailAutosave({ createVersionCheckpoint: false });
          }, 250);
        }
      });
  }, [
    colors,
    connectionColors,
    connections,
    currentMap?.id,
    currentMap?.name,
    currentMap?.project_id,
    currentMap?.updated_at,
    flushAutosave,
    isCoeditingReadOnlyMode,
    isImportedMap,
    isViewingHistoricalVersion,
    mapName,
    orphans,
    root,
    setAutosaveCheckpointRequest,
    setProjects,
  ]);

  const flushThumbnailAutosaveNow = useCallback((options = {}) => {
    if (thumbnailAutosaveTimerRef.current) {
      clearTimeout(thumbnailAutosaveTimerRef.current);
      thumbnailAutosaveTimerRef.current = null;
    }
    return flushThumbnailAutosave(options);
  }, [flushThumbnailAutosave]);

  const waitForThumbnailAssetSave = useCallback(async (options = {}) => {
    const deadline = Date.now() + (options.maxWaitMs || 300000);
    let attempt = 0;
    while (Date.now() < deadline) {
      const saved = await flushThumbnailAutosaveNow(options);
      if (saved && pendingNodeAssetUpdatesRef.current.size === 0 && !nodeAssetSaveInFlightRef.current) {
        return true;
      }
      attempt += 1;
      const delayMs = Math.min(1200, 250 + (attempt * 150));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return pendingNodeAssetUpdatesRef.current.size === 0 && !nodeAssetSaveInFlightRef.current;
  }, [flushThumbnailAutosaveNow]);

  const clearInvalidThumbnailAsset = useCallback((nodeId) => {
    if (!nodeId) return false;
    let markedInvalid = false;
    setInvalidThumbnailAssetIds((prev) => {
      if (prev.has(nodeId)) return prev;
      const next = new Set(prev);
      next.add(nodeId);
      markedInvalid = true;
      return next;
    });
    return markedInvalid;
  }, []);

  const validateStoredAssetsForNodes = useCallback(async (nodes, assetKey) => {
    const idsByUrl = new Map();
    (nodes || []).forEach((node) => {
      const url = String(node?.[assetKey] || '').trim();
      if (!node?.id || !hasStoredImageAsset(url)) return;
      if (!idsByUrl.has(url)) idsByUrl.set(url, []);
      idsByUrl.get(url).push(node.id);
    });
    const urls = Array.from(idsByUrl.keys());
    if (urls.length === 0) return new Set();

    const missingIds = new Set();
    const availableIds = new Set();
    for (let start = 0; start < urls.length; start += SCREENSHOT_ASSET_VALIDATION_BATCH_SIZE) {
      const batchUrls = urls.slice(start, start + SCREENSHOT_ASSET_VALIDATION_BATCH_SIZE);
      try {
        const response = await api.validateScreenshotAssets(batchUrls);
        const results = response?.results || {};
        batchUrls.forEach((url) => {
          const ids = idsByUrl.get(url) || [];
          if (results[url]?.available === false) {
            ids.forEach((id) => missingIds.add(id));
          } else if (results[url]?.available === true) {
            ids.forEach((id) => availableIds.add(id));
          }
        });
      } catch (error) {
        console.warn('Failed to validate screenshot assets', error);
      }
    }

    const applyInvalidState = assetKey === 'thumbnailUrl'
      ? setInvalidThumbnailAssetIds
      : (assetKey === 'fullScreenshotUrl' ? setInvalidFullScreenshotAssetIds : null);
    if (applyInvalidState && (missingIds.size > 0 || availableIds.size > 0)) {
      applyInvalidState((prev) => {
        const next = new Set(prev);
        let changed = false;
        missingIds.forEach((id) => {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        });
        availableIds.forEach((id) => {
          if (next.delete(id)) changed = true;
        });
        return changed ? next : prev;
      });
    }
    return missingIds;
  }, [hasStoredImageAsset]);

  useEffect(() => {
    if (!currentMap?.id || !root || thumbnailStats.mode || useLargeMapSurface) return undefined;
    const nodes = collectAllNodesWithOrphans(root, orphans).filter((node) => node?.id);
    const assetTokens = [];
    nodes.forEach((node) => {
      if (hasStoredImageAsset(node.thumbnailUrl)) {
        assetTokens.push(`t:${node.id}:${node.thumbnailUrl}`);
      }
    });
    if (assetTokens.length === 0) return undefined;
    const signature = `${currentMap.id}:${nodes.length}:${assetTokens.join('|')}`;
    if (signature === screenshotAssetValidationSignatureRef.current) return undefined;
    const timer = setTimeout(() => {
      screenshotAssetValidationSignatureRef.current = signature;
      validateStoredAssetsForNodes(nodes, 'thumbnailUrl');
    }, 500);
    return () => clearTimeout(timer);
  }, [
    currentMap?.id,
    hasStoredImageAsset,
    orphans,
    root,
    thumbnailStats.mode,
    useLargeMapSurface,
    validateStoredAssetsForNodes,
  ]);

  const validateCurrentMapImageAssets = useCallback(() => {
    const latestRoot = rootRef.current || root;
    if (!latestRoot) return Promise.resolve();
    const latestOrphans = orphansRef.current || orphans;
    const nodes = collectAllNodesWithOrphans(latestRoot, latestOrphans).filter((node) => node?.id);
    return Promise.all([
      validateStoredAssetsForNodes(nodes, 'thumbnailUrl'),
      validateStoredAssetsForNodes(nodes, 'fullScreenshotUrl'),
    ]).catch((error) => {
      console.warn('Failed to validate current map image assets', error);
    });
  }, [orphans, root, validateStoredAssetsForNodes]);

  const getCaptureIssueNodeContext = useCallback((nodeId) => {
    const latestRoot = rootRef.current || root;
    const latestOrphans = orphansRef.current || orphans;
    const node = collectAllNodesWithOrphans(latestRoot, latestOrphans)
      .find((candidate) => String(candidate?.id || '') === String(nodeId || ''));
    return {
      node,
      pageNumber: reportNumberMap.get(nodeId) || node?.number || node?.pageNumber || '',
      title: node?.title || 'Untitled page',
      url: node?.url || '',
    };
  }, [orphans, reportNumberMap, root]);

  const syncCaptureIssuesState = useCallback(() => {
    setCaptureIssues(Array.from(captureIssuesRef.current.values()));
  }, []);

  const clearCaptureIssues = useCallback(() => {
    captureIssuesRef.current = new Map();
    setCaptureIssues([]);
  }, []);

  const clearCaptureIssueForNode = useCallback((nodeId) => {
    if (!nodeId || captureIssuesRef.current.size === 0) return;
    let changed = false;
    const next = new Map();
    captureIssuesRef.current.forEach((issue, key) => {
      if (String(issue.nodeId) === String(nodeId)) {
        changed = true;
        return;
      }
      next.set(key, issue);
    });
    if (!changed) return;
    captureIssuesRef.current = next;
    syncCaptureIssuesState();
  }, [syncCaptureIssuesState]);

  const recordCaptureIssue = useCallback((issueInput = {}) => {
    const nodeId = issueInput.nodeId || issueInput?.result?.nodeId;
    const context = getCaptureIssueNodeContext(nodeId);
    const issue = normalizeCaptureIssue({
      ...issueInput,
      ...context,
      nodeId,
      node: context.node,
    });
    captureIssuesRef.current.set(issue.id, issue);
    syncCaptureIssuesState();
    return issue;
  }, [getCaptureIssueNodeContext, syncCaptureIssuesState]);

  const getActiveImageCaptureMode = useCallback(() => {
    if (activeImageCaptureJob?.mode) return activeImageCaptureJob.mode;
    return shouldShowImageCaptureProgressToast(thumbnailStats) ? thumbnailStats.mode : null;
  }, [activeImageCaptureJob, thumbnailStats]);

  const guardImageCaptureAvailable = useCallback((nextMode) => {
    const activeMode = getActiveImageCaptureMode();
    if (!activeMode) return true;
    const label = activeMode === 'screenshot' ? 'full screenshots' : 'thumbnails';
    const nextLabel = nextMode === 'screenshot' ? 'full screenshots' : 'thumbnails';
    showToast(`Finish or stop ${label} before capturing ${nextLabel}`, 'info');
    return false;
  }, [getActiveImageCaptureMode, showToast]);

  const guardImageCapturePersistenceReady = useCallback(() => {
    if (currentMap?.id) return true;
    showToast('Save this map before capturing screenshots', 'info');
    return false;
  }, [currentMap?.id, showToast]);

  const completeThumbnailCapture = useCallback((nodeId, { captured = true } = {}) => {
    if (!nodeId || !thumbnailExpectedRef.current.has(nodeId)) return;
    const updateStats = () => {
      const completedCount = thumbnailFinishedRef.current.size;
      const capturedCount = thumbnailLoadedRef.current.size;
      const expectedCount = thumbnailExpectedRef.current.size;
      setThumbnailStats((prev) => ({
        ...prev,
        loaded: capturedCount,
        completed: completedCount,
        failed: thumbnailErrorRef.current.size,
        avgMs: completedCount ? Math.round(thumbnailTotalTimeRef.current / completedCount) : 0,
      }));
      if (!thumbnailCompletedRef.current && expectedCount > 0 && completedCount >= expectedCount) {
        thumbnailCompletedRef.current = true;
      }
    };
    if (thumbnailFinishedRef.current.has(nodeId)) {
      if (captured && thumbnailErrorRef.current.has(nodeId)) {
        thumbnailErrorRef.current.delete(nodeId);
        thumbnailLoadedRef.current.add(nodeId);
        updateStats();
      }
      return;
    }
    thumbnailFinishedRef.current.add(nodeId);
    if (captured) {
      thumbnailLoadedRef.current.add(nodeId);
      thumbnailErrorRef.current.delete(nodeId);
    } else {
      thumbnailErrorRef.current.add(nodeId);
    }
    const start = thumbnailLoadStartRef.current.get(nodeId);
    if (start) {
      thumbnailTotalTimeRef.current += Date.now() - start;
      thumbnailLoadStartRef.current.delete(nodeId);
    }
    thumbnailAttemptsRef.current.delete(nodeId);
    updateStats();
  }, []);

  const handleThumbnailDisplayLoad = useCallback((nodeId) => {
    if (!nodeId) return;
    setInvalidThumbnailAssetIds((prev) => {
      if (!prev.has(nodeId)) return prev;
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
    clearCaptureIssueForNode(nodeId);
    completeThumbnailCapture(nodeId, { captured: true });
  }, [clearCaptureIssueForNode, completeThumbnailCapture]);

  const handleThumbnailDisplayError = useCallback((nodeId) => {
    if (!nodeId) return;
    if (thumbnailLoadedRef.current.has(nodeId)) return;
    clearInvalidThumbnailAsset(nodeId);
    recordCaptureIssue({
      nodeId,
      status: 'image_load',
      error: 'Image failed to load',
    });
    completeThumbnailCapture(nodeId, { captured: false });
  }, [clearInvalidThumbnailAsset, completeThumbnailCapture, recordCaptureIssue]);

  const resetThumbnailQueue = (total, cached = 0, bumpSession = true, mode = 'thumbnail', unavailable = 0) => {
    if (bumpSession) {
      const nextSessionId = thumbnailSessionRef.current + 1;
      thumbnailSessionRef.current = nextSessionId;
      setThumbnailSessionId(nextSessionId);
    }
    thumbnailInFlightRef.current.clear();
    thumbnailAbortControllersRef.current.forEach((controller) => controller.abort());
    thumbnailAbortControllersRef.current.clear();
    thumbnailActiveRef.current = 0;
    thumbnailLoadStartRef.current = new Map();
    thumbnailTotalTimeRef.current = 0;
    thumbnailAttemptsRef.current = new Map();
    thumbnailExpectedRef.current = new Set();
    thumbnailLoadedRef.current = new Set();
    thumbnailFinishedRef.current = new Set();
    thumbnailErrorRef.current = new Set();
    imageCaptureSavedRef.current = new Set();
    imageCaptureAppliedRef.current = new Set();
    imageCaptureAssetCursorRef.current = 0;
    thumbnailBatchIndexRef.current = 0;
    thumbnailBatchTotalRef.current = 0;
    thumbnailCompletedRef.current = false;
    thumbnailStopRequestedRef.current = false;
    screenshotStopRequestedRef.current = false;
    imageCaptureJobRef.current = null;
    setActiveImageCaptureJob(null);
    thumbnailAuthToastShownRef.current = false;
    thumbnailFailureToastShownRef.current = false;
    setThumbnailQueueSize(0);
    setThumbnailActiveCount(0);
    setThumbnailReloadMap({});
    setThumbnailStats({
      mode,
      total,
      saved: cached,
      verified: cached,
      loaded: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      avgMs: 0,
      cached,
      unavailable,
      phase: null,
      recoveryPass: 0,
      retrying: 0,
      batchIndex: 0,
      batchTotal: 0,
      scaleTier: null,
      stageIndex: 0,
      stageTotal: 0,
      paused: false,
      finalizing: false,
      stopped: false,
    });
  };

  const orderThumbnailNodes = useCallback((nodes) => {
    if (!Array.isArray(nodes) || nodes.length === 0) return [];
    const layoutNodes = layoutRef.current?.nodes || new Map();
    const orderIndex = new Map(nodes.map((node, idx) => [node.id, idx]));
    const primaryRootId = rootRef.current?.id || root?.id || null;
    const parsePageNumber = (value) => {
      const raw = String(value || '').trim();
      if (!raw) return { hasNumber: false, parts: [], raw };
      const cleaned = raw.replace(/^[a-z]+/i, '');
      const parts = cleaned
        .split('.')
        .map((part) => Number.parseInt(part, 10))
        .filter((part) => Number.isFinite(part));
      return { hasNumber: parts.length > 0, parts, raw };
    };
    const comparePageNumber = (a, b) => {
      if (a.hasNumber !== b.hasNumber) return a.hasNumber ? -1 : 1;
      const len = Math.max(a.parts.length, b.parts.length);
      for (let index = 0; index < len; index += 1) {
        const partA = a.parts[index] ?? -1;
        const partB = b.parts[index] ?? -1;
        if (partA !== partB) return partA - partB;
      }
      return a.raw.localeCompare(b.raw);
    };
    const getPageNumber = (node) => parsePageNumber(
      reportNumberMap.get(node.id)
        || layoutNodes.get(node.id)?.number
        || node.number
        || node.pageNumber
        || ''
    );
    const groupRank = (node) => {
      const meta = forestIndex.nodes.get(node.id);
      if (meta?.treeType === 'subdomain') return 1;
      if (meta?.treeType === 'orphan') return 2;
      return 0;
    };
    const getPosition = (node) => {
      const layout = layoutNodes.get(node.id);
      if (!layout) return null;
      return { x: layout.x, y: layout.y };
    };
    const getMeta = (node) => forestIndex.nodes.get(node.id) || {};
    const compareCaptureMeta = (a, b) => {
      const metaA = getMeta(a);
      const metaB = getMeta(b);
      const treeA = metaA.treeIndex ?? Number.MAX_SAFE_INTEGER;
      const treeB = metaB.treeIndex ?? Number.MAX_SAFE_INTEGER;
      if (treeA !== treeB) return treeA - treeB;
      const depthA = metaA.depth ?? Number.MAX_SAFE_INTEGER;
      const depthB = metaB.depth ?? Number.MAX_SAFE_INTEGER;
      if (depthA !== depthB) return depthA - depthB;
      const numberOrder = comparePageNumber(getPageNumber(a), getPageNumber(b));
      if (numberOrder !== 0) return numberOrder;
      const pathA = metaA.orderPath || '';
      const pathB = metaB.orderPath || '';
      if (pathA !== pathB) return pathA.localeCompare(pathB);
      const orderA = metaA.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = metaB.order ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return null;
    };
    return [...nodes].sort((a, b) => {
      if (primaryRootId && a.id !== b.id) {
        if (a.id === primaryRootId) return -1;
        if (b.id === primaryRootId) return 1;
      }
      const groupA = groupRank(a);
      const groupB = groupRank(b);
      if (groupA !== groupB) return groupA - groupB;
      const captureOrder = compareCaptureMeta(a, b);
      if (captureOrder !== null) return captureOrder;
      const posA = getPosition(a);
      const posB = getPosition(b);
      if (posA && posB) {
        if (posA.y !== posB.y) return posA.y - posB.y;
        const dir = groupA === 0 ? 1 : -1;
        if (posA.x !== posB.x) return (posA.x - posB.x) * dir;
        return (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0);
      }
      if (posA && !posB) return -1;
      if (!posA && posB) return 1;
      return (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0);
    });
  }, [forestIndex, reportNumberMap, root?.id]);

  const buildImageCaptureBatches = useCallback((nodes) => {
    const orderedNodes = orderThumbnailNodes(nodes);
    if (orderedNodes.length === 0) return [];
    const primaryRootId = rootRef.current?.id || root?.id || null;
    const batches = [];
    let remainingNodes = orderedNodes;

    if (primaryRootId) {
      const rootIndex = remainingNodes.findIndex((node) => node?.id === primaryRootId);
      if (rootIndex >= 0) {
        batches.push([remainingNodes[rootIndex]]);
        remainingNodes = remainingNodes.filter((_, index) => index !== rootIndex);
      }
    }

    for (let start = 0; start < remainingNodes.length; start += IMAGE_CAPTURE_BATCH_SIZE) {
      batches.push(remainingNodes.slice(start, start + IMAGE_CAPTURE_BATCH_SIZE));
    }

    return batches;
  }, [orderThumbnailNodes, root?.id]);

  const getThumbnailCandidates = (
    scope,
    invalidAssetIds = invalidThumbnailAssetIds,
    targetMode = 'remaining',
  ) => {
    const allNodes = collectAllNodesWithOrphans(root, orphans);
    const baseIds = scope === 'selected' ? new Set(selectedNodeIds) : null;
    const scopedNodes = scope === 'selected'
      ? allNodes.filter((node) => baseIds.has(node.id))
      : allNodes;
    const targetNodes = scopedNodes.filter((node) => node?.url);
    const orderedTargets = orderThumbnailNodes(targetNodes);
    const forceRecapture = scope === 'selected';
    const recaptureCapturedOnly = targetMode === 'captured';
    let cachedCount = 0;
    let unavailableCount = 0;
    let candidates = [];
    if (recaptureCapturedOnly) {
      candidates = orderedTargets.filter((node) => hasStoredImageAsset(node.thumbnailUrl) && !invalidAssetIds.has(node.id));
    } else if (forceRecapture) {
      candidates = orderedTargets;
    } else {
      candidates = orderedTargets.filter((node) => {
        const hasSavedThumb = hasStoredImageAsset(node.thumbnailUrl) && !invalidAssetIds.has(node.id);
        if (hasSavedThumb) {
          cachedCount += 1;
          return false;
        }
        if (hasTerminalThumbnailFailure(node)) {
          unavailableCount += 1;
          return false;
        }
        return true;
      });
    }
    const targetIds = new Set(candidates.map((node) => node.id));
    return {
      targetIds,
      candidates,
      total: orderedTargets.length,
      cachedCount: forceRecapture || recaptureCapturedOnly ? 0 : cachedCount,
      unavailableCount: forceRecapture || recaptureCapturedOnly ? 0 : unavailableCount,
    };
  };

  const findNodeInCurrentMap = useCallback((nodeId) => {
    const latestRoot = rootRef.current || root;
    const latestOrphans = orphansRef.current || orphans;
    return collectAllNodesWithOrphans(latestRoot, latestOrphans)
      .find((node) => String(node?.id || '') === String(nodeId || '')) || null;
  }, [orphans, root]);

  const reconcileSavedImageCaptureAssets = useCallback(async ({ mapId, mode, nodeIds }) => {
    const ids = Array.from(new Set((nodeIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
    if (!mapId || ids.length === 0) return;
    try {
      const response = await api.getMap(mapId);
      const savedMap = response?.map;
      const savedNodes = collectAllNodesWithOrphans(savedMap?.root, savedMap?.orphans || []);
      const savedById = new Map(savedNodes.map((node) => [String(node?.id || ''), node]));
      ids.forEach((nodeId) => {
        const savedNode = savedById.get(nodeId);
        const assetUrl = getCaptureAssetUrl(savedNode, mode);
        if (!assetUrl) {
          recordCaptureIssue({
            nodeId,
            status: 'missing_asset',
            error: 'Saved image fields were not found on the map',
          });
          completeThumbnailCapture(nodeId, { captured: false });
          return;
        }
        const assetUpdates = collectImageAssetUpdatesFromNode(savedNode);
        const applied = updateNodeScreenshotAssets(nodeId, assetUpdates, { queueSave: false });
        if (!applied && getCaptureAssetUrl(findNodeInCurrentMap(nodeId), mode) !== assetUrl) {
          recordCaptureIssue({
            nodeId,
            status: 'missing_asset',
            error: 'Saved image fields could not be applied to the canvas',
          });
          completeThumbnailCapture(nodeId, { captured: false });
          return;
        }
        imageCaptureAppliedRef.current.add(nodeId);
        if (mode === 'screenshot') {
          clearCaptureIssueForNode(nodeId);
          completeThumbnailCapture(nodeId, { captured: true });
        } else {
          bumpThumbnailReload(nodeId);
        }
      });
    } catch (error) {
      console.warn('Failed to reconcile saved image capture assets', error);
    }
  }, [
    bumpThumbnailReload,
    clearCaptureIssueForNode,
    completeThumbnailCapture,
    findNodeInCurrentMap,
    recordCaptureIssue,
    updateNodeScreenshotAssets,
  ]);

  const applyImageCaptureJobUpdates = useCallback((job, expectedMode) => {
    const payload = job?.progress || job?.result || {};
    const updates = Array.isArray(payload.nodeAssetUpdates) ? payload.nodeAssetUpdates : [];
    let maxAssetSeq = imageCaptureAssetCursorRef.current;
    const savedButNotApplied = new Set();
    updates.forEach((entry) => {
      const nodeId = String(entry?.nodeId || '').trim();
      const assets = entry?.assets || {};
      if (!nodeId || !assets || typeof assets !== 'object') return;
      const seq = Number(entry?.seq || 0);
      if (seq > maxAssetSeq) maxAssetSeq = seq;
      const key = `${nodeId}:${JSON.stringify(assets)}`;
      if (imageCaptureAppliedUpdateKeysRef.current.has(key)) return;
      imageCaptureAppliedUpdateKeysRef.current.add(key);
      const applied = updateNodeScreenshotAssets(nodeId, assets, { queueSave: false });
      const assetUrl = getCaptureAssetUrl(assets, expectedMode);
      if (applied || (assetUrl && getCaptureAssetUrl(findNodeInCurrentMap(nodeId), expectedMode) === assetUrl)) {
        imageCaptureAppliedRef.current.add(nodeId);
      } else if (assetUrl) {
        savedButNotApplied.add(nodeId);
      }
      if (assets.thumbnailUrl) {
        setInvalidThumbnailAssetIds((prev) => {
          if (!prev.has(nodeId)) return prev;
          const updated = new Set(prev);
          updated.delete(nodeId);
          return updated;
        });
        bumpThumbnailReload(nodeId);
      }
      if (assets.fullScreenshotUrl) {
        setInvalidFullScreenshotAssetIds((prev) => {
          if (!prev.has(nodeId)) return prev;
          const updated = new Set(prev);
          updated.delete(nodeId);
          return updated;
        });
        completeThumbnailCapture(nodeId, { captured: true });
      }
    });
    imageCaptureAssetCursorRef.current = maxAssetSeq;

    if (Array.isArray(payload.targetIds)) {
      thumbnailExpectedRef.current = new Set(payload.targetIds);
    }

    const results = Array.isArray(payload.results) ? payload.results : [];
    results.forEach((result) => {
      const nodeId = String(result?.nodeId || '').trim();
      if (!nodeId || !result?.status) return;
      if (result.status === 'saved') {
        imageCaptureSavedRef.current.add(nodeId);
        if (!imageCaptureAppliedRef.current.has(nodeId)) {
          const node = findNodeInCurrentMap(nodeId);
          if (getCaptureAssetUrl(node, expectedMode)) {
            imageCaptureAppliedRef.current.add(nodeId);
          } else {
            savedButNotApplied.add(nodeId);
          }
        }
        return;
      }
      const context = getCaptureIssueNodeContext(nodeId);
      recordCaptureIssue(buildCaptureIssueFromResult(result, context.node, context.pageNumber));
      completeThumbnailCapture(nodeId, { captured: false });
    });
    const failedTotal = Number((payload.failed || 0) + (payload.blocked || 0) + (payload.missingAsset || 0));
    const skippedTotal = Number(payload.skipped || 0);
    const issueCount = Math.max(captureIssuesRef.current.size, failedTotal + skippedTotal);
    const savedCount = Math.max(
      0,
      Number(payload.saved ?? payload.verified ?? payload.captured ?? imageCaptureSavedRef.current.size ?? 0) || 0
    );
    const verifiedCount = Math.max(savedCount, Number(payload.verified ?? savedCount) || 0);
    const progress = getReconciledCaptureProgress({
      total: Number(payload.total || 0),
      saved: savedCount,
      verified: verifiedCount,
      captured: Number(payload.captured || savedCount),
      loadedIds: thumbnailLoadedRef.current,
      issueCount,
    });
    const completed = progress.completed;
    const elapsed = Number(payload.elapsedMs || (thumbnailElapsedStartRef.current ? Date.now() - thumbnailElapsedStartRef.current : 0));
    setThumbnailStats((prev) => ({
      ...prev,
      mode: expectedMode,
      total: Number(payload.total || prev.total || 0),
      saved: progress.saved,
      verified: progress.verified,
      loaded: thumbnailLoadedRef.current.size,
      completed,
      failed: Math.max(failedTotal, thumbnailErrorRef.current.size),
      skipped: skippedTotal,
      cached: Number(payload.cached || prev.cached || 0),
      unavailable: Number(payload.unavailable || prev.unavailable || 0),
      phase: payload.phase || prev.phase || 'capturing',
      recoveryPass: Number(payload.recoveryPass || 0),
      retrying: Number(payload.retrying || 0),
      scaleTier: payload.scaleTier || prev.scaleTier || null,
      stageIndex: Number(payload.stageIndex || prev.stageIndex || 0),
      stageTotal: Number(payload.stageTotal || prev.stageTotal || 0),
      paused: Boolean(payload.paused) || job?.status === 'paused',
      avgMs: completed ? Math.round(elapsed / completed) : prev.avgMs,
    }));
    return { savedButNotApplied: Array.from(savedButNotApplied) };
  }, [
    bumpThumbnailReload,
    completeThumbnailCapture,
    findNodeInCurrentMap,
    getCaptureIssueNodeContext,
    recordCaptureIssue,
    updateNodeScreenshotAssets,
  ]);

  useEffect(() => {
    if (!currentMap?.id || !root || isViewingHistoricalVersion) return undefined;
    if (currentMap?.largeMapShell) return undefined;
    if (activeImageCaptureJob?.jobId) return undefined;
    const localCaptureActive = thumbnailStats.mode
      && !thumbnailStats.stopped
      && (thumbnailStats.completed || 0) < (thumbnailStats.total || 0);
    if (localCaptureActive) return undefined;

    const mapId = currentMap.id;
    if (imageCaptureReattachMapRef.current === mapId) return undefined;
    imageCaptureReattachMapRef.current = mapId;

    let canceled = false;
    api.getActiveMapImageCaptureJob(mapId)
      .then(({ job }) => {
        if (canceled || !job?.id || !['queued', 'running', 'paused'].includes(job.status)) return;
        const mode = job.payload?.captureType === 'full' ? 'screenshot' : 'thumbnail';
        imageCaptureJobRef.current = { mapId, jobId: job.id, mode };
        imageCaptureAppliedUpdateKeysRef.current = new Set();
        const elapsedMs = Number(job.progress?.elapsedMs || 0);
        thumbnailElapsedStartRef.current = Date.now() - elapsedMs;
        setThumbnailElapsedMs(elapsedMs);
        setShowThumbnails(true);
        setActiveImageCaptureJob({ mapId, jobId: job.id, mode, status: job.status });
        applyImageCaptureJobUpdates(job, mode);
      })
      .catch((error) => {
        imageCaptureReattachMapRef.current = null;
        console.warn('Failed to check active image capture job', error);
      });

    return () => {
      canceled = true;
    };
  }, [
    activeImageCaptureJob?.jobId,
    applyImageCaptureJobUpdates,
    currentMap?.id,
    currentMap?.largeMapShell,
    isViewingHistoricalVersion,
    root,
    thumbnailStats.completed,
    thumbnailStats.mode,
    thumbnailStats.stopped,
    thumbnailStats.total,
  ]);

  const runMapImageCaptureJob = useCallback(async ({
    scope,
    captureType,
    mode,
    targetMode = 'remaining',
    targets,
    targetIds,
    cachedCount = 0,
    unavailableCount = 0,
  }) => {
    if (!currentMap?.id) return false;
    const mapId = currentMap.id;
    const total = targets.length;
    const targetIdSet = new Set((targets || []).map((node) => String(node?.id || '')).filter(Boolean));
    clearCaptureIssues();
    imageCaptureAppliedUpdateKeysRef.current = new Set();
    resetThumbnailQueue(total, cachedCount, true, mode, unavailableCount);
    const runSessionId = thumbnailSessionRef.current;
    thumbnailExpectedRef.current = new Set(targets.map((node) => node.id));
    thumbnailElapsedStartRef.current = Date.now();
    setThumbnailElapsedMs(0);
    setThumbnailScopeIds(targetIds || new Set(targets.map((node) => node.id)));
    setShowThumbnails(true);
    setShowImageMenu(false);
    trackEvent('screenshot_capture', {
      type: captureType === 'full' ? 'full' : 'thumbnail',
      scope,
      count: total,
      pipeline: 'job',
    });

    let jobId = null;
    try {
      const response = await api.createMapImageCaptureJob(mapId, {
        captureType,
        scope,
        nodeIds: scope === 'selected' ? Array.from(selectedNodeIds) : [],
        targetMode,
        force: scope === 'selected' || targetMode === 'captured',
      });
      jobId = response?.jobId;
      if (!jobId) throw new Error('Image capture job did not start');
      imageCaptureJobRef.current = { mapId, jobId, mode };
      setActiveImageCaptureJob({ mapId, jobId, mode });
    } catch (error) {
      const isActiveJobConflict = error?.code === 'IMAGE_CAPTURE_JOB_ACTIVE'
        || error?.payload?.code === 'IMAGE_CAPTURE_JOB_ACTIVE';
      const activeJobId = error?.jobId || error?.payload?.jobId;
      if (isActiveJobConflict && activeJobId) {
        jobId = activeJobId;
        imageCaptureJobRef.current = { mapId, jobId, mode };
        setActiveImageCaptureJob({ mapId, jobId, mode, status: 'running' });
        showToast('Reattached to the image capture already running for this map', 'info');
      } else {
        imageCaptureJobRef.current = null;
        setActiveImageCaptureJob(null);
        showToast(
          getImageCaptureJobErrorMessage(error, 'Failed to start image capture job'),
          isActiveJobConflict ? 'warning' : 'error',
        );
        setThumbnailStats((prev) => ({ ...prev, stopped: true }));
        return true;
      }
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitForCanvasThumbnailLoads = async () => true;
    try {
      while (thumbnailSessionRef.current === runSessionId) {
        if (
          (mode === 'screenshot' && screenshotStopRequestedRef.current)
          || (mode !== 'screenshot' && thumbnailStopRequestedRef.current)
        ) {
          await api.cancelMapImageCaptureJob(mapId, jobId).catch(() => {});
          setThumbnailStats((prev) => ({ ...prev, stopped: true }));
          imageCaptureJobRef.current = null;
          setActiveImageCaptureJob(null);
          return true;
        }

        const includeResult = false;
        const { job } = await api.getMapImageCaptureJob(mapId, jobId, {
          includeResult,
          assetUpdateCursor: imageCaptureAssetCursorRef.current,
        });
        setActiveImageCaptureJob({ mapId, jobId, mode, status: job?.status });
        const reconciliation = applyImageCaptureJobUpdates(job, mode);
        if (reconciliation?.savedButNotApplied?.length > 0) {
          await reconcileSavedImageCaptureAssets({
            mapId,
            mode,
            nodeIds: reconciliation.savedButNotApplied,
          });
        }

        if (['complete', 'failed', 'canceled'].includes(job?.status)) {
          const finalResponse = job.status === 'complete'
            ? await api.getMapImageCaptureJob(mapId, jobId, {
                includeResult: true,
                assetUpdateCursor: imageCaptureAssetCursorRef.current,
              })
            : { job };
          const finalJob = finalResponse.job || job;
          const finalReconciliation = applyImageCaptureJobUpdates(finalJob, mode);
          if (finalReconciliation?.savedButNotApplied?.length > 0) {
            await reconcileSavedImageCaptureAssets({
              mapId,
              mode,
              nodeIds: finalReconciliation.savedButNotApplied,
            });
          }
          imageCaptureJobRef.current = null;
          setActiveImageCaptureJob(null);

          if (finalJob.status === 'canceled') {
            setThumbnailStats((prev) => ({ ...prev, stopped: true }));
            showToast('Image capture stopped', 'warning');
            return true;
          }
          if (finalJob.status === 'failed') {
            setThumbnailStats((prev) => ({ ...prev, stopped: true }));
            showToast(getImageCaptureJobErrorMessage(finalJob, 'Image capture failed'), 'error');
            return true;
          }

          setThumbnailStats((prev) => ({ ...prev, finalizing: true }));
          const summary = finalJob.result || finalJob.progress || {};
          await waitForCanvasThumbnailLoads(Number(summary.total || targets.length || 0));
          await refreshTimelineAfterImageCapture();
          const shown = Math.max(0, Number(summary.saved ?? summary.verified ?? summary.captured ?? imageCaptureSavedRef.current.size) || 0);
          const unavailable = Number(summary.unavailable || 0);
          const failed = Number((summary.failed || 0) + (summary.blocked || 0) + (summary.missingAsset || 0));
          const skipped = Number(summary.skipped || 0);
          const currentIssues = Array.from(captureIssuesRef.current.values())
            .filter((issue) => targetIdSet.size === 0 || targetIdSet.has(String(issue.nodeId || '')));
          const issueCount = Math.max(failed + skipped + unavailable, currentIssues.length);
          const issueLabels = currentIssues.map((issue) => issue.label);
          const label = mode === 'screenshot' ? 'full screenshot' : 'thumbnail';
          const toastResult = formatImageCaptureCompletionToast({
            shown,
            label,
            failed: failed + unavailable,
            skipped,
            issueCount,
            issueLabels,
          });
          if (issueCount > 0) {
            showToast(toastResult.message, toastResult.type);
          } else {
            showToast(toastResult.message, toastResult.type);
          }
          setThumbnailStats((prev) => ({ ...prev, finalizing: false }));
          trackEvent('screenshot_capture_complete', {
            type: captureType === 'full' ? 'full' : 'thumbnail',
            scope,
            count: shown,
            failed: issueCount,
            skipped,
            pipeline: 'job',
          });
          return true;
        }
        await sleep(1000);
      }
    } catch (error) {
      imageCaptureJobRef.current = null;
      setActiveImageCaptureJob(null);
      showToast(getImageCaptureJobErrorMessage(error, 'Image capture failed'), 'error');
      setThumbnailStats((prev) => ({ ...prev, stopped: true }));
      return true;
    }
    imageCaptureJobRef.current = null;
    setActiveImageCaptureJob(null);
    return true;
  }, [
    applyImageCaptureJobUpdates,
    clearCaptureIssues,
    currentMap?.id,
    reconcileSavedImageCaptureAssets,
    refreshTimelineAfterImageCapture,
    selectedNodeIds,
    showToast,
  ]);

  const confirmScaleAwareImageCapture = useCallback(async ({ mode, count }) => {
    const total = Math.max(0, Number(count) || 0);
    if (getImageCaptureScaleTierForCount(mode, total) !== IMAGE_CAPTURE_SCALE_TIERS.large) {
      return true;
    }
    const label = mode === 'screenshot' ? 'full screenshots' : 'thumbnails';
    const stageTotal = getImageCaptureStageTotalForCount(mode, total);
    return showConfirm({
      title: 'Start large image capture?',
      message: `This will capture ${total} ${label} in ${stageTotal} automatic stages. You can pause, resume, or stop it.`,
      confirmText: 'Start capture',
      cancelText: 'Cancel',
    });
  }, [showConfirm]);

  const handleThumbnailCapture = async (scope, targetMode = 'remaining') => {
    if (warnCoeditingReadOnly('Thumbnail capture')) {
      return;
    }
    if (!root) {
      showToast('Create or load a map before capturing thumbnails', 'info');
      return;
    }
    if (scope === 'selected' && selectedNodeIds.size === 0) {
      showToast('Select pages to capture thumbnails', 'info');
      return;
    }
    if (!guardImageCaptureAvailable('thumbnail')) return;
    if (!guardImageCapturePersistenceReady()) return;
    const invalidIds = new Set(invalidThumbnailAssetIds);
    const { targetIds, candidates, total, cachedCount, unavailableCount } = getThumbnailCandidates(scope, invalidIds, targetMode);
    if (total === 0) {
      resetThumbnailQueue(0, 0, true, 'thumbnail');
      setThumbnailScopeIds(new Set());
      setShowThumbnails(true);
      setShowImageMenu(false);
      showToast('No pages with URLs to capture', 'info');
      return;
    }
    if (targetMode === 'captured' && candidates.length === 0) {
      resetThumbnailQueue(0, 0, true, 'thumbnail');
      setThumbnailScopeIds(new Set());
      setShowImageMenu(false);
      showToast('No captured thumbnails to update', 'info');
      return;
    }
    if (!(await confirmScaleAwareImageCapture({ mode: 'thumbnail', count: candidates.length }))) return;
    const handledByJob = await runMapImageCaptureJob({
      scope,
      captureType: 'thumb',
      mode: 'thumbnail',
      targetMode,
      targets: candidates,
      targetIds,
      cachedCount,
      unavailableCount,
    });
    if (handledByJob) return;
    resetThumbnailQueue(candidates.length, cachedCount, true, 'thumbnail', unavailableCount);
    thumbnailElapsedStartRef.current = Date.now();
    setThumbnailElapsedMs(0);
    thumbnailExpectedRef.current = new Set(candidates.map((node) => node.id));
    if (candidates.length === 0) {
      setThumbnailScopeIds(new Set());
      setShowThumbnails(true);
      setShowImageMenu(false);
      showToast(
        unavailableCount > 0
          ? `${unavailableCount} thumbnail${unavailableCount === 1 ? '' : 's'} could not be captured. Select those pages and run Selected to retry.`
          : 'No new thumbnails to generate',
        unavailableCount > 0 ? 'warning' : 'info',
      );
      return;
    }
    setThumbnailScopeIds(targetIds);
    setShowThumbnails(true);
    setShowImageMenu(false);
    const captureBatches = buildImageCaptureBatches(candidates);
    thumbnailBatchTotalRef.current = Math.max(1, captureBatches.length);
    thumbnailBatchIndexRef.current = 0;
    setThumbnailStats((prev) => ({
      ...prev,
      batchIndex: 0,
      batchTotal: thumbnailBatchTotalRef.current,
    }));
    trackEvent('screenshot_capture', {
      type: 'thumbnail',
      scope,
      count: candidates.length,
    });
    const runSessionId = thumbnailSessionRef.current;
    candidates.forEach((node) => {
      thumbnailAttemptsRef.current.set(node.id, 0);
    });
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const updateRunCounts = () => {
      const completedCount = thumbnailFinishedRef.current.size;
      const capturedCount = thumbnailLoadedRef.current.size;
      const elapsed = thumbnailElapsedStartRef.current ? Date.now() - thumbnailElapsedStartRef.current : 0;
      setThumbnailStats((prev) => ({
        ...prev,
        loaded: capturedCount,
        completed: completedCount,
        failed: thumbnailErrorRef.current.size,
        avgMs: completedCount ? Math.round(elapsed / completedCount) : 0,
      }));
      setThumbnailActiveCount(thumbnailActiveRef.current);
      setThumbnailQueueSize(Math.max(
        0,
        candidates.length - completedCount - thumbnailInFlightRef.current.size,
      ));
    };
    const captureNode = async (node) => {
      if (!node?.id || !node?.url) return false;
      if (thumbnailFinishedRef.current.has(node.id)) return false;
      let lastErrorMessage = 'Thumbnail capture failed';
      for (let attempt = 0; attempt < MAX_THUMBNAIL_ATTEMPTS; attempt += 1) {
        if (thumbnailStopRequestedRef.current || thumbnailSessionRef.current !== runSessionId) {
          return false;
        }
        thumbnailAttemptsRef.current.set(node.id, attempt);
        thumbnailActiveRef.current += 1;
        thumbnailInFlightRef.current.add(node.id);
        thumbnailLoadStartRef.current.set(node.id, Date.now());
        updateRunCounts();
        const controller = new AbortController();
        thumbnailAbortControllersRef.current.set(node.id, controller);
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, 45000);
        let captured = false;
        let terminalFailure = false;
        try {
          const data = await api.captureScreenshot(
            { url: node.url, type: 'thumb' },
            { signal: controller.signal },
          );
          if (thumbnailStopRequestedRef.current || thumbnailSessionRef.current !== runSessionId) {
            return false;
          }
          if (data?.error) {
            lastErrorMessage = data.error;
          }
          if (data?.url) {
            const persisted = updateNodeScreenshotAssets(node.id, getThumbnailAssetUpdates(data));
            if (!persisted) {
              lastErrorMessage = 'Failed to save thumbnail assets on this page';
              terminalFailure = true;
            } else {
              setInvalidThumbnailAssetIds((prev) => {
                if (!prev.has(node.id)) return prev;
                const updated = new Set(prev);
                updated.delete(node.id);
                return updated;
              });
              bumpThumbnailReload(node.id);
              completeThumbnailCapture(node.id);
              captured = true;
              return true;
            }
          }
          if (isScreenshotAuthError(lastErrorMessage)) {
            terminalFailure = true;
            updateNodeScreenshotAssets(node.id, {
              authRequired: true,
              thumbnailCaptureFailed: true,
              thumbnailCaptureError: 'Requires login',
              thumbnailCaptureFailedAt: new Date().toISOString(),
            });
            if (!thumbnailAuthToastShownRef.current) {
              thumbnailAuthToastShownRef.current = true;
              showToast('Screenshot capture for this page requires login. Prompted credentials are not supported yet.', 'info');
            }
          }
        } catch (error) {
          lastErrorMessage = error?.message || 'Thumbnail capture failed';
          if (thumbnailStopRequestedRef.current || thumbnailSessionRef.current !== runSessionId) {
            return false;
          }
          if (isScreenshotAuthError(lastErrorMessage)) {
            terminalFailure = true;
            updateNodeScreenshotAssets(node.id, {
              authRequired: true,
              thumbnailCaptureFailed: true,
              thumbnailCaptureError: 'Requires login',
              thumbnailCaptureFailedAt: new Date().toISOString(),
            });
            if (!thumbnailAuthToastShownRef.current) {
              thumbnailAuthToastShownRef.current = true;
              showToast('Screenshot capture for this page requires login. Prompted credentials are not supported yet.', 'info');
            }
          }
        } finally {
          clearTimeout(timeoutId);
          thumbnailAbortControllersRef.current.delete(node.id);
          thumbnailInFlightRef.current.delete(node.id);
          thumbnailActiveRef.current = Math.max(0, thumbnailActiveRef.current - 1);
          if (!captured) {
            thumbnailLoadStartRef.current.delete(node.id);
          }
          updateRunCounts();
        }
        if (captured) return true;
        if (terminalFailure) break;
        if (attempt < MAX_THUMBNAIL_ATTEMPTS - 1) {
          await sleep(Math.min(THUMBNAIL_RETRY_BASE_DELAY * (attempt + 1), 15000));
        }
      }
      if (
        !thumbnailStopRequestedRef.current
        && thumbnailSessionRef.current === runSessionId
        && !thumbnailFinishedRef.current.has(node.id)
      ) {
        if (!isScreenshotAuthError(lastErrorMessage)) {
          markThumbnailCaptureFailed(node.id, lastErrorMessage);
        }
        completeThumbnailCapture(node.id, { captured: false });
        updateRunCounts();
      }
      return false;
    };

    try {
      for (let batchIndex = 0; batchIndex < captureBatches.length; batchIndex += 1) {
        if (thumbnailStopRequestedRef.current || thumbnailSessionRef.current !== runSessionId) break;
        const batch = captureBatches[batchIndex];
        thumbnailBatchIndexRef.current = batchIndex + 1;
        setThumbnailStats((prev) => ({
          ...prev,
          batchIndex: thumbnailBatchIndexRef.current,
          batchTotal: thumbnailBatchTotalRef.current,
        }));
        let nextIndex = 0;
        const workerCount = Math.min(MAX_THUMBNAIL_CONCURRENCY, batch.length);
        const workers = Array.from({ length: workerCount }, async () => {
          while (!thumbnailStopRequestedRef.current && thumbnailSessionRef.current === runSessionId) {
            const node = batch[nextIndex];
            nextIndex += 1;
            if (!node) break;
            await captureNode(node);
          }
        });
        await Promise.all(workers);
        flushThumbnailAutosaveNow({ createVersionCheckpoint: false });
      }
      const finalSaved = await waitForThumbnailAssetSave({
        createVersionCheckpoint: true,
        forceVersionCheckpoint: true,
        maxWaitMs: 600000,
      });
      if (!finalSaved) {
        setThumbnailStats((prev) => ({ ...prev, stopped: true }));
        showToast('Captured thumbnails are still saving. Retry Remaining after save finishes.', 'warning');
        return;
      }
      if (thumbnailStopRequestedRef.current || thumbnailSessionRef.current !== runSessionId) {
        return;
      }
      const failedCount = thumbnailErrorRef.current.size;
      if (failedCount > 0 && !thumbnailFailureToastShownRef.current) {
        thumbnailFailureToastShownRef.current = true;
        showToast(
          `${failedCount} thumbnail${failedCount === 1 ? '' : 's'} could not be captured. Select those pages and run Selected to retry.`,
          'warning',
        );
      } else if (thumbnailLoadedRef.current.size > 0) {
        showToast(`Captured ${thumbnailLoadedRef.current.size} thumbnail${thumbnailLoadedRef.current.size === 1 ? '' : 's'}`, 'success');
      }
      trackEvent('screenshot_capture_complete', {
        type: 'thumbnail',
        scope,
        count: thumbnailLoadedRef.current.size,
        failed: failedCount,
      });
    } catch (error) {
      console.error('Thumbnail capture batch error:', error);
      showToast(error.message || 'Failed to capture thumbnails', 'error');
      await waitForThumbnailAssetSave({
        createVersionCheckpoint: true,
        forceVersionCheckpoint: true,
        maxWaitMs: 600000,
      });
    }
  };

  const stopThumbnailCaptureNow = (showStoppedToast = false) => {
    if (!thumbnailStats.total || thumbnailStats.stopped) return;
    const isScreenshotCapture = thumbnailStats.mode === 'screenshot';
    if (isScreenshotCapture) {
      screenshotStopRequestedRef.current = true;
    } else {
      thumbnailStopRequestedRef.current = true;
    }
    thumbnailAbortControllersRef.current.forEach((controller) => controller.abort());
    thumbnailAbortControllersRef.current.clear();
    const activeJob = imageCaptureJobRef.current;
    if (activeJob?.mapId && activeJob?.jobId) {
      api.cancelMapImageCaptureJob(activeJob.mapId, activeJob.jobId).catch((error) => {
        console.warn('Failed to cancel image capture job', error);
      });
      imageCaptureJobRef.current = null;
      setActiveImageCaptureJob(null);
    }
    setThumbnailQueueSize(0);
    setThumbnailStats((prev) => ({ ...prev, stopped: true }));
    setTimeout(() => {
      waitForThumbnailAssetSave({
        createVersionCheckpoint: true,
        forceVersionCheckpoint: true,
        maxWaitMs: 600000,
      });
    }, 300);
    if (showStoppedToast) {
      const captured = thumbnailStats.saved || imageCaptureSavedRef.current.size || thumbnailLoadedRef.current.size;
      const total = thumbnailExpectedRef.current.size || thumbnailStats.total || 0;
      const label = isScreenshotCapture ? 'screenshot' : 'thumbnail';
      showToast(
        `Stopped after capturing ${captured} of ${total} ${label}${total === 1 ? '' : 's'}`,
        'warning',
      );
    }
  };

  const pauseImageCaptureNow = () => {
    const activeJob = imageCaptureJobRef.current || activeImageCaptureJob;
    if (!activeJob?.mapId || !activeJob?.jobId) return;
    api.pauseMapImageCaptureJob(activeJob.mapId, activeJob.jobId)
      .then(() => {
        setActiveImageCaptureJob((prev) => (
          prev?.jobId === activeJob.jobId ? { ...prev, status: 'paused' } : prev
        ));
        setThumbnailStats((prev) => ({ ...prev, paused: true, phase: prev.phase || 'capturing' }));
      })
      .catch((error) => {
        showToast(getImageCaptureJobErrorMessage(error, 'Could not pause image capture'), 'error');
      });
  };

  const resumeImageCaptureNow = () => {
    const activeJob = imageCaptureJobRef.current || activeImageCaptureJob;
    if (!activeJob?.mapId || !activeJob?.jobId) return;
    api.resumeMapImageCaptureJob(activeJob.mapId, activeJob.jobId)
      .then(() => {
        setActiveImageCaptureJob((prev) => (
          prev?.jobId === activeJob.jobId ? { ...prev, status: 'running' } : prev
        ));
        setThumbnailStats((prev) => ({ ...prev, paused: false, phase: prev.phase || 'capturing' }));
      })
      .catch((error) => {
        showToast(getImageCaptureJobErrorMessage(error, 'Could not resume image capture'), 'error');
      });
  };

  useEffect(() => {
    const total = thumbnailStats.total || 0;
    const completed = thumbnailStats.completed || 0;
    const isActive = (showThumbnails || thumbnailStats.mode === 'screenshot')
      && total > 0
      && !thumbnailStats.stopped
      && (activeImageCaptureJob || thumbnailStats.finalizing || completed < total);
    if (!isActive) {
      if (thumbnailElapsedTimerRef.current) {
        clearInterval(thumbnailElapsedTimerRef.current);
        thumbnailElapsedTimerRef.current = null;
      }
      return undefined;
    }
    if (!thumbnailElapsedStartRef.current) {
      thumbnailElapsedStartRef.current = Date.now();
    }
    const tick = () => {
      setThumbnailElapsedMs(Date.now() - thumbnailElapsedStartRef.current);
    };
    tick();
    thumbnailElapsedTimerRef.current = setInterval(tick, 1000);
    return () => {
      if (thumbnailElapsedTimerRef.current) {
        clearInterval(thumbnailElapsedTimerRef.current);
        thumbnailElapsedTimerRef.current = null;
      }
    };
  }, [activeImageCaptureJob, showThumbnails, thumbnailStats.completed, thumbnailStats.finalizing, thumbnailStats.mode, thumbnailStats.stopped, thumbnailStats.total]);

  const getFullScreenshotCandidates = (
    scope,
    invalidAssetIds = invalidFullScreenshotAssetIds,
    targetMode = 'remaining',
  ) => {
    const allNodes = collectAllNodesWithOrphans(root, orphans);
    const scopedIds = scope === 'selected' ? new Set(selectedNodeIds) : null;
    const scopedNodes = scope === 'selected'
      ? allNodes.filter((node) => scopedIds.has(node.id))
      : allNodes;
    const orderedTargets = orderThumbnailNodes(scopedNodes.filter((node) => node?.url));
    const forceRecapture = scope === 'selected';
    const recaptureCapturedOnly = targetMode === 'captured';
    let candidates = [];
    if (recaptureCapturedOnly) {
      candidates = orderedTargets.filter((node) => hasStoredImageAsset(node.fullScreenshotUrl) && !invalidAssetIds.has(node.id));
    } else if (forceRecapture) {
      candidates = orderedTargets;
    } else {
      candidates = orderedTargets.filter((node) => !hasStoredImageAsset(node.fullScreenshotUrl) || invalidAssetIds.has(node.id));
    }
    return {
      candidates,
      total: orderedTargets.length,
      cachedCount: forceRecapture || recaptureCapturedOnly ? 0 : orderedTargets.length - candidates.length,
    };
  };

  const getDownloadableScreenshotTargets = useCallback((scope, assetType) => {
    const assetKey = assetType === 'thumb' ? 'thumbnailUrl' : 'fullScreenshotUrl';
    const allNodes = collectAllNodesWithOrphans(root, orphans);
    const scopedIds = scope === 'selected' ? new Set(selectedNodeIds) : null;
    const scopedNodes = scope === 'selected'
      ? allNodes.filter((node) => scopedIds.has(node.id))
      : allNodes;
    return orderThumbnailNodes(
      scopedNodes.filter((node) => {
        const invalidIds = assetType === 'thumb' ? invalidThumbnailAssetIds : invalidFullScreenshotAssetIds;
        return hasStoredImageAsset(node?.[assetKey]) && !invalidIds.has(node.id);
      })
    );
  }, [orphans, root, selectedNodeIds, hasStoredImageAsset, invalidThumbnailAssetIds, invalidFullScreenshotAssetIds, orderThumbnailNodes]);

  const buildImageDownloadNodeDescriptors = useCallback((scope) => {
    const selectedIds = scope === 'selected' ? new Set(selectedNodeIds) : null;
    const descriptors = [];

    const visit = (node, parentPath = []) => {
      if (!node?.id) return;
      const number = reportNumberMap.get(node.id) || node.number || node.pageNumber || '';
      const segment = {
        id: node.id,
        number,
        title: node.title || '',
        url: node.url || '',
      };
      const pathSegments = [...parentPath, segment];
      if (!selectedIds || selectedIds.has(node.id)) {
        descriptors.push({
          ...segment,
          pathSegments,
        });
      }
      (node.children || []).forEach((child) => visit(child, pathSegments));
    };

    if (root) visit(root, []);
    (orphans || []).forEach((orphan) => visit(orphan, []));
    return descriptors;
  }, [orphans, reportNumberMap, root, selectedNodeIds]);

  const downloadImageAssets = async (scope) => {
    if (!currentMap?.id) {
      showToast('Save this map before downloading images', 'warning');
      return;
    }

    const selectedNodeIdsForRequest = scope === 'selected' ? Array.from(selectedNodeIds) : [];
    const allTargets = [
      ...getDownloadableScreenshotTargets(scope, 'thumb'),
      ...getDownloadableScreenshotTargets(scope, 'full'),
    ];
    if (allTargets.length === 0) {
      showToast('No saved images to download', 'info');
      return;
    }

    setShowImageMenu(false);
    showToast('Preparing image download...', 'loading', true);

    try {
      await api.downloadMapImages(currentMap.id, {
        scope,
        selectedNodeIds: selectedNodeIdsForRequest,
        nodes: buildImageDownloadNodeDescriptors(scope),
      });
      showToast('Downloaded images', 'success');
      trackEvent('screenshot_download', {
        asset_type: 'all',
        scope,
        count: allTargets.length,
      });
    } catch (error) {
      console.error('Image asset download error:', error);
      showToast(error.message || 'Failed to download images', 'error');
    }
  };

  // Fetch full page screenshot from backend (or display direct image URL).
  // When a node id is provided, persist the generated backend asset URLs onto that node.
  const viewFullScreenshot = async (urlOrImage, isDirectImage = false, nodeId = null, captureType = 'full') => {
    if (isDirectImage) {
      setImageLoading(true);
      setFullImageUrl(urlOrImage);
      return;
    }
    const normalizedCaptureType = captureType === 'thumb' ? 'thumb' : 'full';
    const captureMode = normalizedCaptureType === 'thumb' ? 'thumbnail' : 'screenshot';
    if (!guardImageCaptureAvailable(captureMode)) return;
    if (!guardImageCapturePersistenceReady()) return;

    setImageLoading(true);
    setFullImageUrl(null);
    resetThumbnailQueue(1, 0, true, captureMode);
    thumbnailElapsedStartRef.current = Date.now();
    setThumbnailElapsedMs(0);
    if (nodeId) {
      setThumbnailScopeIds(new Set([nodeId]));
      setShowThumbnails(true);
    }

    try {
      const data = await api.captureScreenshot({ url: urlOrImage, type: normalizedCaptureType });
      if (data?.error) {
        throw new Error(data.error);
      }
      if (!data?.url) {
        throw new Error('No screenshot URL returned');
      }
      if (nodeId) {
        const assetUpdates = { authRequired: false };
        if (normalizedCaptureType === 'full') {
          assetUpdates.fullScreenshotUrl = data.url;
          if (data.thumbnailUrl) {
            Object.assign(assetUpdates, {
              thumbnailUrl: data.thumbnailUrl,
              thumbnailCaptureFailed: false,
              thumbnailCaptureError: null,
              thumbnailCaptureFailedAt: null,
            });
          }
          if (data.thumbnailFullUrl) assetUpdates.thumbnailFullUrl = data.thumbnailFullUrl;
        } else {
          Object.assign(assetUpdates, getThumbnailAssetUpdates(data));
        }
        const persisted = updateNodeScreenshotAssets(nodeId, assetUpdates);
        if (!persisted) {
          throw new Error('Failed to save screenshot assets on this page');
        }
        if (normalizedCaptureType === 'full') {
          setInvalidFullScreenshotAssetIds((prev) => {
            if (!prev.has(nodeId)) return prev;
            const updated = new Set(prev);
            updated.delete(nodeId);
            return updated;
          });
        }
        if (assetUpdates.thumbnailUrl) {
          setInvalidThumbnailAssetIds((prev) => {
            if (!prev.has(nodeId)) return prev;
            const updated = new Set(prev);
            updated.delete(nodeId);
            return updated;
          });
          setThumbnailScopeIds((prev) => {
            const next = new Set(prev || []);
            next.add(nodeId);
            return next;
          });
          bumpThumbnailReload(nodeId);
          setShowThumbnails(true);
        }
        await flushThumbnailAutosaveNow({ createVersionCheckpoint: true, forceVersionCheckpoint: true });
      }
      setThumbnailStats((prev) => ({
        ...prev,
        loaded: 1,
        completed: 1,
        avgMs: Date.now() - thumbnailElapsedStartRef.current,
      }));
      setFullImageUrl(
        normalizedCaptureType === 'thumb'
          ? (data.thumbnailFullUrl || data.previewUrl || data.url)
          : data.url
      );
      setToast(null);
    } catch (e) {
      console.error('Screenshot error:', e);
      if (screenshotStopRequestedRef.current || e?.message === 'Screenshot capture stopped') {
        showToast('Screenshot capture stopped', 'warning');
        setImageLoading(false);
        return;
      }
      if (nodeId && isScreenshotAuthError(e?.message)) {
        updateNodeScreenshotAssets(nodeId, {
          authRequired: true,
        });
      }
      showToast(`Screenshot failed: ${e.message}`, 'error');
      setImageLoading(false);
    }
  };

  const handleFullScreenshotCapture = async (scope, targetMode = 'remaining') => {
    if (warnCoeditingReadOnly('Full screenshot capture')) {
      return;
    }
    if (!root) {
      showToast('Create or load a map before capturing screenshots', 'info');
      return;
    }
    if (scope === 'selected' && selectedNodeIds.size === 0) {
      showToast('Select pages to capture full screenshots', 'info');
      return;
    }
    if (!guardImageCaptureAvailable('screenshot')) return;
    if (!guardImageCapturePersistenceReady()) return;

    const invalidIds = new Set(invalidFullScreenshotAssetIds);
    const { candidates: targets, total, cachedCount } = getFullScreenshotCandidates(scope, invalidIds, targetMode);
    if (total === 0) {
      setShowImageMenu(false);
      showToast('No pages with URLs to capture', 'info');
      return;
    }
    if (targetMode === 'captured' && targets.length === 0) {
      setShowImageMenu(false);
      resetThumbnailQueue(0, 0, true, 'screenshot');
      setThumbnailScopeIds(new Set());
      showToast('No captured full screenshots to update', 'info');
      return;
    }
    if (targets.length === 0) {
      setShowImageMenu(false);
      resetThumbnailQueue(0, cachedCount, true, 'screenshot');
      setThumbnailScopeIds(new Set());
      showToast('All full screenshots are already captured', 'info');
      return;
    }

    const scaleTier = getImageCaptureScaleTierForCount('screenshot', targets.length);
    if (scaleTier === IMAGE_CAPTURE_SCALE_TIERS.large) {
      if (!(await confirmScaleAwareImageCapture({ mode: 'screenshot', count: targets.length }))) return;
    } else if (targets.length > 10) {
      const confirmed = await showConfirm({
        title: 'Capture full screenshots?',
        message: `This will generate ${targets.length} full-page screenshot${targets.length === 1 ? '' : 's'} and attach them to the selected pages.`,
        confirmText: 'Capture',
        cancelText: 'Cancel',
      });
      if (!confirmed) return;
    }

    const handledByJob = await runMapImageCaptureJob({
      scope,
      captureType: 'full',
      mode: 'screenshot',
      targetMode,
      targets,
      targetIds: new Set(targets.map((node) => node.id)),
      cachedCount,
      unavailableCount: 0,
    });
    if (handledByJob) return;

    setShowImageMenu(false);
    setShowThumbnails(true);
    setThumbnailScopeIds(new Set(targets.map((node) => node.id)));
    resetThumbnailQueue(targets.length, cachedCount, true, 'screenshot');
    const captureBatches = buildImageCaptureBatches(targets);
    thumbnailBatchTotalRef.current = Math.max(1, captureBatches.length);
    thumbnailBatchIndexRef.current = 0;
    setThumbnailStats((prev) => ({
      ...prev,
      batchIndex: 0,
      batchTotal: thumbnailBatchTotalRef.current,
    }));
    thumbnailElapsedStartRef.current = Date.now();
    setThumbnailElapsedMs(0);
    thumbnailExpectedRef.current = new Set(targets.map((node) => node.id));
    const runSessionId = thumbnailSessionRef.current;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const updateActiveCounts = () => {
      const completedCount = thumbnailFinishedRef.current.size;
      setThumbnailActiveCount(thumbnailActiveRef.current);
      setThumbnailQueueSize(Math.max(
        0,
        targets.length - completedCount - thumbnailInFlightRef.current.size,
      ));
    };

    try {
      const captureNode = async (node) => {
        if (!node?.id || !node?.url) return false;
        if (thumbnailFinishedRef.current.has(node.id)) return false;
        let lastErrorMessage = 'Full screenshot capture failed';
        for (let attempt = 0; attempt < MAX_THUMBNAIL_ATTEMPTS; attempt += 1) {
          if (screenshotStopRequestedRef.current || thumbnailSessionRef.current !== runSessionId) {
            return false;
          }
          thumbnailAttemptsRef.current.set(node.id, attempt);
          thumbnailActiveRef.current += 1;
          thumbnailInFlightRef.current.add(node.id);
          thumbnailLoadStartRef.current.set(node.id, Date.now());
          updateActiveCounts();
          const controller = new AbortController();
          thumbnailAbortControllersRef.current.set(node.id, controller);
          const timeoutId = setTimeout(() => {
            controller.abort();
          }, 90000);
          let terminalFailure = false;
          try {
            const data = await api.captureScreenshot(
              { url: node.url, type: 'full' },
              { signal: controller.signal },
            );
            if (screenshotStopRequestedRef.current || thumbnailSessionRef.current !== runSessionId) {
              return false;
            }
            if (data?.error) {
              throw new Error(data.error);
            }
            if (!data?.url) {
              throw new Error('No screenshot URL returned');
            }
            const assetUpdates = {
              fullScreenshotUrl: data.url,
              authRequired: false,
            };
            if (data.thumbnailUrl) {
              Object.assign(assetUpdates, {
                thumbnailUrl: data.thumbnailUrl,
                thumbnailCaptureFailed: false,
                thumbnailCaptureError: null,
                thumbnailCaptureFailedAt: null,
              });
            }
            if (data.thumbnailFullUrl) assetUpdates.thumbnailFullUrl = data.thumbnailFullUrl;
            const persisted = updateNodeScreenshotAssets(node.id, assetUpdates);
            if (!persisted) {
              lastErrorMessage = 'Failed to save screenshot assets on the selected page';
              terminalFailure = true;
            } else {
              setInvalidFullScreenshotAssetIds((prev) => {
                if (!prev.has(node.id)) return prev;
                const updated = new Set(prev);
                updated.delete(node.id);
                return updated;
              });
              if (assetUpdates.thumbnailUrl) {
                setInvalidThumbnailAssetIds((prev) => {
                  if (!prev.has(node.id)) return prev;
                  const updated = new Set(prev);
                  updated.delete(node.id);
                  return updated;
                });
                setThumbnailScopeIds((prev) => {
                  const next = new Set(prev || []);
                  next.add(node.id);
                  return next;
                });
                bumpThumbnailReload(node.id);
                setShowThumbnails(true);
              }
              completeThumbnailCapture(node.id);
              updateActiveCounts();
              return true;
            }
          } catch (error) {
            lastErrorMessage = error?.message || 'Full screenshot capture failed';
            if (
              screenshotStopRequestedRef.current
              || thumbnailSessionRef.current !== runSessionId
              || error?.message === 'Screenshot capture stopped'
            ) {
              return false;
            }
            if (isScreenshotAuthError(lastErrorMessage)) {
              terminalFailure = true;
              updateNodeScreenshotAssets(node.id, {
                authRequired: true,
              });
              if (!thumbnailAuthToastShownRef.current) {
                thumbnailAuthToastShownRef.current = true;
                showToast('Screenshot capture for this page requires login. Prompted credentials are not supported yet.', 'info');
              }
            }
            console.error('Full screenshot capture failed:', error);
          } finally {
            clearTimeout(timeoutId);
            thumbnailAbortControllersRef.current.delete(node.id);
            thumbnailInFlightRef.current.delete(node.id);
            thumbnailActiveRef.current = Math.max(0, thumbnailActiveRef.current - 1);
            if (!thumbnailFinishedRef.current.has(node.id)) {
              thumbnailLoadStartRef.current.delete(node.id);
            }
            updateActiveCounts();
          }
          if (terminalFailure) break;
          if (attempt < MAX_THUMBNAIL_ATTEMPTS - 1) {
            await sleep(Math.min(THUMBNAIL_RETRY_BASE_DELAY * (attempt + 1), 15000));
          }
        }
        if (
          !screenshotStopRequestedRef.current
          && thumbnailSessionRef.current === runSessionId
          && !thumbnailFinishedRef.current.has(node.id)
        ) {
          completeThumbnailCapture(node.id, { captured: false });
          updateActiveCounts();
          console.error('Full screenshot capture failed:', new Error(lastErrorMessage));
        }
        return false;
      };

      for (let batchIndex = 0; batchIndex < captureBatches.length; batchIndex += 1) {
        if (screenshotStopRequestedRef.current || thumbnailSessionRef.current !== runSessionId) break;
        const batch = captureBatches[batchIndex];
        thumbnailBatchIndexRef.current = batchIndex + 1;
        setThumbnailStats((prev) => ({
          ...prev,
          batchIndex: thumbnailBatchIndexRef.current,
          batchTotal: thumbnailBatchTotalRef.current,
        }));
        let nextIndex = 0;
        const workerCount = Math.min(FULL_SCREENSHOT_CONCURRENCY, batch.length);
        const workers = Array.from({ length: workerCount }, async () => {
          while (!screenshotStopRequestedRef.current && thumbnailSessionRef.current === runSessionId) {
            const node = batch[nextIndex];
            nextIndex += 1;
            if (!node) break;
            await captureNode(node);
          }
        });
        await Promise.all(workers);
        flushThumbnailAutosaveNow({ createVersionCheckpoint: false });
      }
      const finalSaved = await waitForThumbnailAssetSave({
        createVersionCheckpoint: true,
        forceVersionCheckpoint: true,
        maxWaitMs: 600000,
      });
      if (!finalSaved) {
        setThumbnailStats((prev) => ({ ...prev, stopped: true }));
        showToast('Captured screenshots are still saving. Retry Remaining after save finishes.', 'warning');
        return;
      }
      if (screenshotStopRequestedRef.current || thumbnailSessionRef.current !== runSessionId) {
        const successCount = thumbnailLoadedRef.current.size;
        showToast(`Stopped after capturing ${successCount} of ${targets.length} screenshots`, 'warning');
        await waitForThumbnailAssetSave({
          createVersionCheckpoint: true,
          forceVersionCheckpoint: true,
          maxWaitMs: 600000,
        });
        return;
      }
      const successCount = thumbnailLoadedRef.current.size;
      const failedCount = thumbnailErrorRef.current.size;
      const message = failedCount > 0
        ? `Captured ${successCount} full screenshot${successCount === 1 ? '' : 's'}; ${failedCount} failed`
        : `Captured ${successCount} full screenshot${successCount === 1 ? '' : 's'}`;
      showToast(message, failedCount > 0 ? 'warning' : 'success');
      trackEvent('screenshot_capture', {
        type: 'full',
        scope,
        count: successCount,
        failed: failedCount,
      });
    } catch (error) {
      console.error('Full screenshot batch error:', error);
      if (isScreenshotAuthError(error?.message)) {
        showToast(error.message, 'info');
        return;
      }
      showToast(error.message || 'Failed to capture full screenshots', 'error');
    }
  };

  // Project folder functions
  const createProject = useCallback(async (name) => {
    if (!name?.trim()) return;
    try {
      const { project } = await api.createProject(name.trim());
      await loadAuthenticatedWorkspace();
      setExpandedProjects((prev) => ({ ...prev, [project.id]: true }));
      trackEvent('project_created', {
        project_id: String(project?.id || ''),
        project_name: project?.name || name.trim(),
      });
      if (!root) {
        setShowProjectsModal(true);
      }
      showToast(`Project "${name}" created`, 'success');
      return project;
    } catch (e) {
      showToast(e.message || 'Failed to create project', 'error');
      return null;
    }
  }, [loadAuthenticatedWorkspace, root, showToast]);

  const renameProject = async (projectId, newName) => {
    if (projectId === UNCATEGORIZED_PROJECT_ID || projectId === SHARED_PROJECT_ID) {
      setEditingProjectId(null);
      return;
    }
    const trimmedName = newName?.trim();
    if (!trimmedName) {
      setEditingProjectId(null);
      showToast('Project name is required', 'error');
      return;
    }
    const current = projects.find(p => p.id === projectId);
    if (current && current.name === trimmedName) {
      setEditingProjectId(null);
      return;
    }
    try {
      const { project } = await api.updateProject(projectId, trimmedName);
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, name: project.name } : p
      ));
      setEditingProjectId(null);
      showToast('Project renamed', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to rename project', 'error');
    }
  };

  const renameMap = async (projectId, mapId, newName) => {
    if (!mapId) {
      setEditingMapId(null);
      return;
    }
    const trimmedName = newName?.trim();
    if (!trimmedName) {
      setEditingMapId(null);
      showToast('Map name is required', 'error');
      return;
    }

    const currentProject = projects.find((project) => project.id === projectId);
    const current = (currentProject?.maps || []).find((map) => map.id === mapId)
      || projects.flatMap((project) => project.maps || []).find((map) => map.id === mapId);

    if (current && current.name === trimmedName) {
      setEditingMapId(null);
      return;
    }

    const targetProjectId = normalizeProjectSelection(projectId);
    const conflict = findMapNameConflict(projects, {
      projectId: targetProjectId,
      name: trimmedName,
      excludeMapId: mapId,
    });
    if (conflict) {
      showToast(getMapNameConflictMessage(trimmedName), 'error');
      return;
    }

    if (isCoeditingReadOnlyMode && currentMap?.id === mapId) {
      setEditingMapId(null);
      warnCoeditingReadOnly('This map');
      return;
    }
    if (isLiveActive && currentMap?.id === mapId) {
      setEditingMapId(null);
      showToast('Rename this map after live editing is turned off.', 'info');
      return;
    }

    try {
      const { map } = await updateMapWithLatestTimestamp(
        mapId,
        { name: trimmedName },
        { expectedUpdatedAt: current?.updated_at || (currentMap?.id === mapId ? currentMap?.updated_at : null) }
      );
      setProjects((prev) => prev.map((project) => ({
        ...project,
        maps: (project.maps || []).map((projectMap) => (projectMap.id === map.id ? map : projectMap)),
      })));
      if (currentMap?.id === map.id) {
        setCurrentMap(map);
        setMapName(map.name || '');
      }
      setMapSaveConflict(null);
      setEditingMapId(null);
      showToast('Map renamed', 'success');
    } catch (error) {
      if (isMapUpdateConflictError(error)) {
        setEditingMapId(null);
        registerMapConflict({ error, mapId, source: 'rename' });
        return;
      }
      if (isMapNameConflictError(error)) {
        showToast(error.message || getMapNameConflictMessage(trimmedName), 'error');
        return;
      }
      showToast(error.message || 'Failed to rename map', 'error');
    }
  };

  const deleteProject = async (projectId) => {
    if (projectId === UNCATEGORIZED_PROJECT_ID || projectId === SHARED_PROJECT_ID) {
      showToast('Cannot delete a virtual folder', 'warning');
      return;
    }
    const confirmed = await showConfirm({
      title: 'Delete Project',
      message: 'Delete this project and all its maps?',
      confirmText: 'Delete',
      danger: true
    });
    if (!confirmed) return;
    try {
      await api.deleteProject(projectId);
      const deletedProject = projects.find((project) => project.id === projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
      if (editingProjectId === projectId) {
        setEditingProjectId(null);
      }
      if (deletedProject?.maps?.some((map) => map.id === editingMapId)) {
        setEditingMapId(null);
      }
      if (expandedProjects[projectId]) {
        setExpandedProjects({});
      }
      showToast('Project deleted', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to delete project', 'error');
    }
  };

  const moveMapToProject = async (mapId, targetProjectId) => {
    if (!mapId) return;
    if (isCoeditingReadOnlyMode && currentMap?.id === mapId) {
      warnCoeditingReadOnly('This map');
      return;
    }
    if (isLiveActive && currentMap?.id === mapId) {
      showToast('Move this map to another project after live editing is turned off.', 'info');
      return;
    }
    const mapRecord = projects.flatMap((project) => project.maps || []).find((map) => map.id === mapId);
    const currentProjectId = projects.find(p => (p.maps || []).some(m => m.id === mapId))?.id || null;
    if ((currentProjectId || null) === (targetProjectId || null)) {
      return;
    }
    const conflict = findMapNameConflict(projects, {
      projectId: targetProjectId,
      name: mapRecord?.name || '',
      excludeMapId: mapId,
    });
    if (conflict) {
      showToast(getMapNameConflictMessage(mapRecord?.name || 'Untitled Map'), 'error');
      return;
    }
    try {
      const { map } = await updateMapWithLatestTimestamp(
        mapId,
        { project_id: targetProjectId || null },
        { expectedUpdatedAt: mapRecord?.updated_at || (currentMap?.id === mapId ? currentMap?.updated_at : null) }
      );
      setProjects(prev => {
        let updated = prev.map(p => ({
          ...p,
          maps: (p.maps || []).filter(m => m.id !== map.id),
        }));
        if (map.project_id) {
          updated = updated.map(p =>
            p.id === map.project_id
              ? { ...p, maps: [map, ...(p.maps || [])] }
              : p
          );
        } else {
          const uncategorized = updated.find(p => p.id === 'uncategorized' || p.name === 'Uncategorized');
          if (uncategorized) {
            uncategorized.maps = [map, ...(uncategorized.maps || [])];
          } else {
            updated.push({ id: 'uncategorized', name: 'Uncategorized', maps: [map] });
          }
        }
        return updated;
      });
      if (currentMap?.id === map.id) {
        setCurrentMap(map);
        setMapName(map.name || '');
      }
      setMapSaveConflict(null);
      showToast('Map moved', 'success');
    } catch (e) {
      if (isMapUpdateConflictError(e)) {
        registerMapConflict({ error: e, mapId, source: 'move' });
        return;
      }
      if (isMapNameConflictError(e)) {
        showToast(e.message || getMapNameConflictMessage(mapRecord?.name || 'Untitled Map'), 'error');
        return;
      }
      showToast(e.message || 'Failed to move map', 'error');
    }
  };

  const handleBookmarkVersion = async (version, { name, notes } = {}) => {
    if (!currentMap?.id || !version?.id) return null;
    if (!canSaveVersion()) {
      throw new Error('Only owners and editors can bookmark versions on this map.');
    }
    if (warnCoeditingReadOnly('This map')) {
      throw new Error('This map is read-only right now.');
    }

    const { version: updatedVersion } = await api.updateMapVersion(currentMap.id, version.id, {
      name,
      notes,
    });
    if (updatedVersion) {
      setMapVersions((prev) => prev.map((item) => (
        item.id === updatedVersion.id ? { ...item, ...updatedVersion } : item
      )));
      if (showVersionHistoryDrawer && canViewActivityValue) {
        loadMapActivity(currentMap.id, { silent: true, allowToast: false });
      }
      showToast('Version bookmarked', 'success');
    }
    return updatedVersion;
  };

  const duplicateCurrentMap = () => {
    if (!root) {
      showToast('No map to duplicate', 'warning');
      return;
    }
    if (!currentMap?.id) {
      setCreateMapMode(false);
      setDuplicateMapConfig({
        name: `${(mapName || 'Untitled Map').trim()} (Copy)`,
        projectId: null,
      });
      setShowSaveMapModal(true);
      return;
    }
    const baseName = (currentMap?.name || mapName || 'Untitled Map').trim();
    setDuplicateMapConfig({
      name: `${baseName} (Copy)`,
      projectId: currentMap?.project_id || null,
    });
    setShowSaveMapModal(true);
  };

  const handleDuplicateMapSave = async (projectId, name, notes) => {
    const snapshot = getVersionSnapshot();
    if (!snapshot?.root) return;
    const targetProjectId = normalizeProjectSelection(projectId);
    const trimmedName = name.trim();
    const conflict = findMapNameConflict(projects, {
      projectId: targetProjectId,
      name: trimmedName,
    });
    if (conflict) {
      showToast(getMapNameConflictMessage(trimmedName), 'error');
      return;
    }
    setIsSavingMap(true);
    try {
      await waitForUiResponse();
      const { map, initialVersion } = await api.saveMap({
        name: trimmedName,
        url: snapshot.root?.url || '',
        root: snapshot.root,
        orphans: snapshot.orphans,
        connections: snapshot.connections,
        colors: snapshot.colors,
        connectionColors: snapshot.connectionColors,
        notes: notes?.trim() || null,
        project_id: targetProjectId,
      });
      setProjects(prev => {
        let updated = prev.map(p => ({
          ...p,
          maps: (p.maps || []).filter(m => m.id !== map.id),
        }));
        if (map.project_id) {
          updated = updated.map(p =>
            p.id === map.project_id
              ? { ...p, maps: [map, ...(p.maps || [])] }
              : p
          );
        } else {
          const uncategorized = updated.find(p => p.id === 'uncategorized' || p.name === 'Uncategorized');
          if (uncategorized) {
            uncategorized.maps = [map, ...(uncategorized.maps || [])];
          } else {
            updated.push({ id: 'uncategorized', name: 'Uncategorized', maps: [map] });
          }
        }
        return updated;
      });
      setCurrentMap(map);
      navigateToRoute(createMapRoute(map.id));
      setMapName(map.name);
      setIsImportedMap(false);
      setActiveVersionId(null);
      setShowVersionEditPrompt(false);
      versionBaselineRef.current = null;
      resetAutosaveTracking({
        snapshot: serializeMapAutosaveSnapshot({
          root: snapshot.root,
          orphans: snapshot.orphans,
          connections: snapshot.connections,
          colors: snapshot.colors,
          connectionColors: snapshot.connectionColors,
        }),
      });
      if (initialVersion) {
        setMapVersions([initialVersion]);
        setLatestVersionId(initialVersion.id);
      }
      await loadMapVersions(map.id);
      await loadMapActivity(map.id, { silent: true, allowToast: false });
      showToast('Map duplicated', 'success');
      setDuplicateMapConfig(null);
    } catch (error) {
      if (isMapNameConflictError(error)) {
        showToast(error.message || getMapNameConflictMessage(trimmedName), 'error');
        return;
      }
      showToast(error.message || 'Failed to duplicate map', 'error');
    } finally {
      setIsSavingMap(false);
      setShowSaveMapModal(false);
    }
  };

  const restoreVersion = (version) => {
    if (!version?.root) return;
    const versionHasThumbnails = collectAllNodesWithOrphans(version.root, version.orphans || []).some((node) => !!node.thumbnailUrl);
    setRoot(version.root);
    setOrphans(normalizeOrphans(version.orphans));
    setConnections(version.connections || []);
    setColors(version.colors || DEFAULT_COLORS);
    setConnectionColors(version.connectionColors || DEFAULT_CONNECTION_COLORS);
    setUrlInput(version.root?.url || '');
    setActiveVersionId(version.id);
    setShowVersionEditPrompt(false);
    setShowVersionHistoryDrawer(false);
    setShowImageReportDrawer(false);
    setThumbnailScopeIds(versionHasThumbnails ? new Set() : null);
    setShowThumbnails(versionHasThumbnails);
    const snapshot = serializeVersionSnapshot({
      root: version.root,
      orphans: version.orphans,
      connections: version.connections || [],
      colors: version.colors || DEFAULT_COLORS,
      connectionColors: version.connectionColors || DEFAULT_CONNECTION_COLORS,
    });
    versionBaselineRef.current = snapshot;
    showToast(canSaveVersion() ? 'Version restored' : 'Version preview loaded', 'success');
  };

  const handleOverrideVersion = async () => {
    setShowVersionEditPrompt(false);
    setActiveVersionId(null);
    versionBaselineRef.current = null;
    if (!currentMap?.id) return;
    if (warnCoeditingReadOnly('This map')) return;

    const snapshot = getVersionSnapshot();
    try {
      const { map } = await updateMapWithLatestTimestamp(
        currentMap.id,
        {
          name: (currentMap?.name || mapName || '').trim() || 'Untitled Map',
          root: snapshot.root,
          orphans: snapshot.orphans,
          connections: snapshot.connections,
          colors: snapshot.colors,
          connectionColors: snapshot.connectionColors,
          project_id: currentMap?.project_id || null,
        },
        { expectedUpdatedAt: currentMap?.updated_at || null }
      );
      setCurrentMap(map);
      setMapSaveConflict(null);
      setMapName(map.name || '');
      setProjects(prev => prev.map(p => ({
        ...p,
        maps: (p.maps || []).map(m => (m.id === map.id ? map : m)),
      })));
      lastAutosaveSnapshotRef.current = serializeMapAutosaveSnapshot({
        name: map.name,
        root: snapshot.root,
        orphans: snapshot.orphans,
        connections: snapshot.connections,
        colors: snapshot.colors,
        connectionColors: snapshot.connectionColors,
        project_id: map.project_id || null,
      });
      await createVersionFromSnapshot({ mapId: map.id, snapshot, name: 'Updated' });
      showToast('Latest version updated', 'success');
    } catch (error) {
      if (isMapUpdateConflictError(error)) {
        registerMapConflict({ error, mapId: currentMap.id, source: 'override' });
        return;
      }
      showToast(error.message || 'Failed to override latest version', 'error');
    }
  };

  const handleSaveVersionCopy = async () => {
    const snapshot = getVersionSnapshot();
    if (!snapshot?.root) {
      setShowVersionEditPrompt(false);
      return;
    }
    const baseName = (currentMap?.name || mapName || 'Untitled Map').trim();
    const copyName = `${baseName} (Copy)`;
    const targetProjectId = normalizeProjectSelection(currentMap?.project_id || null);
    const conflict = findMapNameConflict(projects, {
      projectId: targetProjectId,
      name: copyName,
    });
    if (conflict) {
      showToast(getMapNameConflictMessage(copyName), 'error');
      return;
    }
    try {
      const { map } = await api.saveMap({
        name: copyName,
        url: snapshot.root?.url || '',
        root: snapshot.root,
        orphans: snapshot.orphans,
        connections: snapshot.connections,
        colors: snapshot.colors,
        connectionColors: snapshot.connectionColors,
        project_id: targetProjectId,
      });
      setProjects(prev => {
        let updated = prev.map(p => ({
          ...p,
          maps: (p.maps || []).filter(m => m.id !== map.id),
        }));
        if (map.project_id) {
          updated = updated.map(p =>
            p.id === map.project_id
              ? { ...p, maps: [map, ...(p.maps || [])] }
              : p
          );
        } else {
          const uncategorized = updated.find(p => p.id === 'uncategorized' || p.name === 'Uncategorized');
          if (uncategorized) {
            uncategorized.maps = [map, ...(uncategorized.maps || [])];
          } else {
            updated.push({ id: 'uncategorized', name: 'Uncategorized', maps: [map] });
          }
        }
        return updated;
      });
      setShowVersionEditPrompt(false);
      versionBaselineRef.current = serializeVersionSnapshot(snapshot);
      showToast('Saved as a copy', 'success');
    } catch (error) {
      if (isMapNameConflictError(error)) {
        showToast(error.message || getMapNameConflictMessage(copyName), 'error');
        return;
      }
      showToast(error.message || 'Failed to save copy', 'error');
    }
  };

  // Map functions
  const saveMap = async (projectId, mapName, notes) => {
    const latestRoot = rootRef.current || root;
    const latestOrphans = orphansRef.current || orphans;
    if (!latestRoot) return showToast('No sitemap to save', 'warning');
    if (!mapName?.trim()) return;
    if (currentMap?.id && warnCoeditingReadOnly('This map')) {
      setShowSaveMapModal(false);
      return;
    }
    const wasNewMap = !currentMap?.id;
    const targetProjectId = normalizeProjectSelection(projectId);
    const trimmedName = mapName.trim();
    const conflict = findMapNameConflict(projects, {
      projectId: targetProjectId,
      name: trimmedName,
      excludeMapId: currentMap?.id || null,
    });
    if (conflict) {
      showToast(getMapNameConflictMessage(trimmedName), 'error');
      return;
    }

    setIsSavingMap(true);
    try {
      await waitForUiResponse();
      let savedMap;
      let initialVersion = null;
      if (currentMap?.id) {
        // Update existing map
        const { map } = await updateMapWithLatestTimestamp(
          currentMap.id,
          buildMapSavePayload({
            name: trimmedName,
            root: latestRoot,
            orphans: latestOrphans,
            connections,
            colors,
            connectionColors,
            notes: notes?.trim() || null,
            project_id: targetProjectId,
          }),
          { expectedUpdatedAt: currentMap?.updated_at || null }
        );
        savedMap = map;
      } else {
        // Create new map
        const response = await api.saveMap(buildMapSavePayload({
          name: trimmedName,
          url: latestRoot.url,
          root: latestRoot,
          orphans: latestOrphans,
          connections,
          colors,
          connectionColors,
          notes: notes?.trim() || null,
          project_id: targetProjectId,
        }));
        savedMap = response.map;
        initialVersion = response.initialVersion || null;
      }

      // Update local projects list
      setProjects(prev => {
        // Remove from old project if exists
        let updated = prev.map(p => ({
          ...p,
          maps: (p.maps || []).filter(m => m.id !== savedMap.id),
        }));

        // Add to new project
        if (targetProjectId) {
          updated = updated.map(p =>
            p.id === targetProjectId
              ? { ...p, maps: [savedMap, ...(p.maps || [])] }
              : p
          );
        } else {
          const uncategorized = updated.find(p => p.id === 'uncategorized' || p.name === 'Uncategorized');
          if (uncategorized) {
            uncategorized.maps = [savedMap, ...(uncategorized.maps || [])];
          } else {
            updated.push({ id: 'uncategorized', name: 'Uncategorized', maps: [savedMap] });
          }
        }
        return updated;
      });

      setCurrentMap(savedMap);
      largeMapHomeSceneKeyRef.current = '';
      navigateToRoute(createMapRoute(savedMap.id));
      resetAutosaveTracking({
        snapshot: serializeMapAutosaveSnapshot({
          name: trimmedName,
          root: latestRoot,
          orphans: latestOrphans,
          connections,
          colors,
          connectionColors,
          project_id: savedMap?.project_id || null,
        }),
      });
      setMapSaveConflict(null);
      setShowSaveMapModal(false);
      trackEvent('map_saved', {
        map_id: String(savedMap?.id || ''),
        project_id: String(savedMap?.project_id || targetProjectId || ''),
        new_map: wasNewMap ? 'true' : 'false',
        imported_map: isImportedMap ? 'true' : 'false',
      });
      showToast(`Map "${trimmedName}" saved`, 'success');

      if (pendingLogoutAfterSave) {
        const shouldPreserveAsViewOnly = Boolean(savedMap?.id)
          && (
            accessLevel === ACCESS_LEVELS.VIEW
            || (hasCreatedShareLink && currentShareAccess === ACCESS_LEVELS.VIEW)
          );
        await performLogout({ preserveViewOnlyMap: shouldPreserveAsViewOnly });
        return;
      }

      if (wasNewMap) {
        if (initialVersion) {
          setMapVersions([initialVersion]);
          setLatestVersionId(initialVersion.id);
        }
        await loadMapVersions(savedMap.id);
        await loadMapActivity(savedMap.id, { silent: true, allowToast: false });
      }
      if (pendingLoadMap) {
        const mapToLoad = pendingLoadMap;
        setPendingLoadMap(null);
        if (mapToLoad.root) {
          loadMap(mapToLoad);
        } else if (mapToLoad.id) {
          await loadSavedMapById(mapToLoad.id);
        }
        return;
      }
      if (wasNewMap && lastHistoryId && lastScanUrl && root?.url === lastScanUrl) {
        api.updateHistory(lastHistoryId, { map_id: savedMap.id })
          .then(() => {
            setScanHistory(prev => prev.map(item =>
              item.id === lastHistoryId ? { ...item, map_id: savedMap.id } : item
            ));
          })
          .catch((err) => {
            console.error('Failed to attach map to history:', err);
          });
      }
      if (pendingCreateAfterSave) {
        const createConfig = pendingCreateAfterSave;
        setPendingCreateAfterSave(null);
        setDuplicateMapConfig(null);
        setPendingLoadMap(null);
        setCreateMapMode(true);
        setCreateMapDefaults({
          projectId: createConfig?.projectId || null,
          name: '',
          notes: '',
        });
        setShowCreateMapModal(false);
        setShowSaveMapModal(true);
      }
    } catch (e) {
      if (isMapUpdateConflictError(e)) {
        registerMapConflict({ error: e, mapId: currentMap?.id || null, source: 'save' });
        return;
      }
      if (isMapNameConflictError(e)) {
        showToast(e.message || getMapNameConflictMessage(trimmedName), 'error');
        return;
      }
      showToast(e.message || 'Failed to save map', 'error');
    } finally {
      setIsSavingMap(false);
    }
  };

  const startBlankMapCreation = (projectId, mapName, notes) => {
    if (!mapName?.trim()) return;
    const trimmedName = mapName.trim();
    setCreateMapMode(false);
    setCreateMapDefaults(null);
    setPendingCreateAfterSave(null);
    setPendingMapCreation({ name: trimmedName, projectId: projectId || null, notes: notes?.trim() || '' });
    setMapName(trimmedName);
    setRoot(null);
    setOrphans([]);
    setConnections([]);
    setMapInsights(null);
    setInsightsError('');
    setHasCreatedShareLink(false);
    setCurrentShareAccess(null);
    setIsImportedMap(false);
    setCurrentMap({ name: trimmedName, project_id: projectId || null, notes: notes?.trim() || '' });
    navigateToRoute(createAppHomeRoute());
    setMapSaveConflict(null);
    setSelectedNodeIds(new Set());
    setSelectionBox(null);
    setThumbnailScopeIds(null);
    setShowImageMenu(false);
    setShowImageReportDrawer(false);
    setShowThumbnails(false);
    resetThumbnailQueue(0);
    applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
    setUrlInput('');
    resetScanLayers();
    setShowSaveMapModal(false);
    setEditModalNode({ id: '', url: '', title: '', parentId: HOME_PARENT_ID, children: [] });
    setEditModalMode('add');
  };

  const clearLoadedMapView = useCallback(() => {
    resetAutosaveTracking();
    setMapPermissions(null);
    resetScanLayers();
    setHasCreatedShareLink(false);
    setCurrentShareAccess(null);
    setRoot(null);
    setOrphans([]);
    setConnections([]);
    setMapInsights(null);
    setInsightsError('');
    setColors(DEFAULT_COLORS);
    setConnectionColors(DEFAULT_CONNECTION_COLORS);
    setCurrentMap(null);
    setMapName('');
    setSavedMapCommentsByNode({});
    setExpandedStacks({});
    setMapActivity([]);
    setMapVersions([]);
    setDraftVersions([]);
    setDraftLatestVersionId(null);
    setActiveVersionId(null);
    setLatestVersionId(null);
    setShowCommentsPanel(false);
    setShowReportDrawer(false);
    setShowImageReportDrawer(false);
    setShowVersionHistoryDrawer(false);
    setShowShareModal(false);
    setSelectedNodeIds(new Set());
    setSelectionBox(null);
    setThumbnailScopeIds(null);
    setShowImageMenu(false);
    setShowThumbnails(false);
    setUrlInput('');
    applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
  }, [applyTransform, resetAutosaveTracking, resetScanLayers]);

  useEffect(() => {
    clearLoadedMapViewRef.current = clearLoadedMapView;
  }, [clearLoadedMapView]);

  const loadMap = useCallback((map, { skipNavigation = false, silent = false } = {}) => {
    resetAutosaveTracking({
      snapshot: serializeMapAutosaveSnapshot({
        name: map?.name || '',
        root: map?.root,
        orphans: map?.orphans,
        connections: map?.connections,
        colors: map?.colors,
        connectionColors: map?.connectionColors,
        project_id: map?.project_id || null,
      }),
    });
    setMapPermissions(null);
    resetScanLayers();
    setHasCreatedShareLink(false);
    setCurrentShareAccess(null);
    setExpandedStacks({});
    largeMapHomeSceneKeyRef.current = '';
    const mapHasThumbnails = mapHasThumbnailAsset(map.root, map.orphans || []);
    setRoot(map.root);
    setOrphans(normalizeOrphans(map.orphans));
    setConnections(map.connections || []);
    setColors(map.colors || DEFAULT_COLORS);
    setConnectionColors(map.connectionColors || DEFAULT_CONNECTION_COLORS);
    setCurrentMap(map);
    setMapInsights(map.insights || null);
    setInsightsError('');
    if (!skipNavigation) {
      navigateToRoute(createMapRoute(map.id));
    }
    setMapSaveConflict(null);
    setMapName(map.name || '');
    setActiveVersionId(null);
    setShowVersionEditPrompt(false);
    versionBaselineRef.current = null;
    setSelectedNodeIds(new Set());
    setSelectionBox(null);
    setThumbnailScopeIds(mapHasThumbnails ? new Set() : null);
    setShowImageMenu(false);
    setShowImageReportDrawer(false);
    setShowThumbnails(mapHasThumbnails);
    clearCaptureIssues();
    resetThumbnailQueue(0);
    setMapVersions([]);
    setLatestVersionId(null);
    setShowProjectsModal(false);
    setEditingProjectId(null);
    setEditingMapId(null);
    applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
    setUrlInput(map.root?.url || '');
    if (!silent) {
      showToast(`Loaded "${map.name}"`, 'success');
    }
    scheduleResetViewRef.current?.();
  }, [applyTransform, clearCaptureIssues, navigateToRoute, resetAutosaveTracking, resetScanLayers, showToast]);

  const loadLargeMapShell = useCallback((map, { skipNavigation = false, silent = false } = {}) => {
    const rootSummary = map?.rootSummary || {};
    const shellRoot = {
      id: rootSummary.id || `map-${map.id}-root`,
      title: rootSummary.title || map.name || 'Untitled Map',
      url: rootSummary.url || map.url || '',
      children: [],
    };
    resetAutosaveTracking({
      snapshot: serializeMapAutosaveSnapshot({
        name: map?.name || '',
        root: shellRoot,
        orphans: [],
        connections: [],
        colors: map?.colors || DEFAULT_COLORS,
        connectionColors: map?.connectionColors || DEFAULT_CONNECTION_COLORS,
        project_id: map?.project_id || null,
      }),
    });
    setMapPermissions(null);
    resetScanLayers();
    setHasCreatedShareLink(false);
    setCurrentShareAccess(null);
    setExpandedStacks({});
    setRoot(shellRoot);
    setOrphans([]);
    setConnections([]);
    setColors(map.colors || DEFAULT_COLORS);
    setConnectionColors(map.connectionColors || DEFAULT_CONNECTION_COLORS);
    setCurrentMap({
      ...map,
      root: shellRoot,
      orphans: [],
      connections: [],
      largeMapShell: true,
    });
    setMapInsights(null);
    setInsightsError('');
    if (!skipNavigation) {
      navigateToRoute(createMapRoute(map.id));
    }
    setMapSaveConflict(null);
    setMapName(map.name || '');
    setActiveVersionId(null);
    setShowVersionEditPrompt(false);
    versionBaselineRef.current = null;
    setSelectedNodeIds(new Set());
    setSelectionBox(null);
    setThumbnailScopeIds(map.hasThumbnails ? new Set() : null);
    setShowImageMenu(false);
    setShowImageReportDrawer(false);
    setShowThumbnails(!!map.hasThumbnails);
    clearCaptureIssues();
    resetThumbnailQueue(0);
    setMapVersions([]);
    setLatestVersionId(null);
    setShowProjectsModal(false);
    setEditingProjectId(null);
    setEditingMapId(null);
    applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
    setUrlInput(shellRoot.url || '');
    if (!silent) {
      showToast(`Loaded "${map.name}"`, 'success');
    }
  }, [applyTransform, clearCaptureIssues, navigateToRoute, resetAutosaveTracking, resetScanLayers, showToast]);

  const loadSavedMapById = useCallback(async (mapId, options = {}) => {
    const { map: summary } = await api.getMapSummary(mapId);
    if (!summary) {
      const error = new Error('Map not found');
      error.status = 404;
      throw error;
    }
    if (shouldUseLargeMapSurface({ nodeCount: summary.nodeCount, hasSavedMap: true })) {
      loadLargeMapShell(summary, options);
      return summary;
    }
    const { map } = await api.getMap(mapId);
    if (!map) {
      const error = new Error('Map not found');
      error.status = 404;
      throw error;
    }
    loadMap(map, options);
    return map;
  }, [loadLargeMapShell, loadMap]);

  useEffect(() => {
    loadSavedMapByIdRef.current = loadSavedMapById;
  }, [loadSavedMapById]);

  useEffect(() => {
    if (currentRoute?.surface === ROUTE_SURFACES.APP && currentRoute?.section === 'map') return;
    setRouteMapGateState(null);
    setRouteAccessRequestMessage('');
  }, [currentRoute?.section, currentRoute?.surface]);

  useEffect(() => {
    if (currentRoute?.surface === ROUTE_SURFACES.APP && currentRoute?.section === 'invite_accept') return;
    setInviteAcceptState(null);
  }, [currentRoute?.section, currentRoute?.surface]);

  useEffect(() => {
    if (currentRoute?.surface !== ROUTE_SURFACES.APP || !currentRoute?.mapId) return undefined;
    if (currentMap?.id && sameId(currentMap.id, currentRoute.mapId)) return undefined;
    if (authLoading) return undefined;

    if (!isLoggedIn) {
      setRouteMapGateState({
        mapId: currentRoute.mapId,
        loading: false,
        errorStatus: null,
        errorMessage: '',
        requestStatus: 'idle',
        requestError: '',
      });
      openAuthModal();
      return undefined;
    }

    let cancelled = false;
    setRouteMapGateState((previous) => ({
      mapId: currentRoute.mapId,
      loading: true,
      errorStatus: null,
      errorMessage: '',
      requestStatus: previous?.mapId === currentRoute.mapId ? previous.requestStatus || 'idle' : 'idle',
      requestError: '',
    }));

    loadSavedMapById(currentRoute.mapId, { skipNavigation: true, silent: true })
      .then(() => {
        if (cancelled) return;
        setRouteMapGateState(null);
        setRouteAccessRequestMessage('');
      })
      .catch((error) => {
        if (cancelled) return;
        clearLoadedMapView();
        setRouteMapGateState({
          mapId: currentRoute.mapId,
          loading: false,
          errorStatus: error?.status || null,
          errorMessage: error?.message || 'Failed to load map',
          requestStatus: 'idle',
          requestError: '',
        });
        if (error?.status === 404 || error?.status === 403) {
          loadPendingMapInvites({ silent: true });
          return;
        }
        showToast(error.message || 'Failed to load map', 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    clearLoadedMapView,
    currentMap?.id,
    currentRoute?.mapId,
    currentRoute?.surface,
    isLoggedIn,
    loadPendingMapInvites,
    loadSavedMapById,
    openAuthModal,
    showToast,
  ]);

  useEffect(() => {
    if (currentRoute?.surface !== ROUTE_SURFACES.APP || currentRoute?.section !== 'invite_accept' || !currentRoute?.inviteToken) {
      return undefined;
    }
    if (authLoading) return undefined;

    if (!isLoggedIn) {
      setInviteAcceptState({
        token: currentRoute.inviteToken,
        status: 'auth_required',
        error: '',
      });
      openAuthModal();
      return undefined;
    }

    let cancelled = false;
    setInviteAcceptState({
      token: currentRoute.inviteToken,
      status: 'processing',
      error: '',
    });

    api.acceptMapInvite(currentRoute.inviteToken)
      .then(async ({ invite }) => {
        if (cancelled) return;
        await Promise.all([
          loadAuthenticatedWorkspace(),
          loadPendingMapInvites({ silent: true }),
        ]);
        if (cancelled) return;
        showToast(`Invite accepted for ${invite?.mapName || 'shared map'}`, 'success');
        if (invite?.mapId) {
          try {
            await loadSavedMapById(invite.mapId, { silent: true });
          } catch {
            navigateToRoute(createMapRoute(invite.mapId), { replace: true });
          }
          return;
        }
        navigateToRoute(createInviteInboxRoute(), { replace: true });
      })
      .catch((error) => {
        if (cancelled) return;
        setInviteAcceptState({
          token: currentRoute.inviteToken,
          status: 'error',
          error: error?.message || 'Failed to accept invite.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    currentRoute?.inviteToken,
    currentRoute?.section,
    currentRoute?.surface,
    isLoggedIn,
    loadAuthenticatedWorkspace,
    loadPendingMapInvites,
    loadSavedMapById,
    navigateToRoute,
    openAuthModal,
    showToast,
  ]);

  const reloadMapAfterConflict = async () => {
    const mapId = mapSaveConflict?.mapId || currentMap?.id;
    if (!mapId) return;
    try {
      await loadSavedMapById(mapId);
      setMapSaveConflict(null);
      showToast('Loaded latest map changes', 'success');
    } catch (error) {
      showToast(error.message || 'Failed to load latest map', 'error');
    }
  };

  const dismissMapConflict = () => {
    setMapSaveConflict(null);
  };

  const handleLiveResync = async () => {
    const resynced = await resyncLiveDocument();
    if (resynced) {
      showToast('Live editing resynced', 'success');
      return;
    }

    const mapId = currentMap?.id;
    if (!mapId) {
      showToast('Failed to resync live editing', 'error');
      return;
    }

    try {
      const { map } = await api.getMap(mapId);
      if (!map) throw new Error('Map not found');
      loadMap(map, { skipNavigation: true, silent: true });
      resetLiveDocumentToSavedMap({
        mapId: map.id,
        version: 0,
        name: map.name || 'Untitled Map',
        notes: map.notes ?? null,
        root: map.root,
        orphans: map.orphans || [],
        connections: map.connections || [],
        colors: map.colors || DEFAULT_COLORS,
        connectionColors: map.connectionColors || DEFAULT_CONNECTION_COLORS,
        mapUpdatedAt: map.updated_at || null,
        lastOpId: null,
        lastActorId: currentUser?.id || null,
      });
      showToast('Resynced with the latest saved map', 'success');
    } catch (error) {
      showToast(error.message || 'Failed to resync live editing', 'error');
    }
  };

  const handleLoadMapRequest = async (map) => {
    if (hasMap && !currentMap?.id) {
      setPendingLoadMap(map);
      setCreateMapMode(false);
      setDuplicateMapConfig(null);
      setShowProjectsModal(false);
      setShowSaveMapModal(true);
      return;
    }
    if (map?.root) {
      loadMap(map);
      return;
    }
    if (map?.id) {
      try {
        await loadSavedMapById(map.id);
      } catch (error) {
        showToast(error.message || 'Failed to load map', 'error');
      }
    }
  };

  const deleteMap = async (projectId, mapId) => {
    const confirmed = await showConfirm({
      title: 'Delete Map',
      message: 'Delete this map?',
      confirmText: 'Delete',
      danger: true
    });
    if (!confirmed) return;
    try {
      await api.deleteMap(mapId);
      setProjects(prev => prev.map(p => {
        if (p.id !== projectId) return p;
        return { ...p, maps: (p.maps || []).filter(m => m.id !== mapId) };
      }));
      if (editingMapId === mapId) {
        setEditingMapId(null);
      }
      if (currentMap?.id === mapId) {
        setCurrentMap(null);
        navigateToRoute(createAppHomeRoute());
      }
      showToast('Map deleted', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to delete map', 'error');
    }
  };

  const toggleProjectExpanded = (projectId) => {
    setExpandedProjects((prev) => {
      const isOpen = !!prev[projectId];
      return isOpen ? {} : { [projectId]: true };
    });
  };

  // History functions
  const addToHistory = async (url, rootData, pageCount, scanConfig, snapshot = null) => {
    if (!isLoggedIn) return; // Only save history for logged-in users

    const historyOrphans = Array.isArray(snapshot?.orphans) ? snapshot.orphans : orphans;
    const historyConnections = Array.isArray(snapshot?.connections) ? snapshot.connections : connections;
    const historyColors = snapshot?.colors || colors;
    const historyConnectionColors = snapshot?.connectionColors || connectionColors;

    try {
      const { id } = await api.addToHistory({
        url,
        hostname: getHostname(url),
        title: rootData?.title || getHostname(url),
        page_count: pageCount,
        root: rootData,
        orphans: historyOrphans,
        connections: historyConnections,
        colors: historyColors,
        connectionColors: historyConnectionColors,
        scan_options: scanConfig || null,
        scan_depth: null,
        map_id: null,
      });

      // Add to local state
      const historyItem = {
        id,
        url,
        hostname: getHostname(url),
        title: rootData?.title || getHostname(url),
        page_count: pageCount,
        scanned_at: new Date().toISOString(),
        root: rootData,
        orphans: historyOrphans,
        connections: historyConnections,
        colors: historyColors,
        connectionColors: historyConnectionColors,
        scan_options: scanConfig || null,
        scan_depth: null,
        map_id: null,
      };

      setScanHistory(prev => [historyItem, ...prev].slice(0, 50));
      setLastHistoryId(id);
      setLastScanUrl(url);
    } catch (e) {
      console.error('Failed to save to history:', e);
    }
  };

  const loadFromHistory = async () => {
    showToast('History is view-only for now', 'info');
  };

  const runMapInsights = useCallback(async () => {
    if (!root) {
      setInsightsError('Scan a site before running Insights.');
      return;
    }

    setInsightsLoading(true);
    setInsightsError('');
    try {
      const canPersistToHistory = Boolean(
        isLoggedIn
        && lastHistoryId
        && lastScanUrl
        && root?.url
        && normalizeUrlForCompare(root.url) === normalizeUrlForCompare(lastScanUrl)
      );
      const { insights, saved } = await api.analyzeInsights({
        root,
        orphans,
        scanMeta,
        history_id: canPersistToHistory ? lastHistoryId : null,
        map_id: isLoggedIn && currentMap?.id ? currentMap.id : null,
      });
      setMapInsights(insights || null);
      if (saved && currentMap?.id) {
        setCurrentMap((prev) => (
          prev ? { ...prev, insights, insights_generated_at: insights?.updatedAt || new Date().toISOString() } : prev
        ));
        setProjects((prev) => prev.map((project) => ({
          ...project,
          maps: (project.maps || []).map((map) => (
            map.id === currentMap.id
              ? { ...map, insights, insights_generated_at: insights?.updatedAt || new Date().toISOString() }
              : map
          )),
        })));
      }
      if (saved && lastHistoryId) {
        setScanHistory((prev) => prev.map((item) => (
          item.id === lastHistoryId
            ? { ...item, insights, insights_generated_at: insights?.updatedAt || new Date().toISOString() }
            : item
        )));
      }
      showToast(saved ? 'Insights saved' : 'Insights ready', 'success');
    } catch (error) {
      console.error('Run insights failed:', error);
      const message = error.message || 'Failed to run Insights';
      setInsightsError(message);
      showToast(message, 'error');
    } finally {
      setInsightsLoading(false);
    }
  }, [currentMap?.id, isLoggedIn, lastHistoryId, lastScanUrl, orphans, root, scanMeta, showToast]);

  const toggleHistorySelection = (id) => {
    setSelectedHistoryItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllHistory = () => {
    setSelectedHistoryItems(new Set(scanHistory.map(h => h.id)));
  };

  const clearHistorySelection = () => {
    setSelectedHistoryItems(new Set());
  };

  const deleteSelectedHistory = async () => {
    if (selectedHistoryItems.size === 0) return;
    const confirmed = await showConfirm({
      title: 'Delete History',
      message: `Delete ${selectedHistoryItems.size} scan${selectedHistoryItems.size > 1 ? 's' : ''} from history?`,
      confirmText: 'Delete',
      danger: true
    });
    if (!confirmed) return;

    try {
      await api.deleteHistory(Array.from(selectedHistoryItems));
      setScanHistory(prev => prev.filter(h => !selectedHistoryItems.has(h.id)));
      const count = selectedHistoryItems.size;
      setSelectedHistoryItems(new Set());
      showToast(`Deleted ${count} scan${count > 1 ? 's' : ''}`, 'success');
    } catch (e) {
      showToast(e.message || 'Failed to delete history', 'error');
    }
  };

  const startScanTimers = () => {
    setScanElapsed(0);
    setScanMessage(SCAN_MESSAGES[0]);
    let elapsed = 0;
    let msgIndex = 0;

    scanTimerRef.current = setInterval(() => {
      elapsed += 1;
      setScanElapsed(elapsed);
    }, 1000);

    messageTimerRef.current = setInterval(() => {
      msgIndex = (msgIndex + 1) % SCAN_MESSAGES.length;
      setScanMessage(SCAN_MESSAGES[msgIndex]);
    }, 3000);
  };

  const stopScanTimers = () => {
    if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    if (messageTimerRef.current) clearInterval(messageTimerRef.current);
    scanTimerRef.current = null;
    messageTimerRef.current = null;
  };

  const closeScanStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const resetScanUi = ({ clearError = true, clearProgress = true } = {}) => {
    closeScanStream();
    scanJobIdRef.current = null;
    scanJobAccessTokenRef.current = null;
    stopScanTimers();
    setLoading(false);
    setShowCancelConfirm(false);
    setShowStopConfirm(false);
    setIsStoppingScan(false);
    if (clearProgress) {
      setScanProgress({ scanned: 0, queued: 0 });
    }
    if (clearError) {
      setScanErrorMessage('');
    }
  };

  const showScanError = (message) => {
    closeScanStream();
    scanJobIdRef.current = null;
    scanJobAccessTokenRef.current = null;
    stopScanTimers();
    setLoading(false);
    setShowCancelConfirm(false);
    setShowStopConfirm(false);
    setIsStoppingScan(false);
    setScanProgress({ scanned: 0, queued: 0 });
    setScanErrorMessage(message || 'Scan failed');
  };

  const dismissScanError = () => {
    setScanErrorMessage('');
    setScanProgress({ scanned: 0, queued: 0 });
  };

  const requestCancelScan = () => {
    if (isStoppingScan) return;
    setShowStopConfirm(false);
    setShowCancelConfirm(true);
  };

  const requestStopScan = () => {
    if (isStoppingScan) return;
    setShowCancelConfirm(false);
    setShowStopConfirm(true);
  };

  const dismissScanConfirm = () => {
    if (isStoppingScan) return;
    setShowCancelConfirm(false);
    setShowStopConfirm(false);
  };

  const cancelScan = () => {
    const jobId = scanJobIdRef.current;
    const accessToken = scanJobAccessTokenRef.current;
    resetScanUi();
    if (jobId) {
      api.cancelScanJob(jobId, { accessToken }).catch(() => {});
    }
    showToast('Scan cancelled', 'info');
  };

  const stopScan = async () => {
    const jobId = scanJobIdRef.current;
    const accessToken = scanJobAccessTokenRef.current;
    if (!jobId || isStoppingScan) return;

    setIsStoppingScan(true);
    setShowStopConfirm(false);
    setShowCancelConfirm(false);

    try {
      await api.stopScanJob(jobId, { accessToken });
      if (scanJobIdRef.current !== jobId) return;
      showToast('Stopping scan and preparing current results...', 'info');
    } catch (err) {
      if (scanJobIdRef.current !== jobId) return;
      console.error('Scan stop failed:', err);
      setIsStoppingScan(false);
      setShowStopConfirm(true);
      showToast(err.message || 'Failed to stop scan', 'error');
    }
  };

  const scan = async (overrideUrl, preserveName = false) => {
    let urlToScan = urlInput;
    if (typeof overrideUrl === 'string') {
      urlToScan = overrideUrl;
    }
    const url = sanitizeUrl(urlToScan);
    if (!url) {
      showToast('Please enter a valid URL', 'warning');
      return;
    }

    const requestedScanConfig = normalizeScanConfig({
      url,
      options: scanOptions,
    });
    const shouldMergeScanResult = isUnsavedScannedMap
      && scanConfigsHaveOptionChanges(requestedScanConfig, lastCompletedScanConfig);

    setShowCancelConfirm(false);
    setShowStopConfirm(false);
    setIsStoppingScan(false);
    setScanErrorMessage('');
    setMapInsights(null);
    setInsightsError('');
    setLastHistoryId(null);
    setLastScanUrl('');
    setLoading(true);
    setScanProgress({ scanned: 0, queued: 0 });
    startScanTimers();
    trackEvent('scan_started', {
      authenticated_pages: scanOptions.authenticatedPages ? 'true' : 'false',
    });

    const scanConfig = {
      ...scanOptions,
    };
    let jobId;
    let jobAccessToken = null;
    try {
      const jobResponse = await api.createScanJob({
        url,
        options: scanConfig,
      });
      jobId = jobResponse?.jobId;
      jobAccessToken = jobResponse?.jobAccessToken || null;
      if (!jobId) {
        throw new Error('Failed to start scan');
      }
    } catch (err) {
      console.error('Scan job creation failed:', err);
      trackEvent('scan_failed', {
        phase: 'job_create',
        message: err?.message || 'Failed to start scan',
      });
      showScanError(err.message || 'Failed to start scan');
      return;
    }

    scanJobIdRef.current = jobId;
    scanJobAccessTokenRef.current = jobAccessToken;

    const eventSource = new EventSource(
      api.getScanJobStreamUrl(jobId, { accessToken: jobAccessToken }),
      { withCredentials: true }
    );
    eventSourceRef.current = eventSource;
    let streamHandled = false;
    let streamErrorCount = 0;

    const handleCompletedJob = (job) => {
      if (streamHandled) return;

      if (job?.status === 'failed') {
        streamHandled = true;
        trackEvent('scan_failed', {
          phase: 'complete',
          message: job?.error || 'Unknown error',
        });
        showScanError(job?.error || 'Unknown error');
        return;
      }

      if (job?.status === 'canceled') {
        streamHandled = true;
        showToast('Scan cancelled', 'info');
        resetScanUi();
        return;
      }

      const data = job?.result;
      if (!data?.root) {
        console.error('Scan completed without a root node:', data);
        streamHandled = true;
        trackEvent('scan_failed', {
          phase: 'complete',
          message: 'Scan completed but returned no pages',
        });
        showScanError('Scan completed but returned no pages');
        return;
      }

      const isStoppedPartial = data.partial === true && data.partialReason === 'stopped_by_user';
      const isPartialResult = data.partial === true;
      const hostname = (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return '';
        }
      })();

      let merged = { root: data.root, orphans: data.orphans || [] };
      try {
        merged = applyScanArtifacts(data.root, data.orphans || [], data);
      } catch (err) {
        console.error('Scan artifact merge failed:', err);
        showToast('Scan completed with partial data', 'warning');
      }

      if (shouldMergeScanResult && shouldPreserveExistingMapForCollapsedScan({
        result: data,
        nextRoot: merged.root,
        existingRoot: root,
      })) {
        streamHandled = true;
        setScanMeta({
          brokenLinks: data.brokenLinks || [],
          partial: true,
          partialReason: data.partialReason || null,
          scanDiagnostics: data.scanDiagnostics || null,
        });
        trackEvent('scan_completed', {
          hostname,
          page_count: countNodes(root),
          partial: 'true',
          partial_reason: data.partialReason || '',
          preserved_existing_map: 'true',
        });
        showToast(getCollapsedScanMessage(hostname), 'warning');
        resetScanUi();
        return;
      }

      const nodesForCounts = collectAllNodesWithOrphans(merged.root, merged.orphans);
      const forestIndexForCounts = buildForestIndex(merged.root, merged.orphans);
      const isTopLevelOrphanRootMeta = (meta) => meta?.treeType === 'orphan' && meta.parentId === null;
      const authCount = nodesForCounts.filter((node) => !node.isBlocked && !node.isChallengePage && !!node.authRequired).length;
      const duplicateCount = nodesForCounts.filter((node) => node.isDuplicate).length;
      const hasSubdomains = (merged.orphans || []).some((orphan) => !!orphan.subdomainRoot);
      const hasOrphans = (merged.orphans || []).some((orphan) => !orphan.subdomainRoot);
      const hasBroken = nodesForCounts.some((node) => {
        const meta = forestIndexForCounts.nodes.get(node.id);
        if (isTopLevelOrphanRootMeta(meta)) return false;
        return !!node.isBroken || node.orphanType === 'broken';
      });
      const hasInactive = nodesForCounts.some((node) => (
        node.scanStatus !== 'scan_limited' && !node.isError && !node.authRequired && (!!node.isInactive || node.orphanType === 'inactive')
      ));
      const hasErrors = nodesForCounts.some((node) => !!node.isError);
      const seenCrosslinks = new Set();
      const scannedCrosslinks = (data.crosslinks || [])
        .map((link, index) => {
          if (!link?.sourceId || !link?.targetId || link.sourceId === link.targetId) return null;
          const key = [link.sourceId, link.targetId].sort().join('::');
          if (seenCrosslinks.has(key)) return null;
          seenCrosslinks.add(key);
          return {
            id: `scan-crosslink-${link.sourceId}-${link.targetId}-${index}`,
            type: 'crosslink',
            sourceNodeId: link.sourceId,
            targetNodeId: link.targetId,
            autoRoute: true,
            locked: true,
          };
        })
        .filter(Boolean);
      const manualConnections = shouldMergeScanResult
        ? connections.filter((connection) => !(connection.autoRoute || connection.locked || String(connection.id || '').startsWith('scan-crosslink-')))
        : [];
      if (shouldMergeScanResult) {
        merged = mergeRescanResults({
          existingRoot: root,
          existingOrphans: orphans,
          nextRoot: merged.root,
          nextOrphans: merged.orphans,
          manualConnections,
        });
      }
      const nextConnections = shouldMergeScanResult
        ? [...manualConnections, ...scannedCrosslinks]
        : scannedCrosslinks;
      setRoot(merged.root);
      setOrphans(merged.orphans);
      setShowThumbnails(false);
      setThumbnailScopeIds(null);
      resetThumbnailQueue(0);
      setConnections(nextConnections);
      setScanMeta({
        brokenLinks: data.brokenLinks || [],
        partial: isPartialResult,
        partialReason: data.partialReason || null,
        scanDiagnostics: data.scanDiagnostics || null,
      });
      setScanLayerAvailability({
        placementPrimary: true,
        placementSubdomain: hasSubdomains,
        placementOrphan: hasOrphans,
        typePages: false,
        typeFiles: false,
        statusBroken: hasBroken,
        statusError: hasErrors,
        statusInactive: hasInactive,
        statusAuth: authCount > 0,
        statusDuplicate: duplicateCount > 0,
      });
      setScanLayerVisibility({
        placementPrimary: true,
        placementSubdomain: hasSubdomains,
        placementOrphan: hasOrphans,
        typePages: false,
        typeFiles: false,
        statusBroken: hasBroken,
        statusError: hasErrors,
        statusInactive: hasInactive,
        statusAuth: authCount > 0,
        statusDuplicate: duplicateCount > 0,
      });
      setCurrentMap(null);
      navigateToRoute(createAppHomeRoute());
      setDraftVersionFromSnapshot({
        root: merged.root,
        orphans: merged.orphans,
        connections: nextConnections,
        colors: shouldMergeScanResult ? colors : DEFAULT_COLORS,
        connectionColors: shouldMergeScanResult ? connectionColors : DEFAULT_CONNECTION_COLORS,
      }, 'Updated');
      applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
      setLastScanAt(new Date().toISOString());
      setLastCompletedScanConfig(requestedScanConfig);
      // Set map name from site title
      if (!preserveName && !shouldMergeScanResult && data.root?.title) {
        setMapName(data.root.title);
      } else if (!preserveName && !shouldMergeScanResult) {
        // Use domain as fallback
        try {
          const domain = new URL(url).hostname.replace('www.', '');
          setMapName(domain);
        } catch {
          setMapName('Untitled Map');
        }
      }
      const pageCount = countNodes(merged.root);
      addToHistory(url, merged.root, pageCount, scanConfig, {
        orphans: merged.orphans,
        connections: nextConnections,
      });
      trackEvent('scan_completed', {
        hostname,
        page_count: pageCount,
        partial: isPartialResult ? 'true' : 'false',
        partial_reason: data.partialReason || '',
      });
      if (isStoppedPartial) {
        showToast(`Scan stopped. Showing current results${hostname ? ` for ${hostname}` : ''}`, 'warning');
      } else if (data.partialReason === 'scan_collapsed') {
        showToast(`Scan only confirmed the homepage${hostname ? ` for ${hostname}` : ''}`, 'warning');
      } else if (isPartialResult) {
        showToast(`Scan complete with partial data${hostname ? `: ${hostname}` : ''}`, 'warning');
      } else {
        showToast(`Scan complete${hostname ? `: ${hostname}` : ''}`, 'success');
      }
      setTimeout(resetView, 100);

      streamHandled = true;
      resetScanUi();
    };

    const loadCompletedJobWithResult = async (job) => {
      if (job?.status !== 'complete' || job?.result) return job;
      const response = await api.getScanJob(jobId, {
        includeResult: true,
        accessToken: jobAccessToken,
      });
      return response?.job || job;
    };

    eventSource.addEventListener('update', (e) => {
      try {
        const job = JSON.parse(e.data);
        streamErrorCount = 0;
        if (job?.progress) {
          setScanProgress(job.progress);
        }
        if (job?.status === 'stopping') {
          setIsStoppingScan(true);
          setShowCancelConfirm(false);
          setShowStopConfirm(false);
        }
      } catch {
      }
    });

    eventSource.addEventListener('complete', async (e) => {
      let job;
      try {
        job = JSON.parse(e.data);
      } catch (err) {
        console.error('Scan payload parse failed:', err);
        streamHandled = true;
        trackEvent('scan_failed', {
          phase: 'complete',
          message: 'Scan completed but response could not be read',
        });
        showScanError('Scan completed but response could not be read');
        return;
      }

      try {
        handleCompletedJob(await loadCompletedJobWithResult(job));
      } catch (err) {
        console.error('Scan result fetch failed:', err);
        streamHandled = true;
        trackEvent('scan_failed', {
          phase: 'complete',
          message: err?.message || 'Scan completed but results could not be loaded',
        });
        showScanError(err?.message || 'Scan completed but results could not be loaded');
      }
    });

    eventSource.addEventListener('job-error', (e) => {
      let message = 'Connection error';
      try {
        const data = JSON.parse(e.data);
        message = data?.error || message;
      } catch {}
      if (streamHandled) return;
      streamHandled = true;
      trackEvent('scan_failed', {
        phase: 'stream',
        message,
      });
      showScanError(message);
    });

    eventSource.onerror = async () => {
      if (streamHandled) return;

      try {
        const { job } = await api.getScanJob(jobId, {
          includeResult: true,
          accessToken: jobAccessToken,
        });
        if (job?.status === 'complete' || job?.status === 'failed' || job?.status === 'canceled') {
          handleCompletedJob(job);
          return;
        }
        streamErrorCount = 0;
        if (job?.progress) setScanProgress(job.progress);
        if (job?.status === 'running' || job?.status === 'queued' || job?.status === 'stopping') {
          if (job.status === 'stopping') setIsStoppingScan(true);
          return;
        }
      } catch (err) {
        streamErrorCount += 1;
        if (streamErrorCount < 3) return;
        const message = err?.message || 'Connection error';
        streamHandled = true;
        trackEvent('scan_failed', {
          phase: 'stream',
          message,
        });
        showScanError(message);
        return;
      }

      streamHandled = true;
      trackEvent('scan_failed', {
        phase: 'stream',
        message: 'Lost connection while receiving scan progress',
      });
      showScanError('Lost connection while receiving scan progress');
    };
  };

  const onKeyDownUrl = (e) => {
    if (e.key === 'Enter') scan();
  };

  const onPointerDown = (e) => {
    if (!hasMap) return;
    if (e.button !== 0) return;
    const isInsideCard = e.target.closest('[data-node-card="1"]');
    const nodeContainer = e.target.closest('[data-node-id]');
    const isUIControl = e.target.closest('.zoom-controls, .color-key, .color-key-toggle, .layers-panel, .canvas-toolbar, .canvas-map-header, .topbar-collaborator-menu, .image-capture-toast, .minimap-navigator');
    const isInsidePopover = e.target.closest('.comment-popover-container');
    const isInsideConnectionMenu = e.target.closest('.connection-menu');
    const isInsideNodeMenu = e.target.closest('.node-menu');
    const isOnConnection = e.target.closest('.connection-hit, .connection-line, .connection-glow');

    // Close connection menu when clicking outside of it
    if (connectionMenu && !isInsideConnectionMenu) {
      setConnectionMenu(null);
    }

    if (nodeMenu && !isInsideNodeMenu) {
      setNodeMenu(null);
    }

    // Close comment popover when clicking outside of it (but not on cards or UI)
    if (commentingNodeId && !isInsidePopover && !isInsideCard) {
      setCommentingNodeId(null);
      setCommentingNodeSnapshot(null);
    }

    const shiftActive = e.shiftKey || isShiftPressed;
    if (!shiftActive && (isInsideCard || isUIControl || isInsidePopover || isInsideConnectionMenu || isInsideNodeMenu || isOnConnection)) return;
    if (shiftActive && (isUIControl || isInsidePopover || isInsideConnectionMenu || isInsideNodeMenu)) return;

    const canStartSelection = shiftActive && canEdit();
    if (canStartSelection) {
      const start = getWorldPointFromClient(e.clientX, e.clientY);
      const startNodeId = nodeContainer?.getAttribute('data-node-id') || null;
      selectionActiveRef.current = true;
      selectionAdditiveRef.current = shiftActive;
      selectionBaseRef.current = new Set(selectedNodeIds);
      selectionStartNodeRef.current = startNodeId;
      selectionStartedOnNodeRef.current = !!startNodeId;
      selectionStartRef.current = start;
      selectionStartClientRef.current = { x: e.clientX, y: e.clientY };
      suppressNodeClickRef.current = true;
      setSelectionBox(startNodeId ? null : { x: start.x, y: start.y, w: 0, h: 0 });
      setIsPanning(false);
      dragRef.current.dragging = false;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    dragRef.current.dragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.startPanX = panRef.current.x;
    dragRef.current.startPanY = panRef.current.y;
    setIsPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const formatDuration = (ms) => {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const onPointerMove = (e) => {
    updateLastPointerFromEvent(e);
    if (selectionActiveRef.current) {
      if (selectionStartedOnNodeRef.current) return;
      const start = selectionStartRef.current;
      if (!start) return;
      const current = getWorldPointFromClient(e.clientX, e.clientY);
      const rect = {
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        w: Math.abs(current.x - start.x),
        h: Math.abs(current.y - start.y),
      };
      setSelectionBox(rect);

      if (rect.w > 2 || rect.h > 2) {
        const next = new Set(selectionAdditiveRef.current ? selectionBaseRef.current : []);
        const layout = layoutRef.current;
        if (layout?.nodes?.size) {
          layout.nodes.forEach((nodeData) => {
            const nx = nodeData.x;
            const ny = nodeData.y;
            const nw = nodeData.w;
            const nh = nodeData.h;
            const intersects = rect.x <= nx + nw
              && rect.x + rect.w >= nx
              && rect.y <= ny + nh
              && rect.y + rect.h >= ny;
            if (intersects) addNodeAndStackSelection(next, nodeData.node.id);
          });
        }
        setSelectedNodeIds(next);
      }
      return;
    }
    // Handle canvas panning
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newPan = { x: dragRef.current.startPanX + dx, y: dragRef.current.startPanY + dy };
    applyTransform({ scale: scaleRef.current, x: newPan.x, y: newPan.y });
  };

  const onPointerUp = (e) => {
    // Handle canvas pan end
    if (selectionActiveRef.current) {
      const start = selectionStartRef.current;
      const startClient = selectionStartClientRef.current;
      const moved = startClient
        ? Math.hypot(e.clientX - startClient.x, e.clientY - startClient.y)
        : 0;
      if (start) {
        const current = getWorldPointFromClient(e.clientX, e.clientY);
        const rect = {
          x: Math.min(start.x, current.x),
          y: Math.min(start.y, current.y),
          w: Math.abs(current.x - start.x),
          h: Math.abs(current.y - start.y),
        };
        if (!selectionStartedOnNodeRef.current && (rect.w > 2 || rect.h > 2)) {
          const next = new Set(selectionAdditiveRef.current ? selectionBaseRef.current : []);
          const layout = layoutRef.current;
          if (layout?.nodes?.size) {
            layout.nodes.forEach((nodeData) => {
              const nx = nodeData.x;
              const ny = nodeData.y;
              const nw = nodeData.w;
              const nh = nodeData.h;
              const intersects = rect.x <= nx + nw
                && rect.x + rect.w >= nx
                && rect.y <= ny + nh
                && rect.y + rect.h >= ny;
              if (intersects) addNodeAndStackSelection(next, nodeData.node.id);
            });
          }
          setSelectedNodeIds(next);
        } else if (selectionStartNodeRef.current && moved < 3) {
          const nodeId = selectionStartNodeRef.current;
          const targetIds = getNodeStackSelectionIds(nodeId);
          setSelectedNodeIds((prev) => {
            const next = new Set(selectionAdditiveRef.current ? prev : selectionBaseRef.current);
            const allSelected = targetIds.every((id) => next.has(id));
            if (allSelected) {
              targetIds.forEach((id) => next.delete(id));
            } else {
              targetIds.forEach((id) => next.add(id));
            }
            return next;
          });
        } else if (!selectionAdditiveRef.current) {
          setSelectedNodeIds(new Set());
        }
      }
      selectionActiveRef.current = false;
      selectionStartRef.current = null;
      selectionStartClientRef.current = null;
      selectionStartNodeRef.current = null;
      selectionStartedOnNodeRef.current = false;
      setSelectionBox(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      return;
    }

    const moved = Math.hypot(
      e.clientX - dragRef.current.startX,
      e.clientY - dragRef.current.startY
    );
    const wasDragging = dragRef.current.dragging;
    dragRef.current.dragging = false;
    setIsPanning(false);
    if (wasDragging && moved < 3) {
      setSelectedNodeIds(new Set());
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  // WARNING — REGRESSION GUARDRAIL:
  // Do NOT introduce additional zoom math paths.
  // All zoom behavior MUST go through zoomAtClientPoint().
  // Do NOT add % transforms (translate(-50%)) to the scaled element.
  // Violating these rules reintroduces drift/jitter.
  const getZoomBounds = useCallback(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl || !worldBounds) {
      return { min: INTERACTIVE_MIN_SCALE, max: MAX_SCALE };
    }
    const padding = 120;
    const mapWidth = Math.max(1, (worldBounds.maxX - worldBounds.minX) + 200);
    const mapHeight = Math.max(1, (worldBounds.maxY - worldBounds.minY) + 200);
    const availableWidth = Math.max(1, canvasEl.clientWidth - padding);
    const availableHeight = Math.max(1, canvasEl.clientHeight - padding);
    const fitScale = Math.min(availableWidth / mapWidth, availableHeight / mapHeight);
    const min = clamp(fitScale, INTERACTIVE_MIN_SCALE, 0.75);
    const max = clamp(Math.max(2, 1 / min), 2, MAX_SCALE);
    return { min, max };
  }, [worldBounds]);

  const zoomAtClientPoint = useCallback((nextScale, clientX, clientY) => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const { min, max } = getZoomBounds();
    const safeScale = clamp(nextScale, min, max);
    if (!Number.isFinite(safeScale)) return;

    const rect = canvasEl.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    // Read BEFORE mutate — immune to React 18 batching.
    // A setPan updater would read scaleRef.current during render,
    // after it has already been overwritten to nextScale, collapsing the math.
    const oldScale = scaleRef.current;
    const oldPan = panRef.current;

    const worldX = (px - oldPan.x) / oldScale;
    const worldY = (py - oldPan.y) / oldScale;

    const nextPan = {
      x: px - worldX * safeScale,
      y: py - worldY * safeScale,
    };

    applyTransform({ scale: safeScale, x: nextPan.x, y: nextPan.y });
  }, [applyTransform, getZoomBounds]);

  const zoomIn = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const { min, max } = getZoomBounds();
    const next = clamp(scaleRef.current * 1.2, min, max);
    zoomAtClientPoint(next, cx, cy);
  }, [zoomAtClientPoint, getZoomBounds]);

  const zoomOut = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const { min, max } = getZoomBounds();
    const next = clamp(scaleRef.current / 1.2, min, max);
    zoomAtClientPoint(next, cx, cy);
  }, [zoomAtClientPoint, getZoomBounds]);

  const zoomTo = useCallback((nextScale) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    zoomAtClientPoint(nextScale, cx, cy);
  }, [zoomAtClientPoint]);

  const centerHome = useCallback(() => {
    const canvas = canvasRef.current;
    const layout = layoutRef.current;
    if (!canvas || !layout || layout.nodes.size === 0) return;

    const rootId = renderRoot?.id || root?.id;
    let rootNode = rootId ? layout.nodes.get(rootId) : null;
    if (!rootNode) {
      rootNode = Array.from(layout.nodes.values()).find((node) => node.depth === 0) || null;
    }
    if (!rootNode) return;

    const targetX = canvas.clientWidth / 2;
    const targetY = canvas.clientHeight / 2;
    const scale = scaleRef.current;

    const nodeCenterX = rootNode.x + rootNode.w / 2;
    const nodeCenterY = rootNode.y + rootNode.h / 2;

    const nextPan = {
      x: targetX - nodeCenterX * scale,
      y: targetY - nodeCenterY * scale,
    };

    applyTransform({ scale, x: nextPan.x, y: nextPan.y });
  }, [applyTransform, renderRoot, root]);
  centerHomeRef.current = centerHome;

  const resetView = useCallback(() => {
    applyTransform({ scale: 1, x: 0, y: 0 });
    requestAnimationFrame(() => {
      centerHome();
    });
  }, [applyTransform, centerHome]);

  const scheduleResetView = useCallback((attempts = 8) => {
    if (attempts <= 0) return;
    setTimeout(() => {
      if (!layoutRef.current || !canvasRef.current) {
        scheduleResetViewRef.current?.(attempts - 1);
        return;
      }
      if (!layoutRef.current.nodes || layoutRef.current.nodes.size === 0) {
        scheduleResetViewRef.current?.(attempts - 1);
        return;
      }
      centerHomeRef.current?.();
    }, 80);
  }, []);

  useEffect(() => {
    scheduleResetViewRef.current = scheduleResetView;
  }, [scheduleResetView]);

  const fitToScreen = () => {
    if (!canvasRef.current) return;
    const bounds = worldBounds;
    if (!bounds) return;

    const mapWidth = bounds.maxX - bounds.minX;
    const mapHeight = bounds.maxY - bounds.minY;
    if (mapWidth <= 0 || mapHeight <= 0) return;

    const padding = 80;
    const viewportWidth = canvasRef.current.clientWidth;
    const viewportHeight = canvasRef.current.clientHeight;
    const availableWidth = Math.max(0, viewportWidth - padding * 2);
    const availableHeight = Math.max(0, viewportHeight - padding * 2);

    const scaleX = availableWidth / mapWidth;
    const scaleY = availableHeight / mapHeight;
    const newScale = clamp(Math.min(scaleX, scaleY), MIN_SCALE, 1);

    const mapCenterX = (bounds.minX + bounds.maxX) / 2;
    const mapCenterY = (bounds.minY + bounds.maxY) / 2;
    const canvasCenterX = viewportWidth / 2;
    const canvasCenterY = viewportHeight / 2;

    const nextPan = {
      x: canvasCenterX - mapCenterX * newScale,
      y: canvasCenterY - mapCenterY * newScale,
    };

    applyTransform({ scale: newScale, x: nextPan.x, y: nextPan.y });
  };

  // Undo/Redo implementation
  const saveStateForUndo = useCallback((overrideState = null) => {
    console.log('SAVING STATE FOR UNDO');
    const snapshot = overrideState || { root, orphans, connections, colors, connectionColors };
    setUndoStack(prev => [...prev, JSON.stringify(snapshot)]);
    setRedoStack([]); // Clear redo on new action
  }, [colors, connectionColors, connections, orphans, root]);

  const queueLiveDraftWithUndo = useCallback((draft, overrideState = null) => {
    if (!isLiveActive || !currentMap?.id) {
      return { ok: false, error: 'Live editing is not available for this map.' };
    }
    const snapshot = overrideState || { root, orphans, connections, colors, connectionColors };
    const result = submitLiveDraft(draft);
    if (result.ok && !isCollaborativeLiveEditingRestricted) {
      saveStateForUndo(snapshot);
    }
    return result;
  }, [
    colors,
    connectionColors,
    connections,
    currentMap?.id,
    isCollaborativeLiveEditingRestricted,
    isLiveActive,
    orphans,
    root,
    saveStateForUndo,
    submitLiveDraft,
  ]);

  const handleUndo = () => {
    if (isCollaborativeLiveEditingRestricted) {
      warnLiveModeUnsupported(liveUndoRedoDisabledReason);
      return;
    }
    console.log('UNDO CLICKED, stack:', undoStack.length);
    if (undoStack.length === 0) {
      console.log('Nothing to undo');
      return;
    }

    // Save current state to redo stack
    setRedoStack(prev => [...prev, JSON.stringify({ root, orphans, connections, colors, connectionColors })]);

    // Get last state from undo stack
    const lastState = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));

    // Restore it
    const parsed = JSON.parse(lastState);
    if (parsed.root !== undefined) {
      setRoot(parsed.root);
    } else {
      setRoot(parsed);
    }
    if (parsed.orphans !== undefined) {
      setOrphans(parsed.orphans);
    }
    if (parsed.connections !== undefined) {
      setConnections(parsed.connections);
    }
    if (parsed.colors !== undefined) {
      setColors(parsed.colors || DEFAULT_COLORS);
    }
    if (parsed.connectionColors !== undefined) {
      setConnectionColors(parsed.connectionColors || DEFAULT_CONNECTION_COLORS);
    }
    console.log('UNDO COMPLETE');
  };

  const handleRedo = () => {
    if (isCollaborativeLiveEditingRestricted) {
      warnLiveModeUnsupported(liveUndoRedoDisabledReason);
      return;
    }
    console.log('REDO CLICKED, stack:', redoStack.length);
    if (redoStack.length === 0) {
      console.log('Nothing to redo');
      return;
    }

    // Save current state to undo stack
    setUndoStack(prev => [...prev, JSON.stringify({ root, orphans, connections, colors, connectionColors })]);

    // Get last state from redo stack
    const lastState = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));

    // Restore it
    const parsed = JSON.parse(lastState);
    if (parsed.root !== undefined) {
      setRoot(parsed.root);
    } else {
      setRoot(parsed);
    }
    if (parsed.orphans !== undefined) {
      setOrphans(parsed.orphans);
    }
    if (parsed.connections !== undefined) {
      setConnections(parsed.connections);
    }
    if (parsed.colors !== undefined) {
      setColors(parsed.colors || DEFAULT_COLORS);
    }
    if (parsed.connectionColors !== undefined) {
      setConnectionColors(parsed.connectionColors || DEFAULT_CONNECTION_COLORS);
    }
    console.log('REDO COMPLETE');
  };

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  // Keyboard shortcuts for undo/redo and tools
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
      if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const r = canvas.getBoundingClientRect();
        let anchorClientX = r.left + r.width / 2;
        let anchorClientY = r.top + r.height / 2;
        if (lastPointerRef.current) {
          anchorClientX = r.left + lastPointerRef.current.x;
          anchorClientY = r.top + lastPointerRef.current.y;
        }
        const { min, max } = getZoomBounds();
        const next = (e.key === '+' || e.key === '=')
          ? clamp(scaleRef.current * 1.2, min, max)
          : clamp(scaleRef.current / 1.2, min, max);
        e.preventDefault();
        zoomAtClientPoint(next, anchorClientX, anchorClientY);
        return;
      }
      if (e.metaKey || e.ctrlKey) return;

      // Toggle comments panel with "C"
      if (e.key === 'c' || e.key === 'C') {
        setShowCommentsPanel(prev => {
          const next = !prev;
          if (next) {
            setShowReportDrawer(false);
            setShowImageReportDrawer(false);
            setShowProfileDrawer(false);
            setShowSettingsDrawer(false);
            setShowProjectsModal(false);
            setShowHistoryModal(false);
          }
          return next;
        });
      }
      if (e.key === 'r' || e.key === 'R') {
        setShowReportDrawer(prev => {
          const next = !prev;
          if (next) {
            setShowCommentsPanel(false);
            setShowImageReportDrawer(false);
            setShowProfileDrawer(false);
            setShowSettingsDrawer(false);
            setShowVersionHistoryDrawer(false);
            setShowProjectsModal(false);
            setShowHistoryModal(false);
          }
          return next;
        });
      }
      if (e.key === 'h' || e.key === 'H') {
        setShowVersionHistoryDrawer(prev => {
          const next = !prev;
          if (next) {
            setShowCommentsPanel(false);
            setShowReportDrawer(false);
            setShowImageReportDrawer(false);
            setShowProfileDrawer(false);
            setShowSettingsDrawer(false);
            setShowProjectsModal(false);
            setShowHistoryModal(false);
          }
          return next;
        });
      }
      if (e.key === 'p' || e.key === 'P') {
        setShowProjectsModal(prev => {
          const next = !prev;
          if (next) {
            setShowCommentsPanel(false);
            setShowReportDrawer(false);
            setShowImageReportDrawer(false);
            setShowProfileDrawer(false);
            setShowSettingsDrawer(false);
            setShowVersionHistoryDrawer(false);
            setShowHistoryModal(false);
          }
          return next;
        });
      }
      // Select tool with "V"
      if (e.key === 'v' || e.key === 'V') {
        setActiveTool('select');
        setConnectionTool(null);
      }
      // User Flow tool with "F"
      if (e.key === 'f' || e.key === 'F') {
        if (canEdit()) {
          setConnectionTool(connectionTool === 'userflow' ? null : 'userflow');
          setActiveTool('select');
        }
      }
      // Crosslink tool with "L"
      if (e.key === 'l' || e.key === 'L') {
        if (canEdit()) {
          setConnectionTool(connectionTool === 'crosslink' ? null : 'crosslink');
          setActiveTool('select');
        }
      }
      // Escape cancels connection tool and closes menus
      if (e.key === 'Escape') {
        if (connectionTool) {
          setConnectionTool(null);
          setDrawingConnection(null);
        }
        if (connectionMenu) {
          setConnectionMenu(null);
        }
        if (nodeMenu) {
          setNodeMenu(null);
        }
        if (showCommentsPanel) {
          setActiveTool('select');
          setCommentingNodeId(null); // Close popover when switching tools
          setCommentingNodeSnapshot(null);
        }
        if (showReportDrawer) {
          setShowReportDrawer(false);
        }
        if (showImageReportDrawer) {
          setShowImageReportDrawer(false);
        }
        if (showProfileDrawer) {
          setShowProfileDrawer(false);
        }
        if (showSettingsDrawer) {
          setShowSettingsDrawer(false);
        }
        if (showVersionHistoryDrawer) {
          setShowVersionHistoryDrawer(false);
        }
        if (showProjectsModal) {
          setShowProjectsModal(false);
        }
        if (showHistoryModal) {
          setShowHistoryModal(false);
        }
        if (showViewDropdown) {
          setShowViewDropdown(false);
        }
        if (showColorKey) {
          setShowColorKey(false);
        }
        if (showOrientationMenu) {
          setShowOrientationMenu(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, redoStack, root, activeTool, connectionTool, connectionMenu, nodeMenu, showCommentsPanel, showReportDrawer, showImageReportDrawer, showProfileDrawer, showSettingsDrawer, showVersionHistoryDrawer, showProjectsModal, showHistoryModal, showViewDropdown, showColorKey, showOrientationMenu, handleRedo, handleUndo, canEdit, zoomAtClientPoint, getZoomBounds]);

  // Smooth wheel handling for canvas zoom. Press-drag remains the pan control.
  const wheelStateRef = useRef({
    dy: 0,
    clientX: 0,
    clientY: 0,
    raf: null,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheelState = wheelStateRef.current;

    const flushWheel = () => {
      wheelState.raf = null;
      if (!root) return;

      const { dy: wheelDy, clientX, clientY } = wheelState;
      wheelState.dy = 0;

      if (wheelDy === 0) return;
      const delta = -wheelDy;
      const zoomIntensity = 0.002;
      const currentScale = scaleRef.current;
      const { min, max } = getZoomBounds();
      const next = clamp(currentScale * (1 + delta * zoomIntensity), min, max);
      zoomAtClientPoint(next, clientX, clientY);
    };

    const handleWheel = (e) => {
      const wheelTarget = e.target;
      if (
        wheelTarget instanceof Element
        && wheelTarget.closest('.comment-popover, .comments-panel, .mention-dropdown, .canvas-toolbar, .canvas-tool-menu, .zoom-controls, .color-key, .layers-panel, .report-drawer, .account-drawer, .settings-drawer, .minimap-navigator')
      ) {
        return;
      }

      // Always preventDefault — the canvas handles wheel input as zoom.
      // Letting events through causes macOS elastic overscroll, which shifts
      // getBoundingClientRect() and corrupts subsequent zoom anchors.
      e.preventDefault();
      if (!root) return;

      // Normalize deltaMode before accumulating (Firefox mouse wheel uses LINE mode)
      let dy = e.deltaY;
      if (e.deltaMode === 1) { dy *= 20; }       // DOM_DELTA_LINE
      else if (e.deltaMode === 2) { dy *= 400; } // DOM_DELTA_PAGE
      if (dy === 0) return;

      wheelState.dy += dy;
      wheelState.clientX = e.clientX;
      wheelState.clientY = e.clientY;

      if (!wheelState.raf) {
        wheelState.raf = requestAnimationFrame(flushWheel);
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      if (wheelState.raf) {
        cancelAnimationFrame(wheelState.raf);
        wheelState.raf = null;
      }
    };
  }, [root, zoomAtClientPoint, getZoomBounds]);

  const exportJson = () => {
    if (!root) return;
    downloadText('sitemap.json', JSON.stringify({ root, colors, connectionColors }, null, 2));
    showToast('Downloaded JSON');
  };

  const exportAiSiteBrief = () => {
    if (!root) return;

    const hostname = getHostname(root.url) || 'site';
    const generatedAt = new Date().toISOString();
    const rows = buildAiExportRows(root, orphans);
    const mode = root.url ? 'Improve Existing Site' : 'Build New Site';
    const baseFilename = `ai-site-brief-${hostname}`;
    const siteData = buildAiSiteData({
      root,
      orphans,
      connections,
      colors,
      connectionColors,
      rows,
      mode,
      hostname,
      generatedAt,
    });

    const zipBlob = createZipPackageBlob([
      {
        path: 'AI_SITE_BRIEF.md',
        content: buildAiSiteBriefMarkdown({ hostname, mode, rows, generatedAt }),
      },
      {
        path: 'site-map.json',
        content: JSON.stringify(siteData, null, 2),
      },
      {
        path: 'sitemap.xml',
        content: buildAiSiteMapXml(rows),
      },
      {
        path: 'references/README.md',
        content: '# References\n\nAdd brand guidelines, design system files, reference images, copy docs, content matrices, or screenshots here before sharing this package with an AI code tool.\n',
      },
    ]);

    downloadBlob(`${baseFilename}.zip`, zipBlob);
    showToast('Downloaded AI Site Brief package');
  };

  const exportCsv = () => {
    if (!root) return;

    // Flatten tree to array with all node data
    const rows = [];
    const flattenWithNumber = (node, depth = 0, number = '1') => {
      rows.push({
        number,
        depth,
        title: (node.title || '').replace(/"/g, '""'),
        url: node.url || '',
        description: getSeoValue(node, 'description').replace(/"/g, '""'),
        metaKeywords: getSeoValue(node, 'keywords').replace(/"/g, '""'),
        canonicalUrl: getSeoValue(node, 'canonicalUrl'),
        h1: getSeoValue(node, 'h1').replace(/"/g, '""'),
        h2: getSeoValue(node, 'h2').replace(/"/g, '""'),
        robots: getSeoValue(node, 'robots').replace(/"/g, '""'),
        hasChildren: node.children?.length > 0 ? 'Yes' : 'No',
        childCount: node.children?.length || 0,
      });
      (node.children || []).forEach((child, idx) => {
        flattenWithNumber(child, depth + 1, `${number}.${idx + 1}`);
      });
    };

    flattenWithNumber(root, 0, '1');

    // Create CSV content
    const headers = [
      'Page Number',
      'Depth Level',
      'Page Title',
      'URL',
      'Description',
      'Meta Keywords',
      'Canonical URL',
      'H1',
      'H2',
      'Meta Robots',
      'Has Children',
      'Child Count',
    ];
    const csvRows = [
      headers.join(','),
      ...rows.map(row => [
        `"${row.number}"`,
        row.depth,
        `"${row.title}"`,
        `"${row.url}"`,
        `"${row.description}"`,
        `"${row.metaKeywords}"`,
        `"${row.canonicalUrl}"`,
        `"${row.h1}"`,
        `"${row.h2}"`,
        `"${row.robots}"`,
        row.hasChildren,
        row.childCount,
      ].join(','))
    ];

    downloadText('sitemap.csv', csvRows.join('\n'));
    showToast('Downloaded CSV');
  };

  const exportPdf = async () => {
    if (!hasMap || !contentRef.current || !canvasRef.current) return;

    // Save current transform state
    const savedScale = scaleRef.current;
    const savedPan = { ...panRef.current };

    showToast('Generating PDF...', 'info', true);

    try {
      setDisableCanvasCulling(true);
      await waitForNextPaint();
      // Dynamically import dependencies
      const [{ jsPDF }, { toSvg }] = await Promise.all([
        import('jspdf'),
        import('html-to-image'),
      ]);

      // Reset to 1:1 scale for accurate capture
      applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
      await new Promise(r => setTimeout(r, 200));

      // Capture visual map using same approach as PNG export
      const content = contentRef.current;
      const canvas = canvasRef.current;
      const canvasRect = canvas.getBoundingClientRect();
      const cards = content.querySelectorAll('[data-node-card="1"]');

      if (!cards.length) {
        applyTransform({ scale: savedScale, x: savedPan.x, y: savedPan.y });
        showToast('No content to download', 'warning');
        return;
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        minX = Math.min(minX, rect.left - canvasRect.left);
        minY = Math.min(minY, rect.top - canvasRect.top);
        maxX = Math.max(maxX, rect.right - canvasRect.left);
        maxY = Math.max(maxY, rect.bottom - canvasRect.top);
      });

      // Include connector SVGs in bounds
      const svgs = content.querySelectorAll('.connector-svg');
      svgs.forEach(svg => {
        const rect = svg.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          minX = Math.min(minX, rect.left - canvasRect.left);
          minY = Math.min(minY, rect.top - canvasRect.top);
          maxX = Math.max(maxX, rect.right - canvasRect.left);
          maxY = Math.max(maxY, rect.bottom - canvasRect.top);
        }
      });

      const padding = 60;
      const imgWidth = Math.ceil(maxX - minX + padding * 2);
      const imgHeight = Math.ceil(maxY - minY + padding * 2);

      // Position the content so the map is centered with equal padding
      const offsetX = -minX + padding;
      const offsetY = -minY + padding - 80;
      applyTransform({ scale: 1, x: offsetX, y: offsetY }, { skipPanClamp: true });

      // Hide grid dots for export
      content.classList.add('export-mode');

      await new Promise(r => setTimeout(r, 200));

      // Capture as SVG for vector quality
      const svgDataUrl = await toSvg(canvas, {
        cacheBust: true,
        backgroundColor: null,
        width: imgWidth,
        height: imgHeight,
        skipFonts: true,
        style: {
          width: `${imgWidth}px`,
          height: `${imgHeight}px`,
          backgroundColor: 'transparent',
        },
        filter: (node) => {
          if (node.classList?.contains('zoom-controls')) return false;
          if (node.classList?.contains('color-key')) return false;
          if (node.classList?.contains('minimap-navigator')) return false;
          // Exclude cross-origin thumbnail images
          if (node.tagName === 'IMG' && node.classList?.contains('thumb-img')) return false;
          return true;
        },
      });

      // Restore grid dots and transform state
      content.classList.remove('export-mode');
      applyTransform({ scale: savedScale, x: savedPan.x, y: savedPan.y });

      // Determine PDF orientation based on aspect ratio
      const isLandscape = imgWidth > imgHeight;
      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;

      // Convert pixels to mm (96 DPI)
      const pxToMm = 25.4 / 96;
      const imgWidthMm = imgWidth * pxToMm;
      const imgHeightMm = imgHeight * pxToMm;

      // Scale to fit page with margins
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;
      const scaleX = availableWidth / imgWidthMm;
      const scaleY = availableHeight / imgHeightMm;
      const imgScale = Math.min(scaleX, scaleY, 1);

      const finalWidth = imgWidthMm * imgScale;
      const finalHeight = imgHeightMm * imgScale;

      // Center the image
      const xOffset = (pageWidth - finalWidth) / 2;
      const yOffset = (pageHeight - finalHeight) / 2;

      // Add SVG as image (jsPDF supports SVG data URLs)
      pdf.addImage(svgDataUrl, 'SVG', xOffset, yOffset, finalWidth, finalHeight);

      const hostname = getHostname(root.url) || 'download';
      pdf.save(`sitemap-${hostname}.pdf`);
      showToast('PDF downloaded successfully', 'success');
    } catch (e) {
      console.error('PDF export error:', e);
      const errorMsg = e?.message || e?.toString() || 'Unknown error';
      showToast(`PDF download failed: ${errorMsg}`, 'error');
      // Restore grid and transform state on error
      if (contentRef.current) contentRef.current.classList.remove('export-mode');
      applyTransform({ scale: savedScale, x: savedPan.x, y: savedPan.y });
    } finally {
      setDisableCanvasCulling(false);
    }
  };

  const downloadReportPdf = async () => {
    if (!reportEntries.length) {
      showToast('No report data available', 'warning');
      return;
    }

    showToast('Generating report...', 'info', true);

    try {
      const [{ jsPDF }] = await Promise.all([import('jspdf')]);
      const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginX = 40;
      let y = 40;

      pdf.setFontSize(18);
      pdf.text('Scan report', marginX, y);
      y += 22;

      pdf.setFontSize(11);
      pdf.text(`Total pages: ${reportStats.total}`, marginX, y);
      y += 16;

      const statLines = [
        `Orphans: ${reportStats.orphanPages}`,
        `Duplicates: ${reportStats.duplicates}`,
        `Broken links: ${reportStats.brokenLinks}`,
        `Inactive: ${reportStats.inactivePages}`,
        `Errors: ${reportStats.errorPages}`,
        `Missing: ${reportStats.missing}`,
      ];

      statLines.forEach((line) => {
        pdf.text(line, marginX, y);
        y += 14;
      });

      y += 8;
      pdf.setFontSize(10);
      pdf.text('Page', marginX, y);
      pdf.text('Title', marginX + 50, y);
      pdf.text('Issues', marginX + 220, y);
      pdf.text('URL', marginX + 310, y);
      y += 14;

      reportRows.forEach((row) => {
        const issues = row.types
          .map((type) => {
            const option = REPORT_TYPE_OPTIONS.find((opt) => opt.key === type);
            return option ? option.label : type;
          })
          .join(', ');
        const title = row.title || row.url || '';
        const urlLines = pdf.splitTextToSize(row.url || '', 240);
        const seoLines = [
          row.httpErrorLabel ? `HTTP status: ${row.httpErrorLabel}` : '',
          row.isViewableError ? 'Error type: Viewable HTTP error' : '',
          row.description ? `Description: ${row.description}` : '',
          row.metaKeywords ? `Keywords: ${row.metaKeywords}` : '',
          row.canonicalUrl ? `Canonical: ${row.canonicalUrl}` : '',
          row.h1 ? `H1: ${row.h1}` : '',
        ].filter(Boolean).flatMap((line) => pdf.splitTextToSize(line, 240));
        const rowHeight = Math.max(12, (urlLines.length + seoLines.length) * 12);

        if (y + rowHeight > pageHeight - 40) {
          pdf.addPage();
          y = 40;
        }

        pdf.text(row.number || '--', marginX, y);
        pdf.text(title.slice(0, 28), marginX + 50, y);
        pdf.text(issues.slice(0, 40), marginX + 220, y);
        pdf.text(urlLines, marginX + 310, y);
        if (seoLines.length) {
          pdf.text(seoLines, marginX + 310, y + (urlLines.length * 12));
        }
        y += rowHeight + 6;
      });

      pdf.save('scan-report.pdf');
      showToast('Report downloaded', 'success');
    } catch (error) {
      console.error('Report download error:', error);
      showToast('Report download failed', 'error');
    }
  };

  const exportSiteIndex = () => {
    if (!root) return;

    const hostname = getHostname(root.url) || 'sitemap';

    // Build page list
    const rows = [];
    const flattenForDoc = (node, number = '1', depth = 0) => {
      const indent = '    '.repeat(depth);
      rows.push({
        number,
        title: node.title || 'Untitled',
        url: node.url || '',
        indent,
        depth,
      });
      (node.children || []).forEach((child, idx) => {
        flattenForDoc(child, `${number}.${idx + 1}`, depth + 1);
      });
    };
    flattenForDoc(root);

    // Create HTML content that Word/Google Docs/TextEdit can open
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Site Index - ${hostname}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #6366f1; margin-bottom: 5px; }
    .subtitle { color: #64748b; margin-bottom: 30px; }
    .meta { color: #94a3b8; font-size: 12px; margin-bottom: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #f1f5f9; text-align: left; padding: 10px; font-size: 12px; color: #475569; border-bottom: 2px solid #e2e8f0; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .num { color: #94a3b8; font-size: 12px; white-space: nowrap; }
    .title { color: #1e293b; }
    .url { color: #6366f1; font-size: 12px; word-break: break-all; }
    .indent-1 { padding-left: 20px; }
    .indent-2 { padding-left: 40px; }
    .indent-3 { padding-left: 60px; }
    .indent-4 { padding-left: 80px; }
    .indent-5 { padding-left: 100px; }
  </style>
</head>
<body>
  <h1>Site Index</h1>
  <p class="subtitle">${hostname}</p>
  <p class="meta">Root URL: ${root.url}<br>Total Pages: ${totalNodes}<br>Generated: ${new Date().toLocaleString()}</p>

  <table>
    <thead>
      <tr>
        <th style="width: 60px;">#</th>
        <th>Page Title</th>
        <th style="width: 40%;">URL</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(row => `
        <tr>
          <td class="num">${row.number}</td>
          <td class="title indent-${Math.min(row.depth, 5)}">${row.title}</td>
          <td class="url">${row.url}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>
    `.trim();

    // Download as .doc (HTML format is compatible with Word)
    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `site-index-${hostname}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Delay URL revocation to allow download to start
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    showToast('Site Index downloaded', 'success');
  };

  const copyShareLink = async (permission = sharePermission) => {
    if (PERMISSION_GATING_UI_ENABLED && isLoggedIn && currentMap?.id && !canManageShares()) {
      showToast('You do not have permission to create share links for this map.', 'warning');
      return;
    }
    try {
      // Create share via API
      const { share } = await api.createShare({
        map_id: currentMap?.id || null,
        root,
        orphans,
        connections,
        colors,
        connectionColors,
        expires_in_days: 30, // Share links expire in 30 days
      });

      const shareUrl = new URL(
        buildRouteUrl(createShareRoute(share.id, permission, mapOrientation)),
        window.location.origin
      );

      await navigator.clipboard.writeText(shareUrl.toString());
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      setHasCreatedShareLink(true);
      setCurrentShareAccess(permission);

      const permLabel = permission === ACCESS_LEVELS.VIEW ? 'view-only' :
                        permission === ACCESS_LEVELS.COMMENT ? 'can comment' : 'can edit';
      showToast(`Link copied (${permLabel})`, 'success');
    } catch (e) {
      // If not logged in, fall back to localStorage
      if (e.message?.includes('Authentication')) {
        const shareId = `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const shareData = { root, orphans, connections, colors, connectionColors, createdAt: Date.now() };
        localStorage.setItem(shareId, JSON.stringify(shareData));
        const shareUrl = new URL(
          buildRouteUrl(createShareRoute(shareId, permission, mapOrientation)),
          window.location.origin
        );
        await navigator.clipboard.writeText(shareUrl.toString());
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
        setHasCreatedShareLink(true);
        setCurrentShareAccess(permission);

        const permLabel = permission === ACCESS_LEVELS.VIEW ? 'view-only' :
                          permission === ACCESS_LEVELS.COMMENT ? 'can comment' : 'can edit';
        showToast(`Link copied (${permLabel}, temporary)`, 'success');
      } else {
        showToast(e.message || 'Failed to create share link', 'error');
      }
    }
  };

  const sendShareEmail = () => {
    if (!shareEmails.trim()) {
      showToast('Please enter email addresses');
      return;
    }
    const subject = encodeURIComponent('Check out this sitemap');
    const body = encodeURIComponent(`I wanted to share this sitemap with you.\n\nView it here: ${window.location.origin}`);

    // Open mailto in NEW window - don't navigate away from app
    window.open(`mailto:${shareEmails}?subject=${subject}&body=${body}`, '_blank');

    showToast('Email client opened!');
    setShowShareModal(false);
    setShareEmails('');
  };

  const exportPng = async () => {
    if (!hasMap || !contentRef.current || !canvasRef.current) return;

    // Save current transform state
    const savedScale = scaleRef.current;
    const savedPan = { ...panRef.current };

    try {
      showToast('Generating PNG...', 'info', true);
      setDisableCanvasCulling(true);
      await waitForNextPaint();

      // Reset to 1:1 scale for accurate capture
      applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });

      // Wait for React to re-render
      await new Promise(r => setTimeout(r, 200));

      const { toPng } = await import('html-to-image');

      const content = contentRef.current;
      const canvas = canvasRef.current;
      const canvasRect = canvas.getBoundingClientRect();

      // Find bounds of all cards
      const cards = content.querySelectorAll('[data-node-card="1"]');
      if (!cards.length) {
        applyTransform({ scale: savedScale, x: savedPan.x, y: savedPan.y });
        showToast('No content to download', 'warning');
        return;
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        minX = Math.min(minX, rect.left - canvasRect.left);
        minY = Math.min(minY, rect.top - canvasRect.top);
        maxX = Math.max(maxX, rect.right - canvasRect.left);
        maxY = Math.max(maxY, rect.bottom - canvasRect.top);
      });

      // Include connector SVGs in bounds
      const svgs = content.querySelectorAll('.connector-svg');
      svgs.forEach(svg => {
        const rect = svg.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          minX = Math.min(minX, rect.left - canvasRect.left);
          minY = Math.min(minY, rect.top - canvasRect.top);
          maxX = Math.max(maxX, rect.right - canvasRect.left);
          maxY = Math.max(maxY, rect.bottom - canvasRect.top);
        }
      });

      const padding = 60;
      const exportWidth = Math.ceil(maxX - minX + padding * 2);
      const exportHeight = Math.ceil(maxY - minY + padding * 2);

      // Position the content so the map is centered with equal padding on all sides
      const offsetX = -minX + padding;
      const offsetY = -minY + padding - 80; // -80 to account for content top: 80px in CSS
      applyTransform({ scale: 1, x: offsetX, y: offsetY }, { skipPanClamp: true });

      // Hide grid dots for export
      content.style.setProperty('--export-mode', '1');
      content.classList.add('export-mode');

      await new Promise(r => setTimeout(r, 200));

      // Capture the canvas element directly with transparent background
      const dataUrl = await toPng(canvas, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: null, // Transparent background
        width: exportWidth,
        height: exportHeight,
        skipFonts: true,
        style: {
          width: `${exportWidth}px`,
          height: `${exportHeight}px`,
          backgroundColor: 'transparent',
        },
        filter: (node) => {
          // Exclude zoom controls, color key, and grid from export
          if (node.classList?.contains('zoom-controls')) return false;
          if (node.classList?.contains('color-key')) return false;
          if (node.classList?.contains('minimap-navigator')) return false;
          // Exclude cross-origin thumbnail images
          if (node.tagName === 'IMG' && node.classList?.contains('thumb-img')) return false;
          return true;
        },
      });

      // Restore grid dots
      content.classList.remove('export-mode');

      // Download
      const link = document.createElement('a');
      link.download = `sitemap-${getHostname(root.url) || 'download'}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();

      showToast('PNG downloaded successfully', 'success');
    } catch (e) {
      console.error('PNG export error:', e);
      const errorMsg = e?.message || e?.toString() || 'Unknown error';
      showToast(`PNG download failed: ${errorMsg}`, 'error');
      // Restore grid dots on error
      if (contentRef.current) contentRef.current.classList.remove('export-mode');
    } finally {
      // Restore original transform state
      applyTransform({ scale: savedScale, x: savedPan.x, y: savedPan.y });
      setDisableCanvasCulling(false);
    }
  };

  const updateCommentsForNode = (nodeId, updater) => {
    let updated = false;
    const nextOrphans = orphans.map((orphan) => {
      if (!orphan) return orphan;
      const copy = structuredClone(orphan);
      const target = findNodeById(copy, nodeId);
      if (!target) return orphan;
      target.comments = updater(target.comments || []);
      updated = true;
      return copy;
    });

    if (updated) {
      setOrphans(nextOrphans);
      return;
    }

    setRoot((prev) => {
      if (!prev) return prev;
      const copy = structuredClone(prev);
      const target = findNodeById(copy, nodeId);
      if (target) {
        target.comments = updater(target.comments || []);
        return copy;
      }
      return prev;
    });
  };

  // Add a comment to a node
  const addCommentToNode = async (nodeId, commentText, parentCommentId = null) => {
    if (!commentText.trim()) return;

    if (useBackendComments && currentMap?.id) {
      try {
        await api.createMapComment(currentMap.id, {
          nodeId,
          parentCommentId,
          text: commentText.trim(),
        });
        trackEvent('comment_created', {
          map_id: String(currentMap.id),
          reply: parentCommentId ? 'true' : 'false',
          mentions: extractCommentMentions(commentText).length,
        });
        await loadSavedMapComments(currentMap.id);
      } catch (error) {
        console.error('Create map comment error:', error);
        showToast(error.message || 'Failed to add comment', 'error');
      }
      return;
    }

    if (isLiveActive) {
      warnLiveModeUnsupported('Comments are not live-synced yet. Leave live editing before editing comments.');
      return;
    }

    const newComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      text: commentText.trim(),
      author: currentUser?.name || 'Anonymous',
      createdAt: new Date().toISOString(),
      mentions: extractCommentMentions(commentText),
      completed: false,
      completedBy: null,
      completedAt: null,
      replies: [],
    };

    // If this is a reply to an existing comment
    if (parentCommentId) {
      const addReplyToComment = (comments) => {
        return comments.map(c => {
          if (c.id === parentCommentId) {
            return { ...c, replies: [...(c.replies || []), newComment] };
          }
          if (c.replies?.length > 0) {
            return { ...c, replies: addReplyToComment(c.replies) };
          }
          return c;
        });
      };

      saveStateForUndo();
      updateCommentsForNode(nodeId, addReplyToComment);
      return;
    }

    saveStateForUndo();
    updateCommentsForNode(nodeId, (comments) => [...comments, newComment]);
  };

  // Toggle completed state on a comment
  const toggleCommentCompleted = async (nodeId, commentId) => {
    if (useBackendComments && currentMap?.id) {
      const currentComment = findCommentInThread(savedMapCommentsByNode[nodeId] || [], commentId);
      if (!currentComment) return;
      try {
        await api.updateMapComment(currentMap.id, commentId, {
          completed: !currentComment.completed,
        });
        trackEvent(currentComment.completed ? 'comment_reopened' : 'comment_resolved', {
          map_id: String(currentMap.id),
        });
        await loadSavedMapComments(currentMap.id);
      } catch (error) {
        console.error('Toggle map comment error:', error);
        showToast(error.message || 'Failed to update comment', 'error');
      }
      return;
    }

    if (isLiveActive) {
      warnLiveModeUnsupported('Comment state changes are not live-synced yet.');
      return;
    }
    const toggleInComments = (comments) => {
      return comments.map(c => {
        if (c.id === commentId) {
          const nowCompleted = !c.completed;
          return {
            ...c,
            completed: nowCompleted,
            completedBy: nowCompleted ? (currentUser?.name || 'Anonymous') : null,
            completedAt: nowCompleted ? new Date().toISOString() : null,
          };
        }
        if (c.replies?.length > 0) {
          return { ...c, replies: toggleInComments(c.replies) };
        }
        return c;
      });
    };

    saveStateForUndo();
    updateCommentsForNode(nodeId, toggleInComments);
  };

  // Delete a comment from a node
  const deleteComment = async (nodeId, commentId) => {
    if (useBackendComments && currentMap?.id) {
      try {
        await api.deleteMapComment(currentMap.id, commentId);
        await loadSavedMapComments(currentMap.id);
      } catch (error) {
        console.error('Delete map comment error:', error);
        showToast(error.message || 'Failed to delete comment', 'error');
      }
      return;
    }

    if (isLiveActive) {
      warnLiveModeUnsupported('Comment deletion is not live-synced yet.');
      return;
    }
    const deleteFromComments = (comments) => {
      return comments.filter(c => {
        if (c.id === commentId) {
          return false; // Remove this comment and all its replies
        }
        if (c.replies?.length > 0) {
          c.replies = deleteFromComments(c.replies);
        }
        return true;
      });
    };

    saveStateForUndo();
    updateCommentsForNode(nodeId, deleteFromComments);
  };

  const applyAnnotationsInTree = (tree, idSet, updater) => {
    if (!tree) return false;
    let updated = false;
    const stack = [tree];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      if (idSet.has(current.id)) {
        updater(current);
        updated = true;
      }
      if (current.children?.length) {
        current.children.forEach((child) => stack.push(child));
      }
    }
    return updated;
  };

  const applyAnnotationStatus = (nodeIds, status, options = {}) => {
    if (isLiveActive) {
      warnLiveModeUnsupported('Annotation markers are not live-synced yet.');
      return;
    }
    if (!nodeIds || nodeIds.length === 0) return;
    const idSet = new Set(nodeIds);
    const now = new Date().toISOString();
    const { clear = false } = options;

    const updateNode = (node) => {
      const existing = node.annotations || {};
      const nextStatus = status || 'none';
      node.annotations = {
        status: nextStatus,
        tags: clear ? [] : (Array.isArray(existing.tags) ? existing.tags : []),
        note: clear ? '' : (typeof existing.note === 'string' ? existing.note : ''),
        meta: {
          createdAt: existing.meta?.createdAt || now,
          updatedAt: now,
        },
      };
    };

    saveStateForUndo();

    setRoot((prev) => {
      if (!prev) return prev;
      const copy = structuredClone(prev);
      applyAnnotationsInTree(copy, idSet, updateNode);
      return copy;
    });

    setOrphans((prev) => {
      let updated = false;
      const next = prev.map((orphan) => {
        if (!orphan) return orphan;
        const orphanCopy = structuredClone(orphan);
        const changed = applyAnnotationsInTree(orphanCopy, idSet, updateNode);
        if (changed) updated = true;
        return changed ? orphanCopy : orphan;
      });
      return updated ? next : prev;
    });

  };

  // Get node by ID (from tree or orphans)
  const getNodeById = (nodeId) => {
    if (!nodeId) return null;
    const layoutNode = layoutRef.current?.nodes?.get(nodeId);
    if (layoutNode?.node) return layoutNode.node;
    const rootMatch = findNodeById(renderRoot, nodeId);
    if (rootMatch) return rootMatch;
    for (const orphan of visibleOrphans) {
      const match = findNodeById(orphan, nodeId);
      if (match) return match;
    }
    return null;
  };

  const nodeMenuStatus = nodeMenu
    ? (getNodeById(nodeMenu.nodeId)?.annotations?.status || 'none')
    : 'none';

  // Navigate to a node - pan canvas to center the node and optionally zoom
  const navigateToNode = (nodeId) => {
    const layout = layoutRef.current;
    if (!nodeId || !layout || !canvasRef.current) return;
    const nodeData = layout.nodes.get(nodeId);
    if (!nodeData) return;

    // Calculate center of canvas, offset left if comments panel is open
    // Comments panel is 320px wide, so offset by half that (160px)
    const panelOffset = showCommentsPanel ? 160 : 0;
    const canvas = canvasRef.current;
    const canvasCenterX = (canvas.clientWidth / 2) - panelOffset;
    const canvasCenterY = canvas.clientHeight / 2;

    const nodeCenterX = nodeData.x + nodeData.w / 2;
    const nodeCenterY = nodeData.y + nodeData.h / 2;

    const nextScale = scaleRef.current < 0.8 ? 1 : scaleRef.current;
    const nextPan = {
      x: canvasCenterX - nodeCenterX * nextScale,
      y: canvasCenterY - nodeCenterY * nextScale,
    };

    applyTransform({ scale: nextScale, x: nextPan.x, y: nextPan.y });
  };

  // Open comment popover positioned next to a node
  const openCommentPopover = (nodeOrId) => {
    if (!canvasRef.current) return;
    const nodeId = typeof nodeOrId === 'object' ? nodeOrId?.id : nodeOrId;
    if (!nodeId) return;
    markMentionCommentsRead((entry) => sameId(entry.nodeId, nodeId));
    if (useBackendComments && currentMap?.id) {
      loadSavedMapComments(currentMap.id);
    }
    if (typeof nodeOrId === 'object') {
      setCommentingNodeSnapshot(nodeOrId);
    } else {
      const resolvedNode = getNodeById(nodeId);
      setCommentingNodeSnapshot(resolvedNode || null);
    }

    let nodeX = null;
    let nodeY = null;
    let nodeW = LAYOUT.NODE_W;
    let nodeRect = null;
    const nodeElement = contentRef.current?.querySelector(`[data-node-id="${nodeId}"]`);

    if (nodeElement) {
      const nodeWrapper = nodeElement.closest('.sitemap-node-positioned');
      if (nodeWrapper) {
        const wrapperLeft = parseFloat(nodeWrapper.style.left);
        const wrapperTop = parseFloat(nodeWrapper.style.top);
        if (Number.isFinite(wrapperLeft)) nodeX = wrapperLeft;
        if (Number.isFinite(wrapperTop)) nodeY = wrapperTop;
      }
      nodeRect = nodeElement.getBoundingClientRect();
    }

    if (nodeX === null || nodeY === null) {
      const layoutNode = layoutRef.current?.nodes?.get(nodeId);
      if (layoutNode) {
        nodeX = layoutNode.x ?? 0;
        nodeY = layoutNode.y ?? 0;
        nodeW = layoutNode.w ?? LAYOUT.NODE_W;
      }
    }

    if (nodeX === null || nodeY === null) return;
    const popoverWidth = 320;
    const gap = 16;

    // Get the node's screen position to check if popover fits on right
    const canvasRect = canvasRef.current.getBoundingClientRect();

    // Check if there's enough room on the right side of the node (in screen space)
    const rightSpaceAvailable = nodeRect
      ? (canvasRect.right - nodeRect.right)
      : (() => {
        const scaleValue = scaleRef.current || scale || 1;
        const screenRight = canvasRect.left + panRef.current.x + (nodeX + nodeW) * scaleValue;
        return canvasRect.right - screenRight;
      })();
    const needsLeftPosition = rightSpaceAvailable < (popoverWidth + gap);

    // Calculate popover position in canvas coordinates
    const side = needsLeftPosition ? 'left' : 'right';
    const popoverX = side === 'right'
      ? nodeX + nodeW + gap
      : nodeX - popoverWidth - gap;

    setCommentPopoverPos({ x: popoverX, y: nodeY, side });
    setCommentingNodeId(nodeId);
  };

  const handleActivitySelect = async (event) => {
    if (!event) return;

    const versionId = event.payload?.versionId || (event.entityType === 'version' ? event.entityId : null);
    if (versionId && currentMap?.id) {
      let version = mapVersions.find((entry) => sameId(entry.id, versionId));
      if (!version) {
        const reloaded = await loadMapVersions(currentMap.id);
        version = (reloaded || []).find((entry) => sameId(entry.id, versionId));
      }
      if (version) {
        restoreVersion(version);
        return;
      }
    }

    const nodeId = event.payload?.nodeId || (event.entityType === 'node' ? event.entityId : null);
    if (nodeId) {
      focusNodeById(nodeId);
      if (event.eventScope === 'comment') {
        setTimeout(() => openCommentPopover(nodeId), 220);
      }
      return;
    }

    showToast('No linked snapshot is available for this activity item yet.', 'info');
  };

  const openNodeMenu = (nodeId, event) => {
    if (!nodeId || !event) return;
    if (!canEdit()) return;
    if (!contentRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    const interactiveTarget = event.target.closest(
      'button, a, input, textarea, select, .anchor-point, .stack-toggle, .comment-badge, .thumb-fullsize-btn'
    );
    if (interactiveTarget) return;

    if (connectionMenu) {
      setConnectionMenu(null);
    }

    const contentRect = contentRef.current.getBoundingClientRect();
    const scaleValue = scaleRef.current || scale || 1;
    const menuX = (event.clientX - contentRect.left) / scaleValue;
    const menuY = (event.clientY - contentRect.top) / scaleValue;

    const stackTargetIds = getNodeStackSelectionIds(nodeId);
    const hasSelection = stackTargetIds.some((id) => selectedNodeIds?.has(id));
    const targetIds = hasSelection
      ? Array.from(new Set([...Array.from(selectedNodeIds || []), ...stackTargetIds]))
      : stackTargetIds;
    if (!hasSelection) {
      setSelectedNodeIds(new Set(stackTargetIds));
    }

    setNodeMenu({
      nodeId,
      x: menuX,
      y: menuY,
      targetIds,
    });
  };

  const handleNodeClick = (node, event) => {
    if (!node) return;
    if (suppressNodeClickRef.current) {
      suppressNodeClickRef.current = false;
      return;
    }
    const shiftActive = event?.shiftKey || isShiftPressed;
    if (activeTool === 'comments' && !shiftActive) {
      openCommentPopover(node);
      return;
    }
    if (connectionTool && !shiftActive) return;
    if (!event) return;
    const interactiveTarget = event.target.closest(
      'button, a, input, textarea, select, .anchor-point, .stack-toggle, .comment-badge, .thumb-fullsize-btn, .node-status-badge'
    );
    if (interactiveTarget) return;

    if (!canEdit()) return;

    const targetIds = getNodeStackSelectionIds(node.id);
    if (shiftActive) {
      setSelectedNodeIds((prev) => {
        const next = new Set(prev);
        const allSelected = targetIds.every((id) => next.has(id));
        if (allSelected) {
          targetIds.forEach((id) => next.delete(id));
        } else {
          targetIds.forEach((id) => next.add(id));
        }
        return next;
      });
    } else {
      setSelectedNodeIds(new Set(targetIds));
    }
  };

  const openLargeMapNodeMenu = (nodeId, event) => {
    if (!nodeId || !event) return;
    if (!canEdit()) return;
    if (!contentRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    if (connectionMenu) {
      setConnectionMenu(null);
    }

    const contentRect = contentRef.current.getBoundingClientRect();
    const stackTargetIds = getNodeStackSelectionIds(nodeId);
    const hasSelection = stackTargetIds.some((id) => selectedNodeIds?.has(id));
    const targetIds = hasSelection
      ? Array.from(new Set([...Array.from(selectedNodeIds || []), ...stackTargetIds]))
      : stackTargetIds;
    if (!hasSelection) {
      setSelectedNodeIds(new Set(stackTargetIds));
    }

    setNodeMenu({
      nodeId,
      x: event.clientX - contentRect.left,
      y: event.clientY - contentRect.top,
      targetIds,
    });
  };

  const handleLargeMapNodeDoubleClick = (nodeData) => {
    if (!nodeData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const nextScale = scaleRef.current < 0.95 ? 1 : Math.min(1.6, scaleRef.current * 1.2);
    const nextPan = {
      x: canvas.clientWidth / 2 - (nodeData.x + nodeData.w / 2) * nextScale,
      y: canvas.clientHeight / 2 - (nodeData.y + nodeData.h / 2) * nextScale,
    };
    applyTransform({ scale: nextScale, x: nextPan.x, y: nextPan.y });
  };

  const handleLargeMapNodeExpand = async (sceneNode) => {
    if (!sceneNode?.id || !currentMap?.id) return;
    try {
      const response = await api.getMapNode(currentMap.id, sceneNode.id);
      const node = response?.node || sceneNode;
      const directAssetUrl = node.fullScreenshotUrl || node.thumbnailFullUrl || '';
      if (directAssetUrl) {
        viewFullScreenshot(directAssetUrl, true, node.id || sceneNode.id, 'full');
        return;
      }
      const sourceUrl = node.url || sceneNode.url;
      if (sourceUrl) {
        viewFullScreenshot(sourceUrl, false, null, 'full');
      }
    } catch (error) {
      showToast(error.message || 'Failed to load image for this page', 'error');
    }
  };

  const handleLargeMapNodeViewImage = (source, isDirectImage, nodeId, captureType) => {
    if (isDirectImage) {
      viewFullScreenshot(source, true, nodeId, captureType);
      return;
    }
    handleLargeMapNodeExpand({ id: nodeId, url: source });
  };

  // ========== CONNECTION LINE FUNCTIONS ==========

  const SNAP_RADIUS = 30; // Magnetic snap radius in canvas pixels

  // Get anchor position in canvas coordinates
  const getAnchorPosition = useCallback((nodeId, anchor) => {
    const layoutNode = mapLayout?.nodes?.get(nodeId);
    const nodeX = layoutNode?.x ?? null;
    const nodeY = layoutNode?.y ?? null;
    const nodeW = layoutNode?.w ?? LAYOUT.NODE_W;
    const nodeH = layoutNode?.h ?? getNodeH(showThumbnails);

    if (nodeX === null || nodeY === null) {
      const nodeElement = contentRef.current?.querySelector(`[data-node-id="${nodeId}"]`);
      if (!nodeElement) return null;

      const nodeWrapper = nodeElement.closest('.sitemap-node-positioned');
      if (!nodeWrapper) return null;

      const domX = parseFloat(nodeWrapper.style.left) || 0;
      const domY = parseFloat(nodeWrapper.style.top) || 0;

      switch (anchor) {
        case 'top': return { x: domX + nodeW / 2, y: domY };
        case 'right': return { x: domX + nodeW, y: domY + nodeH / 2 };
        case 'bottom': return { x: domX + nodeW / 2, y: domY + nodeH };
        case 'left': return { x: domX, y: domY + nodeH / 2 };
        default: return { x: domX + nodeW / 2, y: domY + nodeH / 2 };
      }
    }

    switch (anchor) {
      case 'top': return { x: nodeX + nodeW / 2, y: nodeY };
      case 'right': return { x: nodeX + nodeW, y: nodeY + nodeH / 2 };
      case 'bottom': return { x: nodeX + nodeW / 2, y: nodeY + nodeH };
      case 'left': return { x: nodeX, y: nodeY + nodeH / 2 };
      default: return { x: nodeX + nodeW / 2, y: nodeY + nodeH / 2 };
    }
  }, [mapLayout, showThumbnails]);

  // Find nearest anchor point within snap radius (for magnetic snapping)
  const findNearestAnchor = (cursorX, cursorY, excludeNodeId, connectionType) => {
    let nearest = null;
    let nearestDist = Infinity;

    // Get all node elements
    const nodeElements = contentRef.current?.querySelectorAll('[data-node-id]') || [];

    nodeElements.forEach(nodeEl => {
      const nodeId = nodeEl.getAttribute('data-node-id');
      if (nodeId === excludeNodeId) return;

      // Check if connection would be valid
      if (!canCreateConnection(connectionType, excludeNodeId, nodeId)) return;

      ['top', 'right', 'bottom', 'left'].forEach(anchor => {
        const pos = getAnchorPosition(nodeId, anchor);
        if (!pos) return;

        const dist = Math.sqrt((cursorX - pos.x) ** 2 + (cursorY - pos.y) ** 2);

        if (dist < SNAP_RADIUS && dist < nearestDist) {
          nearestDist = dist;
          nearest = { nodeId, anchor, x: pos.x, y: pos.y };
        }
      });
    });

    return nearest;
  };

  // Validate if a connection can be created
  const canCreateConnection = (type, sourceNodeId, targetNodeId) => {
    // No self-connections
    if (sourceNodeId === targetNodeId) return false;

    if (type === 'userflow') {
      // Only one line per direction between two nodes
      return !connections.some(c =>
        c.type === 'userflow' &&
        c.sourceNodeId === sourceNodeId &&
        c.targetNodeId === targetNodeId
      );
    }

    if (type === 'crosslink') {
      // Only one crosslink between any two nodes (either direction)
      return !connections.some(c =>
        c.type === 'crosslink' &&
        ((c.sourceNodeId === sourceNodeId && c.targetNodeId === targetNodeId) ||
          (c.sourceNodeId === targetNodeId && c.targetNodeId === sourceNodeId))
      );
    }

    return true;
  };

  // Handle mousedown on an anchor point - start drawing connection
  const handleAnchorMouseDown = (nodeId, anchor, e) => {
    e.preventDefault();
    if (!connectionTool) return;

    const pos = getAnchorPosition(nodeId, anchor);
    if (!pos) return;

    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    setDrawingConnection({
      type: connectionTool,
      sourceNodeId: nodeId,
      sourceAnchor: anchor,
      startX: pos.x,
      startY: pos.y,
      currentX: pos.x,
      currentY: pos.y,
    });
  };

  // Handle mousemove while drawing a connection
  const handleConnectionMouseMove = (e) => {
    if (!drawingConnection || !contentRef.current) return;

    // Convert screen coordinates to canvas coordinates
    const contentRect = contentRef.current.getBoundingClientRect();

    // Calculate position in canvas coordinate space
    const mouseX = (e.clientX - contentRect.left) / scale;
    const mouseY = (e.clientY - contentRect.top) / scale;

    // Check for magnetic snap to nearby anchors
    const snapTarget = findNearestAnchor(
      mouseX,
      mouseY,
      drawingConnection.sourceNodeId,
      drawingConnection.type
    );

    setDrawingConnection(prev => ({
      ...prev,
      currentX: snapTarget ? snapTarget.x : mouseX,
      currentY: snapTarget ? snapTarget.y : mouseY,
      snapTarget, // { nodeId, anchor, x, y } or null
    }));
  };

  // Handle mouseup - finish or cancel drawing
  const handleConnectionMouseUp = (e) => {
    if (!drawingConnection) return;

    // Use snapTarget if available (magnetic snap), otherwise check DOM element
    let targetNodeId = null;
    let targetAnchorType = null;

    if (drawingConnection.snapTarget) {
      // Use the magnetically snapped target
      targetNodeId = drawingConnection.snapTarget.nodeId;
      targetAnchorType = drawingConnection.snapTarget.anchor;
    } else {
      // Fallback: check if mouse is directly over an anchor element
      const targetAnchor = e.target.closest('.anchor-point');
      const targetNodeCard = e.target.closest('[data-node-id]');

      if (targetAnchor && targetNodeCard) {
        targetNodeId = targetNodeCard.getAttribute('data-node-id');
        targetAnchorType = targetAnchor.getAttribute('data-anchor');
      }
    }

    if (targetNodeId && targetAnchorType && canCreateConnection(
      drawingConnection.type,
      drawingConnection.sourceNodeId,
      targetNodeId
    )) {
      // Create the connection
      const newConnection = {
        id: 'conn_' + Math.random().toString(36).slice(2, 9),
        type: drawingConnection.type,
        sourceNodeId: drawingConnection.sourceNodeId,
        sourceAnchor: drawingConnection.sourceAnchor,
        targetNodeId: targetNodeId,
        targetAnchor: targetAnchorType,
        comments: [],
        label: '',
      };

      if (isLiveActive && currentMap?.id) {
        const result = queueLiveDraftWithUndo({
          type: 'link.add',
          payload: {
            linkId: newConnection.id,
            sourceId: newConnection.sourceNodeId,
            targetId: newConnection.targetNodeId,
            link: newConnection,
          },
        });
        if (!result.ok) {
          showToast(result.error || 'Failed to queue connection', 'error');
        } else {
          showToast(`${drawingConnection.type === 'userflow' ? 'User Flow' : 'Crosslink'} queued`, 'success');
        }
      } else {
        saveStateForUndo();
        setConnections(prev => [...prev, newConnection]);
        showToast(`${drawingConnection.type === 'userflow' ? 'User Flow' : 'Crosslink'} created`, 'success');
      }
    }

    // Re-enable text selection
    document.body.style.userSelect = '';
    setDrawingConnection(null);
  };

  // Delete a connection
  const deleteConnection = (connectionId) => {
    if (isLiveActive && currentMap?.id) {
      const result = queueLiveDraftWithUndo({
        type: 'link.delete',
        payload: { linkId: connectionId },
      });
      if (!result.ok) {
        showToast(result.error || 'Failed to queue connection deletion', 'error');
        return;
      }
      setConnectionMenu(null);
      showToast('Connection deletion queued', 'success');
      return;
    }
    saveStateForUndo();
    setConnections(prev => prev.filter(c => c.id !== connectionId));
    setConnectionMenu(null);
    showToast('Connection deleted', 'success');
  };

  // Handle click on a connection line
  const handleConnectionClick = (e, conn) => {
    e.stopPropagation();
    if (!contentRef.current) return;

    // Convert screen coordinates to canvas coordinates
    const contentRect = contentRef.current.getBoundingClientRect();
    const menuX = (e.clientX - contentRect.left) / scale;
    const menuY = (e.clientY - contentRect.top) / scale;

    setConnectionMenu({
      connectionId: conn.id,
      x: menuX,
      y: menuY,
    });
  };

  // Start dragging a connection endpoint to reconnect
  const handleEndpointDragMoveDoc = useRef(null);
  const handleEndpointDragEndDoc = useRef(null);

  const handleEndpointDragStart = (e, conn, endpoint) => {
    e.preventDefault();
    e.stopPropagation();
    if (!contentRef.current) return;

    // Set styles immediately
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    document.body.style.cursor = 'grabbing';

    const contentRect = contentRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - contentRect.left) / scale;
    const mouseY = (e.clientY - contentRect.top) / scale;

    // Get the fixed end's position (the one NOT being dragged)
    const fixedNodeId = endpoint === 'source' ? conn.targetNodeId : conn.sourceNodeId;
    const fixedAnchor = endpoint === 'source' ? conn.targetAnchor : conn.sourceAnchor;
    const fixedPos = getAnchorPosition(fixedNodeId, fixedAnchor);

    if (!fixedPos) {
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      document.body.style.cursor = '';
      return;
    }

    const newDraggingState = {
      connectionId: conn.id,
      endpoint,
      type: conn.type,
      fixedNodeId,
      fixedAnchor,
      fixedX: fixedPos.x,
      fixedY: fixedPos.y,
      currentX: mouseX,
      currentY: mouseY,
      snapTarget: null,
    };

    // Create handlers that close over the initial state
    handleEndpointDragMoveDoc.current = (moveE) => {
      if (!contentRef.current) return;
      const rect = contentRef.current.getBoundingClientRect();
      const mx = (moveE.clientX - rect.left) / scale;
      const my = (moveE.clientY - rect.top) / scale;

      const snap = findNearestAnchor(mx, my, fixedNodeId, conn.type);

      setDraggingEndpoint(prev => prev ? {
        ...prev,
        currentX: snap ? snap.x : mx,
        currentY: snap ? snap.y : my,
        snapTarget: snap,
      } : null);
    };

    handleEndpointDragEndDoc.current = () => {
      document.removeEventListener('mousemove', handleEndpointDragMoveDoc.current);
      document.removeEventListener('mouseup', handleEndpointDragEndDoc.current);

      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      document.body.style.cursor = '';

      setDraggingEndpoint(prev => {
        if (!prev) return null;

        const { connectionId: connId, endpoint: ep, snapTarget: snap } = prev;

        if (snap) {
          if (isLiveActive && currentMap?.id) {
            const existingConnection = connections.find((connection) => connection.id === connId);
            const result = queueLiveDraftWithUndo({
              type: 'link.update',
              payload: {
                linkId: connId,
                changes: ep === 'source'
                  ? {
                    sourceNodeId: snap.nodeId,
                    sourceAnchor: snap.anchor,
                  }
                  : {
                    targetNodeId: snap.nodeId,
                    targetAnchor: snap.anchor,
                  },
              },
            });
            if (!result.ok) {
              showToast(result.error || 'Failed to queue connection update', 'error');
            } else if (existingConnection) {
              showToast('Connection update queued', 'success');
            }
          } else {
            saveStateForUndo();
            setConnections(conns => conns.map(c => {
              if (c.id !== connId) return c;
              if (ep === 'source') {
                return { ...c, sourceNodeId: snap.nodeId, sourceAnchor: snap.anchor };
              } else {
                return { ...c, targetNodeId: snap.nodeId, targetAnchor: snap.anchor };
              }
            }));
            showToast('Connection updated', 'success');
          }
        } else {
          if (isLiveActive && currentMap?.id) {
            const result = queueLiveDraftWithUndo({
              type: 'link.delete',
              payload: { linkId: connId },
            });
            if (!result.ok) {
              showToast(result.error || 'Failed to queue connection deletion', 'error');
            } else {
              showToast('Connection deletion queued', 'success');
            }
          } else {
            saveStateForUndo();
            setConnections(conns => conns.filter(c => c.id !== connId));
            showToast('Connection deleted', 'success');
          }
        }

        return null;
      });
    };

    // Attach listeners BEFORE setting state
    document.addEventListener('mousemove', handleEndpointDragMoveDoc.current);
    document.addEventListener('mouseup', handleEndpointDragEndDoc.current);

    setDraggingEndpoint(newDraggingState);
  };

  // Keep these for the content div fallback
  const handleEndpointDragMove = (e) => {
    if (!draggingEndpoint || !contentRef.current) return;

    const contentRect = contentRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - contentRect.left) / scale;
    const mouseY = (e.clientY - contentRect.top) / scale;

    const snapTarget = findNearestAnchor(
      mouseX,
      mouseY,
      draggingEndpoint.fixedNodeId,
      draggingEndpoint.type
    );

    setDraggingEndpoint(prev => ({
      ...prev,
      currentX: snapTarget ? snapTarget.x : mouseX,
      currentY: snapTarget ? snapTarget.y : mouseY,
      snapTarget,
    }));
  };

  const handleEndpointDragEnd = () => {
    if (!draggingEndpoint) return;

    const { connectionId, endpoint, snapTarget } = draggingEndpoint;

    if (snapTarget) {
      if (isLiveActive && currentMap?.id) {
        const result = queueLiveDraftWithUndo({
          type: 'link.update',
          payload: {
            linkId: connectionId,
            changes: endpoint === 'source'
              ? {
                sourceNodeId: snapTarget.nodeId,
                sourceAnchor: snapTarget.anchor,
              }
              : {
                targetNodeId: snapTarget.nodeId,
                targetAnchor: snapTarget.anchor,
              },
          },
        });
        if (!result.ok) {
          showToast(result.error || 'Failed to queue connection update', 'error');
        } else {
          showToast('Connection update queued', 'success');
        }
      } else {
        saveStateForUndo();
        setConnections(prev => prev.map(conn => {
          if (conn.id !== connectionId) return conn;

          if (endpoint === 'source') {
            return {
              ...conn,
              sourceNodeId: snapTarget.nodeId,
              sourceAnchor: snapTarget.anchor,
            };
          } else {
            return {
              ...conn,
              targetNodeId: snapTarget.nodeId,
              targetAnchor: snapTarget.anchor,
            };
          }
        }));
        showToast('Connection updated', 'success');
      }
    } else {
      if (isLiveActive && currentMap?.id) {
        const result = queueLiveDraftWithUndo({
          type: 'link.delete',
          payload: { linkId: connectionId },
        });
        if (!result.ok) {
          showToast(result.error || 'Failed to queue connection deletion', 'error');
        } else {
          showToast('Connection deletion queued', 'success');
        }
      } else {
        saveStateForUndo();
        setConnections(prev => prev.filter(c => c.id !== connectionId));
        showToast('Connection deleted', 'success');
      }
    }

    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    document.body.style.cursor = '';
    setDraggingEndpoint(null);
  };

  const isNearEndpoint = (clickX, clickY, conn, threshold = 32) => {
    const sourcePos = getAnchorPosition(conn.sourceNodeId, conn.sourceAnchor);
    const targetPos = getAnchorPosition(conn.targetNodeId, conn.targetAnchor);
    if (!sourcePos || !targetPos) return null;

    const distToSource = Math.sqrt(
      Math.pow(clickX - sourcePos.x, 2) + Math.pow(clickY - sourcePos.y, 2)
    );
    const distToTarget = Math.sqrt(
      Math.pow(clickX - targetPos.x, 2) + Math.pow(clickY - targetPos.y, 2)
    );

    if (distToSource <= threshold) return 'source';
    if (distToTarget <= threshold) return 'target';
    return null;
  };

  const getConnectionsAtAnchor = (nodeId, anchor, asSource) => {
    return connections.filter(conn =>
      asSource
        ? (conn.sourceNodeId === nodeId && conn.sourceAnchor === anchor)
        : (conn.targetNodeId === nodeId && conn.targetAnchor === anchor)
    );
  };

  const getAnchorSpacing = useCallback((count, anchor) => {
    if (count <= 1) return 0;
    const axisLength = (anchor === 'top' || anchor === 'bottom')
      ? (LAYOUT.NODE_W - 24)
      : (getNodeH(showThumbnails) - 24);
    const computed = axisLength / Math.max(count - 1, 1);
    const maxSpacing = count > 12 ? 12 : 16;
    const minSpacing = count > 12 ? 2 : 6;
    return Math.max(minSpacing, Math.min(maxSpacing, computed));
  }, [showThumbnails]);

  const getAnchorOffset = (conn, nodeId, anchor, isSource) => {
    const shared = getConnectionsAtAnchor(nodeId, anchor, isSource);
    if (shared.length <= 1) return { x: 0, y: 0 };

    const index = shared.findIndex(c => c.id === conn.id);
    const spacing = getAnchorSpacing(shared.length, anchor);
    const offset = (index - (shared.length - 1) / 2) * spacing;

    return (anchor === 'top' || anchor === 'bottom')
      ? { x: offset, y: 0 }
      : { x: 0, y: offset };
  };

  // Generate curved SVG path for a connection
  const generateConnectionPath = (conn) => {
    const baseStart = getAnchorPosition(conn.sourceNodeId, conn.sourceAnchor);
    const baseEnd = getAnchorPosition(conn.targetNodeId, conn.targetAnchor);

    if (!baseStart || !baseEnd) return '';

    const srcOffset = getAnchorOffset(conn, conn.sourceNodeId, conn.sourceAnchor, true);
    const tgtOffset = getAnchorOffset(conn, conn.targetNodeId, conn.targetAnchor, false);

    const startPos = { x: baseStart.x + srcOffset.x, y: baseStart.y + srcOffset.y };
    const endPos = { x: baseEnd.x + tgtOffset.x, y: baseEnd.y + tgtOffset.y };

    // Calculate control points for smooth bezier curve
    const dx = Math.abs(endPos.x - startPos.x);
    const dy = Math.abs(endPos.y - startPos.y);
    const offset = Math.min(Math.max(dx, dy) * 0.5, 100);

    let ctrl1 = { ...startPos };
    let ctrl2 = { ...endPos };

    // Offset control points based on anchor direction
    switch (conn.sourceAnchor) {
      case 'top': ctrl1.y -= offset; break;
      case 'right': ctrl1.x += offset; break;
      case 'bottom': ctrl1.y += offset; break;
      case 'left': ctrl1.x -= offset; break;
      default: break;
    }
    switch (conn.targetAnchor) {
      case 'top': ctrl2.y -= offset; break;
      case 'right': ctrl2.x += offset; break;
      case 'bottom': ctrl2.y += offset; break;
      case 'left': ctrl2.x -= offset; break;
      default: break;
    }

    return `M ${startPos.x} ${startPos.y} C ${ctrl1.x} ${ctrl1.y}, ${ctrl2.x} ${ctrl2.y}, ${endPos.x} ${endPos.y}`;
  };

  const getBestAnchorPair = useCallback((sourceId, targetId) => {
    const anchors = ['top', 'right', 'bottom', 'left'];
    let best = null;

    anchors.forEach((sourceAnchor) => {
      const start = getAnchorPosition(sourceId, sourceAnchor);
      if (!start) return;
      anchors.forEach((targetAnchor) => {
        const end = getAnchorPosition(targetId, targetAnchor);
        if (!end) return;
        const dist = (start.x - end.x) ** 2 + (start.y - end.y) ** 2;
        if (!best || dist < best.dist) {
          best = { sourceAnchor, targetAnchor, dist };
        }
      });
    });

    if (!best) return null;
    return { sourceAnchor: best.sourceAnchor, targetAnchor: best.targetAnchor };
  }, [getAnchorPosition]);

  // ========== END CONNECTION LINE FUNCTIONS ==========

  const brokenAnchorPairs = useMemo(() => {
    const map = new Map();
    brokenConnections.forEach((conn) => {
      const best = getBestAnchorPair(conn.sourceId, conn.targetId);
      if (best) map.set(conn.id, best);
    });
    return map;
  }, [brokenConnections, getBestAnchorPair]);

  const getBrokenLinkOffset = useCallback((connId, nodeId, anchor, isSource) => {
    const shared = brokenConnections.filter((conn) => {
      const anchors = brokenAnchorPairs.get(conn.id);
      if (!anchors) return false;
      if (isSource) {
        return conn.sourceId === nodeId && anchors.sourceAnchor === anchor;
      }
      return conn.targetId === nodeId && anchors.targetAnchor === anchor;
    });
    if (shared.length <= 1) return { x: 0, y: 0 };
    const index = shared.findIndex((conn) => conn.id === connId);
    if (index < 0) return { x: 0, y: 0 };
    const spacing = getAnchorSpacing(shared.length, anchor);
    const offset = (index - (shared.length - 1) / 2) * spacing;
    return (anchor === 'top' || anchor === 'bottom')
      ? { x: offset, y: 0 }
      : { x: 0, y: offset };
  }, [brokenConnections, brokenAnchorPairs, getAnchorSpacing]);

  const getBrokenLinkPathForConnection = useCallback((conn) => {
    const anchors = brokenAnchorPairs.get(conn.id);
    if (!anchors) return '';
    const start = getAnchorPosition(conn.sourceId, anchors.sourceAnchor);
    const end = getAnchorPosition(conn.targetId, anchors.targetAnchor);
    if (!start || !end) return '';

    const srcOffset = getBrokenLinkOffset(conn.id, conn.sourceId, anchors.sourceAnchor, true);
    const tgtOffset = getBrokenLinkOffset(conn.id, conn.targetId, anchors.targetAnchor, false);
    const startPos = { x: start.x + srcOffset.x, y: start.y + srcOffset.y };
    const endPos = { x: end.x + tgtOffset.x, y: end.y + tgtOffset.y };

    const dx = Math.abs(endPos.x - startPos.x);
    const dy = Math.abs(endPos.y - startPos.y);
    const curveOffset = Math.min(Math.max(dx, dy) * 0.5, 120);

    const ctrlOffset = { x: 8, y: -8 };
    let ctrl1 = { x: startPos.x + ctrlOffset.x, y: startPos.y + ctrlOffset.y };
    let ctrl2 = { x: endPos.x + ctrlOffset.x, y: endPos.y + ctrlOffset.y };

    switch (anchors.sourceAnchor) {
      case 'top': ctrl1.y -= curveOffset; break;
      case 'right': ctrl1.x += curveOffset; break;
      case 'bottom': ctrl1.y += curveOffset; break;
      case 'left': ctrl1.x -= curveOffset; break;
      default: break;
    }
    switch (anchors.targetAnchor) {
      case 'top': ctrl2.y -= curveOffset; break;
      case 'right': ctrl2.x += curveOffset; break;
      case 'bottom': ctrl2.y += curveOffset; break;
      case 'left': ctrl2.x -= curveOffset; break;
      default: break;
    }

    return `M ${startPos.x} ${startPos.y} C ${ctrl1.x} ${ctrl1.y}, ${ctrl2.x} ${ctrl2.y}, ${endPos.x} ${endPos.y}`;
  }, [brokenAnchorPairs, getAnchorPosition, getBrokenLinkOffset]);

  useEffect(() => {
    if (!mapLayout || isLiveActive) return;
    setConnections((prev) => {
      let changed = false;
      const next = prev.map((conn) => {
        if (conn.type !== 'crosslink' || !conn.autoRoute) return conn;
        const best = getBestAnchorPair(conn.sourceNodeId, conn.targetNodeId);
        if (!best) return conn;
        if (conn.sourceAnchor === best.sourceAnchor && conn.targetAnchor === best.targetAnchor) {
          return conn;
        }
        changed = true;
        return { ...conn, sourceAnchor: best.sourceAnchor, targetAnchor: best.targetAnchor };
      });
      return changed ? next : prev;
    });
  }, [mapLayout, showThumbnails, getBestAnchorPair, isLiveActive]);

  // Opens delete confirmation modal
  const requestDeleteNode = (id) => {
    if (!root) return;
    if (root.id === id) return; // Can't delete root
    // Check tree first
    const nodeToDelete = findNodeById(root, id);
    if (nodeToDelete) {
      setDeleteConfirmNode(nodeToDelete);
      return;
    }
    // Check orphans
    const orphanToDelete = orphans.find(o => findNodeById(o, id));
    if (orphanToDelete) {
      setDeleteConfirmNode(findNodeById(orphanToDelete, id));
    }
  };

  // Actually deletes the node (called after confirmation)
  const confirmDeleteNode = () => {
    if (!deleteConfirmNode) return;
    const id = deleteConfirmNode.id;

    if (isLiveActive && currentMap?.id) {
      const result = queueLiveDraftWithUndo({
        type: 'node.delete',
        payload: { nodeId: id },
      });
      if (!result.ok) {
        showToast(result.error || 'Failed to queue page deletion', 'error');
        return;
      }
      setDeleteConfirmNode(null);
      showToast('Page deletion queued', 'success');
      return;
    }

    // Check if it's an orphan
    if (orphans.some(o => findNodeById(o, id))) {
      saveStateForUndo();
      setOrphans((prev) => {
        const next = structuredClone(prev);
        const topLevelIndex = next.findIndex((orphan) => orphan.id === id);
        if (topLevelIndex !== -1) {
          next.splice(topLevelIndex, 1);
          return next;
        }
        for (const orphan of next) {
          if (removeNodeFromTreeById(orphan, id)) return next;
        }
        return prev;
      });
      setDeleteConfirmNode(null);
      return;
    }

    if (!root) return;

    const remove = (node) => {
      if (!node.children) return;
      node.children = node.children.filter((c) => c.id !== id);
      node.children.forEach(remove);
    };

    saveStateForUndo();
    setRoot((prev) => {
      const copy = structuredClone(prev);
      remove(copy);
      return copy;
    });
    setDeleteConfirmNode(null);
  };

  const findOrphanTreeIndex = (nodeId, orphanList = orphans) => (
    orphanList.findIndex((orphan) => findNodeById(orphan, nodeId))
  );

  const findOrphanTreeRoot = (nodeId, orphanList = orphans) => {
    const idx = findOrphanTreeIndex(nodeId, orphanList);
    return idx >= 0 ? orphanList[idx] : null;
  };

  const findParentInOrphans = (nodeId, orphanList = orphans) => {
    for (const orphan of orphanList) {
      const parent = findParent(orphan, nodeId);
      if (parent) return parent;
    }
    return null;
  };

  const findNodeInOrphans = (nodeId, orphanList = orphans) => {
    if (!nodeId) return null;
    for (const orphan of orphanList) {
      const found = findNodeById(orphan, nodeId);
      if (found) return found;
    }
    return null;
  };

  const openEditModal = (node) => {
    const orphanRoot = findOrphanTreeRoot(node.id);
    if (orphanRoot) {
      const orphanParent = findParent(orphanRoot, node.id);
      const rootSelection = orphanParent?.id
        || (orphanRoot.subdomainRoot ? SUBDOMAIN_PARENT_ID : ORPHAN_PARENT_ID);
      setEditModalNode({
        ...node,
        parentId: rootSelection,
      });
      setEditModalMode('edit');
      return;
    }
    // Find the current parent of this node in tree
    const parent = findParent(root, node.id);
    setEditModalNode({
      ...node,
      parentId: parent?.id || '',
    });
    setEditModalMode('edit');
  };

  const duplicateNode = (node) => {
    const orphanRoot = findOrphanTreeRoot(node.id);
    if (orphanRoot) {
      const orphanParent = findParent(orphanRoot, node.id);
      const rootSelection = orphanParent?.id
        || (orphanRoot.subdomainRoot ? SUBDOMAIN_PARENT_ID : ORPHAN_PARENT_ID);
      setEditModalNode({
        ...node,
        id: undefined,
        title: `${node.title} (Copy)`,
        parentId: rootSelection,
      });
      setEditModalMode('duplicate');
      return;
    }
    // Find the current parent of this node in tree
    const parent = findParent(root, node.id);
    setEditModalNode({
      ...node,
      id: undefined, // Will get a new ID
      title: `${node.title} (Copy)`,
      parentId: parent?.id || '',
    });
    setEditModalMode('duplicate');
  };

  const buildAnnotations = (incoming, existing = null) => {
    const now = new Date().toISOString();
    if (!incoming && !existing) return null;
    const status = incoming?.status ?? existing?.status ?? 'none';
    const tags = Array.isArray(incoming?.tags) ? incoming.tags : (existing?.tags || []);
    const note = typeof incoming?.note === 'string' ? incoming.note : (existing?.note || '');
    const meta = {
      createdAt: existing?.meta?.createdAt || incoming?.meta?.createdAt || now,
      updatedAt: now,
    };
    return { status, tags, note, meta };
  };

  const maybeMarkNodeMoved = (node) => {
    if (!shouldAutoMarkMoved) return;
    if (!hasAssignedUrl(node)) return;
    const currentStatus = node?.annotations?.status || 'none';
    if (currentStatus === 'moved' || currentStatus === 'deleted' || currentStatus === 'to_delete') return;
    node.annotations = buildAnnotations({ status: 'moved' }, node.annotations);
  };

  const buildMoveRootChanges = (node) => {
    if (!shouldAutoMarkMoved) return null;
    if (!hasAssignedUrl(node)) return null;
    const currentStatus = node?.annotations?.status || 'none';
    if (currentStatus === 'moved' || currentStatus === 'deleted' || currentStatus === 'to_delete') return null;
    return {
      annotations: buildAnnotations({ status: 'moved' }, node.annotations),
    };
  };

  const uploadNodeImageAsset = useCallback(async ({ nodeId, imageDataUrl }) => {
    if (!currentMap?.id) {
      throw new Error('Save this map before uploading image files.');
    }
    return api.uploadMapNodeAsset(currentMap.id, { nodeId, imageDataUrl });
  }, [currentMap?.id]);

  const saveNodeChanges = (updatedNode) => {
    // Helper to find parent in a tree
    const findParentInTree = (tree, nodeId, parent = null) => {
      if (!tree) return null;
      if (tree.id === nodeId) return parent;
      for (const child of tree.children || []) {
        const found = findParentInTree(child, nodeId, tree);
        if (found) return found;
      }
      return null;
    };

    // Helper to remove node from its current parent
    const removeFromParent = (tree, nodeId) => {
      if (!tree.children) return;
      const idx = tree.children.findIndex(c => c.id === nodeId);
      if (idx !== -1) {
        tree.children.splice(idx, 1);
        return;
      }
      for (const child of tree.children) {
        removeFromParent(child, nodeId);
      }
    };

    const removeNodeFromTree = (tree, nodeId) => {
      if (!tree?.children?.length) return null;
      const idx = tree.children.findIndex(c => c.id === nodeId);
      if (idx !== -1) {
        return tree.children.splice(idx, 1)[0];
      }
      for (const child of tree.children) {
        const removed = removeNodeFromTree(child, nodeId);
        if (removed) return removed;
      }
      return null;
    };

    const normalizeParentSelection = (rawParentId) => {
      const value = rawParentId ?? '';
      const isHome = value === HOME_PARENT_ID;
      const isSubdomainRoot = value === SUBDOMAIN_PARENT_ID;
      const isOrphanRoot = value === ORPHAN_PARENT_ID || value === '';
      const resolvedParentId = (isHome || isSubdomainRoot || isOrphanRoot) ? '' : value;
      return {
        value,
        isHome,
        isOrphanRoot,
        isSubdomainRoot,
        resolvedParentId,
      };
    };

    // Check if node is currently an orphan
    const isCurrentlyOrphan = !!findOrphanTreeRoot(updatedNode.id);
    const parentSelection = normalizeParentSelection(updatedNode.parentId);
    const newParentId = parentSelection.resolvedParentId;
    const existingHomeNode = collectAllNodesWithOrphans(root, orphans)
      .find((node) => node?.pageType === PAGE_TYPE_HOME && (editModalMode !== 'edit' || node.id !== updatedNode.id));

    if (updatedNode.pageType === PAGE_TYPE_HOME && existingHomeNode) {
      showToast('Home page type can only be used once', 'warning');
      return;
    }

    if (isLiveActive && currentMap?.id) {
      const submitLiveNodeChange = (draft, successMessage, snapshot = null) => {
        const result = queueLiveDraftWithUndo(draft, snapshot);
        if (!result.ok) {
          showToast(result.error || 'Failed to stage live edit', 'error');
          return false;
        }
        setEditModalNode(null);
        if (successMessage) {
          showToast(successMessage, 'success');
        }
        return true;
      };

      const getAppendAfterNodeId = (parentId) => {
        if (!parentId) {
          return orphans.length > 0 ? orphans[orphans.length - 1].id : null;
        }
        const parent = findNodeById(root, parentId) || findNodeInOrphans(parentId);
        const children = Array.isArray(parent?.children) ? parent.children : [];
        return children.length > 0 ? children[children.length - 1].id : null;
      };

      if (editModalMode === 'edit') {
        const currentNode = getNodeById(updatedNode.id);
        if (!currentNode) {
          showToast('Node not found', 'error');
          return;
        }

        const orphanRoot = isCurrentlyOrphan ? findOrphanTreeRoot(updatedNode.id) : null;
        const currentParent = findParent(root, updatedNode.id) || findParentInOrphans(updatedNode.id);
        const currentParentId = currentParent?.id || '';
        const currentRootType = orphanRoot?.subdomainRoot ? 'subdomain' : 'orphan';
        const targetRootType = parentSelection.isSubdomainRoot
          ? 'subdomain'
          : (parentSelection.isOrphanRoot ? 'orphan' : currentRootType);
        const isStructuralChange = (currentParentId !== newParentId)
          || (isCurrentlyOrphan && (parentSelection.isSubdomainRoot || parentSelection.isOrphanRoot) && targetRootType !== currentRootType);

        if (isStructuralChange) {
          warnLiveModeUnsupported('Reparenting and orphan/subdomain moves are disabled while live editing is active.');
          return;
        }

        const nextAnnotations = buildAnnotations(updatedNode.annotations, currentNode.annotations);
        const changes = {};
        const fields = ['title', 'url', 'pageType', 'thumbnailUrl', 'thumbnailFullUrl', 'fullScreenshotUrl', 'description', 'metaTags', 'canonicalUrl', 'seoMetadata'];
        fields.forEach((field) => {
          const nextValue = updatedNode[field];
          const currentValue = currentNode[field];
          if (JSON.stringify(nextValue ?? null) !== JSON.stringify(currentValue ?? null)) {
            changes[field] = nextValue;
          }
        });

        if (JSON.stringify(nextAnnotations || null) !== JSON.stringify(currentNode.annotations || null)) {
          changes.annotations = nextAnnotations;
        }

        if (Object.keys(changes).length === 0) {
          setEditModalNode(null);
          return;
        }

        submitLiveNodeChange({
          type: 'node.update',
          payload: {
            nodeId: updatedNode.id,
            changes,
          },
        }, 'Page changes queued');
        return;
      }

      if (editModalMode === 'duplicate' || editModalMode === 'add') {
        if (!root && editModalMode === 'add') {
          // Fall through to the existing first-node save flow for brand new maps.
        } else {
          const now = new Date().toISOString();
          const nextNode = {
            ...updatedNode,
            url: updatedNode.url || '',
            title: updatedNode.title || 'New Page',
            pageType: updatedNode.pageType || PAGE_TYPE_PAGE,
            thumbnailUrl: updatedNode.thumbnailUrl || '',
            thumbnailFullUrl: updatedNode.thumbnailFullUrl || '',
            fullScreenshotUrl: updatedNode.fullScreenshotUrl || '',
            description: updatedNode.description || '',
            metaTags: updatedNode.metaTags || '',
            canonicalUrl: updatedNode.canonicalUrl || '',
            seoMetadata: updatedNode.seoMetadata || {},
            annotations: buildAnnotations(updatedNode.annotations, {
              status: 'none',
              tags: [],
              note: '',
              meta: { createdAt: now, updatedAt: now },
            }),
            children: [],
            comments: [],
            id: editModalMode === 'duplicate'
              ? `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
              : `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          };

          if (parentSelection.isSubdomainRoot) {
            nextNode.orphanType = 'subdomain';
            nextNode.subdomainRoot = true;
          } else if (parentSelection.isOrphanRoot || newParentId === '') {
            nextNode.orphanType = 'orphan';
            nextNode.subdomainRoot = false;
          } else {
            const orphanParent = findNodeInOrphans(newParentId);
            if (orphanParent) {
              const orphanRoot = findOrphanTreeRoot(newParentId);
              nextNode.orphanType = orphanRoot?.orphanType || 'orphan';
              nextNode.subdomainRoot = !!orphanRoot?.subdomainRoot;
            }
          }

          submitLiveNodeChange({
            type: 'node.add',
            payload: {
              nodeId: nextNode.id,
              parentId: newParentId || null,
              afterNodeId: getAppendAfterNodeId(newParentId),
              node: nextNode,
            },
          }, editModalMode === 'duplicate' ? 'Copy queued' : 'Page queued');
          return;
        }
      }
    }

    if (editModalMode === 'edit') {
      // Update existing node
      saveStateForUndo();

      if (isCurrentlyOrphan) {
        const orphanRoot = findOrphanTreeRoot(updatedNode.id);
        const newParentInRoot = newParentId ? findNodeById(root, newParentId) : null;
        const wantsSubdomainRoot = parentSelection.isSubdomainRoot;
        const wantsOrphanRoot = parentSelection.isOrphanRoot;

        if (newParentId && newParentInRoot) {
          const orphanIndex = findOrphanTreeIndex(updatedNode.id);
          if (orphanIndex === -1 || !orphanRoot) return;
          const orphanCopy = structuredClone(orphanRoot);
          const removedNode = orphanCopy.id === updatedNode.id
            ? orphanCopy
            : removeNodeFromTree(orphanCopy, updatedNode.id);
          if (!removedNode) return;
          Object.assign(removedNode, {
            title: updatedNode.title,
            url: updatedNode.url,
            pageType: updatedNode.pageType,
            thumbnailUrl: updatedNode.thumbnailUrl,
            thumbnailFullUrl: updatedNode.thumbnailFullUrl,
            fullScreenshotUrl: updatedNode.fullScreenshotUrl,
            description: updatedNode.description,
            metaTags: updatedNode.metaTags,
            canonicalUrl: updatedNode.canonicalUrl,
            seoMetadata: updatedNode.seoMetadata,
            annotations: buildAnnotations(updatedNode.annotations, removedNode.annotations),
          });
          maybeMarkNodeMoved(removedNode);
          setOrphans((prev) => {
            const next = structuredClone(prev);
            if (orphanRoot.id === updatedNode.id) {
              next.splice(orphanIndex, 1);
            } else {
              next[orphanIndex] = orphanCopy;
            }
            return next;
          });
          setRoot(prev => {
            const copy = structuredClone(prev);
            const newParent = findNodeById(copy, newParentId);
            if (newParent) {
              newParent.children = newParent.children || [];
              newParent.children.push({
                ...removedNode,
                orphanType: 'orphan',
                subdomainRoot: false,
              });
            }
            return copy;
          });
        } else {
          setOrphans((prev) => {
            const next = structuredClone(prev);
            const treeIndex = findOrphanTreeIndex(updatedNode.id, next);
            if (treeIndex === -1) return prev;
            const treeRoot = next[treeIndex];
            const target = findNodeById(treeRoot, updatedNode.id);
            if (!target) return prev;

            Object.assign(target, {
              title: updatedNode.title,
              url: updatedNode.url,
              pageType: updatedNode.pageType,
              thumbnailUrl: updatedNode.thumbnailUrl,
              thumbnailFullUrl: updatedNode.thumbnailFullUrl,
              fullScreenshotUrl: updatedNode.fullScreenshotUrl,
              description: updatedNode.description,
              metaTags: updatedNode.metaTags,
              canonicalUrl: updatedNode.canonicalUrl,
              seoMetadata: updatedNode.seoMetadata,
              annotations: buildAnnotations(updatedNode.annotations, target.annotations),
            });

            const currentParent = findParent(treeRoot, updatedNode.id);
            const currentParentId = currentParent?.id || '';
            const currentRootType = treeRoot.subdomainRoot ? 'subdomain' : 'orphan';
            const targetRootType = wantsSubdomainRoot ? 'subdomain' : 'orphan';
            const movingToRootLevel = wantsSubdomainRoot || wantsOrphanRoot;

            if (currentParentId !== newParentId || (movingToRootLevel && targetRootType !== currentRootType)) {
              maybeMarkNodeMoved(target);
              if (currentParent) {
                currentParent.children = (currentParent.children || []).filter((c) => c.id !== updatedNode.id);
              } else if (treeRoot.id === updatedNode.id) {
                next.splice(treeIndex, 1);
              }

              if (movingToRootLevel) {
                next.push({
                  ...target,
                  orphanType: targetRootType === 'subdomain' ? 'subdomain' : 'orphan',
                  subdomainRoot: targetRootType === 'subdomain',
                });
              } else {
                const newParent = findNodeById(treeRoot, newParentId) || findNodeInOrphans(newParentId, next);
                if (newParent) {
                  newParent.children = newParent.children || [];
                  newParent.children.push(target);
                }
              }
            }

            return next;
          });
        }
      } else {
        // Node is in the tree
        setRoot((prev) => {
          const copy = structuredClone(prev);
          const target = findNodeById(copy, updatedNode.id);
          if (!target) return prev;

          // Update node properties
          Object.assign(target, {
            title: updatedNode.title,
            url: updatedNode.url,
            pageType: updatedNode.pageType,
            thumbnailUrl: updatedNode.thumbnailUrl,
            thumbnailFullUrl: updatedNode.thumbnailFullUrl,
            fullScreenshotUrl: updatedNode.fullScreenshotUrl,
            description: updatedNode.description,
            metaTags: updatedNode.metaTags,
            canonicalUrl: updatedNode.canonicalUrl,
            seoMetadata: updatedNode.seoMetadata,
            annotations: buildAnnotations(updatedNode.annotations, target.annotations),
          });

          // Check if parent changed
          const currentParent = findParentInTree(copy, updatedNode.id);
          const currentParentId = currentParent?.id || '';

          if (currentParentId !== newParentId) {
            maybeMarkNodeMoved(target);
            // Parent changed - need to move the node
            // Don't allow moving root node
            if (copy.id === updatedNode.id) return copy;

            // Remove from current parent
            removeFromParent(copy, updatedNode.id);

            if (parentSelection.isSubdomainRoot) {
              setOrphans(prev => [...prev, { ...target, orphanType: 'subdomain', subdomainRoot: true }]);
            } else if (parentSelection.isOrphanRoot || newParentId === '') {
              // Moving to orphans
              setOrphans(prev => [...prev, { ...target, orphanType: 'orphan', subdomainRoot: false }]);
            } else {
              // Moving to different parent in tree
              const newParent = findNodeById(copy, newParentId);
              if (newParent) {
                newParent.children = newParent.children || [];
                newParent.children.push(target);
              }
            }
          }

          return copy;
        });
      }
    } else if (editModalMode === 'duplicate') {
      // Create a copy of the node
      const now = new Date().toISOString();
      const newNode = {
        ...updatedNode,
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        annotations: buildAnnotations(updatedNode.annotations, {
          status: 'none',
          tags: [],
          note: '',
          meta: { createdAt: now, updatedAt: now },
        }),
        children: [], // Don't copy children for duplicates
        comments: [], // Fresh comments for duplicates
      };

      saveStateForUndo();

      const newParentInOrphans = findNodeInOrphans(newParentId);

      if (parentSelection.isSubdomainRoot) {
        setOrphans(prev => [...prev, { ...newNode, orphanType: 'subdomain', subdomainRoot: true }]);
      } else if (parentSelection.isOrphanRoot || newParentId === '') {
        // Add to orphans
        setOrphans(prev => [...prev, { ...newNode, orphanType: 'orphan', subdomainRoot: false }]);
      } else if (newParentInOrphans) {
        setOrphans((prev) => {
          const next = structuredClone(prev);
          const treeIndex = findOrphanTreeIndex(newParentId, next);
          if (treeIndex === -1) return prev;
          const treeRoot = next[treeIndex];
          const parent = findNodeById(treeRoot, newParentId);
          if (parent) {
            parent.children = parent.children || [];
            parent.children.push({ ...newNode, orphanType: treeRoot.orphanType || 'orphan', subdomainRoot: !!treeRoot.subdomainRoot });
          }
          return next;
        });
      } else {
        setRoot((prev) => {
          const copy = structuredClone(prev);
          const parent = findNodeById(copy, newParentId);
          if (parent) {
            parent.children = parent.children || [];
            parent.children.push(newNode);
          }
          return copy;
        });
      }
    } else if (editModalMode === 'add') {
      // Create a new blank node
      const now = new Date().toISOString();
      const newNodeData = {
        url: updatedNode.url || '',
        title: updatedNode.title || 'New Page',
        pageType: !root ? PAGE_TYPE_HOME : (updatedNode.pageType || PAGE_TYPE_PAGE),
        thumbnailUrl: updatedNode.thumbnailUrl || '',
        thumbnailFullUrl: updatedNode.thumbnailFullUrl || '',
        fullScreenshotUrl: updatedNode.fullScreenshotUrl || '',
        description: updatedNode.description || '',
        metaTags: updatedNode.metaTags || '',
        canonicalUrl: updatedNode.canonicalUrl || '',
        seoMetadata: updatedNode.seoMetadata || {},
        annotations: buildAnnotations(updatedNode.annotations, {
          status: 'none',
          tags: [],
          note: '',
          meta: { createdAt: now, updatedAt: now },
        }),
        children: [],
        comments: [],
      };

      if (!root) { // This is the first page, so it becomes the root.
        const newRoot = { ...newNodeData, id: 'root' };
        const mapNameToUse = pendingMapCreation?.name || currentMap?.name || mapName || 'Untitled Map';
        const projectIdToUse = normalizeProjectSelection(
          pendingMapCreation?.projectId || currentMap?.project_id || null
        );
        const mapNotesToUse = pendingMapCreation?.notes || currentMap?.notes || '';

        const mapToSave = {
          name: mapNameToUse,
          url: newRoot.url,
          root: newRoot,
          orphans: [],
          colors: DEFAULT_COLORS,
          notes: mapNotesToUse,
          project_id: projectIdToUse,
        };

        api.saveMap(mapToSave)
          .then(async ({ map, initialVersion }) => {
            setRoot(newRoot);
            setCurrentMap(map);
            setMapName(map.name);
            resetAutosaveTracking({
              snapshot: serializeMapAutosaveSnapshot({
                name: map.name,
                root: newRoot,
                orphans: [],
                connections: [],
                colors: DEFAULT_COLORS,
                connectionColors: DEFAULT_CONNECTION_COLORS,
                project_id: map?.project_id || null,
              }),
            });
            setPendingMapCreation(null);
            if (initialVersion) {
              setMapVersions([initialVersion]);
              setLatestVersionId(initialVersion.id);
            }
            scheduleResetViewRef.current?.();

            setProjects(prev => {
              let updated = prev.map(p => ({
                ...p,
                maps: (p.maps || []).filter(m => m.id !== map.id),
              }));

              if (map.project_id) {
                const projectExists = updated.some(p => p.id === map.project_id);
                if (projectExists) {
                  updated = updated.map(p =>
                    p.id === map.project_id
                      ? { ...p, maps: [map, ...(p.maps || [])] }
                      : p
                  );
                } else {
                  const uncategorized = updated.find(p => p.id === 'uncategorized' || p.name === 'Uncategorized');
                  if (uncategorized) {
                    uncategorized.maps = [map, ...(uncategorized.maps || [])];
                  } else {
                    updated.push({ id: 'uncategorized', name: 'Uncategorized', maps: [map] });
                  }
                }
              } else {
                const uncategorized = updated.find(p => p.id === 'uncategorized' || p.name === 'Uncategorized');
                if (uncategorized) {
                  uncategorized.maps = [map, ...(uncategorized.maps || [])];
                } else {
                  updated.push({ id: 'uncategorized', name: 'Uncategorized', maps: [map] });
                }
              }
              return updated;
            });

            await loadMapVersions(map.id);
            await loadMapActivity(map.id, { silent: true, allowToast: false });
            showToast('Map created and first page added!', 'success');
          })
          .catch(e => {
            console.error(e);
            setRoot(newRoot);
            setPendingMapCreation(null);
            showToast('Page added (map is unsaved)', 'warning');
          });
      } else {
        saveStateForUndo();
        const newNode = { ...newNodeData, id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` };
        const newParentInOrphans = findNodeInOrphans(newParentId);
        if (parentSelection.isSubdomainRoot) {
          setOrphans(prev => [...prev, { ...newNode, orphanType: 'subdomain', subdomainRoot: true }]);
        } else if (parentSelection.isOrphanRoot || newParentId === '') {
          setOrphans(prev => [...prev, { ...newNode, orphanType: 'orphan', subdomainRoot: false }]);
        } else if (newParentInOrphans) {
          setOrphans((prev) => {
            const next = structuredClone(prev);
            const treeIndex = findOrphanTreeIndex(newParentId, next);
            if (treeIndex === -1) return prev;
            const treeRoot = next[treeIndex];
            const parent = findNodeById(treeRoot, newParentId);
            if (parent) {
              parent.children = parent.children || [];
              parent.children.push({ ...newNode, orphanType: treeRoot.orphanType || 'orphan', subdomainRoot: !!treeRoot.subdomainRoot });
            }
            return next;
          });
        } else {
          setRoot((prev) => {
            const copy = structuredClone(prev);
            const parent = findNodeById(copy, newParentId);
            if (parent) {
              parent.children = parent.children || [];
              parent.children.push(newNode);
            }
            return copy;
          });
        }
        showToast('Page added successfully', 'success');
      }
    }
    setEditModalNode(null);
  };

  // ========== DRAG & DROP ==========

  const moveNode = (nodeId, newParentId, insertIndex) => {
    if (!root || nodeId === root.id) return;
    if (nodeId === newParentId) return;
    const sourceNode = getNodeById(nodeId);
    const rootChanges = buildMoveRootChanges(sourceNode);

    if (isLiveActive && currentMap?.id) {
      const result = queueLiveDraftWithUndo({
        type: 'node.move',
        payload: {
          nodeId,
          targetParentId: newParentId,
          insertIndex,
          rootChanges,
        },
      });
      if (!result.ok) {
        showToast(result.error || 'Failed to move branch', 'error');
      }
      return;
    }

    const result = applyBranchMoveToMap({
      root,
      orphans,
      nodeId,
      targetParentId: newParentId,
      insertIndex,
      rootChanges,
      orphanContainerId: ORPHAN_CONTAINER_ID,
      subdomainContainerId: SUBDOMAIN_CONTAINER_ID,
    });
    if (!result.ok) {
      if (result.error) showToast(result.error, 'warning');
      return;
    }

    saveStateForUndo();
    setRoot(result.root);
    setOrphans(result.orphans);
  };

  // Calculate all valid drop zones based on current DOM positions
  const calculateDropZones = (draggedNodeId) => {
    if (!contentRef.current || !root) return [];
    const zones = [];
    const cards = contentRef.current.querySelectorAll('[data-node-card="1"]');
    const draggedMeta = forestIndex.nodes.get(draggedNodeId);
    const orphanRoots = orphans.filter(o => !o.subdomainRoot);
    const subdomainRoots = orphans.filter(o => o.subdomainRoot);
    const orphanDisplayOrder = [...orphanRoots].reverse();
    const subdomainDisplayOrder = [...subdomainRoots].reverse();

    const getTreeRootById = (treeRootId) => {
      if (!treeRootId) return null;
      if (root?.id === treeRootId) return root;
      return orphans.find(o => o.id === treeRootId) || null;
    };

    let rootRect = null;

    cards.forEach((card) => {
      const nodeId = card.getAttribute('data-node-id');
      if (!nodeId) return;

      // Skip the dragged node itself
      if (nodeId === draggedNodeId) return;

      const rect = card.getBoundingClientRect();
      if (nodeId === root?.id) {
        rootRect = rect;
      }
      const nodeMeta = forestIndex.nodes.get(nodeId);
      if (!nodeMeta) return;
      const treeRoot = getTreeRootById(nodeMeta.treeRootId);
      if (!treeRoot) return;
      const node = findNodeById(treeRoot, nodeId);
      if (!node) return;

      const parent = nodeMeta.parentId ? findNodeById(treeRoot, nodeMeta.parentId) : null;

      // Skip descendants of the dragged node (within the same tree)
      if (draggedMeta && draggedMeta.treeRootId === nodeMeta.treeRootId) {
        if (isDescendantOf(treeRoot, nodeId, draggedNodeId)) return;
      }

      const siblingIndex = parent ? parent.children.findIndex(c => c.id === nodeId) : -1;
      // Get depth from the positioned wrapper element
      const positionedWrapper = card.closest('[data-depth]');
      const depth = parseInt(positionedWrapper?.getAttribute('data-depth') || '0', 10);
      const useHorizontalMapDropZones = mapOrientation === MAP_ORIENTATIONS.HORIZONTAL;

      // Root-level orphans/subdomains: allow sibling zones using container targets
      if (!parent && nodeMeta.treeType !== 'root') {
        const isSubdomainRoot = nodeMeta.treeType === 'subdomain';
        const displayOrder = isSubdomainRoot ? subdomainDisplayOrder : orphanDisplayOrder;
        const displayIndex = displayOrder.findIndex(o => o.id === nodeId);
        const displayCount = displayOrder.length;
        const containerId = isSubdomainRoot ? SUBDOMAIN_CONTAINER_ID : ORPHAN_CONTAINER_ID;

        if (displayIndex !== -1) {
          const insertIndexBefore = displayCount - displayIndex;
          if (useHorizontalMapDropZones) {
            zones.push({
              type: 'sibling-root',
              layout: 'vertical',
              parentId: containerId,
              index: insertIndexBefore,
              x: rect.left + rect.width / 2,
              y: rect.top - 28,
              allowed: canMoveNode(draggedNodeId, containerId),
            });
          } else {
            zones.push({
              type: 'sibling-root',
              layout: 'horizontal',
              parentId: containerId,
              index: insertIndexBefore,
              x: rect.left - 24,
              y: rect.top + rect.height / 2,
              allowed: canMoveNode(draggedNodeId, containerId),
            });
          }
          if (displayIndex === displayCount - 1) {
            const insertIndexAfter = displayCount - (displayIndex + 1);
            if (useHorizontalMapDropZones) {
              zones.push({
                type: 'sibling-root',
                layout: 'vertical',
                parentId: containerId,
                index: insertIndexAfter,
                x: rect.left + rect.width / 2,
                y: rect.bottom + 28,
                allowed: canMoveNode(draggedNodeId, containerId),
              });
            } else {
              zones.push({
                type: 'sibling-root',
                layout: 'horizontal',
                parentId: containerId,
                index: insertIndexAfter,
                x: rect.right + 24,
                y: rect.top + rect.height / 2,
                allowed: canMoveNode(draggedNodeId, containerId),
              });
            }
          }
        }
      }

      // Add sibling drop zones (before this node)
      // Level 1 (depth=1) uses horizontal layout, Level 2+ (depth>1) uses vertical
      if (depth === 1 && parent && !useHorizontalMapDropZones) {
        // Horizontal layout (Level 1) - drop zones to left/right
        zones.push({
          type: 'sibling',
          layout: 'horizontal',
          parentId: parent.id,
          index: siblingIndex,
          x: rect.left - 24,
          y: rect.top + rect.height / 2,
          allowed: canMoveNode(draggedNodeId, parent.id),
        });
        // Also add zone after last sibling
        if (siblingIndex === parent.children.length - 1) {
          zones.push({
            type: 'sibling',
            layout: 'horizontal',
            parentId: parent.id,
            index: siblingIndex + 1,
            x: rect.right + 24,
            y: rect.top + rect.height / 2,
            allowed: canMoveNode(draggedNodeId, parent.id),
          });
        }
      } else if (depth > 0 && parent) {
        // Vertical sibling layout - drop zones above/below ONLY
        zones.push({
          type: 'sibling',
          layout: 'vertical',
          parentId: parent.id,
          index: siblingIndex,
          x: rect.left + rect.width / 2,
          y: rect.top - 28, // In the gap above
          allowed: canMoveNode(draggedNodeId, parent.id),
        });
        // Also add zone after last sibling
        if (siblingIndex === parent.children.length - 1) {
          zones.push({
            type: 'sibling',
            layout: 'vertical',
            parentId: parent.id,
            index: siblingIndex + 1,
            x: rect.left + rect.width / 2,
            y: rect.bottom + 28, // In the gap below
            allowed: canMoveNode(draggedNodeId, parent.id),
          });
        }
      }
      // depth === 0 is the root node - no sibling zones for root

      // Add child drop zone if node has no children
      // Position below the card with GAP_STACK_Y spacing, center of the zone
      if (!node.children?.length) {
        const childZoneHeight = 200; // Use collapsed height as reference
        const childZoneWidth = 288;
        zones.push({
          type: 'child',
          layout: useHorizontalMapDropZones ? 'horizontal' : 'vertical',
          parentId: nodeId,
          index: 0,
          x: useHorizontalMapDropZones
            ? rect.right + 60 + childZoneWidth / 2
            : rect.left + rect.width / 2,
          y: useHorizontalMapDropZones
            ? rect.top + rect.height / 2
            : rect.bottom + 60 + childZoneHeight / 2,
          allowed: canMoveNode(draggedNodeId, nodeId),
        });
      }
    });

    if (rootRect) {
      const baseX = rootRect.left - (rootRect.width / 2) - 40;
      const centerY = rootRect.top + rootRect.height / 2;
      const offsetY = rootRect.height * 0.65;

      if (orphanRoots.length === 0) {
        zones.push({
          type: 'child',
          layout: 'vertical',
          parentId: ORPHAN_CONTAINER_ID,
          index: 0,
          x: baseX,
          y: centerY + offsetY,
          allowed: canMoveNode(draggedNodeId, ORPHAN_CONTAINER_ID),
        });
      }

      if (subdomainRoots.length === 0) {
        zones.push({
          type: 'child',
          layout: 'vertical',
          parentId: SUBDOMAIN_CONTAINER_ID,
          index: 0,
          x: baseX,
          y: centerY - offsetY,
          allowed: canMoveNode(draggedNodeId, SUBDOMAIN_CONTAINER_ID),
        });
      }
    }

    return zones;
  };

  // Find nearest drop zone within threshold
  const findNearestDropZone = (x, y, draggedNodeId, threshold = 60, { includeDisabled = false } = {}) => {
    const zones = calculateDropZones(draggedNodeId);
    let nearest = null;
    let nearestDist = Infinity;

    for (const zone of zones) {
      if (!includeDisabled && zone.allowed === false) continue;
      // Skip invalid zones
      if (zone.type === 'sibling') {
        const parentMeta = forestIndex.nodes.get(zone.parentId);
        const parentTree = parentMeta ? (parentMeta.treeRootId === root?.id ? root : orphans.find(o => o.id === parentMeta.treeRootId)) : null;
        const parent = parentTree ? findNodeById(parentTree, zone.parentId) : null;
        // Skip if dropping before/after self
        if (parent?.children?.[zone.index]?.id === draggedNodeId) continue;
        if (zone.index > 0 && parent?.children?.[zone.index - 1]?.id === draggedNodeId) continue;
      }

      const dist = Math.sqrt((x - zone.x) ** 2 + (y - zone.y) ** 2);
      if (dist < threshold && dist < nearestDist) {
        nearestDist = dist;
        nearest = zone;
      }
    }

    return nearest;
  };

  const getDndCursorPoint = (event) => {
    const delta = event?.delta || { x: 0, y: 0 };
    const activatorEvent = event?.activatorEvent;
    const touch = activatorEvent?.touches?.[0] || activatorEvent?.changedTouches?.[0];
    const clientX = typeof activatorEvent?.clientX === 'number' ? activatorEvent.clientX : touch?.clientX;
    const clientY = typeof activatorEvent?.clientY === 'number' ? activatorEvent.clientY : touch?.clientY;

    if (typeof clientX === 'number' && typeof clientY === 'number') {
      return {
        x: clientX + delta.x,
        y: clientY + delta.y,
      };
    }

    const activatorRect = event?.active?.rect?.current?.initial;
    if (!activatorRect) return null;

    return {
      x: activatorRect.left + activatorRect.width / 2 + delta.x,
      y: activatorRect.top + activatorRect.height / 2 + delta.y,
    };
  };

  // dnd-kit drag handlers
  const handleDndDragStart = (event) => {
    const { active } = event;
    const data = active.data.current;
    setActiveId(active.id);
    setActiveNode(data?.node || null);
    setActiveDragData({ number: data?.number, color: data?.color });
    // Calculate and store drop zones for visual feedback
    const zones = calculateDropZones(active.id);
    setDropZones(zones);
  };

  const handleDndDragMove = (event) => {
    const { active } = event;
    if (!active) return;

    const cursorPoint = getDndCursorPoint(event);
    if (!cursorPoint) return;

    // Store cursor position for proximity filtering
    setDragCursor(cursorPoint);

    // Find nearest drop zone
    const nearest = findNearestDropZone(cursorPoint.x, cursorPoint.y, active.id, 80, { includeDisabled: true });
    setActiveDropZone(nearest);
  };

  const handleDndDragEnd = (event) => {
    const { active } = event;
    const draggedNodeId = active.id;

    const cursorPoint = getDndCursorPoint(event);
    if (cursorPoint) {
      const finalX = cursorPoint.x;
      const finalY = cursorPoint.y;

      // Find nearest drop zone
      const dropZone = findNearestDropZone(finalX, finalY, draggedNodeId, 80);

      if (dropZone) {
        moveNode(draggedNodeId, dropZone.parentId, dropZone.index);
      } else {
        const attemptedZone = findNearestDropZone(finalX, finalY, draggedNodeId, 80, { includeDisabled: true })
          || activeDropZone;
        if (attemptedZone && attemptedZone.allowed === false) {
          const reason = getMoveBlockReason(draggedNodeId, attemptedZone.parentId);
          showToast(reason || 'Cannot drop here.', 'warning');
        }
      }
    }

    setActiveId(null);
    setActiveNode(null);
    setActiveDragData(null);
    setActiveDropZone(null);
    setDropZones([]);
  };

  const updateLevelColor = (depth, color) => {
    const newColors = [...colors];
    newColors[depth] = color;
    setColors(newColors);
  };

  const updateConnectionColor = (key, color) => {
    if (!key) return;
    setConnectionColors((prev) => ({
      ...prev,
      [key]: color,
    }));
  };

  const colorEditSnapshotRef = useRef(null);

  const hasColorSnapshotChanged = useCallback((snapshot) => {
    if (!snapshot) return false;
    const colorsChanged = JSON.stringify(snapshot.colors) !== JSON.stringify(colors);
    const connectionChanged = JSON.stringify(snapshot.connectionColors) !== JSON.stringify(connectionColors);
    return colorsChanged || connectionChanged;
  }, [colors, connectionColors]);

  const commitColorUndoIfChanged = useCallback(() => {
    const snapshot = colorEditSnapshotRef.current;
    if (snapshot && hasColorSnapshotChanged(snapshot)) {
      if (isLiveActive && currentMap?.id) {
        const result = queueLiveDraftWithUndo({
          type: 'metadata.update',
          payload: {
            changes: {
              colors: [...colors],
              connectionColors: { ...connectionColors },
            },
          },
        }, snapshot);
        if (!result.ok) {
          showToast(result.error || 'Failed to queue color changes', 'error');
        }
      } else {
        saveStateForUndo(snapshot);
      }
    }
    colorEditSnapshotRef.current = null;
  }, [
    colors,
    connectionColors,
    currentMap?.id,
    hasColorSnapshotChanged,
    isLiveActive,
    queueLiveDraftWithUndo,
    saveStateForUndo,
    showToast,
  ]);

  const beginColorEdit = useCallback(() => {
    commitColorUndoIfChanged();
    colorEditSnapshotRef.current = {
      root,
      orphans,
      connections,
      colors: [...colors],
      connectionColors: { ...connectionColors },
    };
  }, [commitColorUndoIfChanged, root, orphans, connections, colors, connectionColors]);

  const getMoveBlockReason = useCallback((sourceId, targetParentId) => {
    return getBranchMoveBlockReason({
      root,
      orphans,
      nodeId: sourceId,
      targetParentId,
      orphanContainerId: ORPHAN_CONTAINER_ID,
      subdomainContainerId: SUBDOMAIN_CONTAINER_ID,
    });
  }, [orphans, root]);

  // Centralized drag/move rules for tree movement
  const canMoveNode = useCallback((sourceId, targetParentId) => {
    return !getMoveBlockReason(sourceId, targetParentId);
  }, [getMoveBlockReason]);

  // Process imported file (shared by both browse and drag-drop)
  const processImportFile = async (file) => {
    if (!file) return;

    setImportLoading(true);

    try {
      const text = await file.text();
      // Use file extension - don't rely on file.type which is often empty for XML
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      let urls = [];
      let parseType = '';

      if (ext === 'xml') {
        // Could be sitemap or RSS/Atom
        if (text.includes('<rss') || text.includes('<feed')) {
          urls = parseRssAtom(text);
          parseType = 'RSS/Atom';
        } else {
          urls = parseXmlSitemap(text);
          parseType = 'XML Sitemap';
        }
      } else if (ext === 'rss' || ext === 'atom') {
        urls = parseRssAtom(text);
        parseType = 'RSS/Atom';
      } else if (ext === 'html' || ext === 'htm') {
        urls = parseHtml(text);
        parseType = 'HTML';
      } else if (ext === 'csv') {
        urls = parseCsv(text);
        parseType = 'CSV';
      } else if (ext === 'md' || ext === 'markdown') {
        urls = parseMarkdown(text);
        parseType = 'Markdown';
      } else {
        urls = parsePlainText(text);
        parseType = 'Text';
      }

      console.log(`Parsed ${parseType}: found ${urls.length} URLs`);

      if (urls.length === 0) {
        showToast(`No URLs found in ${parseType} file`, 'error');
        setImportLoading(false);
        return;
      }

      const tree = buildTreeFromUrls(urls);
      if (tree) {
        setRoot(tree);
        setOrphans([]); // Clear orphans when importing new URLs
        setCurrentMap(null);
        navigateToRoute(createAppHomeRoute());
        setIsImportedMap(true); // Mark as imported - scanning won't work
        setDraftVersionFromSnapshot({
          root: tree,
          orphans: [],
          connections: [],
          colors: DEFAULT_COLORS,
          connectionColors: DEFAULT_CONNECTION_COLORS,
        }, 'Updated');
        applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
        setUrlInput(tree.url || '');
        setMapName('');
        setShowImportModal(false);
        showToast(`Imported ${urls.length} URLs from ${parseType}`, 'success');
      } else {
        showToast('Could not build sitemap from URLs', 'error');
      }
    } catch (err) {
      console.error('Import error:', err);
      showToast(`Import failed: ${err.message || 'Unknown error'}`, 'error');
    }

    setImportLoading(false);
  };

  // Handle file selection via browse button
  const handleFileImport = async (e) => {
    const file = e.target.files?.[0];
    setBlankUploadDragActive(false);
    await processImportFile(file);
    e.target.value = ''; // Reset input for re-selection
  };

  // Handle file drop
  const handleImportDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    setBlankUploadDragActive(false);
    const file = e.dataTransfer.files?.[0];
    await processImportFile(file);
  };

  // Handle drag over (required for drop to work)
  const handleImportDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('drag-over');
    setBlankUploadDragActive(true);
  };

  // Handle drag leave
  const handleImportDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    setBlankUploadDragActive(false);
  };

  const zoomBounds = getZoomBounds();
  const showInviteAcceptGate = currentRoute?.surface === ROUTE_SURFACES.APP
    && currentRoute?.section === 'invite_accept';
  const showMapAccessGate = currentRoute?.surface === ROUTE_SURFACES.APP
    && currentRoute?.section === 'map'
    && (!currentMap?.id || !sameId(currentMap.id, currentRoute?.mapId))
    && (
      !!routeMapGateState
      || !isLoggedIn
      || authLoading
      || !!pendingInviteForCurrentRoute
    );
  const isWelcomeModalEligible = currentRoute?.surface === ROUTE_SURFACES.APP
    && (currentRoute?.section === 'home' || currentRoute?.section === 'map')
    && !showInviteAcceptGate
    && !showMapAccessGate;
  const showWelcomeModal = isWelcomeModalEligible
    && !welcomeModalDismissedForSession
    && (!isLoggedIn || !welcomeModalHidden);

  const dismissWelcomeModal = useCallback(() => {
    if (isLoggedIn && welcomeDontShowAgain) {
      writeWelcomeModalHidden(true);
      setWelcomeModalHidden(true);
    }
    setWelcomeModalDismissedForSession(true);
    setWelcomeDontShowAgain(false);
  }, [isLoggedIn, welcomeDontShowAgain]);
  const saveMapModalProjectId = createMapMode
    ? createMapDefaults?.projectId || null
    : duplicateMapConfig?.projectId || null;
  const saveMapModalName = createMapMode
    ? createMapDefaults?.name ?? ''
    : duplicateMapConfig
      ? duplicateMapConfig.name || ''
      : currentMap?.name || mapName || root?.title || undefined;
  const saveMapModalNotes = createMapMode
    ? createMapDefaults?.notes ?? ''
    : currentMap?.notes || '';
  const saveMapModalKey = [
    createMapMode ? 'create' : (duplicateMapConfig ? 'duplicate' : 'save'),
    saveMapModalProjectId || 'none',
    saveMapModalName || 'untitled',
  ].join(':');
  const canvasRenderScale = scaleRef.current || scale || 1;
  const canvasRenderPan = panRef.current || pan;
  const canvasGridMetrics = getCanvasGridMetrics(canvasRenderScale);
  const canvasGridSize = canvasGridMetrics.size;
  const canvasGridDotRadius = canvasGridMetrics.dotRadius;

  return (
    <AuthProvider value={authValue}>
    <div className="app">
      <Topbar
        canEdit={canEdit()}
        urlInput={urlInput}
        onUrlInputChange={(e) => setUrlInput(e.target.value)}
        onUrlKeyDown={onKeyDownUrl}
        hasMap={hasMap}
        showScanBar={isUnsavedScannedMap && !!root?.url && !showInviteAcceptGate && !showMapAccessGate}
        scanOptions={scanOptions}
        showScanOptions={showScanOptions}
        scanOptionsRef={scanOptionsRef}
        onToggleScanOptions={() => setShowScanOptions(v => !v)}
        onScanOptionChange={(key) => setScanOptions(prev => ({ ...prev, [key]: !prev[key] }))}
        scanLayerAvailability={scanLayerAvailability}
        scanLayerVisibility={scanLayerVisibility}
        onToggleScanLayer={(key) => setScanLayerVisibility(prev => ({ ...prev, [key]: !prev[key] }))}
        onScan={scan}
        scanLabel={hasTopbarRescanChanges ? 'Update' : 'Scan'}
        scanDisabled={loading || isImportedMap || !sanitizeUrl(urlInput) || (isUnsavedScannedMap && !hasTopbarRescanChanges)}
        scanTitle={isImportedMap ? "Cannot scan imported maps" : !sanitizeUrl(urlInput) ? "Enter a valid URL to scan" : hasTopbarRescanChanges ? "Update scan with changed options" : "Change scan options to update"}
        optionsDisabled={isImportedMap || (hasMap && !!currentMap?.id)}
        onClearUrl={() => setUrlInput('')}
        showClearUrl={!!urlInput.trim()}
        sharedTitle={root?.title || 'Shared Sitemap'}
        onCreateMap={() => openCreateMapFlow()}
        onImportFile={() => setShowImportModal(true)}
        onShowInvites={handleShowInviteInbox}
        onShowAccessRequests={handleShowAccessRequestsInbox}
        onShowProjects={handleShowProjects}
        onShowHistory={handleShowHistory}
        pendingInviteCount={pendingMapInvites.length}
        pendingAccessRequestCount={pendingAccessRequests.length}
      />

      <div
        className={`canvas ${hasMap ? 'has-map' : ''} ${isPanning ? 'panning' : ''} ${activeTool === 'comments' ? 'comments-mode' : ''} ${connectionTool ? 'connection-mode' : ''} ${isShiftPressed ? 'shift-selecting' : ''}`}
        ref={canvasRef}
        style={{
          '--canvas-pan-x': `${canvasRenderPan.x || 0}px`,
          '--canvas-pan-y': `${canvasRenderPan.y || 0}px`,
          '--canvas-grid-size': `${canvasGridSize}px`,
          '--canvas-grid-dot-radius': `${canvasGridDotRadius}px`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
       
      >
        {showInviteAcceptGate && (
          <InviteAcceptGate
            status={inviteAcceptState?.status || (authLoading ? 'processing' : 'auth_required')}
            error={inviteAcceptState?.error || ''}
            onLogin={() => openAuthModal()}
            onGoHome={() => navigateToRoute(createAppHomeRoute(), { replace: true })}
            onShowInvites={handleShowInviteInbox}
          />
        )}

        {showMapAccessGate && !showInviteAcceptGate && (
          <MapAccessGate
            isLoggedIn={isLoggedIn}
            authLoading={authLoading}
            invite={pendingInviteForCurrentRoute}
            loading={!!routeMapGateState?.loading || (!!pendingInviteForCurrentRoute && pendingMapInvitesLoading)}
            requestStatus={routeMapGateState?.requestStatus || 'idle'}
            requestError={routeMapGateState?.requestError || ''}
            requestMessage={routeAccessRequestMessage}
            onLogin={() => openAuthModal()}
            onGoHome={() => navigateToRoute(createAppHomeRoute(), { replace: true })}
            onRequestMessageChange={setRouteAccessRequestMessage}
            onRequestAccess={handleRequestRouteMapAccess}
            onAcceptInvite={handleAcceptPendingInvite}
            onDeclineInvite={handleDeclinePendingInvite}
          />
        )}

        {/* Permission banner for shared links with limited access */}
        {accessLevel !== ACCESS_LEVELS.EDIT && hasMap && !showCoeditingReadOnlyBanner && (
          <StatusAlert tone="warning" className="permission-banner">
            {accessLevel === ACCESS_LEVELS.VIEW
              ? "You're viewing this sitemap in read-only mode"
              : "You can view and comment on this sitemap"}
          </StatusAlert>
        )}

        {mapSaveConflict && hasMap && (
          <StatusAlert
            tone="danger"
            className="permission-banner map-conflict-banner"
            actions={(
              <div className="map-conflict-actions">
                <Button type="secondary" buttonStyle="danger" size="sm" onClick={reloadMapAfterConflict}>
                  Reload Latest
                </Button>
                <Button type="ghost" buttonStyle="danger" size="sm" onClick={dismissMapConflict}>
                  Dismiss
                </Button>
              </div>
            )}
          >
            This map changed in another session. Your last update was blocked to avoid overwriting.
          </StatusAlert>
        )}

        {showCoeditingReadOnlyBanner && (
          <StatusAlert tone="warning" className="permission-banner live-edit-banner live-edit-banner-warning">
            <span>
              <strong>Live Editing Read-Only</strong>
              {coeditingReadOnlyMessage ? ` • ${coeditingReadOnlyMessage}` : ''}
            </span>
          </StatusAlert>
        )}

        {showLiveStatusBanner && (
          <StatusAlert
            tone={liveBannerTone === 'connected' ? 'success' : liveBannerTone === 'warning' ? 'warning' : 'info'}
            className={`permission-banner live-edit-banner live-edit-banner-${liveBannerTone}`}
            icon={liveStatus === COEDITING_LIVE_STATUS.CONNECTED
              ? <Wifi size={16} />
              : (liveStatus === COEDITING_LIVE_STATUS.OUT_OF_SYNC
                ? <WifiOff size={16} />
                : <RefreshCw size={16} className={liveStatus === COEDITING_LIVE_STATUS.RECONNECTING ? 'live-spin' : ''} />)}
            contentClassName="permission-banner-main"
            actions={liveStatus === COEDITING_LIVE_STATUS.OUT_OF_SYNC ? (
              <div className="map-conflict-actions">
                <Button type="secondary" buttonStyle="brand" size="sm" onClick={handleLiveResync}>
                  Resync
                </Button>
              </div>
            ) : null}
          >
            <>
              <span className="permission-banner-summary">
                <strong>{liveBannerTitle} {liveStatusLabel}</strong>
                {` • v${liveVersion}`}
                {livePendingCount > 0 ? ` • ${livePendingCount} queued` : ''}
                {liveCollaborators.length > 0 ? ` • ${liveCollaborators.length} collaborator${liveCollaborators.length === 1 ? '' : 's'}` : ''}
                {liveStatusDetail ? ` • ${liveStatusDetail}` : ''}
              </span>
              <PresenceChipList collaborators={liveCollaborators} />
            </>
          </StatusAlert>
        )}

        {hasMap && !showInviteAcceptGate && !showMapAccessGate && (
          <CanvasMapHeader
            canEdit={canEdit()}
            mapName={mapName}
            isEditingMapName={isEditingMapName}
            onMapNameChange={(e) => setMapName(e.target.value)}
            onMapNameBlur={commitMapNameEdit}
            onMapNameKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitMapNameEdit();
              }
              if (e.key === 'Escape') {
                cancelMapNameEdit();
              }
            }}
            onMapNameClick={startMapNameEdit}
            collaborators={titleCollaborators}
          />
        )}

        {!hasMap && (
          <div className="blank">
            <div className="blank-shell">
              <div className="blank-heading">
                <div className="blank-title">Start with a URL</div>
                <div className="blank-subtitle">Scan a site, then shape the map from the canvas.</div>
              </div>
              <div className="blank-scan-primary">
                <div className="search-container scan-bar-shell blank-scan-shell">
                  <ScanBar
                    canEdit={canEdit()}
                    urlInput={urlInput}
                    onUrlInputChange={(e) => setUrlInput(e.target.value)}
                    onUrlKeyDown={onKeyDownUrl}
                    options={scanOptions}
                    showOptions={showScanOptions}
                    optionsRef={scanOptionsRef}
                    onToggleOptions={() => setShowScanOptions(v => !v)}
                    onOptionChange={(key) => setScanOptions(prev => ({ ...prev, [key]: !prev[key] }))}
                    scanLayerAvailability={scanLayerAvailability}
                    scanLayerVisibility={scanLayerVisibility}
                    onToggleScanLayer={(key) => setScanLayerVisibility(prev => ({ ...prev, [key]: !prev[key] }))}
                    onScan={scan}
                    scanLabel="Scan"
                    scanDisabled={loading || isImportedMap || !sanitizeUrl(urlInput)}
                    scanTitle={isImportedMap ? "Cannot scan imported maps" : !sanitizeUrl(urlInput) ? "Enter a valid URL to scan" : "Scan URL"}
                    optionsDisabled={isImportedMap}
                    onClearUrl={() => setUrlInput('')}
                    showClearUrl={!!urlInput.trim()}
                    sharedTitle={root?.title || 'Shared Sitemap'}
                  />
                </div>
              </div>
              <h3 className="blank-start-label">Or start here</h3>
              <div className="blank-card-guide" aria-hidden="true">
                <svg className="blank-guide-svg" viewBox="0 0 960 120" fill="none" preserveAspectRatio="none">
                  <path className="blank-guide-line" d="M480 0V46" />
                  <path className="blank-guide-line" d="M154 46H806" />
                  <path className="blank-guide-line" d="M154 46V112" />
                  <path className="blank-guide-line" d="M480 46V112" />
                  <path className="blank-guide-line" d="M806 46V112" />
                  <path className="blank-guide-arrow" d="M146 104L154 112L162 104" />
                  <path className="blank-guide-arrow" d="M472 104L480 112L488 104" />
                  <path className="blank-guide-arrow" d="M798 104L806 112L814 104" />
                </svg>
              </div>
              <div className="blank-card-grid">
                <button
                  type="button"
                  className="blank-card"
                  onClick={() => openCreateMapFlow()}
                >
                  <div className="blank-card-illustration blank-card-illustration-create" aria-hidden="true">
                    <img src={createIllustration} alt="" className="blank-card-art blank-card-art-light" />
                    <img src={createIllustrationDark} alt="" className="blank-card-art blank-card-art-dark" />
                  </div>
                  <div className="blank-card-title-row">
                    <span className="blank-card-title">Create</span>
                  </div>
                  <div className="blank-card-copy">Start a new map from scratch</div>
                </button>

                <button
                  type="button"
                  className={`blank-card blank-card-upload ${blankUploadDragActive ? 'drag-over' : ''}`}
                  onClick={() => blankUploadInputRef.current?.click()}
                  onDrop={handleImportDrop}
                  onDragOver={handleImportDragOver}
                  onDragLeave={handleImportDragLeave}
                  disabled={importLoading}
                >
                  <div className="blank-card-illustration blank-card-illustration-upload" aria-hidden="true">
                    {importLoading ? (
                      <Loader2 size={32} className="spin" />
                    ) : (
                      <>
                        <img src={uploadIllustration} alt="" className="blank-card-art blank-card-art-light" />
                        <img src={uploadIllustrationDark} alt="" className="blank-card-art blank-card-art-dark" />
                      </>
                    )}
                  </div>
                  <div className="blank-card-title-row">
                    <span className="blank-card-title">Upload</span>
                  </div>
                  <div className="blank-card-copy">
                    {importLoading
                      ? 'Processing your file...'
                      : (
                        <>
                          <span>Use existing sitemap files</span>
                          <span className="blank-card-copy-secondary">(drag in here or click to select)</span>
                        </>
                      )}
                  </div>
                </button>

                <button
                  type="button"
                  className="blank-card"
                  onClick={() => {
                    if (currentUser) {
                      openProjectsPanel();
                      return;
                    }
                    openAuthModal({
                      contextMessage: MODIFY_AUTH_CONTEXT_MESSAGE,
                      postSuccessAction: 'open-projects',
                    });
                  }}
                >
                  <div className="blank-card-illustration blank-card-illustration-modify" aria-hidden="true">
                    <img src={modifyIllustration} alt="" className="blank-card-art blank-card-art-light" />
                    <img src={modifyIllustrationDark} alt="" className="blank-card-art blank-card-art-dark" />
                  </div>
                  <div className="blank-card-title-row">
                    <span className="blank-card-title">Modify</span>
                  </div>
                  <div className="blank-card-copy">Make updates to existing maps</div>
                </button>
              </div>
              <input
                ref={blankUploadInputRef}
                className="blank-upload-input"
                type="file"
                accept=".xml,.rss,.atom,.html,.htm,.csv,.md,.markdown,.txt"
                onChange={handleFileImport}
                disabled={importLoading}
              />
            </div>
          </div>
        )}

        {hasMap && (
          <DndContext
            sensors={sensors}
            onDragStart={handleDndDragStart}
            onDragMove={handleDndDragMove}
            onDragEnd={handleDndDragEnd}
          >
            <div
              className={`content-shell ${useLargeMapSurface ? 'large-map-shell' : ''}`}
              ref={contentShellRef}
            >
            <div
              className={`content ${useLargeMapSurface ? 'large-map-content' : ''} ${drawingConnection ? 'drawing-connection' : ''} ${draggingEndpoint ? 'dragging-endpoint' : ''}`}
              ref={contentRef}
              data-large-map-surface={useLargeMapSurface ? '1' : undefined}
              style={{
                // PAN/ZOOM INVARIANT:
                // This transform must ONLY be translate(px, px) scale(n).
                // No %, no centering, no layout transforms.
                // Do not modify without understanding world-space math.
                transform: useLargeMapSurface
                  ? 'none'
                  : `translate(${canvasRenderPan.x}px, ${canvasRenderPan.y}px) scale(${canvasRenderScale})`,
                transformOrigin: '0 0',
              }}
              onMouseMove={(e) => {
                updateLastPointerFromEvent(e);
                if (drawingConnection) handleConnectionMouseMove(e);
                else if (draggingEndpoint) handleEndpointDragMove(e);
              }}
              onMouseUp={(e) => {
                if (drawingConnection) handleConnectionMouseUp(e);
                else if (draggingEndpoint) handleEndpointDragEnd();
              }}
            >
                {!useLargeMapSurface && selectionBox && (
                  <div
                    className="selection-rect"
                    style={{
                      left: selectionBox.x,
                      top: selectionBox.y,
                      width: selectionBox.w,
                      height: selectionBox.h,
                    }}
                  />
                )}

                {!useLargeMapSurface && liveSelectionBadges.map((badge) => (
                  <div
                    key={badge.nodeId}
                    className="live-selection-highlight"
                    style={{
                      left: badge.x - 6,
                      top: badge.y - 6,
                      width: badge.w + 12,
                      height: badge.h + 12,
                    }}
                  >
                    <div className="live-selection-pill-row">
                      {badge.participants.slice(0, 3).map((participant) => (
                        <span
                          key={`${badge.nodeId}-${participant.sessionId}`}
                          className={`live-selection-pill tone-${participant.tone}`}
                        >
                          {participant.label}
                        </span>
                      ))}
                      {badge.participants.length > 3 && (
                        <span className="live-selection-pill live-selection-pill-more">
                          +{badge.participants.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {useLargeMapSurface ? (
                  <MapSurfaceV2
                    mapId={currentMap?.id}
                    getScene={api.getMapScene}
                    getViewState={getLargeMapViewState}
                    canvasSize={canvasSize}
                    orientation={mapOrientation}
                    showThumbnails={showThumbnails}
                    showCommentBadges={canViewComments()}
                    canEdit={canEdit()}
                    canComment={canComment()}
                    showCommentAction={!!effectiveFeatureGates.mapComment}
                    commentActionLabel={canComment() ? 'Comments' : 'View comments'}
                    showExternalLinkAction={canEdit()}
                    showDeleteAction={showDirectNodeDeleteAction}
                    connectionTool={connectionTool}
                    snapTarget={drawingConnection?.snapTarget || draggingEndpoint?.snapTarget}
                    onAnchorMouseDown={handleAnchorMouseDown}
                    colors={colors}
                    selectedNodeIds={selectedNodeIds}
                    onNodeClick={handleNodeClick}
                    onNodeContextMenu={openLargeMapNodeMenu}
                    onNodeDoubleClick={handleLargeMapNodeDoubleClick}
                    onNodeExpand={handleLargeMapNodeExpand}
                    onViewImage={handleLargeMapNodeViewImage}
                    onDelete={requestDeleteNode}
                    onEdit={openEditModal}
                    onDuplicate={duplicateNode}
                    onAddNote={(node) => openCommentPopover(node)}
                    onViewNotes={(node) => openCommentPopover(node)}
                    activeId={activeId}
                    showPageNumbers={layers.pageNumbers}
                    thumbnailRequestIds={thumbnailScopeIds}
                    thumbnailSessionId={thumbnailSessionId}
                    thumbnailReloadMap={thumbnailReloadMap}
                    thumbnailCaptureStopped={thumbnailStats.stopped}
                    onThumbnailLoad={handleThumbnailDisplayLoad}
                    onThumbnailError={handleThumbnailDisplayError}
                    onSceneLoaded={handleLargeMapSceneLoaded}
                    activeBranchNodeIds={activeBranchNodeIds}
                    expandedStacks={expandedStacks}
                  />
                ) : (
                <SitemapTree
                  data={renderRoot}
                  orphans={visibleOrphans}
                  layout={mapLayout}
                  orientation={mapOrientation}
                  showThumbnails={showThumbnails}
                  showCommentBadges={canViewComments()}
                  canEdit={canEdit()}
                  canComment={canComment()}
                  showCommentAction={!!effectiveFeatureGates.mapComment}
                  commentActionLabel={canComment() ? 'Comments' : 'View comments'}
                  showExternalLinkAction={canEdit()}
                  showDeleteAction={showDirectNodeDeleteAction}
                  connectionTool={connectionTool}
                  snapTarget={drawingConnection?.snapTarget || draggingEndpoint?.snapTarget}
                  onAnchorMouseDown={handleAnchorMouseDown}
                  colors={colors}
                  scale={canvasRenderScale}
                  onDelete={requestDeleteNode}
                  onEdit={openEditModal}
                  onDuplicate={duplicateNode}
                  onViewImage={viewFullScreenshot}
                  activeId={activeId}
                  onNodeDoubleClick={(id) => {
                    if (scaleRef.current < 0.95) {
                      const layout = layoutRef.current;
                      const canvas = canvasRef.current;
                      if (!layout || !canvas) return;
                      const nodeData = layout.nodes.get(id);
                      if (!nodeData) return;
                      const canvasCenterX = canvas.clientWidth / 2;
                      const canvasCenterY = canvas.clientHeight / 2;
                      const nodeCenterX = nodeData.x + nodeData.w / 2;
                      const nodeCenterY = nodeData.y + nodeData.h / 2;
                      const nextScale = 1;
                      const nextPan = {
                        x: canvasCenterX - nodeCenterX * nextScale,
                        y: canvasCenterY - nodeCenterY * nextScale,
                      };
                      applyTransform({ scale: nextScale, x: nextPan.x, y: nextPan.y });
                    }
                  }}
                  onNodeClick={handleNodeClick}
                  onNodeContextMenu={openNodeMenu}
                  onAddNote={(node) => openCommentPopover(node)}
                  onViewNotes={(node) => openCommentPopover(node)}
                  badgeVisibility={badgeVisibility}
                  layerVisibility={layerVisibility}
                  changeFilters={changeFilters}
                  showPageNumbers={layers.pageNumbers}
                  thumbnailRequestIds={thumbnailScopeIds}
                  thumbnailSessionId={thumbnailSessionId}
                  thumbnailReloadMap={thumbnailReloadMap}
                  thumbnailCaptureStopped={thumbnailStats.stopped}
                  onThumbnailLoad={handleThumbnailDisplayLoad}
                  onThumbnailError={handleThumbnailDisplayError}
                  expandedStacks={expandedStacks}
                  viewportBounds={canvasViewportBounds}
                  activeBranchNodeIds={activeBranchNodeIds}
                  onToggleStack={(nodeId) => {
                    setExpandedStacks((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
                  }}
                  selectedNodeIds={selectedNodeIds}
                >
                  {/* SVG Connections Layer */}
                  <svg
                    className="connections-layer"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'auto',
                      overflow: 'visible',
                      zIndex: 0,
                    }}
                  >
                  {/* Arrowhead marker definition */}
                  <defs>
                    <marker
                      id="arrowhead-userflow"
                      markerWidth="10"
                      markerHeight="12.5"
                    refX="9"
                    refY="6.25"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path
                      d="M 1 0 L 9 6.25 L 1 12.5"
                      fill="none"
                      stroke="context-stroke"
                      strokeWidth="1"
                      strokeLinecap="square"
                      strokeLinejoin="miter"
                    />
                  </marker>
                  <filter
                    id="connection-glow"
                    x="-50%"
                    y="-50%"
                    width="200%"
                    height="200%"
                    colorInterpolationFilters="sRGB"
                  >
                    <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                    <feComponentTransfer in="blur" result="glow">
                      <feFuncA type="linear" slope="0.6" />
                    </feComponentTransfer>
                    <feMerge>
                      <feMergeNode in="glow" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {layers.crossLinks && visibleAutoCrosslinkConnections.map((conn) => {
                  const path = conn.sourceAnchor && conn.targetAnchor
                    ? generateConnectionPath(conn)
                    : (() => {
                      const best = getBestAnchorPair(conn.sourceNodeId, conn.targetNodeId);
                      if (!best) return '';
                      return generateConnectionPath({ ...conn, ...best });
                    })();
                  if (!path) return null;
                  const ghosted = isCrosslinkGhosted(conn);
                  const isHovered = hoveredConnection === conn.id;
                  const baseOpacity = ghosted ? 0.2 : 0.5;
                  const lineOpacity = isHovered ? (ghosted ? 0.4 : 1) : baseOpacity;
                  const glowOpacity = isHovered ? (ghosted ? 0.24 : 0.6) : 0;
                  const baseWidth = 2;
                  const lineWidth = isHovered ? baseWidth + 1 : baseWidth;
                  const color = connectionColors.crossLinks || DEFAULT_CONNECTION_COLORS.crossLinks;

                  return (
                    <g key={conn.id}>
                      <path
                        className="connection-hit"
                        d={path}
                        fill="none"
                        stroke={color}
                        strokeWidth={16}
                        strokeOpacity={0}
                        strokeLinecap="round"
                        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredConnection(conn.id)}
                        onMouseLeave={() => setHoveredConnection(null)}
                      />
                      <path
                        className="connection-glow"
                        d={path}
                        fill="none"
                        stroke={color}
                        strokeWidth={lineWidth + 2}
                        strokeOpacity={glowOpacity}
                        strokeLinecap="round"
                        strokeDasharray="8 6"
                        filter="url(#connection-glow)"
                        style={{ pointerEvents: 'none' }}
                      />
                      <path
                        className="connection-line"
                        d={path}
                        fill="none"
                        stroke={color}
                        strokeWidth={lineWidth}
                        strokeDasharray="8 6"
                        strokeLinecap="round"
                        strokeOpacity={lineOpacity}
                        style={{ pointerEvents: 'none' }}
                      />
                    </g>
                  );
                })}

                {layers.brokenLinks && visibleBrokenConnections.map((conn) => {
                  const path = getBrokenLinkPathForConnection(conn);
                  if (!path) return null;
                  const isHovered = hoveredConnection === conn.id;
                  const baseWidth = 2;
                  const lineWidth = isHovered ? baseWidth + 1 : baseWidth;
                  const color = connectionColors.brokenLinks || DEFAULT_CONNECTION_COLORS.brokenLinks;
                  const lineOpacity = isHovered ? 1 : 1;
                  const glowOpacity = isHovered ? 0.6 : 0;
                  return (
                    <g key={conn.id}>
                      <path
                        className="connection-hit"
                        d={path}
                        fill="none"
                        stroke={color}
                        strokeWidth={16}
                        strokeOpacity={0}
                        strokeLinecap="round"
                        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredConnection(conn.id)}
                        onMouseLeave={() => setHoveredConnection(null)}
                      />
                      <path
                        className="connection-glow"
                        d={path}
                        fill="none"
                        stroke={color}
                        strokeWidth={lineWidth + 2}
                        strokeOpacity={glowOpacity}
                        strokeLinecap="round"
                        strokeDasharray="6 6"
                        filter="url(#connection-glow)"
                        style={{ pointerEvents: 'none' }}
                      />
                      <path
                        className="connection-line"
                        d={path}
                        fill="none"
                        stroke={color}
                        strokeWidth={lineWidth}
                        strokeDasharray="6 6"
                        strokeLinecap="round"
                        strokeOpacity={lineOpacity}
                        style={{ pointerEvents: 'none' }}
                      />
                    </g>
                  );
                })}

                {/* Render completed connections */}
                {visibleCanvasConnections
                  .filter(conn => {
                    if (conn.type === 'userflow' && !layers.userFlows) return false;
                    if (conn.type === 'crosslink' && !layers.crossLinks) return false;
                    if (conn.type === 'crosslink' && conn.autoRoute) return false;
                    // Hide connection being dragged
                    if (draggingEndpoint?.connectionId === conn.id) return false;
                    return true;
                  })
                  .map(conn => {
                    const path = generateConnectionPath(conn);
                    if (!path) return null;
                    const isUserFlow = conn.type === 'userflow';
                    const isCrosslink = conn.type === 'crosslink';
                    const crosslinkGhosted = isCrosslink && isCrosslinkGhosted(conn);
                    const color = isUserFlow
                      ? (connectionColors.userFlows || DEFAULT_CONNECTION_COLORS.userFlows)
                      : (connectionColors.crossLinks || DEFAULT_CONNECTION_COLORS.crossLinks);
                    const isHovered = hoveredConnection === conn.id;
                    const baseWidth = 2;
                    const lineWidth = isHovered ? baseWidth + 1 : baseWidth;
                    const baseOpacity = isCrosslink && crosslinkGhosted ? 0.4 : 1;
                    const lineOpacity = isHovered
                      ? (isCrosslink && crosslinkGhosted ? 0.4 : 1)
                      : baseOpacity;
                    const glowOpacity = isHovered
                      ? (isCrosslink && crosslinkGhosted ? 0.24 : 0.6)
                      : 0;

                    return (
                      <g key={conn.id}>
                        {/* Invisible hit area for easier hovering */}
                        <path
                          className="connection-hit"
                          d={path}
                          fill="none"
                          stroke={color}
                          strokeWidth={16}
                          strokeOpacity={0}
                          strokeLinecap="round"
                          style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                          onMouseEnter={() => setHoveredConnection(conn.id)}
                          onMouseLeave={(e) => {
                            setHoveredConnection(null);
                            e.currentTarget.style.cursor = 'pointer';
                          }}
                          onMouseMove={(e) => {
                            if (!contentRef.current) return;
                            const contentRect = contentRef.current.getBoundingClientRect();
                            const mouseX = (e.clientX - contentRect.left) / scale;
                            const mouseY = (e.clientY - contentRect.top) / scale;
                            const nearEndpoint = isNearEndpoint(mouseX, mouseY, conn, 32);
                            e.currentTarget.style.cursor = nearEndpoint ? 'grab' : 'pointer';
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!contentRef.current) return;
                            const contentRect = contentRef.current.getBoundingClientRect();
                            const clickX = (e.clientX - contentRect.left) / scale;
                            const clickY = (e.clientY - contentRect.top) / scale;
                            const nearEndpoint = isNearEndpoint(clickX, clickY, conn, 32);
                            if (nearEndpoint) {
                              handleEndpointDragStart(e, conn, nearEndpoint);
                            }
                          }}
                          onClick={(e) => {
                            if (!contentRef.current) return;
                            const contentRect = contentRef.current.getBoundingClientRect();
                            const clickX = (e.clientX - contentRect.left) / scale;
                            const clickY = (e.clientY - contentRect.top) / scale;
                            const nearEndpoint = isNearEndpoint(clickX, clickY, conn, 32);
                            if (!nearEndpoint) {
                              handleConnectionClick(e, conn);
                            }
                          }}
                        />
                        {/* Glow effect on hover */}
                        <path
                          className="connection-glow"
                          d={path}
                          fill="none"
                          stroke={color}
                          strokeWidth={lineWidth + 2}
                          strokeOpacity={glowOpacity}
                          strokeLinecap="round"
                          strokeDasharray={isUserFlow ? 'none' : '8 6'}
                          filter="url(#connection-glow)"
                          style={{ pointerEvents: 'none' }}
                        />
                        {/* Main line */}
                        <path
                          className="connection-line"
                          d={path}
                          fill="none"
                          stroke={color}
                          strokeWidth={lineWidth}
                          strokeLinecap="round"
                          strokeDasharray={isUserFlow ? 'none' : '8 6'}
                          markerEnd={isUserFlow ? 'url(#arrowhead-userflow)' : 'none'}
                          strokeOpacity={lineOpacity}
                          style={{ pointerEvents: 'none' }}
                        />
                      </g>
                    );
                  })}

                {/* Temporary line while drawing */}
                {drawingConnection && (() => {
                  const { startX, startY, currentX, currentY, sourceAnchor, type } = drawingConnection;
                  const isUserFlow = type === 'userflow';
                  const color = isUserFlow
                    ? (connectionColors.userFlows || DEFAULT_CONNECTION_COLORS.userFlows)
                    : (connectionColors.crossLinks || DEFAULT_CONNECTION_COLORS.crossLinks);

                  // Calculate curved path based on source anchor direction
                  const dx = Math.abs(currentX - startX);
                  const dy = Math.abs(currentY - startY);
                  const offset = Math.min(Math.max(dx, dy) * 0.5, 100);

                  let ctrl1 = { x: startX, y: startY };
                  switch (sourceAnchor) {
                    case 'top': ctrl1.y -= offset; break;
                    case 'right': ctrl1.x += offset; break;
                    case 'bottom': ctrl1.y += offset; break;
                    case 'left': ctrl1.x -= offset; break;
                    default: break;
                  }

                  // Control point for target curves toward cursor
                  const ctrl2 = { x: currentX, y: currentY };

                  const pathD = `M ${startX} ${startY} C ${ctrl1.x} ${ctrl1.y}, ${ctrl2.x} ${ctrl2.y}, ${currentX} ${currentY}`;

                  return (
                    <path
                      d={pathD}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      strokeDasharray={isUserFlow ? 'none' : '8 6'}
                      strokeOpacity={0.8}
                      strokeLinecap="round"
                      markerEnd={isUserFlow ? 'url(#arrowhead-userflow)' : 'none'}
                    />
                  );
                })()}

                {/* Temporary line while dragging endpoint */}
                {draggingEndpoint && (() => {
                  const { fixedX, fixedY, fixedAnchor, currentX, currentY, endpoint, type } = draggingEndpoint;
                  const isUserFlow = type === 'userflow';
                  const color = isUserFlow
                    ? (connectionColors.userFlows || DEFAULT_CONNECTION_COLORS.userFlows)
                    : (connectionColors.crossLinks || DEFAULT_CONNECTION_COLORS.crossLinks);

                  // Determine start/end based on which endpoint is being dragged
                  const startX = endpoint === 'source' ? currentX : fixedX;
                  const startY = endpoint === 'source' ? currentY : fixedY;
                  const endX = endpoint === 'source' ? fixedX : currentX;
                  const endY = endpoint === 'source' ? fixedY : currentY;

                  // Calculate curved path
                  const dx = Math.abs(endX - startX);
                  const dy = Math.abs(endY - startY);
                  const offset = Math.min(Math.max(dx, dy) * 0.5, 100);

                  let ctrl1 = { x: startX, y: startY };
                  let ctrl2 = { x: endX, y: endY };

                  // Use fixed anchor direction for the fixed end
                  if (endpoint === 'source') {
                    switch (fixedAnchor) {
                      case 'top': ctrl2.y -= offset; break;
                      case 'right': ctrl2.x += offset; break;
                      case 'bottom': ctrl2.y += offset; break;
                      case 'left': ctrl2.x -= offset; break;
                      default: break;
                    }
                  } else {
                    switch (fixedAnchor) {
                      case 'top': ctrl1.y -= offset; break;
                      case 'right': ctrl1.x += offset; break;
                      case 'bottom': ctrl1.y += offset; break;
                      case 'left': ctrl1.x -= offset; break;
                      default: break;
                    }
                  }

                  const pathD = `M ${startX} ${startY} C ${ctrl1.x} ${ctrl1.y}, ${ctrl2.x} ${ctrl2.y}, ${endX} ${endY}`;

                  return (
                    <path
                      d={pathD}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      strokeDasharray={isUserFlow ? 'none' : '8 6'}
                      strokeOpacity={0.8}
                      strokeLinecap="round"
                      markerEnd={isUserFlow && endpoint === 'target' ? 'url(#arrowhead-userflow)' : 'none'}
                    />
                  );
                })()}
              </svg>
                </SitemapTree>
                )}

              {/* Connection context menu */}
              {connectionMenu && (
                <MenuPanel
                  className="connection-menu"
                  style={{
                    position: 'absolute',
                    left: connectionMenu.x,
                    top: connectionMenu.y,
                    zIndex: 1000,
                  }}
                >
                  <MenuItem
                    className="connection-menu-item"
                    icon={<MessageSquare size={14} />}
                    label="Add Comment"
                    title={APP_ONLY_MODE ? `${TESTER_NOT_READY_MESSAGE}: connection comments` : 'Add comment'}
                    onClick={() => {
                      showToast(
                        APP_ONLY_MODE
                          ? `${TESTER_NOT_READY_MESSAGE}: connection comments are not ready yet.`
                          : 'Connection comments coming soon',
                        'info',
                      );
                      setConnectionMenu(null);
                    }}
                  />
                  <MenuItem
                    className="connection-menu-item delete"
                    icon={<Trash2 size={14} />}
                    label="Delete"
                    danger
                    onClick={() => {
                      deleteConnection(connectionMenu.connectionId);
                      setConnectionMenu(null);
                    }}
                  />
                </MenuPanel>
              )}

              {/* Node annotation context menu */}
              {nodeMenu && (
                <MenuPanel
                  className="node-menu"
                  style={{
                    position: 'absolute',
                    left: nodeMenu.x,
                    top: nodeMenu.y,
                    zIndex: 1000,
                  }}
                >
                  <MenuSectionHeader className="node-menu-title">
                    Mark as{nodeMenu.targetIds?.length > 1 ? ` (${nodeMenu.targetIds.length})` : ''}
                  </MenuSectionHeader>
                  {ANNOTATION_STATUS_OPTIONS.map((option) => (
                    <MenuItem
                      key={option.value}
                      className={`node-menu-item${nodeMenuStatus === option.value ? ' active' : ''}`}
                      label={option.label}
                      selected={nodeMenuStatus === option.value}
                      onClick={() => {
                        applyAnnotationStatus(nodeMenu.targetIds || [], option.value);
                        setNodeMenu(null);
                      }}
                    />
                  ))}
                  <MenuDivider className="node-menu-divider" />
                  <MenuItem
                    className="node-menu-item clear"
                    label="Clear"
                    danger
                    onClick={() => {
                      applyAnnotationStatus(nodeMenu.targetIds || [], 'none', { clear: true });
                      setNodeMenu(null);
                    }}
                  />
                </MenuPanel>
              )}

              {/* Comment Popover - positioned next to node */}
              {(() => {
                const activeNode = commentingNodeId ? (getNodeById(commentingNodeId) || commentingNodeSnapshot) : null;
                if (!commentingNodeId || !activeNode) return null;
                return (
                <div
                  className={`comment-popover-container ${commentPopoverPos.side}`}
                  style={{
                    position: 'absolute',
                    left: commentPopoverPos.x,
                    top: commentPopoverPos.y,
                    zIndex: 2100,
                  }}
                >
                  <CommentPopover
                    node={activeNode}
                    onClose={() => {
                      setCommentingNodeId(null);
                      setCommentingNodeSnapshot(null);
                    }}
                    onAddComment={addCommentToNode}
                    onToggleCompleted={toggleCommentCompleted}
                    onDeleteComment={deleteComment}
                    collaborators={collaborators}
                    canComment={canComment()}
                    readOnlyMessage={commentPopoverReadOnlyMessage}
                  />
                </div>
                );
              })()}
            </div>
            </div>

            {/* DragOverlay - full-size floating card with children, scaled 5% larger than current zoom */}
            <DragOverlay>
              {activeNode && activeDragData ? (
                <div
                  className="drag-overlay-wrapper"
                  style={{ transform: `scale(${scale * 1.05})`, transformOrigin: 'top left' }}
                >
                  <DragOverlayTree
                    node={activeNode}
                    number={activeDragData.number}
                    color={activeDragData.color}
                    colors={colors}
                    showThumbnails={showThumbnails}
                    depth={0}
                    showPageNumbers={layers.pageNumbers}
                    showAnnotations={isAnnotationVisible(activeNode)}
                  />
                </div>
              ) : null}
            </DragOverlay>

            {/* Drop zone indicators - only show zones near cursor */}
            {activeId && dropZones
              .filter(zone => zone.allowed !== false)
              .filter(zone => {
                // Only show zones within 250px of cursor (screen space)
                const dist = Math.sqrt((dragCursor.x - zone.x) ** 2 + (dragCursor.y - zone.y) ** 2);
                return dist < 250;
              })
              .map((zone, idx) => {
                const isNearest = activeDropZone &&
                  zone.parentId === activeDropZone.parentId &&
                  zone.index === activeDropZone.index &&
                  zone.type === activeDropZone.type;

                // Size based on zone type and layout, scaled to match current zoom
                const baseCardHeight = showThumbnails ? 262 : 200;
                const scaledCardWidth = 288 * scale;
                const scaledCardHeight = baseCardHeight * scale;
                let width, height;
                if (zone.type === 'child') {
                  // Full card size for "new child" positions
                  width = scaledCardWidth;
                  height = scaledCardHeight;
                } else if (zone.layout === 'horizontal') {
                  // Vertical bar for horizontal sibling insertion (between Level 1)
                  width = Math.max(24, 40 * scale);
                  height = scaledCardHeight;
                } else {
                  // Horizontal bar for vertical sibling insertion (between stacked)
                  width = scaledCardWidth;
                  height = Math.max(24, 40 * scale);
                }

                return (
                  <div
                    key={`${zone.type}-${zone.parentId}-${zone.index}-${idx}`}
                    className={`drop-zone-indicator ${zone.type} ${zone.layout || ''} ${isNearest ? 'nearest' : ''}`}
                    style={{
                      left: zone.x - width / 2,
                      top: zone.y - height / 2,
                      width,
                      height,
                    }}
                  />
                );
              })}

            <RightRail
              toolbarProps={{
                canEdit: canEdit(),
                canViewComments: canViewComments(),
                canViewVersionHistory: canViewVersionHistory(),
                activeTool,
                connectionTool,
                onSelectTool: () => {
                  setActiveTool('select');
                  setConnectionTool(null);
                },
                onAddPage: () => {
                  setEditModalNode({ id: '', url: '', title: '', parentId: root ? ORPHAN_PARENT_ID : HOME_PARENT_ID, children: [] });
                  setEditModalMode('add');
                },
                onToggleUserFlow: () => {
                  setConnectionTool(connectionTool === 'userflow' ? null : 'userflow');
                  setActiveTool('select');
                },
                onToggleCrosslink: () => {
                  setConnectionTool(connectionTool === 'crosslink' ? null : 'crosslink');
                  setActiveTool('select');
                },
                showCommentsPanel,
                onToggleCommentsPanel: () => {
                  setShowCommentsPanel((prev) => {
                    const next = !prev;
                    if (next) {
                      markMentionCommentsRead();
                      setShowViewDropdown(false);
                      setShowColorKey(false);
                      setShowOrientationMenu(false);
                      setShowReportDrawer(false);
                      setShowImageReportDrawer(false);
                      setShowProfileDrawer(false);
                      setShowSettingsDrawer(false);
                      setShowVersionHistoryDrawer(false);
                      setShowProjectsModal(false);
                      setShowHistoryModal(false);
                    }
                    return next;
                  });
                },
                hasUnreadCommentMentions,
                showReportDrawer,
                onToggleReportDrawer: () => {
                  setShowReportDrawer((prev) => {
                    const next = !prev;
                    if (next) {
                      setShowViewDropdown(false);
                      setShowColorKey(false);
                      setShowOrientationMenu(false);
                      setShowCommentsPanel(false);
                      setShowImageReportDrawer(false);
                      setShowProfileDrawer(false);
                      setShowSettingsDrawer(false);
                      setShowVersionHistoryDrawer(false);
                      setShowProjectsModal(false);
                      setShowHistoryModal(false);
                    }
                    return next;
                  });
                },
                showLayersMenu: showViewDropdown,
                onToggleLayersMenu: () => {
                  setShowViewDropdown((prev) => {
                    const next = !prev;
                    if (next) {
                      setShowColorKey(false);
                      setShowOrientationMenu(false);
                    }
                    return next;
                  });
                },
                layersMenuRef: viewDropdownRef,
                layersPanel: (
                  <LayersPanel
                    embedded
                    layers={layers}
                    connectionTool={connectionTool}
                    onToggleUserFlows={() => {
                      setLayers((currentLayers) => ({ ...currentLayers, userFlows: !currentLayers.userFlows }));
                      if (layers.userFlows && connectionTool === 'userflow') {
                        setConnectionTool(null);
                      }
                    }}
                    onToggleCrossLinks={() => {
                      setLayers((currentLayers) => ({ ...currentLayers, crossLinks: !currentLayers.crossLinks }));
                      if (layers.crossLinks && connectionTool === 'crosslink') {
                        setConnectionTool(null);
                      }
                    }}
                    onToggleBrokenLinks={() => setLayers((currentLayers) => ({ ...currentLayers, brokenLinks: !currentLayers.brokenLinks }))}
                    connectionAvailability={connectionAvailability}
                    scanLayerAvailability={scanLayerAvailability}
                    scanLayerVisibility={scanLayerVisibility}
                    onToggleScanLayer={(layerKey) => {
                      setScanLayerVisibility((prev) => ({
                        ...prev,
                        [layerKey]: !prev[layerKey],
                      }));
                    }}
                    changeFilters={changeFilters}
                    onToggleChangeStatus={(status) => {
                      setChangeFilters((prev) => ({
                        ...prev,
                        statuses: {
                          ...prev.statuses,
                          [status]: !prev.statuses?.[status],
                        },
                      }));
                    }}
                    changeStatusOptions={markerStatusOptions}
                    showChangeSection={showMarkerSection}
                    showViewDropdown={showViewDropdown}
                    onToggleDropdown={() => setShowViewDropdown((prev) => !prev)}
                    viewDropdownRef={viewDropdownRef}
                  />
                ),
                showLegendMenu: showColorKey,
                onToggleLegendMenu: () => {
                  setShowColorKey((prev) => {
                    const next = !prev;
                    if (next) {
                      setShowViewDropdown(false);
                      setShowOrientationMenu(false);
                    }
                    return next;
                  });
                },
                legendMenuRef: colorKeyRef,
                legendPanel: (
                  <ColorKey
                    embedded
                    showColorKey={showColorKey}
                    onToggle={() => setShowColorKey((currentValue) => !currentValue)}
                    colors={colors}
                    connectionColors={connectionColors}
                    maxDepth={maxDepth}
                    canEdit={canEdit()}
                    editingDepth={editingColorDepth}
                    editingConnectionKey={editingConnectionKey}
                    connectionLegend={connectionLegend}
                    onEditDepth={(depth, position) => {
                      beginColorEdit();
                      setEditingColorDepth(depth);
                      setEditingConnectionKey(null);
                      setColorPickerPosition(position);
                    }}
                    onEditConnectionColor={(key, position) => {
                      beginColorEdit();
                      setEditingConnectionKey(key);
                      setEditingColorDepth(null);
                      setColorPickerPosition(position);
                    }}
                  />
                ),
                mapOrientation,
                showOrientationMenu,
                onToggleOrientationMenu: () => {
                  setShowOrientationMenu((prev) => {
                    const next = !prev;
                    if (next) {
                      setShowViewDropdown(false);
                      setShowColorKey(false);
                    }
                    return next;
                  });
                },
                orientationMenuRef,
                onMapOrientationChange: (nextOrientation) => {
                  setMapOrientation(normalizeMapOrientation(nextOrientation));
                  setShowOrientationMenu(false);
                },
                onToggleImageMenu: () => {
                  if (showImageMenu) {
                    setShowImageMenu(false);
                    return;
                  }
                  setShowViewDropdown(false);
                  setShowColorKey(false);
                  setShowOrientationMenu(false);
                  setShowImageReportDrawer(false);
                  setShowImageMenu(true);
                  validateCurrentMapImageAssets();
                },
                onGetThumbnailsAll: () => handleThumbnailCapture('all'),
                onGetThumbnailsSelected: () => handleThumbnailCapture('selected'),
                onUpdateCapturedThumbnails: () => handleThumbnailCapture('all', 'captured'),
                onGetFullScreenshotsAll: () => handleFullScreenshotCapture('all'),
                onGetFullScreenshotsSelected: () => handleFullScreenshotCapture('selected'),
                onUpdateCapturedFullScreenshots: () => handleFullScreenshotCapture('all', 'captured'),
                onDownloadImagesAll: () => downloadImageAssets('all'),
                onDownloadImagesSelected: () => downloadImageAssets('selected'),
                onToggleThumbnails: () => {
                  setShowThumbnails((prev) => !prev);
                },
                showThumbnails,
                hasAnyThumbnails,
                hasDownloadableThumbnails: hasAnyDownloadableThumbnails,
                hasDownloadableSelectedThumbnails: hasSelectedDownloadableThumbnails,
                hasFullScreenshotAssets: hasAnyFullScreenshotAssets,
                hasSelectedFullScreenshotAssets: hasSelectedFullScreenshotAssets,
                hasDownloadableImages: hasAnyDownloadableImages,
                hasDownloadableSelectedImages: hasSelectedDownloadableImages,
                allThumbnailsCaptured,
                thumbnailsAllLabel: invalidThumbnailAssetIds.size > 0
                  ? 'Retry Missing Thumbnails'
                  : thumbnailCaptureStats.hasPartial
                  ? 'Get Thumbnails (Remaining)'
                  : 'Get Thumbnails (All)',
                thumbnailsSelectedLabel: hasSelectedDownloadableThumbnails
                  ? 'Recapture'
                  : 'Get Thumbnails (Selected)',
                allFullScreenshotsCaptured: fullScreenshotCaptureStats.allCaptured,
                fullScreenshotsAllLabel: invalidFullScreenshotAssetIds.size > 0
                  ? 'Retry Missing Full page'
                  : fullScreenshotCaptureStats.hasPartial
                  ? 'Get Full page (Remaining)'
                  : 'Get Full page (All)',
                fullScreenshotsSelectedLabel: hasSelectedFullScreenshotAssets
                  ? 'Recapture'
                  : 'Get Full page (Selected)',
                captureIssues: visibleCaptureIssues,
                onOpenImageReport: () => {
                  setShowImageMenu(false);
                  setShowImageReportDrawer(true);
                  setShowViewDropdown(false);
                  setShowColorKey(false);
                  setShowCommentsPanel(false);
                  setShowReportDrawer(false);
                  setShowProfileDrawer(false);
                  setShowSettingsDrawer(false);
                  setShowVersionHistoryDrawer(false);
                  setShowProjectsModal(false);
                  setShowHistoryModal(false);
                },
                showImageMenu,
                imageMenuRef,
                hasSelection: selectedNodeIds.size > 0,
                canUndo,
                canRedo,
                undoRedoDisabledReason: liveUndoRedoDisabledReason,
                onUndo: handleUndo,
                onRedo: handleRedo,
                onClearCanvas: clearCanvas,
                onSaveMap: () => {
                  setCreateMapMode(false);
                  setShowSaveMapModal(true);
                },
                isSavingMap,
                onDuplicateMap: duplicateCurrentMap,
                onShowVersionHistory: () => {
                  setShowVersionHistoryDrawer((prev) => {
                    const next = !prev;
                    if (next) {
                      setShowViewDropdown(false);
                      setShowColorKey(false);
                      setShowCommentsPanel(false);
                      setShowReportDrawer(false);
                      setShowImageReportDrawer(false);
                      setShowProfileDrawer(false);
                      setShowSettingsDrawer(false);
                      setShowProjectsModal(false);
                      setShowHistoryModal(false);
                    }
                    return next;
                  });
                },
                onExport: () => {
                  setShowViewDropdown(false);
                  setShowColorKey(false);
                  setShowExportModal(true);
                },
                onShare: () => {
                  setShowViewDropdown(false);
                  setShowColorKey(false);
                  setShowShareModal(true);
                },
                canOpenShare: canOpenShareModalValue,
                hasMap,
                hasSavedMap: !!currentMap?.id,
                showVersionHistory: showVersionHistoryDrawer,
                shareDisabledReason: 'Save this map before sharing',
                onBlockedShareAttempt: () => showToast('Save this map before sharing', 'info'),
              }}
              zoomProps={{
                scale,
                minScale: zoomBounds.min,
                maxScale: zoomBounds.max,
                onZoomOut: zoomOut,
                onZoomIn: zoomIn,
                onResetView: resetView,
                onToggleMinimap: () => setShowMinimap((prev) => !prev),
                showMinimap,
              }}
              minimapProps={{
                isOpen: showMinimap,
                layout: mapLayout,
                bounds: worldBounds,
                canvasSize,
                pan,
                scale,
                minScale: zoomBounds.min,
                maxScale: zoomBounds.max,
                colors,
                onPanTo: panToWorldPoint,
                onCenterOn: centerOnWorldPoint,
                onZoomTo: zoomTo,
                onZoomIn: zoomIn,
                onZoomOut: zoomOut,
              }}
            />
            <ReportDrawer
              isOpen={showReportDrawer}
              onClose={() => setShowReportDrawer(false)}
              entries={reportRows}
              stats={reportStats}
              typeOptions={REPORT_TYPE_OPTIONS}
              onDownload={downloadReportPdf}
              insights={mapInsights}
              insightsLoading={insightsLoading}
              insightsError={insightsError}
              onRunInsights={runMapInsights}
              onLocateNode={locateReportNodeOnMap}
              onLocateUrl={locateReportUrlOnMap}
              reportTitle={reportTitle}
              reportTimestamp={reportTimestamp}
              scanMeta={scanMeta}
            />
            <ImageReportDrawer
              isOpen={showImageReportDrawer}
              onClose={() => setShowImageReportDrawer(false)}
              issues={visibleCaptureIssues}
              onSelectIssue={selectCaptureIssue}
              onOpenIssueUrl={openCaptureIssueUrl}
              selectedNodeIds={selectedNodeIds}
              onSelectionChange={(nodeIds) => setSelectedNodeIds(new Set(nodeIds))}
              onCaptureSelectedThumbnails={() => handleThumbnailCapture('selected')}
              onCaptureSelectedScreenshots={() => handleFullScreenshotCapture('selected')}
              onRetryMissingThumbnails={() => handleThumbnailCapture('all')}
              onRetryMissingScreenshots={() => handleFullScreenshotCapture('all')}
              hasMissingThumbnails={invalidThumbnailAssetIds.size > 0}
              hasMissingScreenshots={invalidFullScreenshotAssetIds.size > 0}
              reportTitle={reportTitle}
            />
          </DndContext>
        )}
        {(showThumbnails || thumbnailStats.mode === 'screenshot') && thumbnailStats.total > 0 && (() => {
          const backendCaptureActive = Boolean(activeImageCaptureJob?.jobId);
          if (!backendCaptureActive && !shouldShowImageCaptureProgressToast(thumbnailStats)) return null;
          const total = thumbnailStats.total || 0;
          if (total <= 0) return null;
          const saved = Math.max(0, Number(thumbnailStats.saved ?? thumbnailStats.verified ?? thumbnailStats.captured ?? 0) || 0);
          const verified = Math.max(saved, Number(thumbnailStats.verified ?? saved) || 0);
          const settled = Math.min(
            total,
            saved + (thumbnailStats.failed || 0) + (thumbnailStats.skipped || 0)
          );
          const completed = Math.max(thumbnailStats.completed || 0, settled);
          const remaining = Math.max(0, total - settled);
          if (remaining <= 0 && !thumbnailStats.finalizing && !backendCaptureActive) return null;
          const cached = thumbnailStats.cached || 0;
          const unavailable = thumbnailStats.unavailable || 0;
          const skipped = thumbnailStats.skipped || 0;
          const captured = verified;
          const isScreenshotCapture = thumbnailStats.mode === 'screenshot';
          const fallbackItemMs = isScreenshotCapture ? 30000 : 12000;
          const elapsedItemMs = completed > 0
            ? Math.ceil(Math.max(thumbnailElapsedMs, 1000) / completed)
            : 0;
          const estimateItemMs = Math.max(thumbnailStats.avgMs || 0, elapsedItemMs, fallbackItemMs);
          const activeConcurrency = isScreenshotCapture ? FULL_SCREENSHOT_CONCURRENCY : MAX_THUMBNAIL_CONCURRENCY;
          const etaConcurrency = activeConcurrency;
          const etaMs = Math.ceil((remaining * estimateItemMs) / Math.max(1, etaConcurrency));
          const captureLabel = isScreenshotCapture ? 'Screenshots' : 'Thumbnails';
          const title = `${captureLabel}: ${captured} of ${total} saved`;
          const isPaused = thumbnailStats.paused || activeImageCaptureJob?.status === 'paused';
          const isRecoveryPhase = thumbnailStats.phase === 'recovering' || thumbnailStats.phase === 'recovery';
          const phaseTextByKey = {
            preparing: 'Preparing',
            capturing: 'Capturing',
            recovering: 'Retrying slow pages',
            saving: 'Saving',
            complete: 'Complete',
            needs_review: 'Needs review',
          };
          const stageLabel = thumbnailStats.stageTotal > 1
            ? `Stage ${thumbnailStats.stageIndex || 1} of ${thumbnailStats.stageTotal}`
            : '';
          const phaseLabel = isPaused
            ? 'Paused'
            : [stageLabel, phaseTextByKey[thumbnailStats.phase] || 'Capturing'].filter(Boolean).join(' · ');
          const shouldShowFailureCount = thumbnailStats.failed > 0
            && (!backendCaptureActive || thumbnailStats.phase === 'complete' || thumbnailStats.phase === 'needs_review');
          const metaParts = [
            backendCaptureActive ? phaseLabel : '',
            backendCaptureActive && remaining <= 0 && !thumbnailStats.finalizing ? 'finishing save' : '',
            isRecoveryPhase && thumbnailStats.retrying > 0 ? `${thumbnailStats.retrying} retrying` : '',
            cached > 0 ? `${cached} already had images` : '',
            unavailable > 0 ? `${unavailable} unavailable` : '',
            skipped > 0 ? `${skipped} skipped` : '',
            shouldShowFailureCount ? `${thumbnailStats.failed} failed` : '',
          ].filter(Boolean);
          return (
            <Toast
              type="loading"
              className="image-capture-toast"
              title={title}
              icon={false}
              action={(
                <div className="image-capture-toast__actions">
                  {backendCaptureActive && (
                    <Button
                      type="secondary"
                      buttonStyle="mono"
                      size="sm"
                      onClick={isPaused ? resumeImageCaptureNow : pauseImageCaptureNow}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      {isPaused ? 'Resume' : 'Pause'}
                    </Button>
                  )}
                  <Button
                    type="secondary"
                    buttonStyle="mono"
                    size="sm"
                    onClick={() => stopThumbnailCaptureNow(true)}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    Stop
                  </Button>
                </div>
              )}
            >
              <div className="image-capture-toast__body">
                {metaParts.length > 0 && (
                  <span className="image-capture-toast__meta">
                    {metaParts.join(' • ')}
                  </span>
                )}
                <span className="image-capture-toast__line">
                  {formatDuration(thumbnailElapsedMs)} | ETA ~{formatDuration(etaMs)}
                </span>
                <span className="image-capture-toast__bar" aria-hidden="true" />
              </div>
            </Toast>
          );
        })()}
      </div>

      <FeedbackWidget
        currentRoute={currentRoute}
        currentUser={currentUser}
        currentMapId={currentMap?.id || null}
        activeSurfaces={{
          commentsPanel: showCommentsPanel,
          reportDrawer: showReportDrawer,
          imageReportDrawer: showImageReportDrawer,
          shareModal: showShareModal,
          exportModal: showExportModal,
          projectsModal: showProjectsModal,
          historyModal: showHistoryModal,
          authModal: showAuthModal,
          profileDrawer: showProfileDrawer,
          settingsDrawer: showSettingsDrawer,
          versionHistoryDrawer: showVersionHistoryDrawer,
          inviteInboxModal: showInviteInboxModal,
          accessRequestsInboxModal: showAccessRequestsInboxModal,
        }}
        showToast={showToast}
      />

      {/* Comments Panel - Right Rail */}
      {showCommentsPanel && (
        <CommentsPanel
          root={renderRoot}
          orphans={visibleOrphans}
          onClose={() => setShowCommentsPanel(false)}
          onCommentClick={(nodeId) => {
            // Small delay to let animated pan complete before calculating popover position
            setTimeout(() => openCommentPopover(nodeId), 480);
          }}
          onNavigateToNode={focusNodeById}
        />
      )}

      <EditColorModal
        depth={editingConnectionKey ?? editingColorDepth}
        color={editingConnectionKey
          ? (connectionColors[editingConnectionKey] || DEFAULT_CONNECTION_COLORS[editingConnectionKey])
          : (editingColorDepth !== null ? colors[editingColorDepth] : '#000000')}
        onChange={(color) => {
          if (editingConnectionKey) {
            updateConnectionColor(editingConnectionKey, color);
            return;
          }
          if (editingColorDepth !== null) {
            updateLevelColor(editingColorDepth, color);
          }
        }}
        onClose={() => {
          commitColorUndoIfChanged();
          setEditingColorDepth(null);
          setEditingConnectionKey(null);
          setColorPickerPosition(null);
        }}
        position={colorPickerPosition}
      />

      <ExportModal
        show={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExportAiSiteBrief={() => { exportAiSiteBrief(); setShowExportModal(false); }}
        onExportPng={() => { setShowExportModal(false); exportPng(); }}
        onExportPdf={() => { setShowExportModal(false); exportPdf(); }}
        onExportCsv={() => { exportCsv(); setShowExportModal(false); }}
        onExportJson={() => { exportJson(); setShowExportModal(false); }}
        onExportSiteIndex={() => { exportSiteIndex(); setShowExportModal(false); }}
      />

      <ShareModal
        show={showShareModal}
        onClose={() => {
          setShowShareModal(false);
          setShareEmails('');
          setLinkCopied(false);
          setSharePermission(ACCESS_LEVELS.VIEW);
          setCollaborationInviteEmail('');
          setCollaborationInviteRole('viewer');
          setCollaborationError('');
          setCollaborationSettings(null);
          setCollaborationAccessRequests([]);
        }}
        accessLevels={ACCESS_LEVELS}
        sharePermission={sharePermission}
        onChangePermission={(permission) => setSharePermission(permission)}
        linkCopied={linkCopied}
        onCopyLink={() => copyShareLink(sharePermission)}
        canShareLinks={canManageShares()}
        shareEmails={shareEmails}
        onShareEmailsChange={setShareEmails}
        onSendEmail={sendShareEmail}
        collaborationEnabled={COLLABORATION_UI_ENABLED && isLoggedIn && currentMap?.id && (
          canViewCollaborationPanel()
          || canSelfServeCollaborationValue
        )}
        collaborationAvailable={Boolean(currentMap?.id)}
        collaborationLoading={collaborationLoading}
        collaborationError={collaborationError}
        collaborationInviteEmail={collaborationInviteEmail}
        onCollaborationInviteEmailChange={setCollaborationInviteEmail}
        collaborationInviteRole={collaborationInviteRole}
        onCollaborationInviteRoleChange={setCollaborationInviteRole}
        collaborationCapabilities={collaborationCapabilities}
        collaborationInviteRoleOptions={collaborationInviteRoleOptionsValue}
        onSendCollaborationInvite={sendCollaborationInvite}
        canSendCollaborationInvites={canSendCollaborationInvites()}
        currentCollaborationRole={currentCollaborationRole}
        currentUserId={currentUser?.id || null}
        collaborationMemberships={collaborationMemberships}
        collaborationInvites={collaborationInvites}
        collaborationSettings={collaborationSettings}
        collaborationAccessRequests={collaborationAccessRequests}
        canManageCollaborationSettings={canManageCollaborationSettings()}
        canManageCollaborationMembers={canManageCollaborationMembersValue}
        canViewAccessRequests={canViewAccessRequests()}
        onUpdateCollaborationSettings={updateCollaborationSettings}
        onUpdateCollaborationMemberRole={updateCollaborationMemberRole}
        onRemoveCollaborationMember={removeCollaborationMember}
        onRevokeCollaborationInvite={revokeCollaborationInvite}
        onReviewCollaborationAccessRequest={reviewCollaborationAccessRequest}
      />

      <InviteInboxModal
        show={showInviteInboxModal}
        invites={pendingMapInvites}
        loading={pendingMapInvitesLoading}
        error={pendingMapInvitesError}
        onClose={() => {
          setShowInviteInboxModal(false);
          setPendingMapInvitesError('');
          if (currentRoute?.surface === ROUTE_SURFACES.APP && currentRoute?.section === 'invites') {
            navigateToRoute(getActiveAppRoute(), { replace: true });
          }
        }}
        onRefresh={() => loadPendingMapInvites()}
        onAccept={handleAcceptPendingInvite}
        onDecline={handleDeclinePendingInvite}
      />

      <AccessRequestInboxModal
        show={showAccessRequestsInboxModal}
        requests={pendingAccessRequests}
        loading={pendingAccessRequestsLoading}
        error={pendingAccessRequestsError}
        onClose={() => {
          setShowAccessRequestsInboxModal(false);
          setPendingAccessRequestsError('');
          if (currentRoute?.surface === ROUTE_SURFACES.APP && currentRoute?.section === 'access_requests') {
            navigateToRoute(getActiveAppRoute(), { replace: true });
          }
        }}
        onRefresh={() => loadPendingAccessRequests()}
        onApprove={handleApprovePendingAccessRequest}
        onDeny={handleDenyPendingAccessRequest}
      />

      <SaveMapModal
        key={saveMapModalKey}
        show={showSaveMapModal}
        onClose={() => {
          setShowSaveMapModal(false);
          setCreateMapMode(false);
          setCreateMapDefaults(null);
          setPendingCreateAfterSave(null);
          setPendingLogoutAfterSave(false);
          setDuplicateMapConfig(null);
          setPendingLoadMap(null);
        }}
        isLoggedIn={isLoggedIn}
        onRequireLogin={() => {
          setShowSaveMapModal(false);
          setCreateMapMode(false);
          setCreateMapDefaults(null);
          setPendingCreateAfterSave(null);
          setPendingLogoutAfterSave(false);
          setDuplicateMapConfig(null);
          setPendingLoadMap(null);
          openAuthModal();
        }}
        projects={projects}
        currentMap={currentMap}
        rootUrl={root?.url}
        defaultProjectId={saveMapModalProjectId}
        defaultName={saveMapModalName}
        defaultNotes={saveMapModalNotes}
        onSave={createMapMode ? startBlankMapCreation : (duplicateMapConfig ? handleDuplicateMapSave : saveMap)}
        onCreateProject={createProject}
        title={createMapMode ? 'Create Map' : (duplicateMapConfig ? 'Duplicate Map' : 'Save Map')}
        submitLabel={createMapMode ? 'Create' : (duplicateMapConfig ? 'Duplicate Map' : 'Save Map')}
        submitLoadingLabel={createMapMode ? 'Creating' : (duplicateMapConfig ? 'Duplicating' : 'Saving')}
        saving={isSavingMap}
      />

      <ProjectsModal
        show={showProjectsModal}
        onClose={() => {
          setShowProjectsModal(false);
          setEditingProjectId(null);
          setEditingMapId(null);
        }}
        isLoggedIn={isLoggedIn}
        projects={projects}
        expandedProjects={expandedProjects}
        editingProjectId={editingProjectId}
        editingProjectName={editingProjectName}
        editingMapId={editingMapId}
        editingMapName={editingMapName}
        onToggleProjectExpanded={toggleProjectExpanded}
        onEditProjectNameChange={setEditingProjectName}
        onEditProjectNameStart={(projectId, projectName) => {
          setEditingProjectId(projectId);
          setEditingProjectName(projectName);
          setEditingMapId(null);
        }}
        onEditProjectNameCancel={() => setEditingProjectId(null)}
        onRenameProject={renameProject}
        onEditMapNameChange={setEditingMapName}
        onEditMapNameStart={(mapId, mapName) => {
          setEditingMapId(mapId);
          setEditingMapName(mapName);
          setEditingProjectId(null);
        }}
        onEditMapNameCancel={() => setEditingMapId(null)}
        onRenameMap={renameMap}
        onDeleteProject={deleteProject}
        onLoadMap={handleLoadMapRequest}
        onDeleteMap={deleteMap}
        onMoveMap={moveMapToProject}
        onAddMap={(projectId) => openCreateMapFlow({ defaultProjectId: projectId })}
        onAddProject={async () => {
          const name = await showPrompt({
            title: 'New Project',
            message: 'Enter a name for the new project:',
            placeholder: 'Project name'
          });
          if (name) await createProject(name);
        }}
      />

      <HistoryModal
        show={showHistoryModal}
        onClose={() => { setShowHistoryModal(false); setSelectedHistoryItems(new Set()); }}
        scanHistory={scanHistory}
        selectedHistoryItems={selectedHistoryItems}
        onToggleSelection={toggleHistorySelection}
        onSelectAllToggle={selectedHistoryItems.size === scanHistory.length ? clearHistorySelection : selectAllHistory}
        onDeleteSelected={deleteSelectedHistory}
        onLoadFromHistory={loadFromHistory}
      />

      <ScanProgressModal
        loading={loading}
        showCancelConfirm={showCancelConfirm}
        showStopConfirm={showStopConfirm}
        isStoppingScan={isStoppingScan}
        scanErrorMessage={scanErrorMessage}
        scanMessage={scanMessage}
        scanProgress={scanProgress}
        scanElapsed={scanElapsed}
        urlInput={urlInput}
        onRequestCancel={requestCancelScan}
        onRequestStop={requestStopScan}
        onStopScan={stopScan}
        onCancelScan={cancelScan}
        onContinueScan={dismissScanConfirm}
        onDismissScanError={dismissScanError}
      />

      <ImageOverlay
        imageUrl={fullImageUrl}
        loading={imageLoading}
        onClose={() => { setFullImageUrl(null); setImageLoading(false); }}
        onLoad={() => setImageLoading(false)}
        onError={() => {
          setImageLoading(false);
          showToast('Failed to load screenshot', 'error');
          setFullImageUrl(null);
        }}
      />

      <WelcomeModal
        show={showWelcomeModal}
        dontShowAgain={isLoggedIn ? welcomeDontShowAgain : false}
        disableDontShowAgain={!isLoggedIn}
        onToggleDontShowAgain={() => {
          if (!isLoggedIn) return;
          setWelcomeDontShowAgain((prev) => !prev);
        }}
        onClose={dismissWelcomeModal}
        onConfirm={dismissWelcomeModal}
      />

      {showAuthModal && (
        <AuthModal
          onClose={closeAuthModal}
          onSuccess={handleAuthSuccess}
          onDemo={handleDemoAccess}
          contextMessage={authContextMessage}
          showToast={showToast}
        />
      )}

      <ProfileDrawer
        isOpen={showProfileDrawer}
        user={currentUser}
        onClose={() => setShowProfileDrawer(false)}
        onUpdate={(updatedUser) => setCurrentUser(updatedUser)}
        onLogout={handleLogout}
        showToast={showToast}
      />

      <SettingsDrawer
        isOpen={showSettingsDrawer}
        onClose={() => setShowSettingsDrawer(false)}
        theme={theme}
        onThemeChange={setTheme}
        showPageNumbers={layers.pageNumbers}
        onTogglePageNumbers={() => setLayers(prev => ({ ...prev, pageNumbers: !prev.pageNumbers }))}
        consent={consent}
        onOpenPrivacySettings={openPrivacySettings}
      />

      <VersionHistoryDrawer
        isOpen={showVersionHistoryDrawer}
        onClose={() => setShowVersionHistoryDrawer(false)}
        versions={versionsForDrawer}
        onRestoreVersion={restoreVersion}
        onSelectActivity={handleActivitySelect}
        activeVersionId={activeVersionForDrawer}
        latestVersionId={latestVersionForDrawer}
        isLoading={isVersionLoading}
        onBookmarkVersion={handleBookmarkVersion}
        canBookmarkVersion={canSaveVersion()}
        canViewActivity={canViewActivity()}
        currentUser={currentUser}
        activity={activityForDrawer}
        isActivityLoading={isActivityDrawerLoading}
      />

      <VersionEditPromptModal
        show={showVersionEditPrompt}
        onSaveCopy={handleSaveVersionCopy}
        onOverride={handleOverrideVersion}
      />

      {editModalNode && (
        <EditNodeModal
          node={editModalNode}
          allNodes={parentOptions}
          rootTree={root}
          onClose={() => setEditModalNode(null)}
          onSave={saveNodeChanges}
          onUploadNodeImageAsset={uploadNodeImageAsset}
          onDelete={(nodeId) => {
            setEditModalNode(null);
            requestDeleteNode(nodeId);
          }}
          onLocateUrl={locateUrlOnMap}
          canLocateUrl={canLocateUrlOnMap}
          mode={editModalMode}
          allowDelete={editModalNode.id !== root?.id}
          customPageTypes={customPageTypes}
          onAddCustomType={(type) => setCustomPageTypes(prev => [...prev, type])}
          specialParentOptions={specialParentOptions}
          isHomePageCreation={editModalMode === 'add' && !root}
          insightSummary={getPageInsightForNode(editModalNode)}
        />
      )}


      <DeleteConfirmModal
        node={deleteConfirmNode}
        onCancel={() => setDeleteConfirmNode(null)}
        onConfirm={confirmDeleteNode}
      />

      {/* Create Map Modal */}
      <CreateMapModal
        show={showCreateMapModal}
        onClose={() => setShowCreateMapModal(false)}
        onStartFromScratch={() => {
          setCreateMapMode(true);
          setShowSaveMapModal(true);
        }}
        onImportFromFile={() => setShowImportModal(true)}
      />

      <ImportModal
        show={showImportModal}
        onClose={() => setShowImportModal(false)}
        onDrop={handleImportDrop}
        onDragOver={handleImportDragOver}
        onDragLeave={handleImportDragLeave}
        onFileChange={handleFileImport}
        loading={importLoading}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={dismissToast}
        />
      )}

      {/* Generic Confirmation Modal */}
      {confirmModal && (
        <Modal
          show={!!confirmModal}
          onClose={confirmModal.onCancel}
          title={confirmModal.title}
          size="sm"
          className="confirm-modal"
          footer={(
            <>
              <Button variant="secondary" onClick={confirmModal.onCancel}>
                {confirmModal.cancelText}
              </Button>
              <Button
                variant={confirmModal.danger ? 'danger' : 'primary'}
                onClick={confirmModal.onConfirm}
              >
                {confirmModal.confirmText}
              </Button>
            </>
          )}
        >
          <p>{confirmModal.message}</p>
        </Modal>
      )}

      {/* Generic Prompt Modal */}
      {promptModal && (
        <PromptModal
          title={promptModal.title}
          message={promptModal.message}
          placeholder={promptModal.placeholder}
          defaultValue={promptModal.defaultValue}
          onConfirm={promptModal.onConfirm}
          onCancel={promptModal.onCancel}
        />
      )}
    </div>
    </AuthProvider>
  );
}

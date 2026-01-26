import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
  MessageSquare,
  Moon,
  Sun,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';

import './App.css';
import * as api from './api';
import LandingPage from './LandingPage';
import { DraggableNodeCard, DragOverlayTree } from './components/nodes/NodeCard';
import CommentPopover from './components/comments/CommentPopover';
import CommentsPanel from './components/comments/CommentsPanel';
import AuthModal from './components/modals/AuthModal';
import CreateMapModal from './components/modals/CreateMapModal';
import DeleteConfirmModal from './components/modals/DeleteConfirmModal';
import EditNodeModal from './components/modals/EditNodeModal';
import EditColorModal from './components/modals/EditColorModal';
import ExportModal from './components/modals/ExportModal';
import HistoryModal from './components/modals/HistoryModal';
import ImageOverlay from './components/modals/ImageOverlay';
import ImportModal from './components/modals/ImportModal';
import ProfileModal from './components/modals/ProfileModal';
import ProjectsModal from './components/modals/ProjectsModal';
import PromptModal from './components/modals/PromptModal';
import ReportDrawer from './components/reports/ReportDrawer';
import SaveMapModal from './components/modals/SaveMapModal';
import ShareModal from './components/modals/ShareModal';
import ScanProgressModal from './components/scan/ScanProgressModal';
import RightRail from './components/toolbar/RightRail';
import Topbar from './components/toolbar/Topbar';
import { getHostname } from './utils/url';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4002';
const DEFAULT_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// Permission levels for sharing
const ACCESS_LEVELS = {
  VIEW: 'view',       // Can only look at map
  COMMENT: 'comment', // Can view + add comments
  EDIT: 'edit'        // Full access (owner)
};

const SCAN_MESSAGES = [
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

const sanitizeUrl = (raw) => {
  if (!raw) return '';
  let t = raw.trim();

  // Add https:// if no protocol specified
  if (t && !t.match(/^https?:\/\//i)) {
    t = 'https://' + t;
  }

  try {
    const u = new URL(t);
    return u.toString();
  } catch {
    return '';
  }
};

const downloadText = (filename, text) => {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const REPORT_TYPE_OPTIONS = [
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

const getReportTypesForNode = (node, overrides = {}) => {
  const types = new Set();
  if (!node) return [];
  const orphanType = overrides.orphanType ?? node.orphanType;
  const isSubdomain = overrides.isSubdomain ?? node.subdomainRoot;
  if (!node.isMissing
    && !node.isDuplicate
    && !node.isBroken
    && !node.isInactive
    && !node.isError
    && !node.isFile
    && !node.authRequired
    && orphanType !== 'broken'
    && orphanType !== 'inactive'
    && orphanType !== 'file'
    && orphanType !== 'orphan'
    && !isSubdomain) {
    types.add('standard');
  }
  if (node.isMissing) types.add('missing');
  if (node.isDuplicate) types.add('duplicates');
  if (node.isBroken || orphanType === 'broken') types.add('brokenLinks');
  if (node.isInactive || orphanType === 'inactive') types.add('inactivePages');
  if (node.isError) types.add('errorPages');
  if (orphanType === 'orphan') types.add('orphanPages');
  if (isSubdomain) types.add('subdomains');
  if (node.isFile || orphanType === 'file') types.add('files');
  if (node.authRequired) types.add('authenticatedPages');
  return Array.from(types);
};

const getReportPageType = (node, overrides = {}) => {
  if (!node) return 'Standard';
  const orphanType = overrides.orphanType ?? node.orphanType;
  const isSubdomain = overrides.isSubdomain ?? node.subdomainRoot;
  if (isSubdomain) return 'Subdomain';
  if (orphanType === 'file' || node.isFile) return 'File';
  if (orphanType === 'orphan') return 'Orphan';
  if (node.isMissing) return 'Missing';
  if (node.isDuplicate) return 'Duplicate';
  return 'Standard';
};

const buildReportEntries = (rootNode, orphanNodes, reportNumberMap, reportLayout, colors) => {
  const entries = [];
  const visit = (node, context) => {
    if (!node) return;
    const isSubdomain = context.isSubdomain || node.subdomainRoot;
    const orphanType = context.orphanType || node.orphanType || null;
    const number = reportNumberMap.get(node.id) || '';
    const depth = reportLayout?.nodes.get(node.id)?.depth ?? 0;
    const levelColor = colors[Math.min(depth, colors.length - 1)] || colors[0];
    const titleValue = node.title || node.url || '';
    const showFullTitle = titleValue.length > 24;
    entries.push({
      id: node.id,
      title: titleValue,
      url: node.url || '',
      number,
      types: getReportTypesForNode(node, { isSubdomain, orphanType }),
      duplicateOf: node.duplicateOf || '',
      parentUrl: node.parentUrl || '',
      referrerUrl: node.referrerUrl || '',
      pageType: getReportPageType(node, { isSubdomain, orphanType }),
      levelColor,
      thumbnailUrl: node.thumbnailUrl || '',
      showFullTitle,
    });
    node.children?.forEach((child) => visit(child, { isSubdomain, orphanType }));
  };

  visit(rootNode, { isSubdomain: false, orphanType: null });
  (orphanNodes || []).forEach((orphan) => {
    visit(orphan, {
      isSubdomain: !!orphan?.subdomainRoot,
      orphanType: orphan?.orphanType || null,
    });
  });

  return entries;
};

const parsePageNumber = (raw) => {
  if (!raw) return [];
  const value = String(raw);
  if (value.startsWith('s')) {
    return value
      .slice(1)
      .split('.')
      .map((part) => Number.parseInt(part, 10));
  }
  return value.split('.').map((part) => Number.parseInt(part, 10));
};

const comparePageNumbers = (a, b) => {
  const aParts = parsePageNumber(a);
  const bParts = parsePageNumber(b);
  const max = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < max; i += 1) {
    const av = aParts[i] ?? -1;
    const bv = bParts[i] ?? -1;
    if (av === bv) continue;
    return av - bv;
  }
  return 0;
};

const buildExpandedStackMap = (rootNode, orphanNodes = []) => {
  const expanded = {};
  const walk = (node) => {
    if (!node) return;
    if (node.children?.length) {
      expanded[node.id] = true;
      node.children.forEach(walk);
    }
  };
  walk(rootNode);
  orphanNodes.forEach(walk);
  return expanded;
};


const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const getMaxDepth = (node, depth = 0) => {
  if (!node) return 0;
  if (!node.children?.length) return depth;
  return Math.max(...node.children.map(c => getMaxDepth(c, depth + 1)));
};

const countNodes = (node) => {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum, c) => sum + countNodes(c), 0);
};

// ============================================================================
// LAYOUT CONSTANTS (Single Source of Truth)
// ============================================================================
const LAYOUT = {
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

// Get node height based on display mode
const getNodeH = (showThumbnails) => showThumbnails ? LAYOUT.NODE_H_THUMB : LAYOUT.NODE_H_COLLAPSED;

// Minimum number of similar children to trigger stacking
const STACK_THRESHOLD = 5;

const normalizePathname = (url) => {
  try {
    const pathname = new URL(url).pathname || '/';
    const trimmed = pathname.replace(/\/+$/, '');
    return trimmed === '' ? '/' : trimmed;
  } catch {
    return null;
  }
};

const getPathSegments = (pathname) => pathname.split('/').filter(Boolean);

const getTitlePrefix = (title) => {
  const cleaned = (title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(' ');
};

const getSlugPattern = (slug) => {
  if (!slug) return '';
  if (/^\d+$/.test(slug)) return '#';
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(slug)) return 'date';
  if (/^[a-z0-9]+$/i.test(slug) && /[a-z]/i.test(slug) && /\d/.test(slug) && slug.length >= 8) {
    return 'id';
  }
  if (/^[0-9a-f]{8,}$/i.test(slug)) return 'hex';
  if (/^page[-_]?(\d+)$/.test(slug.toLowerCase())) return 'page-#';
  return slug.replace(/\d+/g, '#');
};

const getMostCommon = (items) => {
  const counts = new Map();
  items.forEach((item) => {
    if (!item) return;
    counts.set(item, (counts.get(item) || 0) + 1);
  });
  let bestValue = null;
  let bestCount = 0;
  counts.forEach((count, value) => {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  });
  return { value: bestValue, count: bestCount };
};

// Check if children should be stacked (many similar siblings with same URL pattern)
const shouldStackChildren = (children, depth) => {
  if (!children || children.length < STACK_THRESHOLD) return false;
  // Don't stack root level children (main nav items)
  if (depth < 1) return false;

  const pathInfo = children
    .map((child) => {
      const pathname = normalizePathname(child.url);
      if (!pathname) return null;
      const segments = getPathSegments(pathname);
      const slug = segments[segments.length - 1] || '';
      const prefix = segments.length > 1 ? `/${segments.slice(0, -1).join('/')}` : pathname;
      return { prefix, slug };
    })
    .filter(Boolean);

  if (pathInfo.length < STACK_THRESHOLD) return false;

  const prefixes = pathInfo.map((item) => item.prefix).filter(Boolean);
  const slugPatterns = pathInfo.map((item) => getSlugPattern(item.slug)).filter(Boolean);
  const titlePrefixes = children.map((child) => getTitlePrefix(child.title)).filter(Boolean);

  const prefixCommon = getMostCommon(prefixes);
  const slugCommon = getMostCommon(slugPatterns);
  const titleCommon = getMostCommon(titlePrefixes);

  const prefixRatio = prefixes.length ? prefixCommon.count / prefixes.length : 0;
  const slugRatio = slugPatterns.length ? slugCommon.count / slugPatterns.length : 0;
  const titleRatio = titlePrefixes.length ? titleCommon.count / titlePrefixes.length : 0;

  const strongPrefix = prefixCommon.value && prefixRatio >= 0.75;
  const strongSlug = slugCommon.value && slugRatio >= 0.7;
  const strongTitle = titleCommon.value && titleRatio >= 0.7;
  const hasNumberedSlugs = pathInfo.filter((item) => /^\d+$/.test(item.slug)).length / pathInfo.length >= 0.6;
  const hasIdSlugs = pathInfo.filter((item) => /[a-z]/i.test(item.slug || '') && /\d/.test(item.slug || '') && (item.slug || '').length >= 8).length / pathInfo.length >= 0.6;

  if (strongPrefix && (strongSlug || strongTitle || prefixRatio >= 0.9)) return true;
  if (strongSlug && strongTitle) return true;
  if (strongSlug && prefixRatio >= 0.6) return true;
  if (strongTitle && prefixRatio >= 0.6) return true;
  if (strongPrefix && hasNumberedSlugs) return true;
  if (strongPrefix && hasIdSlugs) return true;
  if (prefixCommon.value && prefixRatio >= 0.85) return true;

  return false;
};



// ============================================================================
// RUNTIME INVARIANT CHECKS (Development Only)
// ============================================================================
const checkLayoutInvariants = (nodes, orphans, connectors) => {
  if (process.env.NODE_ENV !== 'development') return;

  const { NODE_W, GAP_L1_X } = LAYOUT;
  const orphanNodes = Array.from(nodes.values())
    .filter(n => n.isOrphan && n.orphanStyle !== 'subdomain')
    .sort((a, b) => a.x - b.x);
  const subdomainNodes = Array.from(nodes.values())
    .filter(n => n.isOrphan && n.orphanStyle === 'subdomain')
    .sort((a, b) => a.x - b.x);
  const level1Nodes = Array.from(nodes.values()).filter(n => n.depth === 1);

  // A) Orphan spacing invariant
  for (let j = 1; j < orphanNodes.length; j++) {
    const gap = orphanNodes[j].x - orphanNodes[j - 1].x;
    const expected = NODE_W + GAP_L1_X;
    if (Math.abs(gap - expected) > 1) {
      console.warn(`Invariant A violated: orphan spacing. Got ${gap}, expected ${expected}`);
    }
  }

  // A2) Subdomain spacing invariant
  for (let j = 1; j < subdomainNodes.length; j++) {
    const gap = subdomainNodes[j].x - subdomainNodes[j - 1].x;
    const expected = NODE_W + GAP_L1_X;
    if (Math.abs(gap - expected) > 1) {
      console.warn(`Invariant A2 violated: subdomain spacing. Got ${gap}, expected ${expected}`);
    }
  }

  // B) Level 1 row Y invariant
  if (level1Nodes.length > 0) {
    const baseY = level1Nodes[0].y;
    level1Nodes.forEach((n, i) => {
      if (Math.abs(n.y - baseY) > 1) {
        console.warn(`Invariant C violated: Level 1 node ${i} Y mismatch`);
      }
    });
    // NOTE: Orphans may be on root row (after-root mode) or on level1 row (after-tree mode).
    // So we do NOT enforce orphan Y == level1 Y.

  }

  // D) Depth indentation invariant (spot check)
  nodes.forEach((node, id) => {
    if (node.depth >= 2) {
      // Find parent - this would need parent tracking for full check
      // For now just verify x increases with depth
    }
  });
};

// ============================================================================
// SITEMAP TREE COMPONENT (Deterministic Layout with Absolute Positioning)
// ============================================================================

// ============================================================================
// DETERMINISTIC LAYOUT ENGINE (Absolute x/y coordinates + connectors)
// NOTE: Must be declared ABOVE SitemapTree (arrow functions are not hoisted).
// ============================================================================
/**
 * Compute layout positions for all nodes
 * Returns: { nodes: Map<id, {x, y, w, h, depth, number}>, connectors: [], bounds: {w, h} }
 *
 * Orphan behavior is controlled via options:
 * - orphanMode: 'after-root' | 'after-tree'
 * - orphanStyle: 'root' | 'level1'
 * - renderOrphanChildren: boolean (kept false by default; see note inside)
 */
const computeLayout = (
  root,
  orphans,
  showThumbnails,
  expandedStacks = {},
  options = {}
) => {
  const NODE_H = getNodeH(showThumbnails);
  const {
    NODE_W,
    GAP_L1_X,
    GAP_STACK_Y,
    INDENT_X,
    BUS_Y_GAP,
    ORPHAN_GROUP_GAP,
    STROKE_PAD_X,
    ROOT_Y,
  } = LAYOUT;

  const {
    orphanMode = "after-root",     // 'after-root' or 'after-tree'
    orphanStyle = "root",          // 'root' or 'level1'
    renderOrphanChildren = false,  // leave false until you explicitly want mini-trees
  } = options;

  const nodes = new Map();
  const connectors = [];

  if (!root) return { nodes, connectors, bounds: { w: 0, h: 0 } };

  // Bus line position: midpoint between root bottom and Level 1 top
  // This gives equal visual space above and below the horizontal bus
  const BUS_MIDPOINT_RATIO = 0.5; // bus at 50% of the gap

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------

  const setNode = (node, x, y, depth, number, extra = {}) => {
    nodes.set(node.id, {
      x,
      y,
      w: NODE_W,
      h: NODE_H,
      depth,
      number,
      node,
      ...extra,
    });
  };

  // Calculate subtree width (how far right the deepest child extends from parent's x)
  // This is used to prevent horizontal overlap between Level 1 siblings
  const getSubtreeWidth = (node, depth) => {
    if (!node.children?.length) {
      return NODE_W; // Just the node itself
    }

    // Find the maximum width among all children's subtrees
    let maxChildWidth = 0;
    node.children.forEach(child => {
      const childSubtreeWidth = getSubtreeWidth(child, depth + 1);
      maxChildWidth = Math.max(maxChildWidth, childSubtreeWidth);
    });

    // Total width = parent width OR (indent + max child subtree width)
    return Math.max(NODE_W, INDENT_X + maxChildWidth);
  };

  const getRootTreeWidth = (node) => {
    if (!node?.children?.length) return NODE_W;
    const totalChildWidth = node.children.reduce((sum, child) => (
      sum + getSubtreeWidth(child, 1)
    ), 0);
    const gaps = GAP_L1_X * Math.max(node.children.length - 1, 0);
    return Math.max(NODE_W, totalChildWidth + gaps);
  };

  // Layout children vertically under a parent node
  // Returns total height consumed by this subtree.
  const layoutVertical = (parentNode, parentDepth, numberPrefix, context = {}) => {
    const parentLayout = nodes.get(parentNode.id);
    if (!parentLayout) return NODE_H;

  const shouldStack = shouldStackChildren(parentNode.children, parentDepth);
    const isExpanded = !!expandedStacks[parentNode.id];

    // If no children: subtree is just the parent card
    if (!parentNode.children?.length) {
      return NODE_H;
    }

    const parentX = parentLayout.x;
    const parentY = parentLayout.y;
    const childX = parentX + INDENT_X;
    let cursorY = parentY + NODE_H + GAP_STACK_Y;

    if (shouldStack && !isExpanded) {
      const stackChild = parentNode.children[0];
      if (!stackChild) return NODE_H;
      const childNumber = `${numberPrefix}.1`;
      setNode(stackChild, childX, cursorY, parentDepth + 1, childNumber, {
        ...context,
        stackInfo: {
          parentId: parentNode.id,
          totalCount: parentNode.children.length,
          collapsed: true,
        },
      });

      const spineX = parentX + STROKE_PAD_X;
      const tickY = cursorY + NODE_H / 2;
      connectors.push({
        type: "vertical-spine",
        x1: spineX,
        y1: parentY + NODE_H,
        x2: spineX,
        y2: tickY,
      });
      connectors.push({
        type: "horizontal-tick",
        x1: spineX,
        y1: tickY,
        x2: childX,
        y2: tickY,
      });

      cursorY += NODE_H + GAP_STACK_Y;
      const total = cursorY - parentY - GAP_STACK_Y;
      return Math.max(NODE_H, total);
    }

    const childIdsInOrder = [];

    parentNode.children.forEach((child, idx) => {
      const childNumber = `${numberPrefix}.${idx + 1}`;
      const stackInfo = shouldStack
        ? {
            parentId: parentNode.id,
            totalCount: parentNode.children.length,
            expanded: true,
            showCollapse: idx === 0 || idx === parentNode.children.length - 1,
          }
        : null;
      setNode(child, childX, cursorY, parentDepth + 1, childNumber, stackInfo ? { ...context, stackInfo } : { ...context });

      childIdsInOrder.push(child.id);

      const childSubtreeH = layoutVertical(child, parentDepth + 1, childNumber, context);
      cursorY += childSubtreeH + GAP_STACK_Y;
    });

    // Connectors: vertical spine + horizontal ticks
    if (childIdsInOrder.length) {
      const spineX = parentX + STROKE_PAD_X;
      const spineStartY = parentY + NODE_H;
      const lastChild = nodes.get(childIdsInOrder[childIdsInOrder.length - 1]);
      const spineEndY = lastChild.y + NODE_H / 2;

      connectors.push({
        type: "vertical-spine",
        x1: spineX,
        y1: spineStartY,
        x2: spineX,
        y2: spineEndY,
      });

      childIdsInOrder.forEach((cid) => {
        const c = nodes.get(cid);
        const tickY = c.y + NODE_H / 2;
        connectors.push({
          type: "horizontal-tick",
          x1: spineX,
          y1: tickY,
          x2: c.x, // end at child left edge
          y2: tickY,
        });
      });
    }

    // total height is from parentY to end of last child subtree (minus last GAP_STACK_Y)
    const total = cursorY - parentY - GAP_STACK_Y;
    return Math.max(NODE_H, total);
  };

  const allOrphans = Array.isArray(orphans) ? orphans : [];
  const subdomainOrphans = allOrphans.filter((o) => o.subdomainRoot);
  const regularOrphans = allOrphans.filter((o) => !o.subdomainRoot);

  const layoutRootTree = (rootNode, startX, startY, rootNumber, extra = {}) => {
    const context = {
      isSubdomainTree: extra.orphanType === 'subdomain' || extra.isSubdomainTree || false,
      orphanType: extra.orphanType || null,
    };
    setNode(rootNode, startX, startY, 0, rootNumber, { ...extra, ...context });

    const rootBottomY = startY + NODE_H;
    const level1Y = rootBottomY + BUS_Y_GAP;
    const level1Positions = [];
    let level1X = startX;

    if (rootNode.children?.length) {
      rootNode.children.forEach((child, idx) => {
        const childNumber = `${rootNumber}.${idx + 1}`;
        setNode(child, level1X, level1Y, 1, childNumber, context);

        level1Positions.push({
          centerX: level1X + NODE_W / 2,
          y: level1Y,
          id: child.id,
        });

        layoutVertical(child, 1, childNumber, context);

        const subtreeWidth = getSubtreeWidth(child, 1);
        level1X += subtreeWidth + GAP_L1_X;
      });

      if (level1Positions.length > 0) {
        const rootCenterX = startX + NODE_W / 2;
        const busY = rootBottomY + BUS_Y_GAP * BUS_MIDPOINT_RATIO;

        connectors.push({
          type: "root-drop",
          x1: rootCenterX,
          y1: rootBottomY,
          x2: rootCenterX,
          y2: busY,
        });

        const leftX = Math.min(rootCenterX, level1Positions[0].centerX);
        const rightX = Math.max(rootCenterX, level1Positions[level1Positions.length - 1].centerX);

        connectors.push({
          type: "horizontal-bus",
          x1: leftX,
          y1: busY,
          x2: rightX,
          y2: busY,
        });

        level1Positions.forEach((pos) => {
          connectors.push({
            type: "bus-drop",
            x1: pos.centerX,
            y1: busY,
            x2: pos.centerX,
            y2: level1Y,
          });
        });
      }
    }

    return getRootTreeWidth(rootNode);
  };

  // ------------------------------------------------------------
  // 1) Root (Home)
  // ------------------------------------------------------------
  const subdomainWidths = subdomainOrphans.map((orphan) => getRootTreeWidth(orphan));
  const subdomainTotalWidth = subdomainWidths.length
    ? subdomainWidths.reduce((sum, width) => sum + width, 0)
      + GAP_L1_X * Math.max(subdomainWidths.length - 1, 0)
    : 0;
  const orphanWidths = regularOrphans.map((orphan) => getRootTreeWidth(orphan));
  const orphanTotalWidth = orphanWidths.length
    ? orphanWidths.reduce((sum, width) => sum + width, 0)
      + GAP_L1_X * Math.max(orphanWidths.length - 1, 0)
    : 0;
  const leftGroupCount = (subdomainTotalWidth > 0 ? 1 : 0) + (orphanTotalWidth > 0 ? 1 : 0);
  const gapsBetweenLeftGroups = GAP_L1_X * Math.max(leftGroupCount - 1, 0);
  const rootGap = (subdomainTotalWidth > 0 || orphanTotalWidth > 0) ? GAP_L1_X : 0;
  const rootX = subdomainTotalWidth + orphanTotalWidth + gapsBetweenLeftGroups + rootGap;
  const rootY = ROOT_Y;

  // Root = "0" (Home)
  setNode(root, rootX, rootY, 0, "0", { isOrphan: false });

  // ------------------------------------------------------------
  // 2) Level 1 row (children of root) — horizontal only
  // ------------------------------------------------------------
  const rootBottomY = rootY + NODE_H;
  const level1Y = rootBottomY + BUS_Y_GAP;

  const level1Positions = [];
  let level1X = rootX;
  let maxTreeHeight = NODE_H;

  if (root.children?.length) {
    root.children.forEach((child, idx) => {
      const childNumber = `${idx + 1}`; // Level 1 = 1, 2, 3, etc.
      setNode(child, level1X, level1Y, 1, childNumber);

      level1Positions.push({
        centerX: level1X + NODE_W / 2,
        y: level1Y,
        id: child.id,
      });

      // Vertical subtree under each Level 1 node
      const branchH = layoutVertical(child, 1, childNumber);
      maxTreeHeight = Math.max(maxTreeHeight, (level1Y - rootY) + branchH);

      // Use subtree width to prevent horizontal overlap
      const subtreeWidth = getSubtreeWidth(child, 1);
      level1X += subtreeWidth + GAP_L1_X;
    });

    // Root-to-Level1 connectors (vertical drop + horizontal bus + drops)
    if (level1Positions.length > 0) {
      const rootCenterX = rootX + NODE_W / 2;
      const busY = rootBottomY + BUS_Y_GAP * BUS_MIDPOINT_RATIO;

      connectors.push({
        type: "root-drop",
        x1: rootCenterX,
        y1: rootBottomY,
        x2: rootCenterX,
        y2: busY,
      });

      const leftX = Math.min(rootCenterX, level1Positions[0].centerX);
      const rightX = Math.max(rootCenterX, level1Positions[level1Positions.length - 1].centerX);

      connectors.push({
        type: "horizontal-bus",
        x1: leftX,
        y1: busY,
        x2: rightX,
        y2: busY,
      });

      level1Positions.forEach((pos) => {
        connectors.push({
          type: "bus-drop",
          x1: pos.centerX,
          y1: busY,
          x2: pos.centerX,
          y2: level1Y,
        });
      });
    }
  }

  // ------------------------------------------------------------
  // 3) Orphans (left of root)
  // ------------------------------------------------------------

  // Main tree right edge (based on actual L1 width; if no children, it’s just root)
  const mainTreeRightEdge =
    root.children?.length
      ? (level1X - GAP_L1_X + NODE_W)  // last L1 node right edge
      : (rootX + NODE_W);

  // Where do orphans start?
  // - after-root: start on root row, *one full node-slot* to the right of root
  //              (so 0.1 doesn’t feel glued to 0.0)
  // - after-tree: start after the main tree right edge with ORPHAN_GROUP_GAP
  let orphanY = rootY;
  const orphanGroupStartX = 0;
  let orphanX = orphanGroupStartX;

  const orderedOrphans = [...regularOrphans].reverse();
  const orphanCount = orderedOrphans.length;
  orderedOrphans.forEach((orphan, idx) => {
    const depth = orphanStyle === "level1" ? 1 : 0;
    const count = orphanCount - idx;
    const num = orphanStyle === "level1" ? `1.o${count}` : `0.${count}`;
    const treeWidth = layoutRootTree(orphan, orphanX, orphanY, num, {
      isOrphan: true,
      orphanStyle,
      orphanType: orphan.orphanType || 'orphan',
    });
    orphanX += treeWidth + GAP_L1_X;
  });

  // ------------------------------------------------------------
  // 4) Subdomains (left of root, closer to main tree)
  // ------------------------------------------------------------
  if (subdomainOrphans.length > 0) {
    let subdomainX = orphanTotalWidth > 0 ? orphanTotalWidth + GAP_L1_X : 0;
    const orderedSubdomains = [...subdomainOrphans].reverse();
    const subdomainCount = orderedSubdomains.length;
    orderedSubdomains.forEach((orphan, idx) => {
      const num = `s${subdomainCount - idx}`;
      const treeWidth = layoutRootTree(orphan, subdomainX, rootY, num, {
        isOrphan: true,
        orphanStyle: 'subdomain',
        orphanType: 'subdomain',
      });
      subdomainX += treeWidth + GAP_L1_X;
    });
  }

  // ------------------------------------------------------------
  // Bounds
  // ------------------------------------------------------------
  const all = Array.from(nodes.values());
  const maxX = Math.max(...all.map((n) => n.x + n.w), NODE_W);
  const maxY = Math.max(...all.map((n) => n.y + n.h), NODE_H);

  return {
    nodes,
    connectors,
    bounds: { w: maxX + 50, h: maxY + 50 }, // light padding
  };
};

const SitemapTree = ({
  data,
  orphans = [],
  showThumbnails,
  showCommentBadges,
  canEdit,
  canComment,
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
  activeId,
  badgeVisibility,
  showPageNumbers,
  onRequestThumbnail,
  expandedStacks,
  onToggleStack,
}) => {
  const toggleStack = (nodeId) => {
    onToggleStack?.(nodeId);
  };

  // Compute layout using explicit coordinate formulas
 const layout = useMemo(() => {
  return computeLayout(data, orphans, showThumbnails, expandedStacks, {
    mode: 'after-root', // or 'after-tree'
    renderOrphanChildren: true,
  });
}, [data, orphans, showThumbnails, expandedStacks]);

  // Run invariant checks in development
  useEffect(() => {
    checkLayoutInvariants(layout.nodes, orphans, layout.connectors);
  }, [layout, orphans]);

  if (!data) return null;

  const getBadgesForNode = (node, nodeMeta) => {
    const badges = [];
    if (node.isDuplicate) badges.push('Duplicate');
    if (node.isMissing) badges.push('Missing');
    const orphanType = nodeMeta?.orphanType || node.orphanType;
    const isSubdomainTree = node.subdomainRoot || nodeMeta?.isSubdomainTree || orphanType === 'subdomain';
    if (isSubdomainTree && badgeVisibility?.subdomains) badges.push('Subdomain');
    if (orphanType === 'orphan' && badgeVisibility?.orphanPages) badges.push('Orphan');
    if (orphanType === 'file' && badgeVisibility?.files) badges.push('File');
    if (orphanType === 'broken' && badgeVisibility?.brokenLinks) badges.push('Broken');
    if (orphanType === 'inactive' && badgeVisibility?.inactivePages) badges.push('Inactive');
    if (node.isFile && badgeVisibility?.files && !badges.includes('File')) badges.push('File');
    if (node.isBroken && badgeVisibility?.brokenLinks && !badges.includes('Broken')) badges.push('Broken');
    if (node.isInactive && badgeVisibility?.inactivePages && !badges.includes('Inactive')) badges.push('Inactive');
    if (node.authRequired && badgeVisibility?.authenticatedPages) badges.push('Auth');
    if (node.isError && badgeVisibility?.errorPages) badges.push('Error');
    return badges;
  };

  // Convert connector data to SVG path strings
  const connectorPaths = layout.connectors.map(c => {
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
    >
      {/* Single SVG overlay for all connectors */}
      <svg
        className="connector-overlay"
        aria-hidden="true"
      >
        {connectorPaths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#94a3b8" strokeWidth="2" />
        ))}
      </svg>

      {/* Render all nodes with absolute positioning */}
      {Array.from(layout.nodes.values()).map(nodeData => {
        const color = colors[Math.min(nodeData.depth, colors.length - 1)];
        const isRoot = nodeData.depth === 0;
        const badges = getBadgesForNode(nodeData.node, nodeData);
        const stackInfo = nodeData.stackInfo;
        const stackToggleParentId = stackInfo?.parentId;
        const shouldWrapStack = !!stackInfo?.collapsed;

        const card = (
          <DraggableNodeCard
            node={nodeData.node}
            number={nodeData.number}
            color={color}
            showThumbnails={showThumbnails}
            showCommentBadges={showCommentBadges}
            canEdit={canEdit}
            canComment={canComment}
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
            activeId={activeId}
            badges={badges}
            showPageNumbers={showPageNumbers}
            onRequestThumbnail={onRequestThumbnail}
            stackInfo={stackInfo}
            onToggleStack={() => {
              if (stackToggleParentId) toggleStack(stackToggleParentId);
            }}
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
            onClick={() => onNodeClick?.(nodeData.node)}
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

// Helper to collect all nodes from tree with page numbers and depth
const collectAllNodes = (node, result = [], pageNumber = '1', depth = 0) => {
  if (!node) return result;
  result.push({
    id: node.id,
    title: node.title,
    url: node.url,
    pageNumber,
    depth
  });
  if (node.children) {
    node.children.forEach((child, idx) => {
      collectAllNodes(child, result, `${pageNumber}.${idx + 1}`, depth + 1);
    });
  }
  return result;
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

const buildRootUrlSet = (rootNode) => {
  const set = new Set();
  const walk = (node) => {
    if (!node?.url) return;
    set.add(normalizeUrlForCompare(node.url));
    node.children?.forEach(walk);
  };
  walk(rootNode);
  return set;
};

const filterTreeByFiles = (node, showFiles) => {
  if (!node) return null;
  if (!showFiles && node.isFile) return null;
  const children = (node.children || [])
    .map((child) => filterTreeByFiles(child, showFiles))
    .filter(Boolean);
  return { ...node, children };
};

const filterTreeByScanLayers = (node, visibility, isRoot = true) => {
  if (!node) return null;

  const shouldHide = !isRoot && (
    (!visibility.files && node.isFile)
    || (!visibility.errorPages && node.isError)
    || (!visibility.inactivePages && node.isInactive)
    || (!visibility.authenticatedPages && node.authRequired)
    || (!visibility.brokenLinks && node.isBroken)
    || (!visibility.duplicates && node.isDuplicate)
    || (!visibility.subdomains && node.subdomainRoot)
    || (!visibility.orphanPages && node.orphanType === 'orphan')
    || (!visibility.files && node.orphanType === 'file')
    || (!visibility.brokenLinks && node.orphanType === 'broken')
    || (!visibility.inactivePages && node.orphanType === 'inactive')
  );

  if (shouldHide) return null;

  const children = (node.children || [])
    .map((child) => filterTreeByScanLayers(child, visibility, false))
    .filter(Boolean);

  return { ...node, children };
};

const applyScanArtifacts = (rootNode, orphanNodes, scanResult) => {
  const mergedOrphans = (orphanNodes || []).map((orphan) => ({
    ...orphan,
    orphanType: orphan.orphanType || 'orphan',
  }));
  const rootUrlSet = buildRootUrlSet(rootNode);
  const urlNodeMap = buildUrlNodeMap(rootNode, mergedOrphans);

  const indexNodeUrls = (node) => {
    if (!node?.url) return;
    if (!urlNodeMap.has(node.url)) urlNodeMap.set(node.url, node);
    node.children?.forEach(indexNodeUrls);
  };

  const addOrphanNode = (node, orphanType) => {
    if (!node?.url) return null;
    if (urlNodeMap.has(node.url)) {
      const existing = urlNodeMap.get(node.url);
      if (!rootUrlSet.has(node.url)) {
        if (orphanType === 'subdomain') existing.subdomainRoot = true;
        if (orphanType && !existing.orphanType) existing.orphanType = orphanType;
        if (existing.isMissing && !node.isMissing) {
          Object.assign(existing, {
            title: node.title || existing.title,
            parentUrl: node.parentUrl || existing.parentUrl,
            referrerUrl: node.referrerUrl || existing.referrerUrl,
            authRequired: node.authRequired ?? existing.authRequired,
            thumbnailUrl: node.thumbnailUrl || existing.thumbnailUrl,
            isMissing: false,
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

  (scanResult.subdomains || []).forEach((node) => {
    addOrphanNode({ ...node, subdomainRoot: true }, 'subdomain');
  });

  (scanResult.files || []).forEach((file) => {
    if (!file?.url) return;
    const existing = urlNodeMap.get(file.url);
    if (existing) {
      existing.isFile = true;
      return;
    }

          const newNode = {
            id: makeNodeIdFromUrl(file.url),
            url: file.url,
            title: getUrlLabel(file.url),
            children: [],
            isFile: true,
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
  });

  (scanResult.errors || []).forEach((error) => {
    if (!error?.url) return;
    const node = urlNodeMap.get(error.url);
    if (!node) return;
    node.isError = true;
    node.errorStatus = error.status;
    if (error.authRequired) node.authRequired = true;
  });

  (scanResult.brokenLinks || []).forEach((link) => {
    if (!link?.url) return;
    const existing = urlNodeMap.get(link.url);
    if (existing) {
      existing.isBroken = true;
      return;
    }
    addOrphanNode({
      id: makeNodeIdFromUrl(link.url),
      url: link.url,
      title: getUrlLabel(link.url),
      children: [],
      isBroken: true,
    }, 'broken');
  });

  (scanResult.inactivePages || []).forEach((inactive) => {
    if (!inactive?.url) return;
    const existing = urlNodeMap.get(inactive.url);
    if (existing) {
      existing.isInactive = true;
      return;
    }
    addOrphanNode({
      id: makeNodeIdFromUrl(inactive.url),
      url: inactive.url,
      title: getUrlLabel(inactive.url),
      children: [],
      isInactive: true,
    }, 'inactive');
  });

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

const normalizeOrphans = (list) => (list || []).map((orphan) => ({
  ...orphan,
  orphanType: orphan.orphanType || 'orphan',
}));

export default function App() {
  const [urlInput, setUrlInput] = useState('');
  const [showThumbnails, setShowThumbnails] = useState(false);
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
  const [scanDepth, setScanDepth] = useState('4');
  const [scanMeta, setScanMeta] = useState({
    brokenLinks: [],
  });
  const [scanLayerAvailability, setScanLayerAvailability] = useState({
    thumbnails: false,
    inactivePages: false,
    subdomains: false,
    authenticatedPages: false,
    orphanPages: false,
    errorPages: false,
    brokenLinks: false,
    duplicates: false,
    files: false,
  });
  const [scanLayerVisibility, setScanLayerVisibility] = useState({
    thumbnails: true,
    inactivePages: true,
    subdomains: true,
    authenticatedPages: true,
    orphanPages: true,
    errorPages: true,
    brokenLinks: true,
    duplicates: true,
    files: true,
  });
  const [mapName, setMapName] = useState('');
  const [isEditingMapName, setIsEditingMapName] = useState(false);
  const [root, setRoot] = useState(null);
  const [orphans, setOrphans] = useState([]); // Pages with no parent (numbered 0.x)
  const [customPageTypes, setCustomPageTypes] = useState([]); // User-added page types
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [fullImageUrl, setFullImageUrl] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [showColorKey, setShowColorKey] = useState(false);
  const [editingColorDepth, setEditingColorDepth] = useState(null);
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
  const [createMapMode, setCreateMapMode] = useState(false);
  const [pendingMapCreation, setPendingMapCreation] = useState(null);
  const [pendingCreateAfterSave, setPendingCreateAfterSave] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState({});
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [shareEmails, setShareEmails] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [sharePermission, setSharePermission] = useState(ACCESS_LEVELS.VIEW); // Permission for shared link
  const [scanMessage, setScanMessage] = useState('');
  const [scanElapsed, setScanElapsed] = useState(0);
  const [scanProgress, setScanProgress] = useState({ scanned: 0, queued: 0 });
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [scanHistory, setScanHistory] = useState([]);
  const [lastHistoryId, setLastHistoryId] = useState(null);
  const [lastScanUrl, setLastScanUrl] = useState('');
  const autosaveTimerRef = useRef(null);
  const lastAutosaveSnapshotRef = useRef('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedHistoryItems, setSelectedHistoryItems] = useState(new Set());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [, setAuthLoading] = useState(true);
  const [showLanding, setShowLanding] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !params.get('share');
  });
  const [showImportModal, setShowImportModal] = useState(false);
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
  const [showCommentsPanel, setShowCommentsPanel] = useState(false);
  const [showReportDrawer, setShowReportDrawer] = useState(false);
  const [lastScanAt, setLastScanAt] = useState(null);
  const [expandedStacks, setExpandedStacks] = useState({});
  const [commentingNodeId, setCommentingNodeId] = useState(null); // Node currently showing comment popover
  const [commentPopoverPos, setCommentPopoverPos] = useState({ x: 0, y: 0, side: 'right' }); // Position for popover
  const [collaborators] = useState(['matt', 'sarah', 'alex']); // For @ mentions
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [showViewDropdown, setShowViewDropdown] = useState(false);
  const [layers, setLayers] = useState({
    main: true,        // Main sitemap nodes (always visible)
    xmlComparison: true, // XML comparison highlights
    userFlows: true,    // User journey connections
    crossLinks: true,   // Non-hierarchical links
    pageNumbers: true,
  });

  // Connection lines state
  const [connectionTool, setConnectionTool] = useState(null); // 'userflow' | 'crosslink' | null
  const [connections, setConnections] = useState([]); // Array of connection objects
  const [drawingConnection, setDrawingConnection] = useState(null); // { type, sourceNodeId, sourceAnchor, currentX, currentY }
  const [hoveredConnection, setHoveredConnection] = useState(null); // ID of hovered connection
  const [connectionMenu, setConnectionMenu] = useState(null); // { connectionId, x, y }
  const [draggingEndpoint, setDraggingEndpoint] = useState(null); // { connectionId, endpoint: 'source'|'target', ... }

  // Theme: 'light', 'dark', or 'auto'
  const [theme, setTheme] = useState('auto');

  // Drag & Drop state (dnd-kit)
  const [activeId, setActiveId] = useState(null);
  const [activeNode, setActiveNode] = useState(null);
  const [activeDragData, setActiveDragData] = useState(null); // {number, color}
  const [activeDropZone, setActiveDropZone] = useState(null);
  const [dropZones, setDropZones] = useState([]);
  const [dragCursor, setDragCursor] = useState({ x: 0, y: 0 }); // Track cursor for proximity filtering

  const canvasRef = useRef(null);
  const scanAbortRef = useRef(null);
  const eventSourceRef = useRef(null);
  const scanTimerRef = useRef(null);
  const messageTimerRef = useRef(null);
  const contentRef = useRef(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });
  const viewDropdownRef = useRef(null);
  const scanOptionsRef = useRef(null);
  const thumbnailRequestRef = useRef(new Set());
  const thumbnailQueueRef = useRef([]);
  const thumbnailActiveRef = useRef(0);
  const thumbnailStartRef = useRef(new Map());
  const thumbnailTotalTimeRef = useRef(0);
  const MAX_THUMBNAIL_CONCURRENCY = 2;
  const [thumbnailQueueSize, setThumbnailQueueSize] = useState(0);
  const [thumbnailActiveCount, setThumbnailActiveCount] = useState(0);
  const [thumbnailStats, setThumbnailStats] = useState({
    total: 0,
    completed: 0,
    failed: 0,
    avgMs: 0,
  });

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
      localStorage.setItem('mapmat-theme', theme);
    } else {
      localStorage.removeItem('mapmat-theme');
    }

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const hasMap = !!root;
  const maxDepth = useMemo(() => {
    const orphanDepth = (orphans || []).reduce((max, orphan) => {
      return Math.max(max, getMaxDepth(orphan));
    }, 0);
    return Math.max(getMaxDepth(root), orphanDepth);
  }, [root, orphans]);
  const totalNodes = useMemo(() => countNodes(root), [root]);
  const effectiveScanLayers = useMemo(() => ({
    thumbnails: scanLayerAvailability.thumbnails ? scanLayerVisibility.thumbnails : showThumbnails,
    inactivePages: scanLayerAvailability.inactivePages ? scanLayerVisibility.inactivePages : true,
    subdomains: scanLayerAvailability.subdomains ? scanLayerVisibility.subdomains : true,
    authenticatedPages: scanLayerAvailability.authenticatedPages ? scanLayerVisibility.authenticatedPages : true,
    orphanPages: scanLayerAvailability.orphanPages ? scanLayerVisibility.orphanPages : true,
    errorPages: scanLayerAvailability.errorPages ? scanLayerVisibility.errorPages : true,
    brokenLinks: scanLayerAvailability.brokenLinks ? scanLayerVisibility.brokenLinks : true,
    duplicates: scanLayerVisibility.duplicates,
    files: scanLayerAvailability.files ? scanLayerVisibility.files : true,
  }), [scanLayerAvailability, scanLayerVisibility, showThumbnails]);

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

  // Autosave for existing maps (debounced)
  useEffect(() => {
    if (!currentMap?.id || !root || isImportedMap) return;

    const snapshot = JSON.stringify({
      name: currentMap?.name || mapName,
      root,
      orphans,
      connections,
      colors,
      project_id: currentMap?.project_id || null,
    });

    if (snapshot === lastAutosaveSnapshotRef.current) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      try {
        const { map } = await api.updateMap(currentMap.id, {
          name: (currentMap?.name || mapName || '').trim() || 'Untitled Map',
          root,
          orphans,
          connections,
          colors,
          project_id: currentMap?.project_id || null,
        });
        lastAutosaveSnapshotRef.current = snapshot;
        setCurrentMap(map);
        setProjects(prev => prev.map(p => ({
          ...p,
          maps: (p.maps || []).map(m => (m.id === map.id ? map : m)),
        })));
      } catch (e) {
        console.error('Autosave failed:', e);
      }
    }, 800);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [currentMap?.id, currentMap?.name, currentMap?.project_id, root, orphans, connections, colors, mapName, isImportedMap]);

  const reportTitle = useMemo(() => {
    return root?.title || getHostname(root?.url) || 'Website';
  }, [root]);

  const reportTimestamp = useMemo(() => {
    if (!lastScanAt) return '';
    return new Date(lastScanAt).toLocaleString();
  }, [lastScanAt]);


  const visibleOrphans = useMemo(() => {
    return orphans
      .map((orphan) => {
        if (orphan.isDuplicate && !effectiveScanLayers.duplicates) return null;
        if (orphan.subdomainRoot && !effectiveScanLayers.subdomains) return null;
        if (orphan.authRequired && !effectiveScanLayers.authenticatedPages) return null;
        if (orphan.isError && !effectiveScanLayers.errorPages) return null;
        if (orphan.isInactive && !effectiveScanLayers.inactivePages) return null;
        if (orphan.isBroken && !effectiveScanLayers.brokenLinks) return null;
        if (orphan.orphanType === 'file' && !effectiveScanLayers.files) return null;
        if (orphan.orphanType === 'broken' && !effectiveScanLayers.brokenLinks) return null;
        if (orphan.orphanType === 'inactive' && !effectiveScanLayers.inactivePages) return null;
        if (orphan.orphanType === 'orphan' && !effectiveScanLayers.orphanPages) return null;
        return filterTreeByScanLayers(orphan, effectiveScanLayers, true);
      })
      .filter(Boolean);
  }, [orphans, effectiveScanLayers]);

  const renderRoot = useMemo(() => {
    if (!root) return null;
    const filteredByLayers = filterTreeByScanLayers(root, effectiveScanLayers, true);
    if (!filteredByLayers) return null;
    if (effectiveScanLayers.files) return filteredByLayers;
    return filterTreeByFiles(filteredByLayers, false);
  }, [root, effectiveScanLayers]);

  const brokenConnections = useMemo(() => {
    if (!effectiveScanLayers.brokenLinks || scanMeta.brokenLinks.length === 0) return [];
    const urlToId = new Map();
    const walk = (node) => {
      if (!node?.url) return;
      urlToId.set(node.url, node.id);
      node.children?.forEach(walk);
    };
    walk(renderRoot);
    visibleOrphans.forEach((orphan) => {
      if (orphan?.url) urlToId.set(orphan.url, orphan.id);
    });

    return scanMeta.brokenLinks
      .map((link, index) => {
        if (!link?.sourceUrl || !link?.url) return null;
        const sourceId = urlToId.get(link.sourceUrl);
        const targetId = urlToId.get(link.url);
        if (!sourceId || !targetId) return null;
        const offsetY = (index % 2 === 0 ? 1 : -1) * 4;
        const offsetX = 4;
        return { id: `broken-${sourceId}-${targetId}-${index}`, sourceId, targetId, offsetY, offsetX };
      })
      .filter(Boolean);
  }, [effectiveScanLayers.brokenLinks, scanMeta.brokenLinks, renderRoot, visibleOrphans]);

  // Check if there are any comments in the map (for notification dot)
  const hasAnyComments = useMemo(() => {
    const checkComments = (node) => {
      if (!node) return false;
      if (node.comments?.length > 0) return true;
      return node.children?.some(checkComments) || false;
    };
    const rootHasComments = root ? checkComments(root) : false;
    const orphansHaveComments = orphans.some(o => o.comments?.length > 0);
    return rootHasComments || orphansHaveComments;
  }, [root, orphans]);

  // Read access level from URL on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const access = params.get('access');

    if (access && Object.values(ACCESS_LEVELS).includes(access)) {
      setAccessLevel(access);
    }
  }, []);

  // Permission helper functions
  const canEdit = () => accessLevel === ACCESS_LEVELS.EDIT;
  const canComment = () => accessLevel === ACCESS_LEVELS.COMMENT || accessLevel === ACCESS_LEVELS.EDIT;

  // Theme toggle functions
  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === 'auto') {
        // Check current actual appearance
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        return isDark ? 'light' : 'dark';
      }
      return prev === 'dark' ? 'light' : 'dark';
    });
  };

  // Helper to get current visual theme
  const getCurrentTheme = () => {
    if (theme === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  };

  // Show confirmation modal and return promise
  const showConfirm = ({ title, message, confirmText = 'OK', cancelText = 'Cancel', danger = false }) => {
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
  };

  const resetScanLayers = () => {
    setScanMeta({ brokenLinks: [] });
    setScanLayerAvailability({
      thumbnails: false,
      inactivePages: false,
      subdomains: false,
      authenticatedPages: false,
      orphanPages: false,
      errorPages: false,
      brokenLinks: false,
      duplicates: false,
      files: false,
    });
    setScanLayerVisibility({
      thumbnails: true,
      inactivePages: true,
      subdomains: true,
      authenticatedPages: true,
      orphanPages: true,
      errorPages: true,
      brokenLinks: true,
      duplicates: true,
      files: true,
    });
  };

  const clearCanvas = async () => {
    const confirmed = await showConfirm({
      title: 'Clear Canvas',
      message: 'Clear the canvas? This cannot be undone.',
      confirmText: 'Clear',
      danger: true
    });
    if (!confirmed) return false;
    setRoot(null);
    setOrphans([]);
    setCurrentMap(null);
    setIsImportedMap(false);
    setScale(1);
    setPan({ x: 0, y: 0 });
    setUrlInput('');
    resetScanLayers();
    return true;
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

  // dnd-kit sensors - require 5px movement before activating drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Calculate map bounds and clamp pan to limit scrolling
  const panRef = useRef(pan);
  panRef.current = pan;

  const clampPan = useCallback((newPan) => {
    if (!contentRef.current || !canvasRef.current) return newPan;

    const cards = contentRef.current.querySelectorAll('[data-node-card="1"]');
    if (!cards.length) return newPan;

    // 1. Get viewport size
    const viewportWidth = canvasRef.current.clientWidth;
    const viewportHeight = canvasRef.current.clientHeight;

    // 2. Get content bounds (in content coordinates, before pan)
    // Cards report screen positions, so subtract current pan to get content coords
    const canvasRect = canvasRef.current.getBoundingClientRect();
    let contentLeft = Infinity, contentTop = Infinity, contentRight = -Infinity, contentBottom = -Infinity;
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const x = rect.left - canvasRect.left - panRef.current.x;
      const y = rect.top - canvasRect.top - panRef.current.y;
      contentLeft = Math.min(contentLeft, x);
      contentTop = Math.min(contentTop, y);
      contentRight = Math.max(contentRight, x + rect.width);
      contentBottom = Math.max(contentBottom, y + rect.height);
    });

    // 3. Set pan limits with 400px padding on ALL sides
    const padding = 400;

    // Pan LEFT limit: content's RIGHT edge should stay at least 400px from viewport LEFT edge
    // When panning left (negative pan.x), content moves right visually
    // contentRight + pan.x = position of content's right edge on screen
    // We want: contentRight + pan.x >= padding
    // So: pan.x >= padding - contentRight
    const minPanX = padding - contentRight;

    // Pan RIGHT limit: content's LEFT edge should stay at least 400px from viewport RIGHT edge
    // contentLeft + pan.x = position of content's left edge on screen
    // We want: contentLeft + pan.x <= viewportWidth - padding
    // So: pan.x <= viewportWidth - padding - contentLeft
    const maxPanX = viewportWidth - padding - contentLeft;

    // Pan UP limit: content's BOTTOM edge should stay at least 400px from viewport TOP edge
    // contentBottom + pan.y = position of content's bottom edge on screen
    // We want: contentBottom + pan.y >= padding
    // So: pan.y >= padding - contentBottom
    const minPanY = padding - contentBottom;

    // Pan DOWN limit: content's TOP edge should stay at least 400px from viewport BOTTOM edge
    // contentTop + pan.y = position of content's top edge on screen
    // We want: contentTop + pan.y <= viewportHeight - padding
    // So: pan.y <= viewportHeight - padding - contentTop
    const maxPanY = viewportHeight - padding - contentTop;

    // 4. Clamp
    const clampedX = Math.max(minPanX, Math.min(maxPanX, newPan.x));
    const clampedY = Math.max(minPanY, Math.min(maxPanY, newPan.y));

    return { x: clampedX, y: clampedY };
  }, []);

  const animatePanTo = useCallback((target) => {
    const start = { ...panRef.current };
    const startTime = performance.now();
    const duration = 360;

    const tick = (now) => {
      const elapsed = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - elapsed, 3);
      const next = {
        x: start.x + (target.x - start.x) * ease,
        y: start.y + (target.y - start.y) * ease,
      };
      setPan(clampPan(next));
      if (elapsed < 1) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  }, [clampPan]);

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
    if (!nodeId || !contentRef.current || !canvasRef.current) return;

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
      const el = contentRef.current?.querySelector(`[data-node-id="${nodeId}"]`);
      if (!el || !canvasRef.current) {
        if (attempt < 3) {
          setTimeout(() => moveToNode(attempt + 1), 120);
        }
        return;
      }
      const rect = el.getBoundingClientRect();
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const dx = canvasRect.left + canvasRect.width / 2 - (rect.left + rect.width / 2);
      const dy = canvasRect.top + canvasRect.height / 2 - (rect.top + rect.height / 2);
      const leftShift = Math.min(240, canvasRect.width * 0.25);
      animatePanTo(clampPan({ x: panRef.current.x + dx - leftShift, y: panRef.current.y + dy }));
    };

    requestAnimationFrame(() => {
      setTimeout(() => moveToNode(0), 80);
    });
  }, [animatePanTo, clampPan, findStackParentsForNode, orphans, root]);

  useEffect(() => {
    if (!root) return;
    setPan((prev) => clampPan(prev));
  }, [effectiveScanLayers, root, orphans, scale, clampPan]);

  // Check auth and load data on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
            const [projectsData, mapsData, historyData] = await Promise.all([
              api.getProjects(),
              api.getMaps(),
              api.getHistory(),
            ]);

            // Organize maps into projects
            const projectsWithMaps = (projectsData.projects || []).map(project => ({
              ...project,
              maps: (mapsData.maps || []).filter(m => m.project_id === project.id),
            }));

            // Add uncategorized maps (those without a project)
            const uncategorizedMaps = (mapsData.maps || []).filter(m => !m.project_id);
            if (uncategorizedMaps.length > 0) {
              const uncategorized = projectsWithMaps.find(p => p.name === 'Uncategorized');
              if (uncategorized) {
                uncategorized.maps = [...uncategorized.maps, ...uncategorizedMaps];
              } else {
                projectsWithMaps.push({
                  id: 'uncategorized',
                  name: 'Uncategorized',
                  maps: uncategorizedMaps,
                });
              }
            }

            setProjects(projectsWithMaps);
            setScanHistory(historyData.history || []);
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

    // Check for shared map in URL
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('share');
    if (shareId) {
      setShowLanding(false);
      // Try to load from API first
      api.getShare(shareId)
        .then(({ share }) => {
          if (share?.root) {
            resetScanLayers();
            setRoot(share.root);
            setOrphans(normalizeOrphans(share.orphans));
            setConnections(share.connections || []);
            setScale(1);
            setPan({ x: 0, y: 0 });
            if (share.colors) setColors(share.colors);
            setUrlInput(share.root.url || '');
            showToast('Shared map loaded!', 'success');
            window.history.replaceState({}, '', window.location.pathname);
            scheduleResetView();
          }
        })
        .catch((e) => {
          // Fallback to localStorage for legacy shares
          const sharedData = localStorage.getItem(shareId);
          if (sharedData) {
            try {
              const {
                root: sharedRoot,
                colors: sharedColors,
                orphans: sharedOrphans,
                connections: sharedConnections
              } = JSON.parse(sharedData);
              if (sharedRoot) {
                resetScanLayers();
                setRoot(sharedRoot);
                setOrphans(normalizeOrphans(sharedOrphans));
                setConnections(sharedConnections || []);
                setScale(1);
                setPan({ x: 0, y: 0 });
                if (sharedColors) setColors(sharedColors);
                setUrlInput(sharedRoot.url || '');
                showToast('Shared map loaded!', 'success');
                window.history.replaceState({}, '', window.location.pathname);
                scheduleResetView();
              }
            } catch (parseError) {
              console.error('Failed to parse shared map:', parseError);
              showToast('Failed to load shared map', 'error');
            }
          } else {
            showToast(e.message || 'Shared map not found or expired', 'error');
          }
        });
    }
  }, []);

  // Safari gesture events for pinch zoom
  const gestureScaleRef = useRef(1);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleGestureStart = (e) => {
      e.preventDefault();
      gestureScaleRef.current = scale;
    };

    const handleGestureChange = (e) => {
      e.preventDefault();
      const next = clamp(gestureScaleRef.current * e.scale, 0.1, 3);
      setScale(next);
    };

    const handleGestureEnd = (e) => {
      e.preventDefault();
    };

    // Prevent browser-level pinch zoom on canvas
    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    // Also prevent at document level to stop browser zoom
    const handleDocumentWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    canvas.addEventListener('gesturestart', handleGestureStart);
    canvas.addEventListener('gesturechange', handleGestureChange);
    canvas.addEventListener('gestureend', handleGestureEnd);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('wheel', handleDocumentWheel, { passive: false });

    return () => {
      canvas.removeEventListener('gesturestart', handleGestureStart);
      canvas.removeEventListener('gesturechange', handleGestureChange);
      canvas.removeEventListener('gestureend', handleGestureEnd);
      canvas.removeEventListener('wheel', handleWheel);
      document.removeEventListener('wheel', handleDocumentWheel);
    };
  }, [scale]);

  const toastTimeoutRef = useRef(null);

  const showToast = (msg, type = 'info', persistent = false) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setToast({ message: msg, type, persistent });
    if (!persistent) {
      toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
    }
  };

  const dismissToast = () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setToast(null);
  };

  const ToastIcon = ({ type }) => {
    switch (type) {
      case 'success': return <CheckCircle size={18} />;
      case 'error': return <XCircle size={18} />;
      case 'warning': return <AlertTriangle size={18} />;
      case 'loading': return <Loader2 size={18} className="toast-spinner" />;
      default: return <Info size={18} />;
    }
  };

  const handleLogin = () => {
    setShowAuthModal(true);
  };

  const handleAuthSuccess = async (user) => {
    setCurrentUser(user);
    setIsLoggedIn(true);

    // Load user's projects, maps, and history
    try {
      const [projectsData, mapsData, historyData] = await Promise.all([
        api.getProjects(),
        api.getMaps(),
        api.getHistory(),
      ]);

      // Organize maps into projects
      const projectsWithMaps = (projectsData.projects || []).map(project => ({
        ...project,
        maps: (mapsData.maps || []).filter(m => m.project_id === project.id),
      }));

      // Add uncategorized maps (those without a project)
      const uncategorizedMaps = (mapsData.maps || []).filter(m => !m.project_id);
      if (uncategorizedMaps.length > 0) {
        const uncategorized = projectsWithMaps.find(p => p.name === 'Uncategorized');
        if (uncategorized) {
          uncategorized.maps = [...uncategorized.maps, ...uncategorizedMaps];
        } else {
          projectsWithMaps.push({
            id: 'uncategorized',
            name: 'Uncategorized',
            maps: uncategorizedMaps,
          });
        }
      }

      setProjects(projectsWithMaps);
      setScanHistory(historyData.history || []);
    } catch (e) {
      console.error('Failed to load user data:', e);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (e) {
      console.error('Logout error:', e);
    }
    setCurrentUser(null);
    setIsLoggedIn(false);
    setProjects([]);
    setScanHistory([]);
    setCurrentMap(null);
    showToast('Logged out', 'info');
  };

  const updateNodeThumbnail = (nodeId, thumbnailUrl) => {
    if (!nodeId || !thumbnailUrl) return;
    setRoot((prev) => {
      if (!prev) return prev;
      const copy = structuredClone(prev);
      const target = findNodeById(copy, nodeId);
      if (target) {
        target.thumbnailUrl = thumbnailUrl;
      }
      return copy;
    });
    setOrphans((prev) => prev.map((orphan) => (
      orphan.id === nodeId ? { ...orphan, thumbnailUrl } : orphan
    )));
    if (showThumbnails) {
      setScanLayerAvailability((prev) => (
        prev.thumbnails ? prev : { ...prev, thumbnails: true }
      ));
      setScanLayerVisibility((prev) => (
        prev.thumbnails ? prev : { ...prev, thumbnails: true }
      ));
    }
  };

  const processThumbnailQueue = () => {
    if (thumbnailActiveRef.current >= MAX_THUMBNAIL_CONCURRENCY) return;
    const next = thumbnailQueueRef.current.shift();
    if (!next) return;
    thumbnailActiveRef.current += 1;
    setThumbnailQueueSize(thumbnailQueueRef.current.length);
    setThumbnailActiveCount(thumbnailActiveRef.current);
    thumbnailStartRef.current.set(next.id, Date.now());
    let success = false;

    fetch(`${API_BASE}/screenshot?url=${encodeURIComponent(next.url)}&type=thumb`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && data?.url) {
          updateNodeThumbnail(next.id, data.url);
          success = true;
          next.resolve(true);
          return;
        }
        next.resolve(false);
      })
      .catch(() => {
        // Swallow errors; retries handled in the card.
        next.resolve(false);
      })
      .finally(() => {
        thumbnailRequestRef.current.delete(next.id);
        thumbnailActiveRef.current -= 1;
        setThumbnailActiveCount(thumbnailActiveRef.current);
        setThumbnailQueueSize(thumbnailQueueRef.current.length);
        const start = thumbnailStartRef.current.get(next.id);
        if (start) {
          thumbnailTotalTimeRef.current += Date.now() - start;
          thumbnailStartRef.current.delete(next.id);
        }
        setThumbnailStats((prev) => {
          const completed = prev.completed + (success ? 1 : 0);
          const failed = prev.failed + (success ? 0 : 1);
          const done = completed + failed;
          const avgMs = done ? Math.round(thumbnailTotalTimeRef.current / done) : 0;
          return { ...prev, completed, failed, avgMs };
        });
        processThumbnailQueue();
      });
  };

  const requestThumbnail = (node) => {
    if (!node?.id || !node?.url) return Promise.resolve(false);
    if (thumbnailRequestRef.current.has(node.id)) return Promise.resolve(false);
    thumbnailRequestRef.current.add(node.id);
    return new Promise((resolve) => {
      thumbnailQueueRef.current.push({ id: node.id, url: node.url, resolve });
      setThumbnailQueueSize(thumbnailQueueRef.current.length);
      processThumbnailQueue();
    });
  };

  // Fetch full page screenshot from backend (or display direct image URL)
  const viewFullScreenshot = async (urlOrImage, isDirectImage = false, nodeId = null) => {
    // If it's a direct image URL (uploaded thumbnail), just display it
    if (isDirectImage) {
      setFullImageUrl(urlOrImage);
      return;
    }

    setImageLoading(true);
    setFullImageUrl(null);
    showToast('Loading full page screenshot...', 'loading', true);

    try {
      const res = await fetch(
        `${API_BASE}/screenshot?url=${encodeURIComponent(urlOrImage)}&type=full`
      );
      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.url) {
        setFullImageUrl(data.url);
        setToast(null); // Clear the loading toast
        if (nodeId) {
          updateNodeThumbnail(nodeId, data.url);
        }
      } else {
        throw new Error('No screenshot URL returned');
      }
    } catch (e) {
      console.error('Screenshot error:', e);
      showToast(`Screenshot failed: ${e.message}`, 'error');
      setImageLoading(false);
    }
  };

  // Project folder functions
  const createProject = async (name) => {
    if (!name?.trim()) return;
    try {
      const { project } = await api.createProject(name.trim());
      setProjects(prev => [...prev, { ...project, maps: [] }]);
      showToast(`Project "${name}" created`, 'success');
      return project;
    } catch (e) {
      showToast(e.message || 'Failed to create project', 'error');
      return null;
    }
  };

  const renameProject = async (projectId, newName) => {
    if (!newName?.trim()) return;
    try {
      const { project } = await api.updateProject(projectId, newName.trim());
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, name: project.name } : p
      ));
      setEditingProjectId(null);
      showToast('Project renamed', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to rename project', 'error');
    }
  };

  const deleteProject = async (projectId) => {
    const confirmed = await showConfirm({
      title: 'Delete Project',
      message: 'Delete this project and all its maps?',
      confirmText: 'Delete',
      danger: true
    });
    if (!confirmed) return;
    try {
      await api.deleteProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
      showToast('Project deleted', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to delete project', 'error');
    }
  };

  // Map functions
  const saveMap = async (projectId, mapName) => {
    if (!root) return showToast('No sitemap to save', 'warning');
    if (!mapName?.trim()) return;

    try {
      let savedMap;
      if (currentMap?.id) {
        // Update existing map
        const { map } = await api.updateMap(currentMap.id, {
          name: mapName.trim(),
          root,
          orphans,
          connections,
          colors,
          project_id: projectId || null,
        });
        savedMap = map;
      } else {
        // Create new map
        const { map } = await api.saveMap({
          name: mapName.trim(),
          url: root.url,
          root,
          orphans,
          connections,
          colors,
          project_id: projectId || null,
        });
        savedMap = map;
      }

      // Update local projects list
      setProjects(prev => {
        // Remove from old project if exists
        let updated = prev.map(p => ({
          ...p,
          maps: (p.maps || []).filter(m => m.id !== savedMap.id),
        }));

        // Add to new project
        if (projectId) {
          updated = updated.map(p =>
            p.id === projectId
              ? { ...p, maps: [...(p.maps || []), savedMap] }
              : p
          );
        }
        return updated;
      });

      setCurrentMap(savedMap);
      setShowSaveMapModal(false);
      showToast(`Map "${mapName}" saved`, 'success');
      if (!currentMap?.id && lastHistoryId && lastScanUrl && root?.url === lastScanUrl) {
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
        setPendingCreateAfterSave(false);
        setShowCreateMapModal(true);
      }
    } catch (e) {
      showToast(e.message || 'Failed to save map', 'error');
    }
  };

  const startBlankMapCreation = (projectId, mapName) => {
    if (!mapName?.trim()) return;
    const trimmedName = mapName.trim();
    setCreateMapMode(false);
    setPendingMapCreation({ name: trimmedName, projectId: projectId || null });
    setMapName(trimmedName);
    setRoot(null);
    setOrphans([]);
    setConnections([]);
    setIsImportedMap(false);
    setCurrentMap({ name: trimmedName, project_id: projectId || null });
    setScale(1);
    setPan({ x: 0, y: 0 });
    setUrlInput('');
    resetScanLayers();
    setShowSaveMapModal(false);
    setEditModalNode({ id: '', url: '', title: '', parentId: '', children: [] });
    setEditModalMode('add');
  };

  const loadMap = (map) => {
    resetScanLayers();
    setRoot(map.root);
    setOrphans(normalizeOrphans(map.orphans));
    setConnections(map.connections || []);
    setColors(map.colors || DEFAULT_COLORS);
    setCurrentMap(map);
    setShowProjectsModal(false);
    setScale(1);
    setPan({ x: 0, y: 0 });
    setUrlInput(map.root?.url || '');
    showToast(`Loaded "${map.name}"`, 'success');
    setTimeout(resetView, 100);
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
      if (currentMap?.id === mapId) setCurrentMap(null);
      showToast('Map deleted', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to delete map', 'error');
    }
  };

  const toggleProjectExpanded = (projectId) => {
    setExpandedProjects(prev => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  // History functions
  const addToHistory = async (url, rootData, pageCount, scanConfig, depthValue) => {
    if (!isLoggedIn) return; // Only save history for logged-in users

    try {
      const { id } = await api.addToHistory({
        url,
        hostname: getHostname(url),
        title: rootData?.title || getHostname(url),
        page_count: pageCount,
        root: rootData,
        orphans,
        connections,
        colors,
        scan_options: scanConfig || null,
        scan_depth: Number.isFinite(depthValue) ? depthValue : null,
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
        orphans,
        connections,
        colors,
        scan_options: scanConfig || null,
        scan_depth: Number.isFinite(depthValue) ? depthValue : null,
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

  const cancelScan = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (scanAbortRef.current) {
      scanAbortRef.current.abort();
    }
    stopScanTimers();
    setLoading(false);
    setShowCancelConfirm(false);
    setScanProgress({ scanned: 0, queued: 0 });
    showToast('Scan cancelled', 'info');
  };

  const scan = (overrideUrl, preserveName = false) => {
    let urlToScan = urlInput;
    if (typeof overrideUrl === 'string') {
      urlToScan = overrideUrl;
    }
    const url = sanitizeUrl(urlToScan);
    if (!url) {
      showToast('Please enter a valid URL', 'warning');
      return;
    }

    const parsedDepth = Number.parseInt(scanDepth, 10);
    const depthValue = Number.isFinite(parsedDepth) ? Math.min(Math.max(parsedDepth, 0), 8) : 4;

    setLoading(true);
    setScanProgress({ scanned: 0, queued: 0 });
    startScanTimers();

    const scanConfig = {
      thumbnails: showThumbnails,
      ...scanOptions,
    };
    const params = new URLSearchParams({
      url,
      maxDepth: String(depthValue),
      options: JSON.stringify(scanConfig),
    });

    // Use SSE for progress updates
    const eventSource = new EventSource(
      `${API_BASE}/scan-stream?${params.toString()}`
    );
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        setScanProgress(data);
      } catch {}
    });

    eventSource.addEventListener('complete', (e) => {
      let data;
      try {
        data = JSON.parse(e.data);
      } catch (err) {
        console.error('Scan payload parse failed:', err);
        showToast('Scan completed but response could not be read', 'error');
        eventSource.close();
        eventSourceRef.current = null;
        stopScanTimers();
        setLoading(false);
        setScanProgress({ scanned: 0, queued: 0 });
        return;
      }

      if (!data?.root) {
        console.error('Scan completed without a root node:', data);
        showToast('Scan completed but returned no pages', 'error');
        eventSource.close();
        eventSourceRef.current = null;
        stopScanTimers();
        setLoading(false);
        setScanProgress({ scanned: 0, queued: 0 });
        return;
      }

      let merged = { root: data.root, orphans: data.orphans || [] };
      try {
        merged = applyScanArtifacts(data.root, data.orphans || [], data);
      } catch (err) {
        console.error('Scan artifact merge failed:', err);
        showToast('Scan completed with partial data', 'warning');
      }

      const nodesForCounts = collectAllNodesWithOrphans(merged.root, merged.orphans);
      const countThumbnails = nodesForCounts.filter((node) => !!node.thumbnailUrl).length;
      const authCount = nodesForCounts.filter((node) => !!node.authRequired).length;
      const duplicateCount = nodesForCounts.filter((node) => node.isDuplicate).length;
      setRoot(merged.root);
      setOrphans(merged.orphans);
      setConnections([]);
      setScanMeta({ brokenLinks: data.brokenLinks || [] });
      setScanLayerAvailability({
        thumbnails: scanOptions.thumbnails,
        inactivePages: scanOptions.inactivePages && (data.inactivePages || []).length > 0,
        subdomains: scanOptions.subdomains && (data.subdomains || []).length > 0,
        authenticatedPages: scanOptions.authenticatedPages && authCount > 0,
        orphanPages: scanOptions.orphanPages && (data.orphans || []).length > 0,
        errorPages: scanOptions.errorPages && (data.errors || []).length > 0,
        brokenLinks: scanOptions.brokenLinks && (data.brokenLinks || []).length > 0,
        duplicates: scanOptions.duplicates && duplicateCount > 0,
        files: scanOptions.files && (data.files || []).length > 0,
      });
      setScanLayerVisibility({
        thumbnails: scanOptions.thumbnails,
        inactivePages: scanOptions.inactivePages && (data.inactivePages || []).length > 0,
        subdomains: scanOptions.subdomains && (data.subdomains || []).length > 0,
        authenticatedPages: scanOptions.authenticatedPages && authCount > 0,
        orphanPages: scanOptions.orphanPages && (data.orphans || []).length > 0,
        errorPages: scanOptions.errorPages && (data.errors || []).length > 0,
        brokenLinks: scanOptions.brokenLinks && (data.brokenLinks || []).length > 0,
        duplicates: scanOptions.duplicates && duplicateCount > 0,
        files: scanOptions.files && (data.files || []).length > 0,
      });
      if (scanOptions.thumbnails) {
        setShowThumbnails(true);
      }
      if (scanOptions.thumbnails) {
        thumbnailQueueRef.current = [];
        thumbnailRequestRef.current = new Set();
        thumbnailActiveRef.current = 0;
        thumbnailStartRef.current = new Map();
        thumbnailTotalTimeRef.current = 0;
        setThumbnailQueueSize(0);
        setThumbnailActiveCount(0);
        setThumbnailStats({
          total: nodesForCounts.length,
          completed: 0,
          failed: 0,
          avgMs: 0,
        });
      } else {
        setThumbnailStats({ total: 0, completed: 0, failed: 0, avgMs: 0 });
      }
      setCurrentMap(null);
      setScale(1);
      setPan({ x: 0, y: 0 });
      setLastScanAt(new Date().toISOString());
      // Set map name from site title
      if (!preserveName && data.root?.title) {
        setMapName(data.root.title);
      } else if (!preserveName) {
        // Use domain as fallback
        try {
          const domain = new URL(url).hostname.replace('www.', '');
          setMapName(domain);
        } catch {
          setMapName('Untitled Map');
        }
      }
        const pageCount = countNodes(merged.root);
        addToHistory(url, merged.root, pageCount, scanConfig, depthValue);
        showToast(`Scan complete: ${new URL(url).hostname}`, 'success');
        setTimeout(resetView, 100);

      eventSource.close();
      eventSourceRef.current = null;
      stopScanTimers();
      setLoading(false);
      setScanProgress({ scanned: 0, queued: 0 });
    });

    eventSource.addEventListener('error', (e) => {
      try {
        const data = JSON.parse(e.data);
        showToast(`Scan failed: ${data.error}`, 'error');
      } catch {
        showToast('Scan failed: Connection error', 'error');
      }
      eventSource.close();
      eventSourceRef.current = null;
      stopScanTimers();
      setLoading(false);
      setScanProgress({ scanned: 0, queued: 0 });
    });

    eventSource.onerror = () => {
      showToast('Scan failed: Connection error');
      eventSource.close();
      eventSourceRef.current = null;
      stopScanTimers();
      setLoading(false);
      setScanProgress({ scanned: 0, queued: 0 });
    };
  };

  const onKeyDownUrl = (e) => {
    if (e.key === 'Enter') scan();
  };

  const onPointerDown = (e) => {
    if (!hasMap) return;
    if (e.button !== 0) return;
    const isInsideCard = e.target.closest('[data-node-card="1"]');
    const isUIControl = e.target.closest('.zoom-controls, .color-key, .color-key-toggle, .layers-panel, .canvas-toolbar, .theme-toggle');
    const isInsidePopover = e.target.closest('.comment-popover-container');
    const isInsideConnectionMenu = e.target.closest('.connection-menu');
    const isOnConnection = e.target.closest('.connections-layer');

    // Close connection menu when clicking outside of it
    if (connectionMenu && !isInsideConnectionMenu) {
      setConnectionMenu(null);
    }

    // Close comment popover when clicking outside of it (but not on cards or UI)
    if (commentingNodeId && !isInsidePopover && !isInsideCard) {
      setCommentingNodeId(null);
    }

    if (isInsideCard || isUIControl || isInsidePopover || isInsideConnectionMenu || isOnConnection) return;

    dragRef.current.dragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.startPanX = pan.x;
    dragRef.current.startPanY = pan.y;
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
    // Handle canvas panning
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newPan = { x: dragRef.current.startPanX + dx, y: dragRef.current.startPanY + dy };
    setPan(clampPan(newPan));
  };

  const onPointerUp = (e) => {
    // Handle canvas pan end
    dragRef.current.dragging = false;
    setIsPanning(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

      const zoomIn = () => {
    if (!contentRef.current) {
      setScale(s => clamp(s * 1.2, 0.1, 3));
      return;
    }
    const contentWidth = contentRef.current.offsetWidth;
    const oldScale = scaleRef.current;
    const newScale = clamp(oldScale * 1.2, 0.1, 3);
    const offsetAdjust = (contentWidth / 2) * (newScale - oldScale);
    setPan(p => ({ x: p.x - offsetAdjust, y: p.y }));
    setScale(newScale);
  };
  const zoomOut = () => {
    if (!contentRef.current) {
      setScale(s => clamp(s / 1.2, 0.1, 3));
      return;
    }
    const contentWidth = contentRef.current.offsetWidth;
    const oldScale = scaleRef.current;
    const newScale = clamp(oldScale / 1.2, 0.1, 3);
    const offsetAdjust = (contentWidth / 2) * (newScale - oldScale);
    setPan(p => ({ x: p.x - offsetAdjust, y: p.y }));
    setScale(newScale);
  };

  const resetView = () => {
    // Reset to 100% scale with Home page centered at top of viewport
    if (!contentRef.current || !canvasRef.current) {
      setScale(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    // First reset to default state
    setScale(1);
    setPan({ x: 0, y: 0 });

    // Wait for render, then center on root node
    setTimeout(() => {
      if (!contentRef.current || !canvasRef.current) return;

      const rootSelector = root?.id ? `[data-node-id="${root.id}"]` : '[data-depth="0"]';
      const rootNode = contentRef.current.querySelector(rootSelector);
      if (!rootNode) return;

      const canvasRect = canvasRef.current.getBoundingClientRect();
      const nodeCard = rootNode.querySelector('[data-node-card="1"]');
      const nodeRect = nodeCard ? nodeCard.getBoundingClientRect() : rootNode.getBoundingClientRect();

      // Calculate pan to center the home page horizontally and position it near top
      // Node position relative to canvas
      const nodeX = nodeRect.left - canvasRect.left + nodeRect.width / 2;
      const nodeY = nodeRect.top - canvasRect.top;

      // Target: center horizontally, 60px from top
      const targetX = canvasRect.width / 2;
      const targetY = 60;

      const newPanX = targetX - nodeX;
      const newPanY = targetY - nodeY;

      setPan({ x: newPanX, y: newPanY });
    }, 50);
  };

  const scheduleResetView = (attempts = 8) => {
    if (attempts <= 0) return;
    setTimeout(() => {
      if (!contentRef.current || !canvasRef.current) {
        scheduleResetView(attempts - 1);
        return;
      }
      const rootSelector = root?.id ? `[data-node-id="${root.id}"]` : '[data-depth="0"]';
      const rootNode = contentRef.current.querySelector(rootSelector);
      if (!rootNode) {
        scheduleResetView(attempts - 1);
        return;
      }
      resetView();
    }, 80);
  };

  const fitToScreen = () => {
    if (!contentRef.current || !canvasRef.current) return;

    // Reset first to measure at scale 1
    setScale(1);
    setPan({ x: 0, y: 0 });

    // Wait for render
    setTimeout(() => {
      if (!contentRef.current || !canvasRef.current) return;

      const cards = contentRef.current.querySelectorAll('[data-node-card="1"]');
      if (!cards.length) return;

      const canvasRect = canvasRef.current.getBoundingClientRect();

      // Find bounds of all cards in canvas coordinates
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        minX = Math.min(minX, rect.left - canvasRect.left);
        minY = Math.min(minY, rect.top - canvasRect.top);
        maxX = Math.max(maxX, rect.right - canvasRect.left);
        maxY = Math.max(maxY, rect.bottom - canvasRect.top);
      });

      // Include connectors in bounds
      const svgs = contentRef.current.querySelectorAll('.connector-svg');
      svgs.forEach(svg => {
        const rect = svg.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          minX = Math.min(minX, rect.left - canvasRect.left);
          minY = Math.min(minY, rect.top - canvasRect.top);
          maxX = Math.max(maxX, rect.right - canvasRect.left);
          maxY = Math.max(maxY, rect.bottom - canvasRect.top);
        }
      });

      const mapWidth = maxX - minX;
      const mapHeight = maxY - minY;
      const mapCenterX = (minX + maxX) / 2;
      const mapCenterY = (minY + maxY) / 2;

      const padding = 80;
      const availableWidth = canvasRect.width - padding * 2;
      const availableHeight = canvasRect.height - padding * 2;

      // Calculate scale to fit
      const scaleX = availableWidth / mapWidth;
      const scaleY = availableHeight / mapHeight;
      const newScale = clamp(Math.min(scaleX, scaleY), 0.05, 1);

      // Calculate pan to center the map
      // At scale 1, pan 0, the map center is at (mapCenterX, mapCenterY)
      // After scaling by newScale, it will be at a different position
      // We need to pan so the scaled map is centered in the canvas

      const canvasCenterX = canvasRect.width / 2;
      const canvasCenterY = canvasRect.height / 2;

      // The map will scale around the content origin (canvas center horizontally due to left:50%)
      // New map center relative position = (mapCenterX - canvasCenterX) * newScale + canvasCenterX
      // We want this to equal canvasCenterX, so:
      // panX = canvasCenterX - ((mapCenterX - canvasCenterX) * newScale + canvasCenterX)
      //      = -(mapCenterX - canvasCenterX) * newScale
      //      = (canvasCenterX - mapCenterX) * newScale
      // But actually simpler: just move the current map center to canvas center, accounting for scale

      const newPanX = (canvasCenterX - mapCenterX);
      const newPanY = (canvasCenterY - mapCenterY);

      setScale(newScale);
      setPan({ x: newPanX, y: newPanY });
    }, 50);
  };

  // Undo/Redo implementation
  const saveStateForUndo = () => {
    console.log('SAVING STATE FOR UNDO');
    setUndoStack(prev => [...prev, JSON.stringify({ root, orphans, connections })]);
    setRedoStack([]); // Clear redo on new action
  };

  const handleUndo = () => {
    console.log('UNDO CLICKED, stack:', undoStack.length);
    if (undoStack.length === 0) {
      console.log('Nothing to undo');
      return;
    }

    // Save current state to redo stack
    setRedoStack(prev => [...prev, JSON.stringify({ root, orphans, connections })]);

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
    console.log('UNDO COMPLETE');
  };

  const handleRedo = () => {
    console.log('REDO CLICKED, stack:', redoStack.length);
    if (redoStack.length === 0) {
      console.log('Nothing to redo');
      return;
    }

    // Save current state to undo stack
    setUndoStack(prev => [...prev, JSON.stringify({ root, orphans, connections })]);

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
      // Toggle comments panel with "C"
      if (e.key === 'c' || e.key === 'C') {
        setShowCommentsPanel(prev => !prev);
      }
      if (e.key === 'r' || e.key === 'R') {
        setShowReportDrawer(prev => {
          const next = !prev;
          if (next) setShowCommentsPanel(false);
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
        if (showCommentsPanel) {
          setActiveTool('select');
          setCommentingNodeId(null); // Close popover when switching tools
        }
        if (showReportDrawer) {
          setShowReportDrawer(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, redoStack, root, activeTool, connectionTool, connectionMenu, showCommentsPanel, showReportDrawer]);

  // Smooth wheel handling for pan/zoom
  const wheelStateRef = useRef({
    dx: 0,
    dy: 0,
    isZoom: false,
    cx: 0,
    cy: 0,
    raf: null,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const flushWheel = () => {
      wheelStateRef.current.raf = null;
      if (!root) return;

      const { dx, dy: wheelDy, isZoom, cx, cy } = wheelStateRef.current;
      wheelStateRef.current.dx = 0;
      wheelStateRef.current.dy = 0;

      if (isZoom) {
        const delta = -wheelDy;
        const zoomIntensity = 0.002;
        const currentScale = scaleRef.current;
        const next = Math.min(Math.max(currentScale * (1 + delta * zoomIntensity), 0.1), 3);

        const ox = (cx - panRef.current.x) / currentScale;
        const oy = (cy - panRef.current.y) / currentScale;

        const nx = cx - ox * next;
        const ny = cy - oy * next;

        setScale(next);
        setPan(clampPan({ x: nx, y: ny }));
        return;
      }

      if (dx === 0 && wheelDy === 0) return;
      setPan((p) => clampPan({
        x: p.x - dx,
        y: p.y - wheelDy,
      }));
    };

    const handleWheel = (e) => {
      e.preventDefault();
      if (!root) return;

      wheelStateRef.current.dx += e.deltaX;
      wheelStateRef.current.dy += e.deltaY;
      wheelStateRef.current.isZoom = e.ctrlKey || e.metaKey;

      const rect = canvas.getBoundingClientRect();
      wheelStateRef.current.cx = e.clientX - rect.left;
      wheelStateRef.current.cy = e.clientY - rect.top;

      if (!wheelStateRef.current.raf) {
        wheelStateRef.current.raf = requestAnimationFrame(flushWheel);
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [root, clampPan]);

  const exportJson = () => {
    if (!root) return;
    downloadText('sitemap.json', JSON.stringify({ root, colors }, null, 2));
    showToast('Downloaded JSON');
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
        hasChildren: node.children?.length > 0 ? 'Yes' : 'No',
        childCount: node.children?.length || 0,
      });
      (node.children || []).forEach((child, idx) => {
        flattenWithNumber(child, depth + 1, `${number}.${idx + 1}`);
      });
    };

    flattenWithNumber(root, 0, '1');

    // Create CSV content
    const headers = ['Page Number', 'Depth Level', 'Page Title', 'URL', 'Has Children', 'Child Count'];
    const csvRows = [
      headers.join(','),
      ...rows.map(row => [
        `"${row.number}"`,
        row.depth,
        `"${row.title}"`,
        `"${row.url}"`,
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
    const savedScale = scale;
    const savedPan = { ...pan };

    showToast('Generating PDF...', 'info', true);

    try {
      // Dynamically import dependencies
      const [{ jsPDF }, { toSvg }] = await Promise.all([
        import('jspdf'),
        import('html-to-image'),
      ]);

      // Reset to 1:1 scale for accurate capture
      setScale(1);
      setPan({ x: 0, y: 0 });
      await new Promise(r => setTimeout(r, 200));

      // Capture visual map using same approach as PNG export
      const content = contentRef.current;
      const canvas = canvasRef.current;
      const canvasRect = canvas.getBoundingClientRect();
      const cards = content.querySelectorAll('[data-node-card="1"]');

      if (!cards.length) {
        setScale(savedScale);
        setPan(savedPan);
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
      setPan({ x: offsetX, y: offsetY });

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
          // Exclude cross-origin thumbnail images
          if (node.tagName === 'IMG' && node.classList?.contains('thumb-img')) return false;
          return true;
        },
      });

      // Restore grid dots and transform state
      content.classList.remove('export-mode');
      setScale(savedScale);
      setPan(savedPan);

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
      setScale(savedScale);
      setPan(savedPan);
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
        const rowHeight = Math.max(12, urlLines.length * 12);

        if (y + rowHeight > pageHeight - 40) {
          pdf.addPage();
          y = 40;
        }

        pdf.text(row.number || '--', marginX, y);
        pdf.text(title.slice(0, 28), marginX + 50, y);
        pdf.text(issues.slice(0, 40), marginX + 220, y);
        pdf.text(urlLines, marginX + 310, y);
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
    try {
      // Create share via API
      const { share } = await api.createShare({
        map_id: currentMap?.id || null,
        root,
        orphans,
        connections,
        colors,
        expires_in_days: 30, // Share links expire in 30 days
      });

      // Create shareable URL with access level (preserve current pathname)
      const shareUrl = new URL(window.location.href);
      shareUrl.searchParams.set('share', share.id);
      shareUrl.searchParams.set('access', permission);

      await navigator.clipboard.writeText(shareUrl.toString());
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);

      const permLabel = permission === ACCESS_LEVELS.VIEW ? 'view-only' :
                        permission === ACCESS_LEVELS.COMMENT ? 'can comment' : 'can edit';
      showToast(`Link copied (${permLabel})`, 'success');
    } catch (e) {
      // If not logged in, fall back to localStorage
      if (e.message?.includes('Authentication')) {
        const shareId = `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const shareData = { root, orphans, connections, colors, createdAt: Date.now() };
        localStorage.setItem(shareId, JSON.stringify(shareData));
        const shareUrl = new URL(window.location.href);
        shareUrl.searchParams.set('share', shareId);
        shareUrl.searchParams.set('access', permission);
        await navigator.clipboard.writeText(shareUrl.toString());
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);

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
    const savedScale = scale;
    const savedPan = { ...pan };

    try {
      showToast('Generating PNG...', 'info', true);

      // Reset to 1:1 scale for accurate capture
      setScale(1);
      setPan({ x: 0, y: 0 });

      // Wait for React to re-render
      await new Promise(r => setTimeout(r, 200));

      const { toPng } = await import('html-to-image');

      const content = contentRef.current;
      const canvas = canvasRef.current;
      const canvasRect = canvas.getBoundingClientRect();

      // Find bounds of all cards
      const cards = content.querySelectorAll('[data-node-card="1"]');
      if (!cards.length) {
        setScale(savedScale);
        setPan(savedPan);
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
      setPan({ x: offsetX, y: offsetY });

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
      setScale(savedScale);
      setPan(savedPan);
    }
  };
const findNodeById = (node, id) => {
    if (!node) return null;
    if (node.id === id) return node;
    for (const c of node.children || []) {
      const f = findNodeById(c, id);
      if (f) return f;
    }
    return null;
  };

  // Add a comment to a node
  const addCommentToNode = (nodeId, commentText, parentCommentId = null) => {
    if (!commentText.trim()) return;

    const newComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      text: commentText.trim(),
      author: currentUser?.name || 'Anonymous',
      createdAt: new Date().toISOString(),
      mentions: (commentText.match(/@(\w+)/g) || []).map(m => m.slice(1)),
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

      // Check if it's an orphan
      const orphanIndex = orphans.findIndex(o => o.id === nodeId);
      if (orphanIndex !== -1) {
        setOrphans(prev => prev.map((o, i) =>
          i === orphanIndex
            ? { ...o, comments: addReplyToComment(o.comments || []) }
            : o
        ));
        return;
      }

      // Update in tree
      setRoot(prev => {
        const copy = structuredClone(prev);
        const node = findNodeById(copy, nodeId);
        if (node) {
          node.comments = addReplyToComment(node.comments || []);
        }
        return copy;
      });
      return;
    }

    saveStateForUndo();

    // Check if it's an orphan
    const orphanIndex = orphans.findIndex(o => o.id === nodeId);
    if (orphanIndex !== -1) {
      setOrphans(prev => prev.map((o, i) =>
        i === orphanIndex
          ? { ...o, comments: [...(o.comments || []), newComment] }
          : o
      ));
      return;
    }

    // Update in tree
    setRoot(prev => {
      const copy = structuredClone(prev);
      const node = findNodeById(copy, nodeId);
      if (node) {
        node.comments = [...(node.comments || []), newComment];
      }
      return copy;
    });
  };

  // Toggle completed state on a comment
  const toggleCommentCompleted = (nodeId, commentId) => {
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

    // Check if it's an orphan
    const orphanIndex = orphans.findIndex(o => o.id === nodeId);
    if (orphanIndex !== -1) {
      setOrphans(prev => prev.map((o, i) =>
        i === orphanIndex
          ? { ...o, comments: toggleInComments(o.comments || []) }
          : o
      ));
      return;
    }

    // Update in tree
    setRoot(prev => {
      const copy = structuredClone(prev);
      const node = findNodeById(copy, nodeId);
      if (node) {
        node.comments = toggleInComments(node.comments || []);
      }
      return copy;
    });
  };

  // Delete a comment from a node
  const deleteComment = (nodeId, commentId) => {
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

    // Check if it's an orphan
    const orphanIndex = orphans.findIndex(o => o.id === nodeId);
    if (orphanIndex !== -1) {
      setOrphans(prev => prev.map((o, i) =>
        i === orphanIndex
          ? { ...o, comments: deleteFromComments(o.comments || []) }
          : o
      ));
      return;
    }

    // Update in tree
    setRoot(prev => {
      const copy = structuredClone(prev);
      const node = findNodeById(copy, nodeId);
      if (node) {
        node.comments = deleteFromComments(node.comments || []);
      }
      return copy;
    });
  };

  // Get node by ID (from tree or orphans)
  const getNodeById = (nodeId) => {
    const orphan = orphans.find(o => o.id === nodeId);
    if (orphan) return orphan;
    return findNodeById(root, nodeId);
  };

  // Navigate to a node - pan canvas to center the node and optionally zoom
  const navigateToNode = (nodeId) => {
    const nodeElement = contentRef.current?.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeElement || !canvasRef.current) return;

    const nodeRect = nodeElement.getBoundingClientRect();
    const canvasRect = canvasRef.current.getBoundingClientRect();

    // Calculate center of canvas, offset left if comments panel is open
    // Comments panel is 320px wide, so offset by half that (160px)
    const panelOffset = showCommentsPanel ? 160 : 0;
    const canvasCenterX = (canvasRect.width / 2) - panelOffset;
    const canvasCenterY = canvasRect.height / 2;

    // Calculate where node currently is relative to canvas
    const nodeCurrentX = nodeRect.left - canvasRect.left + nodeRect.width / 2;
    const nodeCurrentY = nodeRect.top - canvasRect.top + nodeRect.height / 2;

    // Calculate pan adjustment needed to center the node
    const dx = canvasCenterX - nodeCurrentX;
    const dy = canvasCenterY - nodeCurrentY;

    // Apply the pan
    setPan(p => clampPan({ x: p.x + dx, y: p.y + dy }));

    // Optionally zoom to 100% if zoomed out
    if (scale < 0.8) {
      setScale(1);
    }
  };

  // Open comment popover positioned next to a node
  const openCommentPopover = (nodeId) => {
    const nodeElement = contentRef.current?.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeElement || !canvasRef.current) return;

    // Get node position in canvas coordinates (from the positioned wrapper)
    const nodeWrapper = nodeElement.closest('.sitemap-node-positioned');
    if (!nodeWrapper) return;

    const nodeX = parseFloat(nodeWrapper.style.left) || 0;
    const nodeY = parseFloat(nodeWrapper.style.top) || 0;
    const nodeW = LAYOUT.NODE_W;
    const popoverWidth = 320;
    const gap = 16;

    // Get the node's screen position to check if popover fits on right
    const nodeRect = nodeElement.getBoundingClientRect();
    const canvasRect = canvasRef.current.getBoundingClientRect();

    // Check if there's enough room on the right side of the node (in screen space)
    const rightSpaceAvailable = canvasRect.right - nodeRect.right;
    const needsLeftPosition = rightSpaceAvailable < (popoverWidth + gap);

    // Calculate popover position in canvas coordinates
    const side = needsLeftPosition ? 'left' : 'right';
    const popoverX = side === 'right'
      ? nodeX + nodeW + gap
      : nodeX - popoverWidth - gap;

    setCommentPopoverPos({ x: popoverX, y: nodeY, side });
    setCommentingNodeId(nodeId);
  };

  // ========== CONNECTION LINE FUNCTIONS ==========

  const SNAP_RADIUS = 30; // Magnetic snap radius in canvas pixels

  // Get anchor position in canvas coordinates
  const getAnchorPosition = (nodeId, anchor) => {
    const nodeElement = contentRef.current?.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeElement) return null;

    const nodeWrapper = nodeElement.closest('.sitemap-node-positioned');
    if (!nodeWrapper) return null;

    const nodeX = parseFloat(nodeWrapper.style.left) || 0;
    const nodeY = parseFloat(nodeWrapper.style.top) || 0;
    const nodeW = LAYOUT.NODE_W;
    const nodeH = getNodeH(showThumbnails);

    switch (anchor) {
      case 'top': return { x: nodeX + nodeW / 2, y: nodeY };
      case 'right': return { x: nodeX + nodeW, y: nodeY + nodeH / 2 };
      case 'bottom': return { x: nodeX + nodeW / 2, y: nodeY + nodeH };
      case 'left': return { x: nodeX, y: nodeY + nodeH / 2 };
      default: return { x: nodeX + nodeW / 2, y: nodeY + nodeH / 2 };
    }
  };

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

      saveStateForUndo();
      setConnections(prev => [...prev, newConnection]);
      showToast(`${drawingConnection.type === 'userflow' ? 'User Flow' : 'Crosslink'} created`, 'success');
    }

    // Re-enable text selection
    document.body.style.userSelect = '';
    setDrawingConnection(null);
  };

  // Delete a connection
  const deleteConnection = (connectionId) => {
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
        } else {
          saveStateForUndo();
          setConnections(conns => conns.filter(c => c.id !== connId));
          showToast('Connection deleted', 'success');
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
    } else {
      saveStateForUndo();
      setConnections(prev => prev.filter(c => c.id !== connectionId));
      showToast('Connection deleted', 'success');
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

  const getAnchorOffset = (conn, nodeId, anchor, isSource) => {
    const shared = getConnectionsAtAnchor(nodeId, anchor, isSource);
    if (shared.length <= 1) return { x: 0, y: 0 };

    const index = shared.findIndex(c => c.id === conn.id);
    const offset = (index - (shared.length - 1) / 2) * 16;

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

  // ========== END CONNECTION LINE FUNCTIONS ==========

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
    const orphanToDelete = orphans.find(o => o.id === id);
    if (orphanToDelete) {
      setDeleteConfirmNode(orphanToDelete);
    }
  };

  // Actually deletes the node (called after confirmation)
  const confirmDeleteNode = () => {
    if (!deleteConfirmNode) return;
    const id = deleteConfirmNode.id;

    // Check if it's an orphan
    if (orphans.some(o => o.id === id)) {
      setOrphans(prev => prev.filter(o => o.id !== id));
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

  // Find parent of a node in the tree
  const findParentOf = (tree, nodeId, parent = null) => {
    if (!tree) return null;
    if (tree.id === nodeId) return parent;
    for (const child of tree.children || []) {
      const found = findParentOf(child, nodeId, tree);
      if (found) return found;
    }
    return null;
  };

  const openEditModal = (node) => {
    // Check if it's an orphan
    if (orphans.some(o => o.id === node.id)) {
      setEditModalNode({
        ...node,
        parentId: '', // Orphans have no parent
      });
      setEditModalMode('edit');
      return;
    }
    // Find the current parent of this node in tree
    const parent = findParentOf(root, node.id);
    setEditModalNode({
      ...node,
      parentId: parent?.id || '',
    });
    setEditModalMode('edit');
  };

  const duplicateNode = (node) => {
    // Check if it's an orphan
    if (orphans.some(o => o.id === node.id)) {
      setEditModalNode({
        ...node,
        id: undefined,
        title: `${node.title} (Copy)`,
        parentId: '', // Orphans have no parent by default
      });
      setEditModalMode('duplicate');
      return;
    }
    // Find the current parent of this node in tree
    const parent = findParentOf(root, node.id);
    setEditModalNode({
      ...node,
      id: undefined, // Will get a new ID
      title: `${node.title} (Copy)`,
      parentId: parent?.id || '',
    });
    setEditModalMode('duplicate');
  };

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

    // Check if node is currently an orphan
    const isCurrentlyOrphan = orphans.some(o => o.id === updatedNode.id);
    const newParentId = updatedNode.parentId || '';

    if (editModalMode === 'edit') {
      // Update existing node
      saveStateForUndo();

      if (isCurrentlyOrphan) {
        // Node is currently an orphan
        if (newParentId === '') {
          // Stays as orphan - just update properties
          setOrphans(prev => prev.map(o =>
            o.id === updatedNode.id
              ? { ...o, title: updatedNode.title, url: updatedNode.url, pageType: updatedNode.pageType,
                  thumbnailUrl: updatedNode.thumbnailUrl, description: updatedNode.description, metaTags: updatedNode.metaTags }
              : o
          ));
        } else {
          // Moving from orphans to tree
          const orphanNode = orphans.find(o => o.id === updatedNode.id);
          if (orphanNode) {
            const nodeToMove = {
              ...orphanNode,
              title: updatedNode.title,
              url: updatedNode.url,
              pageType: updatedNode.pageType,
              thumbnailUrl: updatedNode.thumbnailUrl,
              description: updatedNode.description,
              metaTags: updatedNode.metaTags
            };
            // Remove from orphans
            setOrphans(prev => prev.filter(o => o.id !== updatedNode.id));
            // Add to tree
            setRoot(prev => {
              const copy = structuredClone(prev);
              const newParent = findNodeById(copy, newParentId);
              if (newParent) {
                newParent.children = newParent.children || [];
                newParent.children.push(nodeToMove);
              }
              return copy;
            });
          }
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
            description: updatedNode.description,
            metaTags: updatedNode.metaTags,
          });

          // Check if parent changed
          const currentParent = findParentInTree(copy, updatedNode.id);
          const currentParentId = currentParent?.id || '';

          if (currentParentId !== newParentId) {
            // Parent changed - need to move the node
            // Don't allow moving root node
            if (copy.id === updatedNode.id) return copy;

            // Remove from current parent
            removeFromParent(copy, updatedNode.id);

            if (newParentId === '') {
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
      const newNode = {
        ...updatedNode,
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        children: [], // Don't copy children for duplicates
        comments: [], // Fresh comments for duplicates
      };

      saveStateForUndo();

      if (newParentId === '') {
        // Add to orphans
        setOrphans(prev => [...prev, { ...newNode, orphanType: 'orphan', subdomainRoot: false }]);
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
      const newNodeData = {
        url: updatedNode.url || '',
        title: updatedNode.title || 'New Page',
        pageType: updatedNode.pageType || 'page',
        thumbnailUrl: updatedNode.thumbnailUrl || '',
        description: updatedNode.description || '',
        metaTags: updatedNode.metaTags || {},
        children: [],
        comments: [],
      };

      if (!root) { // This is the first page, so it becomes the root.
        const newRoot = { ...newNodeData, id: 'root' };
        const mapNameToUse = pendingMapCreation?.name || currentMap?.name || mapName || 'Untitled Map';
        const projectIdToUse = pendingMapCreation?.projectId || currentMap?.project_id || null;

        const mapToSave = {
          name: mapNameToUse,
          url: newRoot.url,
          root: newRoot,
          orphans: [],
          colors: DEFAULT_COLORS,
          project_id: projectIdToUse,
        };

        api.saveMap(mapToSave)
          .then(({ map }) => {
            setRoot(newRoot);
            setCurrentMap(map);
            setMapName(map.name);
            setPendingMapCreation(null);

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
                      ? { ...p, maps: [...(p.maps || []), map] }
                      : p
                  );
                } else {
                  const uncategorized = updated.find(p => p.id === 'uncategorized' || p.name === 'Uncategorized');
                  if (uncategorized) {
                    uncategorized.maps.push(map);
                  } else {
                    updated.push({ id: 'uncategorized', name: 'Uncategorized', maps: [map] });
                  }
                }
              } else {
                const uncategorized = updated.find(p => p.id === 'uncategorized' || p.name === 'Uncategorized');
                if (uncategorized) {
                  uncategorized.maps.push(map);
                } else {
                  updated.push({ id: 'uncategorized', name: 'Uncategorized', maps: [map] });
                }
              }
              return updated;
            });

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
        if (newParentId === '') {
          setOrphans(prev => [...prev, { ...newNode, orphanType: 'orphan', subdomainRoot: false }]);
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

  const findParent = (tree, nodeId, parent = null) => {
    if (!tree) return null;
    if (tree.id === nodeId) return parent;
    for (const child of tree.children || []) {
      const found = findParent(child, nodeId, tree);
      if (found) return found;
    }
    return null;
  };

  const isDescendantOf = (tree, nodeId, ancestorId) => {
    const ancestor = findNodeById(tree, ancestorId);
    if (!ancestor) return false;
    return !!findNodeById(ancestor, nodeId);
  };

  const moveNode = (nodeId, newParentId, insertIndex) => {
    if (!root || nodeId === root.id) return;
    if (nodeId === newParentId) return;
    if (isDescendantOf(root, newParentId, nodeId)) return;

    saveStateForUndo();
    const orphanIndex = orphans.findIndex(o => o.id === nodeId);
    if (orphanIndex !== -1) {
      const orphanNode = orphans[orphanIndex];
      setOrphans(prev => prev.filter(o => o.id !== nodeId));
      setRoot((prev) => {
        const copy = structuredClone(prev);
        const newParent = findNodeById(copy, newParentId);
        if (!newParent) return prev;
        newParent.children = newParent.children || [];
        newParent.children.splice(insertIndex, 0, {
          ...orphanNode,
          orphanType: 'orphan',
          subdomainRoot: false,
        });
        return copy;
      });
      return;
    }
    const findNodeInTree = (tree, targetId) => {
      if (!tree) return null;
      if (tree.id === targetId) return tree;
      for (const child of tree.children || []) {
        const found = findNodeInTree(child, targetId);
        if (found) return found;
      }
      return null;
    };
    const removeFromTree = (tree, targetId) => {
      if (!tree?.children?.length) return null;
      const idx = tree.children.findIndex(c => c.id === targetId);
      if (idx !== -1) {
        return tree.children.splice(idx, 1)[0];
      }
      for (const child of tree.children) {
        const removed = removeFromTree(child, targetId);
        if (removed) return removed;
      }
      return null;
    };
    const orphanChildIndex = orphans.findIndex(o => findNodeInTree(o, nodeId));
    if (orphanChildIndex !== -1) {
      const orphanRoot = orphans[orphanChildIndex];
      const orphanCopy = structuredClone(orphanRoot);
      const removedNode = orphanCopy.id === nodeId ? orphanCopy : removeFromTree(orphanCopy, nodeId);
      if (!removedNode) return;
      const nextOrphans = structuredClone(orphans);
      nextOrphans[orphanChildIndex] = orphanCopy;
      setOrphans(nextOrphans);
      setRoot((prev) => {
        const copy = structuredClone(prev);
        const newParent = findNodeById(copy, newParentId);
        if (!newParent) return prev;
        newParent.children = newParent.children || [];
        newParent.children.splice(insertIndex, 0, {
          ...removedNode,
          orphanType: 'orphan',
          subdomainRoot: false,
        });
        return copy;
      });
      return;
    }
    setRoot((prev) => {
      const copy = structuredClone(prev);
      const nodeToMove = findNodeById(copy, nodeId);
      if (!nodeToMove) return prev;

      const oldParent = findParent(copy, nodeId);
      if (!oldParent) return prev;

      const oldIndex = oldParent.children.findIndex(c => c.id === nodeId);
      if (oldIndex === -1) return prev;

      oldParent.children.splice(oldIndex, 1);

      const newParent = findNodeById(copy, newParentId);
      if (!newParent) return prev;

      newParent.children = newParent.children || [];

      let adjustedIndex = insertIndex;
      if (oldParent.id === newParentId && oldIndex < insertIndex) {
        adjustedIndex = insertIndex - 1;
      }

      newParent.children.splice(adjustedIndex, 0, nodeToMove);
      return copy;
    });
  };

  // Calculate all valid drop zones based on current DOM positions
  const calculateDropZones = (draggedNodeId) => {
    if (!contentRef.current || !root) return [];
    const zones = [];
    const cards = contentRef.current.querySelectorAll('[data-node-card="1"]');

    cards.forEach((card) => {
      const nodeId = card.getAttribute('data-node-id');
      if (!nodeId) return;

      // Skip the dragged node itself
      if (nodeId === draggedNodeId) return;

      // Skip descendants of the dragged node
      if (isDescendantOf(root, nodeId, draggedNodeId)) return;

      const rect = card.getBoundingClientRect();
      const node = findNodeById(root, nodeId);
      if (!node) return;

      const parent = findParent(root, nodeId);
      if (!parent) return;

      const siblingIndex = parent.children.findIndex(c => c.id === nodeId);
      // Get depth from the positioned wrapper element
      const positionedWrapper = card.closest('[data-depth]');
      const depth = parseInt(positionedWrapper?.getAttribute('data-depth') || '0', 10);

      // Add sibling drop zones (before this node)
      // Level 1 (depth=1) uses horizontal layout, Level 2+ (depth>1) uses vertical
      if (depth === 1) {
        // Horizontal layout (Level 1) - drop zones to left/right
        zones.push({
          type: 'sibling',
          layout: 'horizontal',
          parentId: parent.id,
          index: siblingIndex,
          x: rect.left - 24,
          y: rect.top + rect.height / 2,
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
          });
        }
      } else if (depth > 1) {
        // Vertical layout (Level 2+) - drop zones above/below ONLY
        zones.push({
          type: 'sibling',
          layout: 'vertical',
          parentId: parent.id,
          index: siblingIndex,
          x: rect.left + rect.width / 2,
          y: rect.top - 28, // In the gap above
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
          });
        }
      }
      // depth === 0 is the root node - no sibling zones for root

      // Add child drop zone if node has no children
      // Position below the card with GAP_STACK_Y spacing, center of the zone
      if (!node.children?.length) {
        const childZoneHeight = 200; // Use collapsed height as reference
        zones.push({
          type: 'child',
          layout: 'vertical',
          parentId: nodeId,
          index: 0,
          x: rect.left + rect.width / 2,
          y: rect.bottom + 60 + childZoneHeight / 2, // Top of zone at rect.bottom + 60
        });
      }
    });

    return zones;
  };

  // Find nearest drop zone within threshold
  const findNearestDropZone = (x, y, draggedNodeId, threshold = 60) => {
    const zones = calculateDropZones(draggedNodeId);
    let nearest = null;
    let nearestDist = Infinity;

    for (const zone of zones) {
      // Skip invalid zones
      if (zone.type === 'sibling') {
        const parent = findNodeById(root, zone.parentId);
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
    const { active, delta } = event;
    if (!active) return;

    const activatorRect = active.rect.current.initial;
    if (!activatorRect) return;

    const currentX = activatorRect.left + activatorRect.width / 2 + delta.x;
    const currentY = activatorRect.top + activatorRect.height / 2 + delta.y;

    // Store cursor position for proximity filtering
    setDragCursor({ x: currentX, y: currentY });

    // Find nearest drop zone
    const nearest = findNearestDropZone(currentX, currentY, active.id, 80);
    setActiveDropZone(nearest);
  };

  const handleDndDragEnd = (event) => {
    const { active } = event;
    const draggedNodeId = active.id;

    // Get final pointer position from the event
    // dnd-kit provides activatorEvent which has the original pointer position
    // We need to calculate final position from delta
    const delta = event.delta || { x: 0, y: 0 };
    const activatorRect = active.rect.current.initial;
    if (activatorRect) {
      const finalX = activatorRect.left + activatorRect.width / 2 + delta.x;
      const finalY = activatorRect.top + activatorRect.height / 2 + delta.y;

      // Find nearest drop zone
      const dropZone = findNearestDropZone(finalX, finalY, draggedNodeId, 80);

      if (dropZone) {
        moveNode(draggedNodeId, dropZone.parentId, dropZone.index);
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
// File import parsing functions
  const generateId = () => `import_${Math.random().toString(36).slice(2, 10)}`;

  const parseXmlSitemap = (text) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    const urls = [];

    // Check for parse errors - if XML is invalid, fall back to regex
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      console.error('XML parse error, using regex fallback');
      const urlRegex = /https?:\/\/[^\s<>"']+/gi;
      let match;
      while ((match = urlRegex.exec(text)) !== null) {
        urls.push(match[0]);
      }
      return [...new Set(urls)];
    }

    // Use getElementsByTagName which ignores namespaces
    const locElements = doc.getElementsByTagName('loc');

    for (let i = 0; i < locElements.length; i++) {
      const url = locElements[i].textContent?.trim();
      if (url) {
        urls.push(url);
      }
    }

    // If no loc elements, try to find any URLs in the text
    if (urls.length === 0) {
      const urlRegex = /https?:\/\/[^\s<>"']+/gi;
      let match;
      while ((match = urlRegex.exec(text)) !== null) {
        urls.push(match[0]);
      }
    }

    return [...new Set(urls)];
  };

  const parseRssAtom = (text) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    const urls = [];

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      console.error('XML parse error:', parseError.textContent);
      return urls;
    }

    // RSS format - use getElementsByTagName for namespace compatibility
    const items = doc.getElementsByTagName('item');
    for (let i = 0; i < items.length; i++) {
      const link = items[i].getElementsByTagName('link')[0];
      if (link?.textContent?.trim()) {
        urls.push(link.textContent.trim());
      }
    }

    // Atom format
    const entries = doc.getElementsByTagName('entry');
    for (let i = 0; i < entries.length; i++) {
      const links = entries[i].getElementsByTagName('link');
      for (let j = 0; j < links.length; j++) {
        const href = links[j].getAttribute('href');
        if (href && href.startsWith('http')) {
          urls.push(href);
        }
      }
    }

    // Also check for channel link in RSS
    const channelLinks = doc.getElementsByTagName('link');
    for (let i = 0; i < channelLinks.length; i++) {
      const url = channelLinks[i].textContent?.trim();
      if (url && url.startsWith('http') && !urls.includes(url)) {
        urls.push(url);
      }
    }

    return [...new Set(urls)];
  };

  const parseHtml = (text, baseUrl = '') => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const urls = [];

    doc.querySelectorAll('a[href]').forEach(a => {
      let href = a.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:')) {
        try {
          // Try to resolve relative URLs
          if (baseUrl && !href.startsWith('http')) {
            href = new URL(href, baseUrl).href;
          }
          if (href.startsWith('http')) {
            urls.push(href);
          }
        } catch {
          // Skip invalid URLs
        }
      }
    });

    return [...new Set(urls)];
  };

  const parseCsv = (text) => {
    const urls = [];
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      // Split by common delimiters
      const parts = line.split(/[,;\t]+/);
      for (const part of parts) {
        const trimmed = part.trim().replace(/^["']|["']$/g, '');
        if (trimmed.match(/^https?:\/\//i)) {
          urls.push(trimmed);
        }
      }
    }

    return urls;
  };

  const parseMarkdown = (text) => {
    const urls = [];

    // Markdown links: [text](url)
    const mdLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = mdLinkRegex.exec(text)) !== null) {
      if (match[2].match(/^https?:\/\//i)) {
        urls.push(match[2]);
      }
    }

    // Plain URLs
    const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
    while ((match = urlRegex.exec(text)) !== null) {
      urls.push(match[0]);
    }

    return [...new Set(urls)];
  };

  const parsePlainText = (text) => {
    const urls = [];
    const urlRegex = /https?:\/\/[^\s<>"']+/gi;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      urls.push(match[0]);
    }
    return [...new Set(urls)];
  };

  const buildTreeFromUrls = (urls) => {
    if (!urls.length) return null;

    // Group URLs by domain
    const byDomain = {};
    for (const url of urls) {
      try {
        const u = new URL(url);
        const domain = u.hostname;
        if (!byDomain[domain]) byDomain[domain] = [];
        byDomain[domain].push(url);
      } catch {
        // Skip invalid URLs
      }
    }

    const domains = Object.keys(byDomain);

    // If only one domain, build hierarchical tree
    if (domains.length === 1) {
      const domain = domains[0];
      const domainUrls = byDomain[domain];

      // Find the root URL (shortest path or homepage)
      const sorted = [...domainUrls].sort((a, b) => {
        const pathA = new URL(a).pathname;
        const pathB = new URL(b).pathname;
        return pathA.length - pathB.length;
      });

      const rootUrl = sorted[0];
      const root = {
        id: generateId(),
        title: domain,
        url: rootUrl,
        children: []
      };

      // Build tree based on URL paths
      const urlMap = new Map();
      urlMap.set(rootUrl, root);

      for (const url of sorted.slice(1)) {
        try {
          const u = new URL(url);
          const pathParts = u.pathname.split('/').filter(Boolean);
          const title = pathParts[pathParts.length - 1] || u.pathname || 'Page';

          const node = {
            id: generateId(),
            title: decodeURIComponent(title).replace(/[-_]/g, ' '),
            url: url,
            children: []
          };

          // Find parent by matching path
          let parent = root;
          let parentPath = '';
          for (let i = 0; i < pathParts.length - 1; i++) {
            parentPath += '/' + pathParts[i];
            const parentUrl = `${u.origin}${parentPath}`;
            if (urlMap.has(parentUrl)) {
              parent = urlMap.get(parentUrl);
            }
          }

          parent.children.push(node);
          urlMap.set(url, node);
        } catch {
          // Skip invalid URLs
        }
      }

      return root;
    }

    // Multiple domains: create a root with domain children
    const root = {
      id: generateId(),
      title: 'Imported Sites',
      url: urls[0],
      children: []
    };

    for (const domain of domains) {
      const domainUrls = byDomain[domain];
      const domainNode = {
        id: generateId(),
        title: domain,
        url: domainUrls[0],
        children: domainUrls.slice(1).map(url => ({
          id: generateId(),
          title: new URL(url).pathname || 'Page',
          url: url,
          children: []
        }))
      };
      root.children.push(domainNode);
    }

    return root;
  };

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
        setIsImportedMap(true); // Mark as imported - scanning won't work
        setScale(1);
        setPan({ x: 0, y: 0 });
        setUrlInput(tree.url || '');
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
    await processImportFile(file);
    e.target.value = ''; // Reset input for re-selection
  };

  // Handle file drop
  const handleImportDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    const file = e.dataTransfer.files?.[0];
    await processImportFile(file);
  };

  // Handle drag over (required for drop to work)
  const handleImportDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('drag-over');
  };

  // Handle drag leave
  const handleImportDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
  };

  // Show landing page or app
  if (showLanding) {
    return <LandingPage onLaunchApp={() => setShowLanding(false)} />;
  }

  return (
    <div className="app">
      <Topbar
        canEdit={canEdit()}
        urlInput={urlInput}
        onUrlInputChange={(e) => setUrlInput(e.target.value)}
        onUrlKeyDown={onKeyDownUrl}
        hasMap={hasMap}
        showThumbnails={showThumbnails}
        onToggleThumbnails={(nextValue) => setShowThumbnails(nextValue)}
        scanOptions={scanOptions}
        showScanOptions={showScanOptions}
        scanOptionsRef={scanOptionsRef}
        onToggleScanOptions={() => setShowScanOptions(v => !v)}
        onScanOptionChange={(key) => setScanOptions(prev => ({ ...prev, [key]: !prev[key] }))}
        scanLayerAvailability={scanLayerAvailability}
        scanLayerVisibility={scanLayerVisibility}
        onToggleScanLayer={(key) => setScanLayerVisibility(prev => ({ ...prev, [key]: !prev[key] }))}
        scanDepth={scanDepth}
        onScanDepthChange={(value) => {
          const cleaned = value.replace(/[^\d]/g, '');
          if (!cleaned) {
            setScanDepth('');
            return;
          }
          const nextValue = Math.min(Number(cleaned), 8);
          setScanDepth(String(nextValue));
        }}
        onScan={scan}
        scanDisabled={loading || isImportedMap || !sanitizeUrl(urlInput)}
        scanTitle={isImportedMap ? "Cannot scan imported maps" : !sanitizeUrl(urlInput) ? "Enter a valid URL to scan" : "Scan URL"}
        optionsDisabled={!urlInput.trim() || hasMap}
        onClearUrl={() => setUrlInput('')}
        showClearUrl={!hasMap && !!urlInput.trim()}
        mapName={mapName}
        isEditingMapName={isEditingMapName}
        onMapNameChange={(e) => setMapName(e.target.value)}
        onMapNameBlur={() => setIsEditingMapName(false)}
        onMapNameKeyDown={(e) => {
          if (e.key === 'Enter') {
            setIsEditingMapName(false);
          }
          if (e.key === 'Escape') {
            setIsEditingMapName(false);
          }
        }}
        onMapNameClick={() => canEdit() && setIsEditingMapName(true)}
        sharedTitle={root?.title || 'Shared Sitemap'}
        onCreateMap={async () => {
          if (!currentUser) {
            showToast('Please sign in to create a new map', 'warning');
            setShowAuthModal(true);
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
              setPendingCreateAfterSave(true);
              setCreateMapMode(false);
              setShowSaveMapModal(true);
              return;
            }
            const cleared = await clearCanvas();
            if (cleared) setShowCreateMapModal(true);
            return;
          }
          setShowCreateMapModal(true);
        }}
        onImportFile={() => setShowImportModal(true)}
        onShowProjects={() => setShowProjectsModal(true)}
        onShowHistory={() => setShowHistoryModal(true)}
        isLoggedIn={isLoggedIn}
        currentUser={currentUser}
        onShowProfile={() => setShowProfileModal(true)}
        onLogout={handleLogout}
        onLogin={handleLogin}
      />

      <div
        className={`canvas ${isPanning ? 'panning' : ''} ${activeTool === 'comments' ? 'comments-mode' : ''} ${connectionTool ? 'connection-mode' : ''}`}
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
       
      >
        {/* Permission banner for shared links with limited access */}
        {accessLevel !== ACCESS_LEVELS.EDIT && hasMap && (
          <div className="permission-banner">
            <Info size={16} />
            <span>
              {accessLevel === ACCESS_LEVELS.VIEW
                ? "You're viewing this sitemap in read-only mode"
                : "You can view and comment on this sitemap"}
            </span>
          </div>
        )}

        {/* Theme toggle */}
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title={`Switch to ${getCurrentTheme() === 'dark' ? 'light' : 'dark'} mode`}
        >
          <div className={`theme-toggle-track ${getCurrentTheme()}`}>
            <Sun size={14} className="theme-icon sun" />
            <Moon size={14} className="theme-icon moon" />
            <div className="theme-toggle-thumb" />
          </div>
        </button>

        {!hasMap && (
          <div className="blank">
            <div className="blank-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div className="blank-title">Ready to Map</div>
            <div className="blank-subtitle">Enter a URL above to get started</div>
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
              className={`content ${drawingConnection ? 'drawing-connection' : ''} ${draggingEndpoint ? 'dragging-endpoint' : ''}`}
              ref={contentRef}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale}) translate(-50%, 0px)`,
              }}
                onMouseMove={(e) => {
                  if (drawingConnection) handleConnectionMouseMove(e);
                  else if (draggingEndpoint) handleEndpointDragMove(e);
                }}
                onMouseUp={(e) => {
                  if (drawingConnection) handleConnectionMouseUp(e);
                  else if (draggingEndpoint) handleEndpointDragEnd();
                }}
              >
                <SitemapTree
                  data={renderRoot}
                  orphans={visibleOrphans}
                  showThumbnails={effectiveScanLayers.thumbnails && showThumbnails}
                  showCommentBadges={activeTool === 'comments' || showCommentsPanel}
                  canEdit={canEdit()}
                  canComment={canComment()}
                  connectionTool={connectionTool}
                  snapTarget={drawingConnection?.snapTarget || draggingEndpoint?.snapTarget}
                  onAnchorMouseDown={handleAnchorMouseDown}
                  colors={colors}
                  scale={scale}
                  onDelete={requestDeleteNode}
                  onEdit={openEditModal}
                  onDuplicate={duplicateNode}
                  onViewImage={viewFullScreenshot}
                  activeId={activeId}
                  onNodeDoubleClick={(id) => {
                    if (scale < 0.95) {
                      const el = contentRef.current?.querySelector(`[data-node-id="${id}"]`);
                      if (el) {
                        const rect = el.getBoundingClientRect();
                        const canvasRect = canvasRef.current.getBoundingClientRect();
                        const dx = canvasRect.left + canvasRect.width / 2 - (rect.left + rect.width / 2);
                        const dy = canvasRect.top + canvasRect.height / 2 - (rect.top + rect.height / 2);
                        setScale(1);
                        setPan(p => clampPan({ x: p.x + dx, y: p.y + dy }));
                      }
                    }
                  }}
                  onNodeClick={(node) => {
                    if (activeTool === 'comments') {
                      openCommentPopover(node.id);
                    }
                  }}
                  onAddNote={(node) => openCommentPopover(node.id)}
                  onViewNotes={(node) => openCommentPopover(node.id)}
                  badgeVisibility={effectiveScanLayers}
                  showPageNumbers={layers.pageNumbers}
                  onRequestThumbnail={requestThumbnail}
                  expandedStacks={expandedStacks}
                  onToggleStack={(nodeId) => {
                    setExpandedStacks((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
                  }}
                />

                {/* SVG Connections Layer */}
                <svg
                  className="connections-layer"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    overflow: 'visible',
                    zIndex: 5,
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
                </defs>

                {brokenConnections.map((conn) => {
                  const start = getAnchorPosition(conn.sourceId, 'right');
                  const end = getAnchorPosition(conn.targetId, 'left');
                  if (!start || !end) return null;
                  return (
                    <path
                      key={conn.id}
                      d={`M ${start.x} ${start.y} L ${start.x + conn.offsetX} ${start.y + conn.offsetY} L ${end.x - conn.offsetX} ${start.y + conn.offsetY} L ${end.x - conn.offsetX} ${end.y + conn.offsetY} L ${end.x} ${end.y}`}
                      fill="none"
                      stroke="#fca5a5"
                      strokeWidth="2"
                      strokeDasharray="6 6"
                      strokeLinecap="round"
                    />
                  );
                })}

                {/* Render completed connections */}
                {connections
                  .filter(conn => {
                    if (conn.type === 'userflow' && !layers.userFlows) return false;
                    if (conn.type === 'crosslink' && !layers.crossLinks) return false;
                    // Hide connection being dragged
                    if (draggingEndpoint?.connectionId === conn.id) return false;
                    return true;
                  })
                  .map(conn => {
                    const path = generateConnectionPath(conn);
                    if (!path) return null;
                    const isUserFlow = conn.type === 'userflow';
                    const color = isUserFlow ? '#14b8a6' : '#f97316';
                    const isHovered = hoveredConnection === conn.id;

                    return (
                      <g key={conn.id}>
                        {/* Invisible hit area for easier hovering */}
                        <path
                          d={path}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={16}
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
                        {isHovered && (
                          <path
                            d={path}
                            fill="none"
                            stroke={color}
                            strokeWidth={8}
                            strokeOpacity={0.3}
                            strokeLinecap="round"
                            strokeDasharray={isUserFlow ? 'none' : '8 6'}
                          />
                        )}
                        {/* Main line */}
                        <path
                          d={path}
                          fill="none"
                          stroke={color}
                          strokeWidth={isHovered ? 3 : 2}
                          strokeLinecap="round"
                          strokeDasharray={isUserFlow ? 'none' : '8 6'}
                          markerEnd={isUserFlow ? 'url(#arrowhead-userflow)' : 'none'}
                          style={{ pointerEvents: 'none' }}
                        />
                      </g>
                    );
                  })}

                {/* Temporary line while drawing */}
                {drawingConnection && (() => {
                  const { startX, startY, currentX, currentY, sourceAnchor, type } = drawingConnection;
                  const isUserFlow = type === 'userflow';
                  const color = isUserFlow ? '#14b8a6' : '#f97316';

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
                  const color = isUserFlow ? '#14b8a6' : '#f97316';

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

              {/* Connection context menu */}
              {connectionMenu && (
                <div
                  className="connection-menu"
                  style={{
                    position: 'absolute',
                    left: connectionMenu.x,
                    top: connectionMenu.y,
                    zIndex: 1000,
                  }}
                >
                  <button
                    className="connection-menu-item"
                    onClick={() => {
                      // TODO: Implement connection comments
                      showToast('Connection comments coming soon', 'info');
                      setConnectionMenu(null);
                    }}
                  >
                    <MessageSquare size={14} />
                    <span>Add Comment</span>
                  </button>
                  <button
                    className="connection-menu-item delete"
                    onClick={() => {
                      deleteConnection(connectionMenu.connectionId);
                      setConnectionMenu(null);
                    }}
                  >
                    <Trash2 size={14} />
                    <span>Delete</span>
                  </button>
                </div>
              )}

              {/* Comment Popover - positioned next to node */}
              {commentingNodeId && getNodeById(commentingNodeId) && (
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
                    node={getNodeById(commentingNodeId)}
                    onClose={() => setCommentingNodeId(null)}
                    onAddComment={addCommentToNode}
                    onToggleCompleted={toggleCommentCompleted}
                    onDeleteComment={deleteComment}
                    collaborators={collaborators}
                    canComment={canComment()}
                  />
                </div>
              )}
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
                    showThumbnails={effectiveScanLayers.thumbnails && showThumbnails}
                    depth={0}
                    showPageNumbers={layers.pageNumbers}
                  />
                </div>
              ) : null}
            </DragOverlay>

            {/* Drop zone indicators - only show zones near cursor */}
            {activeId && dropZones
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
              layersPanelProps={{
                layers,
                connectionTool,
                onToggleUserFlows: () => {
                  setLayers(l => ({ ...l, userFlows: !l.userFlows }));
                  if (layers.userFlows && connectionTool === 'userflow') {
                    setConnectionTool(null);
                  }
                },
                onToggleCrossLinks: () => {
                  setLayers(l => ({ ...l, crossLinks: !l.crossLinks }));
                  if (layers.crossLinks && connectionTool === 'crosslink') {
                    setConnectionTool(null);
                  }
                },
                showThumbnails: effectiveScanLayers.thumbnails && showThumbnails,
                onToggleThumbnails: (nextValue) => {
                  if (scanLayerAvailability.thumbnails) {
                    setScanLayerVisibility(prev => ({ ...prev, thumbnails: nextValue }));
                  } else {
                    setShowThumbnails(nextValue);
                  }
                },
                showPageNumbers: layers.pageNumbers,
                onTogglePageNumbers: () => setLayers(prev => ({ ...prev, pageNumbers: !prev.pageNumbers })),
                scanLayerAvailability,
                scanLayerVisibility,
                onToggleScanLayer: (layerKey) => {
                  setScanLayerVisibility(prev => ({
                    ...prev,
                    [layerKey]: !prev[layerKey],
                  }));
                },
                showViewDropdown,
                onToggleDropdown: () => setShowViewDropdown(!showViewDropdown),
                viewDropdownRef,
              }}
              colorKeyProps={{
                showColorKey,
                onToggle: () => setShowColorKey(v => !v),
                colors,
                maxDepth,
                editingDepth: editingColorDepth,
                onEditDepth: (depth, position) => {
                  setEditingColorDepth(depth);
                   setColorPickerPosition(position);
                },
              }}
              toolbarProps={{
                canEdit: canEdit(),
                activeTool,
                connectionTool,
                onSelectTool: () => {
                  setActiveTool('select');
                  setConnectionTool(null);
                },
                onAddPage: () => {
                  setEditModalNode({ id: '', url: '', title: '', parentId: '', children: [] });
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
                onToggleCommentsPanel: () => setShowCommentsPanel(!showCommentsPanel),
                hasAnyComments,
                showReportDrawer,
                onToggleReportDrawer: () => {
                  setShowReportDrawer((prev) => {
                    const next = !prev;
                    if (next) setShowCommentsPanel(false);
                    return next;
                  });
                },
                canUndo,
                canRedo,
                onUndo: handleUndo,
                onRedo: handleRedo,
                onClearCanvas: clearCanvas,
                onSaveMap: () => {
                  setCreateMapMode(false);
                  setShowSaveMapModal(true);
                },
                onExport: () => setShowExportModal(true),
                onShare: () => setShowShareModal(true),
                hasMap,
              }}
              zoomProps={{
                scale,
                onZoomOut: zoomOut,
                onZoomIn: zoomIn,
                onFitToScreen: fitToScreen,
                onResetView: resetView,
              }}
            />
            <ReportDrawer
              isOpen={showReportDrawer}
              onClose={() => setShowReportDrawer(false)}
              entries={reportRows}
              stats={reportStats}
              typeOptions={REPORT_TYPE_OPTIONS}
              onDownload={downloadReportPdf}
              onLocateNode={(nodeId) => {
                focusNodeById(nodeId);
              }}
              onLocateUrl={(url) => {
                if (!url || !contentRef.current || !canvasRef.current) return;
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
                if (!match?.id) return;
                focusNodeById(match.id);
              }}
              reportTitle={reportTitle}
              reportTimestamp={reportTimestamp}
            />
          </DndContext>
        )}
        {showThumbnails && thumbnailStats.total > 0 && (() => {
          const completed = thumbnailStats.completed + thumbnailStats.failed;
          const remaining = thumbnailStats.total - completed;
          if (remaining <= 0) return null;
          const etaMs = thumbnailStats.avgMs > 0
            ? Math.ceil((remaining * thumbnailStats.avgMs) / Math.max(1, MAX_THUMBNAIL_CONCURRENCY))
            : 0;
          return (
            <div className="thumbnail-progress-toast">
              <span>Thumbnails: {completed}/{thumbnailStats.total}</span>
              <span>{thumbnailStats.avgMs > 0 ? `ETA ~${formatDuration(etaMs)}` : 'Estimating...'}</span>
            </div>
          );
        })()}
      </div>

      {/* Comments Panel - Right Rail */}
      {showCommentsPanel && (
        <CommentsPanel
          root={root}
          orphans={orphans}
          onClose={() => setShowCommentsPanel(false)}
          onCommentClick={(nodeId) => {
            navigateToNode(nodeId);
            // Small delay to let pan complete before calculating popover position
            setTimeout(() => openCommentPopover(nodeId), 100);
          }}
          onNavigateToNode={navigateToNode}
        />
      )}

      <EditColorModal
        depth={editingColorDepth}
        color={editingColorDepth !== null ? colors[editingColorDepth] : '#000000'}
        onChange={(color) => updateLevelColor(editingColorDepth, color)}
        onClose={() => {
          setEditingColorDepth(null);
          setColorPickerPosition(null);
        }}
        position={colorPickerPosition}
      />

      <ExportModal
        show={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExportPng={() => { setShowExportModal(false); exportPng(); }}
        onExportPdf={() => { setShowExportModal(false); exportPdf(); }}
        onExportCsv={() => { exportCsv(); setShowExportModal(false); }}
        onExportJson={() => { exportJson(); setShowExportModal(false); }}
        onExportSiteIndex={() => { exportSiteIndex(); setShowExportModal(false); }}
      />

      <ShareModal
        show={showShareModal}
        onClose={() => { setShowShareModal(false); setShareEmails(''); setLinkCopied(false); setSharePermission(ACCESS_LEVELS.VIEW); }}
        accessLevels={ACCESS_LEVELS}
        sharePermission={sharePermission}
        onChangePermission={(permission) => setSharePermission(permission)}
        linkCopied={linkCopied}
        onCopyLink={() => copyShareLink(sharePermission)}
        shareEmails={shareEmails}
        onShareEmailsChange={setShareEmails}
        onSendEmail={sendShareEmail}
      />

      <SaveMapModal
        show={showSaveMapModal}
        onClose={() => {
          setShowSaveMapModal(false);
          setCreateMapMode(false);
          setPendingCreateAfterSave(false);
        }}
        isLoggedIn={isLoggedIn}
        onRequireLogin={() => {
          setShowSaveMapModal(false);
          setCreateMapMode(false);
          setPendingCreateAfterSave(false);
          setShowAuthModal(true);
        }}
        projects={projects}
        currentMap={currentMap}
        rootUrl={root?.url}
        defaultProjectId={null}
        defaultName={mapName}
        onSave={createMapMode ? startBlankMapCreation : saveMap}
        onCreateProject={createProject}
        title={createMapMode ? 'Create Map' : 'Save Map'}
        submitLabel={createMapMode ? 'Create' : 'Save Map'}
      />

      <ProjectsModal
        show={showProjectsModal}
        onClose={() => { setShowProjectsModal(false); setEditingProjectId(null); }}
        isLoggedIn={isLoggedIn}
        projects={projects}
        expandedProjects={expandedProjects}
        editingProjectId={editingProjectId}
        editingProjectName={editingProjectName}
        onToggleProjectExpanded={toggleProjectExpanded}
        onEditProjectNameChange={setEditingProjectName}
        onEditProjectNameStart={(projectId, projectName) => {
          setEditingProjectId(projectId);
          setEditingProjectName(projectName);
        }}
        onEditProjectNameCancel={() => setEditingProjectId(null)}
        onRenameProject={renameProject}
        onDeleteProject={deleteProject}
        onLoadMap={loadMap}
        onDeleteMap={deleteMap}
        onAddProject={async () => {
          const name = await showPrompt({
            title: 'New Project',
            message: 'Enter a name for the new project:',
            placeholder: 'Project name'
          });
          if (name) createProject(name);
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
        scanMessage={scanMessage}
        scanProgress={scanProgress}
        scanElapsed={scanElapsed}
        urlInput={urlInput}
        onRequestCancel={() => setShowCancelConfirm(true)}
        onCancelScan={cancelScan}
        onContinueScan={() => setShowCancelConfirm(false)}
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

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
          showToast={showToast}
        />
      )}

      {showProfileModal && (
        <ProfileModal
          user={currentUser}
          onClose={() => setShowProfileModal(false)}
          onUpdate={(updatedUser) => setCurrentUser(updatedUser)}
          onLogout={handleLogout}
          showToast={showToast}
        />
      )}

      {editModalNode && (
        <EditNodeModal
          node={editModalNode}
          allNodes={root ? collectAllNodes(root) : []}
          rootTree={root}
          onClose={() => setEditModalNode(null)}
          onSave={saveNodeChanges}
          mode={editModalMode}
          customPageTypes={customPageTypes}
          onAddCustomType={(type) => setCustomPageTypes(prev => [...prev, type])}
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
        <div className={`toast toast-${toast.type}`}>
          <ToastIcon type={toast.type} />
          <span>{toast.message}</span>
          <button className="toast-close" onClick={dismissToast}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Generic Confirmation Modal */}
      {confirmModal && (
        <div className="modal-overlay" onClick={confirmModal.onCancel}>
          <div className="modal-card modal-sm confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{confirmModal.title}</h3>
              <button className="modal-close" onClick={confirmModal.onCancel}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <p>{confirmModal.message}</p>
            </div>
            <div className="modal-footer">
              <button
                className="modal-btn secondary"
                onClick={confirmModal.onCancel}
              >
                {confirmModal.cancelText}
              </button>
              <button
                className={confirmModal.danger ? 'modal-btn danger' : 'modal-btn primary'}
                onClick={confirmModal.onConfirm}
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
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
  );
}

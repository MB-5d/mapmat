import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
} from '@dnd-kit/core';
import {
  Download,
  Share2,
  Bookmark,
  GripVertical,
  Trash2,
  Edit2,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  LogIn,
  LogOut,
  Folder,
  Palette,
  ChevronDown,
  ChevronUp,
  Loader2,
  Globe,
  AlertTriangle,
  FileJson,
  FileImage,
  FileText,
  FileSpreadsheet,
  Mail,
  Copy,
  Check,
  FolderPlus,
  Map as MapIcon,
  Zap,
  Info,
  CheckCircle,
  XCircle,
  ExternalLink,
  List,
  History,
  Scan,
  CheckSquare,
  Square,
  User,
  Eye,
  EyeOff,
  Upload,
  FileUp,
  Undo2,
  Redo2,
  MousePointer2,
  Link,
  FilePlus,
} from 'lucide-react';

import './App.css';
import * as api from './api';
import LandingPage from './LandingPage';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4000';
const DEFAULT_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

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


const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const getHostname = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const getMaxDepth = (node, depth = 0) => {
  if (!node) return 0;
  if (!node.children?.length) return depth;
  return Math.max(...node.children.map(c => getMaxDepth(c, depth + 1)));
};

const countNodes = (node) => {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum, c) => sum + countNodes(c), 0);
};

const NodeCard = ({
  node,
  number,
  color,
  showThumbnails,
  onDelete,
  onEdit,
  onDuplicate,
  onViewImage,
  isRoot,
  isDragging,
  isPressing,
  dragHandleProps,
}) => {
  const [thumbError, setThumbError] = useState(false);
  const [thumbLoading, setThumbLoading] = useState(true);
  const [thumbKey, setThumbKey] = useState(0);

  // Use custom thumbnail if available, otherwise use mshots service
  const thumb = node.thumbnailUrl || `https://s0.wp.com/mshots/v1/${encodeURIComponent(node.url)}?w=576&h=400&_=${thumbKey}`;

  // Reset thumbnail state when showThumbnails is toggled on
  React.useEffect(() => {
    if (showThumbnails) {
      setThumbError(false);
      setThumbLoading(true);
      setThumbKey(k => k + 1); // Force new image request
    }
  }, [showThumbnails]);

  // Timeout fallback - if thumbnail doesn't load in 15 seconds, show placeholder
  React.useEffect(() => {
    if (!showThumbnails) return;
    const timeout = setTimeout(() => {
      if (thumbLoading) {
        setThumbError(true);
        setThumbLoading(false);
      }
    }, 15000);
    return () => clearTimeout(timeout);
  }, [showThumbnails, thumbLoading, thumbKey]);

  const handleViewFull = () => {
    onViewImage(node.url);
  };

  const classNames = ['node-card'];
  if (isDragging) classNames.push('dragging');
  if (isPressing) classNames.push('pressing');
  if (showThumbnails) classNames.push('with-thumb');

  return (
    <div className={classNames.join(' ')} data-node-card="1" data-node-id={node.id}>
      <div
        className="card-header"
        style={{ backgroundColor: color, cursor: isRoot ? 'default' : 'grab' }}
        title={isRoot ? undefined : 'Drag to reorder'}
        {...(isRoot ? {} : dragHandleProps)}
      >
        {!isRoot && <GripVertical size={14} className="drag-handle" />}
      </div>

      {showThumbnails && (
        <div className="card-thumb">
          {thumbLoading && !thumbError && (
            <div className="thumb-loading">
              <Loader2 size={24} className="thumb-spinner" />
            </div>
          )}
          {!thumbError ? (
            <>
              <img
                className="thumb-img"
                src={thumb}
                alt={node.title}
                loading="lazy"
                onLoad={() => setThumbLoading(false)}
                onError={() => { setThumbError(true); setThumbLoading(false); }}
                style={{ opacity: thumbLoading ? 0 : 1 }}
              />
              {!thumbLoading && (
                <button
                  className="thumb-fullsize-btn"
                  onClick={handleViewFull}
                  title="View full size"
                >
                  <Maximize2 size={14} />
                </button>
              )}
            </>
          ) : (
            <div className="thumb-placeholder">
              <Globe size={32} strokeWidth={1.5} />
              <span className="thumb-placeholder-domain">{getHostname(node.url)}</span>
              <span className="thumb-placeholder-text">Preview unavailable</span>
            </div>
          )}
        </div>
      )}

      <div className="card-content">
        <div className="card-toprow">
          <span className="page-number">{number}</span>
        </div>

        <div className="card-title" title={node.title}>
          {node.title}
        </div>
      </div>

      <div className="card-actions">
        <div className="card-actions-left">
          <button className="btn-icon-flat" title="Edit" onClick={() => onEdit(node)}>
            <Edit2 size={16} />
          </button>
          {!isRoot && (
            <button className="btn-icon-flat danger" title="Delete" onClick={() => onDelete(node.id)}>
              <Trash2 size={16} />
            </button>
          )}
          <button className="btn-icon-flat" title="Duplicate" onClick={() => onDuplicate(node)}>
            <Copy size={16} />
          </button>
        </div>
        {node.url && (
          <a
            href={node.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-icon-flat external-link-btn"
            title="Open in new tab"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={16} />
          </a>
        )}
      </div>
    </div>
  );
};

// Wrapper component that makes NodeCard draggable using dnd-kit
const DraggableNodeCard = ({
  node,
  number,
  color,
  showThumbnails,
  onDelete,
  onEdit,
  onDuplicate,
  onViewImage,
  isRoot,
  activeId,
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: node.id,
    data: { node, number, color },
    disabled: isRoot,
  });

  return (
    <div ref={setNodeRef}>
      <NodeCard
        node={node}
        number={number}
        color={color}
        showThumbnails={showThumbnails}
        onDelete={onDelete}
        onEdit={onEdit}
        onDuplicate={onDuplicate}
        onViewImage={onViewImage}
        isRoot={isRoot}
        isDragging={isDragging || activeId === node.id}
        dragHandleProps={{ ...listeners, ...attributes }}
      />
    </div>
  );
};

// ============================================================================
// LAYOUT CONSTANTS (Single Source of Truth)
// ============================================================================
const LAYOUT = {
  NODE_W: 288,
  NODE_H_COLLAPSED: 200, // Must match CSS .node-card min-height
  NODE_H_THUMB: 262,     // header 8 + thumb 152 + content ~60 + actions ~42
  GAP_L1_X: 48,         // Horizontal gap between Level 1 siblings (and orphans)
  GAP_STACK_Y: 60,      // FIXED vertical gap between bottom of parent and top of child (same for all modes)
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

// Check if children should be stacked (many similar siblings with same URL pattern)
const shouldStackChildren = (children, depth) => {
  if (!children || children.length < STACK_THRESHOLD) return false;
  // Don't stack root level or first level children (main nav items)
  if (depth < 2) return false;
  // Check if children have similar URL patterns
  try {
    const paths = children.map(c => new URL(c.url).pathname);
    const firstPath = paths[0].split('/').slice(0, -1).join('/');
    const matchingPaths = paths.filter(p => p.startsWith(firstPath + '/'));
    return matchingPaths.length >= children.length * 0.8;
  } catch {
    return false;
  }
};



// ============================================================================
// RUNTIME INVARIANT CHECKS (Development Only)
// ============================================================================
const checkLayoutInvariants = (nodes, orphans, connectors) => {
  if (process.env.NODE_ENV !== 'development') return;

  const { NODE_W, GAP_L1_X } = LAYOUT;
  const orphanNodes = Array.from(nodes.values()).filter(n => n.isOrphan);
  const level1Nodes = Array.from(nodes.values()).filter(n => n.depth === 1);

  // A) Orphan spacing invariant
  for (let j = 1; j < orphanNodes.length; j++) {
    const gap = orphanNodes[j].x - orphanNodes[j - 1].x;
    const expected = NODE_W + GAP_L1_X;
    if (Math.abs(gap - expected) > 1) {
      console.warn(`Invariant A violated: orphan spacing. Got ${gap}, expected ${expected}`);
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
    const shouldStack = shouldStackChildren(node.children, depth);
    const isExpanded = !!expandedStacks[node.id];

    if (!node.children?.length || (shouldStack && !isExpanded)) {
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

  // Layout children vertically under a parent node
  // Returns total height consumed by this subtree.
  const layoutVertical = (parentNode, parentDepth, numberPrefix) => {
    const parentLayout = nodes.get(parentNode.id);
    if (!parentLayout) return NODE_H;

    const shouldStack = shouldStackChildren(parentNode.children, parentDepth);
    const isExpanded = !!expandedStacks[parentNode.id];

    // If stacked and not expanded: no child layout; subtree is just the parent card
    if (!parentNode.children?.length || (shouldStack && !isExpanded)) {
      return NODE_H;
    }

    const parentX = parentLayout.x;
    const parentY = parentLayout.y;

    const childX = parentX + INDENT_X;
    let cursorY = parentY + NODE_H + GAP_STACK_Y;

    const childIdsInOrder = [];

    parentNode.children.forEach((child, idx) => {
      const childNumber = `${numberPrefix}.${idx + 1}`;
      setNode(child, childX, cursorY, parentDepth + 1, childNumber);

      childIdsInOrder.push(child.id);

      const childSubtreeH = layoutVertical(child, parentDepth + 1, childNumber);
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

  // ------------------------------------------------------------
  // 1) Root (Home)
  // ------------------------------------------------------------
  const rootX = 0;
  const rootY = ROOT_Y;

  // Root = "0" (Home)
  setNode(root, rootX, rootY, 0, "0", { isOrphan: false });

  // ------------------------------------------------------------
  // 2) Level 1 row (children of root) — horizontal only
  // ------------------------------------------------------------
  const rootBottomY = rootY + NODE_H;
  const level1Y = rootBottomY + BUS_Y_GAP;

  const level1Positions = [];
  let level1X = 0;
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
  // 3) Orphans
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
  let orphanStartX;
  let orphanY;

  if (orphanMode === "after-root") {
    // Root right edge is rootX + NODE_W
    // "one full node+spacing gap" => leave one empty slot the width of (NODE_W + GAP_L1_X)
    orphanStartX = rootX + NODE_W + (NODE_W + GAP_L1_X);
    orphanY = rootY;
  } else {
    orphanStartX = mainTreeRightEdge + ORPHAN_GROUP_GAP;
    orphanY = level1Y;
  }

  let orphanX = orphanStartX;

  orphans.forEach((orphan, idx) => {
    const depth = orphanStyle === "level1" ? 1 : 0;
    const num = orphanStyle === "level1" ? `1.o${idx + 1}` : `0.${idx + 1}`;

    setNode(orphan, orphanX, orphanY, depth, num, {
      isOrphan: true,
      orphanStyle,
    });

    // Optional: render orphan children (off by default)
    // When you’re ready for “subdomain root” orphans, we should implement
    // a mini root->L1 bus for each orphan root. This flag is just a placeholder.
    if (renderOrphanChildren && orphan.children?.length) {
      // Simple vertical for now (not a mini horizontal L1 bus yet):
      // children behave like depth+1 under the orphan
      layoutVertical(orphan, depth, num);
    }

    orphanX += NODE_W + GAP_L1_X;
  });

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
  colors,
  scale = 1,
  onDelete,
  onEdit,
  onDuplicate,
  onViewImage,
  onNodeDoubleClick,
  activeId,
}) => {
  const [expandedStacks, setExpandedStacks] = useState({});

  const toggleStack = (nodeId) => {
    setExpandedStacks(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  // Compute layout using explicit coordinate formulas
 const layout = useMemo(() => {
  return computeLayout(data, orphans, showThumbnails, expandedStacks, {
    mode: 'after-root', // or 'after-tree'
  });
}, [data, orphans, showThumbnails, expandedStacks]);


  // Run invariant checks in development
  React.useEffect(() => {
    checkLayoutInvariants(layout.nodes, orphans, layout.connectors);
  }, [layout, orphans]);

  if (!data) return null;

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
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
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
              width: LAYOUT.NODE_W,
            }}
            onDoubleClick={() => onNodeDoubleClick?.(nodeData.node.id)}
          >
            <DraggableNodeCard
              node={nodeData.node}
              number={nodeData.number}
              color={color}
              showThumbnails={showThumbnails}
              isRoot={isRoot}
              onDelete={onDelete}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onViewImage={onViewImage}
              activeId={activeId}
            />
          </div>
        );
      })}

      {/* Stacking UI for collapsed stacks (render on top) */}
      {Array.from(layout.nodes.values())
        .filter(nodeData => {
          const shouldStack = shouldStackChildren(nodeData.node.children, nodeData.depth);
          return shouldStack && !expandedStacks[nodeData.node.id] && nodeData.node.children?.length > 0;
        })
        .map(nodeData => {
          const NODE_H = getNodeH(showThumbnails);
          const stackY = nodeData.y + NODE_H + LAYOUT.GAP_STACK_Y;
          const stackX = nodeData.x + LAYOUT.INDENT_X;

          return (
            <div
              key={`stack-${nodeData.node.id}`}
              className="stacked-cards-positioned"
              style={{
                position: 'absolute',
                left: stackX,
                top: stackY,
                width: LAYOUT.NODE_W,
              }}
              onClick={() => toggleStack(nodeData.node.id)}
              title={`Click to expand ${nodeData.node.children.length} pages`}
            >
              <div className="stacked-cards">
                <div className="stacked-card stacked-card-3" />
                <div className="stacked-card stacked-card-2" />
                <div className="stacked-card stacked-card-1">
                  <div className="stacked-preview">
                    <span className="stacked-preview-title">
                      {nodeData.node.children[0]?.title || 'Untitled'}
                    </span>
                  </div>
                </div>
                <div className="stacked-count">+{nodeData.node.children.length - 1} more</div>
              </div>
            </div>
          );
        })}

      {/* Collapse buttons for expanded stacks */}
      {Array.from(layout.nodes.values())
        .filter(nodeData => {
          const shouldStack = shouldStackChildren(nodeData.node.children, nodeData.depth);
          return shouldStack && expandedStacks[nodeData.node.id];
        })
        .map(nodeData => {
          // Find the last child to position button after it
          const lastChildId = nodeData.node.children[nodeData.node.children.length - 1]?.id;
          const lastChildLayout = layout.nodes.get(lastChildId);
          if (!lastChildLayout) return null;

          const NODE_H = getNodeH(showThumbnails);
          const buttonY = lastChildLayout.y + NODE_H + 8;
          const buttonX = lastChildLayout.x;

          return (
            <button
              key={`collapse-${nodeData.node.id}`}
              className="collapse-stack-btn"
              style={{
                position: 'absolute',
                left: buttonX,
                top: buttonY,
              }}
              onClick={() => toggleStack(nodeData.node.id)}
            >
              Collapse ({nodeData.node.children.length} pages)
            </button>
          );
        })}
    </div>
  );
};

// Profile Modal for account management
const ProfileModal = ({ user, onClose, onUpdate, onLogout, showToast }) => {
  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const updateData = {};
      if (name !== user.name) {
        updateData.name = name;
      }
      if (newPassword) {
        if (newPassword !== confirmPassword) {
          setError('New passwords do not match');
          setLoading(false);
          return;
        }
        if (!currentPassword) {
          setError('Current password is required to change password');
          setLoading(false);
          return;
        }
        updateData.currentPassword = currentPassword;
        updateData.newPassword = newPassword;
      }

      if (Object.keys(updateData).length === 0) {
        setLoading(false);
        return;
      }

      const { user: updatedUser } = await api.updateProfile(updateData);
      onUpdate(updatedUser);
      setSuccess('Profile updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setError('Password is required to delete account');
      return;
    }
    setLoading(true);
    setError('');

    try {
      await api.deleteAccount(deletePassword);
      showToast('Account deleted', 'success');
      onLogout();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to delete account');
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card profile-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>

        <div className="profile-header">
          <div className="profile-avatar">
            <User size={32} />
          </div>
          <div className="profile-info">
            <h3>{user?.name}</h3>
            <span className="profile-email">{user?.email}</span>
          </div>
        </div>

        {!showDeleteConfirm ? (
          <form onSubmit={handleUpdateProfile} className="profile-form">
            {error && <div className="auth-error">{error}</div>}
            {success && <div className="auth-success">{success}</div>}

            <div className="form-section">
              <h4>Profile</h4>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
            </div>

            <div className="form-section">
              <h4>Change Password</h4>
              <div className="form-group">
                <label>Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  minLength={6}
                />
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
              </div>
            </div>

            <button
              type="submit"
              className="modal-btn primary"
              disabled={loading}
            >
              {loading ? <Loader2 size={18} className="btn-spinner" /> : null}
              Save Changes
            </button>

            <div className="form-section danger-zone">
              <h4>Danger Zone</h4>
              <p>Deleting your account will permanently remove all your projects, maps, and data.</p>
              <button
                type="button"
                className="modal-btn danger"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete Account
              </button>
            </div>
          </form>
        ) : (
          <div className="delete-confirm">
            <div className="delete-warning">
              <AlertTriangle size={48} />
              <h4>Delete Account?</h4>
              <p>This action cannot be undone. All your projects, maps, and scan history will be permanently deleted.</p>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <div className="form-group">
              <label>Enter your password to confirm</label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Your password"
                autoFocus
              />
            </div>

            <div className="delete-actions">
              <button
                className="modal-btn danger"
                onClick={handleDeleteAccount}
                disabled={loading || !deletePassword}
              >
                {loading ? <Loader2 size={18} className="btn-spinner" /> : null}
                Yes, Delete My Account
              </button>
              <button
                className="modal-btn secondary"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletePassword('');
                  setError('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Page types for dropdown
const PAGE_TYPES = [
  'Page',
  'Blog Post',
  'Product',
  'Category',
  'Landing Page',
  'Contact',
  'About',
  'FAQ',
  'Service',
  'Portfolio',
];

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

// Helper to get all descendant IDs of a node
const getDescendantIds = (node, ids = new Set()) => {
  if (!node) return ids;
  if (node.children) {
    node.children.forEach(child => {
      ids.add(child.id);
      getDescendantIds(child, ids);
    });
  }
  return ids;
};

// Edit Node Modal
const EditNodeModal = ({ node, allNodes, rootTree, onClose, onSave, mode = 'edit', customPageTypes = [], onAddCustomType }) => {
  const [title, setTitle] = useState(node?.title || '');
  const [url, setUrl] = useState(node?.url || '');
  const [pageType, setPageType] = useState(node?.pageType || 'Page');
  const [newTypeName, setNewTypeName] = useState('');
  const [showNewTypeInput, setShowNewTypeInput] = useState(false);

  // Combined list of all page types
  const allPageTypes = [...PAGE_TYPES, ...customPageTypes];
  const [parentId, setParentId] = useState(node?.parentId || '');
  const [thumbnailUrl, setThumbnailUrl] = useState(node?.thumbnailUrl || '');
  const [description, setDescription] = useState(node?.description || '');
  const [metaTags, setMetaTags] = useState(node?.metaTags || '');
  const fileInputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...node,
      title,
      url,
      pageType,
      parentId: parentId || null,
      thumbnailUrl,
      description,
      metaTags,
    });
    onClose();
  };

  const handleAddNewType = () => {
    const trimmed = newTypeName.trim();
    if (trimmed && !allPageTypes.includes(trimmed)) {
      onAddCustomType(trimmed);
      setPageType(trimmed);
    }
    setNewTypeName('');
    setShowNewTypeInput(false);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setThumbnailUrl(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const modalTitle = mode === 'edit' ? 'Edit Page' : mode === 'duplicate' ? 'Duplicate Page' : 'Add Page';

  // Form validation - check if required fields are filled
  // For edit/duplicate: parentId can be empty (orphan pages are valid)
  // For add: parentId is optional (user can create orphans)
  const isFormValid = title.trim() !== '' && pageType !== '' && pageType !== '__addnew__';

  // Filter out current node and its descendants from parent options
  // (can't be parent of itself or create circular reference)
  const getExcludeIds = () => {
    if (!node?.id || !rootTree) return new Set();
    // Find the full node in tree to get its descendants
    const findNode = (tree, id) => {
      if (!tree) return null;
      if (tree.id === id) return tree;
      for (const child of tree.children || []) {
        const found = findNode(child, id);
        if (found) return found;
      }
      return null;
    };
    const fullNode = findNode(rootTree, node.id);
    const descendants = fullNode ? getDescendantIds(fullNode) : new Set();
    descendants.add(node.id); // Also exclude self
    return descendants;
  };

  const excludeIds = getExcludeIds();
  const parentOptions = allNodes.filter(n => !excludeIds.has(n.id));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card edit-node-modal" onClick={(e) => e.stopPropagation()}>
        <div className="edit-node-header">
          <h2 className="modal-title">{modalTitle}</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="edit-node-form">
          <div className="edit-node-form-content">
            <div className="form-group">
              <label>Page Title<span className="required-asterisk">*</span></label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter page title"
                required
              />
            </div>

            <div className="form-group">
              <label>URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/page"
              />
            </div>

            <div className="form-group">
              <label>Page Type<span className="required-asterisk">*</span></label>
              <select
                value={pageType}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__addnew__') {
                    setShowNewTypeInput(true);
                  } else {
                    setPageType(val);
                    setShowNewTypeInput(false);
                  }
                }}
                required
              >
                {allPageTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
                <option value="__addnew__">➕ Add New Type...</option>
              </select>
              {showNewTypeInput && (
                <input
                  type="text"
                  className="new-type-input"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  onBlur={handleAddNewType}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNewType();
                    }
                  }}
                  placeholder="Enter new type name"
                  autoFocus
                />
              )}
            </div>

            <div className="form-group">
              <label>Parent Page</label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">No Parent (Orphan)</option>
                {parentOptions.map(n => {
                  const indent = '\u00A0\u00A0\u00A0\u00A0'.repeat(n.depth);
                  const displayTitle = n.title || n.url || 'Untitled';
                  return (
                    <option key={n.id} value={n.id}>
                      {indent}{n.pageNumber} - {displayTitle}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="form-group">
              <label>Thumbnail / Image</label>
              {thumbnailUrl ? (
                <div className="thumbnail-preview">
                  <img src={thumbnailUrl} alt="Thumbnail preview" />
                  <button
                    type="button"
                    className="btn-remove-thumb"
                    onClick={() => setThumbnailUrl('')}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div
                  className="image-upload-zone"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add('drag-over');
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('drag-over');
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('drag-over');
                    const file = e.dataTransfer.files[0];
                    if (file && file.type.startsWith('image/')) {
                      const reader = new FileReader();
                      reader.onload = (event) => setThumbnailUrl(event.target.result);
                      reader.readAsDataURL(file);
                    }
                  }}
                >
                  <Upload size={24} className="upload-icon" />
                  <span className="upload-text">Drag image here or</span>
                  <button
                    type="button"
                    className="btn-browse"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Browse files
                  </button>
                  <span className="upload-text-small">or enter URL</span>
                  <input
                    type="text"
                    className="url-input-small"
                    placeholder="https://example.com/image.jpg"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const url = e.target.value.trim();
                        if (url) setThumbnailUrl(url);
                      }
                    }}
                    onBlur={(e) => {
                      const url = e.target.value.trim();
                      if (url) setThumbnailUrl(url);
                    }}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.gif,.webp"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Page description (meta description)"
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>Meta Tags</label>
              <textarea
                value={metaTags}
                onChange={(e) => setMetaTags(e.target.value)}
                placeholder="Comma-separated tags: seo, marketing, landing"
                rows={2}
              />
            </div>
          </div>

          <div className="edit-node-footer">
            <button type="button" className="modal-btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={`modal-btn primary ${!isFormValid ? 'disabled' : ''}`}
              disabled={!isFormValid}
            >
              {mode === 'edit' ? 'Save Changes' : mode === 'duplicate' ? 'Create Copy' : 'Add Page'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Auth Modal for Login/Signup
const AuthModal = ({ onClose, onSuccess, showToast }) => {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let result;
      if (mode === 'login') {
        result = await api.login(email, password);
      } else {
        result = await api.signup(email, password, name);
      }
      onSuccess(result.user);
      onClose();
      showToast(`Welcome, ${result.user.name}!`, 'success');
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Log In
          </button>
          <button
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => { setMode('signup'); setError(''); }}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          {mode === 'signup' && (
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
          )}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <div className="password-input">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Min 6 characters' : 'Your password'}
                required
                minLength={mode === 'signup' ? 6 : undefined}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="modal-btn primary auth-submit"
            disabled={loading}
          >
            {loading ? <Loader2 size={18} className="btn-spinner" /> : null}
            {mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          {mode === 'login' ? (
            <span>Don't have an account? <button onClick={() => setMode('signup')}>Sign up</button></span>
          ) : (
            <span>Already have an account? <button onClick={() => setMode('login')}>Log in</button></span>
          )}
        </div>
      </div>
    </div>
  );
};

const SaveMapForm = ({ projects, currentMap, rootUrl, onSave, onCreateProject, onCancel }) => {
  // Get default name from root domain (e.g., "example" from "https://www.example.com")
  const getDefaultName = () => {
    if (currentMap?.name) return currentMap.name;
    if (!rootUrl) return '';
    try {
      const hostname = new URL(rootUrl).hostname;
      // Remove www. prefix and get domain without TLD
      const parts = hostname.replace(/^www\./, '').split('.');
      // Return the main domain part (before TLD)
      return parts.length > 1 ? parts[parts.length - 2] : parts[0];
    } catch {
      return '';
    }
  };

  const [mapName, setMapName] = useState(getDefaultName());
  const [selectedProject, setSelectedProject] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const handleSave = () => {
    if (!mapName.trim()) return;
    onSave(selectedProject || null, mapName);
  };

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;
    onCreateProject(newProjectName);
    setShowNewProject(false);
    setNewProjectName('');
  };

  return (
    <div className="save-map-form">
      <div className="form-group">
        <label>Map Name</label>
        <input
          type="text"
          value={mapName}
          onChange={(e) => setMapName(e.target.value)}
          placeholder="Enter map name..."
          autoFocus
        />
      </div>
      <div className="form-group">
        <label>Save to Project (optional)</label>
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
        >
          <option value="">No project (Uncategorized)</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      {!showNewProject ? (
        <button className="new-project-link" onClick={() => setShowNewProject(true)}>
          <FolderPlus size={14} />
          Create new project
        </button>
      ) : (
        <div className="new-project-inline">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Project name..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateProject();
              if (e.key === 'Escape') setShowNewProject(false);
            }}
          />
          <button onClick={handleCreateProject}>Create</button>
          <button className="cancel" onClick={() => setShowNewProject(false)}>Cancel</button>
        </div>
      )}
      <div className="form-actions">
        <button className="modal-btn" onClick={handleSave} disabled={!mapName.trim()}>
          Save Map
        </button>
        <button className="modal-btn cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
};

export default function App() {
  const [urlInput, setUrlInput] = useState('');
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [root, setRoot] = useState(null);
  const [orphans, setOrphans] = useState([]); // Pages with no parent (numbered 0.x)
  const [customPageTypes, setCustomPageTypes] = useState([]); // User-added page types
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [fullImageUrl, setFullImageUrl] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [showColorKey, setShowColorKey] = useState(false);
  const [editingColorDepth, setEditingColorDepth] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [projects, setProjects] = useState([]); // Project folders
  const [currentMap, setCurrentMap] = useState(null); // Currently loaded map
  const [showShareModal, setShowShareModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [showSaveMapModal, setShowSaveMapModal] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState({});
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [shareEmails, setShareEmails] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [scanElapsed, setScanElapsed] = useState(0);
  const [scanProgress, setScanProgress] = useState({ scanned: 0, queued: 0 });
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [scanHistory, setScanHistory] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedHistoryItems, setSelectedHistoryItems] = useState(new Set());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [, setAuthLoading] = useState(true);
  const [showLanding, setShowLanding] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [editModalNode, setEditModalNode] = useState(null);
  const [editModalMode, setEditModalMode] = useState('edit'); // 'edit', 'duplicate', 'add'
  const [deleteConfirmNode, setDeleteConfirmNode] = useState(null); // Node pending deletion
  const [isPanning, setIsPanning] = useState(false); // Track canvas panning state
  const [activeTool, setActiveTool] = useState('select'); // 'select', 'addNode', 'link'
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [showViewDropdown, setShowViewDropdown] = useState(false);
  const [layers, setLayers] = useState({
    main: true,        // Main sitemap nodes (always visible)
    xmlComparison: true, // XML comparison highlights
    userFlows: false,   // User journey connections (coming soon)
    crossLinks: false,  // Non-hierarchical links (coming soon)
  });

  // Drag & Drop state (dnd-kit)
  const [activeId, setActiveId] = useState(null);
  const [activeNode, setActiveNode] = useState(null);
  const [activeDragData, setActiveDragData] = useState(null); // {number, color}
  const [activeDropZone, setActiveDropZone] = useState(null);
  const [dropZones, setDropZones] = useState([]);

  const canvasRef = useRef(null);
  const scanAbortRef = useRef(null);
  const eventSourceRef = useRef(null);
  const scanTimerRef = useRef(null);
  const messageTimerRef = useRef(null);
  const contentRef = useRef(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });
  const viewDropdownRef = useRef(null);

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

  const hasMap = !!root;
  const maxDepth = useMemo(() => getMaxDepth(root), [root]);
  const totalNodes = useMemo(() => countNodes(root), [root]);

  // dnd-kit sensors - require 5px movement before activating drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Calculate map bounds and clamp pan to limit scrolling
  const clampPan = (newPan) => {
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
      const x = rect.left - canvasRect.left - pan.x;
      const y = rect.top - canvasRect.top - pan.y;
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

    console.log('CLAMP DEBUG:', {
      padding,
      viewport: { w: viewportWidth, h: viewportHeight },
      content: { left: contentLeft, right: contentRight, top: contentTop, bottom: contentBottom },
      limits: { minPanX, maxPanX, minPanY, maxPanY },
      newPan,
    });

    // 4. Clamp
    const clampedX = Math.max(minPanX, Math.min(maxPanX, newPan.x));
    const clampedY = Math.max(minPanY, Math.min(maxPanY, newPan.y));

    return { x: clampedX, y: clampedY };
  };

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
      // Try to load from API first
      api.getShare(shareId)
        .then(({ share }) => {
          if (share?.root) {
            setRoot(share.root);
            setOrphans(share.orphans || []);
            if (share.colors) setColors(share.colors);
            setUrlInput(share.root.url || '');
            showToast('Shared map loaded!', 'success');
            window.history.replaceState({}, '', window.location.pathname);
            setTimeout(resetView, 100);
          }
        })
        .catch((e) => {
          // Fallback to localStorage for legacy shares
          const sharedData = localStorage.getItem(shareId);
          if (sharedData) {
            try {
              const { root: sharedRoot, colors: sharedColors, orphans: sharedOrphans } = JSON.parse(sharedData);
              if (sharedRoot) {
                setRoot(sharedRoot);
                setOrphans(sharedOrphans || []);
                if (sharedColors) setColors(sharedColors);
                setUrlInput(sharedRoot.url || '');
                showToast('Shared map loaded!', 'success');
                window.history.replaceState({}, '', window.location.pathname);
                setTimeout(resetView, 100);
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

    // Prevent browser-level pinch zoom
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };

    canvas.addEventListener('gesturestart', handleGestureStart);
    canvas.addEventListener('gesturechange', handleGestureChange);
    canvas.addEventListener('gestureend', handleGestureEnd);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('gesturestart', handleGestureStart);
      canvas.removeEventListener('gesturechange', handleGestureChange);
      canvas.removeEventListener('gestureend', handleGestureEnd);
      canvas.removeEventListener('wheel', handleWheel);
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

  // Fetch full page screenshot from backend
  const viewFullScreenshot = async (pageUrl) => {
    setImageLoading(true);
    setFullImageUrl(null);
    showToast('Loading full page screenshot...', 'loading', true);

    try {
      const res = await fetch(
        `${API_BASE}/screenshot?url=${encodeURIComponent(pageUrl)}&type=full`
      );
      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.url) {
        setFullImageUrl(data.url);
        setToast(null); // Clear the loading toast
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
    if (!window.confirm('Delete this project and all its maps?')) return;
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
    } catch (e) {
      showToast(e.message || 'Failed to save map', 'error');
    }
  };

  const loadMap = (map) => {
    setRoot(map.root);
    setOrphans(map.orphans || []);
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
    if (!window.confirm('Delete this map?')) return;
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
  const addToHistory = async (url, rootData, pageCount) => {
    if (!isLoggedIn) return; // Only save history for logged-in users

    try {
      const { id } = await api.addToHistory({
        url,
        hostname: getHostname(url),
        title: rootData?.title || getHostname(url),
        page_count: pageCount,
        root: rootData,
        colors,
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
        colors,
      };

      setScanHistory(prev => [historyItem, ...prev].slice(0, 50));
    } catch (e) {
      console.error('Failed to save to history:', e);
    }
  };

  const loadFromHistory = (historyItem) => {
    setRoot(historyItem.root);
    setColors(historyItem.colors || DEFAULT_COLORS);
    setCurrentMap(null);
    setUrlInput(historyItem.url);
    setShowHistoryModal(false);
    setSelectedHistoryItems(new Set());
    setScale(1);
    setPan({ x: 0, y: 0 });
    showToast(`Loaded "${historyItem.hostname}"`, 'success');
    setTimeout(resetView, 100);
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
    if (!window.confirm(`Delete ${selectedHistoryItems.size} scan${selectedHistoryItems.size > 1 ? 's' : ''} from history?`)) return;

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

  const scan = () => {
    const url = sanitizeUrl(urlInput);
    if (!url) {
      showToast('Please enter a valid URL', 'warning');
      return;
    }

    setLoading(true);
    setScanProgress({ scanned: 0, queued: 0 });
    startScanTimers();

    // Use SSE for progress updates
    const eventSource = new EventSource(
      `${API_BASE}/scan-stream?url=${encodeURIComponent(url)}`
    );
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        setScanProgress(data);
      } catch {}
    });

    eventSource.addEventListener('complete', (e) => {
      try {
        const data = JSON.parse(e.data);
        setRoot(data.root);
        setOrphans([]); // Clear orphans when starting new scan
        setCurrentMap(null);
        setScale(1);
        setPan({ x: 0, y: 0 });
        const pageCount = countNodes(data.root);
        addToHistory(url, data.root, pageCount);
        showToast(`Scan complete: ${new URL(url).hostname}`, 'success');
        setTimeout(resetView, 100);
      } catch {}
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
    const isUIControl = e.target.closest('.zoom-controls, .color-key, .color-key-toggle, .canvas-toolbar');
    if (isInsideCard || isUIControl) return;

    dragRef.current.dragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.startPanX = pan.x;
    dragRef.current.startPanY = pan.y;
    setIsPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
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

  const onWheel = (e) => {
    if (!hasMap) return;

    // Pinch zoom (Ctrl/Cmd + scroll)
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();

      const delta = -e.deltaY;
      const zoomIntensity = 0.002;
      const next = clamp(scale * (1 + delta * zoomIntensity), 0.1, 3);

      const rect = canvasRef.current.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      const ox = (cx - pan.x) / scale;
      const oy = (cy - pan.y) / scale;

      const nx = cx - ox * next;
      const ny = cy - oy * next;

      setScale(next);
      // Note: clampPan is called on next frame after scale updates
      requestAnimationFrame(() => setPan(p => clampPan(p)));
      setPan({ x: nx, y: ny });
      return;
    }

    // Two-finger scroll pans (trackpad)
    e.preventDefault();
    setPan((p) => clampPan({
      x: p.x - e.deltaX,
      y: p.y - e.deltaY,
    }));
  };

  const zoomIn = () => setScale((s) => clamp(s * 1.2, 0.1, 3));
  const zoomOut = () => setScale((s) => clamp(s / 1.2, 0.1, 3));

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

      const rootNode = contentRef.current.querySelector('[data-depth="0"]');
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
    setUndoStack(prev => [...prev, JSON.stringify(root)]);
    setRedoStack([]); // Clear redo on new action
  };

  const handleUndo = () => {
    console.log('UNDO CLICKED, stack:', undoStack.length);
    if (undoStack.length === 0) {
      console.log('Nothing to undo');
      return;
    }

    // Save current state to redo stack
    setRedoStack(prev => [...prev, JSON.stringify(root)]);

    // Get last state from undo stack
    const lastState = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));

    // Restore it
    setRoot(JSON.parse(lastState));
    console.log('UNDO COMPLETE');
  };

  const handleRedo = () => {
    console.log('REDO CLICKED, stack:', redoStack.length);
    if (redoStack.length === 0) {
      console.log('Nothing to redo');
      return;
    }

    // Save current state to undo stack
    setUndoStack(prev => [...prev, JSON.stringify(root)]);

    // Get last state from redo stack
    const lastState = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));

    // Restore it
    setRoot(JSON.parse(lastState));
    console.log('REDO COMPLETE');
  };

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e) => {
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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, redoStack, root]);

  const exportJson = () => {
    if (!root) return;
    downloadText('sitemap.json', JSON.stringify({ root, colors }, null, 2));
    showToast('Exported JSON');
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
    showToast('Exported CSV');
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
        showToast('No content to export', 'warning');
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

      const hostname = getHostname(root.url) || 'export';
      pdf.save(`sitemap-${hostname}.pdf`);
      showToast('PDF exported successfully', 'success');
    } catch (e) {
      console.error('PDF export error:', e);
      const errorMsg = e?.message || e?.toString() || 'Unknown error';
      showToast(`PDF export failed: ${errorMsg}`, 'error');
      // Restore grid and transform state on error
      if (contentRef.current) contentRef.current.classList.remove('export-mode');
      setScale(savedScale);
      setPan(savedPan);
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
    showToast('Site Index exported', 'success');
  };

  const copyShareLink = async () => {
    try {
      // Create share via API
      const { share } = await api.createShare({
        map_id: currentMap?.id || null,
        root,
        colors,
        expires_in_days: 30, // Share links expire in 30 days
      });

      // Create shareable URL
      const shareUrl = `${window.location.origin}?share=${share.id}`;

      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      showToast('Link copied to clipboard', 'success');
    } catch (e) {
      // If not logged in, fall back to localStorage
      if (e.message?.includes('Authentication')) {
        const shareId = `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const shareData = { root, colors, createdAt: Date.now() };
        localStorage.setItem(shareId, JSON.stringify(shareData));
        const shareUrl = `${window.location.origin}?share=${shareId}`;
        await navigator.clipboard.writeText(shareUrl);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
        showToast('Link copied (temporary - log in for persistent links)', 'success');
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
    window.open(`mailto:${shareEmails}?subject=${subject}&body=${body}`);
    showToast('Email client opened');
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
        showToast('No content to export', 'warning');
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
      link.download = `sitemap-${getHostname(root.url) || 'export'}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();

      showToast('PNG exported successfully', 'success');
    } catch (e) {
      console.error('PNG export error:', e);
      const errorMsg = e?.message || e?.toString() || 'Unknown error';
      showToast(`PNG export failed: ${errorMsg}`, 'error');
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
              setOrphans(prev => [...prev, { ...target }]);
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
      };

      saveStateForUndo();

      if (newParentId === '') {
        // Add to orphans
        setOrphans(prev => [...prev, newNode]);
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
      const newNode = {
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        url: updatedNode.url || '',
        title: updatedNode.title || 'New Page',
        pageType: updatedNode.pageType || 'page',
        thumbnailUrl: updatedNode.thumbnailUrl || '',
        description: updatedNode.description || '',
        metaTags: updatedNode.metaTags || {},
        children: [],
      };

      saveStateForUndo();

      if (newParentId === '') {
        // Add to orphans
        setOrphans(prev => [...prev, newNode]);
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
      const parentWrap = card.closest('.parent-wrap');
      const depth = parseInt(parentWrap?.getAttribute('data-depth') || '0', 10);

      // Add sibling drop zones (before this node)
      if (depth === 0) {
        // Horizontal layout - drop zones to left/right
        zones.push({
          type: 'sibling',
          parentId: parent.id,
          index: siblingIndex,
          x: rect.left - 20,
          y: rect.top + rect.height / 2,
        });
        // Also add zone after last sibling
        if (siblingIndex === parent.children.length - 1) {
          zones.push({
            type: 'sibling',
            parentId: parent.id,
            index: siblingIndex + 1,
            x: rect.right + 20,
            y: rect.top + rect.height / 2,
          });
        }
      } else {
        // Vertical layout - drop zones above/below
        zones.push({
          type: 'sibling',
          parentId: parent.id,
          index: siblingIndex,
          x: rect.left + rect.width / 2,
          y: rect.top - 20,
        });
        // Also add zone after last sibling
        if (siblingIndex === parent.children.length - 1) {
          zones.push({
            type: 'sibling',
            parentId: parent.id,
            index: siblingIndex + 1,
            x: rect.left + rect.width / 2,
            y: rect.bottom + 20,
          });
        }
      }

      // Add child drop zone if node has no children
      if (!node.children?.length) {
        zones.push({
          type: 'child',
          parentId: nodeId,
          index: 0,
          x: rect.left + rect.width / 2,
          y: rect.bottom + 60,
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
    setEditingColorDepth(null);
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

  const handleFileImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);

    try {
      const text = await file.text();
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
        e.target.value = '';
        return;
      }

      const tree = buildTreeFromUrls(urls);
      if (tree) {
        setRoot(tree);
        setOrphans([]); // Clear orphans when importing new URLs
        setCurrentMap(null);
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
    e.target.value = ''; // Reset input
  };

  // Show landing page or app
  if (showLanding) {
    return <LandingPage onLaunchApp={() => setShowLanding(false)} />;
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-left">
          <div className="brand">Map Mat</div>
        </div>

        <div className="topbar-center">
          <div className="search-container">
            <Scan size={18} className="search-icon" />
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={onKeyDownUrl}
              onFocus={(e) => { if (!urlInput) e.target.placeholder = ''; }}
              onBlur={(e) => { if (!urlInput) e.target.placeholder = 'https://example.com'; }}
              placeholder="https://example.com"
              spellCheck={false}
            />

            {hasMap && (
              <button
                className="clear-btn"
                onClick={() => {
                  if (window.confirm('Clear the canvas?')) {
                    setRoot(null);
                    setOrphans([]);
                    setCurrentMap(null);
                    setScale(1);
                    setPan({ x: 0, y: 0 });
                    setUrlInput('');
                  }
                }}
                title="Clear canvas"
              >
                <X size={14} />
                Clear
              </button>
            )}

            <div className={`thumb-toggle ${showThumbnails ? 'active' : ''}`} onClick={() => setShowThumbnails(v => !v)}>
              <span>Thumbnails</span>
              <div className="toggle-switch" />
            </div>

            <button className="scan-btn" onClick={scan} disabled={loading}>
              Scan
            </button>
          </div>
        </div>

        <div className="topbar-right">
          <button
            className="icon-btn"
            title="Import File"
            onClick={() => setShowImportModal(true)}
          >
            <Upload size={18} />
          </button>

          <button
            className="icon-btn"
            title="Save Map"
            onClick={() => setShowSaveMapModal(true)}
            disabled={!hasMap}
          >
            <Bookmark size={18} />
          </button>

          <button
            className="icon-btn"
            title="Projects"
            onClick={() => setShowProjectsModal(true)}
          >
            <Folder size={18} />
          </button>

          {isLoggedIn && (
            <button
              className="icon-btn"
              title="Scan History"
              onClick={() => setShowHistoryModal(true)}
            >
              <History size={18} />
            </button>
          )}

          <div className="divider" />

          <button
            className="icon-btn"
            title="Export"
            onClick={() => setShowExportModal(true)}
            disabled={!hasMap}
          >
            <Download size={18} />
          </button>

          <button
            className="icon-btn"
            title="Share"
            onClick={() => setShowShareModal(true)}
            disabled={!hasMap}
          >
            <Share2 size={18} />
          </button>

          <div className="divider" />

          {isLoggedIn ? (
            <>
              <button
                className="user-btn"
                onClick={() => setShowProfileModal(true)}
                title="Account Settings"
              >
                <User size={16} />
                <span>{currentUser?.name}</span>
              </button>
              <button className="icon-btn" title="Logout" onClick={handleLogout}>
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <button className="icon-btn primary" title="Login" onClick={handleLogin}>
              <LogIn size={18} />
            </button>
          )}
        </div>
      </div>

      <div
        className={`canvas ${isPanning ? 'panning' : ''}`}
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      >
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
              className="content"
              ref={contentRef}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale}) translate(-50%, 0px)`,
              }}
            >
              <SitemapTree
                data={root}
                orphans={orphans}
                showThumbnails={showThumbnails}
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
              />
            </div>

            {/* DragOverlay - full-size floating card that follows cursor */}
            <DragOverlay>
              {activeNode && activeDragData ? (
                <div className="drag-overlay-wrapper">
                  <NodeCard
                    node={activeNode}
                    number={activeDragData.number}
                    color={activeDragData.color}
                    showThumbnails={showThumbnails}
                    isRoot={false}
                    isDragging={true}
                    onDelete={() => {}}
                    onEdit={() => {}}
                    onDuplicate={() => {}}
                    onViewImage={() => {}}
                  />
                </div>
              ) : null}
            </DragOverlay>

            {/* Drop zone indicators - card-sized dashed outlines during drag */}
            {activeId && dropZones.map((zone, idx) => {
              const isNearest = activeDropZone &&
                zone.parentId === activeDropZone.parentId &&
                zone.index === activeDropZone.index &&
                zone.type === activeDropZone.type;
              // Match actual card dimensions: 192px wide, 200px or 262px tall
              const cardWidth = 192;
              const cardHeight = showThumbnails ? 262 : 200;
              return (
                <div
                  key={`${zone.type}-${zone.parentId}-${zone.index}-${idx}`}
                  className={`drop-zone-indicator ${zone.type} ${isNearest ? 'nearest' : ''}`}
                  style={{
                    left: zone.x - cardWidth / 2,
                    top: zone.y - cardHeight / 2,
                    width: cardWidth,
                    height: cardHeight,
                  }}
                />
              );
            })}

            <div className="color-key">
              <div className="color-key-header" onClick={() => setShowColorKey(v => !v)}>
                <div className="color-key-title">
                  <Palette size={16} />
                  <span>Legend</span>
                </div>
                <button className="key-toggle">
                  {showColorKey ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
              </div>
              {showColorKey && (
                <div className="color-key-list">
                  {colors.slice(0, maxDepth + 1).map((color, idx) => (
                    <div key={idx} className="color-key-item" onClick={() => setEditingColorDepth(idx)}>
                      <div className="color-swatch" style={{ backgroundColor: color }} />
                      <span>Level {idx}</span>
                      <Edit2 size={12} className="color-edit-icon" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Canvas Toolbar */}
            <div className="canvas-toolbar">
              <button
                className={`canvas-tool-btn ${activeTool === 'select' ? 'active' : ''}`}
                onClick={() => setActiveTool('select')}
                title="Select (V)"
              >
                <MousePointer2 size={20} />
              </button>
              <button
                className="canvas-tool-btn"
                title="Add Page"
                onClick={() => {
                  setEditModalNode({ id: '', url: '', title: '', parentId: '', children: [] });
                  setEditModalMode('add');
                }}
              >
                <FilePlus size={20} />
              </button>

              <div className="canvas-toolbar-divider" />

              <button
                className="canvas-tool-btn disabled"
                disabled
                title="Create Link (coming soon)"
              >
                <Link size={20} />
              </button>

              <div className="canvas-toolbar-divider" />

              <button
                className={`canvas-tool-btn ${!canUndo ? 'disabled' : ''}`}
                onClick={handleUndo}
                disabled={!canUndo}
                title="Undo (⌘Z)"
              >
                <Undo2 size={20} />
              </button>
              <button
                className={`canvas-tool-btn ${!canRedo ? 'disabled' : ''}`}
                onClick={handleRedo}
                disabled={!canRedo}
                title="Redo (⇧⌘Z)"
              >
                <Redo2 size={20} />
              </button>

              <div className="canvas-toolbar-divider" />

              <div className="view-dropdown-container" ref={viewDropdownRef}>
                <button
                  className={`canvas-tool-btn ${showViewDropdown ? 'active' : ''}`}
                  onClick={() => setShowViewDropdown(!showViewDropdown)}
                  title="View Layers"
                >
                  <Eye size={20} />
                </button>
                {showViewDropdown && (
                  <div className="view-dropdown" onClick={(e) => e.stopPropagation()}>
                    <div className="view-dropdown-header">Layers</div>
                    <label className="view-layer-item">
                      <input
                        type="checkbox"
                        checked={layers.main}
                        disabled
                        onChange={() => {}}
                      />
                      <span>Main / URL</span>
                    </label>
                    <label className="view-layer-item">
                      <input
                        type="checkbox"
                        checked={layers.xmlComparison}
                        onChange={() => setLayers(l => ({ ...l, xmlComparison: !l.xmlComparison }))}
                      />
                      <span>XML Comparison</span>
                    </label>
                    <label className="view-layer-item disabled">
                      <input
                        type="checkbox"
                        checked={layers.userFlows}
                        disabled
                        onChange={() => {}}
                      />
                      <span>User Flows</span>
                      <span className="coming-soon-badge">Soon</span>
                    </label>
                    <label className="view-layer-item disabled">
                      <input
                        type="checkbox"
                        checked={layers.crossLinks}
                        disabled
                        onChange={() => {}}
                      />
                      <span>Cross-links</span>
                      <span className="coming-soon-badge">Soon</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="zoom-controls">
              <button className="zoom-btn" onClick={zoomOut} title="Zoom Out">
                <ZoomOut size={18} />
              </button>
              <span className="zoom-level">{Math.round(scale * 100)}%</span>
              <button className="zoom-btn" onClick={zoomIn} title="Zoom In">
                <ZoomIn size={18} />
              </button>
              <div className="zoom-divider" />
              <button className="zoom-btn" onClick={fitToScreen} title="Fit to Screen">
                <Minimize2 size={18} />
              </button>
              <button className="zoom-btn" onClick={resetView} title="Reset View (100%)">
                <Maximize2 size={18} />
              </button>
            </div>
          </DndContext>
        )}
      </div>

      {editingColorDepth !== null && (
        <div className="modal-overlay" onClick={() => setEditingColorDepth(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Level {editingColorDepth} Color</h3>
            <input
              type="color"
              value={colors[editingColorDepth]}
              onChange={(e) => updateLevelColor(editingColorDepth, e.target.value)}
              style={{ width: '100%', height: 60, border: 'none', cursor: 'pointer' }}
            />
            <button className="modal-btn" onClick={() => setEditingColorDepth(null)}>Done</button>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal-card export-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowExportModal(false)}>
              <X size={18} />
            </button>
            <h3>Download</h3>
            <div className="export-options">
              <button className="export-btn" onClick={() => { setShowExportModal(false); exportPng(); }}>
                <FileImage size={24} />
                <div className="export-btn-text">
                  <span className="export-btn-title">PNG Image</span>
                  <span className="export-btn-desc">Visual sitemap for presentations</span>
                </div>
              </button>
              <button className="export-btn" onClick={() => { setShowExportModal(false); exportPdf(); }}>
                <FileText size={24} />
                <div className="export-btn-text">
                  <span className="export-btn-title">PDF Document</span>
                  <span className="export-btn-desc">Printable report with page list</span>
                </div>
              </button>
              <button className="export-btn" onClick={() => { exportCsv(); setShowExportModal(false); }}>
                <FileSpreadsheet size={24} />
                <div className="export-btn-text">
                  <span className="export-btn-title">CSV Spreadsheet</span>
                  <span className="export-btn-desc">Page data for Excel or Google Sheets</span>
                </div>
              </button>
              <button className="export-btn" onClick={() => { exportJson(); setShowExportModal(false); }}>
                <FileJson size={24} />
                <div className="export-btn-text">
                  <span className="export-btn-title">JSON Data</span>
                  <span className="export-btn-desc">Raw data for import or backup</span>
                </div>
              </button>
              <button className="export-btn" onClick={() => { exportSiteIndex(); setShowExportModal(false); }}>
                <List size={24} />
                <div className="export-btn-text">
                  <span className="export-btn-title">Site Index</span>
                  <span className="export-btn-desc">Page list document for Word or Google Docs</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="modal-overlay" onClick={() => { setShowShareModal(false); setShareEmails(''); setLinkCopied(false); }}>
          <div className="modal-card share-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { setShowShareModal(false); setShareEmails(''); setLinkCopied(false); }}>
              <X size={18} />
            </button>
            <h3>Share Sitemap</h3>

            <div className="share-section">
              <button className={`share-link-btn ${linkCopied ? 'copied' : ''}`} onClick={copyShareLink}>
                {linkCopied ? <Check size={18} /> : <Copy size={18} />}
                <span>{linkCopied ? 'Link Copied!' : 'Copy Share Link'}</span>
              </button>
            </div>

            <div className="share-section">
              <div className="share-section-title">Send via Email</div>
              <div className="share-email-section">
                <div className="share-email-input">
                  <Mail size={18} />
                  <input
                    type="text"
                    placeholder="Enter email addresses..."
                    value={shareEmails}
                    onChange={(e) => setShareEmails(e.target.value)}
                  />
                </div>
                <button className="share-email-btn" onClick={sendShareEmail}>
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSaveMapModal && (
        <div className="modal-overlay" onClick={() => setShowSaveMapModal(false)}>
          <div className="modal-card save-map-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSaveMapModal(false)}>
              <X size={18} />
            </button>
            <h3>Save Map</h3>
            {!isLoggedIn ? (
              <div className="projects-empty">
                Please log in to save maps
              </div>
            ) : (
              <SaveMapForm
                projects={projects}
                currentMap={currentMap}
                rootUrl={root?.url}
                onSave={saveMap}
                onCreateProject={createProject}
                onCancel={() => setShowSaveMapModal(false)}
              />
            )}
          </div>
        </div>
      )}

      {showProjectsModal && (
        <div className="modal-overlay" onClick={() => { setShowProjectsModal(false); setEditingProjectId(null); }}>
          <div className="modal-card projects-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { setShowProjectsModal(false); setEditingProjectId(null); }}>
              <X size={18} />
            </button>
            <h3>Projects & Maps</h3>
            {!isLoggedIn ? (
              <div className="projects-empty">
                Please log in to save and manage projects
              </div>
            ) : (
              <>
                <div className="projects-list">
                  {projects.length === 0 ? (
                    <div className="projects-empty">
                      No projects yet. Create one to organize your maps.
                    </div>
                  ) : (
                    projects.map(project => (
                      <div key={project.id} className="project-folder">
                        <div className="project-folder-header" onClick={() => toggleProjectExpanded(project.id)}>
                          <div className="project-folder-icon">
                            <Folder size={18} />
                          </div>
                          {editingProjectId === project.id ? (
                            <input
                              className="project-name-input"
                              value={editingProjectName}
                              onChange={(e) => setEditingProjectName(e.target.value)}
                              onBlur={() => renameProject(project.id, editingProjectName)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') renameProject(project.id, editingProjectName);
                                if (e.key === 'Escape') setEditingProjectId(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                          ) : (
                            <span className="project-folder-name">{project.name}</span>
                          )}
                          <span className="project-map-count">{project.maps?.length || 0} maps</span>
                          <div className="project-chevron">
                            {expandedProjects[project.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                          <div className="project-folder-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="project-action-btn"
                              title="Rename"
                              onClick={() => { setEditingProjectId(project.id); setEditingProjectName(project.name); }}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              className="project-action-btn danger"
                              title="Delete Project"
                              onClick={() => deleteProject(project.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        {expandedProjects[project.id] && (
                          <div className="project-maps">
                            {project.maps?.length === 0 ? (
                              <div className="project-maps-empty">No maps in this project</div>
                            ) : (
                              project.maps?.map(map => (
                                <div key={map.id} className="map-item" onClick={() => loadMap(map)}>
                                  <MapIcon size={16} />
                                  <span className="map-name">{map.name}</span>
                                  <span className="map-date">{new Date(map.updatedAt).toLocaleDateString()}</span>
                                  <button
                                    className="map-delete"
                                    title="Delete Map"
                                    onClick={(e) => { e.stopPropagation(); deleteMap(project.id, map.id); }}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <button
                  className="add-project-btn"
                  onClick={() => {
                    const name = window.prompt('New project name:');
                    if (name) createProject(name);
                  }}
                >
                  <FolderPlus size={18} />
                  Add Project
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showHistoryModal && (
        <div className="modal-overlay" onClick={() => { setShowHistoryModal(false); setSelectedHistoryItems(new Set()); }}>
          <div className="modal-card history-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { setShowHistoryModal(false); setSelectedHistoryItems(new Set()); }}>
              <X size={18} />
            </button>
            <h3>Scan History</h3>
            {scanHistory.length === 0 ? (
              <div className="history-empty">
                No scans in history yet. Your completed scans will appear here.
              </div>
            ) : (
              <>
                <div className="history-actions">
                  <button
                    className="history-action-btn"
                    onClick={selectedHistoryItems.size === scanHistory.length ? clearHistorySelection : selectAllHistory}
                  >
                    {selectedHistoryItems.size === scanHistory.length ? (
                      <><CheckSquare size={16} /> Deselect All</>
                    ) : (
                      <><Square size={16} /> Select All</>
                    )}
                  </button>
                  {selectedHistoryItems.size > 0 && (
                    <button className="history-action-btn danger" onClick={deleteSelectedHistory}>
                      <Trash2 size={16} />
                      Delete Selected ({selectedHistoryItems.size})
                    </button>
                  )}
                </div>
                <div className="history-list">
                  {scanHistory.map(item => (
                    <div
                      key={item.id}
                      className={`history-item ${selectedHistoryItems.has(item.id) ? 'selected' : ''}`}
                    >
                      <button
                        className="history-checkbox"
                        onClick={(e) => { e.stopPropagation(); toggleHistorySelection(item.id); }}
                      >
                        {selectedHistoryItems.has(item.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                      <div className="history-item-content" onClick={() => loadFromHistory(item)}>
                        <div className="history-item-header">
                          <Globe size={16} />
                          <span className="history-hostname">{item.hostname}</span>
                          <span className="history-pages">{item.page_count || item.pageCount} pages</span>
                        </div>
                        <div className="history-item-meta">
                          <span className="history-url">{item.url}</span>
                          <span className="history-date">{new Date(item.scanned_at || item.scannedAt).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="modal-overlay scanning-overlay">
          <div className="modal-card scanning-modal" onClick={(e) => e.stopPropagation()}>
            {!showCancelConfirm ? (
              <>
                <div className="scan-animation">
                  <Globe size={48} className="scan-globe" />
                  <Loader2 size={80} className="scan-spinner" />
                </div>
                <div className="scan-status">
                  <div className="scan-message">{scanMessage}</div>
                  <div className="scan-stats">
                    <div className="scan-pages">
                      <span className="scan-pages-count">{scanProgress.scanned}</span>
                      <span className="scan-pages-label">pages scanned</span>
                    </div>
                    {scanProgress.queued > 0 && (
                      <div className="scan-queued">
                        <span className="scan-queued-count">{scanProgress.queued}</span>
                        <span className="scan-queued-label">in queue</span>
                      </div>
                    )}
                  </div>
                  <div className="scan-time-info">
                    <div className="scan-elapsed">
                      <span className="scan-time-label">Elapsed</span>
                      <span className="scan-time-value">
                        {Math.floor(scanElapsed / 60)}:{String(scanElapsed % 60).padStart(2, '0')}
                      </span>
                    </div>
                    {scanProgress.scanned > 2 && scanProgress.queued > 0 && (
                      <div className="scan-estimated">
                        <span className="scan-time-label">Est. remaining</span>
                        <span className="scan-time-value">
                          {(() => {
                            const avgTimePerPage = scanElapsed / scanProgress.scanned;
                            const estRemaining = Math.ceil(avgTimePerPage * scanProgress.queued);
                            const mins = Math.floor(estRemaining / 60);
                            const secs = estRemaining % 60;
                            return `~${mins}:${String(secs).padStart(2, '0')}`;
                          })()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="scan-url">{urlInput}</div>
                <button
                  className="modal-btn cancel"
                  onClick={() => setShowCancelConfirm(true)}
                >
                  Cancel Scan
                </button>
              </>
            ) : (
              <>
                <div className="cancel-confirm">
                  <AlertTriangle size={48} className="cancel-warning-icon" />
                  <h3>Cancel Scan?</h3>
                  <p>Are you sure you want to cancel the current scan?</p>
                </div>
                <div className="cancel-actions">
                  <button className="modal-btn danger" onClick={cancelScan}>
                    Yes, Cancel Scan
                  </button>
                  <button
                    className="modal-btn secondary"
                    onClick={() => setShowCancelConfirm(false)}
                  >
                    No, Continue Scanning
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {fullImageUrl && (
        <div
          className="modal-overlay image-overlay"
          onClick={() => { setFullImageUrl(null); setImageLoading(false); }}
          onKeyDown={(e) => e.key === 'Escape' && (setFullImageUrl(null), setImageLoading(false))}
          tabIndex={0}
          ref={(el) => el?.focus()}
        >
          <button className="image-overlay-close" onClick={() => { setFullImageUrl(null); setImageLoading(false); }}>
            <X size={18} />
          </button>
          <div className="image-modal" onClick={(e) => e.stopPropagation()}>
            {imageLoading && (
              <div className="image-loading-overlay">
                <Loader2 size={48} className="image-spinner" />
                <span>Loading screenshot...</span>
              </div>
            )}
            <img
              key={fullImageUrl}
              src={fullImageUrl}
              alt="Full page view"
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageLoading(false);
                showToast('Failed to load screenshot', 'error');
                setFullImageUrl(null);
              }}
              style={{ opacity: imageLoading ? 0 : 1 }}
            />
          </div>
        </div>
      )}

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

      {deleteConfirmNode && (
        <div
          className="delete-confirm-overlay"
          onClick={() => setDeleteConfirmNode(null)}
          onKeyDown={(e) => e.key === 'Escape' && setDeleteConfirmNode(null)}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <p>Delete "{deleteConfirmNode.title || deleteConfirmNode.url || 'this page'}"?</p>
            <div className="delete-confirm-actions">
              <button className="btn-secondary" onClick={() => setDeleteConfirmNode(null)}>Cancel</button>
              <button className="btn-danger" onClick={confirmDeleteNode}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal import-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Import Sitemap</h2>
              <button className="modal-close" onClick={() => setShowImportModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="import-info">
                <p>Import a sitemap from a file. Supported formats:</p>
                <ul className="import-formats">
                  <li><strong>XML</strong> - Standard sitemap.xml files</li>
                  <li><strong>RSS/Atom</strong> - Feed files with links</li>
                  <li><strong>HTML</strong> - Extracts all links from the page</li>
                  <li><strong>CSV</strong> - Comma-separated URLs</li>
                  <li><strong>Markdown</strong> - Extracts URLs from markdown</li>
                  <li><strong>TXT</strong> - Plain text with URLs</li>
                </ul>
              </div>
              <label className="import-dropzone">
                <input
                  type="file"
                  accept=".xml,.rss,.atom,.html,.htm,.csv,.md,.markdown,.txt"
                  onChange={handleFileImport}
                  disabled={importLoading}
                />
                {importLoading ? (
                  <div className="import-loading">
                    <Loader2 size={32} className="spin" />
                    <span>Processing file...</span>
                  </div>
                ) : (
                  <>
                    <FileUp size={48} />
                    <span>Click to select file or drag and drop</span>
                    <span className="import-hint">.xml, .rss, .atom, .html, .csv, .md, .txt</span>
                  </>
                )}
              </label>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <ToastIcon type={toast.type} />
          <span>{toast.message}</span>
          <button className="toast-close" onClick={dismissToast}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
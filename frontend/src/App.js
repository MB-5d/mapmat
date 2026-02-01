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
import ProfileDrawer from './components/drawers/ProfileDrawer';
import SettingsDrawer from './components/drawers/SettingsDrawer';
import VersionHistoryDrawer from './components/drawers/VersionHistoryDrawer';
import ProjectsModal from './components/modals/ProjectsModal';
import PromptModal from './components/modals/PromptModal';
import ReportDrawer from './components/reports/ReportDrawer';
import SaveMapModal from './components/modals/SaveMapModal';
import SaveVersionModal from './components/modals/SaveVersionModal';
import ShareModal from './components/modals/ShareModal';
import ScanProgressModal from './components/scan/ScanProgressModal';
import VersionEditPromptModal from './components/modals/VersionEditPromptModal';
import RightRail from './components/toolbar/RightRail';
import Topbar from './components/toolbar/Topbar';
import { getHostname } from './utils/url';
import {
  API_BASE,
  DEFAULT_COLORS,
  ACCESS_LEVELS,
  SCAN_MESSAGES,
  REPORT_TYPE_OPTIONS,
  LAYOUT,
} from './utils/constants';
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
import {
  generateId,
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

const DEFAULT_CONNECTION_COLORS = {
  userFlows: '#14b8a6',
  crossLinks: '#f97316',
  brokenLinks: '#fca5a5',
};

// ============================================================================
// SITEMAP TREE COMPONENT (Deterministic Layout with Absolute Positioning)
// ============================================================================
// Layout engine extracted to layout/computeLayout.js

const MIN_SCALE = 0.05;
const MAX_SCALE = 4;
const INTERACTIVE_MIN_SCALE = 0.1;

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
  layerVisibility,
  showPageNumbers,
  onRequestThumbnail,
  thumbnailRequestIds,
  expandedStacks,
  onToggleStack,
  layout: layoutOverride,
  selectedNodeIds,
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
    });
  }, [data, orphans, showThumbnails, expandedStacks, layoutOverride]);

  const layout = layoutOverride || computedLayout;

  // Run invariant checks in development
  useEffect(() => {
    if (!layout) return;
    checkLayoutInvariants(layout.nodes, orphans, layout.connectors);
  }, [layout, orphans]);

  if (!data || !layout) return null;

  const getBadgesForNode = (node, nodeMeta) => {
    const badges = [];
    if (node.isDuplicate) badges.push('Duplicate');
    if (node.isMissing) badges.push('Missing');
    const orphanType = nodeMeta?.orphanType || node.orphanType;
    const isSubdomainTree = node.subdomainRoot || nodeMeta?.isSubdomainTree || orphanType === 'subdomain';
    const isOrphanRoot = isTopLevelOrphanRoot(nodeMeta);
    if (isSubdomainTree && badgeVisibility?.subdomains) badges.push('Subdomain');
    if (orphanType === 'orphan' && badgeVisibility?.orphanPages) badges.push('Orphan');
    if (orphanType === 'file' && badgeVisibility?.files) badges.push('File');
    if (orphanType === 'broken' && !isOrphanRoot && badgeVisibility?.brokenLinks) badges.push('Broken Link');
    if (orphanType === 'inactive' && badgeVisibility?.inactivePages) badges.push('Inactive');
    if (node.isFile && badgeVisibility?.files && !badges.includes('File')) badges.push('File');
    if (node.isBroken && !isOrphanRoot && badgeVisibility?.brokenLinks && !badges.includes('Broken Link')) {
      badges.push('Broken Link');
    }
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
        const isRoot = nodeData.node.id === data.id;
        const badges = getBadgesForNode(nodeData.node, nodeData);
        const isGhosted = isNodeGhosted(nodeData.node, nodeData, layerVisibility);
        const stackInfo = nodeData.stackInfo;
        const stackToggleParentId = stackInfo?.parentId;
        const shouldWrapStack = !!stackInfo?.collapsed;

        const isSelected = selectedNodeIds?.has(nodeData.node.id);
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
            isGhosted={isGhosted}
            badges={badges}
            showPageNumbers={showPageNumbers}
            onRequestThumbnail={onRequestThumbnail}
            thumbnailRequestIds={thumbnailRequestIds}
            stackInfo={stackInfo}
            onToggleStack={() => {
              if (stackToggleParentId) toggleStack(stackToggleParentId);
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

const hasAssignedUrl = (node) => typeof node?.url === 'string' && node.url.trim() !== '';
const ORPHAN_CONTAINER_ID = '__orphans__';
const SUBDOMAIN_CONTAINER_ID = '__subdomains__';
const HOME_PARENT_ID = '__home__';
const ORPHAN_PARENT_ID = '__orphan_root__';
const SUBDOMAIN_PARENT_ID = '__subdomain_root__';

// Build a unified index for root + orphan + subdomain trees
const buildForestIndex = (rootNode, orphanNodes = []) => {
  const index = {
    nodes: new Map(), // nodeId -> { treeRootId, treeType, parentId, hasUrl }
    trees: new Map(), // treeRootId -> { type, hasUrl, nodeIds }
  };

  const registerTree = (treeRoot, treeType) => {
    if (!treeRoot?.id) return;
    const treeRootId = treeRoot.id;
    const nodeIds = new Set();
    const stack = [{ node: treeRoot, parentId: null }];

    while (stack.length > 0) {
      const { node, parentId } = stack.pop();
      if (!node?.id) continue;
      nodeIds.add(node.id);
      index.nodes.set(node.id, {
        treeRootId,
        treeType,
        parentId,
        hasUrl: hasAssignedUrl(node),
      });

      const children = node.children || [];
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push({ node: children[i], parentId: node.id });
      }
    }

    index.trees.set(treeRootId, {
      type: treeType,
      hasUrl: hasAssignedUrl(treeRoot),
      nodeIds,
    });
  };

  if (rootNode) registerTree(rootNode, 'root');
  const list = Array.isArray(orphanNodes) ? orphanNodes : [];
  list.forEach((orphan) => {
    const treeType = orphan?.subdomainRoot ? 'subdomain' : 'orphan';
    registerTree(orphan, treeType);
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
  if (node?.isFile || nodeMeta?.orphanType === 'file') return 'file';
  return 'page';
};

const getNodeStatusFlags = (node, nodeMeta) => {
  const isOrphanRoot = isTopLevelOrphanRoot(nodeMeta);
  return {
    broken: !isOrphanRoot && (node?.isBroken || nodeMeta?.orphanType === 'broken'),
    error: Boolean(node?.isError),
    inactive: Boolean(node?.isInactive || nodeMeta?.orphanType === 'inactive'),
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
    addNormalizedUrl(newNode.url, newNode);
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

  // Seed normalized map for existing nodes in case we missed any
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

export default function App() {
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
  const [scanDepth, setScanDepth] = useState('4');
  const [scanMeta, setScanMeta] = useState({
    brokenLinks: [],
  });
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
  const [customPageTypes, setCustomPageTypes] = useState([]); // User-added page types
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [fullImageUrl, setFullImageUrl] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [connectionColors, setConnectionColors] = useState(DEFAULT_CONNECTION_COLORS);
  const [showColorKey, setShowColorKey] = useState(false);
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
  const [showVersionHistoryDrawer, setShowVersionHistoryDrawer] = useState(false);
  const [showSaveVersionModal, setShowSaveVersionModal] = useState(false);
  const [mapVersions, setMapVersions] = useState([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [activeVersionId, setActiveVersionId] = useState(null);
  const [latestVersionId, setLatestVersionId] = useState(null);
  const [showVersionEditPrompt, setShowVersionEditPrompt] = useState(false);
  const [saveVersionMeta, setSaveVersionMeta] = useState({ number: 1, timestamp: '' });
  const [duplicateMapConfig, setDuplicateMapConfig] = useState(null);
  const [pendingLoadMap, setPendingLoadMap] = useState(null);
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
  const autosavePendingRef = useRef(null);
  const autosaveInFlightRef = useRef(false);
  const autosaveRetryTimerRef = useRef(null);
  const autosaveRetryDelayRef = useRef(1000);
  const versionBaselineRef = useRef(null);
  const lastVersionSnapshotRef = useRef('');
  const versionInfoToastRef = useRef(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedHistoryItems, setSelectedHistoryItems] = useState(new Set());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
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
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [layers, setLayers] = useState({
    userFlows: true,    // User journey connections
    crossLinks: true,   // Non-hierarchical links
    brokenLinks: true,  // Broken link connections
    pageNumbers: true,
  });
  const [selectedNodeIds, setSelectedNodeIds] = useState(new Set());
  const [selectionBox, setSelectionBox] = useState(null);

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
  const contentShellRef = useRef(null);
  const layoutRef = useRef(null);
  const lastPointerRef = useRef(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });
  const selectionStartRef = useRef(null);
  const selectionActiveRef = useRef(false);
  const selectionAdditiveRef = useRef(false);
  const selectionBaseRef = useRef(new Set());
  const viewDropdownRef = useRef(null);
  const imageMenuRef = useRef(null);
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
      localStorage.setItem('mapmat-theme', theme);
    } else {
      localStorage.removeItem('mapmat-theme');
    }

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const hasMap = !!root;
  useEffect(() => {
    if (!hasMap) {
      setSelectedNodeIds(new Set());
      setSelectionBox(null);
      setThumbnailScopeIds(null);
      setShowImageMenu(false);
    }
  }, [hasMap]);

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
    subdomains: true,
    orphanPages: true,
    files: true,
    brokenLinks: true,
    inactivePages: true,
    authenticatedPages: true,
    errorPages: true,
    duplicates: true,
  }), []);

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
    const hasInactive = nodesForCounts.some((node) => !!node.isInactive || node.orphanType === 'inactive');
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

  const getVersionSnapshot = useCallback(() => ({
    root,
    orphans,
    connections,
    colors,
    connectionColors,
  }), [root, orphans, connections, colors, connectionColors]);

  const serializeVersionSnapshot = useCallback((snapshot) => {
    try {
      return JSON.stringify(snapshot);
    } catch {
      return '';
    }
  }, []);

  const isViewingHistoricalVersion = useMemo(() => {
    if (!activeVersionId || !latestVersionId) return false;
    return activeVersionId !== latestVersionId;
  }, [activeVersionId, latestVersionId]);

  const flushAutosave = useCallback(() => {
    if (autosaveInFlightRef.current) return;
    const pending = autosavePendingRef.current;
    if (!pending) return;

    autosaveInFlightRef.current = true;
    api.updateMap(pending.mapId, pending.payload)
      .then(({ map }) => {
        autosaveInFlightRef.current = false;
        autosaveRetryDelayRef.current = 1000;
        lastAutosaveSnapshotRef.current = pending.snapshot;
        setCurrentMap(map);
        setProjects(prev => prev.map(p => ({
          ...p,
          maps: (p.maps || []).map(m => (m.id === map.id ? map : m)),
        })));

        if (autosavePendingRef.current?.snapshot === pending.snapshot) {
          autosavePendingRef.current = null;
        }

        if (autosavePendingRef.current) {
          flushAutosave();
        }
      })
      .catch(() => {
        autosaveInFlightRef.current = false;
        if (autosaveRetryTimerRef.current) return;
        const delay = autosaveRetryDelayRef.current;
        autosaveRetryDelayRef.current = Math.min(delay * 2, 30000);
        autosaveRetryTimerRef.current = setTimeout(() => {
          autosaveRetryTimerRef.current = null;
          flushAutosave();
        }, delay);
      });
  }, []);

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

  // Cleanup all timers and EventSource on unmount
  useEffect(() => {
    return () => {
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
      if (messageTimerRef.current) clearInterval(messageTimerRef.current);
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  // Autosave for existing maps (debounced)
  useEffect(() => {
    if (!currentMap?.id || !root || isImportedMap || isViewingHistoricalVersion) return;

    const snapshot = JSON.stringify({
      name: currentMap?.name || mapName,
      root,
      orphans,
      connections,
      colors,
      connectionColors,
      project_id: currentMap?.project_id || null,
    });

    if (snapshot === lastAutosaveSnapshotRef.current) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosavePendingRef.current = {
        mapId: currentMap.id,
        payload: {
          name: (currentMap?.name || mapName || '').trim() || 'Untitled Map',
          root,
          orphans,
          connections,
          colors,
          connectionColors,
          project_id: currentMap?.project_id || null,
        },
        snapshot,
      };
      flushAutosave();
    }, 800);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [currentMap?.id, currentMap?.name, currentMap?.project_id, root, orphans, connections, colors, connectionColors, mapName, isImportedMap, isViewingHistoricalVersion, flushAutosave]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!currentMap?.id || !root || isViewingHistoricalVersion) return;
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
  }, [currentMap?.id, root, isViewingHistoricalVersion, getVersionSnapshot, serializeVersionSnapshot]);

  const reportTitle = useMemo(() => {
    return root?.title || getHostname(root?.url) || 'Website';
  }, [root]);

  const reportTimestamp = useMemo(() => {
    if (!lastScanAt) return '';
    return new Date(lastScanAt).toLocaleString();
  }, [lastScanAt]);


  const visibleOrphans = useMemo(() => (orphans || []).filter(Boolean), [orphans]);

  const renderRoot = useMemo(() => root, [root]);

  // Build a unified index for root + orphan + subdomain trees
  const forestIndex = useMemo(() => buildForestIndex(root, orphans), [root, orphans]);

  const mapLayout = useMemo(() => {
    if (!renderRoot) return null;
    return computeLayout(renderRoot, visibleOrphans, showThumbnails, expandedStacks, {
      mode: 'after-root',
      renderOrphanChildren: true,
    });
  }, [renderRoot, visibleOrphans, showThumbnails, expandedStacks]);

  useEffect(() => {
    layoutRef.current = mapLayout;
  }, [mapLayout]);

  const brokenConnections = useMemo(() => {
    if (scanMeta.brokenLinks.length === 0) return [];
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

    return scanMeta.brokenLinks
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
        const sourceId = getNodeIdForUrl(sourceUrl);
        if (!sourceId || sourceId === targetId) return null;

        return { id: `broken-${sourceId}-${targetId}-${index}`, sourceId, targetId };
      })
      .filter(Boolean);
  }, [scanMeta.brokenLinks, renderRoot, visibleOrphans, forestIndex]);

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
  };

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
      setIsImportedMap(false);
      setShowThumbnails(false);
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
    setIsImportedMap(false);
    setShowThumbnails(false);
    resetThumbnailQueue(0);
    applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
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

  const clampPan = useCallback((newPan, scaleArg = scaleRef.current) => {
    if (!canvasRef.current || !worldBounds) return newPan;
    const bounds = worldBounds;

    const viewportWidth = canvasRef.current.clientWidth;
    const viewportHeight = canvasRef.current.clientHeight;

    const scaledLeft = bounds.minX * scaleArg;
    const scaledTop = bounds.minY * scaleArg;
    const scaledRight = bounds.maxX * scaleArg;
    const scaledBottom = bounds.maxY * scaleArg;

    // Keep map inside viewport with padding on all sides
    const padding = 400;
    const minPanX = padding - scaledRight;
    const maxPanX = viewportWidth - padding - scaledLeft;
    const minPanY = padding - scaledBottom;
    const maxPanY = viewportHeight - padding - scaledTop;

    const clampedX = Math.max(minPanX, Math.min(maxPanX, newPan.x));
    const clampedY = Math.max(minPanY, Math.min(maxPanY, newPan.y));

    return { x: clampedX, y: clampedY };
  }, [worldBounds]);

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
    setScale(nextScale);
    setPan(clampedPan);
    return { scale: nextScale, pan: clampedPan };
  }, [clampPan]);

  const panBy = useCallback((dx, dy, opts) => {
    const nextPan = {
      x: panRef.current.x + dx,
      y: panRef.current.y + dy,
    };
    return applyTransform({ scale: scaleRef.current, x: nextPan.x, y: nextPan.y }, opts);
  }, [applyTransform]);

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
      applyTransform({ scale: scaleRef.current, x: next.x, y: next.y });
      if (elapsed < 1) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  }, [applyTransform]);

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
        if (attempt < 3) {
          setTimeout(() => moveToNode(attempt + 1), 120);
        }
        return;
      }
      const nodeData = layout.nodes.get(nodeId);
      if (!nodeData) {
        if (attempt < 3) {
          setTimeout(() => moveToNode(attempt + 1), 120);
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
      animatePanTo(targetPan);
    };

    requestAnimationFrame(() => {
      setTimeout(() => moveToNode(0), 80);
    });
  }, [animatePanTo, findStackParentsForNode, orphans, root]);

  useEffect(() => {
    if (!root) return;
    applyTransform({ scale: scaleRef.current, x: panRef.current.x, y: panRef.current.y });
  }, [layerVisibility, root, orphans, mapLayout, applyTransform]);

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
            applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
            setColors(share.colors || DEFAULT_COLORS);
            setConnectionColors(share.connectionColors || DEFAULT_CONNECTION_COLORS);
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
                connectionColors: sharedConnectionColors,
                orphans: sharedOrphans,
                connections: sharedConnections
              } = JSON.parse(sharedData);
              if (sharedRoot) {
                resetScanLayers();
                setRoot(sharedRoot);
                setOrphans(normalizeOrphans(sharedOrphans));
                setConnections(sharedConnections || []);
                applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
                setColors(sharedColors || DEFAULT_COLORS);
                setConnectionColors(sharedConnectionColors || DEFAULT_CONNECTION_COLORS);
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

  // (gesture handlers removed; zoom handled via wheel listener on canvas)

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

  const ToastIcon = ({ type }) => {
    switch (type) {
      case 'success': return <CheckCircle size={18} />;
      case 'error': return <XCircle size={18} />;
      case 'warning': return <AlertTriangle size={18} />;
      case 'loading': return <Loader2 size={18} className="toast-spinner" />;
      default: return <Info size={18} />;
    }
  };

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
    } catch (error) {
      console.error('Failed to load map versions', error);
      showToast('Failed to load versions', 'error');
    } finally {
      setIsLoadingVersions(false);
    }
  }, [activeVersionId, showToast, serializeVersionSnapshot]);

  useEffect(() => {
    if (!currentMap?.id) {
      setMapVersions([]);
      setActiveVersionId(null);
      setLatestVersionId(null);
      setShowVersionEditPrompt(false);
      setShowVersionHistoryDrawer(false);
      versionBaselineRef.current = null;
      lastVersionSnapshotRef.current = '';
      return;
    }
    loadMapVersions(currentMap.id);
  }, [currentMap?.id, loadMapVersions]);

  useEffect(() => {
    if (!showVersionHistoryDrawer || !currentMap?.id) return;
    loadMapVersions(currentMap.id);
  }, [showVersionHistoryDrawer, currentMap?.id, loadMapVersions]);

  const createVersionFromSnapshot = useCallback(async ({ mapId, name, notes, snapshot } = {}) => {
    const targetMapId = mapId || currentMap?.id;
    if (!targetMapId || !root) return null;
    const payload = snapshot || getVersionSnapshot();
    const serialized = serializeVersionSnapshot(payload);
    if (serialized && serialized === lastVersionSnapshotRef.current) return null;
    const { version } = await api.createMapVersion(targetMapId, {
      ...payload,
      name,
      notes,
    });
    lastVersionSnapshotRef.current = serialized;
    setMapVersions((prev) => [version, ...(prev || [])].slice(0, 25));
    setLatestVersionId(version.id);
    return version;
  }, [currentMap?.id, root, getVersionSnapshot, serializeVersionSnapshot]);

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

  const handleLogin = useCallback(() => {
    setShowAuthModal(true);
  }, []);

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

  const handleDemoAccess = useCallback((user) => {
    setCurrentUser(user);
    setIsLoggedIn(true);
    setProjects([]);
    setScanHistory([]);
  }, []);


  const handleLogout = useCallback(async () => {
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
    setShowProfileDrawer(false);
    setShowSettingsDrawer(false);
    setShowVersionHistoryDrawer(false);
    showToast('Logged out', 'info');
  }, [showToast]);

  const handleShowProfile = useCallback(() => {
    setShowProfileDrawer(true);
    setShowSettingsDrawer(false);
    setShowCommentsPanel(false);
    setShowReportDrawer(false);
    setShowVersionHistoryDrawer(false);
  }, []);

  const handleShowSettings = useCallback(() => {
    setShowSettingsDrawer(true);
    setShowProfileDrawer(false);
    setShowCommentsPanel(false);
    setShowReportDrawer(false);
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
    let didResolve = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 45000);
    const finish = (result) => {
      if (didResolve) return;
      didResolve = true;
      next.resolve(result);
    };

    fetch(`${API_BASE}/screenshot?url=${encodeURIComponent(next.url)}&type=thumb`, {
      signal: controller.signal,
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && data?.url) {
          updateNodeThumbnail(next.id, data.url);
          success = true;
          finish(true);
          return;
        }
        finish(false);
      })
      .catch(() => {
        // Swallow errors; retries handled in the card.
        finish(false);
      })
      .finally(() => {
        clearTimeout(timeoutId);
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

  const resetThumbnailQueue = (total) => {
    thumbnailQueueRef.current = [];
    thumbnailRequestRef.current = new Set();
    thumbnailActiveRef.current = 0;
    thumbnailStartRef.current = new Map();
    thumbnailTotalTimeRef.current = 0;
    setThumbnailQueueSize(0);
    setThumbnailActiveCount(0);
    setThumbnailStats({
      total,
      completed: 0,
      failed: 0,
      avgMs: 0,
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

  const getThumbnailCandidates = (scope) => {
    const allNodes = collectAllNodesWithOrphans(root, orphans);
    const targetIds = scope === 'selected' ? new Set(selectedNodeIds) : null;
    const scopedNodes = targetIds ? allNodes.filter((node) => targetIds.has(node.id)) : allNodes;
    const candidates = scopedNodes.filter((node) => {
      if (!node?.url) return false;
      const isScreenshotThumb = node.thumbnailUrl?.includes('/screenshots/');
      return !(node.thumbnailUrl && isScreenshotThumb);
    });
    return { targetIds, candidates };
  };

  const handleThumbnailCapture = (scope) => {
    if (!root) {
      showToast('Create or load a map before capturing thumbnails', 'info');
      return;
    }
    if (scope === 'selected' && selectedNodeIds.size === 0) {
      showToast('Select pages to capture thumbnails', 'info');
      return;
    }
    const { targetIds, candidates } = getThumbnailCandidates(scope);
    if (candidates.length === 0) {
      resetThumbnailQueue(0);
      setThumbnailScopeIds(targetIds);
      setShowThumbnails(true);
      setShowImageMenu(false);
      showToast('No new thumbnails to generate', 'info');
      return;
    }
    resetThumbnailQueue(candidates.length);
    setThumbnailScopeIds(targetIds);
    setShowThumbnails(true);
    setShowImageMenu(false);
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

  const openSaveVersionModal = () => {
    if (!currentMap?.id || !root) {
      showToast('Save the map first', 'warning');
      return;
    }
    const nextNumber = (mapVersions[0]?.version_number || 0) + 1;
    setSaveVersionMeta({
      number: nextNumber,
      timestamp: new Date().toLocaleString(),
    });
    setShowSaveVersionModal(true);
  };

  const handleSaveVersion = async (name, notes) => {
    if (!currentMap?.id) return;
    try {
      const version = await createVersionFromSnapshot({
        mapId: currentMap.id,
        name,
        notes,
      });
      if (version) {
        showToast('Version saved', 'success');
      } else {
        showToast('No changes to save', 'info');
      }
    } catch (error) {
      showToast(error.message || 'Failed to save version', 'error');
    } finally {
      setShowSaveVersionModal(false);
    }
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

  const handleDuplicateMapSave = async (projectId, name) => {
    const snapshot = getVersionSnapshot();
    if (!snapshot?.root) return;
    try {
      const { map } = await api.saveMap({
        name: name.trim(),
        url: snapshot.root?.url || '',
        root: snapshot.root,
        orphans: snapshot.orphans,
        connections: snapshot.connections,
        colors: snapshot.colors,
        connectionColors: snapshot.connectionColors,
        project_id: projectId || null,
      });
      setProjects(prev => {
        let updated = prev.map(p => ({
          ...p,
          maps: (p.maps || []).filter(m => m.id !== map.id),
        }));
        if (map.project_id) {
          updated = updated.map(p =>
            p.id === map.project_id
              ? { ...p, maps: [...(p.maps || []), map] }
              : p
          );
        }
        return updated;
      });
      setCurrentMap(map);
      setMapName(map.name);
      setIsImportedMap(false);
      setActiveVersionId(null);
      setShowVersionEditPrompt(false);
      versionBaselineRef.current = null;
      lastAutosaveSnapshotRef.current = '';
      await loadMapVersions(map.id);
      await createVersionFromSnapshot({ mapId: map.id, snapshot });
      showToast('Map duplicated', 'success');
      setDuplicateMapConfig(null);
    } catch (error) {
      showToast(error.message || 'Failed to duplicate map', 'error');
    } finally {
      setShowSaveMapModal(false);
    }
  };

  const restoreVersion = (version) => {
    if (!version?.root) return;
    setRoot(version.root);
    setOrphans(normalizeOrphans(version.orphans));
    setConnections(version.connections || []);
    setColors(version.colors || DEFAULT_COLORS);
    setConnectionColors(version.connectionColors || DEFAULT_CONNECTION_COLORS);
    setUrlInput(version.root?.url || '');
    setActiveVersionId(version.id);
    setShowVersionEditPrompt(false);
    setShowVersionHistoryDrawer(false);
    const snapshot = serializeVersionSnapshot({
      root: version.root,
      orphans: version.orphans,
      connections: version.connections || [],
      colors: version.colors || DEFAULT_COLORS,
      connectionColors: version.connectionColors || DEFAULT_CONNECTION_COLORS,
    });
    versionBaselineRef.current = snapshot;
    showToast('Version restored', 'success');
  };

  const handleOverrideVersion = () => {
    setShowVersionEditPrompt(false);
    setActiveVersionId(null);
    versionBaselineRef.current = null;
  };

  const handleSaveVersionCopy = async () => {
    const snapshot = getVersionSnapshot();
    if (!snapshot?.root) {
      setShowVersionEditPrompt(false);
      return;
    }
    const baseName = (currentMap?.name || mapName || 'Untitled Map').trim();
    const copyName = `${baseName} (Copy)`;
    try {
      const { map } = await api.saveMap({
        name: copyName,
        url: snapshot.root?.url || '',
        root: snapshot.root,
        orphans: snapshot.orphans,
        connections: snapshot.connections,
        colors: snapshot.colors,
        connectionColors: snapshot.connectionColors,
        project_id: currentMap?.project_id || null,
      });
      setProjects(prev => {
        let updated = prev.map(p => ({
          ...p,
          maps: (p.maps || []).filter(m => m.id !== map.id),
        }));
        if (map.project_id) {
          updated = updated.map(p =>
            p.id === map.project_id
              ? { ...p, maps: [...(p.maps || []), map] }
              : p
          );
        }
        return updated;
      });
      setCurrentMap(map);
      setMapName(map.name);
      setIsImportedMap(false);
      setUrlInput(snapshot.root?.url || '');
      setActiveVersionId(null);
      setShowVersionEditPrompt(false);
      versionBaselineRef.current = null;
      lastAutosaveSnapshotRef.current = '';
      await loadMapVersions(map.id);
      await createVersionFromSnapshot({ mapId: map.id, snapshot });
      showToast('Saved as a copy', 'success');
    } catch (error) {
      showToast(error.message || 'Failed to save copy', 'error');
    }
  };

  // Map functions
  const saveMap = async (projectId, mapName) => {
    if (!root) return showToast('No sitemap to save', 'warning');
    if (!mapName?.trim()) return;
    const wasNewMap = !currentMap?.id;

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
          connectionColors,
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
          connectionColors,
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
      if (wasNewMap) {
        await loadMapVersions(savedMap.id);
        await createVersionFromSnapshot({
          mapId: savedMap.id,
          snapshot: getVersionSnapshot(),
        });
      }
      if (pendingLoadMap) {
        const mapToLoad = pendingLoadMap;
        setPendingLoadMap(null);
        loadMap(mapToLoad);
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
    setSelectedNodeIds(new Set());
    setSelectionBox(null);
    setThumbnailScopeIds(null);
    setShowImageMenu(false);
    setShowThumbnails(false);
    resetThumbnailQueue(0);
    applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
    setUrlInput('');
    resetScanLayers();
    setShowSaveMapModal(false);
    setEditModalNode({ id: '', url: '', title: '', parentId: HOME_PARENT_ID, children: [] });
    setEditModalMode('add');
  };

  const loadMap = (map) => {
    resetScanLayers();
    setRoot(map.root);
    setOrphans(normalizeOrphans(map.orphans));
    setConnections(map.connections || []);
    setColors(map.colors || DEFAULT_COLORS);
    setConnectionColors(map.connectionColors || DEFAULT_CONNECTION_COLORS);
    setCurrentMap(map);
    setActiveVersionId(null);
    setShowVersionEditPrompt(false);
    versionBaselineRef.current = null;
    setSelectedNodeIds(new Set());
    setSelectionBox(null);
    setThumbnailScopeIds(null);
    setShowImageMenu(false);
    setShowThumbnails(false);
    resetThumbnailQueue(0);
    loadMapVersions(map.id);
    setShowProjectsModal(false);
    applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
    setUrlInput(map.root?.url || '');
    showToast(`Loaded "${map.name}"`, 'success');
    scheduleResetView();
  };

  const handleLoadMapRequest = (map) => {
    if (hasMap && !currentMap?.id) {
      setPendingLoadMap(map);
      setCreateMapMode(false);
      setDuplicateMapConfig(null);
      setShowProjectsModal(false);
      setShowSaveMapModal(true);
      return;
    }
    loadMap(map);
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
    setExpandedProjects((prev) => {
      const isOpen = !!prev[projectId];
      return isOpen ? {} : { [projectId]: true };
    });
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
        connectionColors,
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
        connectionColors,
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
      const forestIndexForCounts = buildForestIndex(merged.root, merged.orphans);
      const isTopLevelOrphanRootMeta = (meta) => meta?.treeType === 'orphan' && meta.parentId === null;
      const authCount = nodesForCounts.filter((node) => !!node.authRequired).length;
      const duplicateCount = nodesForCounts.filter((node) => node.isDuplicate).length;
      const hasSubdomains = (merged.orphans || []).some((orphan) => !!orphan.subdomainRoot);
      const hasOrphans = (merged.orphans || []).some((orphan) => !orphan.subdomainRoot);
      const hasBroken = nodesForCounts.some((node) => {
        const meta = forestIndexForCounts.nodes.get(node.id);
        if (isTopLevelOrphanRootMeta(meta)) return false;
        return !!node.isBroken || node.orphanType === 'broken';
      });
      const hasInactive = nodesForCounts.some((node) => !!node.isInactive || node.orphanType === 'inactive');
      const hasErrors = nodesForCounts.some((node) => !!node.isError);
      setRoot(merged.root);
      setOrphans(merged.orphans);
      setShowThumbnails(false);
      setThumbnailScopeIds(null);
      resetThumbnailQueue(0);
      setConnections([]);
      setScanMeta({ brokenLinks: data.brokenLinks || [] });
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
      applyTransform({ scale: 1, x: 0, y: 0 }, { skipPanClamp: true });
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

    const canStartSelection = e.shiftKey && activeTool === 'select' && !connectionTool;
    if (canStartSelection) {
      const start = getWorldPointFromClient(e.clientX, e.clientY);
      selectionActiveRef.current = true;
      selectionAdditiveRef.current = e.shiftKey;
      selectionBaseRef.current = new Set(selectedNodeIds);
      selectionStartRef.current = start;
      setSelectionBox({ x: start.x, y: start.y, w: 0, h: 0 });
      setIsPanning(false);
      dragRef.current.dragging = false;
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
            if (intersects) next.add(nodeData.node.id);
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
      if (start) {
        const current = getWorldPointFromClient(e.clientX, e.clientY);
        const rect = {
          x: Math.min(start.x, current.x),
          y: Math.min(start.y, current.y),
          w: Math.abs(current.x - start.x),
          h: Math.abs(current.y - start.y),
        };
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
              if (intersects) next.add(nodeData.node.id);
            });
          }
          setSelectedNodeIds(next);
        } else if (!selectionAdditiveRef.current) {
          setSelectedNodeIds(new Set());
        }
      }
      selectionActiveRef.current = false;
      selectionStartRef.current = null;
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
    const targetY = 60;
    const scale = scaleRef.current;

    const nodeCenterX = rootNode.x + rootNode.w / 2;
    const nodeTopY = rootNode.y;

    const nextPan = {
      x: targetX - nodeCenterX * scale,
      y: targetY - nodeTopY * scale,
    };

    applyTransform({ scale, x: nextPan.x, y: nextPan.y });
  }, [applyTransform, renderRoot, root]);

  const resetView = useCallback(() => {
    applyTransform({ scale: 1, x: 0, y: 0 });
    requestAnimationFrame(() => {
      centerHome();
    });
  }, [applyTransform, centerHome]);

  const scheduleResetView = (attempts = 8) => {
    if (attempts <= 0) return;
    setTimeout(() => {
      if (!layoutRef.current || !canvasRef.current) {
        scheduleResetView(attempts - 1);
        return;
      }
      if (!layoutRef.current.nodes || layoutRef.current.nodes.size === 0) {
        scheduleResetView(attempts - 1);
        return;
      }
      centerHome();
    }, 80);
  };

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
  const saveStateForUndo = (overrideState = null) => {
    console.log('SAVING STATE FOR UNDO');
    const snapshot = overrideState || { root, orphans, connections, colors, connectionColors };
    setUndoStack(prev => [...prev, JSON.stringify(snapshot)]);
    setRedoStack([]); // Clear redo on new action
  };

  const handleUndo = () => {
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
            setShowProfileDrawer(false);
            setShowSettingsDrawer(false);
          }
          return next;
        });
      }
      if (e.key === 'r' || e.key === 'R') {
        setShowReportDrawer(prev => {
          const next = !prev;
          if (next) {
            setShowCommentsPanel(false);
            setShowProfileDrawer(false);
            setShowSettingsDrawer(false);
            setShowVersionHistoryDrawer(false);
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
            setShowProfileDrawer(false);
            setShowSettingsDrawer(false);
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
        if (showCommentsPanel) {
          setActiveTool('select');
          setCommentingNodeId(null); // Close popover when switching tools
        }
        if (showReportDrawer) {
          setShowReportDrawer(false);
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, redoStack, root, activeTool, connectionTool, connectionMenu, showCommentsPanel, showReportDrawer, showProfileDrawer, showSettingsDrawer, showVersionHistoryDrawer, zoomAtClientPoint, getZoomBounds]);

  // Smooth wheel handling for pan/zoom
  const wheelStateRef = useRef({
    dx: 0,
    dy: 0,
    isZoom: false,
    clientX: 0,
    clientY: 0,
    raf: null,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const flushWheel = () => {
      wheelStateRef.current.raf = null;
      if (!root) return;

      const { dx, dy: wheelDy, isZoom, clientX, clientY } = wheelStateRef.current;
      wheelStateRef.current.dx = 0;
      wheelStateRef.current.dy = 0;

      if (isZoom) {
        const delta = -wheelDy;
        const zoomIntensity = 0.002;
        const currentScale = scaleRef.current;
        const { min, max } = getZoomBounds();
        const next = clamp(currentScale * (1 + delta * zoomIntensity), min, max);
        zoomAtClientPoint(next, clientX, clientY);
        return;
      }

      if (dx === 0 && wheelDy === 0) return;
      panBy(-dx, -wheelDy);
    };

    const handleWheel = (e) => {
      // Always preventDefault — the canvas handles all wheel input (zoom + pan).
      // Letting non-zoom events through causes macOS elastic overscroll, which
      // shifts getBoundingClientRect() and corrupts subsequent zoom anchors.
      e.preventDefault();
      if (!root) return;

      const isZoom = e.ctrlKey || e.metaKey;
      const ws = wheelStateRef.current;

      // Normalize deltaMode before accumulating (Firefox mouse wheel uses LINE mode)
      let dy = e.deltaY;
      let dx = e.deltaX;
      if (e.deltaMode === 1) { dy *= 20; dx *= 20; }       // DOM_DELTA_LINE
      else if (e.deltaMode === 2) { dy *= 400; dx *= 400; } // DOM_DELTA_PAGE

      // If gesture type changed mid-frame, flush old gesture before accumulating new one
      if (ws.raf && ws.isZoom !== isZoom && (ws.dx !== 0 || ws.dy !== 0)) {
        cancelAnimationFrame(ws.raf);
        ws.raf = null;
        flushWheel();
      }

      ws.dx += dx;
      ws.dy += dy;
      ws.isZoom = isZoom;
      if (isZoom) {
        ws.clientX = e.clientX;
        ws.clientY = e.clientY;
      }

      if (!ws.raf) {
        ws.raf = requestAnimationFrame(flushWheel);
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      if (wheelStateRef.current.raf) {
        cancelAnimationFrame(wheelStateRef.current.raf);
        wheelStateRef.current.raf = null;
      }
    };
  }, [root, panBy, zoomAtClientPoint]);

  const exportJson = () => {
    if (!root) return;
    downloadText('sitemap.json', JSON.stringify({ root, colors, connectionColors }, null, 2));
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
    const savedScale = scaleRef.current;
    const savedPan = { ...panRef.current };

    showToast('Generating PDF...', 'info', true);

    try {
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
        connectionColors,
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
        const shareData = { root, orphans, connections, colors, connectionColors, createdAt: Date.now() };
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
    const savedScale = scaleRef.current;
    const savedPan = { ...panRef.current };

    try {
      showToast('Generating PNG...', 'info', true);

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
    }
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

  const handleNodeClick = (node, event) => {
    if (!node) return;
    if (activeTool === 'comments') {
      openCommentPopover(node.id);
      return;
    }
    if (connectionTool) return;
    if (!event) return;
    const interactiveTarget = event.target.closest(
      'button, a, input, textarea, select, .anchor-point, .stack-toggle, .comment-badge, .thumb-fullsize-btn'
    );
    if (interactiveTarget) return;

    if (event.shiftKey) {
      setSelectedNodeIds((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) {
          next.delete(node.id);
        } else {
          next.add(node.id);
        }
        return next;
      });
    } else {
      setSelectedNodeIds(new Set([node.id]));
    }
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

  const getBrokenLinkBezierPath = (sourceId, targetId) => {
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
          best = { sourceAnchor, targetAnchor, start, end, dist };
        }
      });
    });

    if (!best) return '';

    const offset = { x: 8, y: -8 };
    const startPos = { x: best.start.x, y: best.start.y };
    const endPos = { x: best.end.x, y: best.end.y };

    const dx = Math.abs(endPos.x - startPos.x);
    const dy = Math.abs(endPos.y - startPos.y);
    const curveOffset = Math.min(Math.max(dx, dy) * 0.5, 120);

    let ctrl1 = { x: startPos.x + offset.x, y: startPos.y + offset.y };
    let ctrl2 = { x: endPos.x + offset.x, y: endPos.y + offset.y };

    switch (best.sourceAnchor) {
      case 'top': ctrl1.y -= curveOffset; break;
      case 'right': ctrl1.x += curveOffset; break;
      case 'bottom': ctrl1.y += curveOffset; break;
      case 'left': ctrl1.x -= curveOffset; break;
      default: break;
    }
    switch (best.targetAnchor) {
      case 'top': ctrl2.y -= curveOffset; break;
      case 'right': ctrl2.x += curveOffset; break;
      case 'bottom': ctrl2.y += curveOffset; break;
      case 'left': ctrl2.x -= curveOffset; break;
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
            description: updatedNode.description,
            metaTags: updatedNode.metaTags,
          });
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
              description: updatedNode.description,
              metaTags: updatedNode.metaTags,
            });

            const currentParent = findParent(treeRoot, updatedNode.id);
            const currentParentId = currentParent?.id || '';
            const currentRootType = treeRoot.subdomainRoot ? 'subdomain' : 'orphan';
            const targetRootType = wantsSubdomainRoot ? 'subdomain' : 'orphan';
            const movingToRootLevel = wantsSubdomainRoot || wantsOrphanRoot;

            if (currentParentId !== newParentId || (movingToRootLevel && targetRootType !== currentRootType)) {
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
      const newNode = {
        ...updatedNode,
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
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
    const sourceMeta = forestIndex.nodes.get(nodeId);
    const targetMeta = forestIndex.nodes.get(newParentId);
    if (!sourceMeta) return;
    if (!canMoveNode(nodeId, newParentId)) return;

    const getTreeRootById = (treeRootId, rootTree, orphanTrees) => {
      if (!treeRootId) return null;
      if (rootTree?.id === treeRootId) return rootTree;
      return orphanTrees.find(o => o.id === treeRootId) || null;
    };

    const sourceTreeRoot = getTreeRootById(sourceMeta.treeRootId, root, orphans);
    const targetTreeRoot = targetMeta
      ? getTreeRootById(targetMeta.treeRootId, root, orphans)
      : null;
    if (!sourceTreeRoot) return;

    // Prevent dropping into a descendant within the same tree
    if (targetMeta && sourceMeta.treeRootId === targetMeta.treeRootId) {
      if (isDescendantOf(sourceTreeRoot, newParentId, nodeId)) return;
    }

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

    const clearTreeFlags = (node) => {
      if (!node) return;
      if (node.subdomainRoot) node.subdomainRoot = false;
      if (node.orphanType === 'orphan' || node.orphanType === 'subdomain') {
        delete node.orphanType;
      }
      node.children?.forEach(clearTreeFlags);
    };

    const applyTreeTypeFlags = (node, treeType) => {
      if (!node) return;
      if (treeType === 'subdomain') {
        node.orphanType = 'subdomain';
        node.subdomainRoot = false;
      } else if (treeType === 'orphan') {
        node.orphanType = 'orphan';
        node.subdomainRoot = false;
      }
      node.children?.forEach((child) => applyTreeTypeFlags(child, treeType));
    };

    const purgeNodeFromTree = (tree, targetId) => {
      if (!tree?.children?.length) return;
      tree.children = tree.children.filter((child) => child.id !== targetId);
      tree.children.forEach((child) => purgeNodeFromTree(child, targetId));
    };

    const applyRootFlags = (node, type) => {
      if (!node) return;
      if (type === 'subdomain') {
        node.subdomainRoot = true;
        if (!node.orphanType || node.orphanType === 'orphan') node.orphanType = 'subdomain';
      } else {
        node.subdomainRoot = false;
        if (!node.orphanType || node.orphanType === 'subdomain') node.orphanType = 'orphan';
      }
    };

    saveStateForUndo();

    let nextRoot = structuredClone(root);
    let nextOrphans = structuredClone(orphans);

    const getMutableTreeRoot = (treeRootId) => (
      treeRootId === nextRoot?.id
        ? nextRoot
        : nextOrphans.find(o => o.id === treeRootId)
    );

    const sourceTree = getMutableTreeRoot(sourceMeta.treeRootId);
    if (!sourceTree) return;

    let removedNode = null;
    let oldParent = null;
    let oldIndex = -1;

    if (sourceTree.id === nodeId) {
      // Removing an orphan/subdomain tree root
      if (sourceTree.id === nextRoot?.id) return;
      const idx = nextOrphans.findIndex(o => o.id === nodeId);
      if (idx === -1) return;
      removedNode = nextOrphans.splice(idx, 1)[0];
    } else {
      oldParent = findParent(sourceTree, nodeId);
      if (oldParent) {
        oldIndex = oldParent.children.findIndex(c => c.id === nodeId);
      }
      removedNode = removeFromTree(sourceTree, nodeId);
    }

    if (!removedNode) return;

    if (nextRoot) purgeNodeFromTree(nextRoot, nodeId);
    nextOrphans = nextOrphans.filter((orphan) => orphan.id !== nodeId);
    nextOrphans.forEach((orphan) => purgeNodeFromTree(orphan, nodeId));

    if (newParentId === ORPHAN_CONTAINER_ID || newParentId === SUBDOMAIN_CONTAINER_ID) {
      const isSubdomain = newParentId === SUBDOMAIN_CONTAINER_ID;
      const orderedRoots = nextOrphans.filter(o => !!o.subdomainRoot === isSubdomain);
      const rootIds = orderedRoots.map(o => o.id);
      const fullIndex = (() => {
        if (rootIds.length === 0) return nextOrphans.length;
        if (insertIndex >= rootIds.length) {
          const lastId = rootIds[rootIds.length - 1];
          const lastIdx = nextOrphans.findIndex(o => o.id === lastId);
          return lastIdx === -1 ? nextOrphans.length : lastIdx + 1;
        }
        const targetId = rootIds[insertIndex];
        const targetIdx = nextOrphans.findIndex(o => o.id === targetId);
        return targetIdx === -1 ? nextOrphans.length : targetIdx;
      })();

      clearTreeFlags(removedNode);
      applyRootFlags(removedNode, isSubdomain ? 'subdomain' : 'orphan');
      nextOrphans.splice(fullIndex, 0, removedNode);
      setRoot(nextRoot);
      setOrphans(nextOrphans);
      return;
    }

    const targetTree = targetTreeRoot ? getMutableTreeRoot(targetMeta.treeRootId) : null;
    if (!targetTree) return;
    const newParent = findNodeById(targetTree, newParentId);
    if (!newParent) return;

    let adjustedIndex = insertIndex;
    if (targetMeta && sourceMeta.treeRootId === targetMeta.treeRootId && oldParent?.id === newParentId && oldIndex !== -1) {
      if (oldIndex < insertIndex) adjustedIndex = insertIndex - 1;
    }

    clearTreeFlags(removedNode);
    if (targetMeta?.treeType === 'orphan' || targetMeta?.treeType === 'subdomain') {
      applyTreeTypeFlags(removedNode, targetMeta.treeType);
    }

    newParent.children = newParent.children || [];
    newParent.children.splice(adjustedIndex, 0, removedNode);

    setRoot(nextRoot);
    setOrphans(nextOrphans);
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

      // Root-level orphans/subdomains: allow sibling zones using container targets
      if (!parent && nodeMeta.treeType !== 'root') {
        const isSubdomainRoot = nodeMeta.treeType === 'subdomain';
        const displayOrder = isSubdomainRoot ? subdomainDisplayOrder : orphanDisplayOrder;
        const displayIndex = displayOrder.findIndex(o => o.id === nodeId);
        const displayCount = displayOrder.length;
        const containerId = isSubdomainRoot ? SUBDOMAIN_CONTAINER_ID : ORPHAN_CONTAINER_ID;

        if (displayIndex !== -1) {
          const insertIndexBefore = displayCount - displayIndex;
          zones.push({
            type: 'sibling-root',
            layout: 'horizontal',
            parentId: containerId,
            index: insertIndexBefore,
            x: rect.left - 24,
            y: rect.top + rect.height / 2,
            allowed: canMoveNode(draggedNodeId, containerId),
          });
          if (displayIndex === displayCount - 1) {
            const insertIndexAfter = displayCount - (displayIndex + 1);
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

      // Add sibling drop zones (before this node)
      // Level 1 (depth=1) uses horizontal layout, Level 2+ (depth>1) uses vertical
      if (depth === 1 && parent) {
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
      } else if (depth > 1 && parent) {
        // Vertical layout (Level 2+) - drop zones above/below ONLY
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
        zones.push({
          type: 'child',
          layout: 'vertical',
          parentId: nodeId,
          index: 0,
          x: rect.left + rect.width / 2,
          y: rect.bottom + 60 + childZoneHeight / 2, // Top of zone at rect.bottom + 60
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
    const nearest = findNearestDropZone(currentX, currentY, active.id, 80, { includeDisabled: true });
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
      saveStateForUndo(snapshot);
    }
    colorEditSnapshotRef.current = null;
  }, [hasColorSnapshotChanged, saveStateForUndo]);

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
    if (!sourceId || !targetParentId) return 'Select a valid drop target.';
    const sourceMeta = forestIndex.nodes.get(sourceId);
    if (!sourceMeta) return null;

    if (targetParentId === ORPHAN_CONTAINER_ID) {
      if (sourceMeta.treeType === 'subdomain' && sourceMeta.hasUrl) {
        return 'Subdomain page with a URL can only move within its own subdomain.';
      }
      return null;
    }

    if (targetParentId === SUBDOMAIN_CONTAINER_ID && sourceMeta.hasUrl) {
      return 'Subdomain root requires a blank URL.';
    }

    const targetMeta = forestIndex.nodes.get(targetParentId);
    if (!targetMeta) return null;

    const targetTree = forestIndex.trees.get(targetMeta.treeRootId);
    if (!targetTree) return null;

    if (targetTree.type === 'subdomain' && sourceMeta.hasUrl && sourceMeta.treeType !== 'subdomain') {
      return 'Pages with URLs can’t be moved under a subdomain. Clear the URL first.';
    }

    if (sourceMeta.treeType === 'subdomain' && sourceMeta.hasUrl) {
      if (sourceMeta.treeRootId !== targetMeta.treeRootId) {
        return 'Subdomain page with a URL can only move within its own subdomain.';
      }
    }

    return null;
  }, [forestIndex]);

  // Centralized drag/move rules for tree movement
  const canMoveNode = useCallback((sourceId, targetParentId) => {
    if (!sourceId || !targetParentId) return false;
    const sourceMeta = forestIndex.nodes.get(sourceId);
    if (!sourceMeta) return false;

    // Subdomain pages with URLs are locked to their own subdomain tree
    if (sourceMeta.treeType === 'subdomain' && sourceMeta.hasUrl) {
      const targetMeta = forestIndex.nodes.get(targetParentId);
      return !!targetMeta && sourceMeta.treeRootId === targetMeta.treeRootId;
    }

    // Any node without an assigned URL can be dragged anywhere
    if (!sourceMeta.hasUrl) return true;

    // Container-level drops (root-level orphan/subdomain)
    if (targetParentId === ORPHAN_CONTAINER_ID) return true;
    if (targetParentId === SUBDOMAIN_CONTAINER_ID) return !sourceMeta.hasUrl;

    const targetMeta = forestIndex.nodes.get(targetParentId);
    if (!targetMeta) return false;

    const targetTree = forestIndex.trees.get(targetMeta.treeRootId);
    if (!targetTree) return false;

    if (targetTree.type === 'subdomain' && sourceMeta.hasUrl && sourceMeta.treeType !== 'subdomain') {
      return false;
    }

    // Root/Orphan/Subdomain-without-URL can move anywhere else
    return true;
  }, [forestIndex]);

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

  const zoomBounds = getZoomBounds();

  // Show landing page or app
  if (showLanding) {
    return <LandingPage onLaunchApp={() => setShowLanding(false)} />;
  }

  return (
    <AuthProvider value={authValue}>
    <div className="app">
      <Topbar
        canEdit={canEdit()}
        urlInput={urlInput}
        onUrlInputChange={(e) => setUrlInput(e.target.value)}
        onUrlKeyDown={onKeyDownUrl}
        hasMap={hasMap}
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
            <div className="content-shell" ref={contentShellRef}>
            <div
              className={`content ${drawingConnection ? 'drawing-connection' : ''} ${draggingEndpoint ? 'dragging-endpoint' : ''}`}
              ref={contentRef}
              style={{
                // PAN/ZOOM INVARIANT:
                // This transform must ONLY be translate(px, px) scale(n).
                // No %, no centering, no layout transforms.
                // Do not modify without understanding world-space math.
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
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
                {selectionBox && (
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

                <SitemapTree
                  data={renderRoot}
                  orphans={visibleOrphans}
                  layout={mapLayout}
                  showThumbnails={showThumbnails}
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
                  onAddNote={(node) => openCommentPopover(node.id)}
                  onViewNotes={(node) => openCommentPopover(node.id)}
                  badgeVisibility={badgeVisibility}
                  layerVisibility={layerVisibility}
                  showPageNumbers={layers.pageNumbers}
                  onRequestThumbnail={requestThumbnail}
                  thumbnailRequestIds={thumbnailScopeIds}
                  expandedStacks={expandedStacks}
                  onToggleStack={(nodeId) => {
                    setExpandedStacks((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
                  }}
                  selectedNodeIds={selectedNodeIds}
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
                </defs>

                {layers.brokenLinks && brokenConnections.map((conn) => {
                  const path = getBrokenLinkBezierPath(conn.sourceId, conn.targetId);
                  if (!path) return null;
                  return (
                    <path
                      key={conn.id}
                      d={path}
                      fill="none"
                      stroke={connectionColors.brokenLinks || DEFAULT_CONNECTION_COLORS.brokenLinks}
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
                    const color = isUserFlow
                      ? (connectionColors.userFlows || DEFAULT_CONNECTION_COLORS.userFlows)
                      : (connectionColors.crossLinks || DEFAULT_CONNECTION_COLORS.crossLinks);
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
                onToggleBrokenLinks: () => setLayers(l => ({ ...l, brokenLinks: !l.brokenLinks })),
                showPageNumbers: layers.pageNumbers,
                onTogglePageNumbers: () => setLayers(prev => ({ ...prev, pageNumbers: !prev.pageNumbers })),
                connectionAvailability,
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
                connectionColors,
                maxDepth,
                editingDepth: editingColorDepth,
                editingConnectionKey,
                connectionLegend,
                onEditDepth: (depth, position) => {
                  beginColorEdit();
                  setEditingColorDepth(depth);
                  setEditingConnectionKey(null);
                  setColorPickerPosition(position);
                },
                onEditConnectionColor: (key, position) => {
                  beginColorEdit();
                  setEditingConnectionKey(key);
                  setEditingColorDepth(null);
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
                      setShowReportDrawer(false);
                      setShowProfileDrawer(false);
                      setShowSettingsDrawer(false);
                      setShowVersionHistoryDrawer(false);
                    }
                    return next;
                  });
                },
                hasAnyComments,
                showReportDrawer,
                onToggleReportDrawer: () => {
                  setShowReportDrawer((prev) => {
                    const next = !prev;
                    if (next) {
                      setShowCommentsPanel(false);
                      setShowProfileDrawer(false);
                      setShowSettingsDrawer(false);
                      setShowVersionHistoryDrawer(false);
                    }
                    return next;
                  });
                },
                onToggleImageMenu: () => {
                  setShowImageMenu((prev) => !prev);
                },
                onGetThumbnailsAll: () => handleThumbnailCapture('all'),
                onGetThumbnailsSelected: () => handleThumbnailCapture('selected'),
                showImageMenu,
                imageMenuRef,
                hasSelection: selectedNodeIds.size > 0,
                canUndo,
                canRedo,
                onUndo: handleUndo,
                onRedo: handleRedo,
                onClearCanvas: clearCanvas,
                onSaveMap: () => {
                  setCreateMapMode(false);
                  setShowSaveMapModal(true);
                },
                onDuplicateMap: duplicateCurrentMap,
                onShowVersionHistory: () => {
                  setShowVersionHistoryDrawer((prev) => {
                    const next = !prev;
                    if (next) {
                      setShowCommentsPanel(false);
                      setShowReportDrawer(false);
                      setShowProfileDrawer(false);
                      setShowSettingsDrawer(false);
                    }
                    return next;
                  });
                },
                onExport: () => setShowExportModal(true),
                onShare: () => setShowShareModal(true),
                hasMap,
                hasSavedMap: !!currentMap?.id,
                showVersionHistory: showVersionHistoryDrawer,
              }}
              zoomProps={{
                scale,
                minScale: zoomBounds.min,
                maxScale: zoomBounds.max,
                onZoomOut: zoomOut,
                onZoomIn: zoomIn,
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
          setDuplicateMapConfig(null);
          setPendingLoadMap(null);
        }}
        isLoggedIn={isLoggedIn}
        onRequireLogin={() => {
          setShowSaveMapModal(false);
          setCreateMapMode(false);
          setPendingCreateAfterSave(false);
          setDuplicateMapConfig(null);
          setPendingLoadMap(null);
          setShowAuthModal(true);
        }}
        projects={projects}
        currentMap={currentMap}
        rootUrl={root?.url}
        defaultProjectId={duplicateMapConfig?.projectId || null}
        defaultName={duplicateMapConfig?.name || ''}
        onSave={createMapMode ? startBlankMapCreation : (duplicateMapConfig ? handleDuplicateMapSave : saveMap)}
        onCreateProject={createProject}
        title={createMapMode ? 'Create Map' : (duplicateMapConfig ? 'Duplicate Map' : 'Save Map')}
        submitLabel={createMapMode ? 'Create' : (duplicateMapConfig ? 'Duplicate Map' : 'Save Map')}
      />

      <SaveVersionModal
        show={showSaveVersionModal}
        onClose={() => setShowSaveVersionModal(false)}
        onSave={handleSaveVersion}
        versionNumber={saveVersionMeta.number}
        timestamp={saveVersionMeta.timestamp}
        defaultName="Updated"
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
        onLoadMap={handleLoadMapRequest}
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
          onDemo={handleDemoAccess}
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
      />

      <VersionHistoryDrawer
        isOpen={showVersionHistoryDrawer}
        onClose={() => setShowVersionHistoryDrawer(false)}
        versions={mapVersions}
        onRestoreVersion={restoreVersion}
        activeVersionId={activeVersionId}
        latestVersionId={latestVersionId}
        isLoading={isLoadingVersions}
        onAddVersion={openSaveVersionModal}
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
          mode={editModalMode}
          customPageTypes={customPageTypes}
          onAddCustomType={(type) => setCustomPageTypes(prev => [...prev, type])}
          specialParentOptions={specialParentOptions}
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
    </AuthProvider>
  );
}

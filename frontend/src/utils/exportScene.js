import { computeLayout } from '../layout/computeLayout';
import {
  DEFAULT_CONNECTION_COLORS,
  LAYOUT,
  getDepthColor,
} from './constants';
import { buildExpandedStackMap } from './treeUtils';
import { buildConnectorBezier } from './connectorGeometry';
import { isRealHttpErrorNode, isVirtualMissingNode } from './scanStatus';
import soraVariableFontUrl from '../assets/fonts/Sora-Variable.ttf';
import {
  VELLIC_LOGO_MARK_PATH,
  VELLIC_LOGO_WORDMARK_PATHS,
} from '../components/brand/VellicLogo';

export const EXPORT_MAP_PADDING = 200;
const HEADER_SIDE_MARGIN = 64;
const HEADER_MIN_HEIGHT = 168;
const HEADER_STAT_ROW_HEIGHT = 24;
const HEADER_TOTAL_INSIGHT_GAP = 24;
const HEADER_INSIGHT_GAP = 16;
const FOOTER_HEIGHT = 0;
const NODE_RADIUS = 12;
const NODE_TOP_BAR_HEIGHT = 10;
const NODE_THUMB_HEIGHT = 152;
const NODE_THUMB_TOP = NODE_TOP_BAR_HEIGHT;
const NODE_INSET = 14;
const NODE_TITLE_FONT_SIZE = 14;
const NODE_TITLE_LINE_HEIGHT = 20;
const NODE_TITLE_WEIGHT = 400;
const NODE_NUMBER_FONT_SIZE = 14;
const NODE_NUMBER_WEIGHT = 600;
const NODE_BADGE_HEIGHT = 22;
const NODE_BADGE_FONT_SIZE = 9;
const NODE_BADGE_PAD_X = 12;
const CONNECTION_STROKE_WIDTH = 3;
const TREE_CONNECTOR_STROKE_WIDTH = 1.25;
const NODE_CONNECTOR_MASK_PADDING = 8;
const LAYOUT_CONNECTOR_ENDPOINT_EPSILON = 0.5;
const MAX_PNG_DIMENSION = 16000;
const MAX_PNG_PIXELS = 80000000;
const PDF_MAX_PAGE_SIDE = 14400;
const EXPORT_PDF_FONT_FAMILY = 'Sora';
const EXPORT_PDF_FONT_FILE = 'Sora-Variable.ttf';
const EXPORT_SVG_FONT_STACK = "'Sora', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const VELLIC_SITE_URL = 'https://vellic.io';

const DESIGN_COLORS = {
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  border: '#e2e8f0',
  text: '#1e293b',
  muted: '#64748b',
  subtle: '#94a3b8',
  brand: '#4f46e5',
  brandSoft: '#eef2ff',
  brandSoftBorder: '#c7d2fe',
  warningBg: '#fef3c7',
  warningBorder: '#fbbf24',
  warningText: '#92400e',
  dangerBg: '#fee2e2',
  dangerBorder: '#fecaca',
  dangerText: '#991b1b',
};

const STAT_LABELS = {
  total: 'Total pages',
  missing: 'Missing',
  duplicates: 'Duplicates',
  brokenLinks: 'Broken links',
  inactivePages: 'Inactive pages',
  errorPages: 'Errors',
  orphanPages: 'Orphans',
  subdomains: 'Subdomains',
  files: 'Files / downloads',
  authenticatedPages: 'Authenticated pages',
};

const numberOrZero = (value) => {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
};

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(numberOrZero(value));
const getInsightText = (insight) => `${insight.label}: ${formatNumber(insight.value)}`;
const estimateExportTextWidth = (value, fontSize = 12) => String(value || '').length * fontSize * 0.58;

const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const escapeAttr = (value) => escapeXml(value).replace(/"/g, '&quot;');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizeHexColor = (value, fallback = '#64748B') => {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw.slice(1).split('').map((part) => part + part).join('')}`;
  }
  return fallback;
};

const hexToRgb = (value, fallback = '#64748B') => {
  const hex = normalizeHexColor(value, fallback).slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
};

const setPdfFill = (pdf, color) => {
  const { r, g, b } = hexToRgb(color);
  pdf.setFillColor(r, g, b);
};

const setPdfStroke = (pdf, color) => {
  const { r, g, b } = hexToRgb(color);
  pdf.setDrawColor(r, g, b);
};

const textValue = (value, fallback = '') => String(value || fallback || '').trim();

const truncateText = (value, maxLength) => {
  const text = textValue(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
};

const wrapText = (value, maxChars, maxLines) => {
  const words = textValue(value, 'Untitled').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  words.forEach((word) => {
    if (!current) {
      current = word;
      return;
    }
    if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);

  if (!lines.length) lines.push('Untitled');
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[kept.length - 1] = truncateText(kept[kept.length - 1], Math.max(4, maxChars));
    return kept;
  }
  return lines;
};

const getAnchorPosition = (layoutNode, anchor) => {
  if (!layoutNode) return null;
  const { x, y, w = LAYOUT.NODE_W, h } = layoutNode;
  switch (anchor) {
    case 'top': return { x: x + w / 2, y };
    case 'right': return { x: x + w, y: y + h / 2 };
    case 'bottom': return { x: x + w / 2, y: y + h };
    case 'left': return { x, y: y + h / 2 };
    default: return { x: x + w / 2, y: y + h / 2 };
  }
};

const getBestAnchorPair = (sourceLayout, targetLayout) => {
  const anchors = ['top', 'right', 'bottom', 'left'];
  let best = null;
  anchors.forEach((sourceAnchor) => {
    const start = getAnchorPosition(sourceLayout, sourceAnchor);
    anchors.forEach((targetAnchor) => {
      const end = getAnchorPosition(targetLayout, targetAnchor);
      if (!start || !end) return;
      const dist = (start.x - end.x) ** 2 + (start.y - end.y) ** 2;
      if (!best || dist < best.dist) {
        best = { sourceAnchor, targetAnchor, dist };
      }
    });
  });
  return best ? { sourceAnchor: best.sourceAnchor, targetAnchor: best.targetAnchor } : null;
};

const offsetPoint = (point, offset) => ({
  x: point.x + offset.x,
  y: point.y + offset.y,
});

const getConnectionPaletteKey = (type) => {
  if (type === 'userflow') return 'userFlows';
  if (type === 'crosslink') return 'crossLinks';
  if (type === 'broken') return 'brokenLinks';
  return 'crossLinks';
};

const getConnectionColor = (connection, connectionColors) => {
  const type = connection?.type || 'crosslink';
  const paletteKey = getConnectionPaletteKey(type);
  return connectionColors?.[paletteKey]
    || DEFAULT_CONNECTION_COLORS[paletteKey]
    || DEFAULT_CONNECTION_COLORS.crossLinks;
};

const getAnchorReservationKey = (nodeId, anchor) => `${nodeId || ''}:${anchor || ''}`;

const getLayoutConnectorEndpointAnchorReservation = (nodeData, point) => {
  if (!nodeData || !point) return null;

  const nodeX = Number(nodeData.x);
  const nodeY = Number(nodeData.y);
  const nodeW = Number(nodeData.w);
  const nodeH = Number(nodeData.h);
  const pointX = Number(point.x);
  const pointY = Number(point.y);

  if (![nodeX, nodeY, nodeW, nodeH, pointX, pointY].every(Number.isFinite)) return null;

  const nodeRight = nodeX + nodeW;
  const nodeBottom = nodeY + nodeH;
  const nodeCenterX = nodeX + nodeW / 2;
  const nodeCenterY = nodeY + nodeH / 2;
  const withinX = pointX >= nodeX - LAYOUT_CONNECTOR_ENDPOINT_EPSILON
    && pointX <= nodeRight + LAYOUT_CONNECTOR_ENDPOINT_EPSILON;
  const withinY = pointY >= nodeY - LAYOUT_CONNECTOR_ENDPOINT_EPSILON
    && pointY <= nodeBottom + LAYOUT_CONNECTOR_ENDPOINT_EPSILON;

  if (withinX && Math.abs(pointY - nodeY) <= LAYOUT_CONNECTOR_ENDPOINT_EPSILON) {
    return { anchor: 'top', offset: pointX - nodeCenterX };
  }
  if (withinX && Math.abs(pointY - nodeBottom) <= LAYOUT_CONNECTOR_ENDPOINT_EPSILON) {
    return { anchor: 'bottom', offset: pointX - nodeCenterX };
  }
  if (withinY && Math.abs(pointX - nodeRight) <= LAYOUT_CONNECTOR_ENDPOINT_EPSILON) {
    return { anchor: 'right', offset: pointY - nodeCenterY };
  }
  if (withinY && Math.abs(pointX - nodeX) <= LAYOUT_CONNECTOR_ENDPOINT_EPSILON) {
    return { anchor: 'left', offset: pointY - nodeCenterY };
  }

  return null;
};

const buildLayoutConnectorEndpointReservations = (layout) => {
  const reservations = new Map();
  if (!layout?.nodes || !Array.isArray(layout.connectors)) return reservations;

  const addReservation = (nodeId, reservation, connectorIndex, endpoint) => {
    const key = getAnchorReservationKey(nodeId, reservation.anchor);
    const list = reservations.get(key) || [];
    list.push({
      id: `layout-${connectorIndex}-${endpoint}`,
      kind: 'layout',
      offset: reservation.offset,
    });
    reservations.set(key, list);
  };

  layout.connectors.forEach((connector, connectorIndex) => {
    [
      { endpoint: 'source', x: connector.x1, y: connector.y1 },
      { endpoint: 'target', x: connector.x2, y: connector.y2 },
    ].forEach((point) => {
      layout.nodes.forEach((nodeData, nodeId) => {
        const reservation = getLayoutConnectorEndpointAnchorReservation(nodeData, point);
        if (reservation) addReservation(nodeId, reservation, connectorIndex, point.endpoint);
      });
    });
  });

  return reservations;
};

const getAnchorSpacing = (count, anchor, showThumbnails = false) => {
  if (count <= 1) return 0;
  const axisLength = (anchor === 'top' || anchor === 'bottom')
    ? (LAYOUT.NODE_W - 24)
    : ((showThumbnails ? LAYOUT.NODE_H_THUMB : LAYOUT.NODE_H_COLLAPSED) - 24);
  const computed = axisLength / Math.max(count - 1, 1);
  const maxSpacing = count > 12 ? 12 : 16;
  const minSpacing = count > 12 ? 2 : 6;
  return Math.max(minSpacing, Math.min(maxSpacing, computed));
};

const buildRelationshipEndpointMap = (relationshipCandidates) => {
  const endpointMap = new Map();
  const addEndpoint = (nodeId, anchor, entry) => {
    const key = getAnchorReservationKey(nodeId, anchor);
    const list = endpointMap.get(key) || [];
    list.push(entry);
    endpointMap.set(key, list);
  };

  relationshipCandidates.forEach((candidate) => {
    addEndpoint(candidate.sourceId, candidate.sourceAnchor, {
      connectionId: candidate.id,
      endpoint: 'source',
    });
    addEndpoint(candidate.targetId, candidate.targetAnchor, {
      connectionId: candidate.id,
      endpoint: 'target',
    });
  });

  return endpointMap;
};

const getAnchorOffset = ({
  candidate,
  nodeId,
  anchor,
  endpoint,
  endpointMap,
  layoutEndpointReservations,
  showThumbnails,
}) => {
  const shared = endpointMap.get(getAnchorReservationKey(nodeId, anchor)) || [];
  const layoutReservations = layoutEndpointReservations.get(getAnchorReservationKey(nodeId, anchor)) || [];
  const storedIndex = shared.findIndex((entry) => (
    entry.connectionId === candidate.id && entry.endpoint === endpoint
  ));
  const relationshipCount = shared.length + (storedIndex >= 0 ? 0 : 1);
  const connectionCount = relationshipCount + layoutReservations.length;
  if (connectionCount <= 1) return { x: 0, y: 0 };

  const index = storedIndex >= 0 ? storedIndex : shared.length;
  const spacing = getAnchorSpacing(connectionCount, anchor, showThumbnails);
  const reservedOffsets = layoutReservations.map((entry) => Number(entry.offset || 0));
  const availableOffsets = Array.from({ length: connectionCount }, (_, slotIndex) => (
    (slotIndex - (connectionCount - 1) / 2) * spacing
  )).filter((slotOffset) => (
    reservedOffsets.every((reservedOffset) => (
      Math.abs(slotOffset - reservedOffset) > LAYOUT_CONNECTOR_ENDPOINT_EPSILON
    ))
  ));
  const fallbackEdgeIndex = Math.max(0, index - availableOffsets.length);
  const fallbackDirection = fallbackEdgeIndex % 2 === 0 ? -1 : 1;
  const fallbackMagnitude = ((connectionCount - 1) / 2 + Math.ceil((fallbackEdgeIndex + 1) / 2)) * spacing;
  const offset = availableOffsets[index] ?? (fallbackDirection * fallbackMagnitude);

  return (anchor === 'top' || anchor === 'bottom')
    ? { x: offset, y: 0 }
    : { x: 0, y: offset };
};

const buildRelationshipConnectors = (layout, connections, connectionColors, showThumbnails = false) => {
  const layoutNodes = layout?.nodes || new Map();
  const candidates = [];

  (Array.isArray(connections) ? connections : []).forEach((connection, index) => {
    if (!connection || (connection.type !== 'userflow' && connection.type !== 'crosslink')) return;
    const sourceId = connection.sourceNodeId || connection.sourceId;
    const targetId = connection.targetNodeId || connection.targetId;
    if (!sourceId || !targetId || sourceId === targetId) return;

    const sourceLayout = layoutNodes.get(sourceId);
    const targetLayout = layoutNodes.get(targetId);
    if (!sourceLayout || !targetLayout) return;

    const anchors = connection.sourceAnchor && connection.targetAnchor
      ? { sourceAnchor: connection.sourceAnchor, targetAnchor: connection.targetAnchor }
      : getBestAnchorPair(sourceLayout, targetLayout);
    if (!anchors) return;

    const start = getAnchorPosition(sourceLayout, anchors.sourceAnchor);
    const end = getAnchorPosition(targetLayout, anchors.targetAnchor);
    if (!start || !end) return;

    candidates.push({
      id: connection.id || `export-connection-${index}`,
      type: connection.type,
      sourceId,
      targetId,
      sourceAnchor: anchors.sourceAnchor,
      targetAnchor: anchors.targetAnchor,
      start,
      end,
      connection,
    });
  });

  const endpointMap = buildRelationshipEndpointMap(candidates);
  const layoutEndpointReservations = buildLayoutConnectorEndpointReservations(layout);

  return candidates.map((candidate) => {
    const sourceOffset = getAnchorOffset({
      candidate,
      nodeId: candidate.sourceId,
      anchor: candidate.sourceAnchor,
      endpoint: 'source',
      endpointMap,
      layoutEndpointReservations,
      showThumbnails,
    });
    const targetOffset = getAnchorOffset({
      candidate,
      nodeId: candidate.targetId,
      anchor: candidate.targetAnchor,
      endpoint: 'target',
      endpointMap,
      layoutEndpointReservations,
      showThumbnails,
    });
    const geometry = buildConnectorBezier({
      start: candidate.start,
      end: candidate.end,
      sourceAnchor: candidate.sourceAnchor,
      targetAnchor: candidate.targetAnchor,
      sourceOffset,
      targetOffset,
      useTerminalSegment: candidate.type === 'userflow',
    });

    if (!geometry) return null;
    return {
      id: candidate.id,
      type: candidate.type,
      color: getConnectionColor(candidate.connection, connectionColors),
      dashed: candidate.type === 'crosslink',
      arrow: candidate.type === 'userflow',
      geometry,
    };
  }).filter(Boolean);
};

const getPointBounds = (points, initial) => (
  points.reduce((bounds, point) => {
    if (!point) return bounds;
    return {
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    };
  }, initial)
);

const getMapBounds = (layout, relationshipConnectors) => {
  let bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  layout.nodes.forEach((node) => {
    bounds.minX = Math.min(bounds.minX, node.x);
    bounds.minY = Math.min(bounds.minY, node.y);
    bounds.maxX = Math.max(bounds.maxX, node.x + node.w);
    bounds.maxY = Math.max(bounds.maxY, node.y + node.h);
  });

  layout.connectors.forEach((connector) => {
    bounds = getPointBounds([
      { x: connector.x1, y: connector.y1 },
      { x: connector.x2, y: connector.y2 },
    ], bounds);
  });

  relationshipConnectors.forEach((connector) => {
    const geometry = connector.geometry;
    bounds = getPointBounds([
      geometry.startPos,
      geometry.ctrl1,
      geometry.ctrl2,
      geometry.pathEnd,
      geometry.endPos,
    ], bounds);
  });

  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return bounds;
};

const getNodeBadges = (node) => {
  const badges = [];
  if (isVirtualMissingNode(node)) {
    badges.push({
      label: 'Missing',
      bg: DESIGN_COLORS.warningBg,
      border: DESIGN_COLORS.warningBorder,
      text: DESIGN_COLORS.warningText,
    });
  }
  if (node?.isDuplicate) {
    badges.push({
      label: 'Duplicate',
      bg: DESIGN_COLORS.warningBg,
      border: DESIGN_COLORS.warningBorder,
      text: DESIGN_COLORS.warningText,
    });
  }
  if (node?.isBroken || isRealHttpErrorNode(node)) {
    badges.push({
      label: node?.isBroken ? 'Broken' : 'Error',
      bg: DESIGN_COLORS.dangerBg,
      border: DESIGN_COLORS.dangerBorder,
      text: DESIGN_COLORS.dangerText,
    });
  }
  if (node?.isInactive) {
    badges.push({
      label: 'Inactive',
      bg: DESIGN_COLORS.surfaceMuted,
      border: DESIGN_COLORS.border,
      text: DESIGN_COLORS.muted,
    });
  }
  if (node?.authRequired) {
    badges.push({
      label: 'Auth',
      bg: DESIGN_COLORS.brandSoft,
      border: DESIGN_COLORS.brandSoftBorder,
      text: DESIGN_COLORS.brand,
    });
  }
  return badges.slice(0, 2);
};

export const buildExportInsights = (reportStats = {}, reportTypeOptions = []) => {
  const insights = [];
  const total = numberOrZero(reportStats.total);
  if (total > 0) insights.push({ key: 'total', label: STAT_LABELS.total, value: total });

  reportTypeOptions.forEach((option) => {
    if (!option?.key || option.key === 'standard' || option.key === 'total') return;
    const value = numberOrZero(reportStats[option.key]);
    if (value <= 0) return;
    insights.push({
      key: option.key,
      label: STAT_LABELS[option.key] || option.label || option.key,
      value,
    });
  });

  return insights;
};

const buildHeaderInsightPositions = (insights = [], contentWidth = 1) => {
  let x = 0;
  let row = 0;
  return insights.map((insight, index) => {
    const text = getInsightText(insight);
    const width = estimateExportTextWidth(text, 12);
    const gap = index === 1 ? HEADER_TOTAL_INSIGHT_GAP : HEADER_INSIGHT_GAP;
    if (index > 0) {
      if (x + gap + width > contentWidth) {
        row += 1;
        x = 0;
      } else {
        x += gap;
      }
    }
    const position = {
      x,
      y: row * HEADER_STAT_ROW_HEIGHT,
      text,
    };
    x += width;
    return position;
  });
};

export const formatShareUrlForExport = (shareUrl = '') => {
  const raw = textValue(shareUrl);
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const shareMatch = parsed.pathname.match(/^\/share\/([^/]+)/);
    if (!shareMatch) return raw;
    return `${parsed.host}/share/${shareMatch[1]}`;
  } catch {
    return raw;
  }
};

export const getPdfSceneScale = (scene, maxPageSide = PDF_MAX_PAGE_SIDE) => {
  const maxSide = Math.max(scene?.width || 0, scene?.height || 0);
  if (!Number.isFinite(maxSide) || maxSide <= 0) return 1;
  return Math.min(1, maxPageSide / maxSide);
};

export const buildExportScene = ({
  root,
  orphans = [],
  colors = [],
  connectionColors = {},
  connections = [],
  showThumbnails = false,
  orientation = 'vertical',
  title = 'Untitled Map',
  shareUrl = '',
  reportStats = {},
  reportTypeOptions = [],
  generatedAt = new Date(),
} = {}) => {
  if (!root) return null;

  const expandedStacks = buildExpandedStackMap(root, orphans);
  const layout = computeLayout(root, orphans, showThumbnails, expandedStacks, {
    orientation,
    renderOrphanChildren: true,
  });
  const relationshipConnectors = buildRelationshipConnectors(
    layout,
    connections,
    connectionColors,
    showThumbnails,
  );
  const mapBounds = getMapBounds(layout, relationshipConnectors);
  const mapWidth = Math.max(1, Math.ceil(mapBounds.maxX - mapBounds.minX));
  const mapHeight = Math.max(1, Math.ceil(mapBounds.maxY - mapBounds.minY));
  const insights = buildExportInsights(reportStats, reportTypeOptions);
  const width = Math.ceil(mapWidth + EXPORT_MAP_PADDING * 2);
  const headerContentWidth = Math.max(1, width - HEADER_SIDE_MARGIN * 2);
  const insightPositions = buildHeaderInsightPositions(insights, headerContentWidth);
  const insightRows = Math.max(
    1,
    insightPositions.reduce((max, position) => Math.max(max, Math.floor(position.y / HEADER_STAT_ROW_HEIGHT) + 1), 0),
  );
  const headerHeight = HEADER_MIN_HEIGHT + Math.max(0, insightRows - 1) * HEADER_STAT_ROW_HEIGHT;
  const height = Math.ceil(headerHeight + mapHeight + EXPORT_MAP_PADDING * 2 + FOOTER_HEIGHT);
  const mapOffset = {
    x: EXPORT_MAP_PADDING - mapBounds.minX,
    y: headerHeight + EXPORT_MAP_PADDING - mapBounds.minY,
  };

  const nodes = Array.from(layout.nodes.values()).sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > 0.5) return yDiff;
    return a.x - b.x;
  });

  return {
    width,
    height,
    padding: EXPORT_MAP_PADDING,
    headerHeight,
    footerHeight: FOOTER_HEIGHT,
    mapOffset,
    mapBounds,
    layout,
    nodes,
    treeConnectors: layout.connectors,
    relationshipConnectors,
    colors,
    showThumbnails,
    header: {
      title: textValue(title, 'Untitled Map'),
      shareUrl: textValue(shareUrl),
      displayShareUrl: formatShareUrlForExport(shareUrl),
      generatedAt: generatedAt instanceof Date ? generatedAt : new Date(generatedAt),
      insights,
      insightPositions,
    },
  };
};

const toSceneX = (scene, x) => x + scene.mapOffset.x;
const toSceneY = (scene, y) => y + scene.mapOffset.y;

const svgLine = ({ x1, y1, x2, y2, color = '#CBD5E1', width = 2, dash = '' }) => (
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${escapeAttr(color)}" stroke-width="${width}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
);

const renderVellicLogoSvg = (x, y, width) => {
  const scale = width / 214;
  return [
    `<g transform="translate(${x} ${y}) scale(${scale})">`,
    `<path d="${escapeAttr(VELLIC_LOGO_MARK_PATH)}" fill="${DESIGN_COLORS.brand}" transform="scale(0.410256)"/>`,
    `<g fill="${DESIGN_COLORS.text}">`,
    `<path d="${escapeAttr(VELLIC_LOGO_WORDMARK_PATHS.v)}" transform="translate(70.04 12.91)"/>`,
    `<path d="${escapeAttr(VELLIC_LOGO_WORDMARK_PATHS.e)}" transform="translate(102.46 12.91)"/>`,
    `<path d="${escapeAttr(VELLIC_LOGO_WORDMARK_PATHS.l)}" transform="translate(126.28 12.91)"/>`,
    `<path d="${escapeAttr(VELLIC_LOGO_WORDMARK_PATHS.l)}" transform="translate(148.59 12.91)"/>`,
    `<path d="${escapeAttr(VELLIC_LOGO_WORDMARK_PATHS.i)}" transform="translate(170.98 12.91)"/>`,
    `<path d="${escapeAttr(VELLIC_LOGO_WORDMARK_PATHS.c)}" transform="translate(182.22 12)"/>`,
    '</g>',
    '</g>',
  ].join('');
};

const renderHeaderSvg = (scene) => {
  const x = Math.min(scene.padding, HEADER_SIDE_MARGIN);
  const titleY = 54;
  const linkY = 88;
  const statsY = 118;
  const logoWidth = 126;
  const createdWidth = 86;
  const logoX = scene.width - x - logoWidth;
  const createdX = Math.max(x, logoX - createdWidth - 12);

  const parts = [
    `<text x="${x}" y="${titleY}" fill="${DESIGN_COLORS.text}" font-family="${escapeAttr(EXPORT_SVG_FONT_STACK)}" font-size="28" font-weight="500">${escapeXml(scene.header.title)}</text>`,
    `<text x="${createdX}" y="50" fill="${DESIGN_COLORS.muted}" font-family="${escapeAttr(EXPORT_SVG_FONT_STACK)}" font-size="13" font-weight="500">Created with</text>`,
    renderVellicLogoSvg(logoX, 28, logoWidth),
  ];

  if (scene.header.shareUrl) {
    parts.push(`<text x="${x}" y="${linkY}" fill="${DESIGN_COLORS.text}" font-family="${escapeAttr(EXPORT_SVG_FONT_STACK)}" font-size="13" font-weight="400">${escapeXml(scene.header.displayShareUrl || scene.header.shareUrl)}</text>`);
  }

  scene.header.insights.forEach((insight, index) => {
    const position = scene.header.insightPositions?.[index] || {
      x: index * 120,
      y: 0,
      text: getInsightText(insight),
    };
    const statX = x + position.x;
    const statY = statsY + position.y;
    parts.push(`<text x="${statX}" y="${statY}" fill="${DESIGN_COLORS.muted}" font-family="${escapeAttr(EXPORT_SVG_FONT_STACK)}" font-size="12" font-weight="500">${escapeXml(position.text)}</text>`);
  });

  return parts.join('');
};

const renderTreeConnectorsSvg = (scene) => scene.treeConnectors.map((connector) => svgLine({
  x1: toSceneX(scene, connector.x1),
  y1: toSceneY(scene, connector.y1),
  x2: toSceneX(scene, connector.x2),
  y2: toSceneY(scene, connector.y2),
  color: DESIGN_COLORS.subtle,
  width: TREE_CONNECTOR_STROKE_WIDTH,
})).join('');

const getTopBarPath = (x, y, width, height, radius) => {
  const r = Math.min(radius, height, width / 2);
  return [
    `M ${x} ${y + height}`,
    `L ${x} ${y + r}`,
    `C ${x} ${y + r * 0.447715} ${x + r * 0.447715} ${y} ${x + r} ${y}`,
    `H ${x + width - r}`,
    `C ${x + width - r * 0.447715} ${y} ${x + width} ${y + r * 0.447715} ${x + width} ${y + r}`,
    `L ${x + width} ${y + height}`,
    'Z',
  ].join(' ');
};

const getArrowHeadPoints = (end, previous, size) => {
  const angle = Math.atan2(end.y - previous.y, end.x - previous.x);
  return {
    left: {
      x: end.x - Math.cos(angle - Math.PI / 6) * size,
      y: end.y - Math.sin(angle - Math.PI / 6) * size,
    },
    right: {
      x: end.x - Math.cos(angle + Math.PI / 6) * size,
      y: end.y - Math.sin(angle + Math.PI / 6) * size,
    },
  };
};

const renderRelationshipConnectorsSvg = (scene) => scene.relationshipConnectors.map((connector) => {
  const geometry = connector.geometry;
  const start = offsetPoint(geometry.startPos, scene.mapOffset);
  const ctrl1 = offsetPoint(geometry.ctrl1, scene.mapOffset);
  const ctrl2 = offsetPoint(geometry.ctrl2, scene.mapOffset);
  const pathEnd = offsetPoint(geometry.pathEnd, scene.mapOffset);
  const end = offsetPoint(geometry.endPos, scene.mapOffset);
  const path = `M ${start.x} ${start.y} C ${ctrl1.x} ${ctrl1.y}, ${ctrl2.x} ${ctrl2.y}, ${pathEnd.x} ${pathEnd.y}${geometry.terminalDistance ? ` L ${end.x} ${end.y}` : ''}`;
  const parts = [
    `<path d="${path}" fill="none" stroke="${escapeAttr(connector.color)}" stroke-width="${CONNECTION_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"${connector.dashed ? ' stroke-dasharray="9 7"' : ''}/>`,
  ];
  if (connector.arrow) {
    const arrow = getArrowHeadPoints(end, geometry.terminalDistance ? pathEnd : ctrl2, 10);
    parts.push(`<path d="M ${arrow.left.x} ${arrow.left.y} L ${end.x} ${end.y} L ${arrow.right.x} ${arrow.right.y}" fill="none" stroke="${escapeAttr(connector.color)}" stroke-width="${CONNECTION_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  return parts.join('');
}).join('');

const makeSvgId = (value) => String(value || 'node')
  .replace(/[^a-zA-Z0-9_-]/g, '-')
  .replace(/^-+/, 'node-');

const renderNodeSvg = (scene, item, thumbnailDataUrls, index = 0) => {
  const { node } = item;
  const x = toSceneX(scene, item.x);
  const y = toSceneY(scene, item.y);
  const depthColor = normalizeHexColor(getDepthColor(scene.colors, item.depth), '#14B8A6');
  const contentTop = y + (scene.showThumbnails ? NODE_THUMB_TOP + NODE_THUMB_HEIGHT : NODE_TOP_BAR_HEIGHT) + NODE_INSET;
  const titleY = contentTop + NODE_TITLE_FONT_SIZE;
  const titleLines = wrapText(node?.title || node?.url || 'Untitled', 32, 3);
  const number = textValue(item.number || node?.number || node?.pageNumber);
  const thumbDataUrl = scene.showThumbnails ? thumbnailDataUrls?.get(node?.id) : null;
  const badges = getNodeBadges(node);
  const cardClipId = `export-card-${index}-${makeSvgId(node?.id)}`;
  const parts = [
    `<g data-export-node="${escapeAttr(node?.id || '')}">`,
    `<clipPath id="${cardClipId}"><rect x="${x}" y="${y}" width="${item.w}" height="${item.h}" rx="${NODE_RADIUS}"/></clipPath>`,
    `<g clip-path="url(#${cardClipId})">`,
    `<rect x="${x}" y="${y}" width="${item.w}" height="${item.h}" fill="${DESIGN_COLORS.surface}"/>`,
    `<path d="${getTopBarPath(x, y, item.w, NODE_TOP_BAR_HEIGHT, NODE_RADIUS)}" fill="${escapeAttr(depthColor)}"/>`,
  ];

  if (thumbDataUrl) {
    parts.push(`<image href="${escapeAttr(thumbDataUrl)}" x="${x}" y="${y + NODE_THUMB_TOP}" width="${item.w}" height="${NODE_THUMB_HEIGHT}" preserveAspectRatio="xMidYMin slice"/>`);
  } else if (scene.showThumbnails) {
    parts.push(`<rect x="${x}" y="${y + NODE_THUMB_TOP}" width="${item.w}" height="${NODE_THUMB_HEIGHT}" fill="${DESIGN_COLORS.surfaceMuted}"/>`);
  }
  if (scene.showThumbnails) {
    const dividerY = y + NODE_THUMB_TOP + NODE_THUMB_HEIGHT;
    parts.push(`<line x1="${x}" y1="${dividerY}" x2="${x + item.w}" y2="${dividerY}" stroke="${DESIGN_COLORS.border}" stroke-width="1"/>`);
  }

  parts.push('</g>');
  parts.push(`<rect x="${x}" y="${y}" width="${item.w}" height="${item.h}" rx="${NODE_RADIUS}" fill="none" stroke="${DESIGN_COLORS.border}" stroke-width="1"/>`);

  titleLines.forEach((line, index) => {
    parts.push(`<text x="${x + NODE_INSET}" y="${titleY + index * NODE_TITLE_LINE_HEIGHT}" fill="${DESIGN_COLORS.text}" font-family="${escapeAttr(EXPORT_SVG_FONT_STACK)}" font-size="${NODE_TITLE_FONT_SIZE}" font-weight="${NODE_TITLE_WEIGHT}">${escapeXml(line)}</text>`);
  });

  if (number) {
    parts.push(`<text x="${x + NODE_INSET}" y="${y + item.h - 20}" fill="${DESIGN_COLORS.muted}" font-family="${escapeAttr(EXPORT_SVG_FONT_STACK)}" font-size="${NODE_NUMBER_FONT_SIZE}" font-weight="${NODE_NUMBER_WEIGHT}">${escapeXml(number)}</text>`);
  }

  let badgeX = x + item.w - NODE_INSET;
  badges.reverse().forEach((badge) => {
    const badgeWidth = clamp(badge.label.length * 7 + NODE_BADGE_PAD_X * 2, 62, 98);
    badgeX -= badgeWidth;
    const badgeY = y + item.h - 36;
    parts.push(`<rect x="${badgeX}" y="${badgeY}" width="${badgeWidth}" height="${NODE_BADGE_HEIGHT}" rx="${NODE_BADGE_HEIGHT / 2}" fill="${escapeAttr(badge.bg)}" stroke="${escapeAttr(badge.border)}" stroke-width="1"/>`);
    parts.push(`<text x="${badgeX + badgeWidth / 2}" y="${badgeY + NODE_BADGE_HEIGHT / 2}" text-anchor="middle" dominant-baseline="middle" fill="${escapeAttr(badge.text)}" font-family="${escapeAttr(EXPORT_SVG_FONT_STACK)}" font-size="${NODE_BADGE_FONT_SIZE}" font-weight="700">${escapeXml(badge.label.toUpperCase())}</text>`);
    badgeX -= 6;
  });

  parts.push('</g>');
  return parts.join('');
};

export const renderExportSvg = (scene, thumbnailDataUrls = new Map()) => {
  if (!scene) return '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}">`,
    '<defs>',
    `<style><![CDATA[text{font-family:${EXPORT_SVG_FONT_STACK};}]]></style>`,
    '</defs>',
    renderHeaderSvg(scene),
    renderTreeConnectorsSvg(scene),
    renderRelationshipConnectorsSvg(scene),
    scene.nodes.map((node, index) => renderNodeSvg(scene, node, thumbnailDataUrls, index)).join(''),
    '</svg>',
  ].join('');
};

const renderPdfTextLines = (pdf, lines, x, y, lineHeight, options = {}) => {
  lines.forEach((line, index) => {
    pdf.text(line, x, y + index * lineHeight, options);
  });
};

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

export const registerExportPdfFonts = async (pdf) => {
  if (!pdf || typeof fetch !== 'function') return false;
  try {
    const fontList = pdf.getFontList?.() || {};
    if (!fontList[EXPORT_PDF_FONT_FAMILY]) {
      const response = await fetch(soraVariableFontUrl);
      if (!response.ok) throw new Error(`Font request failed: ${response.status}`);
      const base64 = arrayBufferToBase64(await response.arrayBuffer());
      pdf.addFileToVFS(EXPORT_PDF_FONT_FILE, base64);
      pdf.addFont(EXPORT_PDF_FONT_FILE, EXPORT_PDF_FONT_FAMILY, 'normal');
      pdf.addFont(EXPORT_PDF_FONT_FILE, EXPORT_PDF_FONT_FAMILY, 'bold');
    }
    return true;
  } catch (error) {
    console.warn('PDF font registration failed:', error?.message || error);
    return false;
  }
};

const setPdfFont = (pdf, style = 'normal') => {
  const fontList = pdf.getFontList?.() || {};
  if (fontList[EXPORT_PDF_FONT_FAMILY]) {
    pdf.setFont(EXPORT_PDF_FONT_FAMILY, style);
    return;
  }
  pdf.setFont('helvetica', style === 'bold' ? 'bold' : 'normal');
};

const parseSimpleSvgPath = (pathData) => {
  const tokens = String(pathData || '').match(/[MLHVCZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const commands = [];
  let index = 0;
  let command = null;
  let current = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };

  const isCommand = (value) => /^[MLHVCZ]$/i.test(value || '');
  const nextNumber = () => Number(tokens[index++]);

  while (index < tokens.length) {
    if (isCommand(tokens[index])) {
      command = tokens[index++].toUpperCase();
    }
    if (!command) break;

    if (command === 'M') {
      const x = nextNumber();
      const y = nextNumber();
      commands.push({ op: 'm', c: [x, y] });
      current = { x, y };
      start = { x, y };
      command = 'L';
    } else if (command === 'L') {
      const x = nextNumber();
      const y = nextNumber();
      commands.push({ op: 'l', c: [x, y] });
      current = { x, y };
    } else if (command === 'H') {
      const x = nextNumber();
      commands.push({ op: 'l', c: [x, current.y] });
      current = { x, y: current.y };
    } else if (command === 'V') {
      const y = nextNumber();
      commands.push({ op: 'l', c: [current.x, y] });
      current = { x: current.x, y };
    } else if (command === 'C') {
      const c = [
        nextNumber(),
        nextNumber(),
        nextNumber(),
        nextNumber(),
        nextNumber(),
        nextNumber(),
      ];
      commands.push({ op: 'c', c });
      current = { x: c[4], y: c[5] };
    } else if (command === 'Z') {
      commands.push({ op: 'h' });
      current = start;
      command = null;
    }
  }

  return commands.filter((entry) => (
    entry.op === 'h' || entry.c.every(Number.isFinite)
  ));
};

const transformPdfPathCommands = (commands, x, y, scaleX, scaleY) => commands.map((entry) => {
  if (entry.op === 'h') return entry;
  return {
    op: entry.op,
    c: entry.c.map((value, index) => (index % 2 === 0 ? x + value * scaleX : y + value * scaleY)),
  };
});

const drawSvgPathPdf = (pdf, pathData, x, y, scaleX, scaleY, color) => {
  const commands = transformPdfPathCommands(parseSimpleSvgPath(pathData), x, y, scaleX, scaleY);
  if (!commands.length) return;
  setPdfFill(pdf, color);
  pdf.path(commands);
  pdf.fill();
};

const drawAbsoluteSvgPathPdf = (pdf, pathData, color) => {
  const commands = parseSimpleSvgPath(pathData);
  if (!commands.length) return;
  setPdfFill(pdf, color);
  pdf.path(commands);
  pdf.fill();
};

const drawVellicLogoPdf = (pdf, x, y, width) => {
  const scale = width / 214;
  drawSvgPathPdf(pdf, VELLIC_LOGO_MARK_PATH, x, y, scale * 0.410256, scale * 0.410256, DESIGN_COLORS.brand);
  drawSvgPathPdf(pdf, VELLIC_LOGO_WORDMARK_PATHS.v, x + 70.04 * scale, y + 12.91 * scale, scale, scale, DESIGN_COLORS.text);
  drawSvgPathPdf(pdf, VELLIC_LOGO_WORDMARK_PATHS.e, x + 102.46 * scale, y + 12.91 * scale, scale, scale, DESIGN_COLORS.text);
  drawSvgPathPdf(pdf, VELLIC_LOGO_WORDMARK_PATHS.l, x + 126.28 * scale, y + 12.91 * scale, scale, scale, DESIGN_COLORS.text);
  drawSvgPathPdf(pdf, VELLIC_LOGO_WORDMARK_PATHS.l, x + 148.59 * scale, y + 12.91 * scale, scale, scale, DESIGN_COLORS.text);
  drawSvgPathPdf(pdf, VELLIC_LOGO_WORDMARK_PATHS.i, x + 170.98 * scale, y + 12.91 * scale, scale, scale, DESIGN_COLORS.text);
  drawSvgPathPdf(pdf, VELLIC_LOGO_WORDMARK_PATHS.c, x + 182.22 * scale, y + 12 * scale, scale, scale, DESIGN_COLORS.text);
};

const drawPdfLine = (pdf, scene, connector, scale) => {
  const x1 = toSceneX(scene, connector.x1) * scale;
  const y1 = toSceneY(scene, connector.y1) * scale;
  const x2 = toSceneX(scene, connector.x2) * scale;
  const y2 = toSceneY(scene, connector.y2) * scale;
  pdf.line(x1, y1, x2, y2);
};

const transformPdfPoint = (scene, point, scale) => ({
  x: toSceneX(scene, point.x) * scale,
  y: toSceneY(scene, point.y) * scale,
});

const drawPdfRelationshipConnector = (pdf, scene, connector, scale) => {
  const geometry = connector.geometry;
  const start = transformPdfPoint(scene, geometry.startPos, scale);
  const ctrl1 = transformPdfPoint(scene, geometry.ctrl1, scale);
  const ctrl2 = transformPdfPoint(scene, geometry.ctrl2, scale);
  const pathEnd = transformPdfPoint(scene, geometry.pathEnd, scale);
  const end = transformPdfPoint(scene, geometry.endPos, scale);

  setPdfStroke(pdf, connector.color);
  pdf.setLineWidth(CONNECTION_STROKE_WIDTH * scale);
  if (connector.dashed && pdf.setLineDashPattern) {
    pdf.setLineDashPattern([9 * scale, 7 * scale], 0);
  }
  pdf.lines([
    [
      ctrl1.x - start.x,
      ctrl1.y - start.y,
      ctrl2.x - start.x,
      ctrl2.y - start.y,
      pathEnd.x - start.x,
      pathEnd.y - start.y,
    ],
    ...(geometry.terminalDistance ? [[end.x - pathEnd.x, end.y - pathEnd.y]] : []),
  ], start.x, start.y, [1, 1], 'S');
  if (pdf.setLineDashPattern) pdf.setLineDashPattern([], 0);

  if (connector.arrow) {
    const angle = Math.atan2(end.y - pathEnd.y, end.x - pathEnd.x);
    const size = 10 * scale;
    const left = {
      x: end.x - Math.cos(angle - Math.PI / 6) * size,
      y: end.y - Math.sin(angle - Math.PI / 6) * size,
    };
    const right = {
      x: end.x - Math.cos(angle + Math.PI / 6) * size,
      y: end.y - Math.sin(angle + Math.PI / 6) * size,
    };
    pdf.line(left.x, left.y, end.x, end.y);
    pdf.line(right.x, right.y, end.x, end.y);
  }
};

const getPdfImageCoverRect = (pdf, imageDataUrl, x, y, w, h) => {
  try {
    const props = pdf.getImageProperties?.(imageDataUrl);
    const imageWidth = Number(props?.width);
    const imageHeight = Number(props?.height);
    if (!imageWidth || !imageHeight) return { x, y, w, h };
    const imageRatio = imageWidth / imageHeight;
    const frameRatio = w / h;
    if (imageRatio > frameRatio) {
      const coverW = h * imageRatio;
      return {
        x: x - (coverW - w) / 2,
        y,
        w: coverW,
        h,
      };
    }
    const coverH = w / imageRatio;
    return {
      x,
      y,
      w,
      h: coverH,
    };
  } catch {
    return { x, y, w, h };
  }
};

const drawPdfImageCover = (pdf, imageDataUrl, x, y, w, h) => {
  const rect = getPdfImageCoverRect(pdf, imageDataUrl, x, y, w, h);
  if (typeof pdf.saveGraphicsState === 'function' && typeof pdf.clip === 'function') {
    pdf.saveGraphicsState();
    pdf.rect(x, y, w, h);
    pdf.clip();
    pdf.discardPath?.();
    pdf.addImage(imageDataUrl, 'PNG', rect.x, rect.y, rect.w, rect.h);
    pdf.restoreGraphicsState();
    return;
  }
  pdf.addImage(imageDataUrl, 'PNG', x, y, w, h);
};

const drawHeaderPdf = (pdf, scene, scale) => {
  const x = Math.min(scene.padding, HEADER_SIDE_MARGIN) * scale;
  const titleY = 54 * scale;
  const linkY = 88 * scale;
  const statsY = 118 * scale;
  const logoWidth = 126 * scale;
  const logoX = (scene.width - Math.min(scene.padding, HEADER_SIDE_MARGIN)) * scale - logoWidth;
  const createdWidth = 86 * scale;
  const createdX = Math.max(x, logoX - createdWidth - 12 * scale);

  setPdfFont(pdf, 'normal');
  pdf.setFontSize(28 * scale);
  setPdfFill(pdf, DESIGN_COLORS.text);
  pdf.text(scene.header.title, x, titleY, {
    maxWidth: Math.max(100, (scene.width - scene.padding * 2) * scale),
  });

  setPdfFont(pdf, 'normal');
  pdf.setFontSize(13 * scale);
  setPdfFill(pdf, DESIGN_COLORS.muted);
  pdf.text('Created with', createdX, 50 * scale);
  drawVellicLogoPdf(pdf, logoX, 28 * scale, logoWidth);
  if (typeof pdf.link === 'function') {
    pdf.link(logoX, 28 * scale, logoWidth, 34 * scale, { url: VELLIC_SITE_URL });
  }

  if (scene.header.shareUrl) {
    setPdfFont(pdf, 'normal');
    pdf.setFontSize(13 * scale);
    setPdfFill(pdf, DESIGN_COLORS.brand);
    const linkText = scene.header.displayShareUrl || scene.header.shareUrl;
    pdf.text(linkText, x, linkY);
    if (typeof pdf.link === 'function') {
      const linkWidth = Math.max(1, pdf.getTextWidth?.(linkText) || linkText.length * 7 * scale);
      pdf.link(x, linkY - 12 * scale, linkWidth, 16 * scale, { url: scene.header.shareUrl });
    }
  }

  scene.header.insights.forEach((insight, index) => {
    const position = scene.header.insightPositions?.[index] || {
      x: index * 120,
      y: 0,
      text: getInsightText(insight),
    };
    const statX = x + position.x * scale;
    const statY = statsY + position.y * scale;
    setPdfFont(pdf, 'normal');
    pdf.setFontSize(12 * scale);
    setPdfFill(pdf, DESIGN_COLORS.muted);
    pdf.text(position.text, statX, statY);
  });
};

const drawNodePdf = (pdf, scene, item, thumbnailDataUrls, scale) => {
  const node = item.node;
  const x = toSceneX(scene, item.x) * scale;
  const y = toSceneY(scene, item.y) * scale;
  const w = item.w * scale;
  const h = item.h * scale;
  const depthColor = normalizeHexColor(getDepthColor(scene.colors, item.depth), '#14B8A6');
  const inset = NODE_INSET * scale;
  const connectorMask = NODE_CONNECTOR_MASK_PADDING * scale;

  setPdfFill(pdf, '#FFFFFF');
  pdf.roundedRect(
    x - connectorMask,
    y - connectorMask,
    w + connectorMask * 2,
    h + connectorMask * 2,
    NODE_RADIUS * scale + connectorMask,
    NODE_RADIUS * scale + connectorMask,
    'F',
  );
  pdf.roundedRect(x, y, w, h, NODE_RADIUS * scale, NODE_RADIUS * scale, 'F');

  const hasCardClip = typeof pdf.saveGraphicsState === 'function' && typeof pdf.clip === 'function';
  if (hasCardClip) {
    pdf.saveGraphicsState();
    pdf.roundedRect(x, y, w, h, NODE_RADIUS * scale, NODE_RADIUS * scale);
    pdf.clip();
    pdf.discardPath?.();
  }

  setPdfFill(pdf, depthColor);
  drawAbsoluteSvgPathPdf(
    pdf,
    getTopBarPath(x, y, w, NODE_TOP_BAR_HEIGHT * scale, NODE_RADIUS * scale),
    depthColor,
  );

  const thumbDataUrl = scene.showThumbnails ? thumbnailDataUrls?.get(node?.id) : null;
  if (scene.showThumbnails) {
    const thumbX = x;
    const thumbY = y + NODE_THUMB_TOP * scale;
    const thumbW = w;
    const thumbH = NODE_THUMB_HEIGHT * scale;
    if (thumbDataUrl) {
      try {
        drawPdfImageCover(pdf, thumbDataUrl, thumbX, thumbY, thumbW, thumbH);
      } catch {
        setPdfFill(pdf, DESIGN_COLORS.surfaceMuted);
        pdf.rect(thumbX, thumbY, thumbW, thumbH, 'F');
      }
    } else {
      setPdfFill(pdf, DESIGN_COLORS.surfaceMuted);
      pdf.rect(thumbX, thumbY, thumbW, thumbH, 'F');
    }
    setPdfStroke(pdf, DESIGN_COLORS.border);
    pdf.setLineWidth(1 * scale);
    pdf.line(thumbX, thumbY + thumbH, thumbX + thumbW, thumbY + thumbH);
  }

  if (hasCardClip) {
    pdf.restoreGraphicsState();
  }

  setPdfStroke(pdf, DESIGN_COLORS.border);
  pdf.setLineWidth(1 * scale);
  pdf.roundedRect(x, y, w, h, NODE_RADIUS * scale, NODE_RADIUS * scale, 'S');

  const titleY = y + (
    (scene.showThumbnails ? NODE_THUMB_TOP + NODE_THUMB_HEIGHT : NODE_TOP_BAR_HEIGHT)
    + NODE_INSET
    + NODE_TITLE_FONT_SIZE
  ) * scale;
  const titleLines = wrapText(node?.title || node?.url || 'Untitled', 32, 3);
  setPdfFont(pdf, 'normal');
  pdf.setFontSize(NODE_TITLE_FONT_SIZE * scale);
  setPdfFill(pdf, DESIGN_COLORS.text);
  renderPdfTextLines(pdf, titleLines, x + inset, titleY, NODE_TITLE_LINE_HEIGHT * scale, { maxWidth: w - inset * 2 });

  const number = textValue(item.number || node?.number || node?.pageNumber);
  if (number) {
    setPdfFont(pdf, 'normal');
    pdf.setFontSize(NODE_NUMBER_FONT_SIZE * scale);
    setPdfFill(pdf, DESIGN_COLORS.muted);
    pdf.text(number, x + inset, y + h - 20 * scale);
  }

  let badgeX = x + w - inset;
  getNodeBadges(node).reverse().forEach((badge) => {
    const badgeWidth = clamp(badge.label.length * 7 + NODE_BADGE_PAD_X * 2, 62, 98) * scale;
    badgeX -= badgeWidth;
    const badgeY = y + h - 36 * scale;
    const badgeHeight = NODE_BADGE_HEIGHT * scale;
    setPdfFill(pdf, badge.bg);
    setPdfStroke(pdf, badge.border);
    pdf.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, badgeHeight / 2, badgeHeight / 2, 'FD');
    setPdfFont(pdf, 'bold');
    pdf.setFontSize(NODE_BADGE_FONT_SIZE * scale);
    setPdfFill(pdf, badge.text);
    pdf.text(badge.label.toUpperCase(), badgeX + badgeWidth / 2, badgeY + badgeHeight / 2, {
      align: 'center',
      baseline: 'middle',
    });
    badgeX -= 6 * scale;
  });
};

const drawNodeConnectorMaskPdf = (pdf, scene, item, scale) => {
  const x = toSceneX(scene, item.x) * scale;
  const y = toSceneY(scene, item.y) * scale;
  const w = item.w * scale;
  const h = item.h * scale;
  const mask = NODE_CONNECTOR_MASK_PADDING * scale;
  if (pdf.setLineDashPattern) pdf.setLineDashPattern([], 0);
  setPdfFill(pdf, DESIGN_COLORS.surface);
  pdf.roundedRect(
    x - mask,
    y - mask,
    w + mask * 2,
    h + mask * 2,
    NODE_RADIUS * scale + mask,
    NODE_RADIUS * scale + mask,
    'F',
  );
};

export const drawExportSceneToPdf = (pdf, scene, thumbnailDataUrls = new Map(), scale = 1) => {
  if (!pdf || !scene) return;
  drawHeaderPdf(pdf, scene, scale);

  setPdfStroke(pdf, DESIGN_COLORS.subtle);
  pdf.setLineWidth(TREE_CONNECTOR_STROKE_WIDTH * scale);
  scene.treeConnectors.forEach((connector) => drawPdfLine(pdf, scene, connector, scale));
  scene.relationshipConnectors.forEach((connector) => drawPdfRelationshipConnector(pdf, scene, connector, scale));
  scene.nodes.forEach((node) => drawNodeConnectorMaskPdf(pdf, scene, node, scale));
  scene.nodes.forEach((node) => drawNodePdf(pdf, scene, node, thumbnailDataUrls, scale));
};

export const getPngExportPixelRatio = (scene, options = {}) => {
  const requestedPixelRatio = Number(options.pixelRatio || 3);
  const maxDimension = Number(options.maxDimension || MAX_PNG_DIMENSION);
  const maxPixels = Number(options.maxPixels || MAX_PNG_PIXELS);
  const widthLimit = maxDimension / Math.max(scene?.width || 0, 1);
  const heightLimit = maxDimension / Math.max(scene?.height || 0, 1);
  const areaLimit = Math.sqrt(maxPixels / Math.max((scene?.width || 0) * (scene?.height || 0), 1));
  return Math.min(requestedPixelRatio, widthLimit, heightLimit, areaLimit);
};

export const renderExportSceneToPngBlob = async (
  scene,
  thumbnailDataUrls = new Map(),
  options = {},
) => {
  const effectivePixelRatio = getPngExportPixelRatio(scene, options);
  const svg = renderExportSvg(scene, thumbnailDataUrls);
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not render export image'));
      img.src = svgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(scene.width * effectivePixelRatio);
    canvas.height = Math.ceil(scene.height * effectivePixelRatio);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) resolve(nextBlob);
        else reject(new Error('Could not create PNG export'));
      }, 'image/png');
    });
    return {
      blob,
      width: canvas.width,
      height: canvas.height,
      pixelRatio: effectivePixelRatio,
    };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
};

const blobToPngDataUrl = (blob) => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    } catch (error) {
      reject(error);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('Could not load thumbnail'));
  };
  image.src = objectUrl;
});

const loadThumbnail = async (url) => {
  const response = await fetch(url, { credentials: 'include', cache: 'force-cache' });
  if (!response.ok) throw new Error(`Thumbnail request failed: ${response.status}`);
  return blobToPngDataUrl(await response.blob());
};

export const loadExportThumbnailDataUrls = async (scene, concurrency = 8) => {
  if (!scene?.showThumbnails) return new Map();
  const nodes = scene.nodes
    .map((item) => item.node)
    .filter((node) => node?.id && node?.thumbnailUrl);
  const result = new Map();
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, Math.max(nodes.length, 1)) }, async () => {
    while (cursor < nodes.length) {
      const node = nodes[cursor];
      cursor += 1;
      try {
        const dataUrl = await loadThumbnail(node.thumbnailUrl);
        result.set(node.id, dataUrl);
      } catch {
        // Export should still work if an individual thumbnail is stale or blocked.
      }
    }
  });

  await Promise.all(workers);
  return result;
};

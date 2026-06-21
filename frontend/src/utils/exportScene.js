import { computeLayout } from '../layout/computeLayout';
import { LAYOUT, getDepthColor } from './constants';
import { buildExpandedStackMap } from './treeUtils';
import { buildConnectorBezier } from './connectorGeometry';
import { isRealHttpErrorNode, isVirtualMissingNode } from './scanStatus';

export const EXPORT_MAP_PADDING = 200;
const HEADER_MIN_HEIGHT = 168;
const FOOTER_HEIGHT = 84;
const NODE_RADIUS = 12;
const NODE_TOP_BAR_HEIGHT = 12;
const NODE_THUMB_HEIGHT = 150;
const NODE_THUMB_TOP = 26;
const NODE_INSET = 14;
const MAX_PNG_DIMENSION = 16000;
const PDF_MAX_PAGE_SIDE = 14400;

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

const CONNECTION_COLOR_FALLBACKS = {
  userflow: '#7C3AED',
  crosslink: '#06B6D4',
  broken: '#EF4444',
};

const numberOrZero = (value) => {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
};

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(numberOrZero(value));

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

const getConnectionColor = (connection, connectionColors) => {
  const type = connection?.type || 'crosslink';
  if (connectionColors?.[type]) return connectionColors[type];
  return CONNECTION_COLOR_FALLBACKS[type] || CONNECTION_COLOR_FALLBACKS.crosslink;
};

const buildRelationshipConnectors = (layout, connections, connectionColors) => {
  const layoutNodes = layout?.nodes || new Map();
  const items = [];

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

    const geometry = buildConnectorBezier({
      start,
      end,
      sourceAnchor: anchors.sourceAnchor,
      targetAnchor: anchors.targetAnchor,
      useTerminalSegment: connection.type === 'userflow',
    });
    if (!geometry) return;

    items.push({
      id: connection.id || `export-connection-${index}`,
      type: connection.type,
      color: getConnectionColor(connection, connectionColors),
      dashed: connection.type === 'crosslink',
      arrow: connection.type === 'userflow',
      geometry,
    });
  });

  return items;
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
  if (isVirtualMissingNode(node)) badges.push({ label: 'Missing', color: '#F97316' });
  if (node?.isDuplicate) badges.push({ label: 'Duplicate', color: '#F59E0B' });
  if (node?.isBroken) badges.push({ label: 'Broken', color: '#EF4444' });
  if (isRealHttpErrorNode(node)) badges.push({ label: 'Error', color: '#EF4444' });
  if (node?.isInactive) badges.push({ label: 'Inactive', color: '#64748B' });
  if (node?.authRequired) badges.push({ label: 'Auth', color: '#7C3AED' });
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
  const relationshipConnectors = buildRelationshipConnectors(layout, connections, connectionColors);
  const mapBounds = getMapBounds(layout, relationshipConnectors);
  const mapWidth = Math.max(1, Math.ceil(mapBounds.maxX - mapBounds.minX));
  const mapHeight = Math.max(1, Math.ceil(mapBounds.maxY - mapBounds.minY));
  const insights = buildExportInsights(reportStats, reportTypeOptions);
  const width = Math.ceil(mapWidth + EXPORT_MAP_PADDING * 2);
  const insightColumns = clamp(Math.floor((width - EXPORT_MAP_PADDING * 2 + 24) / 184), 1, 4);
  const insightRows = Math.max(1, Math.ceil(insights.length / insightColumns));
  const headerHeight = HEADER_MIN_HEIGHT + Math.max(0, insightRows - 1) * 34;
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
      generatedAt: generatedAt instanceof Date ? generatedAt : new Date(generatedAt),
      insights,
      insightColumns,
    },
  };
};

const toSceneX = (scene, x) => x + scene.mapOffset.x;
const toSceneY = (scene, y) => y + scene.mapOffset.y;

const svgLine = ({ x1, y1, x2, y2, color = '#CBD5E1', width = 2, dash = '' }) => (
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${escapeAttr(color)}" stroke-width="${width}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
);

const renderVellicMarkSvg = (x, y, size) => {
  const inner = size * 0.18;
  return [
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.22}" fill="#635BFF"/>`,
    `<path d="M ${x + inner} ${y + inner} L ${x + size / 2} ${y + size - inner} L ${x + size - inner} ${y + inner} L ${x + size * 0.72} ${y + inner} L ${x + size / 2} ${y + size * 0.63} L ${x + size * 0.28} ${y + inner} Z" fill="#FFFFFF"/>`,
  ].join('');
};

const renderHeaderSvg = (scene) => {
  const x = scene.padding;
  const titleY = 54;
  const linkY = 88;
  const statsY = 118;
  const maxLinkChars = Math.max(20, Math.floor((scene.width - scene.padding * 2) / 8));

  const parts = [
    `<text x="${x}" y="${titleY}" fill="#111827" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="800">${escapeXml(scene.header.title)}</text>`,
  ];

  if (scene.header.shareUrl) {
    parts.push(`<text x="${x}" y="${linkY}" fill="#635BFF" font-family="Inter, Arial, sans-serif" font-size="15">${escapeXml(truncateText(scene.header.shareUrl, maxLinkChars))}</text>`);
  }

  scene.header.insights.forEach((insight, index) => {
    const columns = scene.header.insightColumns || 4;
    const col = index % columns;
    const row = Math.floor(index / columns);
    const chipX = x + col * 184;
    const chipY = statsY + row * 34;
    parts.push(`<rect x="${chipX}" y="${chipY}" width="160" height="26" rx="13" fill="#F8FAFC" stroke="#E2E8F0"/>`);
    parts.push(`<text x="${chipX + 12}" y="${chipY + 18}" fill="#475569" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700">${escapeXml(`${insight.label}: ${formatNumber(insight.value)}`)}</text>`);
  });

  return parts.join('');
};

const renderFooterSvg = (scene) => {
  const markSize = 28;
  const x = scene.padding;
  const y = scene.height - FOOTER_HEIGHT + 24;
  return [
    `<text x="${x}" y="${y + 19}" fill="#64748B" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="600">Created with</text>`,
    renderVellicMarkSvg(x + 92, y, markSize),
    `<text x="${x + 130}" y="${y + 20}" fill="#111827" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="800">Vellic</text>`,
  ].join('');
};

const renderTreeConnectorsSvg = (scene) => scene.treeConnectors.map((connector) => svgLine({
  x1: toSceneX(scene, connector.x1),
  y1: toSceneY(scene, connector.y1),
  x2: toSceneX(scene, connector.x2),
  y2: toSceneY(scene, connector.y2),
  color: '#CBD5E1',
  width: 2,
})).join('');

const renderRelationshipConnectorsSvg = (scene) => scene.relationshipConnectors.map((connector) => {
  const geometry = connector.geometry;
  const start = offsetPoint(geometry.startPos, scene.mapOffset);
  const ctrl1 = offsetPoint(geometry.ctrl1, scene.mapOffset);
  const ctrl2 = offsetPoint(geometry.ctrl2, scene.mapOffset);
  const pathEnd = offsetPoint(geometry.pathEnd, scene.mapOffset);
  const end = offsetPoint(geometry.endPos, scene.mapOffset);
  const path = `M ${start.x} ${start.y} C ${ctrl1.x} ${ctrl1.y}, ${ctrl2.x} ${ctrl2.y}, ${pathEnd.x} ${pathEnd.y}${geometry.terminalDistance ? ` L ${end.x} ${end.y}` : ''}`;
  return `<path d="${path}" fill="none" stroke="${escapeAttr(connector.color)}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"${connector.dashed ? ' stroke-dasharray="9 7"' : ''}${connector.arrow ? ' marker-end="url(#exportUserFlowArrow)"' : ''}/>`;
}).join('');

const renderNodeSvg = (scene, item, thumbnailDataUrls) => {
  const { node } = item;
  const x = toSceneX(scene, item.x);
  const y = toSceneY(scene, item.y);
  const depthColor = normalizeHexColor(getDepthColor(scene.colors, item.depth), '#14B8A6');
  const titleY = scene.showThumbnails ? y + 202 : y + 52;
  const titleLines = wrapText(node?.title || node?.url || 'Untitled', 28, scene.showThumbnails ? 2 : 3);
  const number = textValue(item.number || node?.number || node?.pageNumber);
  const thumbDataUrl = scene.showThumbnails ? thumbnailDataUrls?.get(node?.id) : null;
  const badges = getNodeBadges(node);
  const parts = [
    `<g data-export-node="${escapeAttr(node?.id || '')}">`,
    `<rect x="${x}" y="${y}" width="${item.w}" height="${item.h}" rx="${NODE_RADIUS}" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>`,
    `<path d="M ${x + NODE_RADIUS} ${y} H ${x + item.w - NODE_RADIUS} Q ${x + item.w} ${y} ${x + item.w} ${y + NODE_RADIUS} V ${y + NODE_TOP_BAR_HEIGHT} H ${x} V ${y + NODE_RADIUS} Q ${x} ${y} ${x + NODE_RADIUS} ${y} Z" fill="${escapeAttr(depthColor)}"/>`,
  ];

  if (thumbDataUrl) {
    const thumbX = x + NODE_INSET;
    const thumbY = y + NODE_THUMB_TOP;
    const thumbW = item.w - NODE_INSET * 2;
    const clipId = `thumb-${escapeAttr(node?.id || '')}`;
    parts.push(`<clipPath id="${clipId}"><rect x="${thumbX}" y="${thumbY}" width="${thumbW}" height="${NODE_THUMB_HEIGHT}" rx="8"/></clipPath>`);
    parts.push(`<image href="${escapeAttr(thumbDataUrl)}" x="${thumbX}" y="${thumbY}" width="${thumbW}" height="${NODE_THUMB_HEIGHT}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`);
  } else if (scene.showThumbnails) {
    parts.push(`<rect x="${x + NODE_INSET}" y="${y + NODE_THUMB_TOP}" width="${item.w - NODE_INSET * 2}" height="${NODE_THUMB_HEIGHT}" rx="8" fill="#F8FAFC" stroke="#E2E8F0"/>`);
  }

  titleLines.forEach((line, index) => {
    parts.push(`<text x="${x + NODE_INSET}" y="${titleY + index * 22}" fill="#1F2937" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="800">${escapeXml(line)}</text>`);
  });

  if (number) {
    parts.push(`<text x="${x + NODE_INSET}" y="${y + item.h - 20}" fill="#64748B" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800">${escapeXml(number)}</text>`);
  }

  let badgeX = x + item.w - NODE_INSET;
  badges.reverse().forEach((badge) => {
    const badgeWidth = clamp(badge.label.length * 7 + 18, 58, 94);
    badgeX -= badgeWidth;
    parts.push(`<rect x="${badgeX}" y="${y + item.h - 36}" width="${badgeWidth}" height="20" rx="10" fill="${escapeAttr(badge.color)}" opacity="0.12" stroke="${escapeAttr(badge.color)}" stroke-width="1"/>`);
    parts.push(`<text x="${badgeX + badgeWidth / 2}" y="${y + item.h - 22}" text-anchor="middle" fill="${escapeAttr(badge.color)}" font-family="Inter, Arial, sans-serif" font-size="9" font-weight="900">${escapeXml(badge.label.toUpperCase())}</text>`);
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
    '<marker id="exportUserFlowArrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">',
    '<path d="M 1 1 L 10 6 L 1 11" fill="none" stroke="#7C3AED" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    '</marker>',
    '</defs>',
    renderHeaderSvg(scene),
    renderTreeConnectorsSvg(scene),
    renderRelationshipConnectorsSvg(scene),
    scene.nodes.map((node) => renderNodeSvg(scene, node, thumbnailDataUrls)).join(''),
    renderFooterSvg(scene),
    '</svg>',
  ].join('');
};

const renderPdfTextLines = (pdf, lines, x, y, lineHeight, options = {}) => {
  lines.forEach((line, index) => {
    pdf.text(line, x, y + index * lineHeight, options);
  });
};

const drawVellicMarkPdf = (pdf, x, y, size) => {
  setPdfFill(pdf, '#635BFF');
  pdf.roundedRect(x, y, size, size, size * 0.22, size * 0.22, 'F');
  setPdfFill(pdf, '#FFFFFF');
  const inner = size * 0.18;
  const points = [
    [x + inner, y + inner],
    [x + size / 2, y + size - inner],
    [x + size - inner, y + inner],
    [x + size * 0.72, y + inner],
    [x + size / 2, y + size * 0.63],
    [x + size * 0.28, y + inner],
  ];
  pdf.triangle(points[0][0], points[0][1], points[1][0], points[1][1], points[5][0], points[5][1], 'F');
  pdf.triangle(points[2][0], points[2][1], points[1][0], points[1][1], points[3][0], points[3][1], 'F');
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
  pdf.setLineWidth(3 * scale);
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

const drawHeaderPdf = (pdf, scene, scale) => {
  const x = scene.padding * scale;
  const titleY = 54 * scale;
  const linkY = 88 * scale;
  const statsY = 118 * scale;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(30 * scale);
  setPdfFill(pdf, '#111827');
  pdf.text(scene.header.title, x, titleY, {
    maxWidth: Math.max(100, (scene.width - scene.padding * 2) * scale),
  });

  if (scene.header.shareUrl) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(15 * scale);
    setPdfFill(pdf, '#635BFF');
    const linkText = truncateText(scene.header.shareUrl, Math.max(20, Math.floor((scene.width - scene.padding * 2) / 8)));
    if (typeof pdf.textWithLink === 'function') {
      pdf.textWithLink(linkText, x, linkY, { url: scene.header.shareUrl });
    } else {
      pdf.text(linkText, x, linkY);
    }
  }

  scene.header.insights.forEach((insight, index) => {
    const columns = scene.header.insightColumns || 4;
    const col = index % columns;
    const row = Math.floor(index / columns);
    const chipX = x + col * 184 * scale;
    const chipY = statsY + row * 34 * scale;
    setPdfFill(pdf, '#F8FAFC');
    setPdfStroke(pdf, '#E2E8F0');
    pdf.roundedRect(chipX, chipY, 160 * scale, 26 * scale, 13 * scale, 13 * scale, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12 * scale);
    setPdfFill(pdf, '#475569');
    pdf.text(`${insight.label}: ${formatNumber(insight.value)}`, chipX + 12 * scale, chipY + 18 * scale);
  });
};

const drawFooterPdf = (pdf, scene, scale) => {
  const x = scene.padding * scale;
  const y = (scene.height - FOOTER_HEIGHT + 24) * scale;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13 * scale);
  setPdfFill(pdf, '#64748B');
  pdf.text('Created with', x, y + 19 * scale);
  drawVellicMarkPdf(pdf, x + 92 * scale, y, 28 * scale);
  pdf.setFontSize(18 * scale);
  setPdfFill(pdf, '#111827');
  pdf.text('Vellic', x + 130 * scale, y + 20 * scale);
};

const drawNodePdf = (pdf, scene, item, thumbnailDataUrls, scale) => {
  const node = item.node;
  const x = toSceneX(scene, item.x) * scale;
  const y = toSceneY(scene, item.y) * scale;
  const w = item.w * scale;
  const h = item.h * scale;
  const depthColor = normalizeHexColor(getDepthColor(scene.colors, item.depth), '#14B8A6');
  const inset = NODE_INSET * scale;

  setPdfFill(pdf, '#FFFFFF');
  setPdfStroke(pdf, '#E2E8F0');
  pdf.setLineWidth(2 * scale);
  pdf.roundedRect(x, y, w, h, NODE_RADIUS * scale, NODE_RADIUS * scale, 'FD');

  setPdfFill(pdf, depthColor);
  pdf.roundedRect(x, y, w, NODE_TOP_BAR_HEIGHT * scale, NODE_RADIUS * scale, NODE_RADIUS * scale, 'F');
  pdf.rect(x, y + NODE_TOP_BAR_HEIGHT * scale / 2, w, NODE_TOP_BAR_HEIGHT * scale / 2, 'F');

  const thumbDataUrl = scene.showThumbnails ? thumbnailDataUrls?.get(node?.id) : null;
  if (scene.showThumbnails) {
    const thumbX = x + inset;
    const thumbY = y + NODE_THUMB_TOP * scale;
    const thumbW = w - inset * 2;
    const thumbH = NODE_THUMB_HEIGHT * scale;
    if (thumbDataUrl) {
      try {
        pdf.addImage(thumbDataUrl, 'PNG', thumbX, thumbY, thumbW, thumbH);
      } catch {
        setPdfFill(pdf, '#F8FAFC');
        setPdfStroke(pdf, '#E2E8F0');
        pdf.roundedRect(thumbX, thumbY, thumbW, thumbH, 8 * scale, 8 * scale, 'FD');
      }
    } else {
      setPdfFill(pdf, '#F8FAFC');
      setPdfStroke(pdf, '#E2E8F0');
      pdf.roundedRect(thumbX, thumbY, thumbW, thumbH, 8 * scale, 8 * scale, 'FD');
    }
  }

  const titleY = (scene.showThumbnails ? y + 202 * scale : y + 52 * scale);
  const titleLines = wrapText(node?.title || node?.url || 'Untitled', 28, scene.showThumbnails ? 2 : 3);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17 * scale);
  setPdfFill(pdf, '#1F2937');
  renderPdfTextLines(pdf, titleLines, x + inset, titleY, 22 * scale, { maxWidth: w - inset * 2 });

  const number = textValue(item.number || node?.number || node?.pageNumber);
  if (number) {
    pdf.setFontSize(14 * scale);
    setPdfFill(pdf, '#64748B');
    pdf.text(number, x + inset, y + h - 20 * scale);
  }

  let badgeX = x + w - inset;
  getNodeBadges(node).reverse().forEach((badge) => {
    const badgeWidth = clamp(badge.label.length * 7 + 18, 58, 94) * scale;
    badgeX -= badgeWidth;
    setPdfFill(pdf, '#FFFFFF');
    setPdfStroke(pdf, badge.color);
    pdf.roundedRect(badgeX, y + h - 36 * scale, badgeWidth, 20 * scale, 10 * scale, 10 * scale, 'S');
    pdf.setFontSize(9 * scale);
    setPdfFill(pdf, badge.color);
    pdf.text(badge.label.toUpperCase(), badgeX + badgeWidth / 2, y + h - 22 * scale, { align: 'center' });
    badgeX -= 6 * scale;
  });
};

export const drawExportSceneToPdf = (pdf, scene, thumbnailDataUrls = new Map(), scale = 1) => {
  if (!pdf || !scene) return;
  drawHeaderPdf(pdf, scene, scale);

  setPdfStroke(pdf, '#CBD5E1');
  pdf.setLineWidth(2 * scale);
  scene.treeConnectors.forEach((connector) => drawPdfLine(pdf, scene, connector, scale));
  scene.relationshipConnectors.forEach((connector) => drawPdfRelationshipConnector(pdf, scene, connector, scale));
  scene.nodes.forEach((node) => drawNodePdf(pdf, scene, node, thumbnailDataUrls, scale));

  drawFooterPdf(pdf, scene, scale);
};

export const renderExportSceneToPngBlob = async (
  scene,
  thumbnailDataUrls = new Map(),
  options = {},
) => {
  const requestedPixelRatio = Number(options.pixelRatio || 3);
  const maxDimension = Number(options.maxDimension || MAX_PNG_DIMENSION);
  const ratioLimit = maxDimension / Math.max(scene.width, scene.height, 1);
  const effectivePixelRatio = Math.max(1, Math.min(requestedPixelRatio, ratioLimit));
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

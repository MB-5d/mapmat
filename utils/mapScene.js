const DEFAULT_LAYOUT = Object.freeze({
  NODE_W: 288,
  NODE_H_COLLAPSED: 200,
  NODE_H_THUMB: 262,
  GAP_X: 80,
  GAP_Y: 56,
  BUS_Y_GAP: 80,
  ORPHAN_GROUP_GAP: 160,
  ROOT_Y: 0,
});

const DEFAULT_OVERSCAN_PX = 1200;
const DEFAULT_VIEWPORT = Object.freeze({
  x: -DEFAULT_OVERSCAN_PX,
  y: -DEFAULT_OVERSCAN_PX,
  w: 2400,
  h: 2400,
});

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getNodeHeight(showThumbnails) {
  return showThumbnails ? DEFAULT_LAYOUT.NODE_H_THUMB : DEFAULT_LAYOUT.NODE_H_COLLAPSED;
}

function normalizeViewport(input = {}) {
  const x = toFiniteNumber(input.x, DEFAULT_VIEWPORT.x);
  const y = toFiniteNumber(input.y, DEFAULT_VIEWPORT.y);
  const w = Math.max(1, toFiniteNumber(input.w, DEFAULT_VIEWPORT.w));
  const h = Math.max(1, toFiniteNumber(input.h, DEFAULT_VIEWPORT.h));
  const zoom = Math.max(0.05, toFiniteNumber(input.zoom, 1));
  const overscan = Math.max(0, toFiniteNumber(input.overscan, DEFAULT_OVERSCAN_PX)) / zoom;
  return {
    minX: x - overscan,
    minY: y - overscan,
    maxX: x + w + overscan,
    maxY: y + h + overscan,
    x,
    y,
    w,
    h,
    zoom,
    overscan,
  };
}

function rectsIntersect(left, right) {
  if (!left || !right) return true;
  return left.minX <= right.maxX
    && left.maxX >= right.minX
    && left.minY <= right.maxY
    && left.maxY >= right.minY;
}

function getNodeBounds(node) {
  return {
    minX: node.x,
    minY: node.y,
    maxX: node.x + node.w,
    maxY: node.y + node.h,
  };
}

function getConnectorBounds(connector) {
  return {
    minX: Math.min(connector.x1, connector.x2),
    minY: Math.min(connector.y1, connector.y2),
    maxX: Math.max(connector.x1, connector.x2),
    maxY: Math.max(connector.y1, connector.y2),
  };
}

function getChildren(node) {
  return Array.isArray(node?.children) ? node.children.filter(Boolean) : [];
}

function countMapNodes(root, orphans = []) {
  const seen = new Set();
  let count = 0;
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    const id = String(node.id || '');
    if (id && seen.has(id)) return;
    if (id) seen.add(id);
    count += 1;
    getChildren(node).forEach(visit);
  };
  visit(root);
  (Array.isArray(orphans) ? orphans : []).forEach(visit);
  return count;
}

function computeSubtreeWidth(node, nodeWidth, gapX, cache) {
  if (!node) return nodeWidth;
  const cacheKey = node.id || node;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const children = getChildren(node);
  if (!children.length) {
    cache.set(cacheKey, nodeWidth);
    return nodeWidth;
  }
  const width = Math.max(
    nodeWidth,
    children.reduce((sum, child) => sum + computeSubtreeWidth(child, nodeWidth, gapX, cache), 0)
      + gapX * Math.max(0, children.length - 1)
  );
  cache.set(cacheKey, width);
  return width;
}

function computeSubtreeHeight(node, nodeHeight, gapY, cache) {
  if (!node) return nodeHeight;
  const cacheKey = node.id || node;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const children = getChildren(node);
  if (!children.length) {
    cache.set(cacheKey, nodeHeight);
    return nodeHeight;
  }
  const height = Math.max(
    nodeHeight,
    children.reduce((sum, child) => sum + computeSubtreeHeight(child, nodeHeight, gapY, cache), 0)
      + gapY * Math.max(0, children.length - 1)
  );
  cache.set(cacheKey, height);
  return height;
}

function addNode(nodes, node, x, y, depth, number, nodeHeight, extra = {}) {
  nodes.push({
    id: String(node.id || ''),
    x,
    y,
    w: DEFAULT_LAYOUT.NODE_W,
    h: nodeHeight,
    depth,
    number,
    node,
    ...extra,
  });
}

function computeVerticalLayout(root, orphans, showThumbnails) {
  const nodes = [];
  const connectors = [];
  const nodeW = DEFAULT_LAYOUT.NODE_W;
  const nodeH = getNodeHeight(showThumbnails);
  const gapX = DEFAULT_LAYOUT.GAP_X;
  const rowGap = DEFAULT_LAYOUT.BUS_Y_GAP;
  const treeGap = DEFAULT_LAYOUT.ORPHAN_GROUP_GAP;
  const widthCache = new Map();
  let cursorY = DEFAULT_LAYOUT.ROOT_Y;

  const layoutTree = (node, x, y, depth, number, extra = {}) => {
    const subtreeW = computeSubtreeWidth(node, nodeW, gapX, widthCache);
    const nodeX = x + (subtreeW - nodeW) / 2;
    addNode(nodes, node, nodeX, y, depth, number, nodeH, extra);
    const children = getChildren(node);
    if (!children.length) return { w: subtreeW, h: nodeH };

    const childY = y + nodeH + rowGap;
    let childCursorX = x;
    const parentCenterX = nodeX + nodeW / 2;
    const parentBottomY = y + nodeH;
    const childCenters = [];
    let maxChildH = 0;

    children.forEach((child, index) => {
      const childW = computeSubtreeWidth(child, nodeW, gapX, widthCache);
      const result = layoutTree(child, childCursorX, childY, depth + 1, `${number}.${index + 1}`, extra);
      childCenters.push({
        x: childCursorX + childW / 2,
        y: childY,
      });
      maxChildH = Math.max(maxChildH, result.h);
      childCursorX += childW + gapX;
    });

    const busY = parentBottomY + rowGap / 2;
    connectors.push({ x1: parentCenterX, y1: parentBottomY, x2: parentCenterX, y2: busY });
    if (childCenters.length > 1) {
      connectors.push({
        x1: childCenters[0].x,
        y1: busY,
        x2: childCenters[childCenters.length - 1].x,
        y2: busY,
      });
    }
    childCenters.forEach((center) => {
      connectors.push({ x1: center.x, y1: busY, x2: center.x, y2: center.y });
    });
    return { w: subtreeW, h: nodeH + rowGap + maxChildH };
  };

  if (root) {
    const main = layoutTree(root, 0, cursorY, 0, '0', { isOrphan: false });
    cursorY += main.h + treeGap;
  }

  (Array.isArray(orphans) ? orphans : []).filter(Boolean).forEach((orphan, index) => {
    const result = layoutTree(orphan, 0, cursorY, 0, `O${index + 1}`, {
      isOrphan: true,
      orphanType: orphan.orphanType || null,
      isSubdomainTree: !!orphan.subdomainRoot,
    });
    cursorY += result.h + treeGap;
  });

  return createLayoutResult(nodes, connectors);
}

function computeHorizontalLayout(root, orphans, showThumbnails) {
  const nodes = [];
  const connectors = [];
  const nodeW = DEFAULT_LAYOUT.NODE_W;
  const nodeH = getNodeHeight(showThumbnails);
  const gapX = Math.max(DEFAULT_LAYOUT.GAP_X, DEFAULT_LAYOUT.BUS_Y_GAP);
  const gapY = DEFAULT_LAYOUT.GAP_Y;
  const treeGap = DEFAULT_LAYOUT.ORPHAN_GROUP_GAP;
  const heightCache = new Map();
  let cursorY = DEFAULT_LAYOUT.ROOT_Y;

  const layoutTree = (node, x, y, depth, number, extra = {}) => {
    const subtreeH = computeSubtreeHeight(node, nodeH, gapY, heightCache);
    const nodeY = y + (subtreeH - nodeH) / 2;
    addNode(nodes, node, x, nodeY, depth, number, nodeH, extra);
    const children = getChildren(node);
    if (!children.length) return { w: nodeW, h: subtreeH };

    const childX = x + nodeW + gapX;
    let childCursorY = y;
    const parentCenterY = nodeY + nodeH / 2;
    const parentRightX = x + nodeW;
    const spineX = parentRightX + gapX / 2;
    const childCenters = [];
    let maxChildW = 0;

    children.forEach((child, index) => {
      const childH = computeSubtreeHeight(child, nodeH, gapY, heightCache);
      const result = layoutTree(child, childX, childCursorY, depth + 1, `${number}.${index + 1}`, extra);
      childCenters.push({
        x: childX,
        y: childCursorY + childH / 2,
      });
      maxChildW = Math.max(maxChildW, result.w);
      childCursorY += childH + gapY;
    });

    connectors.push({ x1: parentRightX, y1: parentCenterY, x2: spineX, y2: parentCenterY });
    if (childCenters.length) {
      connectors.push({
        x1: spineX,
        y1: Math.min(parentCenterY, childCenters[0].y),
        x2: spineX,
        y2: Math.max(parentCenterY, childCenters[childCenters.length - 1].y),
      });
    }
    childCenters.forEach((center) => {
      connectors.push({ x1: spineX, y1: center.y, x2: center.x, y2: center.y });
    });
    return { w: nodeW + gapX + maxChildW, h: subtreeH };
  };

  if (root) {
    const main = layoutTree(root, 0, cursorY, 0, '0', { isOrphan: false });
    cursorY += main.h + treeGap;
  }

  (Array.isArray(orphans) ? orphans : []).filter(Boolean).forEach((orphan, index) => {
    const result = layoutTree(orphan, 0, cursorY, 0, `O${index + 1}`, {
      isOrphan: true,
      orphanType: orphan.orphanType || null,
      isSubdomainTree: !!orphan.subdomainRoot,
    });
    cursorY += result.h + treeGap;
  });

  return createLayoutResult(nodes, connectors);
}

function createLayoutResult(nodes, connectors) {
  let maxX = DEFAULT_LAYOUT.NODE_W;
  let maxY = DEFAULT_LAYOUT.NODE_H_COLLAPSED;
  nodes.forEach((node) => {
    maxX = Math.max(maxX, node.x + node.w);
    maxY = Math.max(maxY, node.y + node.h);
  });
  return {
    nodes,
    connectors,
    bounds: {
      w: Math.ceil(maxX + 50),
      h: Math.ceil(maxY + 50),
    },
  };
}

function computeSceneLayout(root, orphans = [], {
  orientation = 'vertical',
  showThumbnails = true,
} = {}) {
  return orientation === 'horizontal'
    ? computeHorizontalLayout(root, orphans, showThumbnails)
    : computeVerticalLayout(root, orphans, showThumbnails);
}

function getThumbnailLod(zoom) {
  if (zoom < 0.25) return 'none';
  if (zoom < 0.65) return 'preview';
  return 'thumbnail';
}

function sanitizeSceneNode(layoutNode, { thumbnailLod = 'thumbnail' } = {}) {
  const node = layoutNode.node || {};
  const thumbnailUrl = thumbnailLod === 'none' ? '' : String(node.thumbnailUrl || '');
  const annotations = node.annotations && typeof node.annotations === 'object'
    ? {
      status: node.annotations.status || 'none',
      tags: Array.isArray(node.annotations.tags) ? node.annotations.tags.slice(0, 6) : [],
      note: typeof node.annotations.note === 'string' ? node.annotations.note.slice(0, 240) : '',
    }
    : {};
  return {
    id: layoutNode.id,
    title: node.title || node.label || node.url || 'Untitled',
    url: node.url || '',
    number: layoutNode.number,
    depth: layoutNode.depth,
    x: layoutNode.x,
    y: layoutNode.y,
    w: layoutNode.w,
    h: layoutNode.h,
    thumbnailUrl,
    thumbnailLod,
    annotations,
    comments: Array.isArray(node.comments) ? node.comments.slice(0, 20) : [],
    authRequired: !!node.authRequired,
    isBroken: !!node.isBroken,
    isInactive: !!node.isInactive,
    isFile: !!node.isFile,
    isError: !!node.isError,
    isViewableError: !!node.isViewableError,
    pageType: node.pageType || node.type || '',
    type: node.type || node.pageType || '',
    httpStatus: node.httpStatus ?? node.statusCode ?? null,
    statusCode: node.statusCode ?? node.httpStatus ?? null,
    scanStatus: node.scanStatus || node.status || '',
    thumbnailCaptureFailed: !!node.thumbnailCaptureFailed,
    thumbnailCaptureError: node.thumbnailCaptureError || '',
    isOrphan: !!layoutNode.isOrphan,
    orphanType: layoutNode.orphanType || node.orphanType || null,
  };
}

function buildMapScene({ root, orphans = [], viewport = {}, orientation = 'vertical', showThumbnails = true } = {}) {
  const normalizedViewport = normalizeViewport(viewport);
  const thumbnailLod = showThumbnails ? getThumbnailLod(normalizedViewport.zoom) : 'none';
  const layout = computeSceneLayout(root, orphans, { orientation, showThumbnails });
  const homeLayoutNode = layout.nodes.find((node) => !node.isOrphan && node.depth === 0)
    || layout.nodes[0]
    || null;
  const visibleNodes = layout.nodes
    .filter((node) => rectsIntersect(getNodeBounds(node), normalizedViewport))
    .map((node) => sanitizeSceneNode(node, { thumbnailLod }));
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const connectors = layout.connectors.filter((connector) => (
    rectsIntersect(getConnectorBounds(connector), normalizedViewport)
  ));

  return {
    bounds: layout.bounds,
    nodeCount: layout.nodes.length,
    visibleNodeCount: visibleNodes.length,
    connectorCount: layout.connectors.length,
    visibleConnectorCount: connectors.length,
    thumbnailLod,
    viewport: normalizedViewport,
    homeNode: homeLayoutNode ? sanitizeSceneNode(homeLayoutNode, { thumbnailLod: 'none' }) : null,
    nodes: visibleNodes,
    connectors,
    visibleNodeIds: Array.from(visibleNodeIds),
  };
}

module.exports = {
  DEFAULT_LAYOUT,
  buildMapScene,
  computeSceneLayout,
  countMapNodes,
  getThumbnailLod,
  normalizeViewport,
  rectsIntersect,
};

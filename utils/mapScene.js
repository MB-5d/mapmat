const DEFAULT_LAYOUT = Object.freeze({
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
  GAP_X: 80,
  GAP_Y: 56,
});

const STACK_THRESHOLD = 5;
const DEFAULT_OVERSCAN_PX = 1200;
const MINIMAP_OVERVIEW_NODE_LIMIT = 2500;
const MINIMAP_OVERVIEW_CONNECTOR_LIMIT = 2500;
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

function collectNodeAndDescendantIds(node, result = []) {
  if (!node || typeof node !== 'object') return result;
  const id = String(node.id || '').trim();
  if (id) result.push(id);
  getChildren(node).forEach((child) => collectNodeAndDescendantIds(child, result));
  return result;
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

const DEFAULT_SCAN_LAYER_AVAILABILITY = Object.freeze({
  placementPrimary: false,
  placementSubdomain: false,
  placementOrphan: false,
  typePages: false,
  typeFiles: false,
  statusMissing: false,
  statusBroken: false,
  statusError: false,
  statusInactive: false,
  statusAuth: false,
  statusDuplicate: false,
});

function normalizeDisplaySummary(summary = {}) {
  const availability = {};
  Object.keys(DEFAULT_SCAN_LAYER_AVAILABILITY).forEach((key) => {
    availability[key] = Boolean(summary?.scanLayerAvailability?.[key]);
  });
  return {
    maxDepth: Math.max(0, Number(summary?.maxDepth || 0)),
    scanLayerAvailability: availability,
    markerStatusValues: Array.from(new Set(
      (Array.isArray(summary?.markerStatusValues) ? summary.markerStatusValues : [])
        .map((value) => String(value || '').trim())
        .filter((value) => value && value !== 'none')
    )),
  };
}

function isTopLevelOrphanRootMeta(meta) {
  if (!meta || meta.depth !== 0) return false;
  if (meta.treeType === 'orphan' && meta.parentId === null) return true;
  return Boolean(meta.orphanType && meta.orphanType !== 'subdomain');
}

function getNodePlacementForSummary(meta) {
  if (!meta) return 'primary';
  if (meta.isSubdomainTree || meta.orphanType === 'subdomain' || meta.orphanStyle === 'subdomain') {
    return 'subdomain';
  }
  if (meta.treeType === 'subdomain') return 'subdomain';
  if (meta.isOrphan || meta.treeType === 'orphan' || (meta.orphanType && meta.orphanType !== 'subdomain')) {
    return 'orphan';
  }
  return 'primary';
}

function isVirtualMissingForSummary(node) {
  return Boolean(node?.isVirtualMissing || (
    node?.isMissing
    && !node?.httpStatus
    && !node?.statusCode
    && !node?.errorStatus
  ));
}

function getStatusFlagsForSummary(node, meta) {
  const isOrphanRoot = isTopLevelOrphanRootMeta(meta);
  return {
    missing: isVirtualMissingForSummary(node),
    broken: !isOrphanRoot && (node?.isBroken || meta?.orphanType === 'broken'),
    error: Boolean(node?.isError),
    inactive: Boolean(
      node?.scanStatus !== 'scan_limited'
      && !node?.isError
      && !node?.authRequired
      && (node?.isInactive || meta?.orphanType === 'inactive')
    ),
    auth: Boolean(node?.authRequired),
    duplicate: Boolean(node?.isDuplicate),
  };
}

function buildSummaryFromRecords(records = []) {
  let maxDepth = 0;
  const markerStatusValues = new Set();
  const scanLayerAvailability = { ...DEFAULT_SCAN_LAYER_AVAILABILITY };

  records.forEach(({ node, meta }) => {
    if (!node || !meta) return;
    maxDepth = Math.max(maxDepth, Number(meta.depth || 0));
    const placement = getNodePlacementForSummary(meta);
    const status = getStatusFlagsForSummary(node, meta);
    const annotationStatus = String(node?.annotations?.status || 'none').trim();

    if (placement === 'primary') scanLayerAvailability.placementPrimary = true;
    if (placement === 'subdomain') scanLayerAvailability.placementSubdomain = true;
    if (placement === 'orphan') scanLayerAvailability.placementOrphan = true;
    if (status.missing) scanLayerAvailability.statusMissing = true;
    if (status.broken) scanLayerAvailability.statusBroken = true;
    if (status.error) scanLayerAvailability.statusError = true;
    if (status.inactive) scanLayerAvailability.statusInactive = true;
    if (status.auth) scanLayerAvailability.statusAuth = true;
    if (status.duplicate) scanLayerAvailability.statusDuplicate = true;
    if (annotationStatus && annotationStatus !== 'none') markerStatusValues.add(annotationStatus);
  });

  return normalizeDisplaySummary({
    maxDepth,
    scanLayerAvailability,
    markerStatusValues: Array.from(markerStatusValues),
  });
}

function collectDisplaySummaryRecords(root, orphans = []) {
  const records = [];
  const visit = (node, meta) => {
    if (!node || typeof node !== 'object') return;
    records.push({ node, meta });
    getChildren(node).forEach((child) => {
      visit(child, {
        ...meta,
        parentId: node.id || null,
        depth: meta.depth + 1,
      });
    });
  };

  if (root) {
    visit(root, {
      treeType: 'root',
      parentId: null,
      depth: 0,
      isOrphan: false,
      orphanType: null,
      isSubdomainTree: false,
    });
  }

  (Array.isArray(orphans) ? orphans : []).filter(Boolean).forEach((orphan) => {
    const isSubdomainTree = Boolean(orphan.subdomainRoot || orphan.orphanType === 'subdomain');
    visit(orphan, {
      treeType: isSubdomainTree ? 'subdomain' : 'orphan',
      parentId: null,
      depth: 0,
      isOrphan: true,
      orphanType: orphan.orphanType || (isSubdomainTree ? 'subdomain' : 'orphan'),
      orphanStyle: isSubdomainTree ? 'subdomain' : 'root',
      isSubdomainTree,
    });
  });

  return records;
}

function buildMapDisplaySummary(root, orphans = []) {
  return buildSummaryFromRecords(collectDisplaySummaryRecords(root, orphans));
}

function shouldStackChildren(children, depth) {
  if (!children || children.length < STACK_THRESHOLD) return false;
  return depth >= 1;
}

function normalizeExpandedStacks(input) {
  const expanded = {};
  const addId = (value) => {
    const id = String(value || '').trim();
    if (id) expanded[id] = true;
  };

  if (typeof input === 'string') {
    input.split(',').forEach(addId);
  } else if (Array.isArray(input)) {
    input.forEach(addId);
  } else if (input && typeof input === 'object') {
    Object.entries(input).forEach(([id, value]) => {
      if (value) addId(id);
    });
  }

  return expanded;
}

function findStackParentsForNode(node, targetId, depth = 0) {
  if (!node || !targetId) return null;
  if (String(node.id || '') === targetId) return [];

  const children = getChildren(node);
  if (!children.length) return null;

  const shouldStack = shouldStackChildren(children, depth);
  for (const child of children) {
    const path = findStackParentsForNode(child, targetId, depth + 1);
    if (path) {
      return shouldStack && node.id ? [String(node.id), ...path] : path;
    }
  }

  return null;
}

function getTargetStackParents(root, orphans, targetNodeId) {
  const targetId = String(targetNodeId || '').trim();
  if (!targetId) return [];

  const rootPath = findStackParentsForNode(root, targetId, 0);
  if (rootPath) return rootPath;

  for (const orphan of Array.isArray(orphans) ? orphans : []) {
    const path = findStackParentsForNode(orphan, targetId, 0);
    if (path) return path;
  }

  return [];
}

function addNode(nodes, nodeById, node, x, y, depth, number, nodeHeight, extra = {}) {
  const layoutNode = {
    id: String(node.id || ''),
    x,
    y,
    w: DEFAULT_LAYOUT.NODE_W,
    h: nodeHeight,
    depth,
    number,
    node,
    ...extra,
  };
  nodes.push(layoutNode);
  if (layoutNode.id) nodeById.set(layoutNode.id, layoutNode);
  return layoutNode;
}

function computeHorizontalLayout(root, orphans, showThumbnails, expandedStacks = {}) {
  const nodes = [];
  const nodeById = new Map();
  const connectors = [];
  const NODE_H = getNodeHeight(showThumbnails);
  const {
    NODE_W,
    GAP_L1_X,
    GAP_STACK_Y,
    BUS_Y_GAP,
    ORPHAN_GROUP_GAP,
    ROOT_Y,
  } = DEFAULT_LAYOUT;
  const horizontalChildrenCache = new Map();
  const horizontalHeightCache = new Map();
  const horizontalDepthGap = Math.max(GAP_L1_X, BUS_Y_GAP);

  const setNode = (node, x, y, depth, number, extra = {}) => (
    addNode(nodes, nodeById, node, x, y, depth, number, NODE_H, extra)
  );

  const allOrphans = Array.isArray(orphans) ? orphans.filter(Boolean) : [];
  const subdomainOrphans = allOrphans.filter((orphan) => orphan.subdomainRoot);
  const regularOrphans = allOrphans.filter((orphan) => !orphan.subdomainRoot);

  const getHorizontalChildren = (node, depth) => {
    const cacheKey = node?.id;
    if (cacheKey && horizontalChildrenCache.has(cacheKey)) {
      return horizontalChildrenCache.get(cacheKey);
    }

    const children = getChildren(node);
    if (!children.length) {
      if (cacheKey) horizontalChildrenCache.set(cacheKey, []);
      return [];
    }

    const shouldStack = shouldStackChildren(children, depth);
    const isExpanded = !!expandedStacks[node.id];
    let result;
    if (shouldStack && !isExpanded) {
      const selectionIds = children.reduce((ids, child) => collectNodeAndDescendantIds(child, ids), []);
      result = [{
        child: children[0],
        stackInfo: {
          parentId: node.id,
          totalCount: children.length,
          collapsed: true,
          selectionIds,
        },
      }];
    } else {
      result = children.map((child, index) => ({
        child,
        stackInfo: shouldStack
          ? {
            parentId: node.id,
            totalCount: children.length,
            expanded: true,
            showCollapse: index === 0 || index === children.length - 1,
          }
          : null,
      }));
    }

    if (cacheKey) horizontalChildrenCache.set(cacheKey, result);
    return result;
  };

  const getHorizontalSubtreeHeight = (node, depth) => {
    if (node?.id && horizontalHeightCache.has(node.id)) {
      return horizontalHeightCache.get(node.id);
    }

    const children = getHorizontalChildren(node, depth);
    if (!children.length) {
      if (node?.id) horizontalHeightCache.set(node.id, NODE_H);
      return NODE_H;
    }

    const childHeight = children.reduce((sum, { child }) => (
      sum + getHorizontalSubtreeHeight(child, depth + 1)
    ), 0);
    const gaps = GAP_STACK_Y * Math.max(children.length - 1, 0);
    const height = Math.max(NODE_H, childHeight + gaps);
    if (node?.id) horizontalHeightCache.set(node.id, height);
    return height;
  };

  const layoutHorizontalNode = (
    node,
    x,
    subtreeY,
    depth,
    number,
    context = {},
    extra = {},
    childNumberFor = (parentNumber, childIndex) => `${parentNumber}.${childIndex + 1}`
  ) => {
    const subtreeH = getHorizontalSubtreeHeight(node, depth);
    const y = subtreeY + (subtreeH - NODE_H) / 2;
    setNode(node, x, y, depth, number, { ...context, ...extra });

    const children = getHorizontalChildren(node, depth);
    if (!children.length) return subtreeH;

    const childHeights = children.map(({ child }) => getHorizontalSubtreeHeight(child, depth + 1));
    const childGroupH = childHeights.reduce((sum, value) => sum + value, 0)
      + GAP_STACK_Y * Math.max(children.length - 1, 0);
    let childY = subtreeY + (subtreeH - childGroupH) / 2;
    const childX = x + NODE_W + horizontalDepthGap;
    const childPositions = [];

    children.forEach(({ child, stackInfo }, index) => {
      const childNumber = childNumberFor(number, index, depth);
      layoutHorizontalNode(
        child,
        childX,
        childY,
        depth + 1,
        childNumber,
        context,
        stackInfo ? { parentId: node.id, stackInfo } : { parentId: node.id },
        childNumberFor
      );

      const childLayout = nodeById.get(String(child.id || ''));
      if (childLayout) {
        childPositions.push({
          centerY: childLayout.y + NODE_H / 2,
        });
      }
      childY += childHeights[index] + GAP_STACK_Y;
    });

    if (childPositions.length) {
      const parentCenterY = y + NODE_H / 2;
      const parentRightX = x + NODE_W;
      const spineX = parentRightX + horizontalDepthGap / 2;
      const firstChildY = childPositions[0].centerY;
      const lastChildY = childPositions[childPositions.length - 1].centerY;

      connectors.push({
        type: 'horizontal-spine',
        x1: parentRightX,
        y1: parentCenterY,
        x2: spineX,
        y2: parentCenterY,
      });
      connectors.push({
        type: 'vertical-spine',
        x1: spineX,
        y1: Math.min(parentCenterY, firstChildY),
        x2: spineX,
        y2: Math.max(parentCenterY, lastChildY),
      });
      childPositions.forEach((position) => {
        connectors.push({
          type: 'horizontal-tick',
          x1: spineX,
          y1: position.centerY,
          x2: childX,
          y2: position.centerY,
        });
      });
    }

    return subtreeH;
  };

  const layoutHorizontalTree = (rootNode, startX, startY, rootNumber, extra = {}, childNumberFor) => {
    const context = {
      isSubdomainTree: extra.orphanType === 'subdomain' || extra.isSubdomainTree || false,
      orphanType: extra.orphanType || null,
    };
    return layoutHorizontalNode(
      rootNode,
      startX,
      startY,
      0,
      rootNumber,
      context,
      { ...extra, ...context },
      childNumberFor
    );
  };

  if (root) {
    let cursorY = ROOT_Y;
    const mainNumberFor = (parentNumber, childIndex, depth) => (
      depth === 0 ? `${childIndex + 1}` : `${parentNumber}.${childIndex + 1}`
    );
    const mainTreeHeight = layoutHorizontalTree(root, 0, cursorY, '0', { isOrphan: false }, mainNumberFor);
    cursorY += mainTreeHeight + ORPHAN_GROUP_GAP;

    const orderedSubdomains = [...subdomainOrphans].reverse();
    const subdomainCount = orderedSubdomains.length;
    orderedSubdomains.forEach((orphan, index) => {
      const treeHeight = layoutHorizontalTree(orphan, 0, cursorY, `s${subdomainCount - index}`, {
        isOrphan: true,
        orphanStyle: 'subdomain',
        orphanType: 'subdomain',
      });
      cursorY += treeHeight + ORPHAN_GROUP_GAP;
    });

    const orderedOrphans = [...regularOrphans].reverse();
    const orphanCount = orderedOrphans.length;
    orderedOrphans.forEach((orphan, index) => {
      const count = orphanCount - index;
      const treeHeight = layoutHorizontalTree(orphan, 0, cursorY, `0.${count}`, {
        isOrphan: true,
        orphanStyle: 'root',
        orphanType: orphan.orphanType || 'orphan',
      });
      cursorY += treeHeight + ORPHAN_GROUP_GAP;
    });
  }

  return createLayoutResult(nodes, connectors);
}

function computeVerticalLayout(root, orphans, showThumbnails, expandedStacks = {}) {
  const nodes = [];
  const nodeById = new Map();
  const connectors = [];
  const NODE_H = getNodeHeight(showThumbnails);
  const {
    NODE_W,
    GAP_L1_X,
    GAP_STACK_Y,
    INDENT_X,
    BUS_Y_GAP,
    ORPHAN_GROUP_GAP,
    STROKE_PAD_X,
    ROOT_Y,
  } = DEFAULT_LAYOUT;
  const BUS_MIDPOINT_RATIO = 0.5;
  const subtreeWidthCache = new Map();

  const setNode = (node, x, y, depth, number, extra = {}) => (
    addNode(nodes, nodeById, node, x, y, depth, number, NODE_H, extra)
  );

  const allOrphans = Array.isArray(orphans) ? orphans.filter(Boolean) : [];
  const subdomainOrphans = allOrphans.filter((orphan) => orphan.subdomainRoot);
  const regularOrphans = allOrphans.filter((orphan) => !orphan.subdomainRoot);

  const getSubtreeWidth = (node) => {
    const cacheKey = node?.id || node;
    if (cacheKey && subtreeWidthCache.has(cacheKey)) return subtreeWidthCache.get(cacheKey);

    const children = getChildren(node);
    if (!children.length) {
      if (cacheKey) subtreeWidthCache.set(cacheKey, NODE_W);
      return NODE_W;
    }

    const maxChildWidth = children.reduce((max, child) => (
      Math.max(max, getSubtreeWidth(child))
    ), 0);
    const width = Math.max(NODE_W, INDENT_X + maxChildWidth);
    if (cacheKey) subtreeWidthCache.set(cacheKey, width);
    return width;
  };

  const getRootTreeWidth = (node) => {
    const children = getChildren(node);
    if (!children.length) return NODE_W;
    const totalChildWidth = children.reduce((sum, child) => (
      sum + getSubtreeWidth(child)
    ), 0);
    const gaps = GAP_L1_X * Math.max(children.length - 1, 0);
    return Math.max(NODE_W, totalChildWidth + gaps);
  };

  const layoutVertical = (parentNode, parentDepth, numberPrefix, context = {}) => {
    const parentLayout = nodeById.get(String(parentNode.id || ''));
    if (!parentLayout) return NODE_H;

    const children = getChildren(parentNode);
    if (!children.length) return NODE_H;

    const shouldStack = shouldStackChildren(children, parentDepth);
    const isExpanded = !!expandedStacks[parentNode.id];
    const parentX = parentLayout.x;
    const parentY = parentLayout.y;
    const childX = parentX + INDENT_X;
    let cursorY = parentY + NODE_H + GAP_STACK_Y;

    if (shouldStack && !isExpanded) {
      const stackChild = children[0];
      if (!stackChild) return NODE_H;
      const childNumber = `${numberPrefix}.1`;
      const selectionIds = children.reduce((ids, child) => collectNodeAndDescendantIds(child, ids), []);
      setNode(stackChild, childX, cursorY, parentDepth + 1, childNumber, {
        ...context,
        parentId: parentNode.id,
        stackInfo: {
          parentId: parentNode.id,
          totalCount: children.length,
          collapsed: true,
          selectionIds,
        },
      });

      const spineX = parentX + STROKE_PAD_X;
      const tickY = cursorY + NODE_H / 2;
      connectors.push({
        type: 'vertical-spine',
        x1: spineX,
        y1: parentY + NODE_H,
        x2: spineX,
        y2: tickY,
      });
      connectors.push({
        type: 'horizontal-tick',
        x1: spineX,
        y1: tickY,
        x2: childX,
        y2: tickY,
      });

      cursorY += NODE_H + GAP_STACK_Y;
      return Math.max(NODE_H, cursorY - parentY - GAP_STACK_Y);
    }

    const childIdsInOrder = [];
    children.forEach((child, index) => {
      const childNumber = `${numberPrefix}.${index + 1}`;
      const stackInfo = shouldStack
        ? {
          parentId: parentNode.id,
          totalCount: children.length,
          expanded: true,
          showCollapse: index === 0 || index === children.length - 1,
        }
        : null;
      setNode(
        child,
        childX,
        cursorY,
        parentDepth + 1,
        childNumber,
        stackInfo ? { ...context, parentId: parentNode.id, stackInfo } : { ...context, parentId: parentNode.id }
      );

      childIdsInOrder.push(String(child.id || ''));
      const childSubtreeHeight = layoutVertical(child, parentDepth + 1, childNumber, context);
      cursorY += childSubtreeHeight + GAP_STACK_Y;
    });

    if (childIdsInOrder.length) {
      const spineX = parentX + STROKE_PAD_X;
      const spineStartY = parentY + NODE_H;
      const lastChild = nodeById.get(childIdsInOrder[childIdsInOrder.length - 1]);
      const spineEndY = lastChild ? lastChild.y + NODE_H / 2 : spineStartY;
      connectors.push({
        type: 'vertical-spine',
        x1: spineX,
        y1: spineStartY,
        x2: spineX,
        y2: spineEndY,
      });
      childIdsInOrder.forEach((childId) => {
        const childLayout = nodeById.get(childId);
        if (!childLayout) return;
        const tickY = childLayout.y + NODE_H / 2;
        connectors.push({
          type: 'horizontal-tick',
          x1: spineX,
          y1: tickY,
          x2: childLayout.x,
          y2: tickY,
        });
      });
    }

    return Math.max(NODE_H, cursorY - parentY - GAP_STACK_Y);
  };

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

    getChildren(rootNode).forEach((child, index) => {
      const childNumber = `${rootNumber}.${index + 1}`;
      setNode(child, level1X, level1Y, 1, childNumber, { ...context, parentId: rootNode.id });
      level1Positions.push({
        centerX: level1X + NODE_W / 2,
        id: child.id,
      });
      layoutVertical(child, 1, childNumber, context);
      level1X += getSubtreeWidth(child) + GAP_L1_X;
    });

    if (level1Positions.length) {
      const rootCenterX = startX + NODE_W / 2;
      const busY = rootBottomY + BUS_Y_GAP * BUS_MIDPOINT_RATIO;
      connectors.push({
        type: 'root-drop',
        x1: rootCenterX,
        y1: rootBottomY,
        x2: rootCenterX,
        y2: busY,
      });
      connectors.push({
        type: 'horizontal-bus',
        x1: Math.min(rootCenterX, level1Positions[0].centerX),
        y1: busY,
        x2: Math.max(rootCenterX, level1Positions[level1Positions.length - 1].centerX),
        y2: busY,
      });
      level1Positions.forEach((position) => {
        connectors.push({
          type: 'bus-drop',
          x1: position.centerX,
          y1: busY,
          x2: position.centerX,
          y2: level1Y,
        });
      });
    }

    return getRootTreeWidth(rootNode);
  };

  if (!root) return createLayoutResult(nodes, connectors);

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
  setNode(root, rootX, rootY, 0, '0', { isOrphan: false });

  const rootBottomY = rootY + NODE_H;
  const level1Y = rootBottomY + BUS_Y_GAP;
  const level1Positions = [];
  let level1X = rootX;

  getChildren(root).forEach((child, index) => {
    const childNumber = `${index + 1}`;
    setNode(child, level1X, level1Y, 1, childNumber, { parentId: root.id });
    level1Positions.push({
      centerX: level1X + NODE_W / 2,
      id: child.id,
    });
    layoutVertical(child, 1, childNumber);
    level1X += getSubtreeWidth(child) + GAP_L1_X;
  });

  if (level1Positions.length) {
    const rootCenterX = rootX + NODE_W / 2;
    const busY = rootBottomY + BUS_Y_GAP * BUS_MIDPOINT_RATIO;
    connectors.push({
      type: 'root-drop',
      x1: rootCenterX,
      y1: rootBottomY,
      x2: rootCenterX,
      y2: busY,
    });
    connectors.push({
      type: 'horizontal-bus',
      x1: Math.min(rootCenterX, level1Positions[0].centerX),
      y1: busY,
      x2: Math.max(rootCenterX, level1Positions[level1Positions.length - 1].centerX),
      y2: busY,
    });
    level1Positions.forEach((position) => {
      connectors.push({
        type: 'bus-drop',
        x1: position.centerX,
        y1: busY,
        x2: position.centerX,
        y2: level1Y,
      });
    });
  }

  let orphanX = 0;
  const orderedOrphans = [...regularOrphans].reverse();
  const orphanCount = orderedOrphans.length;
  orderedOrphans.forEach((orphan, index) => {
    const count = orphanCount - index;
    const treeWidth = layoutRootTree(orphan, orphanX, rootY, `0.${count}`, {
      isOrphan: true,
      orphanStyle: 'root',
      orphanType: orphan.orphanType || 'orphan',
    });
    orphanX += treeWidth + GAP_L1_X;
  });

  if (subdomainOrphans.length > 0) {
    let subdomainX = orphanTotalWidth > 0 ? orphanTotalWidth + GAP_L1_X : 0;
    const orderedSubdomains = [...subdomainOrphans].reverse();
    const subdomainCount = orderedSubdomains.length;
    orderedSubdomains.forEach((orphan, index) => {
      const treeWidth = layoutRootTree(orphan, subdomainX, rootY, `s${subdomainCount - index}`, {
        isOrphan: true,
        orphanStyle: 'subdomain',
        orphanType: 'subdomain',
      });
      subdomainX += treeWidth + GAP_L1_X;
    });
  }

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

function sampleArray(items, limit) {
  const source = Array.isArray(items) ? items : [];
  if (source.length <= limit) return source;
  const stride = Math.ceil(source.length / limit);
  return source.filter((_, index) => index === 0 || index % stride === 0).slice(0, limit);
}

function buildMinimapOverview(layout) {
  if (!layout) return null;
  const sampledNodes = sampleArray(layout.nodes, MINIMAP_OVERVIEW_NODE_LIMIT);
  const sampledConnectors = sampleArray(layout.connectors, MINIMAP_OVERVIEW_CONNECTOR_LIMIT);

  return {
    bounds: layout.bounds,
    nodeCount: layout.nodes.length,
    connectorCount: layout.connectors.length,
    sampled: sampledNodes.length < layout.nodes.length || sampledConnectors.length < layout.connectors.length,
    nodes: sampledNodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      w: node.w,
      h: node.h,
      depth: node.depth,
    })),
    connectors: sampledConnectors.map((connector, index) => ({
      id: connector.id || `${connector.type || 'connector'}-${index}`,
      x1: connector.x1,
      y1: connector.y1,
      x2: connector.x2,
      y2: connector.y2,
      type: connector.type || 'connector',
    })),
  };
}

function computeSceneLayout(root, orphans = [], {
  orientation = 'vertical',
  showThumbnails = true,
  expandedStacks = {},
} = {}) {
  return orientation === 'horizontal'
    ? computeHorizontalLayout(root, orphans, showThumbnails, expandedStacks)
    : computeVerticalLayout(root, orphans, showThumbnails, expandedStacks);
}

function getThumbnailLod(zoom) {
  if (zoom < 0.25) return 'none';
  if (zoom < 0.65) return 'preview';
  return 'thumbnail';
}

const LOW_ZOOM_THUMBNAIL_VISIBLE_NODE_LIMIT = 1600;

function resolveSceneThumbnailLod(requestedLod, { visibleNodeCount = 0 } = {}) {
  if (requestedLod !== 'none') return requestedLod;
  return visibleNodeCount <= LOW_ZOOM_THUMBNAIL_VISIBLE_NODE_LIMIT ? 'preview' : 'none';
}

function sanitizeSceneNode(layoutNode, { thumbnailLod = 'thumbnail' } = {}) {
  const node = layoutNode.node || {};
  const rawThumbnailUrl = String(node.thumbnailUrl || '');
  const thumbnailUrl = thumbnailLod === 'none' ? '' : rawThumbnailUrl;
  const annotations = node.annotations && typeof node.annotations === 'object'
    ? {
      status: node.annotations.status || 'none',
      tags: Array.isArray(node.annotations.tags) ? node.annotations.tags.slice(0, 6) : [],
      note: typeof node.annotations.note === 'string' ? node.annotations.note.slice(0, 240) : '',
    }
    : {};
  const stackInfo = layoutNode.stackInfo
    ? {
      ...layoutNode.stackInfo,
      selectionIds: Array.isArray(layoutNode.stackInfo.selectionIds)
        ? layoutNode.stackInfo.selectionIds.map((id) => String(id || '')).filter(Boolean)
        : undefined,
    }
    : null;
  return {
    id: layoutNode.id,
    title: node.title || node.label || node.url || 'Untitled',
    url: node.url || '',
    number: layoutNode.number,
    depth: layoutNode.depth,
    parentId: layoutNode.parentId || '',
    x: layoutNode.x,
    y: layoutNode.y,
    w: layoutNode.w,
    h: layoutNode.h,
    thumbnailUrl,
    hasThumbnail: !!rawThumbnailUrl,
    thumbnailLod,
    annotations,
    comments: Array.isArray(node.comments) ? node.comments.slice(0, 20) : [],
    authRequired: !!node.authRequired,
    isMissing: !!node.isMissing,
    isVirtualMissing: !!node.isVirtualMissing,
    isBroken: !!node.isBroken,
    isInactive: !!node.isInactive,
    isFile: !!node.isFile,
    isError: !!node.isError,
    isViewableError: !!node.isViewableError,
    isDuplicate: !!node.isDuplicate,
    duplicateOf: node.duplicateOf || '',
    pageType: node.pageType || node.type || '',
    type: node.type || node.pageType || '',
    httpStatus: node.httpStatus ?? node.statusCode ?? null,
    statusCode: node.statusCode ?? node.httpStatus ?? null,
    scanStatus: node.scanStatus || node.status || '',
    thumbnailCaptureFailed: !!node.thumbnailCaptureFailed,
    thumbnailCaptureError: node.thumbnailCaptureError || '',
    isOrphan: !!layoutNode.isOrphan,
    isSubdomainTree: !!layoutNode.isSubdomainTree,
    orphanStyle: layoutNode.orphanStyle || null,
    orphanType: layoutNode.orphanType || node.orphanType || null,
    stackInfo,
  };
}

function buildMapScene({
  root,
  orphans = [],
  viewport = {},
  orientation = 'vertical',
  showThumbnails = true,
  expandedStacks = {},
  targetNodeId = '',
  includeDisplaySummary = false,
} = {}) {
  const normalizedViewport = normalizeViewport(viewport);
  const requestedThumbnailLod = showThumbnails ? getThumbnailLod(normalizedViewport.zoom) : 'none';
  const targetId = String(targetNodeId || '').trim();
  const sceneExpandedStacks = normalizeExpandedStacks(expandedStacks);
  const targetStackParents = getTargetStackParents(root, orphans, targetId);
  targetStackParents.forEach((id) => {
    sceneExpandedStacks[id] = true;
  });
  const layout = computeSceneLayout(root, orphans, {
    orientation,
    showThumbnails,
    expandedStacks: sceneExpandedStacks,
  });
  const displaySummary = includeDisplaySummary ? buildMapDisplaySummary(root, orphans) : null;
  const homeLayoutNode = layout.nodes.find((node) => !node.isOrphan && node.depth === 0)
    || layout.nodes[0]
    || null;
  const visibleLayoutNodes = layout.nodes
    .filter((node) => rectsIntersect(getNodeBounds(node), normalizedViewport));
  const thumbnailLod = showThumbnails
    ? resolveSceneThumbnailLod(requestedThumbnailLod, {
      visibleNodeCount: visibleLayoutNodes.length,
    })
    : 'none';
  const visibleNodes = visibleLayoutNodes
    .map((node) => sanitizeSceneNode(node, { thumbnailLod }));
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const targetLayoutNode = targetId
    ? layout.nodes.find((node) => node.id === targetId)
    : null;
  const targetNode = targetLayoutNode
    ? sanitizeSceneNode(targetLayoutNode, { thumbnailLod })
    : null;
  if (targetNode && !visibleNodeIds.has(targetNode.id)) {
    visibleNodes.push(targetNode);
    visibleNodeIds.add(targetNode.id);
  }
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
    ...(displaySummary ? {
      displaySummary,
      minimap: buildMinimapOverview(layout),
    } : {}),
    homeNode: homeLayoutNode ? sanitizeSceneNode(homeLayoutNode, { thumbnailLod: 'none' }) : null,
    targetNode,
    expandedStackIds: Object.keys(sceneExpandedStacks).filter((id) => sceneExpandedStacks[id]),
    nodes: visibleNodes,
    connectors,
    visibleNodeIds: Array.from(visibleNodeIds),
  };
}

module.exports = {
  DEFAULT_LAYOUT,
  buildMapScene,
  buildMapDisplaySummary,
  buildMinimapOverview,
  computeSceneLayout,
  countMapNodes,
  collectNodeAndDescendantIds,
  getThumbnailLod,
  getTargetStackParents,
  normalizeViewport,
  rectsIntersect,
};

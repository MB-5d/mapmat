const DEFAULT_VIEWPORT_OVERSCAN_PX = 1200;

export const isDataImageUrl = (value) => (
  /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(String(value || '').trim())
);

export const expandRect = (rect, amount = 0) => {
  if (!rect) return null;
  const safeAmount = Math.max(0, Number(amount) || 0);
  return {
    minX: rect.minX - safeAmount,
    minY: rect.minY - safeAmount,
    maxX: rect.maxX + safeAmount,
    maxY: rect.maxY + safeAmount,
  };
};

export const rectsIntersect = (left, right) => {
  if (!left || !right) return true;
  return left.minX <= right.maxX
    && left.maxX >= right.minX
    && left.minY <= right.maxY
    && left.maxY >= right.minY;
};

export const getCanvasViewportWorldBounds = ({
  pan,
  scale,
  canvasSize,
  overscanPx = DEFAULT_VIEWPORT_OVERSCAN_PX,
} = {}) => {
  const safeScale = Number(scale);
  const width = Number(canvasSize?.width || 0);
  const height = Number(canvasSize?.height || 0);
  if (!Number.isFinite(safeScale) || safeScale <= 0 || width <= 0 || height <= 0) {
    return null;
  }

  const panX = Number(pan?.x || 0);
  const panY = Number(pan?.y || 0);
  const overscanWorld = Math.max(0, Number(overscanPx) || 0) / safeScale;
  return {
    minX: ((0 - panX) / safeScale) - overscanWorld,
    minY: ((0 - panY) / safeScale) - overscanWorld,
    maxX: ((width - panX) / safeScale) + overscanWorld,
    maxY: ((height - panY) / safeScale) + overscanWorld,
  };
};

export const getLayoutNodeBounds = (nodeData) => {
  if (!nodeData) return null;
  const x = Number(nodeData.x || 0);
  const y = Number(nodeData.y || 0);
  const w = Number(nodeData.w || 0);
  const h = Number(nodeData.h || 0);
  return {
    minX: x,
    minY: y,
    maxX: x + w,
    maxY: y + h,
  };
};

const toArray = (items) => {
  if (!items) return [];
  if (items instanceof Map) return Array.from(items.values());
  return Array.isArray(items) ? items : Array.from(items);
};

const normalizeIdSet = (ids) => {
  if (!ids) return new Set();
  if (ids instanceof Set) return ids;
  return new Set(Array.isArray(ids) ? ids : Array.from(ids));
};

export const filterVisibleLayoutNodes = (nodes, viewportBounds, {
  alwaysIncludeIds = [],
} = {}) => {
  const nodeList = toArray(nodes);
  if (!viewportBounds) return nodeList;
  const requiredIds = normalizeIdSet(alwaysIncludeIds);
  return nodeList.filter((nodeData) => {
    const nodeId = nodeData?.node?.id || nodeData?.id;
    return requiredIds.has(nodeId) || rectsIntersect(getLayoutNodeBounds(nodeData), viewportBounds);
  });
};

export const getLayoutConnectorBounds = (connector) => {
  if (!connector) return null;
  const x1 = Number(connector.x1 || 0);
  const y1 = Number(connector.y1 || 0);
  const x2 = Number(connector.x2 || 0);
  const y2 = Number(connector.y2 || 0);
  return {
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2),
  };
};

export const filterVisibleLayoutConnectors = (connectors, viewportBounds) => {
  const connectorList = Array.isArray(connectors) ? connectors : [];
  if (!viewportBounds) return connectorList;
  return connectorList.filter((connector) => (
    rectsIntersect(getLayoutConnectorBounds(connector), viewportBounds)
  ));
};

export const getConnectionEndpointIds = (connection = {}) => ({
  sourceId: connection.sourceNodeId || connection.sourceId || null,
  targetId: connection.targetNodeId || connection.targetId || null,
});

export const shouldRenderConnectionForVisibleNodes = (connection, visibleNodeIds) => {
  if (!visibleNodeIds) return true;
  const { sourceId, targetId } = getConnectionEndpointIds(connection);
  return visibleNodeIds.has(sourceId) || visibleNodeIds.has(targetId);
};

export const countVisibleThumbnails = (nodeDataList, showThumbnails) => {
  if (!showThumbnails) return 0;
  return toArray(nodeDataList).filter((nodeData) => !!nodeData?.node?.thumbnailUrl).length;
};

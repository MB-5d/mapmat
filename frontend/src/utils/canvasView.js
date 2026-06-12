export const getCenteredNodeTransform = (node, {
  canvasWidth,
  canvasHeight,
  scale = 1,
} = {}) => {
  const width = Number(canvasWidth);
  const height = Number(canvasHeight);
  const nextScale = Number(scale);
  if (
    !node
    || !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
    || !Number.isFinite(nextScale)
    || nextScale <= 0
  ) {
    return null;
  }

  return {
    scale: nextScale,
    x: width / 2 - (Number(node.x || 0) + Number(node.w || 0) / 2) * nextScale,
    y: height / 2 - (Number(node.y || 0) + Number(node.h || 0) / 2) * nextScale,
  };
};

const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);

export const getFitBoundsTransform = (bounds, {
  canvasWidth,
  canvasHeight,
  padding = 96,
  minScale = 0.05,
  maxScale = 1,
} = {}) => {
  const width = Number(canvasWidth);
  const height = Number(canvasHeight);
  const minX = Number(bounds?.minX);
  const minY = Number(bounds?.minY);
  const maxX = Number(bounds?.maxX);
  const maxY = Number(bounds?.maxY);
  const safeMinScale = Number.isFinite(Number(minScale)) ? Number(minScale) : 0.05;
  const safeMaxScale = Number.isFinite(Number(maxScale)) ? Number(maxScale) : 1;

  if (
    ![width, height, minX, minY, maxX, maxY].every(Number.isFinite)
    || width <= 0
    || height <= 0
    || maxX <= minX
    || maxY <= minY
    || safeMinScale <= 0
    || safeMaxScale <= 0
  ) {
    return null;
  }

  const safePadding = Math.max(0, Number(padding) || 0);
  const availableWidth = Math.max(1, width - safePadding * 2);
  const availableHeight = Math.max(1, height - safePadding * 2);
  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);
  const fitScale = Math.min(availableWidth / contentWidth, availableHeight / contentHeight);
  const scale = clampNumber(
    fitScale,
    Math.min(safeMinScale, safeMaxScale),
    Math.max(safeMinScale, safeMaxScale)
  );

  return {
    scale,
    x: (width - contentWidth * scale) / 2 - minX * scale,
    y: (height - contentHeight * scale) / 2 - minY * scale,
  };
};

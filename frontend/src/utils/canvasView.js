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

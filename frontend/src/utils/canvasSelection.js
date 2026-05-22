export const nodeIntersectsSelectionRect = (rect, node) => {
  if (!rect || !node) return false;
  const x = Number(node.x);
  const y = Number(node.y);
  const w = Number(node.w);
  const h = Number(node.h);
  if (![x, y, w, h].every(Number.isFinite)) return false;

  return rect.x <= x + w
    && rect.x + rect.w >= x
    && rect.y <= y + h
    && rect.y + rect.h >= y;
};

export const getViewportSelectionRectStyle = (rect, {
  pan = { x: 0, y: 0 },
  scale = 1,
} = {}) => {
  if (!rect) return null;
  const nextScale = Number(scale) || 1;
  return {
    left: rect.x * nextScale + Number(pan?.x || 0),
    top: rect.y * nextScale + Number(pan?.y || 0),
    width: rect.w * nextScale,
    height: rect.h * nextScale,
  };
};

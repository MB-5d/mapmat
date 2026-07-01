export const normalizeWorldBounds = (bounds) => {
  if (!bounds || typeof bounds !== 'object') return null;
  const minX = Number(bounds.minX);
  const minY = Number(bounds.minY);
  const maxX = Number(bounds.maxX);
  const maxY = Number(bounds.maxY);
  if ([minX, minY, maxX, maxY].every(Number.isFinite)) {
    return { minX, minY, maxX, maxY };
  }

  const x = Number.isFinite(Number(bounds.x)) ? Number(bounds.x) : 0;
  const y = Number.isFinite(Number(bounds.y)) ? Number(bounds.y) : 0;
  const w = Number(bounds.w ?? bounds.width);
  const h = Number(bounds.h ?? bounds.height);
  if (![w, h].every(Number.isFinite)) return null;
  return {
    minX: x,
    minY: y,
    maxX: x + Math.max(1, w),
    maxY: y + Math.max(1, h),
  };
};

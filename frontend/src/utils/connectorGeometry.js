const ANCHOR_NORMALS = Object.freeze({
  top: Object.freeze({ x: 0, y: -1 }),
  right: Object.freeze({ x: 1, y: 0 }),
  bottom: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
});

export const CONNECTOR_GEOMETRY = Object.freeze({
  curveRatio: 0.55,
  minCurveDistance: 32,
  maxCurveDistance: 112,
});

export const USER_FLOW_ARROWHEAD = Object.freeze({
  markerWidth: 12,
  markerHeight: 12,
  refX: 10,
  refY: 6,
  strokeWidth: 1.25,
  path: 'M 1 1 L 10 6 L 1 11',
});

const clampNumber = (value, min, max) => (
  Math.max(min, Math.min(max, value))
);

const formatPathNumber = (value) => {
  const rounded = Math.round(Number(value || 0) * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

export const getAnchorNormal = (anchor) => ANCHOR_NORMALS[anchor] || { x: 0, y: 0 };

export const inferFacingAnchor = (point, otherPoint) => {
  const dx = Number(otherPoint?.x || 0) - Number(point?.x || 0);
  const dy = Number(otherPoint?.y || 0) - Number(point?.y || 0);

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
};

export const resolveConnectorAnchors = ({
  start,
  end,
  sourceAnchor,
  targetAnchor,
}) => ({
  sourceAnchor: sourceAnchor || inferFacingAnchor(start, end),
  targetAnchor: targetAnchor || inferFacingAnchor(end, start),
});

export const getConnectorCurveDistance = ({
  from,
  toward,
  normal,
  curveRatio = CONNECTOR_GEOMETRY.curveRatio,
  minCurveDistance = CONNECTOR_GEOMETRY.minCurveDistance,
  maxCurveDistance = CONNECTOR_GEOMETRY.maxCurveDistance,
}) => {
  const dx = Number(toward?.x || 0) - Number(from?.x || 0);
  const dy = Number(toward?.y || 0) - Number(from?.y || 0);
  const span = Math.hypot(dx, dy);
  const forwardDistance = Math.max(0, dx * Number(normal?.x || 0) + dy * Number(normal?.y || 0));
  const rawDistance = (forwardDistance || span * 0.16) * curveRatio;
  const spanLimit = Math.max(minCurveDistance, span * 0.45);

  return clampNumber(rawDistance, minCurveDistance, Math.min(maxCurveDistance, spanLimit));
};

export const buildConnectorBezier = ({
  start,
  end,
  sourceAnchor,
  targetAnchor,
  sourceOffset,
  targetOffset,
  curveConfig,
}) => {
  if (!start || !end) return null;

  const startPos = {
    x: Number(start.x || 0) + Number(sourceOffset?.x || 0),
    y: Number(start.y || 0) + Number(sourceOffset?.y || 0),
  };
  const endPos = {
    x: Number(end.x || 0) + Number(targetOffset?.x || 0),
    y: Number(end.y || 0) + Number(targetOffset?.y || 0),
  };

  const resolvedAnchors = resolveConnectorAnchors({
    start: startPos,
    end: endPos,
    sourceAnchor,
    targetAnchor,
  });
  const sourceNormal = getAnchorNormal(resolvedAnchors.sourceAnchor);
  const targetNormal = getAnchorNormal(resolvedAnchors.targetAnchor);
  const sourceCurveDistance = getConnectorCurveDistance({
    from: startPos,
    toward: endPos,
    normal: sourceNormal,
    ...(curveConfig || CONNECTOR_GEOMETRY),
  });
  const targetCurveDistance = getConnectorCurveDistance({
    from: endPos,
    toward: startPos,
    normal: targetNormal,
    ...(curveConfig || CONNECTOR_GEOMETRY),
  });
  const ctrl1 = {
    x: startPos.x + sourceNormal.x * sourceCurveDistance,
    y: startPos.y + sourceNormal.y * sourceCurveDistance,
  };
  const ctrl2 = {
    x: endPos.x + targetNormal.x * targetCurveDistance,
    y: endPos.y + targetNormal.y * targetCurveDistance,
  };

  return {
    sourceAnchor: resolvedAnchors.sourceAnchor,
    targetAnchor: resolvedAnchors.targetAnchor,
    startPos,
    endPos,
    ctrl1,
    ctrl2,
    sourceCurveDistance,
    targetCurveDistance,
    path: `M ${formatPathNumber(startPos.x)} ${formatPathNumber(startPos.y)} C ${formatPathNumber(ctrl1.x)} ${formatPathNumber(ctrl1.y)}, ${formatPathNumber(ctrl2.x)} ${formatPathNumber(ctrl2.y)}, ${formatPathNumber(endPos.x)} ${formatPathNumber(endPos.y)}`,
  };
};

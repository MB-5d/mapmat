const ANCHOR_NORMALS = Object.freeze({
  top: Object.freeze({ x: 0, y: -1 }),
  right: Object.freeze({ x: 1, y: 0 }),
  bottom: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
});

export const CONNECTOR_GEOMETRY = Object.freeze({
  curveRatio: 0.5,
  minCurveDistance: 24,
  maxCurveDistance: 100,
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
  start,
  end,
  curveRatio = CONNECTOR_GEOMETRY.curveRatio,
  minCurveDistance = CONNECTOR_GEOMETRY.minCurveDistance,
  maxCurveDistance = CONNECTOR_GEOMETRY.maxCurveDistance,
}) => {
  const dx = Math.abs(Number(end?.x || 0) - Number(start?.x || 0));
  const dy = Math.abs(Number(end?.y || 0) - Number(start?.y || 0));
  return clampNumber(Math.max(dx, dy) * curveRatio, minCurveDistance, maxCurveDistance);
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
  const curveDistance = getConnectorCurveDistance({
    start: startPos,
    end: endPos,
    ...(curveConfig || CONNECTOR_GEOMETRY),
  });
  const sourceNormal = getAnchorNormal(resolvedAnchors.sourceAnchor);
  const targetNormal = getAnchorNormal(resolvedAnchors.targetAnchor);
  const ctrl1 = {
    x: startPos.x + sourceNormal.x * curveDistance,
    y: startPos.y + sourceNormal.y * curveDistance,
  };
  const ctrl2 = {
    x: endPos.x + targetNormal.x * curveDistance,
    y: endPos.y + targetNormal.y * curveDistance,
  };

  return {
    sourceAnchor: resolvedAnchors.sourceAnchor,
    targetAnchor: resolvedAnchors.targetAnchor,
    startPos,
    endPos,
    ctrl1,
    ctrl2,
    curveDistance,
    path: `M ${startPos.x} ${startPos.y} C ${ctrl1.x} ${ctrl1.y}, ${ctrl2.x} ${ctrl2.y}, ${endPos.x} ${endPos.y}`,
  };
};

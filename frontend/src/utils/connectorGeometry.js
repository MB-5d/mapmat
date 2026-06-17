const ANCHOR_NORMALS = Object.freeze({
  top: Object.freeze({ x: 0, y: -1 }),
  right: Object.freeze({ x: 1, y: 0 }),
  bottom: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
});

export const CONNECTOR_GEOMETRY = Object.freeze({
  endpointLeadDistance: 24,
  cornerRadius: 64,
  cornerRadiusUnit: 8,
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

const pointsEqual = (a, b) => (
  Math.abs(Number(a?.x || 0) - Number(b?.x || 0)) < 0.001
  && Math.abs(Number(a?.y || 0) - Number(b?.y || 0)) < 0.001
);

const uniqueSequentialPoints = (points) => points.reduce((unique, point) => {
  if (!unique.length || !pointsEqual(unique[unique.length - 1], point)) {
    unique.push(point);
  }
  return unique;
}, []);

const getDistance = (a, b) => Math.hypot(
  Number(b?.x || 0) - Number(a?.x || 0),
  Number(b?.y || 0) - Number(a?.y || 0),
);

const getUnitVector = (from, to) => {
  const distance = getDistance(from, to);
  if (!distance) return { x: 0, y: 0 };
  return {
    x: (Number(to?.x || 0) - Number(from?.x || 0)) / distance,
    y: (Number(to?.y || 0) - Number(from?.y || 0)) / distance,
  };
};

const areCollinear = (previous, current, next) => {
  const incoming = getUnitVector(previous, current);
  const outgoing = getUnitVector(current, next);
  return Math.abs(incoming.x - outgoing.x) < 0.001
    && Math.abs(incoming.y - outgoing.y) < 0.001;
};

const snapRadius = (value, unit) => {
  if (value <= 0) return 0;
  const snapped = Math.floor(value / unit) * unit;
  return snapped >= unit ? snapped : 0;
};

const getRoundedCornerRadius = ({
  previous,
  current,
  next,
  cornerRadius,
  cornerRadiusUnit,
}) => snapRadius(
  Math.min(cornerRadius, getDistance(previous, current) / 2, getDistance(current, next) / 2),
  cornerRadiusUnit,
);

const toPathPoint = (command, point) => `${command} ${formatPathNumber(point.x)} ${formatPathNumber(point.y)}`;

const buildRoundedOrthogonalPath = ({
  points,
  cornerRadius,
  cornerRadiusUnit,
}) => {
  const route = uniqueSequentialPoints(points);
  if (!route.length) return '';
  if (route.length === 1) return toPathPoint('M', route[0]);

  const commands = [toPathPoint('M', route[0])];

  for (let index = 1; index < route.length - 1; index += 1) {
    const previous = route[index - 1];
    const current = route[index];
    const next = route[index + 1];

    if (areCollinear(previous, current, next)) {
      commands.push(toPathPoint('L', current));
      continue;
    }

    const radius = getRoundedCornerRadius({
      previous,
      current,
      next,
      cornerRadius,
      cornerRadiusUnit,
    });

    if (!radius) {
      commands.push(toPathPoint('L', current));
      continue;
    }

    const incoming = getUnitVector(previous, current);
    const outgoing = getUnitVector(current, next);
    const cornerStart = {
      x: current.x - incoming.x * radius,
      y: current.y - incoming.y * radius,
    };
    const cornerEnd = {
      x: current.x + outgoing.x * radius,
      y: current.y + outgoing.y * radius,
    };

    commands.push(toPathPoint('L', cornerStart));
    commands.push(
      `Q ${formatPathNumber(current.x)} ${formatPathNumber(current.y)} ${formatPathNumber(cornerEnd.x)} ${formatPathNumber(cornerEnd.y)}`
    );
  }

  commands.push(toPathPoint('L', route[route.length - 1]));
  return commands.join(' ');
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

export const getConnectorLeadDistance = ({
  start,
  end,
  endpointLeadDistance = CONNECTOR_GEOMETRY.endpointLeadDistance,
}) => clampNumber(endpointLeadDistance, 0, Math.max(getDistance(start, end) / 3, 0));

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
  const endpointLeadDistance = getConnectorLeadDistance({
    start: startPos,
    end: endPos,
    ...(curveConfig || CONNECTOR_GEOMETRY),
  });
  const sourceNormal = getAnchorNormal(resolvedAnchors.sourceAnchor);
  const targetNormal = getAnchorNormal(resolvedAnchors.targetAnchor);
  const sourceHorizontal = Math.abs(sourceNormal.x) > 0;
  const targetHorizontal = Math.abs(targetNormal.x) > 0;
  const startLead = {
    x: startPos.x + sourceNormal.x * endpointLeadDistance,
    y: startPos.y + sourceNormal.y * endpointLeadDistance,
  };
  const endLead = {
    x: endPos.x + targetNormal.x * endpointLeadDistance,
    y: endPos.y + targetNormal.y * endpointLeadDistance,
  };
  let routePoints;

  if (sourceHorizontal && targetHorizontal) {
    const midX = (startLead.x + endLead.x) / 2;
    routePoints = [
      startPos,
      startLead,
      { x: midX, y: startLead.y },
      { x: midX, y: endLead.y },
      endLead,
      endPos,
    ];
  } else if (!sourceHorizontal && !targetHorizontal) {
    const midY = (startLead.y + endLead.y) / 2;
    routePoints = [
      startPos,
      startLead,
      { x: startLead.x, y: midY },
      { x: endLead.x, y: midY },
      endLead,
      endPos,
    ];
  } else if (sourceHorizontal) {
    routePoints = [
      startPos,
      startLead,
      { x: endLead.x, y: startLead.y },
      endLead,
      endPos,
    ];
  } else {
    routePoints = [
      startPos,
      startLead,
      { x: startLead.x, y: endLead.y },
      endLead,
      endPos,
    ];
  }

  const cornerRadius = Number(curveConfig?.cornerRadius ?? CONNECTOR_GEOMETRY.cornerRadius);
  const cornerRadiusUnit = Number(curveConfig?.cornerRadiusUnit ?? CONNECTOR_GEOMETRY.cornerRadiusUnit);

  return {
    sourceAnchor: resolvedAnchors.sourceAnchor,
    targetAnchor: resolvedAnchors.targetAnchor,
    startPos,
    endPos,
    startLead,
    endLead,
    routePoints,
    endpointLeadDistance,
    cornerRadius,
    path: buildRoundedOrthogonalPath({
      points: routePoints,
      cornerRadius,
      cornerRadiusUnit,
    }),
  };
};

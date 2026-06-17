import {
  buildConnectorBezier,
  CONNECTOR_GEOMETRY,
  getConnectorCurveDistance,
  getConnectorTerminalDistance,
  getReservedAnchorOffsetDistance,
} from './connectorGeometry';

describe('connectorGeometry', () => {
  test('builds identical path geometry for user flows and crosslinks with the same endpoints', () => {
    const flow = buildConnectorBezier({
      start: { x: 100, y: 120 },
      end: { x: 380, y: 220 },
      sourceAnchor: 'right',
      targetAnchor: 'left',
    });
    const crosslink = buildConnectorBezier({
      start: { x: 100, y: 120 },
      end: { x: 380, y: 220 },
      sourceAnchor: 'right',
      targetAnchor: 'left',
    });

    expect(flow).toEqual(crosslink);
  });

  test('keeps control handles aligned to each anchor normal', () => {
    const geometry = buildConnectorBezier({
      start: { x: 40, y: 180 },
      end: { x: 280, y: 320 },
      sourceAnchor: 'bottom',
      targetAnchor: 'left',
    });

    const sourceControlDistance = Math.hypot(
      geometry.ctrl1.x - geometry.startPos.x,
      geometry.ctrl1.y - geometry.startPos.y,
    );
    const targetControlDistance = Math.hypot(
      geometry.ctrl2.x - geometry.endPos.x,
      geometry.ctrl2.y - geometry.endPos.y,
    );

    expect(sourceControlDistance).toBeCloseTo(geometry.sourceCurveDistance, 5);
    expect(targetControlDistance).toBeCloseTo(geometry.targetCurveDistance, 5);
    expect(geometry.ctrl1.x).toBe(geometry.startPos.x);
    expect(geometry.ctrl2.y).toBe(geometry.endPos.y);
  });

  test('keeps crosslinks as one flowing cubic without inserted straight or orthogonal segments', () => {
    const geometry = buildConnectorBezier({
      start: { x: 100, y: 100 },
      end: { x: 380, y: 260 },
      sourceAnchor: 'right',
      targetAnchor: 'left',
    });

    expect(geometry.path).toBe(
      'M 100 100 C 212 100, 268 260, 380 260'
    );
    expect(geometry.path).not.toContain(' L ');
    expect(geometry.path).not.toContain(' Q ');
    expect(geometry.ctrl1.y).toBe(geometry.startPos.y);
    expect(geometry.ctrl2.y).toBe(geometry.endPos.y);
  });

  test('adds a short tangent-aligned terminal segment only for arrowed user flows', () => {
    const geometry = buildConnectorBezier({
      start: { x: 100, y: 100 },
      end: { x: 380, y: 260 },
      sourceAnchor: 'right',
      targetAnchor: 'left',
      useTerminalSegment: true,
    });

    expect(geometry.path).toBe(
      'M 100 100 C 212 100, 252 260, 364 260 L 380 260'
    );
    expect(geometry.pathEnd).toEqual({ x: 364, y: 260 });
    expect(geometry.terminalDistance).toBe(16);
    expect(geometry.ctrl2.y).toBe(geometry.pathEnd.y);
  });

  test('uses anchor-axis distance so handles do not overpull on tall narrow curves', () => {
    const distance = getConnectorCurveDistance({
      from: { x: 100, y: 100 },
      toward: { x: 220, y: 500 },
      normal: { x: 1, y: 0 },
    });

    expect(distance).toBe(66);
    expect(distance).toBeLessThan(CONNECTOR_GEOMETRY.maxCurveDistance);
  });

  test('caps terminal segment distance for very short arrowed paths', () => {
    expect(getConnectorTerminalDistance({
      start: { x: 0, y: 0 },
      end: { x: 40, y: 0 },
    })).toBe(8);
  });

  test('defines one shared gap size for relationship lines crossing map connectors', () => {
    expect(CONNECTOR_GEOMETRY.mapConnectorGapStrokeWidth).toBe(10);
  });

  test('reserved map connector anchor shifts one relationship line off center', () => {
    expect(getReservedAnchorOffsetDistance({
      connectionIndex: 0,
      connectionCount: 1,
      spacing: 16,
      hasReservedAnchor: true,
    })).toBe(-8);
  });

  test('reserved map connector anchor leaves two relationship lines on either side', () => {
    expect(getReservedAnchorOffsetDistance({
      connectionIndex: 0,
      connectionCount: 2,
      spacing: 16,
      hasReservedAnchor: true,
    })).toBe(-16);
    expect(getReservedAnchorOffsetDistance({
      connectionIndex: 1,
      connectionCount: 2,
      spacing: 16,
      hasReservedAnchor: true,
    })).toBe(16);
  });

  test('infers stable target anchors for provisional endpoints', () => {
    const horizontal = buildConnectorBezier({
      start: { x: 40, y: 40 },
      end: { x: 260, y: 60 },
      sourceAnchor: 'right',
    });
    const vertical = buildConnectorBezier({
      start: { x: 60, y: 40 },
      end: { x: 80, y: 260 },
      sourceAnchor: 'bottom',
    });

    expect(horizontal.targetAnchor).toBe('left');
    expect(vertical.targetAnchor).toBe('top');
  });
});

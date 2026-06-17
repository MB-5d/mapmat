import {
  buildConnectorBezier,
  CONNECTOR_GEOMETRY,
  getConnectorCurveDistance,
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

  test('applies the same curve distance from both terminal segments', () => {
    const geometry = buildConnectorBezier({
      start: { x: 40, y: 180 },
      end: { x: 280, y: 320 },
      sourceAnchor: 'bottom',
      targetAnchor: 'left',
    });

    const startCurveDistance = Math.hypot(
      geometry.ctrl1.x - geometry.curveStart.x,
      geometry.ctrl1.y - geometry.curveStart.y,
    );
    const endCurveDistance = Math.hypot(
      geometry.ctrl2.x - geometry.curveEnd.x,
      geometry.ctrl2.y - geometry.curveEnd.y,
    );

    expect(startCurveDistance).toBeCloseTo(geometry.curveDistance, 5);
    expect(endCurveDistance).toBeCloseTo(geometry.curveDistance, 5);
  });

  test('adds tangent-aligned straight segments at both anchors', () => {
    const geometry = buildConnectorBezier({
      start: { x: 100, y: 100 },
      end: { x: 320, y: 240 },
      sourceAnchor: 'right',
      targetAnchor: 'top',
    });

    expect(geometry.path).toBe(
      'M 100 100 L 124 100 C 224 100, 320 116, 320 216 L 320 240'
    );
    expect(geometry.curveStart).toEqual({ x: 124, y: 100 });
    expect(geometry.curveEnd).toEqual({ x: 320, y: 216 });
    expect(geometry.ctrl1.y).toBe(geometry.curveStart.y);
    expect(geometry.ctrl2.x).toBe(geometry.curveEnd.x);
  });

  test('clamps curve distance for short and long connectors', () => {
    expect(getConnectorCurveDistance({
      start: { x: 0, y: 0 },
      end: { x: 8, y: 4 },
    })).toBe(CONNECTOR_GEOMETRY.minCurveDistance);

    expect(getConnectorCurveDistance({
      start: { x: 0, y: 0 },
      end: { x: 1200, y: 40 },
    })).toBe(CONNECTOR_GEOMETRY.maxCurveDistance);
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

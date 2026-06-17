import {
  buildConnectorBezier,
  CONNECTOR_GEOMETRY,
  getConnectorLeadDistance,
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

  test('applies the same lead distance from both anchors', () => {
    const geometry = buildConnectorBezier({
      start: { x: 40, y: 180 },
      end: { x: 280, y: 320 },
      sourceAnchor: 'bottom',
      targetAnchor: 'left',
    });

    const startLeadDistance = Math.hypot(
      geometry.startLead.x - geometry.startPos.x,
      geometry.startLead.y - geometry.startPos.y,
    );
    const endLeadDistance = Math.hypot(
      geometry.endLead.x - geometry.endPos.x,
      geometry.endLead.y - geometry.endPos.y,
    );

    expect(startLeadDistance).toBeCloseTo(geometry.endpointLeadDistance, 5);
    expect(endLeadDistance).toBeCloseTo(geometry.endpointLeadDistance, 5);
  });

  test('builds a rounded orthogonal route with straight endpoint leads', () => {
    const geometry = buildConnectorBezier({
      start: { x: 100, y: 100 },
      end: { x: 380, y: 260 },
      sourceAnchor: 'right',
      targetAnchor: 'left',
    });

    expect(geometry.path).toBe(
      'M 100 100 L 124 100 L 184 100 Q 240 100 240 156 L 240 204 Q 240 260 296 260 L 356 260 L 380 260'
    );
    expect(geometry.startLead).toEqual({ x: 124, y: 100 });
    expect(geometry.endLead).toEqual({ x: 356, y: 260 });
    expect(geometry.routePoints).toEqual([
      { x: 100, y: 100 },
      { x: 124, y: 100 },
      { x: 240, y: 100 },
      { x: 240, y: 260 },
      { x: 356, y: 260 },
      { x: 380, y: 260 },
    ]);
  });

  test('caps lead distance for short connectors', () => {
    expect(getConnectorLeadDistance({
      start: { x: 0, y: 0 },
      end: { x: 24, y: 0 },
    })).toBe(8);

    expect(getConnectorLeadDistance({
      start: { x: 0, y: 0 },
      end: { x: 1200, y: 40 },
    })).toBe(CONNECTOR_GEOMETRY.endpointLeadDistance);
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

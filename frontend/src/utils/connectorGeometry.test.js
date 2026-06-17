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

  test('builds one flowing cubic without inserted straight or orthogonal segments', () => {
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

  test('uses anchor-axis distance so handles do not overpull on tall narrow curves', () => {
    const distance = getConnectorCurveDistance({
      from: { x: 100, y: 100 },
      toward: { x: 220, y: 500 },
      normal: { x: 1, y: 0 },
    });

    expect(distance).toBe(66);
    expect(distance).toBeLessThan(CONNECTOR_GEOMETRY.maxCurveDistance);
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

import { getCenteredNodeTransform, getFitBoundsTransform } from './canvasView';

describe('canvasView', () => {
  test('centers a node at 100 percent zoom', () => {
    expect(getCenteredNodeTransform(
      { x: 0, y: 0, w: 288, h: 200 },
      { canvasWidth: 1200, canvasHeight: 800, scale: 1 }
    )).toEqual({
      scale: 1,
      x: 456,
      y: 300,
    });
  });

  test('centers offset large-map nodes with the same math', () => {
    expect(getCenteredNodeTransform(
      { x: 5000, y: 2400, w: 288, h: 200 },
      { canvasWidth: 1600, canvasHeight: 900, scale: 1 }
    )).toEqual({
      scale: 1,
      x: -4344,
      y: -2050,
    });
  });

  test('fits wide bounds inside the canvas without zooming past maxScale', () => {
    const transform = getFitBoundsTransform(
      { minX: 0, minY: 0, maxX: 2000, maxY: 400 },
      { canvasWidth: 1000, canvasHeight: 600, padding: 100, maxScale: 1 }
    );

    expect(transform.scale).toBeCloseTo(0.4);
    expect(transform.x).toBeCloseTo(100);
    expect(transform.y).toBeCloseTo(220);
  });

  test('keeps small maps at maxScale and centers them', () => {
    expect(getFitBoundsTransform(
      { minX: 100, minY: 50, maxX: 388, maxY: 250 },
      { canvasWidth: 1280, canvasHeight: 720, padding: 96, maxScale: 1 }
    )).toEqual({
      scale: 1,
      x: 396,
      y: 210,
    });
  });

  test('does not center before the canvas has real dimensions', () => {
    expect(getCenteredNodeTransform(
      { x: 0, y: 0, w: 288, h: 200 },
      { canvasWidth: 0, canvasHeight: 800, scale: 1 }
    )).toBeNull();

    expect(getCenteredNodeTransform(
      { x: 0, y: 0, w: 288, h: 200 },
      { canvasWidth: 1200, canvasHeight: 0, scale: 1 }
    )).toBeNull();

    expect(getCenteredNodeTransform(
      { x: 0, y: 0, w: 288, h: 200 },
      { canvasWidth: 1200, canvasHeight: 800, scale: 0 }
    )).toBeNull();
  });
});

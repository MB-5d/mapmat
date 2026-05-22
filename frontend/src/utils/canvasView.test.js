import { getCenteredNodeTransform } from './canvasView';

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
});

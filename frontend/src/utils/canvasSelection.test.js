import {
  getViewportSelectionRectStyle,
  nodeIntersectsSelectionRect,
} from './canvasSelection';

describe('canvasSelection', () => {
  test('detects visible large-map nodes inside an area selection', () => {
    const rect = { x: 100, y: 100, w: 300, h: 240 };

    expect(nodeIntersectsSelectionRect(rect, {
      id: 'inside',
      x: 240,
      y: 180,
      w: 288,
      h: 200,
    })).toBe(true);

    expect(nodeIntersectsSelectionRect(rect, {
      id: 'outside',
      x: 620,
      y: 180,
      w: 288,
      h: 200,
    })).toBe(false);
  });

  test('converts a world-space selection box to large-map viewport coordinates', () => {
    expect(getViewportSelectionRectStyle(
      { x: 100, y: 200, w: 300, h: 400 },
      { pan: { x: 50, y: -25 }, scale: 0.5 }
    )).toEqual({
      left: 100,
      top: 75,
      width: 150,
      height: 200,
    });
  });
});

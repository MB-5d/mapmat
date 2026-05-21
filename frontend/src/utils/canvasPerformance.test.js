import {
  countVisibleThumbnails,
  filterVisibleLayoutConnectors,
  filterVisibleLayoutNodes,
  getCanvasViewportWorldBounds,
  isDataImageUrl,
  shouldRenderConnectionForVisibleNodes,
} from './canvasPerformance';

describe('canvas performance helpers', () => {
  test('converts the screen viewport to overscanned world bounds', () => {
    expect(getCanvasViewportWorldBounds({
      pan: { x: -200, y: -100 },
      scale: 2,
      canvasSize: { width: 800, height: 600 },
      overscanPx: 100,
    })).toEqual({
      minX: 50,
      minY: 0,
      maxX: 550,
      maxY: 400,
    });
  });

  test('filters layout nodes and preserves required active nodes', () => {
    const nodes = new Map([
      ['a', { node: { id: 'a' }, x: 0, y: 0, w: 100, h: 100 }],
      ['b', { node: { id: 'b' }, x: 1000, y: 1000, w: 100, h: 100 }],
      ['c', { node: { id: 'c' }, x: 2000, y: 2000, w: 100, h: 100 }],
    ]);

    const visible = filterVisibleLayoutNodes(nodes, {
      minX: -50,
      minY: -50,
      maxX: 200,
      maxY: 200,
    }, { alwaysIncludeIds: new Set(['b']) });

    expect(visible.map((entry) => entry.node.id)).toEqual(['a', 'b']);
  });

  test('filters layout connectors by bounds', () => {
    const connectors = [
      { x1: 0, y1: 0, x2: 50, y2: 50 },
      { x1: 900, y1: 900, x2: 950, y2: 950 },
    ];

    expect(filterVisibleLayoutConnectors(connectors, {
      minX: -100,
      minY: -100,
      maxX: 100,
      maxY: 100,
    })).toEqual([connectors[0]]);
  });

  test('filters relationship connectors by visible endpoints', () => {
    const visibleNodeIds = new Set(['source']);

    expect(shouldRenderConnectionForVisibleNodes({
      sourceNodeId: 'source',
      targetNodeId: 'target',
    }, visibleNodeIds)).toBe(true);
    expect(shouldRenderConnectionForVisibleNodes({
      sourceNodeId: 'hidden-a',
      targetNodeId: 'hidden-b',
    }, visibleNodeIds)).toBe(false);
    expect(shouldRenderConnectionForVisibleNodes({
      sourceNodeId: 'hidden-a',
      targetNodeId: 'hidden-b',
    }, new Set())).toBe(false);
    expect(shouldRenderConnectionForVisibleNodes({
      sourceNodeId: 'hidden-a',
      targetNodeId: 'hidden-b',
    }, null)).toBe(true);
  });

  test('detects inline image payloads and counts visible thumbnails', () => {
    expect(isDataImageUrl('data:image/png;base64,abc')).toBe(true);
    expect(isDataImageUrl('/screenshots/thumb.jpg')).toBe(false);
    expect(countVisibleThumbnails([
      { node: { thumbnailUrl: '/screenshots/a.jpg' } },
      { node: { thumbnailUrl: '' } },
    ], true)).toBe(1);
  });
});

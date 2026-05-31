import { __testing } from './App';

describe('large map viewport behavior', () => {
  test('auto-center key ignores image metadata and thumbnail visibility', () => {
    const baseKey = __testing.getLargeMapAutoCenterKey({
      mapId: 'map-1',
      orientation: 'vertical',
      mapUpdatedAt: '2026-05-22T01:00:00.000Z',
      showThumbnails: false,
    });

    expect(__testing.getLargeMapAutoCenterKey({
      mapId: 'map-1',
      orientation: 'vertical',
      mapUpdatedAt: '2026-05-22T01:05:00.000Z',
      showThumbnails: true,
    })).toBe(baseKey);

    expect(__testing.getLargeMapAutoCenterKey({
      mapId: 'map-1',
      orientation: 'horizontal',
      mapUpdatedAt: '2026-05-22T01:05:00.000Z',
      showThumbnails: true,
    })).not.toBe(baseKey);
  });

  test('large-map scene snapshots do not erase cached thumbnail assets', () => {
    const cached = {
      id: 'node-1',
      title: 'Cached node',
      thumbnailUrl: '/screenshots/node_thumb_v1.jpg',
      thumbnailFullUrl: '/screenshots/node_full_thumb_v1.jpg',
      fullScreenshotUrl: '/screenshots/node_full_v1.jpg',
      hasThumbnail: true,
    };
    const sceneNode = {
      id: 'node-1',
      title: 'Scene node',
      thumbnailUrl: '',
      hasThumbnail: true,
    };

    expect(__testing.mergeLargeMapNodeSnapshot(cached, sceneNode)).toMatchObject({
      id: 'node-1',
      title: 'Scene node',
      thumbnailUrl: '/screenshots/node_thumb_v1.jpg',
      thumbnailFullUrl: '/screenshots/node_full_thumb_v1.jpg',
      fullScreenshotUrl: '/screenshots/node_full_v1.jpg',
      hasThumbnail: true,
    });
  });

  test('large-map collapsed stack selection uses backend selection ids', () => {
    const node = {
      id: 'visible-stack-card',
      stackInfo: {
        collapsed: true,
        selectionIds: ['child-1', 'child-2', 'child-2'],
      },
    };

    expect(__testing.getLargeMapStackSelectionIdsFromNode(node)).toEqual(['child-1', 'child-2']);
    expect(__testing.getLargeMapStackSelectionIdsFromNode({ id: 'solo' })).toEqual(['solo']);
  });

  test('created-node reveal keeps the canvas still when the node is already visible', () => {
    expect(__testing.getPanToRevealLayoutNode({
      nodeData: { x: 100, y: 100, w: 288, h: 200 },
      viewportWidth: 1000,
      viewportHeight: 700,
      scale: 1,
      pan: { x: 0, y: 0 },
    })).toBeNull();
  });

  test('created-node reveal nudges only enough to show an offscreen duplicate', () => {
    expect(__testing.getPanToRevealLayoutNode({
      nodeData: { x: 820, y: 560, w: 288, h: 200 },
      viewportWidth: 1000,
      viewportHeight: 700,
      scale: 1,
      pan: { x: 0, y: 0 },
    })).toEqual({ x: -132, y: -84 });
  });
});

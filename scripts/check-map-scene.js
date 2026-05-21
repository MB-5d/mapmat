const assert = require('assert');
const {
  buildMapScene,
  countMapNodes,
  getThumbnailLod,
} = require('../utils/mapScene');

const root = {
  id: 'root',
  title: 'Root',
  url: 'https://example.com',
  thumbnailUrl: '/screenshots/root_thumb_v1.jpg',
  fullScreenshotUrl: '/screenshots/root_full_v1.jpg',
  children: Array.from({ length: 40 }, (_, index) => ({
    id: `child-${index}`,
    title: `Child ${index}`,
    url: `https://example.com/${index}`,
    thumbnailUrl: `/screenshots/child_${index}_thumb_v1.jpg`,
    fullScreenshotUrl: `/screenshots/child_${index}_full_v1.jpg`,
  })),
};

const scene = buildMapScene({
  root,
  orphans: [],
  viewport: { x: -200, y: -200, w: 1000, h: 800, zoom: 1 },
  showThumbnails: true,
});

assert.strictEqual(countMapNodes(root), 41);
assert(scene.nodeCount >= 41);
assert(scene.visibleNodeCount > 0);
assert(scene.nodes.every((node) => !Object.prototype.hasOwnProperty.call(node, 'fullScreenshotUrl')));
assert(scene.nodes.every((node) => !Object.prototype.hasOwnProperty.call(node, 'thumbnailFullUrl')));
assert(scene.nodes.some((node) => node.thumbnailUrl));
assert.strictEqual(getThumbnailLod(0.1), 'none');
assert.strictEqual(getThumbnailLod(0.4), 'preview');
assert.strictEqual(getThumbnailLod(1), 'thumbnail');

const farOutScene = buildMapScene({
  root,
  viewport: { x: -200, y: -200, w: 1000, h: 800, zoom: 0.1 },
  showThumbnails: true,
});
assert(farOutScene.nodes.every((node) => node.thumbnailUrl === ''));

const noThumbnailScene = buildMapScene({
  root,
  viewport: { x: -200, y: -200, w: 1000, h: 800, zoom: 1 },
  showThumbnails: false,
});
assert(noThumbnailScene.nodes.every((node) => node.thumbnailUrl === ''));

const largeRoot = {
  id: 'large-root',
  title: 'Large Root',
  children: Array.from({ length: 100 }, (_, parentIndex) => ({
    id: `large-parent-${parentIndex}`,
    title: `Parent ${parentIndex}`,
    children: Array.from({ length: 50 }, (_, childIndex) => ({
      id: `large-child-${parentIndex}-${childIndex}`,
      title: `Child ${parentIndex}-${childIndex}`,
      thumbnailUrl: `/screenshots/large_${parentIndex}_${childIndex}_thumb_v1.jpg`,
      fullScreenshotUrl: `/screenshots/large_${parentIndex}_${childIndex}_full_v1.jpg`,
    })),
  })),
};

const largeScene = buildMapScene({
  root: largeRoot,
  viewport: { x: 0, y: 0, w: 1440, h: 900, zoom: 0.75 },
  showThumbnails: true,
});
assert.strictEqual(countMapNodes(largeRoot), 5101);
assert(largeScene.visibleNodeCount < largeScene.nodeCount);
assert(largeScene.nodes.every((node) => !Object.prototype.hasOwnProperty.call(node, 'fullScreenshotUrl')));

console.log('map scene checks passed');

const assert = require('assert');
const {
  DEFAULT_LAYOUT,
  buildMapScene,
  computeSceneLayout,
  countMapNodes,
  getThumbnailLod,
  getTargetStackParents,
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
assert(scene.homeNode, 'scene should include home node position for initial centering');
assert.strictEqual(scene.homeNode.id, 'root');
assert(scene.nodes.every((node) => !Object.prototype.hasOwnProperty.call(node, 'fullScreenshotUrl')));
assert(scene.nodes.every((node) => !Object.prototype.hasOwnProperty.call(node, 'thumbnailFullUrl')));
assert(scene.nodes.some((node) => node.thumbnailUrl));
assert(scene.nodes.some((node) => node.hasThumbnail === true));
assert.strictEqual(getThumbnailLod(0.1), 'none');
assert.strictEqual(getThumbnailLod(0.4), 'preview');
assert.strictEqual(getThumbnailLod(1), 'thumbnail');

const normalLayout = computeSceneLayout(root, [], { showThumbnails: true });
const normalNodes = new Map(normalLayout.nodes.map((node) => [node.id, node]));
assert.strictEqual(normalNodes.get('root').x, 0);
assert.strictEqual(normalNodes.get('child-0').number, '1');
assert.strictEqual(normalNodes.get('child-0').x, 0);
assert.strictEqual(normalNodes.get('child-0').y, DEFAULT_LAYOUT.NODE_H_THUMB + DEFAULT_LAYOUT.BUS_Y_GAP);
assert.strictEqual(normalNodes.get('child-1').x, DEFAULT_LAYOUT.NODE_W + DEFAULT_LAYOUT.GAP_L1_X);

const branchRoot = {
  id: 'branch-root',
  title: 'Branch Root',
  children: [
    {
      id: 'branch-a',
      title: 'Branch A',
      children: [{ id: 'branch-a-1', title: 'Branch A.1' }],
    },
    { id: 'branch-b', title: 'Branch B' },
  ],
};
const branchLayout = computeSceneLayout(branchRoot, [], { showThumbnails: false });
const branchNodes = new Map(branchLayout.nodes.map((node) => [node.id, node]));
assert.strictEqual(branchNodes.get('branch-root').x, 0);
assert.strictEqual(branchNodes.get('branch-a').x, 0);
assert.strictEqual(branchNodes.get('branch-a').y, DEFAULT_LAYOUT.NODE_H_COLLAPSED + DEFAULT_LAYOUT.BUS_Y_GAP);
assert.strictEqual(branchNodes.get('branch-a-1').x, DEFAULT_LAYOUT.INDENT_X);
assert.strictEqual(
  branchNodes.get('branch-a-1').y,
  DEFAULT_LAYOUT.NODE_H_COLLAPSED + DEFAULT_LAYOUT.BUS_Y_GAP
    + DEFAULT_LAYOUT.NODE_H_COLLAPSED + DEFAULT_LAYOUT.GAP_STACK_Y
);

const farOutScene = buildMapScene({
  root,
  viewport: { x: -200, y: -200, w: 1000, h: 800, zoom: 0.1 },
  showThumbnails: true,
});
assert.strictEqual(farOutScene.thumbnailLod, 'preview');
assert(farOutScene.nodes.some((node) => node.thumbnailUrl));
assert(farOutScene.nodes.some((node) => node.hasThumbnail === true));

const noThumbnailScene = buildMapScene({
  root,
  viewport: { x: -200, y: -200, w: 1000, h: 800, zoom: 1 },
  showThumbnails: false,
});
assert(noThumbnailScene.nodes.every((node) => node.thumbnailUrl === ''));
assert(noThumbnailScene.nodes.some((node) => node.hasThumbnail === true));

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
assert(largeScene.nodeCount < countMapNodes(largeRoot));
assert(largeScene.visibleNodeCount < largeScene.nodeCount);
assert(largeScene.homeNode, 'large scenes should include home node even when viewport is sparse');
assert.strictEqual(largeScene.homeNode.id, 'large-root');
assert(largeScene.nodes.every((node) => !Object.prototype.hasOwnProperty.call(node, 'fullScreenshotUrl')));

const largeLayout = computeSceneLayout(largeRoot, [], { showThumbnails: false });
const largeNodes = new Map(largeLayout.nodes.map((node) => [node.id, node]));
assert.strictEqual(largeNodes.get('large-root').x, 0);
assert.strictEqual(largeNodes.get('large-parent-0').number, '1');
assert.strictEqual(largeNodes.get('large-parent-0').x, 0);
assert.strictEqual(largeNodes.get('large-child-0-0').x, DEFAULT_LAYOUT.INDENT_X);
assert.strictEqual(largeNodes.get('large-child-0-0').stackInfo.collapsed, true);
const stackedSceneChild = largeScene.nodes.find((node) => node.id === 'large-child-0-0');
assert(stackedSceneChild?.stackInfo?.collapsed, 'scene nodes should preserve collapsed stack metadata');
assert(stackedSceneChild.stackInfo.selectionIds.includes('large-child-0-49'));

const crowdedRoot = {
  id: 'crowded-root',
  title: 'Crowded Root',
  children: Array.from({ length: 1000 }, (_, index) => ({
    id: `crowded-child-${index}`,
    title: `Crowded Child ${index}`,
    thumbnailUrl: `/screenshots/crowded_${index}_thumb_v1.jpg`,
  })),
};
const crowdedFarOutScene = buildMapScene({
  root: crowdedRoot,
  viewport: { x: -10000, y: -10000, w: 400000, h: 50000, zoom: 0.1 },
  showThumbnails: true,
});
assert(crowdedFarOutScene.visibleNodeCount <= 1600, 'moderately crowded low-zoom scene should stay within thumbnail URL limit');
assert.strictEqual(crowdedFarOutScene.thumbnailLod, 'preview');
assert(crowdedFarOutScene.nodes.some((node) => node.thumbnailUrl));
assert.strictEqual(stackedSceneChild.stackInfo.selectionIds.length, 50);

const veryCrowdedRoot = {
  id: 'very-crowded-root',
  title: 'Very Crowded Root',
  children: Array.from({ length: 1700 }, (_, index) => ({
    id: `very-crowded-child-${index}`,
    title: `Very Crowded Child ${index}`,
    thumbnailUrl: `/screenshots/very_crowded_${index}_thumb_v1.jpg`,
  })),
};
const veryCrowdedFarOutScene = buildMapScene({
  root: veryCrowdedRoot,
  viewport: { x: -10000, y: -10000, w: 1000000, h: 50000, zoom: 0.1 },
  showThumbnails: true,
});
assert(veryCrowdedFarOutScene.visibleNodeCount > 1600, 'very crowded low-zoom scene should exceed thumbnail URL limit');
assert.strictEqual(veryCrowdedFarOutScene.thumbnailLod, 'none');
assert(veryCrowdedFarOutScene.nodes.every((node) => node.thumbnailUrl === ''));

const expandedLayout = computeSceneLayout(largeRoot, [], {
  showThumbnails: false,
  expandedStacks: { 'large-parent-0': true },
});
const expandedNodes = new Map(expandedLayout.nodes.map((node) => [node.id, node]));
assert(expandedNodes.has('large-child-0-49'), 'expanded stacks should expose hidden siblings');
assert.strictEqual(expandedNodes.get('large-child-0-0').stackInfo.showCollapse, true);
assert.strictEqual(expandedNodes.get('large-child-0-49').stackInfo.showCollapse, true);

const targetStackParents = getTargetStackParents(largeRoot, [], 'large-child-0-49');
assert.deepStrictEqual(targetStackParents, ['large-parent-0']);

const targetScene = buildMapScene({
  root: largeRoot,
  viewport: { x: -500000, y: -500000, w: 500, h: 500, zoom: 1 },
  targetNodeId: 'large-child-0-49',
  showThumbnails: false,
});
assert(targetScene.expandedStackIds.includes('large-parent-0'));
assert(targetScene.targetNode, 'target scene should expose the requested hidden stack child');
assert.strictEqual(targetScene.targetNode.id, 'large-child-0-49');
assert(targetScene.nodes.some((node) => node.id === 'large-child-0-49'));

const emptyViewportScene = buildMapScene({
  root: largeRoot,
  viewport: { x: -500000, y: -500000, w: 500, h: 500, zoom: 1 },
  showThumbnails: true,
});
assert.strictEqual(emptyViewportScene.visibleNodeCount, 0);
assert(emptyViewportScene.homeNode, 'empty viewport scene should still expose home node for centering');
assert.strictEqual(emptyViewportScene.homeNode.id, 'large-root');

console.log('map scene checks passed');

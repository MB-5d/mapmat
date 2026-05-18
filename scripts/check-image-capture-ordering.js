#!/usr/bin/env node

const assert = require('assert');
const {
  TREE_TYPES,
  collectImageCaptureRecords,
  buildImageCapturePhases,
} = require('../utils/imageCapturePlan');

function node(id, children = [], extra = {}) {
  return {
    id,
    url: `https://example.com/${id}`,
    title: id,
    children,
    ...extra,
  };
}

function makeWideTree(prefix, firstLevelCount, secondLevelCount) {
  return node(prefix, Array.from({ length: firstLevelCount }, (_, levelOneIndex) => (
    node(`${prefix}-${levelOneIndex}`, Array.from({ length: secondLevelCount }, (_, levelTwoIndex) => (
      node(`${prefix}-${levelOneIndex}-${levelTwoIndex}`)
    )))
  )));
}

const root = makeWideTree('main', 40, 22); // 921 main records
const subdomains = [
  makeWideTree('sub-a', 4, 4),
  makeWideTree('sub-b', 3, 5),
].map((tree) => ({ ...tree, orphanType: 'subdomain', subdomainRoot: true }));
const orphans = [
  node('orphan-a', [node('orphan-a-1'), node('orphan-a-2')], { orphanType: 'orphan' }),
  node('orphan-b', [node('orphan-b-1')], { orphanType: 'orphan' }),
];

const records = collectImageCaptureRecords(root, [...orphans.slice(0, 1), ...subdomains, ...orphans.slice(1)]);
const phases = buildImageCapturePhases(records);
const flattened = phases.flatMap((phase) => phase.records);

assert(records.length > 900, `expected 900+ records, got ${records.length}`);
assert.deepStrictEqual(flattened.map((record) => record.nodeId), records.map((record) => record.nodeId));

let lastGroupRank = -1;
let lastTreeByGroup = new Map();
let lastDepthByTree = new Map();
flattened.forEach((record) => {
  assert(record.groupRank >= lastGroupRank, 'capture moved back to an earlier tree group');
  lastGroupRank = record.groupRank;
  const lastTree = lastTreeByGroup.get(record.groupRank) ?? -1;
  assert(record.treeIndex >= lastTree, 'capture returned to an earlier tree');
  lastTreeByGroup.set(record.groupRank, record.treeIndex);
  const treeKey = `${record.groupRank}:${record.treeIndex}`;
  const lastDepth = lastDepthByTree.get(treeKey) ?? -1;
  assert(record.depth >= lastDepth, 'capture moved back to an earlier depth');
  lastDepthByTree.set(treeKey, record.depth);
});

const mainMaxIndex = flattened.findLastIndex((record) => record.treeType === TREE_TYPES.main);
const firstSubdomainIndex = flattened.findIndex((record) => record.treeType === TREE_TYPES.subdomain);
const subdomainMaxIndex = flattened.findLastIndex((record) => record.treeType === TREE_TYPES.subdomain);
const firstOrphanIndex = flattened.findIndex((record) => record.treeType === TREE_TYPES.orphan);

assert(mainMaxIndex >= 0, 'main records missing');
assert(firstSubdomainIndex > mainMaxIndex, 'subdomains started before main capture finished');
assert(firstOrphanIndex > subdomainMaxIndex, 'orphans started before subdomain capture finished');

phases.forEach((phase) => {
  const phaseGroups = new Set(phase.records.map((record) => record.treeType));
  const phaseTrees = new Set(phase.records.map((record) => record.treeIndex));
  const phaseDepths = new Set(phase.records.map((record) => record.depth));
  assert.strictEqual(phaseGroups.size, 1, 'phase mixed capture groups');
  assert.strictEqual(phaseTrees.size, 1, 'phase mixed capture trees');
  assert.strictEqual(phaseDepths.size, 1, 'phase mixed depth levels');
});

console.log(`image capture ordering ok: ${records.length} records, ${phases.length} phases`);

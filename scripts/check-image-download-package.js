#!/usr/bin/env node

const assert = require('assert');
const {
  buildImageDownloadPath,
  collectFallbackImageDownloadNodes,
  createZipBuffer,
  getAssetExtension,
  normalizeDownloadNodeDescriptors,
  sanitizeFilenamePart,
} = require('../utils/imageDownloadPackage');

function listZipEntryNames(buffer) {
  const names = [];
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    names.push(buffer.slice(nameStart, nameStart + nameLength).toString('utf8'));
    offset = nameStart + nameLength + extraLength + compressedSize;
  }
  return names;
}

const root = {
  id: 'root',
  title: 'Home / Root',
  url: 'https://example.com/',
  children: [{
    id: 'services',
    title: 'Services: Strategy',
    url: 'https://example.com/services',
    children: [{
      id: 'detail',
      title: 'Name With Unsafe / Characters?',
      url: 'https://example.com/services/detail',
      children: [],
    }],
  }],
};

const orphans = [{
  id: 'orphan',
  title: 'Loose Page',
  url: 'https://example.com/loose',
  orphanType: 'orphan',
  children: [],
}, {
  id: 'sub-root',
  title: 'Subdomain Root',
  url: 'https://sub.example.com/',
  subdomainRoot: true,
  orphanType: 'subdomain',
  children: [{
    id: 'sub-child',
    title: 'Sub Child',
    url: 'https://sub.example.com/child',
    children: [],
  }],
}];

const descriptors = normalizeDownloadNodeDescriptors(
  collectFallbackImageDownloadNodes(root, orphans)
);
const detail = descriptors.get('detail');
assert.deepStrictEqual(
  detail.pathSegments.map((segment) => segment.number),
  ['0', '1', '1.1'],
  'main child folder path should match map hierarchy'
);

const subChild = descriptors.get('sub-child');
assert.deepStrictEqual(
  subChild.pathSegments.map((segment) => segment.number),
  ['s1', 's1.1'],
  'subdomain folder path should match map hierarchy'
);

const usedPaths = new Set();
const detailPath = buildImageDownloadPath({
  descriptor: detail,
  assetField: 'thumbnailUrl',
  exportedFieldCount: 1,
  extension: 'jpg',
  usedPaths,
});
assert.strictEqual(
  detailPath,
  '0-Home-Root/1-Services-Strategy/1.1-Name-With-Unsafe-Characters/1.1-Name-With-Unsafe-Characters.jpg'
);

const firstDuplicate = buildImageDownloadPath({
  descriptor: detail,
  assetField: 'thumbnailUrl',
  exportedFieldCount: 1,
  extension: 'jpg',
  usedPaths,
});
assert.strictEqual(
  firstDuplicate,
  '0-Home-Root/1-Services-Strategy/1.1-Name-With-Unsafe-Characters/1.1-Name-With-Unsafe-Characters-2.jpg'
);

const fullPath = buildImageDownloadPath({
  descriptor: detail,
  assetField: 'fullScreenshotUrl',
  exportedFieldCount: 2,
  extension: getAssetExtension({ storageKey: 'asset_full_v3.jpeg' }),
  usedPaths: new Set(),
});
assert(fullPath.endsWith('/1.1-Name-With-Unsafe-Characters-full.jpg'));
assert.strictEqual(sanitizeFilenamePart('bad/name:*?', 'fallback'), 'bad-name');

const zip = createZipBuffer([
  { path: detailPath, buffer: Buffer.from('one') },
  { path: fullPath, buffer: Buffer.from('two') },
]);
assert.deepStrictEqual(listZipEntryNames(zip), [detailPath, fullPath]);

console.log('image download package check passed');

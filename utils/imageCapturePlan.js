const TREE_TYPES = Object.freeze({
  main: 'main',
  subdomain: 'subdomain',
  orphan: 'orphan',
});

const GROUP_RANK = Object.freeze({
  [TREE_TYPES.main]: 0,
  [TREE_TYPES.subdomain]: 1,
  [TREE_TYPES.orphan]: 2,
});

const IMAGE_CAPTURE_SCALE_TIERS = Object.freeze({
  small: 'small',
  medium: 'medium',
  large: 'large',
});

const IMAGE_CAPTURE_STAGE_SIZES = Object.freeze({
  thumb: 500,
  full: 100,
});

const IMAGE_CAPTURE_SCALE_LIMITS = Object.freeze({
  thumb: Object.freeze({
    smallMax: 250,
    mediumMax: 2000,
  }),
  full: Object.freeze({
    smallMax: 50,
    mediumMax: 500,
  }),
});

function normalizeId(value) {
  const id = String(value || '').trim();
  return id || null;
}

function normalizeCaptureType(value) {
  return String(value || '').trim().toLowerCase() === 'full' ? 'full' : 'thumb';
}

function getImageCaptureScaleTier(captureType, count) {
  const normalizedType = normalizeCaptureType(captureType);
  const total = Math.max(0, Number(count) || 0);
  const limits = IMAGE_CAPTURE_SCALE_LIMITS[normalizedType];
  if (total <= limits.smallMax) return IMAGE_CAPTURE_SCALE_TIERS.small;
  if (total <= limits.mediumMax) return IMAGE_CAPTURE_SCALE_TIERS.medium;
  return IMAGE_CAPTURE_SCALE_TIERS.large;
}

function getImageCaptureStageSize(captureType, count) {
  const normalizedType = normalizeCaptureType(captureType);
  const total = Math.max(0, Number(count) || 0);
  const tier = getImageCaptureScaleTier(normalizedType, total);
  if (tier !== IMAGE_CAPTURE_SCALE_TIERS.large) return Math.max(1, total || 1);
  return IMAGE_CAPTURE_STAGE_SIZES[normalizedType];
}

function parsePageNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return { hasNumber: false, parts: [], raw };
  const cleaned = raw.replace(/^[a-z]+/i, '');
  const parts = cleaned
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
  return { hasNumber: parts.length > 0, parts, raw };
}

function comparePageNumbers(left, right) {
  if (left.hasNumber !== right.hasNumber) return left.hasNumber ? -1 : 1;
  const length = Math.max(left.parts.length, right.parts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.parts[index] ?? -1;
    const rightPart = right.parts[index] ?? -1;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return left.raw.localeCompare(right.raw);
}

function getTreeTypeForOrphanRoot(node) {
  return node?.subdomainRoot || node?.orphanType === TREE_TYPES.subdomain
    ? TREE_TYPES.subdomain
    : TREE_TYPES.orphan;
}

function getNodePageNumber(node) {
  return parsePageNumber(node?.number || node?.pageNumber || node?.reportNumber || '');
}

function compareCaptureRecords(left, right) {
  if (left.groupRank !== right.groupRank) return left.groupRank - right.groupRank;
  if (left.treeIndex !== right.treeIndex) return left.treeIndex - right.treeIndex;
  if (left.depth !== right.depth) return left.depth - right.depth;
  const pageNumberOrder = comparePageNumbers(left.pageNumber, right.pageNumber);
  if (pageNumberOrder !== 0) return pageNumberOrder;
  if (left.orderPath !== right.orderPath) return left.orderPath.localeCompare(right.orderPath);
  return left.sourceIndex - right.sourceIndex;
}

function collectImageCaptureRecords(root, orphans = []) {
  const records = [];
  let sourceIndex = 0;

  const visit = (node, meta) => {
    if (!node || typeof node !== 'object') return;
    const id = normalizeId(node.id);
    if (id) {
      records.push({
        node,
        nodeId: id,
        treeType: meta.treeType,
        groupRank: GROUP_RANK[meta.treeType] ?? GROUP_RANK.orphan,
        treeIndex: meta.treeIndex,
        depth: meta.depth,
        orderPath: meta.orderPath,
        sourceIndex,
        pageNumber: getNodePageNumber(node),
      });
      sourceIndex += 1;
    }

    const children = Array.isArray(node.children) ? node.children : [];
    children.forEach((child, childIndex) => {
      visit(child, {
        ...meta,
        depth: meta.depth + 1,
        orderPath: `${meta.orderPath}.${String(childIndex).padStart(5, '0')}`,
      });
    });
  };

  if (root) {
    visit(root, {
      treeType: TREE_TYPES.main,
      treeIndex: 0,
      depth: 0,
      orderPath: '0',
    });
  }

  let subdomainIndex = 0;
  let orphanIndex = 0;
  (Array.isArray(orphans) ? orphans : []).forEach((orphan, index) => {
    const treeType = getTreeTypeForOrphanRoot(orphan);
    const treeIndex = treeType === TREE_TYPES.subdomain ? subdomainIndex : orphanIndex;
    if (treeType === TREE_TYPES.subdomain) subdomainIndex += 1;
    else orphanIndex += 1;
    visit(orphan, {
      treeType,
      treeIndex,
      depth: 0,
      orderPath: `${treeType}.${String(index).padStart(5, '0')}`,
    });
  });

  return records.sort(compareCaptureRecords);
}

function buildImageCapturePhases(records) {
  const phaseMap = new Map();
  (records || []).forEach((record) => {
    const key = `${record.groupRank}:${record.treeIndex}:${record.depth}`;
    if (!phaseMap.has(key)) {
      phaseMap.set(key, {
        treeType: record.treeType,
        groupRank: record.groupRank,
        treeIndex: record.treeIndex,
        depth: record.depth,
        records: [],
      });
    }
    phaseMap.get(key).records.push(record);
  });

  return Array.from(phaseMap.values())
    .sort((left, right) => {
      if (left.groupRank !== right.groupRank) return left.groupRank - right.groupRank;
      if (left.treeIndex !== right.treeIndex) return left.treeIndex - right.treeIndex;
      return left.depth - right.depth;
    })
    .map((phase) => ({
      ...phase,
      records: phase.records.sort(compareCaptureRecords),
    }));
}

function buildImageCaptureStages(records, captureType = 'thumb') {
  const sortedRecords = [...(records || [])].sort(compareCaptureRecords);
  const stageSize = getImageCaptureStageSize(captureType, sortedRecords.length);
  const scaleTier = getImageCaptureScaleTier(captureType, sortedRecords.length);
  const chunks = [];
  for (let start = 0; start < sortedRecords.length; start += stageSize) {
    chunks.push(sortedRecords.slice(start, start + stageSize));
  }
  const stageTotal = Math.max(1, chunks.length);
  if (chunks.length === 0) chunks.push([]);
  return chunks.map((stageRecords, index) => ({
    stageIndex: index + 1,
    stageTotal,
    scaleTier,
    stageSize,
    records: stageRecords,
    phases: buildImageCapturePhases(stageRecords),
  }));
}

module.exports = {
  TREE_TYPES,
  IMAGE_CAPTURE_SCALE_TIERS,
  IMAGE_CAPTURE_STAGE_SIZES,
  collectImageCaptureRecords,
  buildImageCapturePhases,
  buildImageCaptureStages,
  compareCaptureRecords,
  getImageCaptureScaleTier,
  getImageCaptureStageSize,
  normalizeCaptureType,
};

const crypto = require('crypto');

const REPETITIVE_GROUP_THRESHOLD = 20;
const REPETITIVE_GROUP_CAPTURE_LIMIT = 10;
const NATURAL_SCAN_COLLATOR = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

function normalizeScanUrl(raw) {
  try {
    const parsed = new URL(String(raw || '').trim());
    parsed.hash = '';
    parsed.hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (/\/index\.(html?|php|aspx)$/i.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/\/index\.(html?|php|aspx)$/i, '/');
    }
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function getPathSegments(url) {
  try {
    return new URL(url).pathname.split('/').filter(Boolean);
  } catch {
    return [];
  }
}

function compareNaturalScanUrls(left, right) {
  const getComparable = (value) => {
    try {
      const parsed = new URL(value);
      return `${decodeURIComponent(parsed.pathname)}${parsed.search}`;
    } catch {
      return String(value || '');
    }
  };
  return NATURAL_SCAN_COLLATOR.compare(getComparable(left), getComparable(right));
}

function compareScanNumberStrings(leftValue, rightValue) {
  const parse = (value) => String(value || '').trim().split('.').filter(Boolean).map((part) => {
    if (/^\d+$/.test(part)) return { type: 'number', value: Number(part) };
    if (/^X+$/i.test(part)) return { type: 'unknown', value: 0 };
    return { type: 'text', value: part };
  });
  const left = parse(leftValue);
  const right = parse(rightValue);
  if (left.length === 0 || right.length === 0) return 0;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (!leftPart || !rightPart) return left.length - right.length;
    if (leftPart.type === 'unknown' && rightPart.type === 'unknown') continue;
    if (leftPart.type === 'number' && rightPart.type === 'number') {
      if (leftPart.value !== rightPart.value) return leftPart.value - rightPart.value;
      continue;
    }
    if (leftPart.type !== rightPart.type) {
      if (leftPart.type === 'number') return -1;
      if (rightPart.type === 'number') return 1;
      if (leftPart.type === 'unknown') return -1;
      if (rightPart.type === 'unknown') return 1;
    }
    const difference = NATURAL_SCAN_COLLATOR.compare(
      String(leftPart.value),
      String(rightPart.value)
    );
    if (difference !== 0) return difference;
  }
  return 0;
}

function getSiteRootUrl(url) {
  const normalized = normalizeScanUrl(url);
  if (!normalized) return null;
  return `${new URL(normalized).origin}/`;
}

function getParentUrl(url) {
  const normalized = normalizeScanUrl(url);
  if (!normalized) return null;
  const parsed = new URL(normalized);
  if (parsed.search) {
    parsed.search = '';
    return normalizeScanUrl(parsed.toString());
  }
  const parts = getPathSegments(normalized);
  if (parts.length === 0) return null;
  if (parts.length === 1) return `${parsed.origin}/`;
  return normalizeScanUrl(`${parsed.origin}/${parts.slice(0, -1).join('/')}`);
}

function createFocusedScanDescriptor(startUrl) {
  const seed = normalizeScanUrl(startUrl);
  if (!seed) throw new Error('Invalid URL');
  const parsed = new URL(seed);
  const pathSegments = getPathSegments(seed);
  return {
    seed,
    origin: parsed.origin,
    siteRootUrl: `${parsed.origin}/`,
    focusPath: pathSegments.length ? `/${pathSegments.join('/')}` : '/',
    focusDepth: pathSegments.length,
    focused: pathSegments.length > 0,
  };
}

function isUrlWithinFocusedPath(candidate, descriptor) {
  const normalized = normalizeScanUrl(candidate);
  if (!normalized || !descriptor) return false;
  const parsed = new URL(normalized);
  if (parsed.origin !== descriptor.origin) return false;
  if (!descriptor.focused) return true;
  if (parsed.pathname === descriptor.focusPath) {
    const seed = new URL(descriptor.seed);
    return !seed.search || normalized === descriptor.seed;
  }
  return parsed.pathname.startsWith(`${descriptor.focusPath}/`);
}

function getFocusedAncestorUrls(startUrl) {
  const descriptor = createFocusedScanDescriptor(startUrl);
  const ancestors = [descriptor.siteRootUrl];
  if (!descriptor.focused) return ancestors;
  const segments = getPathSegments(descriptor.seed);
  const segmentCount = new URL(descriptor.seed).search
    ? Math.max(0, segments.length - 1)
    : segments.length;
  for (let index = 0; index < segmentCount; index += 1) {
    ancestors.push(normalizeScanUrl(`${descriptor.origin}/${segments.slice(0, index + 1).join('/')}`));
  }
  return Array.from(new Set(ancestors.filter(Boolean)));
}

function getLeafShape(value) {
  const leaf = decodeURIComponent(String(value || '')).toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(leaf)) return 'uuid';
  if (/^\d{4}[-/]?\d{1,2}[-/]?\d{1,2}/.test(leaf)) return 'dated';
  if (/^\d+$/.test(leaf)) return 'number';
  if (/\d/.test(leaf) && /[a-z]/.test(leaf)) return 'mixed';
  return 'slug';
}

function isVariablePathSegment(value) {
  const shape = getLeafShape(value);
  return shape === 'uuid' || shape === 'dated' || shape === 'number';
}

function getStableRepetitiveGroupId(key) {
  const digest = crypto.createHash('sha256').update(String(key || '')).digest('hex').slice(0, 32);
  return `deferred_${digest}`;
}

function getRepetitiveGroupDescriptor(url) {
  const normalized = normalizeScanUrl(url);
  if (!normalized) return null;
  const parsed = new URL(normalized);
  const segments = getPathSegments(normalized);
  const parentUrl = getParentUrl(normalized);
  if (!parentUrl) return null;
  if (parsed.search) {
    const queryTemplate = Array.from(parsed.searchParams.keys())
      .sort()
      .map((key) => `${key.toLowerCase()}=:${getLeafShape(parsed.searchParams.get(key))}`)
      .join('&');
    const routeTemplate = `${segments.join('/')}?${queryTemplate}`;
    const key = `${parentUrl}|${routeTemplate}`;
    const groupId = getStableRepetitiveGroupId(key);
    return {
      groupId,
      key,
      parentUrl,
      shape: 'query',
      routeTemplate,
      extension: null,
    };
  }
  if (segments.length < 2) return null;
  const leaf = segments[segments.length - 1];
  const extensionMatch = leaf.match(/\.([a-z0-9]{1,8})$/i);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : '';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(extension)) {
    return null;
  }
  const shape = getLeafShape(extensionMatch ? leaf.slice(0, -(extension.length + 1)) : leaf);
  const intermediateSegments = segments.slice(0, -1);
  const firstVariableIndex = intermediateSegments.findIndex(isVariablePathSegment);
  const stableParentSegments = firstVariableIndex >= 0
    ? intermediateSegments.slice(0, firstVariableIndex)
    : intermediateSegments;
  const stableParentUrl = stableParentSegments.length
    ? normalizeScanUrl(`${parsed.origin}/${stableParentSegments.join('/')}`)
    : `${parsed.origin}/`;
  const routeTemplate = [
    ...intermediateSegments.map((segment) => (
      isVariablePathSegment(segment) ? `:${getLeafShape(segment)}` : segment.toLowerCase()
    )),
    `:${shape}${extension ? `.${extension}` : ''}`,
  ].join('/');
  const key = `${stableParentUrl}|${routeTemplate}`;
  const groupId = getStableRepetitiveGroupId(key);
  return {
    groupId,
    key,
    parentUrl: stableParentUrl || parentUrl,
    shape,
    routeTemplate,
    extension: extension || null,
  };
}

function buildRepetitiveGroups(urls, {
  threshold = REPETITIVE_GROUP_THRESHOLD,
  captureLimit = REPETITIVE_GROUP_CAPTURE_LIMIT,
} = {}) {
  const groups = new Map();
  const seen = new Set();
  (Array.isArray(urls) ? urls : []).forEach((rawUrl, order) => {
    const url = normalizeScanUrl(rawUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    const descriptor = getRepetitiveGroupDescriptor(url);
    if (!descriptor) return;
    if (!groups.has(descriptor.key)) {
      groups.set(descriptor.key, { ...descriptor, members: [] });
    }
    groups.get(descriptor.key).members.push({ url, order });
  });
  return Array.from(groups.values())
    .filter((group) => group.members.length > threshold)
    .map((group) => ({
      ...group,
      capturedEntries: group.members.slice(0, captureLimit),
      deferredEntries: group.members.slice(captureLimit),
    }));
}

function buildPreservedNumberMap(urlEntries, startUrl, {
  completeParentUrls = [],
  knownParentUrls = [],
} = {}) {
  const descriptor = createFocusedScanDescriptor(startUrl);
  const explicitParentByUrl = new Map();
  (Array.isArray(urlEntries) ? urlEntries : []).forEach((entry) => {
    if (!entry || typeof entry === 'string') return;
    const url = normalizeScanUrl(entry.url);
    const parentUrl = normalizeScanUrl(entry.parentUrl);
    if (
      !url
      || !parentUrl
      || url === parentUrl
      || new URL(url).origin !== descriptor.origin
      || new URL(parentUrl).origin !== descriptor.origin
    ) {
      return;
    }
    explicitParentByUrl.set(url, parentUrl);
  });
  const records = new Map();
  const completeParents = new Set(
    (Array.isArray(completeParentUrls) ? completeParentUrls : [])
      .map(normalizeScanUrl)
      .filter(Boolean)
  );
  const knownParents = new Set(
    (Array.isArray(knownParentUrls) ? knownParentUrls : [])
      .map(normalizeScanUrl)
      .filter(Boolean)
  );
  const querySeed = new URL(descriptor.seed).search ? descriptor.seed : null;
  const getNumberingParentUrl = (url) => {
    const explicitParentUrl = explicitParentByUrl.get(url);
    if (explicitParentUrl && explicitParentUrl !== url) return explicitParentUrl;
    if (querySeed && url === querySeed) {
      const queryless = new URL(url);
      queryless.search = '';
      return getParentUrl(queryless.toString());
    }
    return getParentUrl(url);
  };
  const getOrderKey = (order, exact, sortKey = '') => {
    const normalizedSortKey = String(sortKey || '').trim();
    if (normalizedSortKey) return normalizedSortKey;
    if (!exact || !Number.isFinite(order)) return '';
    return `sitemap:${String(Math.max(0, Math.floor(order))).padStart(12, '0')}`;
  };
  const addRecord = (
    rawUrl,
    order = Number.POSITIVE_INFINITY,
    exact = false,
    sortKey = ''
  ) => {
    const url = normalizeScanUrl(rawUrl);
    if (!url) return;
    const parsed = new URL(url);
    if (parsed.origin !== descriptor.origin) return;
    const orderKey = getOrderKey(order, exact, sortKey);
    const current = records.get(url);
    if (!current) {
      records.set(url, {
        url,
        orderKey,
        exact: Boolean(exact || orderKey),
      });
    } else {
      if (orderKey && (!current.orderKey || orderKey.localeCompare(current.orderKey) < 0)) {
        current.orderKey = orderKey;
      }
      current.exact = current.exact || Boolean(exact || orderKey);
    }
    let parentUrl = getNumberingParentUrl(url);
    const visitedParents = new Set([url]);
    while (parentUrl && !visitedParents.has(parentUrl)) {
      visitedParents.add(parentUrl);
      if (!records.has(parentUrl)) {
        records.set(parentUrl, {
          url: parentUrl,
          orderKey: '',
          exact: false,
        });
      }
      parentUrl = getNumberingParentUrl(parentUrl);
    }
  };

  (Array.isArray(urlEntries) ? urlEntries : []).forEach((entry, index) => {
    if (typeof entry === 'string') addRecord(entry, index);
    else {
      addRecord(
        entry?.url,
        Number(entry?.order ?? index),
        entry?.exact === true,
        entry?.sortKey
      );
    }
  });
  const focusedAncestorUrls = getFocusedAncestorUrls(descriptor.seed)
    .map(normalizeScanUrl)
    .filter(Boolean);
  focusedAncestorUrls.forEach((url) => addRecord(url));
  addRecord(descriptor.seed);

  const childrenByParent = new Map();
  records.forEach((record) => {
    if (record.url === descriptor.siteRootUrl) return;
    const parentUrl = getNumberingParentUrl(record.url) || descriptor.siteRootUrl;
    if (!childrenByParent.has(parentUrl)) childrenByParent.set(parentUrl, []);
    childrenByParent.get(parentUrl).push(record.url);
  });

  const getMinimumOrderKey = (url, visiting = new Set()) => {
    const record = records.get(url);
    if (!record || visiting.has(url)) return '';
    if (record.minimumOrderResolved) return record.minimumOrderKey;
    visiting.add(url);
    let minimum = record.orderKey || '';
    (childrenByParent.get(url) || []).forEach((childUrl) => {
      const childMinimum = getMinimumOrderKey(childUrl, visiting);
      if (childMinimum && (!minimum || childMinimum.localeCompare(minimum) < 0)) {
        minimum = childMinimum;
      }
    });
    visiting.delete(url);
    record.minimumOrderKey = minimum;
    record.minimumOrderResolved = true;
    return minimum;
  };

  childrenByParent.forEach((children) => {
    children.sort((left, right) => {
      const leftOrder = getMinimumOrderKey(left);
      const rightOrder = getMinimumOrderKey(right);
      if (leftOrder && rightOrder && leftOrder !== rightOrder) {
        return leftOrder.localeCompare(rightOrder);
      }
      if (leftOrder && !rightOrder) return -1;
      if (!leftOrder && rightOrder) return 1;
      return compareNaturalScanUrls(left, right);
    });
  });

  const numbers = new Map([[descriptor.siteRootUrl, '0']]);
  const focusedAncestorParentSet = new Set(
    focusedAncestorUrls.filter((url) => url !== descriptor.siteRootUrl)
  );
  const visit = (parentUrl, parentNumber) => {
    const children = childrenByParent.get(parentUrl) || [];
    const hasCompleteOrder = completeParents.has(parentUrl)
      && children.length > 0
      && children.every((childUrl) => records.get(childUrl)?.exact === true);
    const parentPath = new URL(parentUrl).pathname.replace(/\/+$/, '') || '/';
    const isKnownFocusedParent = parentPath === descriptor.focusPath
      || parentPath.startsWith(`${descriptor.focusPath}/`);
    const hasKnownLocalOrder = hasCompleteOrder
      || knownParents.has(parentUrl)
      || focusedAncestorParentSet.has(parentUrl)
      || isKnownFocusedParent;
    const unknownSegment = children.length >= 10 ? 'XX' : 'X';
    children.forEach((childUrl, index) => {
      const segment = hasKnownLocalOrder ? `${index + 1}` : unknownSegment;
      const number = parentNumber === '0' ? segment : `${parentNumber}.${segment}`;
      numbers.set(childUrl, number);
      visit(childUrl, number);
    });
  };
  visit(descriptor.siteRootUrl, '0');
  const focusNumber = numbers.get(descriptor.seed);
  if (descriptor.focused && /^X+$/i.test(String(focusNumber || ''))) {
    const resolvedFocusNumber = `${focusNumber}.1`;
    numbers.forEach((number, url) => {
      if (!isUrlWithinFocusedPath(url, descriptor)) return;
      if (number === focusNumber) {
        numbers.set(url, resolvedFocusNumber);
        return;
      }
      if (String(number || '').startsWith(`${focusNumber}.`)) {
        numbers.set(url, `${resolvedFocusNumber}${number.slice(focusNumber.length)}`);
      }
    });
  }
  return numbers;
}

function sampleSignalsAreCompatible(signals) {
  const meaningful = (Array.isArray(signals) ? signals : [])
    .map((signal) => String(signal || '').trim().toLowerCase())
    .filter((signal) => signal && signal !== 'page');
  if (meaningful.length < 3) return true;
  const counts = new Map();
  meaningful.forEach((signal) => counts.set(signal, (counts.get(signal) || 0) + 1));
  const largest = Math.max(...counts.values());
  return largest >= Math.ceil(meaningful.length * 0.6);
}

module.exports = {
  REPETITIVE_GROUP_CAPTURE_LIMIT,
  REPETITIVE_GROUP_THRESHOLD,
  buildPreservedNumberMap,
  buildRepetitiveGroups,
  compareNaturalScanUrls,
  compareScanNumberStrings,
  createFocusedScanDescriptor,
  getFocusedAncestorUrls,
  getParentUrl,
  getRepetitiveGroupDescriptor,
  getStableRepetitiveGroupId,
  getSiteRootUrl,
  isUrlWithinFocusedPath,
  normalizeScanUrl,
  sampleSignalsAreCompatible,
};

const REPETITIVE_GROUP_THRESHOLD = 20;
const REPETITIVE_GROUP_CAPTURE_LIMIT = 10;

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

function getSiteRootUrl(url) {
  const normalized = normalizeScanUrl(url);
  if (!normalized) return null;
  return `${new URL(normalized).origin}/`;
}

function getParentUrl(url) {
  const normalized = normalizeScanUrl(url);
  if (!normalized) return null;
  const parsed = new URL(normalized);
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

function getRepetitiveGroupDescriptor(url) {
  const normalized = normalizeScanUrl(url);
  if (!normalized) return null;
  const parsed = new URL(normalized);
  const segments = getPathSegments(normalized);
  if (segments.length < 2) return null;
  const parentUrl = getParentUrl(normalized);
  if (!parentUrl) return null;
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
  const groupId = `deferred_${Buffer.from(key).toString('base64url').slice(0, 40)}`;
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
    .filter((group) => group.members.length >= threshold)
    .map((group) => ({
      ...group,
      capturedEntries: group.members.slice(0, captureLimit),
      deferredEntries: group.members.slice(captureLimit),
    }));
}

function buildPreservedNumberMap(urlEntries, startUrl) {
  const descriptor = createFocusedScanDescriptor(startUrl);
  const records = new Map();
  const addRecord = (rawUrl, order = Number.POSITIVE_INFINITY) => {
    const url = normalizeScanUrl(rawUrl);
    if (!url) return;
    const parsed = new URL(url);
    if (parsed.origin !== descriptor.origin) return;
    const current = records.get(url);
    if (!current) {
      records.set(url, { url, order: Number.isFinite(order) ? order : Number.POSITIVE_INFINITY });
    } else if (Number.isFinite(order)) {
      current.order = Math.min(current.order, order);
    }
    let parentUrl = getParentUrl(url);
    while (parentUrl) {
      if (!records.has(parentUrl)) {
        records.set(parentUrl, { url: parentUrl, order: Number.POSITIVE_INFINITY });
      }
      parentUrl = getParentUrl(parentUrl);
    }
  };

  (Array.isArray(urlEntries) ? urlEntries : []).forEach((entry, index) => {
    if (typeof entry === 'string') addRecord(entry, index);
    else addRecord(entry?.url, Number(entry?.order ?? index));
  });
  getFocusedAncestorUrls(descriptor.seed).forEach((url) => addRecord(url));
  addRecord(descriptor.seed);

  const childrenByParent = new Map();
  records.forEach((record) => {
    if (record.url === descriptor.siteRootUrl) return;
    const parentUrl = getParentUrl(record.url) || descriptor.siteRootUrl;
    if (!childrenByParent.has(parentUrl)) childrenByParent.set(parentUrl, []);
    childrenByParent.get(parentUrl).push(record.url);
  });

  const getMinimumOrder = (url, visiting = new Set()) => {
    const record = records.get(url);
    if (!record || visiting.has(url)) return Number.POSITIVE_INFINITY;
    if (Number.isFinite(record.minimumOrder)) return record.minimumOrder;
    visiting.add(url);
    let minimum = record.order;
    (childrenByParent.get(url) || []).forEach((childUrl) => {
      minimum = Math.min(minimum, getMinimumOrder(childUrl, visiting));
    });
    visiting.delete(url);
    record.minimumOrder = minimum;
    return minimum;
  };

  childrenByParent.forEach((children) => {
    children.sort((left, right) => {
      const orderDifference = getMinimumOrder(left) - getMinimumOrder(right);
      if (Number.isFinite(orderDifference) && orderDifference !== 0) return orderDifference;
      return left.localeCompare(right);
    });
  });

  const numbers = new Map([[descriptor.siteRootUrl, '0']]);
  const visit = (parentUrl, parentNumber) => {
    (childrenByParent.get(parentUrl) || []).forEach((childUrl, index) => {
      const number = parentNumber === '0' ? `${index + 1}` : `${parentNumber}.${index + 1}`;
      numbers.set(childUrl, number);
      visit(childUrl, number);
    });
  };
  visit(descriptor.siteRootUrl, '0');
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
  createFocusedScanDescriptor,
  getFocusedAncestorUrls,
  getParentUrl,
  getRepetitiveGroupDescriptor,
  getSiteRootUrl,
  isUrlWithinFocusedPath,
  normalizeScanUrl,
  sampleSignalsAreCompatible,
};

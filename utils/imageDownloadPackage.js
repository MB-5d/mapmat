const path = require('path');

const DOWNLOAD_IMAGE_FIELDS = Object.freeze([
  'thumbnailUrl',
  'fullScreenshotUrl',
]);

const DOWNLOAD_IMAGE_FIELD_LABELS = Object.freeze({
  thumbnailUrl: 'thumbnail',
  fullScreenshotUrl: 'full',
});

const zipCrcTable = Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let bit = 0; bit < 8; bit += 1) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return c >>> 0;
});

function getZipCrc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = zipCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getZipDosTimestamp(date = new Date()) {
  return {
    time: (
      (date.getHours() << 11)
      | (date.getMinutes() << 5)
      | Math.floor(date.getSeconds() / 2)
    ) & 0xffff,
    date: (
      ((date.getFullYear() - 1980) << 9)
      | ((date.getMonth() + 1) << 5)
      | date.getDate()
    ) & 0xffff,
  };
}

function createZipBuffer(files) {
  const chunks = [];
  const centralDirectory = [];
  const timestamp = getZipDosTimestamp();
  let offset = 0;

  const push = (buffer) => {
    chunks.push(buffer);
    offset += buffer.length;
  };

  const makeLocalHeader = ({ nameBuffer, dataBuffer, crc }) => {
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(timestamp.time, 10);
    header.writeUInt16LE(timestamp.date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(dataBuffer.length, 18);
    header.writeUInt32LE(dataBuffer.length, 22);
    header.writeUInt16LE(nameBuffer.length, 26);
    header.writeUInt16LE(0, 28);
    return header;
  };

  const makeCentralHeader = ({ nameBuffer, dataBuffer, crc, localOffset }) => {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(timestamp.time, 12);
    header.writeUInt16LE(timestamp.date, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(dataBuffer.length, 20);
    header.writeUInt32LE(dataBuffer.length, 24);
    header.writeUInt16LE(nameBuffer.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(localOffset, 42);
    return header;
  };

  files.forEach((file) => {
    const nameBuffer = Buffer.from(file.path, 'utf8');
    const dataBuffer = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer || '');
    const crc = getZipCrc32(dataBuffer);
    const localOffset = offset;

    push(makeLocalHeader({ nameBuffer, dataBuffer, crc }));
    push(nameBuffer);
    push(dataBuffer);

    centralDirectory.push({ nameBuffer, dataBuffer, crc, localOffset });
  });

  const centralStart = offset;
  centralDirectory.forEach((entry) => {
    push(makeCentralHeader(entry));
    push(entry.nameBuffer);
  });
  const centralSize = offset - centralStart;

  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(0, 4);
  footer.writeUInt16LE(0, 6);
  footer.writeUInt16LE(files.length, 8);
  footer.writeUInt16LE(files.length, 10);
  footer.writeUInt32LE(centralSize, 12);
  footer.writeUInt32LE(centralStart, 16);
  footer.writeUInt16LE(0, 20);
  push(footer);

  return Buffer.concat(chunks);
}

function normalizeUrlForCompare(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return raw.replace(/#.*$/, '');
  }
}

function urlsMatch(left, right) {
  return normalizeUrlForCompare(left) === normalizeUrlForCompare(right);
}

function sanitizeFilenamePart(value, fallback = 'item') {
  const cleaned = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+|\.+$/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

function buildNodeSegment({ number, title, url, id } = {}) {
  const safeNumber = sanitizeFilenamePart(number, 'page');
  const safeTitle = sanitizeFilenamePart(title || getUrlLabel(url) || id, 'Untitled');
  return safeNumber ? `${safeNumber}-${safeTitle}` : safeTitle;
}

function getUrlLabel(value) {
  try {
    const parsed = new URL(value);
    const lastSegment = parsed.pathname.split('/').filter(Boolean).pop();
    return decodeURIComponent(lastSegment || parsed.hostname);
  } catch {
    return '';
  }
}

function getAssetExtension({ storageKey, contentType } = {}) {
  const ext = path.extname(String(storageKey || '')).replace(/^\./, '').toLowerCase();
  if (ext) return ext === 'jpeg' ? 'jpg' : ext;
  const type = String(contentType || '').toLowerCase();
  if (type.includes('jpeg')) return 'jpg';
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  return 'jpg';
}

function collectFallbackImageDownloadNodes(root, orphans = []) {
  const descriptors = [];

  const visit = (node, number, parentPath = [], options = {}) => {
    if (!node || typeof node !== 'object') return;
    const pathSegments = [
      ...parentPath,
      {
        id: node.id || '',
        number,
        title: node.title || '',
        url: node.url || '',
      },
    ];
    if (node.id) {
      descriptors.push({
        id: String(node.id),
        number,
        title: node.title || '',
        url: node.url || '',
        pathSegments,
      });
    }
    (Array.isArray(node.children) ? node.children : []).forEach((child, index) => {
      const childNumber = options.rootChildNumbers ? `${index + 1}` : `${number}.${index + 1}`;
      visit(child, childNumber, pathSegments);
    });
  };

  if (root) visit(root, '0', [], { rootChildNumbers: true });
  const list = Array.isArray(orphans) ? orphans : [];
  const regularOrphans = list.filter((node) => !node?.subdomainRoot);
  const subdomainOrphans = list.filter((node) => node?.subdomainRoot);

  regularOrphans.forEach((node, index) => {
    visit(node, `0.${index + 1}`, []);
  });
  subdomainOrphans.forEach((node, index) => {
    visit(node, `s${index + 1}`, []);
  });

  return descriptors;
}

function normalizeDownloadNodeDescriptors(rawNodes = []) {
  const descriptors = new Map();
  (Array.isArray(rawNodes) ? rawNodes : []).slice(0, 5000).forEach((entry) => {
    const id = String(entry?.id || entry?.nodeId || '').trim();
    if (!id) return;
    const rawPath = Array.isArray(entry.pathSegments)
      ? entry.pathSegments
      : Array.isArray(entry.path)
      ? entry.path
      : [];
    const pathSegments = rawPath
      .map((segment) => ({
        id: String(segment?.id || '').trim(),
        number: String(segment?.number || '').trim(),
        title: String(segment?.title || '').trim(),
        url: String(segment?.url || '').trim(),
      }))
      .filter((segment) => segment.number || segment.title || segment.id || segment.url);

    descriptors.set(id, {
      id,
      number: String(entry?.number || '').trim(),
      title: String(entry?.title || '').trim(),
      url: String(entry?.url || '').trim(),
      pathSegments,
    });
  });
  return descriptors;
}

function dedupeFilePath(filePath, usedPaths) {
  if (!usedPaths.has(filePath)) {
    usedPaths.add(filePath);
    return filePath;
  }
  const ext = path.posix.extname(filePath);
  const base = ext ? filePath.slice(0, -ext.length) : filePath;
  let index = 2;
  let nextPath = `${base}-${index}${ext}`;
  while (usedPaths.has(nextPath)) {
    index += 1;
    nextPath = `${base}-${index}${ext}`;
  }
  usedPaths.add(nextPath);
  return nextPath;
}

function buildImageDownloadPath({
  descriptor,
  assetField,
  exportedFieldCount,
  extension,
  usedPaths,
}) {
  const safeDescriptor = descriptor || {};
  const pathSegments = Array.isArray(safeDescriptor.pathSegments) && safeDescriptor.pathSegments.length
    ? safeDescriptor.pathSegments
    : [safeDescriptor];
  const folderParts = pathSegments.map((segment) => buildNodeSegment(segment));
  const fileBase = buildNodeSegment(safeDescriptor);
  const suffix = exportedFieldCount > 1 ? `-${DOWNLOAD_IMAGE_FIELD_LABELS[assetField] || 'image'}` : '';
  const filePath = [...folderParts, `${fileBase}${suffix}.${extension}`].join('/');
  return dedupeFilePath(filePath, usedPaths);
}

module.exports = {
  DOWNLOAD_IMAGE_FIELDS,
  DOWNLOAD_IMAGE_FIELD_LABELS,
  buildImageDownloadPath,
  collectFallbackImageDownloadNodes,
  createZipBuffer,
  getAssetExtension,
  normalizeDownloadNodeDescriptors,
  sanitizeFilenamePart,
  urlsMatch,
};

export const sanitizeUrl = (raw) => {
  if (!raw) return '';
  let t = raw.trim();

  // Add https:// if no protocol specified
  if (t && !t.match(/^https?:\/\//i)) {
    t = 'https://' + t;
  }

  try {
    const u = new URL(t);
    return u.toString();
  } catch {
    return '';
  }
};

export const downloadText = (filename, text) => {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const normalizePathname = (url) => {
  try {
    const pathname = new URL(url).pathname || '/';
    const trimmed = pathname.replace(/\/+$/, '');
    return trimmed === '' ? '/' : trimmed;
  } catch {
    return null;
  }
};

export const getPathSegments = (pathname) => pathname.split('/').filter(Boolean);

export const getTitlePrefix = (title) => {
  const cleaned = (title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(' ');
};

export const getSlugPattern = (slug) => {
  if (!slug) return '';
  if (/^\d+$/.test(slug)) return '#';
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(slug)) return 'date';
  if (/^[a-z0-9]+$/i.test(slug) && /[a-z]/i.test(slug) && /\d/.test(slug) && slug.length >= 8) {
    return 'id';
  }
  if (/^[0-9a-f]{8,}$/i.test(slug)) return 'hex';
  if (/^page[-_]?(\d+)$/.test(slug.toLowerCase())) return 'page-#';
  return slug.replace(/\d+/g, '#');
};

export const getMostCommon = (items) => {
  const counts = new Map();
  items.forEach((item) => {
    if (!item) return;
    counts.set(item, (counts.get(item) || 0) + 1);
  });
  let bestValue = null;
  let bestCount = 0;
  counts.forEach((count, value) => {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  });
  return { value: bestValue, count: bestCount };
};

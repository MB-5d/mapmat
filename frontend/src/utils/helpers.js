const isPublicIpv4Host = (hostname) => {
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => {
    if (!/^\d+$/.test(part)) return null;
    const value = Number(part);
    return value >= 0 && value <= 255 ? value : null;
  });
  if (octets.some((part) => part === null)) return false;
  const [a, b] = octets;
  if (a === 10 || a === 127 || a === 0) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a >= 224) return false;
  return true;
};

const isValidDomainHost = (hostname) => {
  if (!hostname || hostname.length > 253 || !hostname.includes('.')) return false;
  const labels = hostname.split('.');
  const tld = labels[labels.length - 1];
  if (!tld || tld.length < 2 || !/[a-z]/i.test(tld)) return false;
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
};

const isValidScanHost = (hostname) => {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return false;
  }
  return isValidDomainHost(host) || isPublicIpv4Host(host);
};

export const sanitizeUrl = (raw) => {
  if (!raw) return '';
  let t = raw.trim();
  if (!t || /\s/.test(t)) return '';

  // Add https:// if no protocol specified
  if (t && !t.match(/^https?:\/\//i)) {
    t = 'https://' + t;
  }

  try {
    const u = new URL(t);
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    if (u.username || u.password) return '';
    if (!isValidScanHost(u.hostname)) return '';
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

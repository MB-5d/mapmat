import { API_BASE } from './constants';

export function resolveApiAssetUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || /^data:/i.test(raw) || /^blob:/i.test(raw)) {
    return raw;
  }
  if (raw.startsWith('/')) {
    return `${API_BASE}${raw}`;
  }
  return raw;
}

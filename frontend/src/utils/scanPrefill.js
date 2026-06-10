import { ROUTE_SURFACES } from './appRoutes';
import { sanitizeUrl } from './helpers';

export const SCAN_PREFILL_URL_PARAM = 'url';
export const SCAN_PREFILL_INTENT_PARAM = 'intent';
export const SCAN_PREFILL_SCAN_INTENT = 'scan';
export const SCAN_PREFILL_OPTION_PARAMS = Object.freeze([
  'inactivePages',
  'subdomains',
  'authenticatedPages',
  'orphanPages',
  'errorPages',
  'brokenLinks',
  'duplicates',
  'files',
  'crosslinks',
]);

export function getValidScanPrefillUrl(route) {
  if (route?.surface !== ROUTE_SURFACES.APP || route?.section !== 'home') return '';
  return sanitizeUrl(route.searchParams?.get(SCAN_PREFILL_URL_PARAM) || '');
}

export function getValidScanPrefillOptions(route) {
  if (route?.surface !== ROUTE_SURFACES.APP || route?.section !== 'home') return {};
  return SCAN_PREFILL_OPTION_PARAMS.reduce((acc, key) => {
    if (!route.searchParams?.has(key)) return acc;
    acc[key] = route.searchParams.get(key) === 'true';
    return acc;
  }, {});
}

export function shouldStartScanFromPrefill(route) {
  if (route?.surface !== ROUTE_SURFACES.APP || route?.section !== 'home') return false;
  return route.searchParams?.get(SCAN_PREFILL_INTENT_PARAM) === SCAN_PREFILL_SCAN_INTENT
    && Boolean(getValidScanPrefillUrl(route));
}

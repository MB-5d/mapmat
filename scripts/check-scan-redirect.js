/* eslint-disable no-console */
const assert = require('assert');
const { getScanHttpsUpgrade, normalizeScanRedirectUrl } = require('../utils/scanRedirect');
const { flagScanScopeDiscoveryFailure } = require('../utils/scanResultQuality');

const response = { finalUrl: 'https://www.example.com/section/', status: 200, contentType: 'text/html; charset=utf-8' };
const upgrade = getScanHttpsUpgrade('http://example.com/section/', response);
assert.strictEqual(upgrade.seed, 'https://example.com/section');
assert.strictEqual(normalizeScanRedirectUrl('http://www.example.com/section/child/', upgrade), 'https://example.com/section/child');
assert.strictEqual(normalizeScanRedirectUrl('https://example.com/section/child/', upgrade), 'https://example.com/section/child');
assert.strictEqual(normalizeScanRedirectUrl('http://sub.example.com/section', upgrade), 'http://sub.example.com/section');
assert.strictEqual(normalizeScanRedirectUrl('http://example.com:8080/section', upgrade), 'http://example.com:8080/section');
assert.strictEqual(normalizeScanRedirectUrl('https://external.test/', upgrade), 'https://external.test/');
assert.strictEqual(normalizeScanRedirectUrl('http://example.com/#/route', upgrade), 'https://example.com/#/route');
assert.strictEqual(getScanHttpsUpgrade('http://example.com/section', { ...response, finalUrl: 'https://www.example.com/elsewhere' }).seed, 'https://example.com/section', 'transport upgrade must preserve requested focused path');
for (const [request, overrides] of [
  ['https://example.com/', {}],
  ['http://example.com:8080/', {}],
  ['http://example.com/', { finalUrl: 'https://example.com:8443/' }],
  ['http://example.com/', { finalUrl: 'https://sub.example.com/' }],
  ['http://example.com/', { finalUrl: 'https://example.com.external.test/' }],
  ['http://example.com/', { finalUrl: 'http://example.com/' }],
  ['http://example.com/', { status: 403 }],
  ['http://example.com/', { status: 500 }],
  ['http://example.com/', { contentType: 'application/pdf' }],
]) assert.strictEqual(getScanHttpsUpgrade(request, { ...response, ...overrides }), null);

const makeResult = () => ({ root: { children: [{}, {}, {}] }, scanDiagnostics: {
  rootStatus: 200, rootClassification: 'active', rootAllowedLinks: 0, rootSameSiteLinksRejectedByScope: 12,
} });
const failed = flagScanScopeDiscoveryFailure(makeResult());
assert.strictEqual(failed.partialReason, 'root_discovery_failed', 'several fallback pages must not mask failed discovery');
assert.strictEqual(failed.partial, true);
for (const overrides of [{ rootAllowedLinks: 1 }, { rootSameSiteLinksRejectedByScope: 0 }, { rootStatus: 403 }, { rootClassification: 'auth' }]) {
  const result = makeResult();
  Object.assign(result.scanDiagnostics, overrides);
  assert.strictEqual(flagScanScopeDiscoveryFailure(result).partial, undefined);
}
console.log('Scan redirect and discovery-quality checks passed');

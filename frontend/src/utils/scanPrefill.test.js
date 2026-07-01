import { ROUTE_SURFACES } from './appRoutes';
import { getValidScanPrefillOptions, getValidScanPrefillUrl, shouldStartScanFromPrefill } from './scanPrefill';

describe('getValidScanPrefillUrl', () => {
  test('returns a sanitized URL for the app home route', () => {
    const route = {
      surface: ROUTE_SURFACES.APP,
      section: 'home',
      searchParams: new URLSearchParams('url=example.com'),
    };

    expect(getValidScanPrefillUrl(route)).toBe('https://example.com/');
  });

  test('ignores invalid URLs and non-home routes', () => {
    expect(getValidScanPrefillUrl({
      surface: ROUTE_SURFACES.APP,
      section: 'home',
      searchParams: new URLSearchParams('url=localhost:3000'),
    })).toBe('');

    expect(getValidScanPrefillUrl({
      surface: ROUTE_SURFACES.APP,
      section: 'map',
      searchParams: new URLSearchParams('url=example.com'),
    })).toBe('');
  });

  test('returns supported scan option prefill values for the app home route', () => {
    const route = {
      surface: ROUTE_SURFACES.APP,
      section: 'home',
      searchParams: new URLSearchParams('url=example.com&subdomains=true&files=true&duplicates=false'),
    };

    expect(getValidScanPrefillOptions(route)).toEqual({
      subdomains: true,
      duplicates: false,
      files: true,
    });
  });

  test('starts only valid app home scan intent URLs', () => {
    expect(shouldStartScanFromPrefill({
      surface: ROUTE_SURFACES.APP,
      section: 'home',
      searchParams: new URLSearchParams('intent=scan&url=example.com'),
    })).toBe(true);

    expect(shouldStartScanFromPrefill({
      surface: ROUTE_SURFACES.APP,
      section: 'home',
      searchParams: new URLSearchParams('url=example.com'),
    })).toBe(false);

    expect(shouldStartScanFromPrefill({
      surface: ROUTE_SURFACES.APP,
      section: 'map',
      searchParams: new URLSearchParams('intent=scan&url=example.com'),
    })).toBe(false);
  });
});

import { getFindingBadgesForNode } from './nodeFindingBadges';

describe('node finding badges', () => {
  test('keeps obvious placement badges hidden by default', () => {
    expect(getFindingBadgesForNode({ id: 'subdomain', subdomainRoot: true })).not.toContain('Subdomain');
    expect(getFindingBadgesForNode({ id: 'orphan', orphanType: 'orphan' }, { orphanType: 'orphan' })).not.toContain('Orphan');
  });

  test('returns established finding badges without suppressing later statuses', () => {
    const badges = getFindingBadgesForNode({
      id: 'node-1',
      url: 'https://example.com/missing-page',
      isDuplicate: true,
      isBroken: true,
      statusCode: 500,
    });

    expect(badges).toEqual(['Duplicate', 'Broken Link', 'HTTP 500']);
  });

  test('keeps auth and inactive rules aligned with report filters', () => {
    expect(getFindingBadgesForNode({
      id: 'auth',
      url: 'https://example.com/private',
      authRequired: true,
      isInactive: true,
      statusCode: 401,
    })).toEqual(['Auth']);

    expect(getFindingBadgesForNode({
      id: 'inactive',
      url: 'https://example.com/old',
      isInactive: true,
    })).toEqual(['Inactive']);
  });
});

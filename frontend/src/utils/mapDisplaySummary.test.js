import {
  buildMapDisplaySummary,
  isNodeGhostedByLayers,
} from './mapDisplaySummary';

describe('mapDisplaySummary', () => {
  test('ignores entitlement-locked preview nodes when building layer availability', () => {
    const root = {
      id: 'root',
      url: 'https://example.com/',
      title: 'Example',
      children: [
        {
          id: 'locked-root-preview',
          url: 'https://example.com/locked-preview',
          title: 'Upgrade to see full map',
          isEntitlementLocked: true,
          entitlementLocked: true,
          isError: true,
          children: [],
        },
      ],
    };
    const lockedSubdomainPreview = {
      id: 'locked-subdomain-preview',
      url: 'https://preview.example.com/',
      title: 'Upgrade to see subdomains',
      subdomainRoot: true,
      orphanType: 'subdomain',
      isEntitlementLocked: true,
      entitlementLocked: true,
      children: [],
    };

    const summary = buildMapDisplaySummary(root, [lockedSubdomainPreview]);

    expect(summary.scanLayerAvailability).toMatchObject({
      placementPrimary: true,
      placementSubdomain: false,
      placementOrphan: false,
      statusError: false,
    });
  });

  test('does not ghost entitlement-locked preview nodes when layers are toggled off', () => {
    const subdomainMeta = {
      treeType: 'subdomain',
      parentId: null,
      depth: 0,
      isOrphan: true,
      orphanType: 'subdomain',
      orphanStyle: 'subdomain',
      isSubdomainTree: true,
    };
    const visibility = {
      placementPrimary: false,
      placementSubdomain: false,
      placementOrphan: false,
      typePages: false,
      typeFiles: false,
      statusMissing: false,
      statusBroken: false,
      statusError: false,
      statusInactive: false,
      statusAuth: false,
      statusDuplicate: false,
    };

    expect(isNodeGhostedByLayers({
      id: 'locked-subdomain-preview',
      url: 'https://preview.example.com/',
      isEntitlementLocked: true,
      entitlementLocked: true,
    }, subdomainMeta, visibility)).toBe(false);

    expect(isNodeGhostedByLayers({
      id: 'real-subdomain',
      url: 'https://blog.example.com/',
    }, subdomainMeta, visibility)).toBe(true);
  });
});

import fs from 'fs';
import path from 'path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import ReportDrawer from './ReportDrawer';

const appCss = fs.readFileSync(path.join(__dirname, '../../App.css'), 'utf8');

describe('ReportDrawer', () => {
  let container;
  let root;
  let props;

  const entries = [
    {
      id: '1',
      title: 'pricing',
      url: 'https://example.com/pricing',
      number: '3',
      types: ['standard', 'duplicates'],
      duplicateOf: 'https://example.com/about',
      parentUrl: 'https://example.com/about',
      referrerUrl: 'https://example.com/source',
      description: 'Plans and pricing metadata',
      metaKeywords: 'pricing, plans',
      canonicalUrl: 'https://example.com/pricing',
      h1: 'Pricing',
      h2: '',
      robots: 'index, follow',
      language: 'en',
      openGraph: { title: 'Pricing OG' },
      twitter: { card: 'summary_large_image' },
      pageType: 'Standard',
      levelColor: '#818cf8',
      thumbnailUrl: 'https://example.com/pricing.png',
    },
    {
      id: '2',
      title: 'about',
      url: 'https://example.com/about',
      number: '2',
      types: ['standard'],
      duplicateOf: '',
      parentUrl: '',
      referrerUrl: '',
      description: '',
      metaKeywords: '',
      canonicalUrl: '',
      h1: '',
      h2: '',
      robots: '',
      language: '',
      openGraph: {},
      twitter: {},
      pageType: 'Standard',
      levelColor: '#60a5fa',
      thumbnailUrl: '',
    },
    {
      id: '3',
      title: 'contact',
      url: 'https://example.com/contact',
      number: '4',
      types: ['brokenLinks', 'errorPages'],
      duplicateOf: '',
      parentUrl: '',
      referrerUrl: '',
      description: '',
      metaKeywords: '',
      canonicalUrl: '',
      h1: '',
      h2: '',
      robots: '',
      language: '',
      openGraph: {},
      twitter: {},
      pageType: 'Missing',
      levelColor: '#38bdf8',
      thumbnailUrl: '',
    },
  ];

  const renderDrawer = (nextProps = {}) => {
    props = {
      isOpen: true,
      onClose: vi.fn(),
      entries,
      stats: {
        total: 3,
        duplicates: 1,
        brokenLinks: 1,
        errorPages: 1,
        inactivePages: 0,
        orphanPages: 0,
        files: 0,
        subdomains: 0,
        missing: 1,
      },
      typeOptions: [
        { key: 'standard', label: 'Standard' },
        { key: 'orphanPages', label: 'Orphan pages' },
        { key: 'duplicates', label: 'Duplicate' },
        { key: 'brokenLinks', label: 'Broken links' },
        { key: 'errorPages', label: 'Error pages' },
        { key: 'missing', label: 'Missing' },
      ],
      onDownload: vi.fn(),
      onLocateNode: vi.fn(),
      onLocateUrl: vi.fn(),
      reportTitle: 'QA Report',
      reportTimestamp: 'Today',
      ...nextProps,
    };

    act(() => {
      root.render(<ReportDrawer {...props} />);
    });
  };

  const getVisibleTitles = () => (
    Array.from(container.querySelectorAll('.report-row .report-cell-title')).map((node) => node.textContent.trim())
  );

  const setInputValue = (element, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    descriptor.set.call(element, value);
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
  });

  test('sorts page names and keeps search working on the sorted rows', () => {
    renderDrawer();

    expect(getVisibleTitles()).toEqual(['about', 'pricing', 'contact']);

    const pageNameSortButton = Array.from(container.querySelectorAll('.report-sort-button')).find(
      (button) => button.textContent.includes('Page name')
    );
    const searchInput = container.querySelector('.report-search input');

    act(() => {
      pageNameSortButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(getVisibleTitles()).toEqual(['about', 'contact', 'pricing']);

    act(() => {
      pageNameSortButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(getVisibleTitles()).toEqual(['pricing', 'contact', 'about']);

    act(() => {
      setInputValue(searchInput, 'contact');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(getVisibleTitles()).toEqual(['contact']);
  });

  test('filters report rows from summary chips and clears filters from the total chip', () => {
    renderDrawer();

    const duplicateChip = container.querySelector('button[aria-label="Filter by Duplicate"]');
    const totalChip = container.querySelector('.report-total-card');

    expect(getVisibleTitles()).toEqual(['about', 'pricing', 'contact']);
    expect(totalChip.disabled).toBe(true);
    expect(totalChip.className).toContain('ui-chip--variant-metric');
    expect(totalChip.className).toContain('ui-chip--tone-brand');
    expect(duplicateChip.className).toContain('ui-chip--variant-filter');
    expect(duplicateChip.className).toContain('ui-tone--orange');

    act(() => {
      duplicateChip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(getVisibleTitles()).toEqual(['pricing']);
    expect(duplicateChip.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.report-filter-control .report-filter-active-dot')).not.toBeNull();
    expect(totalChip.disabled).toBe(false);

    act(() => {
      totalChip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(getVisibleTitles()).toEqual(['about', 'pricing', 'contact']);
    expect(container.querySelector('.report-filter-control .report-filter-active-dot')).toBeNull();
    expect(totalChip.disabled).toBe(true);
  });

  test('shows only available filter labels in the filters menu', () => {
    renderDrawer();

    const filterToggle = container.querySelector('.report-filter-toggle');
    expect(filterToggle.textContent).toContain('Filters');
    expect(filterToggle.textContent).not.toContain('Filter by');

    act(() => {
      filterToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const filterLabels = Array.from(container.querySelectorAll('.report-filter-menu-item')).map((item) =>
      item.textContent.trim()
    );

    expect(filterLabels).toEqual(['Error pages', 'Duplicate', 'Broken links', 'Has image']);
    expect(filterLabels).not.toContain('Standard');
    expect(container.querySelector('.report-filter-list')).toBeNull();
  });

  test('closes the shared filters menu from the toggle and outside clicks', () => {
    renderDrawer();

    const filterToggle = container.querySelector('.report-filter-toggle');

    act(() => {
      filterToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.report-filter-menu')).not.toBeNull();

    act(() => {
      filterToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.report-filter-menu')).toBeNull();

    act(() => {
      filterToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.report-filter-menu')).not.toBeNull();

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(container.querySelector('.report-filter-menu')).toBeNull();
  });

  test('filters image-backed rows from the shared filter menu', () => {
    renderDrawer();

    const filterToggle = container.querySelector('.report-filter-toggle');
    act(() => {
      filterToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const hasImageItem = Array.from(container.querySelectorAll('.report-filter-menu-item')).find((item) =>
      item.textContent.includes('Has image')
    );
    act(() => {
      hasImageItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(getVisibleTitles()).toEqual(['pricing']);
    const selectedHasImageItem = Array.from(container.querySelectorAll('.report-filter-menu-item')).find((item) =>
      item.textContent.includes('Has image')
    );
    expect(selectedHasImageItem.getAttribute('aria-checked')).toBe('true');
    expect(selectedHasImageItem.className).not.toContain('ui-menu-item--selected');
    expect(selectedHasImageItem.querySelector('.ui-menu-item__end')).not.toBeNull();
    expect(container.querySelector('.report-filter-control .report-filter-active-dot')).not.toBeNull();
  });

  test('shows fixed report title and keeps table controls sticky in the drawer body', () => {
    renderDrawer();

    expect(container.querySelector('.report-drawer-title').textContent).toBe('Scan results & findings');
    expect(container.querySelector('.report-drawer-subtitle').textContent).toBe('QA Report');
    expect(container.querySelector('.report-tabs')).toBeNull();
    expect(container.querySelector('.report-divider')).toBeNull();
    expect(container.querySelector('.report-table-region > .report-controls-sticky .report-filter-row')).not.toBeNull();
    expect(container.querySelector('.report-table .report-filter-row')).toBeNull();
    expect(container.querySelector('.report-table > .report-table-header')).not.toBeNull();
    expect(container.querySelector('.report-table-header').textContent).toContain('Findings');
    expect(container.querySelector('.report-table-header').textContent).toContain('Show');
    expect(container.querySelector('.report-table-header').textContent).not.toContain('Issues');
    expect(container.querySelector('.report-table-header').textContent).not.toContain('Show on map');
    expect(container.querySelector('.report-header-show')).not.toBeNull();
    expect(container.querySelector('.report-details-control')).not.toBeNull();
    expect(container.querySelector('.report-details-control .report-filter-active-dot')).not.toBeNull();
    expect(container.querySelector('.report-summary')?.className).toContain('report-summary--single-row');
    const summaryBlock = appCss.match(/\.report-summary \{[^}]*\}/)?.[0] || '';
    const drawerBlock = appCss.match(/\.report-drawer \{[^}]*\}/)?.[0] || '';
    expect(drawerBlock).toContain('--report-controls-sticky-height: 56px');
    expect(summaryBlock).toContain('margin-bottom: var(--unit-28)');
    const singleRowBlock = appCss.match(/\.report-summary--single-row \{[^}]*\}/)?.[0] || '';
    expect(singleRowBlock).toContain('grid-template-columns: 160px 1fr');
    const searchBlock = appCss.match(/\.report-search \{[^}]*\}/)?.[0] || '';
    expect(searchBlock).toContain('max-width: 296px');
    expect(appCss).toMatch(/\.report-controls-sticky \{[\s\S]*position: sticky;[\s\S]*top: 0;/);
    expect(appCss).toMatch(/\.report-controls-sticky \{[\s\S]*padding-bottom: var\(--unit-24\);/);
    const tableBlock = appCss.match(/\.report-table \{[^}]*\}/)?.[0] || '';
    expect(tableBlock).toContain('flex: 0 0 auto');
    expect(tableBlock).not.toContain('border: 1px solid');
    expect(appCss).not.toContain('report-filter-chip--danger');
    const tableBodyBlock = appCss.match(/\.report-table-body \{[^}]*\}/)?.[0] || '';
    expect(tableBodyBlock).toContain('flex: 0 0 auto');
    expect(tableBodyBlock).toContain('border: 1px solid var(--color-border)');
    expect(tableBodyBlock).toContain('border-top: 0');
    const tableHeaderBlock = appCss.match(/\.report-table-header \{[^}]*\}/)?.[0] || '';
    expect(tableHeaderBlock).toContain('position: sticky');
    expect(tableHeaderBlock).toContain('top: var(--report-controls-sticky-height)');
    expect(tableHeaderBlock).toContain('grid-template-columns: 10px 64px 96px 1.4fr 92px 32px 24px');
    expect(tableHeaderBlock).toContain('border: 1px solid var(--color-border)');
    expect(tableHeaderBlock).toContain('box-shadow: none');
    const rowMainBlock = appCss.match(/(?:^|\n)\.report-row-main \{[^}]*\}/)?.[0] || '';
    expect(rowMainBlock).toContain('grid-template-columns: 10px 64px 96px 1.4fr 92px 32px 24px');
    const mapLinkBlock = appCss.match(/\.report-map-link\.ui-icon-btn \{[^}]*\}/)?.[0] || '';
    expect(mapLinkBlock).toContain('justify-self: center');
    const detailsMenuBlock = appCss.match(/\.report-details-menu \{[^}]*\}/)?.[0] || '';
    expect(detailsMenuBlock).toContain('max-height: 388px');
    expect(detailsMenuBlock).toContain('overflow-y: auto');
    const lastRowBlock = appCss.match(/\.report-row:last-child \{[^}]*\}/)?.[0] || '';
    expect(lastRowBlock).toContain('border-bottom: 0');
    expect(appCss).toMatch(/\.report-drawer \.drawer-back-to-top \{[\s\S]*position: absolute;[\s\S]*bottom: var\(--unit-20\);/);
  });

  test('shows SEO metadata in expanded report details', () => {
    renderDrawer();

    const pricingRow = Array.from(container.querySelectorAll('.report-row-main')).find((row) =>
      row.textContent.includes('pricing')
    );

    act(() => {
      pricingRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Description:');
    expect(container.textContent).toContain('Plans and pricing metadata');
    expect(container.textContent).toContain('Meta keywords:');
    expect(container.textContent).toContain('pricing, plans');
    expect(container.textContent).toContain('Canonical:');
    expect(container.textContent).toContain('https://example.com/pricing');
    expect(container.textContent).toContain('Open Graph title:');
    expect(container.textContent).toContain('Pricing OG');
    expect(container.textContent).not.toContain('Scan status:');
    expect(container.textContent).not.toContain('Referrer:');

    const detailBadges = Array.from(container.querySelectorAll('.report-detail-badges .report-badge')).map((badge) =>
      badge.textContent.trim()
    );
    expect(detailBadges).toEqual(['Duplicate']);
    expect(container.querySelector('.report-detail-badges .report-badge')?.className).toContain('ui-tone--orange');
    expect(container.querySelector('.report-open-link').className).toContain('ui-btn--type-link');
    expect(container.querySelector('.report-thumb')).not.toBeNull();
  });

  test('opens details menu and keeps referrer and scan status hidden by default', () => {
    renderDrawer();

    const detailsToggle = container.querySelector('.report-details-control .report-filter-toggle');
    expect(detailsToggle.textContent).toContain('Details');

    act(() => {
      detailsToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const detailsItems = Array.from(container.querySelectorAll('.report-details-menu .report-filter-menu-item'));
    const referrerItem = detailsItems.find((item) => item.textContent.includes('Referrer'));
    const scanStatusItem = detailsItems.find((item) => item.textContent.includes('Scan status'));
    const descriptionItem = detailsItems.find((item) => item.textContent.includes('Description'));

    expect(referrerItem.getAttribute('aria-checked')).toBe('false');
    expect(scanStatusItem.getAttribute('aria-checked')).toBe('false');
    expect(descriptionItem.getAttribute('aria-checked')).toBe('true');
  });

  test('passes visible report details to the download action', () => {
    const onDownload = vi.fn();
    renderDrawer({ onDownload });

    const downloadButton = container.querySelector('.report-download-button');
    act(() => {
      downloadButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({
      visibleDetails: expect.objectContaining({
        description: true,
        referrerUrl: false,
      }),
    }));
  });

  test('uses page titles for duplicate and parent locate links', () => {
    const onLocateNode = vi.fn();
    renderDrawer({ onLocateNode });

    const pricingRow = Array.from(container.querySelectorAll('.report-row-main')).find((row) =>
      row.textContent.includes('pricing')
    );

    act(() => {
      pricingRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const duplicateLink = Array.from(container.querySelectorAll('.report-internal-link')).find((button) =>
      button.textContent.includes('about')
    );

    expect(duplicateLink).not.toBeNull();
    expect(duplicateLink.className).toContain('ui-btn--type-link');
    expect(duplicateLink.querySelector('.ui-btn__icon')).toBeNull();
    expect(container.textContent).not.toContain('example.com/about');

    act(() => {
      duplicateLink.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onLocateNode).toHaveBeenCalledWith('2');

    const parentLink = Array.from(container.querySelectorAll('.report-detail-link-row')).find((row) =>
      row.textContent.includes('Parent:')
    )?.querySelector('.report-internal-link');

    expect(parentLink).not.toBeNull();
    expect(parentLink.textContent.trim()).toBe('about');

    act(() => {
      parentLink.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onLocateNode).toHaveBeenCalledWith('2');
  });

  test('does not count or badge the row page type as a finding', () => {
    renderDrawer({
      entries: [
        {
          ...entries[1],
          id: 'orphan',
          title: 'orphan node',
          number: '5',
          types: ['orphanPages', 'inactivePages'],
          pageType: 'Orphan',
        },
      ],
      stats: {
        total: 1,
        inactivePages: 1,
        orphanPages: 1,
      },
      typeOptions: [
        { key: 'orphanPages', label: 'Orphan pages' },
        { key: 'inactivePages', label: 'Inactive pages' },
      ],
    });

    const orphanRow = container.querySelector('.report-row-main');

    expect(orphanRow.querySelector('.report-cell-count').textContent.trim()).toBe('1');

    act(() => {
      orphanRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const detailBadges = Array.from(container.querySelectorAll('.report-detail-badges .report-badge')).map((badge) =>
      badge.textContent.trim()
    );

    expect(detailBadges).toEqual(['Inactive']);
    expect(container.textContent).not.toContain('Orphan pages');
  });

  test('orders summary chips by report grouping', () => {
    const orderedTypes = [
      'subdomains',
      'orphanPages',
      'errorPages',
      'missing',
      'duplicates',
      'inactivePages',
      'shortTitle',
      'longTitle',
      'missingDescription',
      'shortDescription',
      'longDescription',
      'missingH1',
      'brokenLinks',
      'files',
      'authenticatedPages',
    ];
    renderDrawer({
      entries: [
        {
          ...entries[0],
          id: 'grouped',
          types: orderedTypes,
        },
      ],
      stats: {
        total: 1,
        subdomains: 1,
        orphanPages: 1,
        errorPages: 1,
        missing: 1,
        duplicates: 1,
        inactivePages: 1,
        shortTitle: 1,
        longTitle: 1,
        missingDescription: 1,
        shortDescription: 1,
        longDescription: 1,
        missingH1: 1,
        brokenLinks: 1,
        files: 1,
        authenticatedPages: 1,
      },
      typeOptions: [
        { key: 'duplicates', label: 'Duplicate' },
        { key: 'brokenLinks', label: 'Broken links' },
        { key: 'inactivePages', label: 'Inactive pages' },
        { key: 'errorPages', label: 'Error pages' },
        { key: 'orphanPages', label: 'Orphan pages' },
        { key: 'subdomains', label: 'Subdomains' },
        { key: 'files', label: 'Files / downloads' },
        { key: 'authenticatedPages', label: 'Authenticated pages' },
        { key: 'missing', label: 'Missing' },
        { key: 'shortTitle', label: 'Short title' },
        { key: 'longTitle', label: 'Very long title' },
        { key: 'missingDescription', label: 'No description' },
        { key: 'shortDescription', label: 'Short description' },
        { key: 'longDescription', label: 'Very long description' },
        { key: 'missingH1', label: 'No H1' },
      ],
    });

    const statLabels = Array.from(container.querySelectorAll('.report-stat-label')).map((label) =>
      label.textContent.trim()
    );

    expect(statLabels).toEqual([
      'Subdomain',
      'Orphan',
      'Error',
      'Missing',
      'Duplicate',
      'Inactive',
      'Short title',
      'Very long title',
      'No description',
      'Short description',
      'Very long description',
      'No H1',
      'Broken links',
      'Files',
      'Login required',
    ]);
  });

  test('shows dashes instead of zero findings', () => {
    renderDrawer();

    const aboutRow = Array.from(container.querySelectorAll('.report-row-main')).find((row) =>
      row.textContent.includes('about')
    );

    expect(aboutRow.querySelector('.report-cell-count').textContent.trim()).toBe('--');
  });

  test('does not render an empty thumbnail placeholder in expanded report details', () => {
    renderDrawer();

    const aboutRow = Array.from(container.querySelectorAll('.report-row-main')).find((row) =>
      row.textContent.includes('about')
    );

    act(() => {
      aboutRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.report-thumb')).toBeNull();
    expect(container.querySelector('.report-detail-main')?.className).toContain('report-detail-main--no-thumb');
  });

  test('locates a report row on the map from the row action', () => {
    const onLocateNode = vi.fn();
    renderDrawer({ onLocateNode });

    const seeOnMapButton = container.querySelector('.report-map-link[aria-label="See on map"]');

    expect(seeOnMapButton.type).toBe('button');
    expect(seeOnMapButton.title).toBe('See on map');
    expect(seeOnMapButton.textContent).not.toContain('See on map');
    expect(seeOnMapButton.className).toContain('ui-icon-btn--type-ghost');
    expect(seeOnMapButton.className).toContain('ui-icon-btn--style-brand');

    act(() => {
      seeOnMapButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onLocateNode).toHaveBeenCalledWith('2');
    expect(container.textContent).not.toContain('Canonical:');
  });

  test('shows scan collapse diagnostics in the report', () => {
    renderDrawer({
      scanMeta: {
        partialReason: 'scan_collapsed',
        scanDiagnostics: {
          collapseReason: 'root_links_found',
        },
      },
    });

    expect(container.textContent).toContain('Scan only confirmed the homepage.');
    expect(container.textContent).toContain('root_links_found');
  });

  test('shows the blocked section boundary in the report', () => {
    renderDrawer({
      scanMeta: {
        partialReason: 'blocked_sections',
        blockedSections: [{
          url: 'https://example.com/private',
          status: 403,
          reason: 'crawler_limited',
        }],
      },
    });

    expect(container.textContent).toContain('Some sections could not be scanned.');
    expect(container.textContent).toContain('https://example.com/private');
  });

  test('hides stale scan-limit warning when a saved map only has one real page', () => {
    renderDrawer({
      entries: [entries[0]],
      stats: {
        total: 1,
        duplicates: 0,
        brokenLinks: 0,
        errorPages: 0,
        inactivePages: 0,
        orphanPages: 0,
        files: 0,
        subdomains: 0,
        missing: 0,
      },
      scanMeta: {
        entitlement: {
          capped: true,
          limitReached: true,
          visiblePageLimit: 100,
          allowedPages: 100,
          lockedPageEstimate: 99,
        },
      },
    });

    expect(container.textContent).not.toContain('Full map locked.');
    expect(container.textContent).toContain('1');
  });

  test('shows scan-limit warning when visible pages reached the account limit', () => {
    renderDrawer({
      entries,
      scanMeta: {
        entitlement: {
          capped: true,
          limitReached: true,
          visiblePageLimit: 3,
          allowedPages: 3,
          lockedPageEstimate: 20,
        },
      },
    });

    expect(container.textContent).toContain('Full map locked.');
    expect(container.textContent).toContain('Showing 3 visible pages.');
    expect(container.textContent).toContain('20 more pages are locked.');
  });

  test('shows distinct scan coverage without changing pages on map', () => {
    renderDrawer({
      scanMeta: {
        pageCountSummary: {
          accountedPageCount: 15243,
          fetchedPageCount: 5000,
          capturedPageCount: 4979,
          visiblePageCount: 29,
          groupedPageCount: 10243,
          remainingPageCount: 12476,
          totalDiscoveredPageCount: 27719,
        },
      },
    });

    const coverage = container.querySelector('.report-coverage');
    expect(coverage.textContent).toContain('Discovered27,719');
    expect(coverage.textContent).toContain('Accounted15,243');
    expect(coverage.textContent).toContain('Fetched5,000');
    expect(coverage.textContent).toContain('Captured4,979');
    expect(coverage.textContent).toContain('Visible on map3');
    expect(coverage.textContent).toContain('Grouped10,243');
    expect(coverage.textContent).toContain('Remaining12,476');
    expect(container.querySelector('.report-total-card').textContent).toContain('Pages on map3');
  });

  test('derives accounted coverage for older saved maps without double-counting grouped fetched pages', () => {
    renderDrawer({
      scanMeta: {
        pageCountSummary: {
          fetchedPageCount: 15020,
          capturedPageCount: 20,
          visiblePageCount: 21,
          groupedPageCount: 15000,
          remainingPageCount: 0,
          totalDiscoveredPageCount: 15020,
        },
      },
    });

    expect(container.querySelector('.report-coverage').textContent).toContain('Accounted15,020');
  });

  test('explains a discovery safety-cap partial result', () => {
    renderDrawer({
      scanMeta: {
        partialReason: 'scan_discovery_cap',
        pageCountSummary: {
          accountedPageCount: 50000,
          fetchedPageCount: 50000,
          totalDiscoveredPageCount: 200000,
          remainingPageCount: 150000,
        },
      },
    });

    expect(container.textContent).toContain('Scan reached the discovery safety limit.');
    expect(container.textContent).toContain('valid results captured and grouped');
  });

});

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
      types: ['duplicates'],
      duplicateOf: '',
      parentUrl: '',
      referrerUrl: '',
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
      types: [],
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
      onClose: jest.fn(),
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
        { key: 'duplicates', label: 'Duplicate' },
        { key: 'brokenLinks', label: 'Broken links' },
        { key: 'errorPages', label: 'Error pages' },
        { key: 'missing', label: 'Missing' },
      ],
      onDownload: jest.fn(),
      onLocateNode: jest.fn(),
      onLocateUrl: jest.fn(),
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

    act(() => {
      duplicateChip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(getVisibleTitles()).toEqual(['pricing']);
    expect(duplicateChip.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.report-filter-active-dot')).not.toBeNull();
    expect(totalChip.disabled).toBe(false);

    act(() => {
      totalChip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(getVisibleTitles()).toEqual(['about', 'pricing', 'contact']);
    expect(container.querySelector('.report-filter-active-dot')).toBeNull();
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

    expect(filterLabels).toEqual(['Duplicate', 'Broken links', 'Error pages', 'Has image']);
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
    expect(hasImageItem.getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('.report-filter-active-dot')).not.toBeNull();
  });

  test('shows fixed report title and keeps table controls sticky while tabs scroll with the drawer body', () => {
    renderDrawer();

    expect(container.querySelector('.report-drawer-title').textContent).toBe('Scan report & insights');
    expect(container.querySelector('.report-drawer-subtitle').textContent).toBe('QA Report');
    expect(container.querySelector('.report-drawer-body .report-tabs')).not.toBeNull();
    expect(container.querySelector('.report-drawer > .report-tabs')).toBeNull();
    expect(container.querySelector('.report-divider')).toBeNull();
    expect(container.querySelector('.report-table-region > .report-controls-sticky .report-filter-row')).not.toBeNull();
    expect(container.querySelector('.report-table .report-filter-row')).toBeNull();
    expect(container.querySelector('.report-table > .report-table-header')).not.toBeNull();
    expect(container.querySelector('.report-table-header').textContent).toContain('Show');
    expect(container.querySelector('.report-table-header').textContent).not.toContain('Show on map');
    const summaryBlock = appCss.match(/\.report-summary \{[^}]*\}/)?.[0] || '';
    expect(summaryBlock).toContain('margin-bottom: var(--unit-24)');
    const searchBlock = appCss.match(/\.report-search \{[^}]*\}/)?.[0] || '';
    expect(searchBlock).toContain('max-width: 296px');
    expect(appCss).toMatch(/\.report-controls-sticky \{[\s\S]*position: sticky;[\s\S]*top: 0;/);
    const tableBlock = appCss.match(/\.report-table \{[^}]*\}/)?.[0] || '';
    expect(tableBlock).toContain('flex: 0 0 auto');
    expect(tableBlock).not.toContain('border: 1px solid');
    const tableBodyBlock = appCss.match(/\.report-table-body \{[^}]*\}/)?.[0] || '';
    expect(tableBodyBlock).toContain('flex: 0 0 auto');
    expect(tableBodyBlock).toContain('border-left: 1px solid var(--color-border)');
    const tableHeaderBlock = appCss.match(/\.report-table-header \{[^}]*\}/)?.[0] || '';
    expect(tableHeaderBlock).toContain('position: sticky');
    expect(tableHeaderBlock).toContain('top: var(--report-controls-sticky-height)');
    expect(tableHeaderBlock).toContain('border: 1px solid var(--color-border)');
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
  });

  test('locates a report row on the map from the row action', () => {
    const onLocateNode = jest.fn();
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

  test('runs insights from the empty state', () => {
    const onRunInsights = jest.fn();
    renderDrawer({ onRunInsights });

    const insightsTab = Array.from(container.querySelectorAll('[role="tab"]')).find((button) =>
      button.textContent.includes('Insights')
    );
    act(() => {
      insightsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Map Insights have not been run yet.');
    const runButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Run insights')
    );
    act(() => {
      runButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onRunInsights).toHaveBeenCalledTimes(1);
  });

  test('shows completed insights and page score in report rows', () => {
    renderDrawer({
      insights: {
        overallScore: 84,
        scores: { seo: 80, technical: 90, ia: 88, content: 75, accessibility: null },
        totals: { pages: 3, errorPages: 1, missingMetaDescriptions: 1, missingH1s: 1 },
        findings: [
          {
            id: 'seo-1',
            pageId: '1',
            url: 'https://example.com/pricing',
            category: 'seo',
            severity: 'medium',
            title: 'Missing meta description',
            description: 'Pricing is missing a description.',
            recommendation: 'Add a clear description.',
          },
          {
            id: 'technical-1',
            pageId: '3',
            url: 'https://example.com/contact',
            category: 'technical',
            severity: 'high',
            title: '4xx page',
            description: 'contact returned HTTP 404 / Not Found.',
            recommendation: 'Fix the page, redirect it, or remove stale links to it.',
            evidence: { statusCode: 404, statusLabel: 'HTTP 404 / Not Found' },
          },
        ],
        pageInsights: [
          {
            pageId: '1',
            url: 'https://example.com/pricing',
            score: 95,
            findingCount: 1,
            topFindings: [],
          },
        ],
      },
    });

    expect(container.textContent).toContain('pricing95');

    const insightsTab = Array.from(container.querySelectorAll('[role="tab"]')).find((button) =>
      button.textContent.includes('Insights')
    );
    act(() => {
      insightsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Overall Health');
    expect(container.textContent).toContain('84');
    expect(container.textContent).toContain('Missing meta description');
    expect(container.textContent).toContain('Add a clear description.');
    expect(container.textContent).toContain('HTTP 404 / Not Found');
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

  test('shows insights loading and error states', () => {
    renderDrawer({ insightsLoading: true });

    const insightsTab = Array.from(container.querySelectorAll('[role="tab"]')).find((button) =>
      button.textContent.includes('Insights')
    );
    act(() => {
      insightsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Running Insights...');

    renderDrawer({ insightsError: 'Failed to analyze scan' });
    const nextInsightsTab = Array.from(container.querySelectorAll('[role="tab"]')).find((button) =>
      button.textContent.includes('Insights')
    );
    act(() => {
      nextInsightsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Failed to analyze scan');
  });
});

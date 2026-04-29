import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import ReportDrawer from './ReportDrawer';

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
      thumbnailUrl: '',
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

  test('runs insights from the empty state', () => {
    const onRunInsights = jest.fn();
    renderDrawer({ onRunInsights });

    const insightsTab = Array.from(container.querySelectorAll('.report-tab')).find((button) =>
      button.textContent.includes('Insights')
    );
    act(() => {
      insightsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Map Insights have not been run yet.');
    const runButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Run Insights')
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

    const insightsTab = Array.from(container.querySelectorAll('.report-tab')).find((button) =>
      button.textContent.includes('Insights')
    );
    act(() => {
      insightsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Overall Health');
    expect(container.textContent).toContain('84');
    expect(container.textContent).toContain('Missing meta description');
    expect(container.textContent).toContain('Add a clear description.');
  });

  test('shows insights loading and error states', () => {
    renderDrawer({ insightsLoading: true });

    const insightsTab = Array.from(container.querySelectorAll('.report-tab')).find((button) =>
      button.textContent.includes('Insights')
    );
    act(() => {
      insightsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Running Insights...');

    renderDrawer({ insightsError: 'Failed to analyze scan' });
    const nextInsightsTab = Array.from(container.querySelectorAll('.report-tab')).find((button) =>
      button.textContent.includes('Insights')
    );
    act(() => {
      nextInsightsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Failed to analyze scan');
  });
});

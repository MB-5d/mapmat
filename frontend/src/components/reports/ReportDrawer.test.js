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
});

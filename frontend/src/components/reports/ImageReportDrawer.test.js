import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import ImageReportDrawer from './ImageReportDrawer';

describe('ImageReportDrawer', () => {
  let container;
  let root;
  let props;

  const issues = [
    {
      id: 'n1:file',
      nodeId: 'n1',
      pageNumber: '40',
      title: 'Handbook',
      url: 'https://example.com/file.pdf',
      type: 'file',
      label: 'PDF/file',
      detail: 'Files cannot be captured as images',
    },
    {
      id: 'n2:auth',
      nodeId: 'n2',
      pageNumber: '41',
      title: 'Portal',
      url: 'https://example.com/portal',
      type: 'auth',
      label: 'Requires login',
      detail: 'Requires SSO',
    },
  ];

  const renderDrawer = (nextProps = {}) => {
    props = {
      isOpen: true,
      onClose: jest.fn(),
      issues,
      onSelectIssue: jest.fn(),
      onOpenIssueUrl: jest.fn(),
      reportTitle: 'QA Report',
      ...nextProps,
    };

    act(() => {
      root.render(<ImageReportDrawer {...props} />);
    });
  };

  const setInputValue = (element, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    descriptor.set.call(element, value);
  };

  const getListText = () => container.querySelector('.image-report-list')?.textContent || '';

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

  test('renders an empty state and closes from the header', () => {
    const onClose = jest.fn();
    renderDrawer({ issues: [], onClose });

    expect(container.textContent).toContain('Image report - QA Report');
    expect(container.textContent).toContain('0 image issues');
    expect(container.textContent).toContain('No image issues found.');

    const closeButton = container.querySelector('button[aria-label="Close image report"]');
    act(() => {
      closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('renders populated issues and reuses select and open actions', () => {
    renderDrawer();

    expect(container.textContent).toContain('2 image issues');
    expect(container.textContent).toContain('PDF/file');
    expect(container.textContent).toContain('Requires login');
    expect(container.textContent).toContain('Files cannot be captured as images');

    const buttons = Array.from(container.querySelectorAll('button'));
    const selectButton = buttons.find((button) => button.textContent.includes('Select'));
    const openButton = buttons.find((button) => button.textContent.includes('Open'));

    act(() => {
      selectButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      openButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(props.onSelectIssue).toHaveBeenCalledWith(issues[0]);
    expect(props.onOpenIssueUrl).toHaveBeenCalledWith(issues[0]);
  });

  test('searches and filters issue rows', () => {
    renderDrawer();

    const searchInput = container.querySelector('.report-search input');
    act(() => {
      setInputValue(searchInput, 'portal');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(getListText()).toContain('Portal');
    expect(getListText()).not.toContain('Handbook');

    act(() => {
      setInputValue(searchInput, '');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const filterToggle = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Filter by issue')
    );
    act(() => {
      filterToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const fileFilter = Array.from(container.querySelectorAll('.report-filter-item')).find((item) =>
      item.textContent.includes('PDF/file')
    );
    const fileCheckbox = fileFilter.querySelector('input[type="checkbox"]');
    act(() => {
      fileCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(getListText()).toContain('Portal');
    expect(getListText()).not.toContain('Handbook');
  });
});

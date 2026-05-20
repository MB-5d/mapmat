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
      selectedNodeIds: new Set(),
      onSelectionChange: jest.fn(),
      onCaptureSelectedThumbnails: jest.fn(),
      onCaptureSelectedScreenshots: jest.fn(),
      onRetryMissingThumbnails: jest.fn(),
      onRetryMissingScreenshots: jest.fn(),
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
  const getVisibleTitles = () => (
    Array.from(container.querySelectorAll('.image-report-row-title strong')).map((node) => node.textContent.trim())
  );

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

  test('selects rows, supports shift range selection, and selects all visible rows', () => {
    const onSelectionChange = jest.fn();
    renderDrawer({ onSelectionChange });

    const handbookCheckbox = container.querySelector('input[aria-label="Select Handbook"]');
    const portalCheckbox = container.querySelector('input[aria-label="Select Portal"]');
    const selectAllCheckbox = container.querySelector('input[aria-label="Select all visible image issues"]');

    act(() => {
      handbookCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith(['n1']);

    act(() => {
      portalCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith(['n1', 'n2']);

    act(() => {
      selectAllCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith(['n1', 'n2']);
  });

  test('runs image capture actions from the drawer toolbar', () => {
    renderDrawer({
      selectedNodeIds: new Set(['n1']),
      hasMissingThumbnails: true,
      hasMissingScreenshots: true,
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const captureVisible = buttons.find((button) => button.textContent.includes('Capture selected visible area'));
    const captureFull = buttons.find((button) => button.textContent.includes('Capture selected full page'));
    const retryVisible = buttons.find((button) => button.textContent.includes('Retry missing visible area'));
    const retryFull = buttons.find((button) => button.textContent.includes('Retry missing full page'));

    act(() => {
      captureVisible.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      captureFull.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      retryVisible.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      retryFull.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(props.onCaptureSelectedThumbnails).toHaveBeenCalledTimes(1);
    expect(props.onCaptureSelectedScreenshots).toHaveBeenCalledTimes(1);
    expect(props.onRetryMissingThumbnails).toHaveBeenCalledTimes(1);
    expect(props.onRetryMissingScreenshots).toHaveBeenCalledTimes(1);
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

  test('sorts the issue list with report-style controls', () => {
    renderDrawer();

    expect(getVisibleTitles()).toEqual(['Handbook', 'Portal']);

    const pageSortButton = Array.from(container.querySelectorAll('.image-report-list-header .report-sort-button')).find(
      (button) => button.textContent.includes('Page')
    );

    act(() => {
      pageSortButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      pageSortButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(getVisibleTitles()).toEqual(['Portal', 'Handbook']);
  });

  test('uses a scrollable list area and back to top action', () => {
    renderDrawer();

    const listShell = container.querySelector('.image-report-list-shell');
    listShell.scrollTo = jest.fn();
    listShell.scrollTop = 300;

    act(() => {
      listShell.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    const backToTop = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Back to top')
    );

    expect(backToTop).not.toBeUndefined();

    act(() => {
      backToTop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(listShell.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});

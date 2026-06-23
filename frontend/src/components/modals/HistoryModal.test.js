import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import HistoryModal from './HistoryModal';

describe('HistoryModal', () => {
  let container;
  let root;

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
    jest.clearAllMocks();
  });

  test('uses icon delete action and select controls for history actions', () => {
    const onDeleteSelected = jest.fn();
    const scanHistory = [
      {
        id: 'scan-1',
        hostname: 'example.com',
        url: 'https://example.com',
        page_count: 4,
        scanned_at: '2026-04-15T12:00:00.000Z',
      },
      {
        id: 'scan-2',
        hostname: 'large.example.com',
        url: 'https://large.example.com',
        page_count: 40,
        scanned_at: '2026-04-14T12:00:00.000Z',
      },
    ];

    act(() => {
      root.render(
        <HistoryModal
          show
          onClose={jest.fn()}
          scanHistory={scanHistory}
          selectedHistoryItems={new Set(['scan-1'])}
          onToggleSelection={jest.fn()}
          onSelectAllToggle={jest.fn()}
          onDeleteSelected={onDeleteSelected}
          onLoadFromHistory={jest.fn()}
        />
      );
    });

    const deleteButton = container.querySelector('button[aria-label="Delete selected (1)"]');
    const sortSelect = container.querySelector('select');

    expect(deleteButton).not.toBeNull();
    expect(deleteButton.className).toContain('ui-icon-btn');
    expect(deleteButton.className).toContain('ui-icon-btn--type-primary');
    expect(sortSelect).not.toBeNull();
    expect(sortSelect.className).toContain('ui-select');
    expect(Array.from(sortSelect.options).map((option) => option.textContent)).toContain('Page count');
    expect(container.textContent).toContain('Scan history');
    expect(container.textContent).not.toContain('HistoryScan history');

    act(() => {
      deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDeleteSelected).toHaveBeenCalledTimes(1);

    act(() => {
      sortSelect.value = 'pageCount';
      sortSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.querySelector('.history-hostname')?.textContent).toBe('large.example.com');
  });

  test('shows the shared back-to-top button after scrolling the history list', () => {
    const scanHistory = Array.from({ length: 3 }, (_, index) => ({
      id: `scan-${index}`,
      hostname: `example-${index}.com`,
      url: `https://example-${index}.com`,
      page_count: index + 1,
      scanned_at: `2026-04-1${index}T12:00:00.000Z`,
    }));

    act(() => {
      root.render(
        <HistoryModal
          show
          onClose={jest.fn()}
          scanHistory={scanHistory}
          selectedHistoryItems={new Set()}
          onToggleSelection={jest.fn()}
          onSelectAllToggle={jest.fn()}
          onDeleteSelected={jest.fn()}
          onLoadFromHistory={jest.fn()}
        />
      );
    });

    expect(container.querySelector('.drawer-back-to-top')).toBeNull();

    const historyList = container.querySelector('.history-list');
    const historyActions = container.querySelector('.history-actions');
    expect(historyList.contains(historyActions)).toBe(true);
    historyList.scrollTop = 260;

    act(() => {
      historyList.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    const backToTop = container.querySelector('.drawer-back-to-top');
    expect(backToTop).not.toBeNull();
    expect(backToTop.textContent).toContain('Back to top');
    expect(historyList.contains(backToTop)).toBe(false);
  });
});

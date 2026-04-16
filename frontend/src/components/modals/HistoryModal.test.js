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

  test('uses shared button and select controls for history actions', () => {
    const onDeleteSelected = jest.fn();
    const scanHistory = [
      {
        id: 'scan-1',
        hostname: 'example.com',
        url: 'https://example.com',
        page_count: 4,
        scanned_at: '2026-04-15T12:00:00.000Z',
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

    const deleteButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Delete Selected')
    );
    const sortSelect = container.querySelector('select');

    expect(deleteButton).not.toBeNull();
    expect(deleteButton.className).toContain('ui-btn');
    expect(sortSelect).not.toBeNull();
    expect(sortSelect.className).toContain('ui-select');

    act(() => {
      deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDeleteSelected).toHaveBeenCalledTimes(1);
  });
});

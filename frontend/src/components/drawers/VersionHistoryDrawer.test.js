import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import VersionHistoryDrawer from './VersionHistoryDrawer';

const isoDateForOffset = (monthOffset = 0, day = 12) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + monthOffset, day, 10, 30).toISOString();
};

const monthLabel = (dateString) => new Date(dateString).toLocaleString([], {
  month: 'long',
  year: 'numeric',
});

const dateLabel = (dateString) => new Date(dateString).toLocaleDateString([], {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

describe('VersionHistoryDrawer', () => {
  let container;
  let root;

  const renderDrawer = async (props = {}) => {
    await act(async () => {
      root.render(
        <VersionHistoryDrawer
          isOpen
          onClose={jest.fn()}
          versions={[]}
          onRestoreVersion={jest.fn()}
          activeVersionId={null}
          latestVersionId={null}
          isLoading={false}
          onAddVersion={jest.fn()}
          canAddVersion
          canViewActivity
          activity={[]}
          isActivityLoading={false}
          {...props}
        />
      );
    });
  };

  const clickByText = async (text) => {
    const button = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent.includes(text)
    );
    expect(button).toBeTruthy();
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    return button;
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
    jest.clearAllMocks();
  });

  test('groups versions by month and date with current month open and dates collapsed', async () => {
    const currentDate = isoDateForOffset(0, 12);
    const previousDate = isoDateForOffset(-1, 12);
    await renderDrawer({
      latestVersionId: 'v-current',
      versions: [
        { id: 'v-current', version_number: 4, name: 'Client review', created_at: currentDate },
        { id: 'v-auto', version_number: 3, name: 'Autosaved', created_at: currentDate },
        { id: 'v-initial', version_number: 1, name: 'Initial', created_at: previousDate },
      ],
    });

    expect(container.textContent).toContain(monthLabel(currentDate));
    expect(container.textContent).toContain(dateLabel(currentDate));
    expect(container.textContent).toContain(monthLabel(previousDate));
    expect(container.textContent).not.toContain('Client review');

    await clickByText(dateLabel(currentDate));

    expect(container.textContent).toContain('Client review');
    expect(container.textContent).toContain('Current');
    expect(container.textContent).toContain('Manual');
    expect(container.textContent).toContain('Autosaved');
  });

  test('groups activity by month and date while keeping actor details in activity rows', async () => {
    const currentDate = isoDateForOffset(0, 10);
    await renderDrawer({
      activity: [
        {
          id: 'a1',
          eventScope: 'content',
          entityType: 'node',
          summary: 'Updated node',
          actor: { name: 'Maya' },
          createdAt: currentDate,
        },
      ],
    });

    await clickByText('Activity');

    expect(container.textContent).toContain(monthLabel(currentDate));
    expect(container.textContent).toContain(dateLabel(currentDate));
    expect(container.textContent).not.toContain('Updated node');

    await clickByText(dateLabel(currentDate));

    expect(container.textContent).toContain('Updated node');
    expect(container.textContent).toContain('Maya');
    expect(container.textContent).toContain('Edit');
  });

  test('uses shared controls for timeline actions', async () => {
    await renderDrawer();

    const addButton = container.querySelector('button[aria-label="Add version"]');
    expect(addButton.className).toContain('ui-icon-btn');

    const body = container.querySelector('.account-drawer-body');
    await act(async () => {
      Object.defineProperty(body, 'scrollTop', { configurable: true, value: 300 });
      body.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    const backToTop = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.includes('Back to top')
    );
    expect(backToTop.className).toContain('ui-btn');
  });
});

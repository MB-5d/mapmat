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
          onBookmarkVersion={jest.fn()}
          canBookmarkVersion={false}
          canViewActivity={false}
          currentUser={{ name: 'Alex' }}
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

  const setInputValue = (element, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const setTextareaValue = (element, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
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
    expect(container.textContent).toContain('Version 3');
    expect(container.textContent).not.toContain('Current');
    expect(container.textContent).not.toContain('Manual');
    expect(container.textContent).not.toContain('Autosaved');
  });

  test('groups activity by month and date while keeping actor details in activity rows', async () => {
    const currentDate = isoDateForOffset(0, 10);
    await renderDrawer({
      canViewActivity: true,
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

  test('bookmarks an existing version from the row action', async () => {
    const currentDate = isoDateForOffset(0, 12);
    const onBookmarkVersion = jest.fn().mockResolvedValue({});
    await renderDrawer({
      canBookmarkVersion: true,
      onBookmarkVersion,
      versions: [
        { id: 'v-auto', version_number: 3, name: 'Autosaved', created_at: currentDate },
      ],
    });

    await clickByText(dateLabel(currentDate));

    const bookmarkButton = container.querySelector('button[aria-label="Bookmark version"]');
    expect(bookmarkButton.className).toContain('ui-icon-btn');
    await act(async () => {
      bookmarkButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const titleInput = container.querySelector('input');
    const notesInput = container.querySelector('textarea');
    await act(async () => {
      setInputValue(titleInput, 'Launch checkpoint');
      setTextareaValue(notesInput, 'Ready for review');
    });

    await clickByText('Save');

    expect(onBookmarkVersion).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'v-auto' }),
      { name: 'Launch checkpoint', notes: 'Ready for review' }
    );
  });

  test('uses shared controls for back-to-top action', async () => {
    await renderDrawer();

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

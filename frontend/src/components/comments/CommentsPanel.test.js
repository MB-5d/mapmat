import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import CommentsPanel from './CommentsPanel';

describe('CommentsPanel', () => {
  let container;
  let root;

  const currentUser = { id: 'user-1', name: 'Alex', email: 'alex@example.com' };

  const setInputValue = (element, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    descriptor.set.call(element, value);
  };

  const rootNode = {
    id: 'root',
    title: 'Home',
    comments: [
      {
        id: 'c1',
        author: 'Alex',
        authorUserId: 'user-1',
        text: 'Keep this open',
        createdAt: '2026-04-15T12:00:00.000Z',
        completed: false,
      },
      {
        id: 'c2',
        author: 'Sam',
        authorUserId: 'user-2',
        text: 'Done already',
        createdAt: '2026-04-15T11:00:00.000Z',
        completed: true,
        completedBy: 'Sam',
        completedAt: '2026-04-15T11:30:00.000Z',
        mentions: ['Alex'],
      },
    ],
    children: [],
  };

  const renderPanel = (props = {}) => {
    const defaults = {
      isOpen: true,
      root: rootNode,
      orphans: [],
      currentUser,
      onClose: jest.fn(),
      onCommentClick: jest.fn(),
      onNavigateToNode: jest.fn(),
    };
    const merged = { ...defaults, ...props };
    act(() => {
      root.render(<CommentsPanel {...merged} />);
    });
    return merged;
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

  test('uses comments drawer search, sort, and Show resolved without legacy filter controls', () => {
    renderPanel();

    expect(container.textContent).toContain('Comments');
    expect(container.textContent).not.toContain('All Comments');
    expect(container.textContent).not.toContain('Show completed');
    expect(container.textContent).toContain('Show resolved');
    expect(container.querySelector('input[placeholder="Search comments"]')).not.toBeNull();
    expect(container.querySelector('.comments-filter-input .ui-search-input.ui-input-shell--sm')).not.toBeNull();
    expect(container.querySelector('.comments-filter-row .comments-panel-show-resolved')).toBeNull();
    expect(container.querySelector('button[aria-label="Filter comments"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Sort comments: Newest"]')).not.toBeNull();
    expect(container.querySelector('.comments-filter-toggle')).toBeNull();
    expect(container.querySelector('select')).toBeNull();
  });

  test('uses the compact ghost sort menu and only shows Resolved when resolved comments are visible', () => {
    renderPanel();

    const sortButton = container.querySelector('button[aria-label="Sort comments: Newest"]');
    expect(sortButton.className).toContain('ui-icon-btn--type-ghost');
    expect(sortButton.className).toContain('ui-icon-btn--style-mono');

    act(() => {
      sortButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Newest');
    expect(container.textContent).toContain('My mentions');
    expect(container.textContent).not.toContain('Resolved');
    expect(container.querySelector('.comments-panel-menu-dot')).not.toBeNull();

    act(() => {
      sortButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const showResolved = container.querySelector('.comments-panel-show-resolved input[type="checkbox"]');
    act(() => {
      showResolved.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      sortButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Resolved');
  });

  test('hides resolved comments by default and shows them when Show resolved is checked', () => {
    renderPanel({ canResolveComments: true, onToggleCompleted: jest.fn() });

    expect(container.textContent).toContain('Keep this open');
    expect(container.textContent).not.toContain('Done already');

    const showResolved = container.querySelector('.comments-panel-show-resolved input[type="checkbox"]');
    act(() => {
      showResolved.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Done already');
    const resolved = Array.from(container.querySelectorAll('.comments-panel-item'))
      .find((item) => item.textContent.includes('Done already'));
    expect(resolved.className).toContain('is-resolved');
    expect(resolved.querySelector('.comments-panel-complete.checked')).not.toBeNull();
    expect(resolved.querySelector('.comments-panel-completed-info')?.textContent).toContain('Sam');
  });

  test('shows back to top after drawer body scroll and smooth-scrolls to the top', () => {
    renderPanel();

    const body = container.querySelector('.comments-panel-body');
    expect(body).not.toBeNull();
    expect(container.querySelector('.drawer-back-to-top')).toBeNull();

    body.scrollTo = jest.fn();
    Object.defineProperty(body, 'scrollTop', {
      configurable: true,
      value: 300,
    });

    act(() => {
      body.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    const button = container.querySelector('.drawer-back-to-top');
    expect(button).not.toBeNull();
    expect(button.textContent).toContain('Back to top');
    expect(button.querySelector('.ui-icon__svg')).not.toBeNull();

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(body.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  test('clears comment search from the shared search input', () => {
    renderPanel();

    const input = container.querySelector('input[placeholder="Search comments"]');

    act(() => {
      setInputValue(input, 'Keep');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.textContent).toContain('Keep this open');
    expect(container.textContent).not.toContain('Done already');

    const clearButton = container.querySelector('button[aria-label="Clear search"]');

    act(() => {
      clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(input.value).toBe('');
    expect(container.textContent).toContain('Keep this open');
  });

  test('marks the selected comment and reports node/comment ids in one click', () => {
    const onCommentClick = jest.fn();
    const onNavigateToNode = jest.fn();

    renderPanel({
      selectedCommentId: 'c1',
      onCommentClick,
      onNavigateToNode,
    });

    const selected = container.querySelector('.comments-panel-item.is-selected');
    expect(selected).not.toBeNull();
    expect(selected.textContent).toContain('Keep this open');

    act(() => {
      selected.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onNavigateToNode).not.toHaveBeenCalled();
    expect(onCommentClick).toHaveBeenCalledWith('root', 'c1');
  });

  test('deletes from the drawer only for the comment author', () => {
    const onCommentClick = jest.fn();
    const onDeleteComment = jest.fn();

    renderPanel({
      selectedCommentId: 'c1',
      onCommentClick,
      onDeleteComment,
    });

    const deleteButton = container.querySelector('button[aria-label="Delete comment"]');
    expect(deleteButton.className).toContain('ui-icon-btn--xs');

    act(() => {
      deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDeleteComment).toHaveBeenCalledWith('root', 'c1');
    expect(onCommentClick).not.toHaveBeenCalled();

    renderPanel({
      currentUser: { id: 'user-3', name: 'Other' },
      onDeleteComment,
    });
    expect(container.querySelector('button[aria-label="Delete comment"]')).toBeNull();
  });

  test('toggles completed state directly from the drawer only for resolvers', () => {
    const onToggleCompleted = jest.fn();

    renderPanel({
      onToggleCompleted,
      canResolveComments: true,
    });

    const toggleButton = container.querySelector('button[aria-label="Mark comment as complete"]');
    act(() => {
      toggleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggleCompleted).toHaveBeenCalledWith('root', 'c1');

    renderPanel({
      onToggleCompleted,
      canResolveComments: false,
    });
    expect(container.querySelector('button[aria-label="Mark comment as complete"]')).toBeNull();
  });

  test('uses the drawer card layout without the legacy expand control', () => {
    renderPanel({
      onDeleteComment: jest.fn(),
      onToggleCompleted: jest.fn(),
      canResolveComments: true,
    });

    expect(container.querySelector('.comments-panel-expand')).toBeNull();
    expect(container.querySelector('button[aria-label="Expand comment"]')).toBeNull();
    expect(container.querySelector('.comments-panel-actions')).not.toBeNull();
    expect(container.querySelector('.comments-panel-text')).not.toBeNull();
  });

  test('marks selected comments even when id types differ', () => {
    renderPanel({
      root: {
        id: 'root',
        title: 'Home',
        comments: [
          {
            id: 12,
            author: 'Alex',
            authorUserId: 'user-1',
            text: 'Numeric id',
            createdAt: '2026-04-15T12:00:00.000Z',
            completed: false,
          },
        ],
        children: [],
      },
      selectedCommentId: '12',
    });

    const selected = container.querySelector('.comments-panel-item.is-selected');
    expect(selected).not.toBeNull();
    expect(selected.textContent).toContain('Numeric id');
  });
});

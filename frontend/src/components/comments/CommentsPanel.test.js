import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import CommentsPanel from './CommentsPanel';

describe('CommentsPanel', () => {
  let container;
  let root;

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
        text: 'Keep this open',
        createdAt: '2026-04-15T12:00:00.000Z',
        completed: false,
      },
      {
        id: 'c2',
        author: 'Sam',
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

  test('uses comments drawer search and sort without legacy filter controls', () => {
    act(() => {
      root.render(
        <CommentsPanel
          isOpen
          root={rootNode}
          orphans={[]}
          onClose={jest.fn()}
          onCommentClick={jest.fn()}
          onNavigateToNode={jest.fn()}
        />
      );
    });

    expect(container.textContent).toContain('Comments');
    expect(container.textContent).not.toContain('All Comments');
    expect(container.textContent).not.toContain('Show completed');
    expect(container.querySelector('input[placeholder="Search comments"]')).not.toBeNull();
    expect(container.querySelector('.comments-filter-input.ui-input-shell--sm')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Filter comments"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Sort comments: Newest"]')).not.toBeNull();
    expect(container.querySelector('.comments-filter-toggle')).toBeNull();
    expect(container.querySelector('select')).toBeNull();
  });

  test('uses the compact sort menu and marks the active option with a dot', () => {
    act(() => {
      root.render(
        <CommentsPanel
          isOpen
          root={rootNode}
          orphans={[]}
          currentUser={{ name: 'Alex', email: 'alex@example.com' }}
          onClose={jest.fn()}
          onCommentClick={jest.fn()}
          onNavigateToNode={jest.fn()}
        />
      );
    });

    expect(container.querySelector('.comments-panel-item')?.textContent).toContain('Keep this open');

    const sortButton = container.querySelector('button[aria-label="Sort comments: Newest"]');
    expect(sortButton.className).toContain('ui-icon-btn--type-secondary');
    expect(sortButton.className).toContain('ui-icon-btn--style-mono');

    act(() => {
      sortButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(sortButton.className).not.toContain('ui-icon-btn--active');
    expect(container.textContent).toContain('Newest');
    expect(container.textContent).toContain('My mentions');
    expect(container.querySelector('.comments-panel-menu-dot')).not.toBeNull();

    const mentionsOption = Array.from(container.querySelectorAll('.comments-panel-menu-item'))
      .find((button) => button.textContent.includes('My mentions'));

    act(() => {
      mentionsOption.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('button[aria-label="Sort comments: My mentions"]')).not.toBeNull();
    expect(container.querySelector('.comments-panel-item')?.textContent).toContain('Done already');
  });

  test('clears comment search from the shared search input', () => {
    act(() => {
      root.render(
        <CommentsPanel
          isOpen
          root={rootNode}
          orphans={[]}
          onClose={jest.fn()}
          onCommentClick={jest.fn()}
          onNavigateToNode={jest.fn()}
        />
      );
    });

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
    expect(container.textContent).toContain('Done already');
  });

  test('marks the selected comment and reports node/comment ids in one click', () => {
    const onCommentClick = jest.fn();
    const onNavigateToNode = jest.fn();

    act(() => {
      root.render(
        <CommentsPanel
          isOpen
          root={rootNode}
          orphans={[]}
          selectedCommentId="c1"
          onClose={jest.fn()}
          onCommentClick={onCommentClick}
          onNavigateToNode={onNavigateToNode}
        />
      );
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

  test('deletes from the drawer without opening the comment popover', () => {
    const onCommentClick = jest.fn();
    const onDeleteComment = jest.fn();

    act(() => {
      root.render(
        <CommentsPanel
          isOpen
          root={rootNode}
          orphans={[]}
          selectedCommentId="c1"
          onClose={jest.fn()}
          onCommentClick={onCommentClick}
          onDeleteComment={onDeleteComment}
          onNavigateToNode={jest.fn()}
        />
      );
    });

    const deleteButton = container.querySelector('button[aria-label="Delete comment"]');
    expect(deleteButton.className).toContain('ui-icon-btn--xs');

    act(() => {
      deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDeleteComment).toHaveBeenCalledWith('root', 'c1');
    expect(onCommentClick).not.toHaveBeenCalled();
  });

  test('toggles completed state directly from the drawer and shows resolved details in the meta row', () => {
    const onToggleCompleted = jest.fn();

    act(() => {
      root.render(
        <CommentsPanel
          isOpen
          root={rootNode}
          orphans={[]}
          onClose={jest.fn()}
          onCommentClick={jest.fn()}
          onToggleCompleted={onToggleCompleted}
          onNavigateToNode={jest.fn()}
        />
      );
    });

    const toggleButton = container.querySelector('button[aria-label="Mark comment as complete"]');

    act(() => {
      toggleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggleCompleted).toHaveBeenCalledWith('root', 'c1');
    const resolved = Array.from(container.querySelectorAll('.comments-panel-item'))
      .find((item) => item.textContent.includes('Done already'));
    expect(resolved).not.toBeNull();
    expect(resolved.className).toContain('is-resolved');
    expect(resolved.querySelector('.comments-panel-complete.checked')).not.toBeNull();
    expect(resolved.querySelector('.comments-panel-completed-info')?.textContent).toContain('Sam');
  });

  test('uses the new drawer card actions without the legacy expand control', () => {
    act(() => {
      root.render(
        <CommentsPanel
          isOpen
          root={rootNode}
          orphans={[]}
          onClose={jest.fn()}
          onCommentClick={jest.fn()}
          onDeleteComment={jest.fn()}
          onToggleCompleted={jest.fn()}
          onNavigateToNode={jest.fn()}
        />
      );
    });

    expect(container.querySelector('.comments-panel-expand')).toBeNull();
    expect(container.querySelector('button[aria-label="Expand comment"]')).toBeNull();
    expect(container.querySelector('.comments-panel-actions')).not.toBeNull();
    expect(container.querySelector('.comments-panel-text')).not.toBeNull();
  });

  test('ignores legacy expanded comment overrides in the drawer card layout', () => {
    act(() => {
      root.render(
        <CommentsPanel
          isOpen
          root={rootNode}
          orphans={[]}
          expandedCommentIdsOverride={['c1']}
          onClose={jest.fn()}
          onCommentClick={jest.fn()}
          onNavigateToNode={jest.fn()}
        />
      );
    });

    expect(container.querySelector('.comments-panel-text.is-expanded')).toBeNull();
    expect(container.querySelector('.comments-panel-text')).not.toBeNull();
  });

  test('marks selected comments even when id types differ', () => {
    act(() => {
      root.render(
        <CommentsPanel
          isOpen
          root={{
            id: 'root',
            title: 'Home',
            comments: [
              {
                id: 12,
                author: 'Alex',
                text: 'Numeric id',
                createdAt: '2026-04-15T12:00:00.000Z',
                completed: false,
              },
            ],
            children: [],
          }}
          orphans={[]}
          selectedCommentId="12"
          onClose={jest.fn()}
          onCommentClick={jest.fn()}
          onNavigateToNode={jest.fn()}
        />
      );
    });

    const selected = container.querySelector('.comments-panel-item.is-selected');
    expect(selected).not.toBeNull();
    expect(selected.textContent).toContain('Numeric id');
  });
});

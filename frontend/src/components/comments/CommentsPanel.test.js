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

  test('hides completed comments when the toggle is off', () => {
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

    expect(container.textContent).toContain('Done already');

    const toggle = container.querySelector('.comments-filter-toggle input[type="checkbox"]');

    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).not.toContain('Done already');
    expect(container.textContent).toContain('Keep this open');
  });

  test('uses comments drawer search without the legacy type dropdown', () => {
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
    expect(container.querySelector('input[placeholder="Search comments"]')).not.toBeNull();
    expect(container.querySelector('select')).toBeNull();
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
    expect(deleteButton.className).toContain('ui-icon-btn--xxs');

    act(() => {
      deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDeleteComment).toHaveBeenCalledWith('root', 'c1');
    expect(onCommentClick).not.toHaveBeenCalled();
  });

  test('toggles completed state directly from the drawer and shows completed details in the footer', () => {
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
    expect(container.textContent).toContain('Completed by Sam');
  });

  test('expands a drawer comment without navigating', () => {
    const onCommentClick = jest.fn();

    act(() => {
      root.render(
        <CommentsPanel
          isOpen
          root={rootNode}
          orphans={[]}
          onClose={jest.fn()}
          onCommentClick={onCommentClick}
          onNavigateToNode={jest.fn()}
        />
      );
    });

    const expandButton = container.querySelector('button[aria-label="Expand comment"]');

    act(() => {
      expandButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCommentClick).not.toHaveBeenCalled();
    expect(container.querySelector('.comments-panel-text.is-expanded')).not.toBeNull();
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

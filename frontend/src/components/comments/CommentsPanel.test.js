import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import CommentsPanel from './CommentsPanel';

describe('CommentsPanel', () => {
  let container;
  let root;

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

    expect(onNavigateToNode).toHaveBeenCalledWith('root');
    expect(onCommentClick).toHaveBeenCalledWith('root', 'c1');
  });
});

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
});

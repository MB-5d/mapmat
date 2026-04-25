import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { NodeCard } from './NodeCard';

describe('NodeCard', () => {
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
  });

  test('renders shared node-adjacent primitives and icon actions', () => {
    const node = {
      id: 'node-1',
      title: 'Watch Interrupt Live Online Free | LangChain AI',
      url: 'https://example.com',
      comments: [{ id: '1' }, { id: '2' }],
      annotations: {
        status: 'to_move',
        note: 'Needs to move',
        tags: ['Subdomain'],
      },
    };

    act(() => {
      root.render(
        <NodeCard
          node={node}
          number="s1.4"
          color="#0ea5e9"
          showThumbnails={false}
          showCommentBadges
          canEdit
          canComment
          showCommentAction
          badges={['Subdomain']}
          onDelete={jest.fn()}
          onEdit={jest.fn()}
          onDuplicate={jest.fn()}
          onViewImage={jest.fn()}
          onAddNote={jest.fn()}
          onViewNotes={jest.fn()}
        />
      );
    });

    expect(container.querySelector('.comment-badge')).not.toBeNull();
    expect(container.querySelector('.node-status-badge.status-to_move')).not.toBeNull();
    expect(container.querySelector('.node-badge')).not.toBeNull();
    expect(container.querySelector('.page-number')?.textContent).toBe('s1.4');
    expect(container.querySelectorAll('.node-card-action.ui-icon-btn')).toHaveLength(4);
  });
});

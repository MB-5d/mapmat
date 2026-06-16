import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import CommentPopover from './CommentPopover';

describe('CommentPopover', () => {
  let container;
  let root;

  const setTextareaValue = (element, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    descriptor.set.call(element, value);
  };

  const node = {
    id: 'node-1',
    title: 'Homepage',
    comments: [
      {
        id: 'comment-1',
        author: 'Alex',
        text: 'Needs follow-up',
        createdAt: '2026-04-15T12:00:00.000Z',
        completed: false,
        replies: [],
      },
    ],
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

  test('starts a reply and submits a new comment', () => {
    const onAddComment = jest.fn();
    const onClose = jest.fn();

    act(() => {
      root.render(
        <CommentPopover
          node={node}
          onClose={onClose}
          onAddComment={onAddComment}
          onToggleCompleted={jest.fn()}
          collaborators={['Alex', 'Sam']}
          canComment
        />
      );
    });

    const replyButton = container.querySelector('button[aria-label="Reply to comment"]');

    act(() => {
      replyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Replying to comment');

    const textarea = container.querySelector('textarea');

    act(() => {
      setTextareaValue(textarea, 'Follow up with design');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save')
    );

    act(() => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAddComment).toHaveBeenCalledWith('node-1', 'Follow up with design', 'comment-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('toggles comment completion', () => {
    const onToggleCompleted = jest.fn();

    act(() => {
      root.render(
        <CommentPopover
          node={node}
          onClose={jest.fn()}
          onAddComment={jest.fn()}
          onToggleCompleted={onToggleCompleted}
          collaborators={[]}
          canComment
        />
      );
    });

    const toggleButton = container.querySelector('button[aria-label="Mark comment as complete"]');

    act(() => {
      toggleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggleCompleted).toHaveBeenCalledWith('node-1', 'comment-1');
  });

  test('keeps complete and reply actions visible while omitting delete', () => {
    act(() => {
      root.render(
        <CommentPopover
          node={node}
          onClose={jest.fn()}
          onAddComment={jest.fn()}
          onToggleCompleted={jest.fn()}
          collaborators={[]}
          canComment
        />
      );
    });

    expect(container.querySelector('.comment-complete-btn.ui-icon-btn--xs')).not.toBeNull();
    expect(container.querySelector('.comment-reply-btn.ui-icon-btn--xs')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Delete comment"]')).toBeNull();
  });

  test('uses the shared modal shell classes without a centered overlay', () => {
    act(() => {
      root.render(
        <CommentPopover
          node={node}
          onClose={jest.fn()}
          onAddComment={jest.fn()}
          onToggleCompleted={jest.fn()}
          collaborators={[]}
          canComment
        />
      );
    });

    expect(container.querySelector('.comment-popover.modal-card')).not.toBeNull();
    expect(container.querySelector('.comment-popover-header.modal-header')).not.toBeNull();
    expect(container.querySelector('.comment-popover-body.modal-body')).not.toBeNull();
    expect(container.querySelector('.comment-popover-footer.modal-footer')).not.toBeNull();
    expect(container.querySelector('.modal-overlay')).toBeNull();
  });

  test('marks the active comment even when id types differ', () => {
    act(() => {
      root.render(
        <CommentPopover
          node={{
            ...node,
            comments: [{ ...node.comments[0], id: 12 }],
          }}
          activeCommentId="12"
          onClose={jest.fn()}
          onAddComment={jest.fn()}
          onToggleCompleted={jest.fn()}
          collaborators={[]}
          canComment
        />
      );
    });

    const activeComment = container.querySelector('.comment-item.is-active');
    expect(activeComment).not.toBeNull();
    expect(activeComment.textContent).toContain('Needs follow-up');
  });
});

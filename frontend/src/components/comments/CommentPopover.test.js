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
          onDeleteComment={jest.fn()}
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
          onDeleteComment={jest.fn()}
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
});

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
        id: 'comment-old',
        author: 'Alex',
        text: 'Older follow-up',
        createdAt: '2026-04-15T12:00:00.000Z',
        completed: false,
        replies: [],
      },
      {
        id: 'comment-new',
        author: 'Sam',
        text: 'Newest comment @Alex',
        createdAt: '2026-04-16T12:00:00.000Z',
        completed: true,
        completedBy: 'Jennifer',
        completedAt: '2026-04-16T13:00:00.000Z',
        replies: [
          {
            id: 'reply-1',
            author: 'Jordan',
            text: 'Nested reply',
            createdAt: '2026-04-16T12:30:00.000Z',
            completed: false,
            replies: [],
          },
        ],
      },
    ],
  };

  const renderPopover = (props = {}) => {
    const defaults = {
      node,
      onClose: jest.fn(),
      onAddComment: jest.fn(),
      onUpdateComment: jest.fn(),
      onDeleteComment: jest.fn(),
      onToggleCompleted: jest.fn(),
      onSetCommentsCompleted: jest.fn(),
      onDeleteAllComments: jest.fn(),
      collaborators: ['Alex', 'Sam', 'Jennifer'],
      canComment: true,
    };
    const merged = { ...defaults, ...props };
    act(() => {
      root.render(<CommentPopover {...merged} />);
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

  test('uses the no-footer popover shell and renders newest top-level comments first', () => {
    renderPopover();

    expect(container.querySelector('.comment-popover.modal-card')).not.toBeNull();
    expect(container.querySelector('.comment-popover-header.modal-header')).not.toBeNull();
    expect(container.querySelector('.comment-popover-body.modal-body')).not.toBeNull();
    expect(container.querySelector('.comment-popover-footer.modal-footer')).toBeNull();
    expect(container.querySelector('.modal-overlay')).toBeNull();

    const comments = Array.from(container.querySelectorAll('.comment-item > .comment-row .comment-text'));
    expect(comments[0].textContent).toContain('Newest comment');
    expect(comments[comments.length - 1].textContent).toContain('Older follow-up');
    expect(container.querySelector('.comment-mention')?.textContent).toBe('@Alex');
  });

  test('opens and cancels the top add-comment composer from the floating icon', () => {
    renderPopover();

    expect(container.querySelector('.comment-input-section textarea')).toBeNull();
    const addButton = container.querySelector('button[aria-label="Add comment"]');
    expect(addButton).not.toBeNull();

    act(() => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.comment-input-section textarea')).not.toBeNull();
    const cancelButton = container.querySelector('button[aria-label="Cancel comment"]');
    expect(cancelButton).not.toBeNull();
    expect(cancelButton.className).toContain('ui-icon-btn--active');

    act(() => {
      cancelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.comment-input-section textarea')).toBeNull();
    expect(container.querySelector('button[aria-label="Add comment"]')).not.toBeNull();
  });

  test('submits a top add-comment draft inline without closing the popover', () => {
    const onAddComment = jest.fn();
    const onClose = jest.fn();
    renderPopover({ onAddComment, onClose });

    act(() => {
      container.querySelector('button[aria-label="Add comment"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const textarea = container.querySelector('.comment-input-section textarea');
    act(() => {
      setTextareaValue(textarea, 'New top-level note');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => {
      container.querySelector('.comment-input-section button[aria-label="Send comment"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAddComment).toHaveBeenCalledWith('node-1', 'New top-level note', null);
    expect(onClose).not.toHaveBeenCalled();
  });

  test('starts a reply and submits it without closing the popover', () => {
    const onAddComment = jest.fn();
    const onClose = jest.fn();
    renderPopover({ onAddComment, onClose });

    const replyButton = container.querySelector('button[aria-label="Reply to comment"]');
    act(() => {
      replyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const textarea = container.querySelector('.comment-item.is-replying .comment-reply-composer textarea');
    expect(textarea).not.toBeNull();

    act(() => {
      setTextareaValue(textarea, 'Follow up with design');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => {
      container.querySelector('.comment-item.is-replying button[aria-label="Send comment"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAddComment).toHaveBeenCalledWith('node-1', 'Follow up with design', 'comment-new');
    expect(onClose).not.toHaveBeenCalled();
  });

  test('edits, deletes, and resolves a single message through row actions', () => {
    const onUpdateComment = jest.fn();
    const onDeleteComment = jest.fn();
    const onSetCommentsCompleted = jest.fn();
    renderPopover({ onUpdateComment, onDeleteComment, onSetCommentsCompleted });

    act(() => {
      container.querySelector('button[aria-label="Edit comment"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const editTextarea = container.querySelector('.comment-item.is-editing textarea');
    expect(editTextarea).not.toBeNull();
    act(() => {
      setTextareaValue(editTextarea, 'Updated message');
      editTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      container.querySelector('.comment-item.is-editing button[aria-label="Send comment"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateComment).toHaveBeenCalledWith('node-1', 'comment-new', 'Updated message');

    act(() => {
      container.querySelector('button[aria-label="Delete comment"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onDeleteComment).toHaveBeenCalledWith('node-1', 'comment-new');

    act(() => {
      container.querySelector('button[aria-label="Mark comment as incomplete"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSetCommentsCompleted).toHaveBeenCalledWith('node-1', ['comment-new', 'reply-1'], false);
  });

  test('supports whole-node delete and resolve actions from the header', () => {
    const onDeleteAllComments = jest.fn();
    const onSetCommentsCompleted = jest.fn();
    renderPopover({ onDeleteAllComments, onSetCommentsCompleted });

    act(() => {
      container.querySelector('button[aria-label="Delete all comments"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onDeleteAllComments).toHaveBeenCalledWith('node-1');

    act(() => {
      container.querySelector('button[aria-label="Resolve all comments"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSetCommentsCompleted).toHaveBeenCalledWith(
      'node-1',
      ['comment-new', 'reply-1', 'comment-old'],
      true
    );
  });

  test('empty new threads show the composer immediately', () => {
    renderPopover({
      node: {
        id: 'node-empty',
        title: 'Docs',
        comments: [],
      },
    });

    expect(container.querySelector('.comment-input-section textarea')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Add comment"]')).toBeNull();
  });

  test('marks the active comment even when id types differ', () => {
    renderPopover({
      node: {
        ...node,
        comments: [{ ...node.comments[0], id: 12 }],
      },
      activeCommentId: '12',
    });

    const activeComment = container.querySelector('.comment-item.is-active');
    expect(activeComment).not.toBeNull();
    expect(activeComment.textContent).toContain('Older follow-up');
  });
});

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import CommentPopover from './CommentPopover';

describe('CommentPopover', () => {
  let container;
  let root;

  const currentUser = { id: 'user-1', name: 'Frank S.', email: 'frank@example.com' };

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
        authorUserId: 'user-2',
        text: 'Older follow-up',
        createdAt: '2026-04-15T12:00:00.000Z',
        completed: false,
        replies: [],
      },
      {
        id: 'comment-new',
        author: 'Frank S.',
        authorUserId: 'user-1',
        text: 'Newest comment @Alex',
        createdAt: '2026-04-16T12:00:00.000Z',
        completed: false,
        replies: [
          {
            id: 'reply-1',
            author: 'Jordan',
            authorUserId: 'user-3',
            text: 'Nested reply',
            createdAt: '2026-04-16T12:30:00.000Z',
            completed: false,
            replies: [],
          },
        ],
      },
      {
        id: 'comment-resolved',
        author: 'Sam',
        authorUserId: 'user-4',
        text: 'Already handled',
        createdAt: '2026-04-17T12:00:00.000Z',
        completed: true,
        completedBy: 'Jennifer',
        completedAt: '2026-04-17T13:00:00.000Z',
        replies: [],
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
      canResolveComments: true,
      currentUser,
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

  test('renders no footer, newest unresolved top-level comments first, and hides resolved by default', () => {
    renderPopover();

    expect(container.querySelector('.comment-popover.modal-card')).not.toBeNull();
    expect(container.querySelector('.comment-popover-footer.modal-footer')).toBeNull();
    expect(container.textContent).not.toContain('Already handled');

    const comments = Array.from(container.querySelectorAll('.comment-list > .comment-item > .comment-row .comment-text'));
    expect(comments[0].textContent).toContain('Newest comment');
    expect(comments[comments.length - 1].textContent).toContain('Older follow-up');

    const action = container.querySelector('.comment-action-btn.ui-icon-btn');
    expect(action).not.toBeNull();
    expect(action.className).toContain('ui-icon-btn--type-ghost');
    expect(action.className).toContain('ui-icon-btn--style-mono');
  });

  test('shows selected resolved comments when opened from the panel', () => {
    renderPopover({ activeCommentId: 'comment-resolved' });

    expect(container.textContent).toContain('Already handled');
    expect(container.querySelector('.comment-completed-info')?.textContent).toContain('Resolved -');
  });

  test('hides share until text is typed and submits with the Share button', () => {
    const onAddComment = jest.fn();
    renderPopover({ onAddComment });

    act(() => {
      container.querySelector('button[aria-label="Add comment"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const cancelToggle = container.querySelector('button[aria-label="Cancel comment"]');
    expect(cancelToggle.className).toContain('ui-icon-btn--type-primary');
    expect(cancelToggle.className).toContain('ui-icon-btn--style-mono');
    expect(cancelToggle.className).not.toContain('ui-icon-btn--active');

    const section = container.querySelector('.comment-input-section');
    const textarea = section.querySelector('textarea');
    expect(textarea.className).toContain('ui-textarea');
    expect(textarea.className).toContain('comment-input');
    expect(textarea.placeholder).toBe('Add a comment... (use @ to mention)');
    expect(textarea.placeholder).not.toContain('\\n');
    expect(textarea.placeholder).not.toContain('\n');
    expect(section.querySelector('button[aria-label="Share comment"]')).toBeNull();

    act(() => {
      setTextareaValue(textarea, 'New top-level note');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const shareButton = section.querySelector('button[aria-label="Share comment"]');
    expect(shareButton).not.toBeNull();

    act(() => {
      shareButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAddComment).toHaveBeenCalledWith('node-1', 'New top-level note', null);
  });

  test('submits with shift-enter while plain enter remains available for line breaks', () => {
    const onAddComment = jest.fn();
    renderPopover({ onAddComment });

    act(() => {
      container.querySelector('button[aria-label="Add comment"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const textarea = container.querySelector('.comment-input-section textarea');
    act(() => {
      setTextareaValue(textarea, 'Keyboard submit');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onAddComment).not.toHaveBeenCalled();

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    });
    expect(onAddComment).toHaveBeenCalledWith('node-1', 'Keyboard submit', null);
  });

  test('inserts emoji from the picker into the active composer', () => {
    renderPopover();

    act(() => {
      container.querySelector('button[aria-label="Add comment"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const emojiButton = container.querySelector('.comment-input-section button[aria-label="Insert emoji"]');
    act(() => {
      emojiButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const picker = container.querySelector('.comment-emoji-popover emoji-picker');
    expect(picker).not.toBeNull();
    expect(container.querySelector('.comment-emoji-popover').style.top).toBe('4px');
    act(() => {
      picker.dispatchEvent(new CustomEvent('emoji-click', {
        bubbles: true,
        detail: { unicode: '🎯' },
      }));
    });

    expect(container.querySelector('.comment-input-section textarea').value).toContain('🎯');
  });

  test('keeps emoji picker wheel events from reaching the map layer', () => {
    renderPopover();

    act(() => {
      container.querySelector('button[aria-label="Add comment"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const emojiButton = container.querySelector('.comment-input-section button[aria-label="Insert emoji"]');
    act(() => {
      emojiButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const wheelSpy = jest.fn();
    document.addEventListener('wheel', wheelSpy);
    const wheelEvent = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 });
    act(() => {
      container.querySelector('.comment-emoji-popover')
        .dispatchEvent(wheelEvent);
    });
    document.removeEventListener('wheel', wheelSpy);

    expect(wheelSpy).not.toHaveBeenCalled();
    expect(wheelEvent.defaultPrevented).toBe(false);
  });

  test('closes the emoji picker from toggle, Escape, and outside click', () => {
    renderPopover();

    act(() => {
      container.querySelector('button[aria-label="Add comment"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const emojiButton = container.querySelector('.comment-input-section button[aria-label="Insert emoji"]');
    act(() => {
      emojiButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.comment-emoji-popover')).not.toBeNull();

    act(() => {
      emojiButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.comment-emoji-popover')).toBeNull();

    act(() => {
      emojiButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(container.querySelector('.comment-emoji-popover')).toBeNull();

    act(() => {
      emojiButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(container.querySelector('.comment-emoji-popover')).toBeNull();
  });

  test('reply composer keeps the same textarea while typing and includes cancel', () => {
    renderPopover();

    act(() => {
      container.querySelector('button[aria-label="Reply to comment"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const textarea = container.querySelector('.comment-item.is-replying .comment-reply-composer textarea');
    expect(textarea).not.toBeNull();
    expect(container.querySelector('.comment-item.is-replying button[aria-label="Cancel reply"]')).not.toBeNull();

    act(() => {
      setTextareaValue(textarea, 'A');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.querySelector('.comment-item.is-replying .comment-reply-composer textarea')).toBe(textarea);
  });

  test('does not render replies as bordered cards and does not offer reply resolve actions', () => {
    renderPopover();

    const reply = container.querySelector('.comment-item.is-reply');
    expect(reply).not.toBeNull();
    expect(reply.querySelector('button[aria-label="Resolve comment thread"]')).toBeNull();
  });

  test('limits edit and delete to the comment author', () => {
    renderPopover();

    expect(container.querySelectorAll('button[aria-label="Edit comment"]')).toHaveLength(1);
    expect(container.querySelectorAll('button[aria-label="Delete comment"]')).toHaveLength(1);

    act(() => {
      container.querySelector('button[aria-label="Edit comment"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const editTextarea = container.querySelector('.comment-item.is-editing textarea');
    act(() => {
      setTextareaValue(editTextarea, 'Updated message');
      editTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      container.querySelector('.comment-item.is-editing button[aria-label="Share comment"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.comment-item.is-editing')).toBeNull();
  });

  test('limits resolve to editors and closes when resolving a thread', () => {
    const onClose = jest.fn();
    const onSetCommentsCompleted = jest.fn();
    renderPopover({ onClose, onSetCommentsCompleted });

    act(() => {
      container.querySelector('button[aria-label="Resolve comment thread"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSetCommentsCompleted).toHaveBeenCalledWith('node-1', ['comment-new', 'reply-1'], true);
    expect(onClose).toHaveBeenCalled();

    act(() => {
      root.render(<CommentPopover {...renderPopover({ canResolveComments: false })} />);
    });
    expect(container.querySelector('button[aria-label="Resolve comment thread"]')).toBeNull();
  });

  test('supports whole-node delete and resolve actions only for resolvers', () => {
    const onDeleteAllComments = jest.fn();
    const onSetCommentsCompleted = jest.fn();
    const onClose = jest.fn();
    renderPopover({ onDeleteAllComments, onSetCommentsCompleted, onClose });

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
    expect(onClose).toHaveBeenCalled();

    renderPopover({ canResolveComments: false });
    expect(container.querySelector('button[aria-label="Delete all comments"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Resolve all comments"]')).toBeNull();
  });
});

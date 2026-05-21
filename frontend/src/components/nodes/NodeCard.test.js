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
    jest.useRealTimers();
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
    const deleteAction = container.querySelector('.node-card-action[aria-label="Delete"]');
    expect(deleteAction?.className).toContain('ui-icon-btn--style-mono');
    expect(deleteAction?.className).not.toContain('ui-icon-btn--style-danger');
  });

  test('can hide direct delete action while keeping edit action available', () => {
    act(() => {
      root.render(
        <NodeCard
          node={{ id: 'node-1', title: 'Scanned page', url: 'https://example.com/page' }}
          number="1"
          color="#0ea5e9"
          showThumbnails={false}
          canEdit
          showDeleteAction={false}
          onDelete={jest.fn()}
          onEdit={jest.fn()}
          onDuplicate={jest.fn()}
        />
      );
    });

    expect(container.querySelector('button[aria-label="Edit"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Delete"]')).toBeNull();
  });

  test('stack toggle handles click without starting card drag', () => {
    const onToggleStack = jest.fn();
    const onCardPointerDown = jest.fn();

    act(() => {
      root.render(
        <NodeCard
          node={{ id: 'node-1', title: 'Stacked page', url: 'https://example.com/page-1' }}
          number="1.1"
          color="#0ea5e9"
          showThumbnails={false}
          canEdit
          dragHandleProps={{ onPointerDown: onCardPointerDown }}
          stackInfo={{ parentId: 0, totalCount: 6, collapsed: true }}
          onToggleStack={onToggleStack}
          onDelete={jest.fn()}
          onEdit={jest.fn()}
          onDuplicate={jest.fn()}
        />
      );
    });

    const toggle = container.querySelector('.stack-toggle');
    expect(toggle).not.toBeNull();

    act(() => {
      toggle.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCardPointerDown).not.toHaveBeenCalled();
    expect(onToggleStack).toHaveBeenCalledTimes(1);
  });

  test('keeps an existing thumbnail visible when a new batch targets other nodes', async () => {
    await act(async () => {
      root.render(
        <NodeCard
          node={{
            id: 'node-1',
            title: 'Already captured',
            url: 'https://example.com/page',
            thumbnailUrl: 'https://assets.example/thumb.jpg',
          }}
          number="1"
          color="#0ea5e9"
          showThumbnails
          thumbnailRequestIds={new Set(['node-2'])}
          thumbnailSessionId={2}
          onDelete={jest.fn()}
          onEdit={jest.fn()}
          onDuplicate={jest.fn()}
          onViewImage={jest.fn()}
        />
      );
    });

    expect(container.querySelector('.thumb-img')).not.toBeNull();
    expect(container.querySelector('.thumb-placeholder')).toBeNull();
  });

  test('retries an existing thumbnail display when the capture session changes', async () => {
    const onThumbnailError = jest.fn();
    const node = {
      id: 'node-1',
      title: 'Already captured',
      url: 'https://example.com/page',
      thumbnailUrl: 'https://assets.example/thumb.jpg',
    };

    await act(async () => {
      root.render(
        <NodeCard
          node={node}
          number="1"
          color="#0ea5e9"
          showThumbnails
          thumbnailRequestIds={new Set(['node-2'])}
          thumbnailSessionId={1}
          onDelete={jest.fn()}
          onEdit={jest.fn()}
          onDuplicate={jest.fn()}
          onViewImage={jest.fn()}
          onThumbnailError={onThumbnailError}
        />
      );
    });

    act(() => {
      container.querySelector('.thumb-img').dispatchEvent(new Event('error'));
    });

    expect(onThumbnailError).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.thumb-placeholder')).not.toBeNull();

    await act(async () => {
      root.render(
        <NodeCard
          node={node}
          number="1"
          color="#0ea5e9"
          showThumbnails
          thumbnailRequestIds={new Set(['node-2'])}
          thumbnailSessionId={2}
          onDelete={jest.fn()}
          onEdit={jest.fn()}
          onDuplicate={jest.fn()}
          onViewImage={jest.fn()}
          onThumbnailError={onThumbnailError}
        />
      );
    });

    expect(container.querySelector('.thumb-img')).not.toBeNull();
    expect(container.querySelector('.thumb-placeholder')).toBeNull();
  });

  test('does not report a display error timeout before a thumbnail asset exists', async () => {
    jest.useFakeTimers();
    const onThumbnailError = jest.fn();

    await act(async () => {
      root.render(
        <NodeCard
          node={{ id: 'node-1', title: 'Pending capture', url: 'https://example.com/page' }}
          number="1"
          color="#0ea5e9"
          showThumbnails
          thumbnailRequestIds={new Set(['node-1'])}
          thumbnailSessionId={1}
          onRequestThumbnail={() => Promise.resolve(true)}
          onDelete={jest.fn()}
          onEdit={jest.fn()}
          onDuplicate={jest.fn()}
          onViewImage={jest.fn()}
          onThumbnailError={onThumbnailError}
        />
      );
    });

    act(() => {
      jest.advanceTimersByTime(120000);
    });

    expect(onThumbnailError).not.toHaveBeenCalled();
  });

  test('does not start thumbnail capture from render state', async () => {
    const onRequestThumbnail = jest.fn(() => Promise.resolve(true));

    await act(async () => {
      root.render(
        <NodeCard
          node={{ id: 'node-1', title: 'Missing thumbnail', url: 'https://example.com/page' }}
          number="1"
          color="#0ea5e9"
          showThumbnails
          thumbnailRequestIds={new Set(['node-1'])}
          thumbnailSessionId={1}
          onRequestThumbnail={onRequestThumbnail}
          onDelete={jest.fn()}
          onEdit={jest.fn()}
          onDuplicate={jest.fn()}
          onViewImage={jest.fn()}
        />
      );
    });

    expect(onRequestThumbnail).not.toHaveBeenCalled();
  });

  test('does not treat renderable text URLs as uncapturable files', async () => {
    await act(async () => {
      root.render(
        <NodeCard
          node={{
            id: 'node-1',
            title: 'Alignment transcript',
            url: 'https://alignment.anthropic.com/2025/transcripts/output_monitor_correct2.txt',
            isFile: true,
            orphanType: 'file',
          }}
          number="77.1"
          color="#0ea5e9"
          showThumbnails
          onDelete={jest.fn()}
          onEdit={jest.fn()}
          onDuplicate={jest.fn()}
          onViewImage={jest.fn()}
        />
      );
    });

    expect(container.textContent).not.toContain('TXT file');
    expect(container.textContent).not.toContain('No page preview');
  });
});

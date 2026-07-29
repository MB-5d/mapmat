import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

import { NodeCard } from './NodeCard';

const appCss = fs.readFileSync(path.join(__dirname, '../../App.css'), 'utf8');
const getCssRule = (selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return appCss.match(new RegExp(`${escapedSelector} \\{[^}]+\\}`))?.[0] || '';
};

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
    vi.useRealTimers();
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
          badges={['Subdomain', 'Duplicate']}
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onViewImage={vi.fn()}
          onAddNote={vi.fn()}
          onViewNotes={vi.fn()}
        />
      );
    });

    expect(container.querySelector('.comment-badge')).not.toBeNull();
    expect(container.querySelector('.node-status-badge.status-to_move')).not.toBeNull();
    expect(container.querySelector('.node-badge')?.textContent).toContain('Duplicate');
    expect(container.querySelector('.node-badge')?.className).toContain('ui-tone--orange');
    expect(container.textContent).not.toContain('Subdomain');
    expect(container.querySelector('.page-number')?.textContent).toBe('s1.4');
    expect(container.querySelectorAll('.node-card-action.ui-icon-btn')).toHaveLength(4);
    const deleteAction = container.querySelector('.node-card-action[aria-label="Delete"]');
    expect(deleteAction?.className).toContain('ui-icon-btn--style-mono');
    expect(deleteAction?.className).not.toContain('ui-icon-btn--style-danger');
    const commentAction = container.querySelector('.node-card-action[aria-label="Comments"]');
    expect(commentAction?.querySelector('.ui-icon__svg')).not.toBeNull();
    expect(commentAction?.querySelectorAll('line')).toHaveLength(0);
  });

  test('uses the add-comment icon when a node has no comments', () => {
    act(() => {
      root.render(
        <NodeCard
          node={{
            id: 'node-1',
            title: 'No comments yet',
            url: 'https://example.com',
            comments: [],
          }}
          number="1"
          color="#0ea5e9"
          showThumbnails={false}
          canEdit
          canComment
          showCommentAction
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onAddNote={vi.fn()}
        />
      );
    });

    const commentAction = container.querySelector('.node-card-action[aria-label="Comments"]');
    expect(commentAction).not.toBeNull();
    expect(commentAction.querySelector('.ui-icon__svg')).not.toBeNull();
    expect(commentAction.querySelector('[class*="lucide-message-square-plus"]')).not.toBeNull();
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
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
        />
      );
    });

    expect(container.querySelector('button[aria-label="Node details"]')).not.toBeNull();
    expect(container.querySelector('button[title="Node details"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Delete"]')).toBeNull();
  });

  test('renders inferred hierarchy as a non-interactive non-page card', () => {
    act(() => {
      root.render(
        <NodeCard
          node={{ id: 'ghost-1', title: 'articles', url: '', nodeKind: 'import-ghost' }}
          number="1.2"
          color="#0ea5e9"
          showThumbnails
          showPageNumbers
          canEdit
          showCommentAction
          connectionTool="crosslink"
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
        />
      );
    });

    expect(container.querySelector('.node-card.import-ghost')).not.toBeNull();
    expect(container.textContent).toContain('Inferred path');
    expect(container.querySelector('.card-thumb')).toBeNull();
    expect(container.querySelector('.page-number')).toBeNull();
    expect(container.querySelector('.card-actions')).toBeNull();
    expect(container.querySelector('.anchor-point')).toBeNull();
  });

  test('shows focused ancestors as non-capturable structural context with their preserved number', () => {
    act(() => {
      root.render(
        <NodeCard
          node={{
            id: 'focus-1',
            title: 'Blog',
            url: 'https://example.com/blog',
            nodeKind: 'focus-ghost',
            isFocusAncestor: true,
            scanStatus: 'structural',
          }}
          number="3"
          color="#0ea5e9"
          showThumbnails
          showPageNumbers
          canEdit
        />
      );
    });

    expect(container.querySelector('.node-card.focus-ghost.ghosted.focus-ghost-reveal-card')).not.toBeNull();
    expect(container.querySelector('.page-number')?.textContent).toBe('3');
    expect(container.querySelector('.card-actions')).toBeNull();
    expect(container.querySelector('.card-thumb')).toBeNull();
    expect(container.textContent).toContain('Structural context');
  });

  test('renders a group-only capture action for deferred pages', () => {
    const onCaptureDeferredGroup = vi.fn();
    act(() => {
      root.render(
        <NodeCard
          node={{
            id: 'more-posts',
            nodeKind: 'deferred-group',
            deferredGroupId: 'blog-posts',
            remainingCount: 368,
          }}
          number=""
          color="#0ea5e9"
          showThumbnails={false}
          showPageNumbers
          canEdit
          onCaptureDeferredGroup={onCaptureDeferredGroup}
        />
      );
    });

    const button = container.querySelector('.deferred-group-capture');
    expect(button?.textContent).toContain('Capture now');
    expect(container.querySelector('.deferred-group-number')?.textContent).toBe('368');
    expect(container.querySelector('.deferred-group-count')?.textContent).toBe('more pages like this');
    expect(button?.classList.contains('ui-btn--type-secondary')).toBe(true);
    expect(button?.querySelector('svg[data-icon="scan"]')).not.toBeNull();
    expect(container.querySelector('.page-number')).toBeNull();
    expect(container.querySelector('.node-card.deferred-group .card-header')).toBeNull();
    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onCaptureDeferredGroup).toHaveBeenCalledTimes(1);
  });

  test('stack toggle handles click without starting card drag', () => {
    const onToggleStack = vi.fn();
    const onCardPointerDown = vi.fn();

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
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
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
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onViewImage={vi.fn()}
        />
      );
    });

    expect(container.querySelector('.thumb-img')).not.toBeNull();
    expect(container.querySelector('.thumb-placeholder')).toBeNull();
    expect(container.querySelector('.card-thumb-with-image')).not.toBeNull();
  });

  test('renders only the thumbnail image on the node card', async () => {
    const onViewImage = vi.fn();

    await act(async () => {
      root.render(
        <NodeCard
          node={{
            id: 'node-1',
            title: 'Captured page',
            url: 'https://example.com/page',
            thumbnailUrl: '/screenshots/page_thumb_small_v8.jpg',
            fullScreenshotUrl: '/screenshots/page_full_v8.jpg',
          }}
          number="1"
          color="#0ea5e9"
          showThumbnails
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onViewImage={onViewImage}
        />
      );
    });

    const image = container.querySelector('.thumb-img');
    expect(image?.getAttribute('src')).toBe('/screenshots/page_thumb_small_v8.jpg');
    expect(container.innerHTML).not.toContain('/screenshots/page_full_v8.jpg');
    expect(image?.getAttribute('decoding')).toBe('async');
    expect(image?.getAttribute('fetchpriority')).toBe('low');
  });

  test('adds the thumbnail divider to the image container, not the raster image', async () => {
    await act(async () => {
      root.render(
        <NodeCard
          node={{
            id: 'node-1',
            title: 'Captured page',
            url: 'https://example.com/page',
            thumbnailUrl: '/screenshots/page_thumb_small_v8.jpg',
          }}
          number="1"
          color="#0ea5e9"
          showThumbnails
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onViewImage={vi.fn()}
        />
      );
    });

    expect(container.querySelector('.card-thumb-with-image .thumb-img')).not.toBeNull();
    expect(getCssRule('.card-thumb-with-image')).toContain('border-bottom: var(--border-width-subtle) solid var(--ui-color-border);');
    expect(getCssRule('.thumb-img')).not.toContain('border-bottom');
  });

  test('opens an existing thumbnail asset without starting a new capture', async () => {
    const onViewImage = vi.fn();

    await act(async () => {
      root.render(
        <NodeCard
          node={{
            id: 'node-1',
            title: 'Captured thumbnail page',
            url: 'https://example.com/page',
            thumbnailUrl: '/screenshots/page_thumb_small_v8.jpg',
            thumbnailFullUrl: '/screenshots/page_thumb_full_v8.jpg',
          }}
          number="1"
          color="#0ea5e9"
          showThumbnails
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onViewImage={onViewImage}
        />
      );
    });

    const viewButton = container.querySelector('.thumb-fullsize-btn');
    expect(viewButton).not.toBeNull();

    await act(async () => {
      viewButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onViewImage).toHaveBeenCalledWith('/screenshots/page_thumb_full_v8.jpg', true, 'node-1', 'thumb');
  });

  test('retries an existing thumbnail display when the capture session changes', async () => {
    const onThumbnailError = vi.fn();
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
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onViewImage={vi.fn()}
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
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onViewImage={vi.fn()}
          onThumbnailError={onThumbnailError}
        />
      );
    });

    expect(container.querySelector('.thumb-img')).not.toBeNull();
    expect(container.querySelector('.thumb-placeholder')).toBeNull();
  });

  test('retries a saved thumbnail display when its reload key changes', async () => {
    const onThumbnailError = vi.fn();
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
          thumbnailReloadKey={0}
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onViewImage={vi.fn()}
          onThumbnailError={onThumbnailError}
        />
      );
    });

    act(() => {
      container.querySelector('.thumb-img').dispatchEvent(new Event('error'));
    });

    expect(container.querySelector('.thumb-placeholder')).not.toBeNull();

    await act(async () => {
      root.render(
        <NodeCard
          node={node}
          number="1"
          color="#0ea5e9"
          showThumbnails
          thumbnailReloadKey={1}
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onViewImage={vi.fn()}
          onThumbnailError={onThumbnailError}
        />
      );
    });

    expect(container.querySelector('.thumb-img')).not.toBeNull();
    expect(container.querySelector('.thumb-img')?.getAttribute('src')).toBe('https://assets.example/thumb.jpg?_=1');
    expect(container.querySelector('.thumb-placeholder')).toBeNull();
  });

  test('does not report a display error timeout before a thumbnail asset exists', async () => {
    vi.useFakeTimers();
    const onThumbnailError = vi.fn();

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
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onViewImage={vi.fn()}
          onThumbnailError={onThumbnailError}
        />
      );
    });

    act(() => {
      vi.advanceTimersByTime(120000);
    });

    expect(onThumbnailError).not.toHaveBeenCalled();
  });

  test('does not start thumbnail capture from render state', async () => {
    const onRequestThumbnail = vi.fn(() => Promise.resolve(true));

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
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onViewImage={vi.fn()}
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
          onDelete={vi.fn()}
          onEdit={vi.fn()}
          onDuplicate={vi.fn()}
          onViewImage={vi.fn()}
        />
      );
    });

    expect(container.textContent).not.toContain('TXT file');
    expect(container.textContent).not.toContain('No page preview');
  });
});

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

import AccessRequestInboxModal from './AccessRequestInboxModal';

const appCss = fs.readFileSync(path.join(__dirname, '../../App.css'), 'utf8');

describe('AccessRequestInboxModal', () => {
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
    jest.clearAllMocks();
  });

  test('approves a request with the selected role', () => {
    const onApprove = jest.fn();
    const request = {
      id: 'req-1',
      mapName: 'Alpha Map',
      requesterName: 'Sam',
      requestedRole: 'viewer',
      status: 'pending',
      canReview: true,
    };

    act(() => {
      root.render(
        <AccessRequestInboxModal
          show
          requests={[request]}
          onClose={jest.fn()}
          onRefresh={jest.fn()}
          onApprove={onApprove}
          onDeny={jest.fn()}
        />
      );
    });

    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Requests');
    expect(container.textContent).toContain('Review map access requests linked to your account.');
    expect(container.textContent).toContain('Alpha Map');
    expect(container.textContent).toContain('Sam · Viewer access requested');
    expect(container.textContent).not.toContain('Sam wants access');
    expect(appCss).toContain('.access-request-inbox-actions {\n  gap: var(--unit-24);');

    const select = container.querySelector('select');
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');

    act(() => {
      descriptor.set.call(select, 'editor');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const approveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Approve')
    );

    act(() => {
      approveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onApprove).toHaveBeenCalledWith(request, 'editor');
  });

  test('uses a quiet empty state without refresh or raw not found copy', () => {
    act(() => {
      root.render(
        <AccessRequestInboxModal
          show
          requests={[]}
          error="Not found"
          onClose={jest.fn()}
          onApprove={jest.fn()}
          onDeny={jest.fn()}
        />
      );
    });

    expect(container.textContent).toContain('No pending access requests right now.');
    expect(container.textContent).not.toContain('Not found');
    expect(container.textContent).not.toContain('Refresh');
    expect(appCss).toContain('font-size: var(--type-body-sm-size);');
    expect(appCss).toContain('color: var(--color-text-primary);');
  });

  test('opens approved requester cards and shows success status styling', () => {
    const onOpenMap = jest.fn();
    const request = {
      id: 'req-approved',
      mapId: 'map-1',
      mapName: 'Approved Map',
      requestedRole: 'viewer',
      decisionRole: 'commenter',
      status: 'approved',
      canReview: false,
    };

    act(() => {
      root.render(
        <AccessRequestInboxModal
          show
          requests={[request]}
          onClose={jest.fn()}
          onApprove={jest.fn()}
          onDeny={jest.fn()}
          onOpenMap={onOpenMap}
        />
      );
    });

    const card = container.querySelector('.access-request-inbox-item--clickable');
    expect(card).not.toBeNull();
    expect(container.textContent).toContain('Approved Map');
    expect(container.textContent).toContain('Approved as Commenter');
    expect(container.querySelector('.invite-inbox-item-status--approved')).not.toBeNull();

    act(() => {
      card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onOpenMap).toHaveBeenCalledWith(request);
  });

  test('lets reviewers undo approved requests', () => {
    const onUndo = jest.fn();
    const request = {
      id: 'req-owner-approved',
      mapId: 'map-1',
      mapName: 'Owner Map',
      requesterName: 'Riley',
      requestedRole: 'viewer',
      decisionRole: 'editor',
      status: 'approved',
      canReview: true,
    };

    act(() => {
      root.render(
        <AccessRequestInboxModal
          show
          requests={[request]}
          onClose={jest.fn()}
          onApprove={jest.fn()}
          onDeny={jest.fn()}
          onUndo={onUndo}
        />
      );
    });

    expect(container.textContent).toContain('Owner Map');
    expect(container.textContent).toContain('Riley · Viewer access requested');
    const undoButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Undo')
    );

    act(() => {
      undoButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUndo).toHaveBeenCalledWith(request);
  });
});

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

import InviteInboxModal from './InviteInboxModal';

const appCss = fs.readFileSync(path.join(__dirname, '../../App.css'), 'utf8');

describe('InviteInboxModal', () => {
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

  test('accepts invites without a refresh action', () => {
    const onAccept = jest.fn();
    const invite = {
      id: 'inv-1',
      mapName: 'Alpha Map',
      role: 'viewer',
      inviterName: 'Jordan',
    };

    act(() => {
      root.render(
        <InviteInboxModal
          show
          invites={[invite]}
          onClose={jest.fn()}
          onAccept={onAccept}
          onDecline={jest.fn()}
        />
      );
    });

    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Invites');
    expect(container.textContent).toContain('Review collaboration invites linked to your account.');

    const refreshButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Refresh')
    );
    const acceptButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Accept')
    );

    act(() => {
      acceptButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Invited by: Jordan');
    expect(refreshButton).toBeUndefined();
    expect(onAccept).toHaveBeenCalledWith(invite);
  });

  test('hides not found on empty state and sends an invite from the composer', () => {
    const onSendInvite = jest.fn();
    const onSelectedMapIdChange = jest.fn();
    const onInviteEmailChange = jest.fn();

    act(() => {
      root.render(
        <InviteInboxModal
          show
          invites={[]}
          error="Not found"
          loading={false}
          eligibleMaps={[
            { id: 'map-1', name: 'Current Map', role: 'owner' },
            { id: 'map-2', name: 'Other Map', role: 'editor' },
          ]}
          selectedMapId="map-1"
          onSelectedMapIdChange={onSelectedMapIdChange}
          inviteEmail="person@example.com"
          onInviteEmailChange={onInviteEmailChange}
          inviteRole="viewer"
          inviteRoleOptions={['viewer', 'commenter']}
          onInviteRoleChange={jest.fn()}
          onSendInvite={onSendInvite}
          onClose={jest.fn()}
          onAccept={jest.fn()}
          onDecline={jest.fn()}
        />
      );
    });

    expect(container.textContent).toContain('No pending invites right now.');
    expect(container.textContent).not.toContain('Not found');
    expect(container.textContent).not.toContain('Refresh');
    expect(container.querySelector('[role="combobox"]')?.value).toBe('Current Map');
    expect(appCss).not.toContain('.invite-inbox-composer--role-menu-open');

    const roleButton = container.querySelector('.share-collab-role-trigger');
    act(() => {
      roleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.querySelector('.share-collab-role-menu-panel')).not.toBeNull();
    expect(document.querySelector('.share-collab-role-menu-panel--portal')).not.toBeNull();
    expect(container.querySelector('.invite-inbox-composer')?.className).not.toContain('invite-inbox-composer--role-menu-open');

    const inviteButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.trim() === 'Invite'
    );

    act(() => {
      inviteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectedMapIdChange).not.toHaveBeenCalled();
    expect(onSendInvite).toHaveBeenCalledTimes(1);
  });

  test('renders sent invites with stacked layout hooks', () => {
    act(() => {
      root.render(
        <InviteInboxModal
          show
          invites={[]}
          sentInvites={[{
            id: 'sent-1',
            mapId: 'map-1',
            mapName: 'Example: long page site scan with full-page screenshots',
            inviteeEmail: 'person@example.com',
            role: 'editor',
          }]}
          eligibleMaps={[{ id: 'map-1', name: 'Example: long page site scan with full-page screenshots' }]}
          selectedMapId="map-1"
          inviteRoleOptions={['viewer', 'commenter', 'editor']}
          onClose={jest.fn()}
          onCancelSentInvite={jest.fn()}
          onResendSentInvite={jest.fn()}
        />
      );
    });

    expect(container.querySelector('.sent-invite-inbox-item')).not.toBeNull();
    expect(container.textContent).toContain('person@example.com');
    expect(appCss).toContain('.sent-invite-inbox-item {');
    expect(appCss).toContain('flex-direction: column;');
  });
});

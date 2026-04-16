import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import ShareModal from './ShareModal';

describe('ShareModal', () => {
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

  test('changes permission and collaboration settings', () => {
    const onChangePermission = jest.fn();
    const onUpdateCollaborationSettings = jest.fn();

    act(() => {
      root.render(
        <ShareModal
          show
          onClose={jest.fn()}
          accessLevels={{ VIEW: 'view', COMMENT: 'comment', EDIT: 'edit' }}
          sharePermission="view"
          onChangePermission={onChangePermission}
          linkCopied={false}
          onCopyLink={jest.fn()}
          shareEmails=""
          onShareEmailsChange={jest.fn()}
          onSendEmail={jest.fn()}
          collaborationEnabled
          collaborationAvailable
          collaborationSettings={{
            accessPolicy: 'private',
            nonViewerInvitesRequireOwner: true,
            accessRequestsEnabled: true,
            presenceIdentityMode: 'named',
          }}
          canManageCollaborationSettings
          onUpdateCollaborationSettings={onUpdateCollaborationSettings}
          collaborationMemberships={[]}
          collaborationInvites={[]}
          collaborationAccessRequests={[]}
        />
      );
    });

    const commentRadio = container.querySelector('input[type="radio"][value="comment"]');
    const toggles = container.querySelectorAll('.share-collab-checkbox input[type="checkbox"]');

    act(() => {
      commentRadio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      toggles[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      toggles[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onChangePermission).toHaveBeenCalledWith('comment');
    expect(onUpdateCollaborationSettings).toHaveBeenCalledWith({
      non_viewer_invites_require_owner: false,
    });
    expect(onUpdateCollaborationSettings).toHaveBeenCalledWith({
      access_requests_enabled: false,
    });
  });
});

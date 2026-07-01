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

  test('changes share permission from the share modal', () => {
    const onChangePermission = jest.fn();

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
          collaborationMemberships={[]}
          collaborationInvites={[]}
          collaborationAccessRequests={[]}
        />
      );
    });

    const commentCard = Array.from(container.querySelectorAll('.share-permission-card')).find(
      (card) => card.textContent.includes('Can comment')
    );

    act(() => {
      commentCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onChangePermission).toHaveBeenCalledWith('comment');
    expect(container.querySelector('.share-permission-card.ui-option-card')).not.toBeNull();
    expect(container.querySelector('input[type="radio"]')).toBeNull();
    expect(container.querySelectorAll('.share-section')).toHaveLength(1);
    expect(container.textContent).toContain('Copy share link');
    expect(container.querySelector('input[placeholder="Share by email"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Collaborators');
  });

  test('disables unavailable share levels and share actions with a reason', () => {
    const onChangePermission = jest.fn();
    const onCopyLink = jest.fn();

    act(() => {
      root.render(
        <ShareModal
          show
          onClose={jest.fn()}
          accessLevels={{ VIEW: 'view', COMMENT: 'comment', EDIT: 'edit' }}
          sharePermission="edit"
          onChangePermission={onChangePermission}
          linkCopied={false}
          onCopyLink={onCopyLink}
          canShareLinks
          allowedSharePermissions={['view']}
          shareEmails=""
          onShareEmailsChange={jest.fn()}
          onSendEmail={jest.fn()}
          collaborationMemberships={[]}
          collaborationInvites={[]}
          collaborationAccessRequests={[]}
        />
      );
    });

    const editCard = Array.from(container.querySelectorAll('.share-permission-card')).find(
      (card) => card.textContent.includes('Can edit')
    );
    const copyButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.includes('Copy share link')
    );
    const sendButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'Send'
    );

    act(() => {
      editCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      copyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(editCard.disabled).toBe(true);
    expect(copyButton.disabled).toBe(true);
    expect(sendButton.disabled).toBe(true);
    expect(container.textContent).toContain('Your account does not have permission to grant others that level on this map.');
    expect(onChangePermission).not.toHaveBeenCalled();
    expect(onCopyLink).not.toHaveBeenCalled();
  });

  test('shows upgrade action when share links are plan locked', () => {
    const onUpgradePlan = jest.fn();

    act(() => {
      root.render(
        <ShareModal
          show
          onClose={jest.fn()}
          accessLevels={{ VIEW: 'view', COMMENT: 'comment', EDIT: 'edit' }}
          sharePermission="view"
          onChangePermission={jest.fn()}
          linkCopied={false}
          onCopyLink={jest.fn()}
          canShareLinks={false}
          shareLinksDisabledReason="Client share links are not available on this plan."
          onUpgradePlan={onUpgradePlan}
          allowedSharePermissions={['view', 'comment', 'edit']}
          shareEmails=""
          onShareEmailsChange={jest.fn()}
          onSendEmail={jest.fn()}
          collaborationMemberships={[]}
          collaborationInvites={[]}
          collaborationAccessRequests={[]}
        />
      );
    });

    const upgradeButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'Upgrade plan'
    );

    expect(container.textContent).toContain('Client share links are not available on this plan.');
    expect(upgradeButton).toBeTruthy();

    act(() => {
      upgradeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpgradePlan).toHaveBeenCalledTimes(1);
  });

  test('changes collaboration settings from the collaboration modal', () => {
    const onUpdateCollaborationSettings = jest.fn();

    act(() => {
      root.render(
        <ShareModal
          show
          mode="collaboration"
          onClose={jest.fn()}
          accessLevels={{ VIEW: 'view', COMMENT: 'comment', EDIT: 'edit' }}
          sharePermission="view"
          onChangePermission={jest.fn()}
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

    const toggles = container.querySelectorAll('.share-collab-checkbox input[type="checkbox"]');
    const optionLabels = Array.from(container.querySelectorAll('option')).map((option) => option.textContent.trim());
    const sectionTitles = Array.from(container.querySelectorAll('.share-section-title')).map((title) => title.textContent.trim());
    const getAccordionTrigger = (label) => Array.from(container.querySelectorAll('.share-collab-accordion .ui-accordion__trigger')).find(
      (button) => button.textContent.includes(label)
    );
    const invitesAccordion = getAccordionTrigger('Invites');
    const membersAccordion = getAccordionTrigger('Members');
    const accessRequestsAccordion = getAccordionTrigger('Access requests');

    act(() => {
      toggles[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      toggles[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Collaborate');
    expect(sectionTitles).toEqual(['Collaborators', 'Access policy']);
    expect(container.textContent).toContain('Collaborators');
    expect(container.querySelector('.share-collab-settings .share-collab-subtitle')).toBeNull();
    expect(optionLabels).toEqual(expect.arrayContaining([
      'Private (Only owners and editors can invite collaborators)',
      'Open viewer invites (People with map access can invite viewers)',
      'Named (Show collaborator names and emails)',
      'Anonymous (Show role-based anonymous names)',
    ]));
    expect(container.textContent).toContain('Access');
    expect(container.textContent).toContain('Appearance');
    expect(container.textContent).not.toContain('Access mode');
    expect(container.textContent).not.toContain('Presence names');
    expect(container.textContent).toContain('Controls who can invite viewer-only collaborators');
    expect(container.textContent).not.toContain('Controls who can invite viewer-only collaborators.');
    expect(container.textContent).toContain('Controls how live collaborators appear to others');
    expect(container.textContent).toContain('Allow access requests from outside users');
    expect(container.textContent).not.toContain('removed or outside users');
    expect(invitesAccordion).toBeTruthy();
    expect(membersAccordion).toBeTruthy();
    expect(accessRequestsAccordion).toBeTruthy();
    expect(invitesAccordion.getAttribute('aria-expanded')).toBe('true');
    expect(membersAccordion.getAttribute('aria-expanded')).toBe('false');
    expect(accessRequestsAccordion.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).toContain('Your pending invites will show here.');
    expect(container.textContent).not.toContain('No collaborators yet.');
    expect(container.textContent).not.toContain('No pending access requests.');
    expect(container.textContent).not.toContain('Copy share link');
    expect(onUpdateCollaborationSettings).toHaveBeenCalledWith({
      non_viewer_invites_require_owner: false,
    });
    expect(onUpdateCollaborationSettings).toHaveBeenCalledWith({
      access_requests_enabled: false,
    });
  });

  test('collaboration invite row uses an icon role menu and requires a valid invite email', () => {
    const onCollaborationInviteRoleChange = jest.fn();
    const onSendCollaborationInvite = jest.fn();
    const renderCollaborationModal = (collaborationInviteEmail, collaborationInviteRole = 'viewer') => {
      root.render(
        <ShareModal
          show
          mode="collaboration"
          onClose={jest.fn()}
          accessLevels={{ VIEW: 'view', COMMENT: 'comment', EDIT: 'edit' }}
          sharePermission="view"
          onChangePermission={jest.fn()}
          linkCopied={false}
          onCopyLink={jest.fn()}
          shareEmails=""
          onShareEmailsChange={jest.fn()}
          onSendEmail={jest.fn()}
          collaborationEnabled
          collaborationAvailable
          collaborationInviteEmail={collaborationInviteEmail}
          onCollaborationInviteEmailChange={jest.fn()}
          collaborationInviteRole={collaborationInviteRole}
          onCollaborationInviteRoleChange={onCollaborationInviteRoleChange}
          onSendCollaborationInvite={onSendCollaborationInvite}
          collaborationInviteRoleOptions={['viewer', 'commenter']}
          collaborationMemberships={[]}
          collaborationInvites={[]}
          collaborationAccessRequests={[]}
        />
      );
    };
    const getInviteButton = () => Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'Invite'
    );

    act(() => {
      renderCollaborationModal('');
    });

    const roleTrigger = container.querySelector('.share-collab-role-trigger');
    let inviteButton = getInviteButton();

    expect(roleTrigger).toBeTruthy();
    expect(roleTrigger.getAttribute('aria-label')).toBe('Invite role: Viewer');
    expect(roleTrigger.textContent).not.toContain('Viewer');
    expect(inviteButton.className).toContain('ui-btn--type-primary');
    expect(inviteButton.className).toContain('ui-btn--md');
    expect(inviteButton.disabled).toBe(true);

    act(() => {
      roleTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const commenterItem = Array.from(container.querySelectorAll('.share-collab-role-menu-item')).find(
      (item) => item.textContent.includes('Commenter')
    );
    expect(commenterItem).toBeTruthy();

    act(() => {
      commenterItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCollaborationInviteRoleChange).toHaveBeenCalledWith('commenter');

    act(() => {
      renderCollaborationModal('teammate@example.com');
    });

    inviteButton = getInviteButton();
    expect(inviteButton.disabled).toBe(false);

    act(() => {
      renderCollaborationModal('outside@example.com', 'commenter');
    });

    expect(container.textContent).toContain('Invite anyone by email.');
    expect(container.textContent).not.toContain('before they can be invited');
  });

  test('hides unavailable collaboration roles and owner invite options', () => {
    act(() => {
      root.render(
        <ShareModal
          show
          mode="collaboration"
          onClose={jest.fn()}
          accessLevels={{ VIEW: 'view', COMMENT: 'comment', EDIT: 'edit' }}
          sharePermission="view"
          onChangePermission={jest.fn()}
          linkCopied={false}
          onCopyLink={jest.fn()}
          shareEmails=""
          onShareEmailsChange={jest.fn()}
          onSendEmail={jest.fn()}
          collaborationEnabled
          collaborationAvailable
          collaborationInviteEmail="person@example.com"
          onCollaborationInviteEmailChange={jest.fn()}
          collaborationInviteRole="viewer"
          onCollaborationInviteRoleChange={jest.fn()}
          onSendCollaborationInvite={jest.fn()}
          collaborationInviteRoleOptions={['viewer', 'commenter']}
          collaborationMemberships={[]}
          collaborationInvites={[]}
          collaborationAccessRequests={[
            {
              id: 'request-1',
              requesterName: 'Pat',
              requesterEmail: 'pat@example.com',
              requestedRole: 'editor',
            },
          ]}
          canViewAccessRequests
          canManageCollaborationSettings
        />
      );
    });

    const roleTrigger = container.querySelector('.share-collab-role-trigger');
    act(() => {
      roleTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const inviteRoleLabels = Array.from(container.querySelectorAll('.share-collab-role-menu-item'))
      .map((item) => item.textContent.trim());
    expect(inviteRoleLabels).toEqual(['Viewer', 'Commenter']);
    expect(inviteRoleLabels).not.toContain('Editor');
    expect(inviteRoleLabels).not.toContain('Owner');

    const accessRequestsTrigger = Array.from(container.querySelectorAll('.share-collab-accordion .ui-accordion__trigger')).find(
      (button) => button.textContent.includes('Access requests')
    );
    act(() => {
      accessRequestsTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const requestRoleOptions = Array.from(container.querySelectorAll('.share-collab-request-actions option'))
      .map((option) => option.textContent.trim());
    expect(requestRoleOptions).toEqual(['Viewer', 'Commenter']);
  });

  test('shows member avatars without redundant owner or self badges', () => {
    act(() => {
      root.render(
        <ShareModal
          show
          mode="collaboration"
          onClose={jest.fn()}
          accessLevels={{ VIEW: 'view', COMMENT: 'comment', EDIT: 'edit' }}
          sharePermission="view"
          onChangePermission={jest.fn()}
          linkCopied={false}
          onCopyLink={jest.fn()}
          shareEmails=""
          onShareEmailsChange={jest.fn()}
          onSendEmail={jest.fn()}
          collaborationEnabled
          collaborationAvailable
          collaborationMemberships={[
            {
              id: 'owner-row',
              userId: 'u1',
              userName: 'Free QA',
              userEmail: 'free@test.vellic.local',
              role: 'owner',
              implicitOwner: true,
            },
          ]}
          currentUserId="u1"
          collaborationInvites={[]}
          collaborationAccessRequests={[]}
        />
      );
    });

    const membersAccordion = Array.from(container.querySelectorAll('.share-collab-accordion .ui-accordion__trigger')).find(
      (button) => button.textContent.includes('Members')
    );
    act(() => {
      membersAccordion.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.share-collab-avatar')).not.toBeNull();
    expect(container.textContent).toContain('Free QA');
    expect(container.textContent).toContain('free@test.vellic.local');
    expect(container.textContent).not.toContain('YOU');
    expect(container.textContent).not.toContain('PRIMARY OWNER');
  });

  test('email send action uses shared brand filled button styling and requires a valid email', () => {
    const renderShareModal = (shareEmails) => {
      root.render(
        <ShareModal
          show
          onClose={jest.fn()}
          accessLevels={{ VIEW: 'view', COMMENT: 'comment', EDIT: 'edit' }}
          sharePermission="view"
          onChangePermission={jest.fn()}
          linkCopied={false}
          onCopyLink={jest.fn()}
          shareEmails={shareEmails}
          onShareEmailsChange={jest.fn()}
          onSendEmail={jest.fn()}
          collaborationEnabled={false}
          collaborationMemberships={[]}
          collaborationInvites={[]}
          collaborationAccessRequests={[]}
        />
      );
    };
    const getSendButton = () => Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'Send'
    );

    act(() => {
      renderShareModal('');
    });

    let sendButton = getSendButton();

    expect(sendButton).toBeTruthy();
    expect(sendButton.className).toContain('ui-btn');
    expect(sendButton.className).toContain('ui-btn--type-primary');
    expect(sendButton.className).toContain('ui-btn--style-brand');
    expect(sendButton.disabled).toBe(true);

    act(() => {
      renderShareModal('not-an-email');
    });

    sendButton = getSendButton();
    expect(sendButton.disabled).toBe(true);
    expect(container.querySelector('input[placeholder="Share by email"]').getAttribute('aria-invalid')).toBe('true');

    act(() => {
      renderShareModal('person@example.com');
    });

    sendButton = getSendButton();
    expect(sendButton.disabled).toBe(false);
  });
});

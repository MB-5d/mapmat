import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Edit2,
  Eye,
  Mail,
  MessageSquare,
  Send,
  Trash2,
  Users,
} from 'lucide-react';

import Button from '../ui/Button';
import Badge from '../ui/Badge';
import CheckboxField from '../ui/CheckboxField';
import Modal from '../ui/Modal';
import RadioCardGroup from '../ui/RadioCardGroup';
import SelectInput from '../ui/SelectInput';
import TextInput from '../ui/TextInput';

const ROLE_OPTIONS = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'commenter', label: 'Commenter' },
  { value: 'editor', label: 'Editor' },
  { value: 'owner', label: 'Owner' },
];

const APPROVAL_ROLE_OPTIONS = ROLE_OPTIONS.filter((option) => option.value !== 'owner');

const sameId = (left, right) => {
  if (left === undefined || left === null || right === undefined || right === null) return false;
  return String(left) === String(right);
};

const ShareModal = ({
  show,
  onClose,
  accessLevels,
  sharePermission,
  onChangePermission,
  linkCopied,
  onCopyLink,
  canShareLinks = true,
  shareEmails,
  onShareEmailsChange,
  onSendEmail,
  collaborationEnabled = false,
  collaborationAvailable = false,
  collaborationLoading = false,
  collaborationError = '',
  collaborationInviteEmail = '',
  onCollaborationInviteEmailChange,
  collaborationInviteRole = 'viewer',
  onCollaborationInviteRoleChange,
  onSendCollaborationInvite,
  canSendCollaborationInvites = true,
  currentCollaborationRole = 'viewer',
  currentUserId = null,
  collaborationMemberships = [],
  collaborationInvites = [],
  collaborationSettings = null,
  collaborationCapabilities = null,
  collaborationInviteRoleOptions = [],
  collaborationAccessRequests = [],
  canManageCollaborationSettings = false,
  canManageCollaborationMembers = false,
  canViewAccessRequests = false,
  onUpdateCollaborationSettings,
  onUpdateCollaborationMemberRole,
  onRemoveCollaborationMember,
  onRevokeCollaborationInvite,
  onReviewCollaborationAccessRequest,
}) => {
  const [requestRoleSelections, setRequestRoleSelections] = useState({});

  useEffect(() => {
    const nextSelections = {};
    (collaborationAccessRequests || []).forEach((request) => {
      nextSelections[request.id] = request.requestedRole || 'viewer';
    });
    setRequestRoleSelections(nextSelections);
  }, [collaborationAccessRequests]);

  if (!show) return null;

  const formatRole = (role) => {
    const value = String(role || '').trim();
    if (!value) return 'Viewer';
    return value.charAt(0).toUpperCase() + value.slice(1);
  };

  const settings = collaborationSettings || {
    accessPolicy: 'private',
    nonViewerInvitesRequireOwner: true,
    accessRequestsEnabled: true,
    presenceIdentityMode: 'named',
  };

  const isOwner = currentCollaborationRole === 'owner';
  const canGrantOwner = isOwner;
  const inviteRoleOptions = isOwner ? ROLE_OPTIONS : APPROVAL_ROLE_OPTIONS;
  const inviteRoleOptionValues = Array.isArray(collaborationInviteRoleOptions) && collaborationInviteRoleOptions.length > 0
    ? collaborationInviteRoleOptions
    : inviteRoleOptions.map((option) => option.value);
  const visibleInviteRoleOptions = inviteRoleOptions.filter((option) => inviteRoleOptionValues.includes(option.value));
  const memberRoleOptions = canGrantOwner ? ROLE_OPTIONS : APPROVAL_ROLE_OPTIONS;
  const canViewManagementSurfaces = canManageCollaborationMembers || canManageCollaborationSettings || canViewAccessRequests;
  const viewerInvitesOpen = collaborationCapabilities?.accessPolicy === 'viewer_invites_open';
  const showInviteComposer = collaborationAvailable && canSendCollaborationInvites && visibleInviteRoleOptions.length > 0;
  const showSelfServeSummary = collaborationAvailable && !canViewManagementSurfaces;

  const handleSettingToggle = (key, value) => {
    onUpdateCollaborationSettings?.({ [key]: value });
  };

  const permissionOptions = [
    {
      value: accessLevels.VIEW,
      label: 'View only',
      description: 'Can view the sitemap',
      icon: <Eye size={16} />,
    },
    {
      value: accessLevels.COMMENT,
      label: 'Can comment',
      description: 'View and add comments',
      icon: <MessageSquare size={16} />,
    },
    {
      value: accessLevels.EDIT,
      label: 'Can edit',
      description: 'Full editing access',
      icon: <Edit2 size={16} />,
    },
  ];

  const renderMembershipRow = (member) => {
    const isSelf = sameId(member.userId, currentUserId);
    const isImplicitOwner = !!member.implicitOwner;
    const isOwnerMember = member.role === 'owner';
    const canEditMember = canManageCollaborationMembers
      && !isSelf
      && !isImplicitOwner
      && (!isOwnerMember || isOwner);

    const canRemoveMember = canEditMember;

    return (
      <div className="share-collab-item share-collab-item-wide" key={member.id || `${member.userId}-${member.role}`}>
        <div className="share-collab-main">
          <div className="share-collab-name">
            {member.userName || member.userEmail || 'Member'}
            {isSelf ? <Badge className="share-collab-inline-badge" label="You" /> : null}
            {isImplicitOwner ? <Badge className="share-collab-inline-badge" label="Primary owner" /> : null}
          </div>
          <div className="share-collab-meta">{member.userEmail || ''}</div>
        </div>
        <div className="share-collab-controls">
          {canEditMember ? (
            <SelectInput
              className="share-collab-role-select"
              value={member.role}
              disabled={collaborationLoading}
              onChange={(event) => onUpdateCollaborationMemberRole?.(member.userId, event.target.value)}
            >
              {memberRoleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectInput>
          ) : (
            <div className="share-collab-role">{formatRole(member.role)}</div>
          )}
          {canRemoveMember ? (
            <button
              className="share-collab-revoke"
              onClick={() => onRemoveCollaborationMember?.(member)}
              aria-label="Remove member"
              disabled={collaborationLoading}
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <Modal
      show={show}
      onClose={onClose}
      title="Share Sitemap"
      size="md"
      scrollable
      className="share-modal"
    >
          {canShareLinks ? (
            <>
              <div className="share-section">
                <div className="share-section-title">Permission Level</div>
                <RadioCardGroup
                  className="share-permission-options"
                  name="sharePermission"
                  value={sharePermission}
                  onChange={onChangePermission}
                  options={permissionOptions}
                />
              </div>

              <div className="share-section">
                <Button
                  className={`share-link-btn ${linkCopied ? 'copied' : ''}`}
                  variant={linkCopied ? 'secondary' : 'primary'}
                  onClick={onCopyLink}
                  disabled={!canShareLinks}
                >
                  {linkCopied ? <Check size={18} /> : <Copy size={18} />}
                  <span>{linkCopied ? 'Link Copied!' : 'Copy Share Link'}</span>
                </Button>
              </div>

              <div className="share-section">
                <div className="share-section-title">Send via Email</div>
                <div className="share-email-section">
                  <div className="share-email-input">
                    <Mail size={18} />
                    <TextInput
                      type="text"
                      className="share-email-text-input"
                      placeholder="Enter email addresses..."
                      value={shareEmails}
                      onChange={(e) => onShareEmailsChange(e.target.value)}
                    />
                  </div>
                  <Button className="share-email-btn" size="sm" onClick={onSendEmail}>
                    Send
                  </Button>
                </div>
              </div>
            </>
          ) : null}

          {collaborationEnabled && (
            <div className="share-section">
              <div className="share-section-title">Collaborators</div>
              {!collaborationAvailable ? (
                <div className="share-collab-empty">Save this map first to invite collaborators.</div>
              ) : (
                <>
                  {canViewManagementSurfaces ? (
                    <div className="share-collab-settings">
                      <div className="share-collab-subtitle">
                        <Users size={14} />
                        <span>Access Policy</span>
                      </div>
                      <div className="share-collab-settings-grid">
                        <label className="share-collab-setting">
                          <span className="share-collab-setting-label">Access mode</span>
                          <SelectInput
                            className="share-collab-role-select"
                            value={settings.accessPolicy}
                            disabled={!canManageCollaborationSettings || collaborationLoading}
                            onChange={(event) => handleSettingToggle('access_policy', event.target.value)}
                          >
                            <option value="private">Private</option>
                            <option value="viewer_invites_open">Open viewer invites</option>
                          </SelectInput>
                        </label>
                        <label className="share-collab-setting">
                          <span className="share-collab-setting-label">Presence names</span>
                          <SelectInput
                            className="share-collab-role-select"
                            value={settings.presenceIdentityMode}
                            disabled={!canManageCollaborationSettings || collaborationLoading}
                            onChange={(event) => handleSettingToggle('presence_identity_mode', event.target.value)}
                          >
                            <option value="named">Named</option>
                            <option value="anonymous">Anonymous</option>
                          </SelectInput>
                        </label>
                      </div>
                      <CheckboxField
                        className="share-collab-checkbox"
                        checked={!!settings.nonViewerInvitesRequireOwner}
                        disabled={!canManageCollaborationSettings || collaborationLoading}
                        onChange={(event) => handleSettingToggle('non_viewer_invites_require_owner', event.target.checked)}
                        label="Require owner approval for editor and commenter invites"
                      />
                      <CheckboxField
                        className="share-collab-checkbox"
                        checked={!!settings.accessRequestsEnabled}
                        disabled={!canManageCollaborationSettings || collaborationLoading}
                        onChange={(event) => handleSettingToggle('access_requests_enabled', event.target.checked)}
                        label="Allow access requests from removed or outside users"
                      />
                      {!canManageCollaborationSettings ? (
                        <div className="share-collab-empty">Only owners can change collaboration settings.</div>
                      ) : null}
                    </div>
                  ) : null}

                  {showSelfServeSummary ? (
                    <div className="share-collab-settings">
                      <div className="share-collab-subtitle">
                        <Users size={14} />
                        <span>Access Summary</span>
                      </div>
                      <div className="share-collab-empty">
                        {viewerInvitesOpen
                          ? 'Viewer invites are open on this map.'
                          : 'This map uses owner-managed collaboration.'}
                      </div>
                      <div className="share-collab-empty">
                        {viewerInvitesOpen
                          ? 'You can invite read-only viewers, but higher access still stays owner-controlled.'
                          : 'Only owners and editors can send invites from this map.'}
                      </div>
                    </div>
                  ) : null}

                  {showInviteComposer ? (
                    <div className="share-collab-invite-row">
                      <div className="share-email-input">
                        <Mail size={18} />
                        <TextInput
                          type="text"
                          className="share-email-text-input"
                          placeholder="Invite by email..."
                          value={collaborationInviteEmail}
                          onChange={(e) => onCollaborationInviteEmailChange?.(e.target.value)}
                          disabled={!canSendCollaborationInvites}
                        />
                      </div>
                      <SelectInput
                        className="share-collab-role-select"
                        value={collaborationInviteRole}
                        onChange={(e) => onCollaborationInviteRoleChange?.(e.target.value)}
                        disabled={!canSendCollaborationInvites || visibleInviteRoleOptions.length <= 1}
                      >
                        {visibleInviteRoleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </SelectInput>
                      <Button
                        className="share-collab-send"
                        variant="secondary"
                        size="sm"
                        onClick={onSendCollaborationInvite}
                        disabled={collaborationLoading || !canSendCollaborationInvites}
                        loading={collaborationLoading}
                      >
                        {!collaborationLoading ? <Send size={14} /> : null}
                        <span>Invite</span>
                      </Button>
                    </div>
                  ) : null}

                  {!showInviteComposer && !canViewManagementSurfaces ? (
                    <div className="share-collab-empty">No self-serve collaboration actions are available on this map.</div>
                  ) : null}

                  {collaborationError ? (
                    <div className="share-collab-error">{collaborationError}</div>
                  ) : null}

                  {canViewManagementSurfaces ? (
                    <>
                      <div className="share-collab-grid">
                        <div>
                          <div className="share-collab-subtitle">
                            <Users size={14} />
                            <span>Members</span>
                          </div>
                          <div className="share-collab-list">
                            {collaborationMemberships.length === 0 ? (
                              <div className="share-collab-empty">No collaborators yet.</div>
                            ) : (
                              collaborationMemberships.map(renderMembershipRow)
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="share-collab-subtitle">
                            <Mail size={14} />
                            <span>Pending Invites</span>
                          </div>
                          <div className="share-collab-list">
                            {collaborationInvites.length === 0 ? (
                              <div className="share-collab-empty">No pending invites.</div>
                            ) : (
                              collaborationInvites.map((invite) => (
                                <div className="share-collab-item" key={invite.id}>
                                  <div className="share-collab-main">
                                    <div className="share-collab-name">{invite.inviteeEmail}</div>
                                    <div className="share-collab-meta">{formatRole(invite.role)}</div>
                                  </div>
                                  <button
                                    className="share-collab-revoke"
                                    onClick={() => onRevokeCollaborationInvite?.(invite.id)}
                                    aria-label="Revoke invite"
                                    disabled={collaborationLoading || !canSendCollaborationInvites}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}

                  {canViewAccessRequests ? (
                    <div className="share-collab-access-requests">
                      <div className="share-collab-subtitle">
                        <Mail size={14} />
                        <span>Access Requests</span>
                      </div>
                      <div className="share-collab-list">
                        {collaborationAccessRequests.length === 0 ? (
                          <div className="share-collab-empty">No pending access requests.</div>
                        ) : (
                          collaborationAccessRequests.map((request) => (
                            <div className="share-collab-item share-collab-item-stack" key={request.id}>
                              <div className="share-collab-main">
                                <div className="share-collab-name">
                                  {request.requesterName || request.requesterEmail || 'Requester'}
                                </div>
                                <div className="share-collab-meta">
                                  Requested {formatRole(request.requestedRole)}
                                  {request.message ? ` • ${request.message}` : ''}
                                </div>
                              </div>
                              <div className="share-collab-request-actions">
                                <SelectInput
                                  className="share-collab-role-select"
                                  value={requestRoleSelections[request.id] || request.requestedRole || 'viewer'}
                                  onChange={(event) => setRequestRoleSelections((prev) => ({
                                    ...prev,
                                    [request.id]: event.target.value,
                                  }))}
                                  disabled={collaborationLoading}
                                >
                                  {APPROVAL_ROLE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </SelectInput>
                                <Button
                                  className="share-email-btn"
                                  size="sm"
                                  onClick={() => onReviewCollaborationAccessRequest?.(
                                    request.id,
                                    'approved',
                                    requestRoleSelections[request.id] || request.requestedRole || 'viewer'
                                  )}
                                  disabled={collaborationLoading}
                                >
                                  Approve
                                </Button>
                                <Button
                                  className="share-collab-deny"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => onReviewCollaborationAccessRequest?.(request.id, 'denied')}
                                  disabled={collaborationLoading}
                                >
                                  Deny
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}
    </Modal>
  );
};

export default ShareModal;

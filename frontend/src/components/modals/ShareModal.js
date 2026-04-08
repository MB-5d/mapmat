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
  X,
} from 'lucide-react';

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
            {isSelf ? <span className="share-collab-inline-badge">You</span> : null}
            {isImplicitOwner ? <span className="share-collab-inline-badge">Primary owner</span> : null}
          </div>
          <div className="share-collab-meta">{member.userEmail || ''}</div>
        </div>
        <div className="share-collab-controls">
          {canEditMember ? (
            <select
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
            </select>
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
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card modal-md modal-scrollable share-modal"
        data-feedback-id="share-modal"
        data-feedback-label="Share modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Share Sitemap</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body">
          {canShareLinks ? (
            <>
              <div className="share-section">
                <div className="share-section-title">Permission Level</div>
                <div className="share-permission-options">
                  <label className={`share-permission-option ${sharePermission === accessLevels.VIEW ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="sharePermission"
                      checked={sharePermission === accessLevels.VIEW}
                      onChange={() => onChangePermission(accessLevels.VIEW)}
                    />
                    <Eye size={16} />
                    <div className="share-permission-text">
                      <span className="share-permission-label">View only</span>
                      <span className="share-permission-desc">Can view the sitemap</span>
                    </div>
                  </label>
                  <label className={`share-permission-option ${sharePermission === accessLevels.COMMENT ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="sharePermission"
                      checked={sharePermission === accessLevels.COMMENT}
                      onChange={() => onChangePermission(accessLevels.COMMENT)}
                    />
                    <MessageSquare size={16} />
                    <div className="share-permission-text">
                      <span className="share-permission-label">Can comment</span>
                      <span className="share-permission-desc">View and add comments</span>
                    </div>
                  </label>
                  <label className={`share-permission-option ${sharePermission === accessLevels.EDIT ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="sharePermission"
                      checked={sharePermission === accessLevels.EDIT}
                      onChange={() => onChangePermission(accessLevels.EDIT)}
                    />
                    <Edit2 size={16} />
                    <div className="share-permission-text">
                      <span className="share-permission-label">Can edit</span>
                      <span className="share-permission-desc">Full editing access</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="share-section">
                <button
                  className={`share-link-btn ${linkCopied ? 'copied' : ''}`}
                  onClick={onCopyLink}
                  disabled={!canShareLinks}
                >
                  {linkCopied ? <Check size={18} /> : <Copy size={18} />}
                  <span>{linkCopied ? 'Link Copied!' : 'Copy Share Link'}</span>
                </button>
              </div>

              <div className="share-section">
                <div className="share-section-title">Send via Email</div>
                <div className="share-email-section">
                  <div className="share-email-input">
                    <Mail size={18} />
                    <input
                      type="text"
                      placeholder="Enter email addresses..."
                      value={shareEmails}
                      onChange={(e) => onShareEmailsChange(e.target.value)}
                    />
                  </div>
                  <button className="share-email-btn" onClick={onSendEmail}>
                    Send
                  </button>
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
                          <select
                            className="share-collab-role-select"
                            value={settings.accessPolicy}
                            disabled={!canManageCollaborationSettings || collaborationLoading}
                            onChange={(event) => handleSettingToggle('access_policy', event.target.value)}
                          >
                            <option value="private">Private</option>
                            <option value="viewer_invites_open">Open viewer invites</option>
                          </select>
                        </label>
                        <label className="share-collab-setting">
                          <span className="share-collab-setting-label">Presence names</span>
                          <select
                            className="share-collab-role-select"
                            value={settings.presenceIdentityMode}
                            disabled={!canManageCollaborationSettings || collaborationLoading}
                            onChange={(event) => handleSettingToggle('presence_identity_mode', event.target.value)}
                          >
                            <option value="named">Named</option>
                            <option value="anonymous">Anonymous</option>
                          </select>
                        </label>
                      </div>
                      <label className="share-collab-checkbox">
                        <input
                          type="checkbox"
                          checked={!!settings.nonViewerInvitesRequireOwner}
                          disabled={!canManageCollaborationSettings || collaborationLoading}
                          onChange={(event) => handleSettingToggle('non_viewer_invites_require_owner', event.target.checked)}
                        />
                        <span>Require owner approval for editor and commenter invites</span>
                      </label>
                      <label className="share-collab-checkbox">
                        <input
                          type="checkbox"
                          checked={!!settings.accessRequestsEnabled}
                          disabled={!canManageCollaborationSettings || collaborationLoading}
                          onChange={(event) => handleSettingToggle('access_requests_enabled', event.target.checked)}
                        />
                        <span>Allow access requests from removed or outside users</span>
                      </label>
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
                        <input
                          type="text"
                          placeholder="Invite by email..."
                          value={collaborationInviteEmail}
                          onChange={(e) => onCollaborationInviteEmailChange?.(e.target.value)}
                          disabled={!canSendCollaborationInvites}
                        />
                      </div>
                      <select
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
                      </select>
                      <button
                        className="modal-btn secondary share-collab-send"
                        onClick={onSendCollaborationInvite}
                        disabled={collaborationLoading || !canSendCollaborationInvites}
                      >
                        <Send size={14} />
                        <span>{collaborationLoading ? 'Sending...' : 'Invite'}</span>
                      </button>
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
                                <select
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
                                </select>
                                <button
                                  className="share-email-btn"
                                  onClick={() => onReviewCollaborationAccessRequest?.(
                                    request.id,
                                    'approved',
                                    requestRoleSelections[request.id] || request.requestedRole || 'viewer'
                                  )}
                                  disabled={collaborationLoading}
                                >
                                  Approve
                                </button>
                                <button
                                  className="share-collab-deny"
                                  onClick={() => onReviewCollaborationAccessRequest?.(request.id, 'denied')}
                                  disabled={collaborationLoading}
                                >
                                  Deny
                                </button>
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
        </div>
      </div>
    </div>
  );
};

export default ShareModal;

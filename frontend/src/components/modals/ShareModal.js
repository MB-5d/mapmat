import React from 'react';
import { Check, Copy, Edit2, Eye, Mail, MessageSquare, Send, Trash2, Users, X } from 'lucide-react';

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
  collaborationMemberships = [],
  collaborationInvites = [],
  onRevokeCollaborationInvite,
}) => {
  if (!show) return null;

  const formatRole = (role) => {
    const value = String(role || '').trim();
    if (!value) return 'Viewer';
    return value.charAt(0).toUpperCase() + value.slice(1);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-md modal-scrollable share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Share Sitemap</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body">
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
            {!canShareLinks ? (
              <div className="share-collab-empty">You do not have permission to create share links.</div>
            ) : null}
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

          {collaborationEnabled && (
            <div className="share-section">
              <div className="share-section-title">Collaborators (Beta)</div>
              {!collaborationAvailable ? (
                <div className="share-collab-empty">Save this map first to invite collaborators.</div>
              ) : (
                <>
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
                      disabled={!canSendCollaborationInvites}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="commenter">Commenter</option>
                      <option value="editor">Editor</option>
                    </select>
                    <button
                      className="share-email-btn"
                      onClick={onSendCollaborationInvite}
                      disabled={collaborationLoading || !canSendCollaborationInvites}
                    >
                      <Send size={14} />
                      <span>{collaborationLoading ? 'Sending...' : 'Invite'}</span>
                    </button>
                  </div>

                  {!canSendCollaborationInvites ? (
                    <div className="share-collab-empty">You can view collaborators but cannot manage invites.</div>
                  ) : null}

                  {collaborationError ? (
                    <div className="share-collab-error">{collaborationError}</div>
                  ) : null}

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
                          collaborationMemberships.map((member) => (
                            <div className="share-collab-item" key={member.id || `${member.userId}-${member.role}`}>
                              <div className="share-collab-main">
                                <div className="share-collab-name">{member.userName || member.userEmail || 'Member'}</div>
                                <div className="share-collab-meta">{member.userEmail || ''}</div>
                              </div>
                              <div className="share-collab-role">{formatRole(member.role)}</div>
                            </div>
                          ))
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
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareModal;

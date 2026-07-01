import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Check,
  Copy,
  Eye,
  Mail,
  MessageSquare,
  Send,
  Trash2,
  Users,
} from 'lucide-react';

import classNames from '../../utils/classNames';
import Accordion from '../ui/Accordion';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';
import CheckboxField from '../ui/CheckboxField';
import { EditIcon } from '../ui/icons';
import { MenuItem, MenuPanel } from '../ui/Menu';
import Modal from '../ui/Modal';
import OptionCard from '../ui/OptionCard';
import SelectInput from '../ui/SelectInput';
import TextInput from '../ui/TextInput';

const ROLE_OPTIONS = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'commenter', label: 'Commenter' },
  { value: 'editor', label: 'Editor' },
  { value: 'owner', label: 'Owner' },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hasValidShareEmailInput = (value = '') => {
  const emails = String(value || '')
    .split(/[,\s;]+/)
    .map((email) => email.trim())
    .filter(Boolean);
  return emails.length > 0 && emails.every((email) => EMAIL_PATTERN.test(email));
};

const renderRoleIcon = (role, size = 16) => {
  if (role === 'commenter') return <MessageSquare size={size} />;
  if (role === 'editor') return <EditIcon size={size} />;
  if (role === 'owner') return <Users size={size} />;
  return <Eye size={size} />;
};

const sameId = (left, right) => {
  if (left === undefined || left === null || right === undefined || right === null) return false;
  return String(left) === String(right);
};

const getAvatarLabel = (member = {}) => {
  const label = String(member.userName || member.userEmail || 'Member').trim();
  if (!label) return 'M';
  const emailName = label.includes('@') ? label.split('@')[0] : label;
  const parts = emailName.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return emailName.slice(0, 2).toUpperCase();
};

const ShareModal = ({
  show,
  onClose,
  mode = 'share',
  accessLevels,
  sharePermission,
  onChangePermission,
  linkCopied,
  onCopyLink,
  canShareLinks = true,
  shareLinksDisabledReason = 'Your account does not have permission to create share links for this map.',
  allowedSharePermissions = null,
  sharePermissionDisabledReason = 'Your account does not have permission to grant others that level on this map.',
  onUpgradePlan,
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
  const [openCollaborationAccordion, setOpenCollaborationAccordion] = useState('invites');
  const [showInviteRoleMenu, setShowInviteRoleMenu] = useState(false);
  const inviteRoleMenuRef = useRef(null);

  useEffect(() => {
    if (!show || mode !== 'collaboration') return;

    const nextSelections = {};
    (collaborationAccessRequests || []).forEach((request) => {
      nextSelections[request.id] = request.requestedRole || 'viewer';
    });
    setRequestRoleSelections((currentSelections) => {
      const currentKeys = Object.keys(currentSelections);
      const nextKeys = Object.keys(nextSelections);
      if (
        currentKeys.length === nextKeys.length
        && nextKeys.every((key) => currentSelections[key] === nextSelections[key])
      ) {
        return currentSelections;
      }
      return nextSelections;
    });
  }, [show, mode, collaborationAccessRequests]);

  useEffect(() => {
    if (show && mode === 'collaboration') {
      setOpenCollaborationAccordion('invites');
    }
  }, [show, mode]);

  useEffect(() => {
    if (!showInviteRoleMenu) return undefined;

    const handlePointerDown = (event) => {
      if (inviteRoleMenuRef.current?.contains(event.target)) return;
      setShowInviteRoleMenu(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowInviteRoleMenu(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showInviteRoleMenu]);

  useEffect(() => {
    if (!show || mode !== 'collaboration' || !collaborationAvailable || !canSendCollaborationInvites) {
      setShowInviteRoleMenu(false);
    }
  }, [show, mode, collaborationAvailable, canSendCollaborationInvites]);

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
  const inviteRoleOptionValues = new Set(
    (Array.isArray(collaborationInviteRoleOptions) ? collaborationInviteRoleOptions : [])
      .map((role) => String(role || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const visibleInviteRoleOptions = ROLE_OPTIONS.filter((option) => (
    option.value !== 'owner' && inviteRoleOptionValues.has(option.value)
  ));
  const accessRequestRoleOptions = visibleInviteRoleOptions.length
    ? visibleInviteRoleOptions
    : ROLE_OPTIONS.filter((option) => option.value === 'viewer');
  const memberGrantRoleValues = new Set(visibleInviteRoleOptions.map((option) => option.value));
  if (canGrantOwner && inviteRoleOptionValues.has('owner')) {
    memberGrantRoleValues.add('owner');
  }
  const memberRoleOptions = ROLE_OPTIONS.filter((option) => memberGrantRoleValues.has(option.value));
  const canViewManagementSurfaces = canManageCollaborationMembers || canManageCollaborationSettings || canViewAccessRequests;
  const viewerInvitesOpen = collaborationCapabilities?.accessPolicy === 'viewer_invites_open';
  const showInviteComposer = collaborationAvailable && canSendCollaborationInvites && visibleInviteRoleOptions.length > 0;
  const showSelfServeSummary = collaborationAvailable && !canViewManagementSurfaces;
  const selectedInviteRoleOption = visibleInviteRoleOptions.find((option) => option.value === collaborationInviteRole)
    || visibleInviteRoleOptions[0]
    || ROLE_OPTIONS[0];
  const selectedInviteRequiresAccount = selectedInviteRoleOption?.value === 'commenter'
    || selectedInviteRoleOption?.value === 'editor';
  const hasValidCollaborationInviteEmail = hasValidShareEmailInput(collaborationInviteEmail);
  const collaborationInviteHasInvalidValue = Boolean(String(collaborationInviteEmail || '').trim()) && !hasValidCollaborationInviteEmail;
  const collaborationInviteSendDisabled = collaborationLoading || !canSendCollaborationInvites || !hasValidCollaborationInviteEmail;
  const isCollaborationMode = mode === 'collaboration';
  const showShareContent = !isCollaborationMode;
  const showCollaborationContent = isCollaborationMode && collaborationEnabled;

  const handleSettingToggle = (key, value) => {
    onUpdateCollaborationSettings?.({ [key]: value });
  };

  const handleCollaborationAccordionOpenChange = (accordionKey) => (open) => {
    setOpenCollaborationAccordion(open ? accordionKey : null);
  };

  const allowedSharePermissionSet = Array.isArray(allowedSharePermissions)
    ? new Set(allowedSharePermissions)
    : null;

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
      icon: <EditIcon size={16} />,
    },
  ].map((option) => {
    const disabled = allowedSharePermissionSet ? !allowedSharePermissionSet.has(option.value) : false;
    return {
      ...option,
      disabled,
      disabledReason: disabled ? sharePermissionDisabledReason : '',
    };
  });

  const selectedPermissionOption = permissionOptions.find((option) => option.value === sharePermission) || permissionOptions[0];
  const selectedPermissionDisabled = !!selectedPermissionOption?.disabled;
  const shareActionDisabled = !canShareLinks || selectedPermissionDisabled;
  const shareActionDisabledReason = !canShareLinks
    ? shareLinksDisabledReason
    : selectedPermissionDisabled
      ? selectedPermissionOption.disabledReason
      : '';
  const hasValidShareEmail = hasValidShareEmailInput(shareEmails);
  const shareEmailSendDisabled = shareActionDisabled || !hasValidShareEmail;
  const shareEmailHasInvalidValue = Boolean(String(shareEmails || '').trim()) && !hasValidShareEmail;

  const renderMembershipRow = (member) => {
    const isSelf = sameId(member.userId, currentUserId);
    const isImplicitOwner = !!member.implicitOwner;
    const isOwnerMember = member.role === 'owner';
    const canEditMember = canManageCollaborationMembers
      && !isSelf
      && !isImplicitOwner
      && (!isOwnerMember || isOwner)
      && memberRoleOptions.some((option) => option.value === member.role);

    const canRemoveMember = canEditMember;

    return (
      <div className="share-collab-member-row" key={member.id || `${member.userId}-${member.role}`}>
        <Avatar
          className="share-collab-avatar"
          src={member.avatarUrl || member.userAvatarUrl || null}
          label={getAvatarLabel(member)}
          size="sm"
          aria-hidden="true"
        />
        <div className="share-collab-main">
          <div className="share-collab-name">{member.userName || member.userEmail || 'Member'}</div>
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

  const renderPendingInviteRow = (invite) => (
    <div className="share-collab-item" key={invite.id}>
      <div className="share-collab-main">
        <div className="share-collab-name share-collab-name-inline">
          <span>{invite.inviteeEmail}</span>
          <span className="share-collab-role-inline">
            {renderRoleIcon(invite.role, 14)}
            <span>{formatRole(invite.role)}</span>
          </span>
        </div>
      </div>
      <button
        className="share-collab-revoke share-collab-revoke--ghost"
        onClick={() => onRevokeCollaborationInvite?.(invite.id)}
        aria-label="Revoke invite"
        disabled={collaborationLoading || !canSendCollaborationInvites}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );

  const getAccessRequestSelectedRole = (request) => {
    if (accessRequestRoleOptions.some((option) => option.value === requestRoleSelections[request.id])) {
      return requestRoleSelections[request.id];
    }
    if (accessRequestRoleOptions.some((option) => option.value === request.requestedRole)) {
      return request.requestedRole;
    }
    return accessRequestRoleOptions[0]?.value || 'viewer';
  };

  const renderAccessRequestRow = (request) => {
    const selectedRole = getAccessRequestSelectedRole(request);
    return (
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
          value={selectedRole}
          onChange={(event) => setRequestRoleSelections((prev) => ({
            ...prev,
            [request.id]: event.target.value,
          }))}
          disabled={collaborationLoading}
        >
          {accessRequestRoleOptions.map((option) => (
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
            selectedRole
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
    );
  };

  const renderAccordionTitle = (icon, label) => (
    <span className="share-collab-accordion-title">
      {icon}
      <span>{label}</span>
    </span>
  );

  return (
    <Modal
      show={show}
      onClose={onClose}
      title={isCollaborationMode ? 'Collaborate' : 'Share sitemap'}
      size="md"
      scrollable
      className="share-modal"
    >
          {showShareContent ? (
            <>
              <div className="share-section">
                <div className="share-section-title">Permission level</div>
                <div className="share-permission-options" role="radiogroup" aria-label="Permission level">
                  {permissionOptions.map((option) => {
                    const selected = option.value === sharePermission;
                    return (
                      <OptionCard
                        key={option.value}
                        className={classNames(
                          'share-permission-card',
                          selected && 'is-selected'
                        )}
                        icon={option.icon}
                        title={option.label}
                        description={option.disabled ? option.disabledReason : option.description}
                        disabled={option.disabled}
                        onClick={() => onChangePermission?.(option.value)}
                        role="radio"
                        aria-checked={selected}
                      />
                    );
                  })}
                </div>

                <div className="share-action-block">
                  <Button
                    className={`share-link-btn ${linkCopied ? 'copied' : ''}`}
                    variant={linkCopied ? 'secondary' : 'primary'}
                    onClick={onCopyLink}
                    disabled={shareActionDisabled}
                  >
                    {linkCopied ? <Check size={18} /> : <Copy size={18} />}
                    <span>{linkCopied ? 'Link copied' : 'Copy share link'}</span>
                  </Button>

                  {shareActionDisabledReason ? (
                    <div className="share-disabled-reason">
                      <span>{shareActionDisabledReason}</span>
                      {!canShareLinks && onUpgradePlan ? (
                        <Button type="button" variant="secondary" size="sm" onClick={onUpgradePlan}>
                          Upgrade plan
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="share-provider-divider"><span>or</span></div>

                <div className="share-email-section">
                  <TextInput
                    type="text"
                    shellClassName="share-email-input"
                    inputClassName="share-email-text-input"
                    placeholder="Share by email"
                    value={shareEmails}
                    onChange={(e) => onShareEmailsChange(e.target.value)}
                    leftIcon={<Mail size={18} />}
                    disabled={shareActionDisabled}
                    invalid={shareEmailHasInvalidValue}
                  />
                  <Button
                    className="share-email-btn"
                    startIcon={<Send size={14} />}
                    onClick={onSendEmail}
                    disabled={shareEmailSendDisabled}
                  >
                    Send
                  </Button>
                </div>
              </div>
            </>
          ) : null}

          {showCollaborationContent && (
            <div className="share-section">
              <div className="share-section-title">Collaborators</div>
              {!collaborationAvailable ? (
                <div className="share-collab-empty">Save this map first to invite collaborators.</div>
              ) : (
                <>
                  {collaborationError ? (
                    <div className="share-collab-error">{collaborationError}</div>
                  ) : null}

                  <div className="share-collab-accordions">
                    <Accordion
                      id="share-collab-invites"
                      className="share-collab-accordion"
                      contentClassName="share-collab-invites-content"
                      title={renderAccordionTitle(<Mail size={14} aria-hidden="true" />, 'Invites')}
                      open={openCollaborationAccordion === 'invites'}
                      onOpenChange={handleCollaborationAccordionOpenChange('invites')}
                    >
                      {showInviteComposer ? (
                        <>
                          <div className="share-collab-invite-row">
                            <TextInput
                              type="text"
                              shellClassName="share-email-input"
                              inputClassName="share-email-text-input"
                              placeholder="Invite by email..."
                              value={collaborationInviteEmail}
                              onChange={(e) => onCollaborationInviteEmailChange?.(e.target.value)}
                              disabled={!canSendCollaborationInvites}
                              invalid={collaborationInviteHasInvalidValue}
                              leftIcon={<Mail size={18} />}
                            />
                            <div className="share-collab-role-menu" ref={inviteRoleMenuRef}>
                              <button
                                type="button"
                                className="share-collab-role-trigger"
                                aria-label={`Invite role: ${selectedInviteRoleOption.label}`}
                                aria-haspopup="menu"
                                aria-expanded={showInviteRoleMenu}
                                onClick={() => setShowInviteRoleMenu((current) => !current)}
                                disabled={!canSendCollaborationInvites || visibleInviteRoleOptions.length <= 1}
                              >
                                {renderRoleIcon(selectedInviteRoleOption.value, 16)}
                                <ChevronDown size={16} aria-hidden="true" />
                              </button>
                              {showInviteRoleMenu ? (
                                <MenuPanel className="share-collab-role-menu-panel" role="menu" aria-label="Invite role">
                                  {visibleInviteRoleOptions.map((option) => (
                                    <MenuItem
                                      key={option.value}
                                      className="share-collab-role-menu-item"
                                      icon={renderRoleIcon(option.value, 14)}
                                      label={option.label}
                                      selected={option.value === collaborationInviteRole}
                                      role="menuitemradio"
                                      aria-checked={option.value === collaborationInviteRole}
                                      onClick={() => {
                                        onCollaborationInviteRoleChange?.(option.value);
                                        setShowInviteRoleMenu(false);
                                      }}
                                    />
                                  ))}
                                </MenuPanel>
                              ) : null}
                            </div>
                            <Button
                              className="share-collab-send"
                              size="md"
                              startIcon={<Send size={14} />}
                              onClick={onSendCollaborationInvite}
                              disabled={collaborationInviteSendDisabled}
                              loading={collaborationLoading}
                            >
                              Invite
                            </Button>
                          </div>
                          {selectedInviteRequiresAccount ? (
                            <div className="share-collab-empty">Invite anyone by email. They can sign up or sign in before accepting commenter or editor access.</div>
                          ) : null}
                        </>
                      ) : null}

                      {!showInviteComposer && !canViewManagementSurfaces ? (
                        <div className="share-collab-empty">No self-serve collaboration actions are available on this map.</div>
                      ) : null}

                      <div className="share-collab-list">
                        {collaborationInvites.length === 0 ? (
                          <div className="share-collab-empty">Your pending invites will show here.</div>
                        ) : (
                          collaborationInvites.map(renderPendingInviteRow)
                        )}
                      </div>
                    </Accordion>

                    <Accordion
                      id="share-collab-members"
                      className="share-collab-accordion"
                      contentClassName="share-collab-members-content"
                      title={renderAccordionTitle(<Users size={14} aria-hidden="true" />, 'Members')}
                      open={openCollaborationAccordion === 'members'}
                      onOpenChange={handleCollaborationAccordionOpenChange('members')}
                    >
                      <div className="share-collab-list share-collab-members-list">
                        {collaborationMemberships.length === 0 ? (
                          <div className="share-collab-empty">No collaborators yet.</div>
                        ) : (
                          collaborationMemberships.map(renderMembershipRow)
                        )}
                      </div>
                    </Accordion>

                    <Accordion
                      id="share-collab-access-requests"
                      className="share-collab-accordion"
                      title={renderAccordionTitle(<Mail size={14} aria-hidden="true" />, 'Access requests')}
                      open={openCollaborationAccordion === 'access-requests'}
                      onOpenChange={handleCollaborationAccordionOpenChange('access-requests')}
                    >
                      <div className="share-collab-list">
                        {!canViewAccessRequests ? (
                          <div className="share-collab-empty">Only owners can review access requests.</div>
                        ) : collaborationAccessRequests.length === 0 ? (
                          <div className="share-collab-empty">No pending access requests.</div>
                        ) : (
                          collaborationAccessRequests.map(renderAccessRequestRow)
                        )}
                      </div>
                    </Accordion>
                  </div>

                  <div className="share-section-title share-section-title--access-policy">Access policy</div>
                  {canViewManagementSurfaces ? (
                    <div className="share-collab-settings">
                      <div className="share-collab-settings-grid">
                        <SelectInput
                          fieldClassName="share-collab-setting"
                          label="Access"
                          hint="Controls who can invite viewer-only collaborators"
                          className="share-collab-role-select"
                          value={settings.accessPolicy}
                          disabled={!canManageCollaborationSettings || collaborationLoading}
                          onChange={(event) => handleSettingToggle('access_policy', event.target.value)}
                        >
                          <option value="private">Private (Only owners and editors can invite collaborators)</option>
                          <option value="viewer_invites_open">Open viewer invites (People with map access can invite viewers)</option>
                        </SelectInput>
                        <SelectInput
                          fieldClassName="share-collab-setting"
                          label="Appearance"
                          hint="Controls how live collaborators appear to others"
                          className="share-collab-role-select"
                          value={settings.presenceIdentityMode}
                          disabled={!canManageCollaborationSettings || collaborationLoading}
                          onChange={(event) => handleSettingToggle('presence_identity_mode', event.target.value)}
                        >
                          <option value="named">Named (Show collaborator names and emails)</option>
                          <option value="anonymous">Anonymous (Show role-based anonymous names)</option>
                        </SelectInput>
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
                        label="Allow access requests from outside users"
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
                        <span>Access summary</span>
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
                </>
              )}
            </div>
          )}
    </Modal>
  );
};

export default ShareModal;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Eye, Mail, MessageSquare, Network, Send } from 'lucide-react';

import AccountDrawer from '../drawers/AccountDrawer';
import Button from '../ui/Button';
import { EditIcon } from '../ui/icons';
import { MenuItem, MenuPanel } from '../ui/Menu';
import SelectInput from '../ui/SelectInput';
import TextInput from '../ui/TextInput';

const formatRoleLabel = (role) => {
  const value = String(role || '').trim();
  if (!value) return 'Viewer';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY_LIST = [];

const renderRoleIcon = (role) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (normalizedRole === 'commenter') return <MessageSquare size={14} aria-hidden="true" />;
  if (normalizedRole === 'editor') return <EditIcon size={14} aria-hidden="true" />;
  return <Eye size={14} aria-hidden="true" />;
};

const InviteInboxModal = ({
  show,
  invites = EMPTY_LIST,
  sentInvites = EMPTY_LIST,
  loading = false,
  error = '',
  eligibleMaps = EMPTY_LIST,
  selectedMapId = '',
  onSelectedMapIdChange,
  inviteEmail = '',
  onInviteEmailChange,
  inviteRole = 'viewer',
  inviteRoleOptions = EMPTY_LIST,
  onInviteRoleChange,
  onSendInvite,
  onClose,
  onAccept,
  onDecline,
  onCancelSentInvite,
  onResendSentInvite,
}) => {
  const [mapQuery, setMapQuery] = useState('');
  const [showMapMenu, setShowMapMenu] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [roleMenuPosition, setRoleMenuPosition] = useState(null);
  const [sentInviteRoleSelections, setSentInviteRoleSelections] = useState({});
  const mapMenuRef = useRef(null);
  const roleMenuRef = useRef(null);
  const roleMenuPanelRef = useRef(null);
  const roleTriggerRef = useRef(null);

  const visibleRoleOptions = useMemo(() => {
    const allowed = new Set((Array.isArray(inviteRoleOptions) ? inviteRoleOptions : [])
      .map((role) => String(role || '').trim().toLowerCase())
      .filter(Boolean));
    const defaults = [
      { value: 'viewer', label: 'Viewer' },
      { value: 'commenter', label: 'Commenter' },
      { value: 'editor', label: 'Editor' },
    ];
    return defaults.filter((option) => allowed.has(option.value));
  }, [inviteRoleOptions]);
  const selectedRoleOption = visibleRoleOptions.find((option) => option.value === inviteRole)
    || visibleRoleOptions[0]
    || { value: 'viewer', label: 'Viewer' };
  const selectedMap = eligibleMaps.find((map) => String(map.id) === String(selectedMapId)) || null;
  const normalizedMapQuery = String(mapQuery || '').trim().toLowerCase();
  const filteredMaps = normalizedMapQuery
    ? eligibleMaps.filter((map) => String(map.name || '').toLowerCase().includes(normalizedMapQuery))
    : eligibleMaps;
  const hasInviteComposer = eligibleMaps.length > 0 && visibleRoleOptions.length > 0;
  const hasValidInviteEmail = EMAIL_PATTERN.test(String(inviteEmail || '').trim());
  const inviteDisabled = loading
    || !hasInviteComposer
    || !selectedMapId
    || !hasValidInviteEmail;

  useEffect(() => {
    const next = {};
    (sentInvites || []).forEach((invite) => {
      next[invite.id] = invite.role || 'viewer';
    });
    setSentInviteRoleSelections(next);
  }, [sentInvites]);

  useEffect(() => {
    if (!showMapMenu) return undefined;
    const handlePointerDown = (event) => {
      if (mapMenuRef.current?.contains(event.target)) return;
      setShowMapMenu(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [showMapMenu]);

  useEffect(() => {
    if (!showRoleMenu) return undefined;
    const handlePointerDown = (event) => {
      if (roleMenuRef.current?.contains(event.target)) return;
      if (roleMenuPanelRef.current?.contains(event.target)) return;
      setShowRoleMenu(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [showRoleMenu]);

  useEffect(() => {
    if (!showRoleMenu) return undefined;

    const updateRoleMenuPosition = () => {
      const rect = roleTriggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setRoleMenuPosition({
        top: `${rect.bottom + 8}px`,
        right: `${Math.max(16, window.innerWidth - rect.right)}px`,
        minWidth: '164px',
      });
    };

    updateRoleMenuPosition();
    window.addEventListener('resize', updateRoleMenuPosition);
    document.addEventListener('scroll', updateRoleMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateRoleMenuPosition);
      document.removeEventListener('scroll', updateRoleMenuPosition, true);
    };
  }, [showRoleMenu]);

  useEffect(() => {
    if (show) {
      setMapQuery(selectedMap?.name || '');
      return;
    }
    setMapQuery('');
    setShowMapMenu(false);
    setShowRoleMenu(false);
  }, [selectedMap?.name, show]);

  const handleSubmitInvite = (event) => {
    event.preventDefault();
    if (inviteDisabled) return;
    onSendInvite?.();
  };

  const roleMenuPanel = showRoleMenu ? (
    <MenuPanel
      ref={roleMenuPanelRef}
      className="share-collab-role-menu-panel share-collab-role-menu-panel--portal"
      role="menu"
      aria-label="Invite role"
      style={{
        ...(roleMenuPosition || {}),
        visibility: roleMenuPosition ? 'visible' : 'hidden',
      }}
    >
      {visibleRoleOptions.map((option) => (
        <MenuItem
          key={option.value}
          className="share-collab-role-menu-item"
          icon={renderRoleIcon(option.value)}
          label={option.label}
          selected={option.value === inviteRole}
          role="menuitemradio"
          aria-checked={option.value === inviteRole}
          onClick={() => {
            onInviteRoleChange?.(option.value);
            setShowRoleMenu(false);
          }}
        />
      ))}
    </MenuPanel>
  ) : null;

  return (
    <AccountDrawer
      isOpen={show}
      onClose={onClose}
      title="Invites"
      subtitle="Review collaboration invites linked to your account."
      className="invite-inbox-drawer"
    >
          {hasInviteComposer ? (
            <form
              className="invite-inbox-composer"
              onSubmit={handleSubmitInvite}
            >
              <div className="invite-inbox-map-combobox" ref={mapMenuRef}>
                <TextInput
                  label="Map"
                  type="text"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={showMapMenu}
                  aria-controls="invite-inbox-map-options"
                  placeholder="Choose a map..."
                  value={mapQuery}
                  onFocus={() => setShowMapMenu(true)}
                  onChange={(event) => {
                    setMapQuery(event.target.value);
                    setShowMapMenu(true);
                  }}
                  rightIcon={<ChevronDown size={16} aria-hidden="true" />}
                  disabled={loading}
                />
                {showMapMenu ? (
                  <MenuPanel
                    id="invite-inbox-map-options"
                    className="invite-inbox-map-options"
                    role="listbox"
                    aria-label="Invite map"
                  >
                    {filteredMaps.length === 0 ? (
                      <div className="share-collab-empty invite-inbox-map-empty">No matching maps.</div>
                    ) : (
                      filteredMaps.map((map) => (
                        <MenuItem
                          key={map.id}
                          role="option"
                          selected={String(map.id) === String(selectedMapId)}
                          aria-selected={String(map.id) === String(selectedMapId)}
                          icon={<Network size={14} aria-hidden="true" />}
                          label={map.name || 'Untitled Map'}
                          onClick={() => {
                            onSelectedMapIdChange?.(map.id);
                            setMapQuery(map.name || 'Untitled Map');
                            setShowMapMenu(false);
                          }}
                        />
                      ))
                    )}
                  </MenuPanel>
                ) : null}
              </div>
              <div className="share-collab-invite-row invite-inbox-invite-row">
                <TextInput
                  type="email"
                  shellClassName="share-email-input"
                  inputClassName="share-email-text-input"
                  placeholder="Invite by email..."
                  value={inviteEmail}
                  onChange={(event) => onInviteEmailChange?.(event.target.value)}
                  disabled={loading}
                  leftIcon={<Mail size={18} />}
                />
                <div className="share-collab-role-menu" ref={roleMenuRef}>
                  <button
                    ref={roleTriggerRef}
                    type="button"
                    className="share-collab-role-trigger"
                    aria-label={`Invite role: ${selectedRoleOption.label}`}
                    aria-haspopup="menu"
                    aria-expanded={showRoleMenu}
                    onClick={() => setShowRoleMenu((current) => !current)}
                    disabled={loading || visibleRoleOptions.length <= 1}
                  >
                    {renderRoleIcon(selectedRoleOption.value)}
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                </div>
                <Button
                  className="share-collab-send"
                  size="md"
                  type="submit"
                  startIcon={<Send size={14} />}
                  disabled={inviteDisabled}
                  loading={loading}
                >
                  Invite
                </Button>
              </div>
            </form>
          ) : null}
          {roleMenuPanel && typeof document !== 'undefined'
            ? createPortal(roleMenuPanel, document.body)
            : null}

          {error && (invites.length > 0 || sentInvites.length > 0) ? (
            <div className="share-collab-error">{error}</div>
          ) : null}

          <div className="invite-inbox-list">
            {sentInvites.map((invite) => (
              <div className="invite-inbox-item sent-invite-inbox-item" key={`sent-${invite.id}`}>
                <div className="invite-inbox-item-main">
                  <div className="invite-inbox-item-title">
                    <Network size={16} />
                    <span>{invite.mapName || selectedMap?.name || 'Shared map'}</span>
                  </div>
                  <div className="invite-inbox-item-meta">
                    {invite.inviteeEmail || 'Invitee'}
                  </div>
                </div>
                <div className="invite-inbox-item-actions invite-inbox-item-actions-stacked sent-invite-inbox-actions">
                  <SelectInput
                    className="share-collab-role-select"
                    value={sentInviteRoleSelections[invite.id] || invite.role || 'viewer'}
                    disabled={loading}
                    onChange={(event) => setSentInviteRoleSelections((prev) => ({
                      ...prev,
                      [invite.id]: event.target.value,
                    }))}
                  >
                    {visibleRoleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectInput>
                  <div className="invite-inbox-item-action-row">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onCancelSentInvite?.(invite)}
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => onResendSentInvite?.(
                        invite,
                        sentInviteRoleSelections[invite.id] || invite.role || 'viewer'
                      )}
                      disabled={loading}
                    >
                      Resend
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {invites.length === 0 && sentInvites.length === 0 ? (
              <div className="share-collab-empty">No pending invites right now.</div>
            ) : (
              invites.map((invite) => (
                <div className="invite-inbox-item" key={invite.id}>
                  <div className="invite-inbox-item-main">
                    <div className="invite-inbox-item-title">
                      <Network size={16} />
                      <span>{invite.mapName || 'Shared map'}</span>
                    </div>
                    <div className="invite-inbox-item-role">
                      {renderRoleIcon(invite.role)}
                      <span>{formatRoleLabel(invite.role)} access</span>
                    </div>
                    {invite.inviterName || invite.inviterEmail ? (
                      <div className="invite-inbox-item-meta">
                        Invited by: {invite.inviterName || invite.inviterEmail}
                      </div>
                    ) : null}
                  </div>
                  <div className="invite-inbox-item-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onDecline?.(invite)}
                      disabled={loading}
                    >
                      Decline
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => onAccept?.(invite)}
                      disabled={loading}
                    >
                      Accept
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
    </AccountDrawer>
  );
};

export default InviteInboxModal;

import React from 'react';
import { Check, Mail, RefreshCw } from 'lucide-react';

import Button from '../ui/Button';
import Modal from '../ui/Modal';

const formatRoleLabel = (role) => {
  const value = String(role || '').trim();
  if (!value) return 'Viewer';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const formatTimestamp = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString();
};

const InviteInboxModal = ({
  show,
  invites = [],
  loading = false,
  error = '',
  onClose,
  onRefresh,
  onAccept,
  onDecline,
}) => {
  if (!show) return null;

  return (
    <Modal
      show={show}
      onClose={onClose}
      title="Pending Invites"
      size="md"
      scrollable
      className="invite-inbox-modal"
    >
          <div className="invite-inbox-actions">
            <div className="invite-inbox-subtitle">
              Review collaboration invites linked to your account.
            </div>
            <Button
              type="button"
              className="share-email-btn"
              size="sm"
              onClick={onRefresh}
              loading={loading}
            >
              {!loading ? <RefreshCw size={14} /> : null}
              <span>Refresh</span>
            </Button>
          </div>

          {error ? (
            <div className="share-collab-error">{error}</div>
          ) : null}

          <div className="invite-inbox-list">
            {invites.length === 0 ? (
              <div className="share-collab-empty">No pending invites right now.</div>
            ) : (
              invites.map((invite) => (
                <div className="invite-inbox-item" key={invite.id}>
                  <div className="invite-inbox-item-main">
                    <div className="invite-inbox-item-title">
                      <Mail size={16} />
                      <span>{invite.mapName || 'Shared map'}</span>
                    </div>
                    <div className="invite-inbox-item-meta">
                      {formatRoleLabel(invite.role)} access
                      {invite.inviterName || invite.inviterEmail ? ` • invited by ${invite.inviterName || invite.inviterEmail}` : ''}
                    </div>
                    <div className="invite-inbox-item-meta">
                      {formatTimestamp(invite.createdAt) ? `Sent ${formatTimestamp(invite.createdAt)}` : 'Sent recently'}
                      {formatTimestamp(invite.expiresAt) ? ` • Expires ${formatTimestamp(invite.expiresAt)}` : ''}
                    </div>
                  </div>
                  <div className="invite-inbox-item-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => onDecline?.(invite)}
                      disabled={loading}
                    >
                      Decline
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => onAccept?.(invite)}
                      disabled={loading}
                    >
                      <Check size={16} />
                      <span>Accept</span>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
    </Modal>
  );
};

export default InviteInboxModal;

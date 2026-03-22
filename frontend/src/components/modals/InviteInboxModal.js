import React from 'react';
import { Check, Loader2, Mail, RefreshCw, X } from 'lucide-react';

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-md modal-scrollable invite-inbox-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Pending Invites</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body">
          <div className="invite-inbox-actions">
            <div className="invite-inbox-subtitle">
              Review collaboration invites linked to your account.
            </div>
            <button
              type="button"
              className="share-email-btn"
              onClick={onRefresh}
              disabled={loading}
            >
              {loading ? <Loader2 size={14} className="btn-spinner" /> : <RefreshCw size={14} />}
              <span>Refresh</span>
            </button>
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
                    <button
                      type="button"
                      className="modal-btn secondary"
                      onClick={() => onDecline?.(invite)}
                      disabled={loading}
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      className="modal-btn primary"
                      onClick={() => onAccept?.(invite)}
                      disabled={loading}
                    >
                      <Check size={16} />
                      <span>Accept</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InviteInboxModal;

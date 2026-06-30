import React from 'react';
import { Eye, MessageSquare, Network, RefreshCw } from 'lucide-react';

import AccountDrawer from '../drawers/AccountDrawer';
import Button from '../ui/Button';
import { EditIcon } from '../ui/icons';

const formatRoleLabel = (role) => {
  const value = String(role || '').trim();
  if (!value) return 'Viewer';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const renderRoleIcon = (role) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (normalizedRole === 'commenter') return <MessageSquare size={14} aria-hidden="true" />;
  if (normalizedRole === 'editor') return <EditIcon size={14} aria-hidden="true" />;
  return <Eye size={14} aria-hidden="true" />;
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
  return (
    <AccountDrawer
      isOpen={show}
      onClose={onClose}
      title="Invites"
      subtitle="Review collaboration invites linked to your account."
      className="invite-inbox-drawer"
      actions={(
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          loading={loading}
          startIcon={!loading ? <RefreshCw size={14} /> : null}
        >
          Refresh
        </Button>
      )}
    >
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

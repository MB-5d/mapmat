import React, { useEffect, useState } from 'react';
import { Check, RefreshCw, ShieldCheck } from 'lucide-react';

import AccountDrawer from '../drawers/AccountDrawer';
import Button from '../ui/Button';
import SelectInput from '../ui/SelectInput';

const ROLE_OPTIONS = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'commenter', label: 'Commenter' },
  { value: 'editor', label: 'Editor' },
];

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

const AccessRequestInboxModal = ({
  show,
  requests = [],
  loading = false,
  error = '',
  onClose,
  onRefresh,
  onApprove,
  onDeny,
}) => {
  const [roleSelections, setRoleSelections] = useState({});

  useEffect(() => {
    const next = {};
    (requests || []).forEach((request) => {
      next[request.id] = request.requestedRole || 'viewer';
    });
    setRoleSelections(next);
  }, [requests]);

  return (
    <AccountDrawer
      isOpen={show}
      onClose={onClose}
      title="Requests"
      subtitle="Review pending map access requests that require an owner decision."
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
            {requests.length === 0 ? (
              <div className="share-collab-empty">No pending access requests right now.</div>
            ) : (
              requests.map((request) => (
                <div className="invite-inbox-item" key={request.id}>
                  <div className="invite-inbox-item-main">
                    <div className="invite-inbox-item-title">
                      <ShieldCheck size={16} />
                      <span>{request.mapName || 'Shared map'}</span>
                    </div>
                    <div className="invite-inbox-item-meta">
                      {request.requesterName || request.requesterEmail || 'User'} requested {formatRoleLabel(request.requestedRole)} access
                    </div>
                    {request.message ? (
                      <div className="invite-inbox-item-meta invite-inbox-item-message">
                        {request.message}
                      </div>
                    ) : null}
                    <div className="invite-inbox-item-meta">
                      {formatTimestamp(request.createdAt) ? `Sent ${formatTimestamp(request.createdAt)}` : 'Sent recently'}
                    </div>
                  </div>
                  <div className="invite-inbox-item-actions invite-inbox-item-actions-stacked">
                    <SelectInput
                      className="share-collab-role-select"
                      value={roleSelections[request.id] || request.requestedRole || 'viewer'}
                      disabled={loading}
                      onChange={(event) => setRoleSelections((prev) => ({
                        ...prev,
                        [request.id]: event.target.value,
                      }))}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </SelectInput>
                    <div className="invite-inbox-item-action-row">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => onDeny?.(request)}
                        disabled={loading}
                      >
                        Deny
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => onApprove?.(request, roleSelections[request.id] || request.requestedRole || 'viewer')}
                        disabled={loading}
                      >
                        <Check size={16} />
                        <span>Approve</span>
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
    </AccountDrawer>
  );
};

export default AccessRequestInboxModal;

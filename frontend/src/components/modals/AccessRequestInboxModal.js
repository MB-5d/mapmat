import React, { useEffect, useState } from 'react';
import { Check, Clock, ShieldCheck } from 'lucide-react';

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

const formatRequestStatus = (request) => {
  const status = String(request?.status || '').trim().toLowerCase();
  if (status === 'approved') {
    return `Approved${request?.decisionRole ? ` as ${formatRoleLabel(request.decisionRole)}` : ''}`;
  }
  if (status === 'denied') return 'Denied';
  return 'Pending review';
};

const AccessRequestInboxModal = ({
  show,
  requests = [],
  loading = false,
  error = '',
  onClose,
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
      subtitle="Review map access requests linked to your account."
      className="invite-inbox-drawer"
    >
          {error && requests.length > 0 ? (
            <div className="share-collab-error">{error}</div>
          ) : null}

          <div className="invite-inbox-list">
            {requests.length === 0 ? (
              <div className="share-collab-empty">No pending access requests right now.</div>
            ) : (
              requests.map((request) => (
                <div className="invite-inbox-item access-request-inbox-item" key={request.id}>
                  <div className="invite-inbox-item-main access-request-inbox-main">
                    <div className="invite-inbox-item-title access-request-inbox-title">
                      <ShieldCheck size={16} />
                      <span>{request.requesterName || request.requesterEmail || 'User'} wants access</span>
                    </div>
                    <div className="invite-inbox-item-meta">
                      {request.mapName || 'Shared map'} · {formatRoleLabel(request.requestedRole)} access requested
                    </div>
                    {request.message ? (
                      <div className="invite-inbox-item-meta invite-inbox-item-message">
                        {request.message}
                      </div>
                    ) : null}
                  </div>
                  {request.canReview && request.status === 'pending' ? (
                    <div className="invite-inbox-item-actions invite-inbox-item-actions-stacked access-request-inbox-actions">
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
                  ) : (
                    <div className="invite-inbox-item-status">
                      <Clock size={14} />
                      <span>{formatRequestStatus(request)}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
    </AccountDrawer>
  );
};

export default AccessRequestInboxModal;

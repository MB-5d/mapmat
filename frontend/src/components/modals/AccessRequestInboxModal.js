import React, { useEffect, useState } from 'react';
import { Check, CheckCircle2, Clock, ShieldCheck, ShieldClose } from 'lucide-react';

import AccountDrawer from '../drawers/AccountDrawer';
import Button from '../ui/Button';
import SelectInput from '../ui/SelectInput';

const ROLE_OPTIONS = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'commenter', label: 'Commenter' },
  { value: 'editor', label: 'Editor' },
];
const EMPTY_REQUESTS = [];

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

const getRequesterLabel = (request) => (
  request?.requesterName || request?.requesterEmail || 'User'
);

const getRequestStatusClass = (request) => {
  const status = String(request?.status || '').trim().toLowerCase();
  if (status === 'approved') return 'invite-inbox-item-status--approved';
  if (status === 'denied') return 'invite-inbox-item-status--denied';
  return 'invite-inbox-item-status--pending';
};

const renderRequestStatusIcon = (request) => {
  const status = String(request?.status || '').trim().toLowerCase();
  if (status === 'approved') return <CheckCircle2 size={14} />;
  if (status === 'denied') return <ShieldClose size={14} />;
  return <Clock size={14} />;
};

const AccessRequestInboxModal = ({
  show,
  requests = EMPTY_REQUESTS,
  loading = false,
  error = '',
  onClose,
  onApprove,
  onDeny,
  onUndo,
  onOpenMap,
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
              requests.map((request) => {
                const canOpenApprovedMap = String(request.status || '').toLowerCase() === 'approved'
                  && !request.canReview
                  && request.mapId
                  && onOpenMap;
                const ItemTag = canOpenApprovedMap ? 'button' : 'div';
                return (
                  <ItemTag
                    className={`invite-inbox-item access-request-inbox-item ${canOpenApprovedMap ? 'access-request-inbox-item--clickable' : ''}`}
                    key={request.id}
                    type={canOpenApprovedMap ? 'button' : undefined}
                    onClick={canOpenApprovedMap ? () => onOpenMap?.(request) : undefined}
                  >
                    <div className="invite-inbox-item-main access-request-inbox-main">
                      <div className="invite-inbox-item-title access-request-inbox-title">
                        <ShieldCheck size={16} />
                        <span>{request.mapName || 'Shared map'}</span>
                      </div>
                      <div className={`invite-inbox-item-meta ${request.canReview ? 'access-request-inbox-reviewer' : ''}`}>
                        {request.canReview
                          ? `${getRequesterLabel(request)} · ${formatRoleLabel(request.requestedRole)} access requested`
                          : `${formatRoleLabel(request.requestedRole)} access requested`}
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
                      <div className="access-request-inbox-status-row">
                        <div className={`invite-inbox-item-status ${getRequestStatusClass(request)}`}>
                          {renderRequestStatusIcon(request)}
                          <span>{formatRequestStatus(request)}</span>
                        </div>
                        {request.canReview && String(request.status || '').toLowerCase() === 'approved' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            buttonStyle="danger"
                            size="sm"
                            className="access-request-inbox-undo"
                            onClick={() => onUndo?.(request)}
                            disabled={loading}
                          >
                            <ShieldClose size={14} />
                            <span>Undo</span>
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </ItemTag>
                );
              })
            )}
          </div>
    </AccountDrawer>
  );
};

export default AccessRequestInboxModal;

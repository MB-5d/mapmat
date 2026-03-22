import React, { useEffect, useState } from 'react';
import { Check, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';

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

  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-md modal-scrollable invite-inbox-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Access Requests</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body">
          <div className="invite-inbox-actions">
            <div className="invite-inbox-subtitle">
              Review pending map access requests that require an owner decision.
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
                    <select
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
                    </select>
                    <div className="invite-inbox-item-action-row">
                      <button
                        type="button"
                        className="modal-btn secondary"
                        onClick={() => onDeny?.(request)}
                        disabled={loading}
                      >
                        Deny
                      </button>
                      <button
                        type="button"
                        className="modal-btn primary"
                        onClick={() => onApprove?.(request, roleSelections[request.id] || request.requestedRole || 'viewer')}
                        disabled={loading}
                      >
                        <Check size={16} />
                        <span>Approve</span>
                      </button>
                    </div>
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

export default AccessRequestInboxModal;

import React from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  LogIn,
  Mail,
  Send,
} from 'lucide-react';

import Button from '../ui/Button';
import TextareaInput from '../ui/TextareaInput';

const formatRoleLabel = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  if (!normalized) return 'Viewer';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

export default function MapAccessGate({
  isLoggedIn,
  authLoading = false,
  invite = null,
  requestStatus = 'idle',
  requestError = '',
  requestMessage = '',
  loading = false,
  onLogin,
  onGoHome,
  onRequestMessageChange,
  onRequestAccess,
  onAcceptInvite,
  onDeclineInvite,
}) {
  const hasPendingInvite = !!invite?.id;
  const requestPending = requestStatus === 'submitting';
  const requestSubmitted = requestStatus === 'submitted';
  const requestDisabled = requestStatus === 'disabled';

  let title = 'You do not currently have access to this map';
  let description = 'If the map owners allow it, you can request access from here.';
  let badge = 'Access blocked';

  if (!isLoggedIn) {
    title = 'Sign in to continue';
    description = 'This map is inside the app. Sign in first to open it, accept an invite, or request access.';
    badge = 'Authentication required';
  } else if (hasPendingInvite) {
    title = invite.mapName
      ? `You have an invite to "${invite.mapName}"`
      : 'You have a pending invite to this map';
    description = `Accept to join as ${formatRoleLabel(invite.role)} or decline to keep your current access unchanged.`;
    badge = 'Invite available';
  } else if (requestSubmitted) {
    title = 'Access request sent';
    description = 'The map owners have been notified. You can leave this page and come back once they review it.';
    badge = 'Waiting for review';
  } else if (requestDisabled) {
    description = 'The owners are not accepting access requests for this map right now. Ask an owner to invite this account directly.';
  } else if (loading) {
    title = 'Opening map…';
    description = 'Checking your access and loading the latest map state.';
    badge = 'Loading';
  }

  return (
    <div className="route-gate">
      <div className="route-gate-card">
        <div className="route-gate-badge">
          <Lock size={14} />
          <span>{badge}</span>
        </div>

        <h2>{title}</h2>
        <p>{description}</p>

        {hasPendingInvite ? (
          <div className="route-gate-summary">
            <div className="route-gate-summary-row">
              <span>Invited as</span>
              <strong>{formatRoleLabel(invite.role)}</strong>
            </div>
            <div className="route-gate-summary-row">
              <span>Invited by</span>
              <strong>{invite.inviterName || invite.inviterEmail || 'Map owner'}</strong>
            </div>
          </div>
        ) : null}

        {isLoggedIn && !hasPendingInvite && !requestSubmitted ? (
          <div className="route-gate-request">
            <label className="route-gate-label" htmlFor="access-request-message">
              Message to owners (optional)
            </label>
            <TextareaInput
              id="access-request-message"
              className="route-gate-textarea"
              rows={4}
              value={requestMessage}
              onChange={(event) => onRequestMessageChange?.(event.target.value)}
              placeholder="Briefly explain why you need access."
              disabled={requestPending || requestDisabled}
            />
            {requestError ? (
              <div className="route-gate-inline-error">{requestError}</div>
            ) : null}
          </div>
        ) : null}

        {requestSubmitted ? (
          <div className="route-gate-success">
            <CheckCircle2 size={16} />
            <span>Your request is pending owner review.</span>
          </div>
        ) : null}

        <div className="route-gate-actions">
          <Button type="button" variant="secondary" onClick={onGoHome}>
            <ArrowLeft size={16} />
            <span>Back to App</span>
          </Button>

          {!isLoggedIn ? (
            <Button
              type="button"
              variant="primary"
              onClick={onLogin}
              loading={authLoading}
            >
              {!authLoading ? <LogIn size={16} /> : null}
              <span>Sign In</span>
            </Button>
          ) : hasPendingInvite ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onDeclineInvite?.(invite)}
                disabled={loading}
              >
                Decline
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => onAcceptInvite?.(invite)}
                loading={loading}
              >
                {!loading ? <Mail size={16} /> : null}
                <span>Accept Invite</span>
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={onRequestAccess}
              disabled={requestSubmitted || requestDisabled}
              loading={requestPending}
            >
              {!requestPending ? <Send size={16} /> : null}
              <span>{requestSubmitted ? 'Request Sent' : 'Request Viewer Access'}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

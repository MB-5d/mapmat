import React from 'react';
import { AlertTriangle, ArrowLeft, Loader2, LogIn, MailCheck } from 'lucide-react';

export default function InviteAcceptGate({
  status = 'idle',
  error = '',
  onLogin,
  onGoHome,
  onShowInvites,
}) {
  let title = 'Preparing your invite…';
  let description = 'Checking the invite and your current session.';
  let toneClass = 'route-gate-card';

  if (status === 'auth_required') {
    title = 'Sign in to accept this invite';
    description = 'This invite is tied to a specific Map Mat account email. Sign in with that account to continue.';
  } else if (status === 'processing') {
    title = 'Accepting invite…';
    description = 'We are verifying the invite and opening the map for your account.';
  } else if (status === 'error') {
    title = 'This invite could not be accepted';
    description = error || 'The invite may be expired, already used, or tied to a different account.';
    toneClass = 'route-gate-card route-gate-card-warning';
  }

  return (
    <div className="route-gate">
      <div className={toneClass}>
        <div className="route-gate-badge">
          {status === 'error' ? <AlertTriangle size={14} /> : <MailCheck size={14} />}
          <span>Invite link</span>
        </div>

        <h2>{title}</h2>
        <p>{description}</p>

        <div className="route-gate-actions">
          <button type="button" className="modal-btn secondary" onClick={onGoHome}>
            <ArrowLeft size={16} />
            <span>Back to App</span>
          </button>

          {status === 'auth_required' ? (
            <button type="button" className="modal-btn primary" onClick={onLogin}>
              <LogIn size={16} />
              <span>Sign In</span>
            </button>
          ) : status === 'processing' ? (
            <button type="button" className="modal-btn primary" disabled>
              <Loader2 size={16} className="btn-spinner" />
              <span>Accepting…</span>
            </button>
          ) : (
            <button type="button" className="modal-btn primary" onClick={onShowInvites}>
              <MailCheck size={16} />
              <span>Open Invite Inbox</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

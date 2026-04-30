import React, { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import * as api from '../../api';
import Button from '../ui/Button';
import Field, { FieldHint } from '../ui/Field';
import Modal from '../ui/Modal';
import SegmentedControl from '../ui/SegmentedControl';
import TextInput from '../ui/TextInput';
import { GOOGLE_AUTH_ENABLED, SHOW_DEMO_AUTH } from '../../utils/constants';
import { trackEvent } from '../../utils/analytics';

const AUTH_VIEWS = Object.freeze({
  LOGIN: 'login',
  SIGNUP: 'signup',
  VERIFY: 'verify',
  FORGOT: 'forgot',
  RESET: 'reset',
});

const GoogleGIcon = ({ className = '' }) => (
  <svg
    className={`auth-google-icon ${className}`.trim()}
    viewBox="0 0 18 18"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.12-.84 2.07-1.8 2.71v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.61z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.19l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.59-5.05-3.72H.94v2.33C2.42 15.95 5.46 18 9 18z" />
    <path fill="#FBBC05" d="M3.95 10.69A5.41 5.41 0 0 1 3.67 9c0-.59.1-1.16.28-1.69V4.98H.94A9.01 9.01 0 0 0 0 9c0 1.45.34 2.82.94 4.02l3.01-2.33z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.42 0 9 0 5.46 0 2.42 2.05.94 4.98l3.01 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
  </svg>
);

const AuthModal = ({
  onClose,
  onSuccess,
  onDemo,
  showToast,
  contextMessage = '',
}) => {
  const [view, setView] = useState(AUTH_VIEWS.LOGIN);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleAuthAvailable, setGoogleAuthAvailable] = useState(() => (
    GOOGLE_AUTH_ENABLED ? null : false
  ));
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [codeLength, setCodeLength] = useState(6);
  const [expiresInMinutes, setExpiresInMinutes] = useState(10);

  const authTabs = useMemo(() => ([
    { value: AUTH_VIEWS.LOGIN, label: 'Log In' },
    { value: AUTH_VIEWS.SIGNUP, label: 'Sign Up' },
  ]), []);

  useEffect(() => {
    let isCancelled = false;

    if (!GOOGLE_AUTH_ENABLED) {
      setGoogleAuthAvailable(false);
      return undefined;
    }

    api.getAuthConfig()
      .then((result) => {
        if (!isCancelled) {
          setGoogleAuthAvailable(Boolean(result?.googleAuthEnabled));
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setGoogleAuthAvailable(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const setAuthView = (nextView) => {
    setView(nextView);
    setError('');
    setStatus('');
    setPassword('');
    setCode('');
    setShowPassword(false);
  };

  const handleDemoLogin = () => {
    const demoUser = {
      id: 'demo',
      name: 'Demo User',
      email: 'demo@vellic.dev',
      authMode: 'demo',
      authProvider: 'demo',
      emailVerified: true,
      hasPassword: false,
    };
    onDemo?.(demoUser);
    onClose?.();
    showToast?.('Demo access enabled', 'success');
  };

  const handleGoogleLogin = () => {
    if (!GOOGLE_AUTH_ENABLED || googleAuthAvailable !== true || googleLoading) {
      return;
    }
    setGoogleLoading(true);
    const nextPath = `${window.location.pathname}${window.location.search}`;
    window.location.assign(api.getGoogleAuthStartUrl(nextPath));
  };

  const handleLoginSubmit = async () => {
    const result = await api.login(email, password);
    onSuccess?.(result.user);
    onClose?.();
    showToast?.(`Welcome, ${result.user.name}!`, 'success');
  };

  const handleSignupSubmit = async () => {
    const result = await api.signup(email, password, name);
    trackEvent('signup', { method: 'password' });
    setCode('');
    setCodeLength(result?.codeLength || 6);
    setExpiresInMinutes(result?.expiresInMinutes || 10);
    setStatus(`We sent a ${result?.codeLength || 6}-digit code to ${email}.`);
    setPassword('');
    setView(AUTH_VIEWS.VERIFY);
  };

  const handleVerifySubmit = async () => {
    const result = await api.verifyEmail(email, code);
    onSuccess?.(result.user);
    onClose?.();
    showToast?.(`Welcome, ${result.user.name}!`, 'success');
  };

  const handleForgotSubmit = async () => {
    const result = await api.forgotPassword(email);
    setCode('');
    setPassword('');
    setCodeLength(result?.codeLength || 6);
    setExpiresInMinutes(result?.expiresInMinutes || 15);
    setStatus('If that account exists, we sent a reset code. Enter it below with a new password.');
    setView(AUTH_VIEWS.RESET);
  };

  const handleResetCodeResend = async () => {
    if (!email.trim()) {
      setError('Enter your email first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await handleForgotSubmit();
      showToast?.('Reset code sent', 'success');
    } catch (err) {
      setError(err.message || 'Failed to send a new reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async () => {
    const result = await api.resetPassword(email, code, password);
    onSuccess?.(result.user);
    onClose?.();
    showToast?.('Password updated', 'success');
  };

  const handleResendVerification = async () => {
    if (!email.trim()) {
      setError('Enter your email first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.resendVerification(email);
      setCode('');
      setCodeLength(result?.codeLength || codeLength);
      setExpiresInMinutes(result?.expiresInMinutes || expiresInMinutes);
      setStatus(`A new code was sent to ${email}.`);
      showToast?.('Verification code sent', 'success');
    } catch (err) {
      setError(err.message || 'Failed to resend verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('');
    setLoading(true);

    try {
      if (view === AUTH_VIEWS.LOGIN) {
        await handleLoginSubmit();
        return;
      }
      if (view === AUTH_VIEWS.SIGNUP) {
        await handleSignupSubmit();
        return;
      }
      if (view === AUTH_VIEWS.VERIFY) {
        await handleVerifySubmit();
        return;
      }
      if (view === AUTH_VIEWS.FORGOT) {
        await handleForgotSubmit();
        return;
      }
      if (view === AUTH_VIEWS.RESET) {
        await handleResetSubmit();
      }
    } catch (err) {
      if (view === AUTH_VIEWS.LOGIN && err?.code === 'EMAIL_NOT_VERIFIED') {
        setView(AUTH_VIEWS.VERIFY);
        setEmail(err?.payload?.email || email);
        setCode('');
        setStatus('This account still needs email verification. Enter the code from your inbox or resend it.');
      } else {
        setError(err.message || 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  const submitLabel = (() => {
    if (view === AUTH_VIEWS.LOGIN) return 'Log In';
    if (view === AUTH_VIEWS.SIGNUP) return 'Create Account';
    if (view === AUTH_VIEWS.VERIFY) return 'Verify Email';
    if (view === AUTH_VIEWS.FORGOT) return 'Send Reset Code';
    return 'Reset Password';
  })();

  const showAuthTabs = view === AUTH_VIEWS.LOGIN || view === AUTH_VIEWS.SIGNUP;
  const passwordLabel = view === AUTH_VIEWS.RESET ? 'New Password' : 'Password';
  const passwordPlaceholder = view === AUTH_VIEWS.SIGNUP || view === AUTH_VIEWS.RESET
    ? 'Min 6 characters'
    : 'Your password';
  const passwordAutoComplete = view === AUTH_VIEWS.LOGIN ? 'current-password' : 'new-password';

  return (
    <Modal
      show
      onClose={onClose}
      title="Account"
      size="md"
      scrollable
      className="auth-modal"
    >
      {contextMessage ? (
        <div className="auth-context-message">{contextMessage}</div>
      ) : null}

      {showAuthTabs ? (
        <SegmentedControl
          className="auth-tabs"
          variant="tabs"
          fullWidth
          ariaLabel="Account mode"
          value={view}
          onChange={(nextView) => {
            setAuthView(nextView);
            if (nextView === AUTH_VIEWS.LOGIN) {
              setName('');
            }
          }}
          options={authTabs}
          optionRole="tab"
        />
      ) : (
        <div className="auth-view-banner">
          {view === AUTH_VIEWS.VERIFY ? 'Verify your email' : null}
          {view === AUTH_VIEWS.FORGOT ? 'Forgot password' : null}
          {view === AUTH_VIEWS.RESET ? 'Reset password' : null}
        </div>
      )}

      <form onSubmit={handleSubmit} className="auth-form">
        {error ? <div className="auth-error">{error}</div> : null}
        {status ? <div className="auth-success">{status}</div> : null}

        {view === AUTH_VIEWS.SIGNUP ? (
          <Field label="Username">
            <TextInput
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your username"
              autoComplete="username"
              disabled={loading}
            />
          </Field>
        ) : null}

        <Field label="Email">
          <TextInput
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            disabled={loading || googleLoading}
          />
        </Field>

        {view === AUTH_VIEWS.VERIFY || view === AUTH_VIEWS.RESET ? (
          <Field label="Verification Code">
            <TextInput
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D+/g, '').slice(0, codeLength))}
              placeholder={`${codeLength}-digit code`}
              required
              disabled={loading}
            />
            <FieldHint>This code expires in about {expiresInMinutes} minutes.</FieldHint>
          </Field>
        ) : null}

        {view !== AUTH_VIEWS.FORGOT && view !== AUTH_VIEWS.VERIFY ? (
          <Field label={passwordLabel}>
            <div className="password-input">
              <TextInput
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={passwordPlaceholder}
                required
                minLength={view === AUTH_VIEWS.LOGIN ? undefined : 6}
                autoComplete={passwordAutoComplete}
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                disabled={loading}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          className="auth-submit"
          loading={loading}
          disabled={googleLoading}
        >
          {submitLabel}
        </Button>

        {view === AUTH_VIEWS.VERIFY ? (
          <div className="auth-inline-actions">
            <button type="button" onClick={handleResendVerification} disabled={loading}>
              Resend code
            </button>
            <button type="button" onClick={() => setAuthView(AUTH_VIEWS.LOGIN)} disabled={loading}>
              Back to login
            </button>
          </div>
        ) : null}

        {view === AUTH_VIEWS.LOGIN ? (
          <div className="auth-inline-actions auth-inline-actions--single">
            <button type="button" onClick={() => setAuthView(AUTH_VIEWS.FORGOT)} disabled={loading}>
              Forgot password?
            </button>
          </div>
        ) : null}

        {view === AUTH_VIEWS.FORGOT || view === AUTH_VIEWS.RESET ? (
          <div className="auth-inline-actions">
            {view === AUTH_VIEWS.RESET ? (
              <button type="button" onClick={handleResetCodeResend} disabled={loading}>
                Send a new code
              </button>
            ) : null}
            <button type="button" onClick={() => setAuthView(AUTH_VIEWS.LOGIN)} disabled={loading}>
              Back to login
            </button>
          </div>
        ) : null}
      </form>

      {showAuthTabs && GOOGLE_AUTH_ENABLED && googleAuthAvailable === true ? (
        <div className="auth-provider-section">
          <div className="auth-provider-divider"><span>or</span></div>
          <Button
            type="button"
            variant="secondary"
            className="auth-google-btn"
            onClick={handleGoogleLogin}
            disabled={loading}
            loading={googleLoading}
            startIcon={!googleLoading ? <GoogleGIcon /> : null}
          >
            Continue with Google
          </Button>
        </div>
      ) : null}

      {SHOW_DEMO_AUTH ? (
        <div className="auth-demo">
          <div className="auth-demo-label">Quick access</div>
          <Button
            type="button"
            variant="secondary"
            className="auth-demo-btn"
            onClick={handleDemoLogin}
            disabled={loading || googleLoading}
          >
            Continue as demo
          </Button>
          <div className="auth-demo-hint">Bypasses login during build/test.</div>
        </div>
      ) : null}

      <div className="auth-footer">
        {view === AUTH_VIEWS.LOGIN ? (
          <span>Don't have an account? <button type="button" onClick={() => setAuthView(AUTH_VIEWS.SIGNUP)}>Sign up</button></span>
        ) : null}
        {view === AUTH_VIEWS.SIGNUP ? (
          <span>Already have an account? <button type="button" onClick={() => setAuthView(AUTH_VIEWS.LOGIN)}>Log in</button></span>
        ) : null}
        {view === AUTH_VIEWS.FORGOT || view === AUTH_VIEWS.RESET || view === AUTH_VIEWS.VERIFY ? (
          <span>Need a different account? <button type="button" onClick={() => setAuthView(AUTH_VIEWS.LOGIN)}>Log in</button></span>
        ) : null}
      </div>
    </Modal>
  );
};

export default AuthModal;

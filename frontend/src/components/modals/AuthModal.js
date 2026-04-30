import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let googleIdentityScriptPromise = null;

const loadGoogleIdentityScript = () => {
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google.accounts.id);
  }

  if (!googleIdentityScriptPromise) {
    googleIdentityScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`);

      const handleLoad = () => {
        if (window.google?.accounts?.id) {
          resolve(window.google.accounts.id);
        } else {
          reject(new Error('Google sign-in script did not load correctly'));
        }
      };

      if (existingScript) {
        existingScript.addEventListener('load', handleLoad, { once: true });
        existingScript.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = handleLoad;
      script.onerror = () => reject(new Error('Google sign-in script failed to load'));
      document.head.appendChild(script);
    });
  }

  return googleIdentityScriptPromise;
};

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
  const [googleClientId, setGoogleClientId] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [codeLength, setCodeLength] = useState(6);
  const [expiresInMinutes, setExpiresInMinutes] = useState(10);
  const googleButtonRef = useRef(null);

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
          setGoogleClientId(result?.googleClientId || '');
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setGoogleAuthAvailable(false);
          setGoogleClientId('');
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

  const handleGoogleCredential = useCallback(async (response = {}) => {
    if (!response?.credential || googleLoading) {
      setError('Google sign-in did not complete. Try again or use email instead.');
      return;
    }

    setGoogleLoading(true);
    setError('');

    try {
      const result = await api.loginWithGoogleCredential(response.credential);
      if (!result?.user) {
        setError('Google sign-in completed, but your session was not found. Try again.');
        return;
      }
      onSuccess?.(result.user);
      onClose?.();
      showToast?.('Signed in with Google', 'success');
      trackEvent('login', { method: 'google' });
    } catch {
      setError('Google sign-in did not complete. Try again or use email instead.');
    } finally {
      setGoogleLoading(false);
    }
  }, [googleLoading, onClose, onSuccess, showToast]);

  useEffect(() => {
    let isCancelled = false;
    const container = googleButtonRef.current;

    if (!GOOGLE_AUTH_ENABLED || googleAuthAvailable !== true || !googleClientId || !container) {
      return undefined;
    }

    container.innerHTML = '';

    loadGoogleIdentityScript()
      .then((googleAccountsId) => {
        if (isCancelled) return;

        googleAccountsId.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredential,
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        googleAccountsId.renderButton(container, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          logo_alignment: 'left',
          width: 304,
        });
      })
      .catch(() => {
        if (!isCancelled) {
          setGoogleAuthAvailable(false);
          setError('Google sign-in is unavailable right now. Use email and password instead.');
        }
      });

    return () => {
      isCancelled = true;
      container.innerHTML = '';
    };
  }, [googleAuthAvailable, googleClientId, handleGoogleCredential]);

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
  const requiresNewPassword = view === AUTH_VIEWS.SIGNUP || view === AUTH_VIEWS.RESET;
  const passwordLabel = view === AUTH_VIEWS.RESET ? 'New Password' : 'Password';
  const passwordPlaceholder = view === AUTH_VIEWS.RESET ? 'New password' : 'Your password';
  const passwordAutoComplete = view === AUTH_VIEWS.LOGIN ? 'current-password' : 'new-password';
  const passwordHelperText = requiresNewPassword ? 'Must be at least 8 characters' : '';

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
            <TextInput
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={passwordPlaceholder}
              required
              minLength={requiresNewPassword ? 8 : undefined}
              autoComplete={passwordAutoComplete}
              disabled={loading}
              rightElement={(
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={loading}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              )}
            />
            {passwordHelperText ? <FieldHint>{passwordHelperText}</FieldHint> : null}
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
          <div
            ref={googleButtonRef}
            className="auth-google-btn-host"
            aria-hidden={loading || googleLoading ? 'true' : undefined}
          />
          {googleLoading ? (
            <div className="auth-google-loading" role="status">Signing in with Google...</div>
          ) : null}
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

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import * as api from '../../api';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Modal from '../ui/Modal';
import TextInput from '../ui/TextInput';
import { SHOW_DEMO_AUTH } from '../../utils/constants';
import { trackEvent } from '../../utils/analytics';

const AuthModal = ({
  onClose,
  onSuccess,
  onDemo,
  showToast,
  contextMessage = '',
}) => {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDemoLogin = () => {
    const demoUser = {
      id: 'demo',
      name: 'Demo User',
      email: 'demo@mapmat.dev',
      authMode: 'demo',
    };
    onDemo?.(demoUser);
    onClose?.();
    showToast?.('Demo access enabled', 'success');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let result;
      if (mode === 'login') {
        result = await api.login(email, password);
      } else {
        result = await api.signup(email, password, name);
        trackEvent('signup', { method: 'password' });
      }
      onSuccess(result.user);
      onClose();
      showToast(`Welcome, ${result.user.name}!`, 'success');
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

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

      <div className="auth-tabs">
        <button
          type="button"
          className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
          onClick={() => { setMode('login'); setError(''); }}
        >
          Log In
        </button>
        <button
          type="button"
          className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
          onClick={() => { setMode('signup'); setError(''); }}
        >
          Sign Up
        </button>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        {error && <div className="auth-error">{error}</div>}

        {mode === 'signup' && (
          <Field label="Name">
            <TextInput
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </Field>
        )}

        <Field label="Email">
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </Field>

        <Field label="Password">
          <div className="password-input">
            <TextInput
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'Min 6 characters' : 'Your password'}
              required
              minLength={mode === 'signup' ? 6 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>

        <Button
          type="submit"
          variant="primary"
          className="auth-submit"
          loading={loading}
        >
          {mode === 'login' ? 'Log In' : 'Create Account'}
        </Button>
      </form>

      {SHOW_DEMO_AUTH ? (
        <div className="auth-demo">
          <div className="auth-demo-label">Quick access</div>
          <Button
            type="button"
            variant="secondary"
            className="auth-demo-btn"
            onClick={handleDemoLogin}
            disabled={loading}
          >
            Continue as demo
          </Button>
          <div className="auth-demo-hint">Bypasses login during build/test.</div>
        </div>
      ) : null}

      <div className="auth-footer">
        {mode === 'login' ? (
          <span>Don't have an account? <button type="button" onClick={() => setMode('signup')}>Sign up</button></span>
        ) : (
          <span>Already have an account? <button type="button" onClick={() => setMode('login')}>Log in</button></span>
        )}
      </div>
    </Modal>
  );
};

export default AuthModal;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

import * as api from '../../api';
import AuthModal from './AuthModal';

const appCss = fs.readFileSync(path.join(__dirname, '../../App.css'), 'utf8');
const getCssRule = (selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return appCss.match(new RegExp(`${escapedSelector} \\{[^}]+\\}`))?.[0] || '';
};

jest.mock('../../api', () => ({
  login: jest.fn(),
  signup: jest.fn(),
  verifyEmail: jest.fn(),
  resendVerification: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
  getAuthConfig: jest.fn(() => Promise.resolve({ googleAuthEnabled: false })),
  getMe: jest.fn(),
  loginWithGoogleCredential: jest.fn(),
  getGoogleAuthStartUrl: jest.fn(() => 'http://localhost:4002/auth/google/start'),
}));

jest.mock('../../utils/constants', () => ({
  API_BASE: 'http://localhost:4002',
  GOOGLE_AUTH_ENABLED: true,
}));

jest.mock('../../utils/analytics', () => ({
  trackEvent: jest.fn(),
}));

describe('AuthModal', () => {
  let container;
  let root;
  let googleInitialize;
  let googleRenderButton;

  const setInputValue = (element, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    descriptor.set.call(element, value);
  };

  const clickButton = async (label) => {
    const button = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent.trim() === label
    );
    expect(button).toBeTruthy();
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    api.getAuthConfig.mockResolvedValue({ googleAuthEnabled: false });
    googleInitialize = jest.fn();
    googleRenderButton = jest.fn((buttonContainer) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Sign in with Google';
      buttonContainer.appendChild(button);
    });
    window.google = {
      accounts: {
        id: {
          initialize: googleInitialize,
          renderButton: googleRenderButton,
        },
      },
    };
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
    delete window.google;
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  test('logs in and calls success handlers', async () => {
    api.login.mockResolvedValue({
      user: { id: 'u1', name: 'Alex', email: 'alex@example.com', authProvider: 'password' },
    });

    const onSuccess = jest.fn();
    const onClose = jest.fn();
    const showToast = jest.fn();

    await act(async () => {
      root.render(
        <AuthModal
          onClose={onClose}
          onSuccess={onSuccess}
          onDemo={jest.fn()}
          showToast={showToast}
        />
      );
    });

    const inputs = container.querySelectorAll('input');
    const form = container.querySelector('form');

    await act(async () => {
      setInputValue(inputs[0], 'alex@example.com');
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      setInputValue(inputs[1], 'secret123');
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(api.login).toHaveBeenCalledWith('alex@example.com', 'secret123');
    expect(onSuccess).toHaveBeenCalledWith({
      id: 'u1',
      name: 'Alex',
      email: 'alex@example.com',
      authProvider: 'password',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Welcome, Alex!', 'success');
  });

  test('allows login with a username identifier', async () => {
    api.login.mockResolvedValue({
      user: { id: 'u1', name: 'Alex', email: 'alex@example.com', authProvider: 'password' },
    });

    await act(async () => {
      root.render(
        <AuthModal
          onClose={jest.fn()}
          onSuccess={jest.fn()}
          onDemo={jest.fn()}
          showToast={jest.fn()}
        />
      );
    });

    expect(container.textContent).toContain('Email or username');

    const inputs = container.querySelectorAll('input');
    const form = container.querySelector('form');
    expect(inputs[0].id).toBe('auth-login-identifier');
    expect(inputs[0].hasAttribute('name')).toBe(false);
    expect(inputs[0].type).toBe('text');
    expect(inputs[0].getAttribute('inputmode')).toBe('email');
    expect(inputs[0].getAttribute('autocomplete')).toBe('username');
    expect(inputs[0].getAttribute('autocapitalize')).toBe('none');
    expect(inputs[0].getAttribute('spellcheck')).toBe('false');
    expect(container.querySelector('label[for="auth-login-identifier"]')).not.toBeNull();
    expect(inputs[1].id).toBe('auth-login-password');
    expect(inputs[1].name).toBe('password');
    expect(inputs[1].getAttribute('autocomplete')).toBe('current-password');
    expect(container.querySelector('label[for="auth-login-password"]')).not.toBeNull();

    await act(async () => {
      setInputValue(inputs[0], 'alex');
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      setInputValue(inputs[1], 'secret123');
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(api.login).toHaveBeenCalledWith('alex', 'secret123');
  });

  test('renders the official Google button when Google auth is available', async () => {
    api.getAuthConfig.mockResolvedValueOnce({
      googleAuthEnabled: true,
      googleClientId: 'google-client-id.apps.googleusercontent.com',
    });

    await act(async () => {
      root.render(
        <AuthModal
          onClose={jest.fn()}
          onSuccess={jest.fn()}
          onDemo={jest.fn()}
          showToast={jest.fn()}
        />
      );
    });

    await act(async () => {});

    expect(googleInitialize).toHaveBeenCalledWith(expect.objectContaining({
      client_id: 'google-client-id.apps.googleusercontent.com',
      ux_mode: 'popup',
      auto_select: false,
      button_auto_select: false,
    }));
    expect(googleRenderButton).toHaveBeenCalledWith(
      container.querySelector('.auth-google-btn-host'),
      expect.objectContaining({
        type: 'standard',
        theme: 'outline',
        shape: 'pill',
        text: 'continue_with',
        width: 199,
      })
    );
  });

  test('keeps requested auth tab order and form/provider spacing', async () => {
    await act(async () => {
      root.render(
        <AuthModal
          onClose={jest.fn()}
          onSuccess={jest.fn()}
          onDemo={jest.fn()}
          showToast={jest.fn()}
        />
      );
    });

    const tabLabels = Array.from(container.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent.trim());
    expect(tabLabels).toEqual(['Sign up', 'Log in']);

    expect(getCssRule('.auth-form')).toContain('padding: var(--unit-24) var(--unit-24) 0;');
    expect(getCssRule('.auth-inline-actions--single')).toContain('justify-content: center;');
    expect(getCssRule('.auth-modal .modal-body')).toContain('gap: 0;');
    expect(getCssRule('.auth-provider-section')).toContain('margin-top: var(--unit-32);');
    expect(getCssRule('.auth-provider-section')).toContain('padding: 0 var(--unit-24);');
    expect(getCssRule('.auth-provider-section')).toContain('gap: 0;');
    expect(getCssRule('.auth-provider-divider')).toContain('padding: 0;');
    expect(getCssRule('.auth-google-btn-host')).toContain('padding: var(--unit-32) 0;');
    expect(getCssRule('.auth-form + .auth-footer')).toContain('margin-top: var(--unit-32);');
  });

  test('completes Google sign-in from the official button credential callback', async () => {
    api.getAuthConfig.mockResolvedValueOnce({
      googleAuthEnabled: true,
      googleClientId: 'google-client-id.apps.googleusercontent.com',
    });
    api.loginWithGoogleCredential.mockResolvedValue({
      user: { id: 'u-google', name: 'Gina', email: 'gina@example.com', authProvider: 'google' },
    });
    const onSuccess = jest.fn();
    const onClose = jest.fn();
    const showToast = jest.fn();

    await act(async () => {
      root.render(
        <AuthModal
          onClose={onClose}
          onSuccess={onSuccess}
          onDemo={jest.fn()}
          showToast={showToast}
        />
      );
    });

    await act(async () => {});

    const credentialCallback = googleInitialize.mock.calls[0][0].callback;

    await act(async () => {
      await credentialCallback({ credential: 'google-id-token' });
    });

    expect(api.loginWithGoogleCredential).toHaveBeenCalledWith('google-id-token');
    expect(onSuccess).toHaveBeenCalledWith({
      id: 'u-google',
      name: 'Gina',
      email: 'gina@example.com',
      authProvider: 'google',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Signed in with Google', 'success');
  });

  test('switches signup into verification mode after account creation', async () => {
    api.signup.mockResolvedValue({
      pendingVerification: true,
      email: 'alex@example.com',
      codeLength: 6,
      expiresInMinutes: 10,
    });

    await act(async () => {
      root.render(
        <AuthModal
          onClose={jest.fn()}
          onSuccess={jest.fn()}
          onDemo={jest.fn()}
          showToast={jest.fn()}
        />
      );
    });

    await clickButton('Sign up');

    expect(container.textContent).toContain('Username');
    expect(container.textContent).toContain('Must be at least 8 characters');
    expect(container.querySelector('.password-input')).toBeNull();

    const passwordToggle = container.querySelector('.auth-password-toggle');
    expect(passwordToggle).not.toBeNull();
    expect(passwordToggle.closest('.ui-input-shell')).not.toBeNull();

    const inputs = container.querySelectorAll('input');
    const form = container.querySelector('form');
    expect(inputs[2].getAttribute('minlength')).toBe('8');

    await act(async () => {
      setInputValue(inputs[0], 'Alex');
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      setInputValue(inputs[1], 'alex@example.com');
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      setInputValue(inputs[2], 'secret123');
      inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(api.signup).toHaveBeenCalledWith('alex@example.com', 'secret123', 'Alex');
    expect(container.textContent).toContain('Verify your email');
    expect(container.textContent).toContain('We sent a 6-digit code to alex@example.com.');
    expect(container.textContent).toContain('Verification code');
  });

  test('completes signup immediately when verification is skipped', async () => {
    api.signup.mockResolvedValue({
      user: {
        id: 'u-skip',
        name: 'Pro',
        email: 'pro@example.com',
        emailVerified: true,
        authProvider: 'password',
      },
      emailVerificationSkipped: true,
    });

    const onSuccess = jest.fn();
    const onClose = jest.fn();
    const showToast = jest.fn();

    await act(async () => {
      root.render(
        <AuthModal
          onClose={onClose}
          onSuccess={onSuccess}
          onDemo={jest.fn()}
          showToast={showToast}
        />
      );
    });

    await clickButton('Sign up');

    const inputs = container.querySelectorAll('input');
    const form = container.querySelector('form');

    await act(async () => {
      setInputValue(inputs[0], 'Pro');
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      setInputValue(inputs[1], 'pro@example.com');
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      setInputValue(inputs[2], 'secret123');
      inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(api.signup).toHaveBeenCalledWith('pro@example.com', 'secret123', 'Pro');
    expect(onSuccess).toHaveBeenCalledWith({
      id: 'u-skip',
      name: 'Pro',
      email: 'pro@example.com',
      emailVerified: true,
      authProvider: 'password',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Welcome, Pro!', 'success');
    expect(container.textContent).not.toContain('Verify your email');
  });

  test('moves unverified login attempts into the verification flow', async () => {
    const error = new Error('Check your email for a verification code before logging in.');
    error.code = 'EMAIL_NOT_VERIFIED';
    error.payload = { email: 'alex@example.com' };
    api.login.mockRejectedValue(error);

    await act(async () => {
      root.render(
        <AuthModal
          onClose={jest.fn()}
          onSuccess={jest.fn()}
          onDemo={jest.fn()}
          showToast={jest.fn()}
        />
      );
    });

    const inputs = container.querySelectorAll('input');
    const form = container.querySelector('form');

    await act(async () => {
      setInputValue(inputs[0], 'alex@example.com');
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      setInputValue(inputs[1], 'secret123');
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain('Verify your email');
    expect(container.textContent).toContain('This account still needs email verification.');
    const emailField = container.querySelector('input[type="email"]');
    expect(emailField.value).toBe('alex@example.com');
  });

  test('sends a reset code and moves into reset mode', async () => {
    api.forgotPassword.mockResolvedValue({
      success: true,
      codeLength: 6,
      expiresInMinutes: 15,
    });

    await act(async () => {
      root.render(
        <AuthModal
          onClose={jest.fn()}
          onSuccess={jest.fn()}
          onDemo={jest.fn()}
          showToast={jest.fn()}
        />
      );
    });

    const emailInput = container.querySelector('input[autocomplete="username"]');
    await act(async () => {
      setInputValue(emailInput, 'alex@example.com');
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await clickButton('Forgot password?');

    const form = container.querySelector('form');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(api.forgotPassword).toHaveBeenCalledWith('alex@example.com');
    expect(container.textContent).toContain('Reset password');
    expect(container.textContent).toContain('If that account exists, we sent a reset code.');
    expect(container.textContent).toContain('Verification code');
  });

  test('resends the verification code from the verify screen', async () => {
    api.signup.mockResolvedValue({
      pendingVerification: true,
      email: 'alex@example.com',
      codeLength: 6,
      expiresInMinutes: 10,
    });
    api.resendVerification.mockResolvedValue({
      success: true,
      codeLength: 6,
      expiresInMinutes: 10,
    });

    await act(async () => {
      root.render(
        <AuthModal
          onClose={jest.fn()}
          onSuccess={jest.fn()}
          onDemo={jest.fn()}
          showToast={jest.fn()}
        />
      );
    });

    await clickButton('Sign up');
    const form = container.querySelector('form');
    const inputs = container.querySelectorAll('input');

    await act(async () => {
      setInputValue(inputs[0], 'Alex');
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      setInputValue(inputs[1], 'alex@example.com');
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      setInputValue(inputs[2], 'secret123');
      inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    await clickButton('Resend code');

    expect(api.resendVerification).toHaveBeenCalledWith('alex@example.com');
    expect(container.textContent).toContain('A new code was sent to alex@example.com.');
  });
});

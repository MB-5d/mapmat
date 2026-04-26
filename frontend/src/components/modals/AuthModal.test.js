import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import * as api from '../../api';
import AuthModal from './AuthModal';

jest.mock('../../api', () => ({
  login: jest.fn(),
  signup: jest.fn(),
  verifyEmail: jest.fn(),
  resendVerification: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
  getAuthConfig: jest.fn(() => Promise.resolve({ googleAuthEnabled: false })),
  getGoogleAuthStartUrl: jest.fn(() => 'http://localhost:4002/auth/google/start'),
}));

jest.mock('../../utils/analytics', () => ({
  trackEvent: jest.fn(),
}));

describe('AuthModal', () => {
  let container;
  let root;

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
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
    jest.clearAllMocks();
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

    await clickButton('Sign Up');

    const inputs = container.querySelectorAll('input');
    const form = container.querySelector('form');

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
    expect(container.textContent).toContain('Verification Code');
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

    const emailInput = container.querySelector('input[type="email"]');
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
    expect(container.textContent).toContain('Verification Code');
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

    await clickButton('Sign Up');
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

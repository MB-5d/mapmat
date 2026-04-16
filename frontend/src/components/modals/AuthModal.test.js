import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import * as api from '../../api';
import AuthModal from './AuthModal';

jest.mock('../../api', () => ({
  login: jest.fn(),
  signup: jest.fn(),
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
      user: { id: 'u1', name: 'Alex', email: 'alex@example.com' },
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
    expect(onSuccess).toHaveBeenCalledWith({ id: 'u1', name: 'Alex', email: 'alex@example.com' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Welcome, Alex!', 'success');
  });
});

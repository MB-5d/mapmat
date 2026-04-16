import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import InviteAcceptGate from './InviteAcceptGate';

describe('InviteAcceptGate', () => {
  let container;
  let root;

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

  test('routes auth-required users into sign in', () => {
    const onLogin = jest.fn();

    act(() => {
      root.render(
        <InviteAcceptGate
          status="auth_required"
          onLogin={onLogin}
          onGoHome={jest.fn()}
          onShowInvites={jest.fn()}
        />
      );
    });

    const signInButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Sign In')
    );

    act(() => {
      signInButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onLogin).toHaveBeenCalledTimes(1);
  });
});

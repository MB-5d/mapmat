import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import MapAccessGate from './MapAccessGate';

describe('MapAccessGate', () => {
  let container;
  let root;

  const setTextareaValue = (element, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
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
    vi.clearAllMocks();
  });

  test('lets a logged-in user request access', () => {
    const onRequestMessageChange = vi.fn();
    const onRequestAccess = vi.fn();

    act(() => {
      root.render(
        <MapAccessGate
          isLoggedIn
          requestStatus="idle"
          requestMessage=""
          onGoHome={vi.fn()}
          onRequestMessageChange={onRequestMessageChange}
          onRequestAccess={onRequestAccess}
        />
      );
    });

    const textarea = container.querySelector('textarea');
    const requestButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Request access')
    );

    expect(textarea.getAttribute('maxlength')).toBe('200');

    act(() => {
      setTextareaValue(textarea, 'Need review access');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      requestButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onRequestMessageChange).toHaveBeenCalledWith('Need review access');
    expect(onRequestAccess).toHaveBeenCalledTimes(1);
  });

  test('does not show request controls while a map is opening', () => {
    act(() => {
      root.render(
        <MapAccessGate
          isLoggedIn
          loading
          requestStatus="idle"
          requestMessage=""
          onGoHome={vi.fn()}
          onRequestMessageChange={vi.fn()}
          onRequestAccess={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain('Opening map');
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.textContent).not.toContain('Request access');
  });

  test('shows only the opening state while authentication is unresolved', () => {
    act(() => {
      root.render(
        <MapAccessGate
          isLoggedIn={false}
          authLoading
          requestStatus="idle"
          requestMessage=""
          onLogin={vi.fn()}
          onGoHome={vi.fn()}
          onRequestAccess={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain('Opening map');
    expect(container.textContent).not.toContain('Sign in to continue');
    expect(container.textContent).not.toContain('Request access');
  });

  test('shows sign in only after signed-out state is confirmed', () => {
    act(() => {
      root.render(
        <MapAccessGate
          isLoggedIn={false}
          authLoading={false}
          requestStatus="idle"
          requestMessage=""
          onLogin={vi.fn()}
          onGoHome={vi.fn()}
          onRequestAccess={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain('Sign in to continue');
    expect(container.textContent).not.toContain('Opening map');
    expect(container.textContent).not.toContain('Request access');
  });
});

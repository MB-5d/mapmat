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
    jest.clearAllMocks();
  });

  test('lets a logged-in user request access', () => {
    const onRequestMessageChange = jest.fn();
    const onRequestAccess = jest.fn();

    act(() => {
      root.render(
        <MapAccessGate
          isLoggedIn
          requestStatus="idle"
          requestMessage=""
          onGoHome={jest.fn()}
          onRequestMessageChange={onRequestMessageChange}
          onRequestAccess={onRequestAccess}
        />
      );
    });

    const textarea = container.querySelector('textarea');
    const requestButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Request Viewer Access')
    );

    act(() => {
      setTextareaValue(textarea, 'Need review access');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      requestButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onRequestMessageChange).toHaveBeenCalledWith('Need review access');
    expect(onRequestAccess).toHaveBeenCalledTimes(1);
  });
});

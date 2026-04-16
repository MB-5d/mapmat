import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import SaveVersionModal from './SaveVersionModal';

describe('SaveVersionModal', () => {
  let container;
  let root;

  const setInputValue = (element, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(
      element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      'value'
    );
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

  test('blocks empty titles and shows an error', () => {
    const onSave = jest.fn();

    act(() => {
      root.render(
        <SaveVersionModal
          show
          onClose={jest.fn()}
          onSave={onSave}
          versionNumber={3}
          timestamp="Today"
          defaultName="Updated"
        />
      );
    });

    const titleInput = container.querySelector('input[type="text"]');

    act(() => {
      setInputValue(titleInput, '   ');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save Version')
    );

    act(() => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Title is required');
  });

  test('saves trimmed values', () => {
    const onSave = jest.fn();

    act(() => {
      root.render(
        <SaveVersionModal
          show
          onClose={jest.fn()}
          onSave={onSave}
          versionNumber={4}
          timestamp="Today"
          defaultName=" Updated "
        />
      );
    });

    const inputs = container.querySelectorAll('input, textarea');
    const titleInput = inputs[0];
    const notesInput = inputs[1];

    act(() => {
      setInputValue(titleInput, '  Launch prep  ');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      setInputValue(notesInput, '  Added screenshots  ');
      notesInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save Version')
    );

    act(() => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledWith('Launch prep', 'Added screenshots');
  });
});

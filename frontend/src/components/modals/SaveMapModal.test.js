import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import SaveMapModal from './SaveMapModal';

describe('SaveMapModal', () => {
  let container;
  let root;

  const setInputValue = (element, value) => {
    const prototype = element.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
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

  test('saves the current map values through the shared form controls', () => {
    const onSave = jest.fn();

    act(() => {
      root.render(
        <SaveMapModal
          show
          onClose={jest.fn()}
          isLoggedIn
          onRequireLogin={jest.fn()}
          projects={[{ id: 'p1', name: 'Project One' }]}
          currentMap={{ name: 'Current map', notes: 'Old notes' }}
          rootUrl="https://example.com"
          defaultProjectId=""
          onSave={onSave}
          onCreateProject={jest.fn()}
        />
      );
    });

    const inputs = container.querySelectorAll('input, textarea');
    const mapNameInput = inputs[0];
    const notesInput = inputs[1];

    act(() => {
      setInputValue(mapNameInput, 'Homepage map');
      mapNameInput.dispatchEvent(new Event('input', { bubbles: true }));
      setInputValue(notesInput, 'Shared DS flow');
      notesInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save Map')
    );

    act(() => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledWith(null, 'Homepage map', 'Shared DS flow');
  });

  test('uses shared button and input primitives for inline project creation', () => {
    act(() => {
      root.render(
        <SaveMapModal
          show
          onClose={jest.fn()}
          isLoggedIn
          onRequireLogin={jest.fn()}
          projects={[]}
          currentMap={{ name: 'Current map', notes: '' }}
          rootUrl="https://example.com"
          defaultProjectId=""
          onSave={jest.fn()}
          onCreateProject={jest.fn()}
        />
      );
    });

    const newProjectButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Create new project')
    );

    expect(newProjectButton.className).toContain('ui-btn');

    act(() => {
      newProjectButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const inlineInput = container.querySelector('.new-project-inline input');
    const inlineButtons = Array.from(container.querySelectorAll('.new-project-inline button'));

    expect(inlineInput.className).toContain('ui-input');
    inlineButtons.forEach((button) => {
      expect(button.className).toContain('ui-btn');
    });
  });
});

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import SaveMapModal from './SaveMapModal';

describe('SaveMapModal', () => {
  let container;
  let root;

  const waitForUiResponse = () => new Promise((resolve) => setTimeout(resolve, 0));

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

  test('saves the current map values through the shared form controls', async () => {
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
    const saveInSelect = container.querySelector('select');

    expect(Array.from(container.querySelectorAll('label')).map((label) => label.textContent)).toContain('Save in');
    expect(saveInSelect.value).toBe('');
    expect(saveInSelect.options[0].textContent).toBe('One-offs');
    expect(saveInSelect.querySelector('optgroup')?.label).toBe('Projects');
    expect(container.textContent).not.toContain('Uncategorized');
    expect(container.textContent).not.toContain('No project');

    act(() => {
      setInputValue(mapNameInput, 'Homepage map');
      mapNameInput.dispatchEvent(new Event('input', { bubbles: true }));
      setInputValue(notesInput, 'Shared DS flow');
      notesInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save map')
    );

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await waitForUiResponse();
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
    expect(newProjectButton.className).toContain('ui-btn--type-link');

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

  test('disables inline project creation when the project limit is reached', () => {
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
          projectCreateDisabledReason="project limit reached"
        />
      );
    });

    const newProjectButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('project limit reached')
    );

    expect(newProjectButton).toBeTruthy();
    expect(newProjectButton.disabled).toBe(true);
    expect(container.querySelector('.new-project-inline')).toBeNull();
  });

  test('supports contextual cancel labels and actions', () => {
    const onCancel = jest.fn();

    act(() => {
      root.render(
        <SaveMapModal
          show
          onClose={jest.fn()}
          onCancel={onCancel}
          cancelLabel="Don't save"
          isLoggedIn
          onRequireLogin={jest.fn()}
          projects={[]}
          currentMap={{ name: 'Unsaved map', notes: '' }}
          rootUrl="https://example.com"
          defaultProjectId=""
          onSave={jest.fn()}
          onCreateProject={jest.fn()}
        />
      );
    });

    const cancelButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes("Don't save")
    );

    act(() => {
      cancelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('shows saving state while save is in progress', async () => {
    let resolveSave;
    const onSave = jest.fn(() => new Promise((resolve) => {
      resolveSave = resolve;
    }));

    await act(async () => {
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
          onSave={onSave}
          onCreateProject={jest.fn()}
        />
      );
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save map')
    );

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await waitForUiResponse();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(saveButton.textContent).toContain('Saving');
    expect(saveButton.getAttribute('aria-busy')).toBe('true');

    await act(async () => {
      resolveSave();
      await Promise.resolve();
    });
  });

  test('shows a saving response before starting deferred save work', async () => {
    const onSave = jest.fn();

    await act(async () => {
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
          onSave={onSave}
          onCreateProject={jest.fn()}
        />
      );
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save map')
    );

    act(() => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(saveButton.textContent).toContain('Saving');
    expect(saveButton.getAttribute('aria-busy')).toBe('true');
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      await waitForUiResponse();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  test('blocks duplicate map names within the selected project', async () => {
    const onSave = jest.fn();

    act(() => {
      root.render(
        <SaveMapModal
          show
          onClose={jest.fn()}
          isLoggedIn
          onRequireLogin={jest.fn()}
          projects={[{
            id: 'p1',
            name: 'Project One',
            maps: [{ id: 'existing-map', name: 'Homepage map', project_id: 'p1' }],
          }]}
          currentMap={null}
          rootUrl="https://example.com"
          defaultProjectId="p1"
          defaultName="Homepage map"
          onSave={onSave}
          onCreateProject={jest.fn()}
        />
      );
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save map')
    );

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await waitForUiResponse();
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(container.textContent).toContain('already exists in this location');
  });
});

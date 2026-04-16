import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import EditNodeModal from './EditNodeModal';

describe('EditNodeModal', () => {
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

  test('saves updated page fields through the shared form controls', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    act(() => {
      root.render(
        <EditNodeModal
          node={{
            id: '1',
            title: 'Old title',
            url: 'https://example.com/old',
            pageType: 'Page',
            annotations: { status: 'none', tags: [], note: '' },
          }}
          allNodes={[]}
          rootTree={null}
          onClose={onClose}
          onSave={onSave}
          mode="edit"
          customPageTypes={[]}
          onAddCustomType={jest.fn()}
          specialParentOptions={[]}
        />
      );
    });

    const titleInput = container.querySelector('.edit-node-form input[type="text"]');

    act(() => {
      setInputValue(titleInput, 'Updated title');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save Changes')
    );

    act(() => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Updated title',
        url: 'https://example.com/old',
        pageType: 'Page',
      })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

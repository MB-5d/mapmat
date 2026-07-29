import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import DeleteConfirmModal from './DeleteConfirmModal';

describe('DeleteConfirmModal', () => {
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
  });

  test('uses mono secondary action next to the danger delete action', () => {
    act(() => {
      root.render(
        <DeleteConfirmModal
          node={{ title: 'About' }}
          onCancel={jest.fn()}
          onConfirm={jest.fn()}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const cancelButton = buttons.find((button) => button.textContent === 'Cancel');
    const deleteButton = buttons.find((button) => button.textContent === 'Delete');

    expect(cancelButton.className).toContain('ui-btn--type-secondary');
    expect(cancelButton.className).toContain('ui-btn--style-mono');
    expect(deleteButton.className).toContain('ui-btn--style-danger');
  });
});

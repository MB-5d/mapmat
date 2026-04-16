import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import Button from './Button';
import CheckboxField from './CheckboxField';
import Modal from './Modal';
import RadioCardGroup from './RadioCardGroup';
import ToggleSwitch from './ToggleSwitch';

describe('ui primitives', () => {
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

  test('Button shows loading state and disables interaction', () => {
    act(() => {
      root.render(<Button loading>Save</Button>);
    });

    const button = container.querySelector('button');
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.textContent).toContain('Save');
    expect(container.querySelector('.ui-btn__spinner')).not.toBeNull();
  });

  test('Modal closes on Escape', () => {
    const onClose = jest.fn();

    act(() => {
      root.render(
        <Modal show onClose={onClose} title="Test Modal">
          <p>Body</p>
        </Modal>
      );
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('CheckboxField, RadioCardGroup, and ToggleSwitch emit changes', () => {
    const onCheckboxChange = jest.fn();
    const onRadioChange = jest.fn();
    const onToggleChange = jest.fn();

    act(() => {
      root.render(
        <div>
          <CheckboxField checked={false} onChange={onCheckboxChange} label="Check me" />
          <RadioCardGroup
            name="role"
            value="viewer"
            onChange={onRadioChange}
            options={[
              { value: 'viewer', label: 'Viewer' },
              { value: 'editor', label: 'Editor' },
            ]}
          />
          <ToggleSwitch checked={false} onChange={onToggleChange} label="Enable thing" />
        </div>
      );
    });

    const checkbox = container.querySelector('.ui-checkbox-field__input');
    const radio = container.querySelector('input[type="radio"][value="editor"]');
    const toggle = container.querySelector('.ui-toggle__input');

    act(() => {
      checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      radio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCheckboxChange).toHaveBeenCalledTimes(1);
    expect(onRadioChange).toHaveBeenCalledWith('editor');
    expect(onToggleChange).toHaveBeenCalledTimes(1);
  });
});

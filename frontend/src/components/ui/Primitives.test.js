import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import Avatar from './Avatar';
import Button from './Button';
import CheckboxField from './CheckboxField';
import Icon from './Icon';
import IconButton from './IconButton';
import InlineBadge from './InlineBadge';
import Modal from './Modal';
import { MenuItem } from './Menu';
import Tag from './Tag';
import CommentBadge from '../nodes/CommentBadge';
import NodeBadge from '../nodes/NodeBadge';
import NodeStatusBadge from '../nodes/NodeStatusBadge';
import OptionCard from './OptionCard';
import RadioCardGroup from './RadioCardGroup';
import SegmentedControl from './SegmentedControl';
import SelectInput from './SelectInput';
import TextInput from './TextInput';
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

  test('Avatar supports image and fallback states', () => {
    act(() => {
      root.render(
        <div>
          <Avatar src="https://example.com/avatar.png" label="MB" size="sm" />
          <Avatar label="MB" size="lg" shape="rounded" />
        </div>
      );
    });

    const [imageAvatar, fallbackAvatar] = container.querySelectorAll('.ui-avatar');
    expect(imageAvatar.querySelector('img')).not.toBeNull();
    expect(fallbackAvatar.textContent).toContain('MB');
    expect(fallbackAvatar.className).toContain('ui-avatar--lg');
    expect(fallbackAvatar.className).toContain('ui-avatar--rounded');
  });

  test('Icon normalizes size and tone through shared classes', () => {
    act(() => {
      root.render(<Icon icon={<span className="icon-marker">+</span>} size="lg" tone="brand" />);
    });

    const icon = container.querySelector('.ui-icon');
    expect(icon).not.toBeNull();
    expect(icon.className).toContain('ui-icon--lg');
    expect(icon.className).toContain('ui-icon--brand');
    expect(icon.querySelector('.icon-marker')).not.toBeNull();
  });

  test('Button supports label and icon slots', () => {
    act(() => {
      root.render(
        <Button
          type="secondary"
          style="danger"
          size="sm"
          label="Scan"
          startIcon={<span className="start-icon-marker">S</span>}
          endIcon={<span className="end-icon-marker">E</span>}
        />
      );
    });

    const button = container.querySelector('button');
    expect(button.textContent).toContain('Scan');
    expect(button.getAttribute('aria-label')).toBe('Scan');
    expect(button.className).toContain('ui-btn--type-secondary');
    expect(button.className).toContain('ui-btn--style-danger');
    expect(button.className).toContain('ui-btn--sm');
    expect(container.querySelector('.ui-btn__icon--start .start-icon-marker')).not.toBeNull();
    expect(container.querySelector('.ui-btn__icon--end .end-icon-marker')).not.toBeNull();
  });

  test('Button keeps legacy variant mapping and native submit behavior', () => {
    act(() => {
      root.render(
        <Button type="submit" variant="danger" label="Delete map" />
      );
    });

    const button = container.querySelector('button');
    expect(button.getAttribute('type')).toBe('submit');
    expect(button.className).toContain('ui-btn--danger');
    expect(button.className).toContain('ui-btn--type-primary');
    expect(button.className).toContain('ui-btn--style-danger');
  });

  test('IconButton supports canonical taxonomy, icon content, and loading state', () => {
    act(() => {
      root.render(
        <div>
          <IconButton
            type="secondary"
            style="brand"
            size="xxl"
            icon={<span className="icon-button-marker">+</span>}
            label="Add node"
          />
          <IconButton label="Saving" loading />
        </div>
      );
    });

    const [styledButton, loadingButton] = container.querySelectorAll('button');
    expect(styledButton.getAttribute('aria-label')).toBe('Add node');
    expect(styledButton.className).toContain('ui-icon-btn--type-secondary');
    expect(styledButton.className).toContain('ui-icon-btn--style-brand');
    expect(styledButton.className).toContain('ui-icon-btn--xxl');
    expect(styledButton.querySelector('.ui-icon-btn__icon .icon-button-marker')).not.toBeNull();
    expect(loadingButton.disabled).toBe(true);
    expect(loadingButton.getAttribute('aria-busy')).toBe('true');
    expect(loadingButton.querySelector('.ui-icon-btn__spinner')).not.toBeNull();
  });

  test('MenuItem supports selected and danger states', () => {
    act(() => {
      root.render(
        <div>
          <MenuItem label="Active item" selected />
          <MenuItem label="Delete item" danger />
        </div>
      );
    });

    const [selectedItem, dangerItem] = container.querySelectorAll('button');
    expect(selectedItem.className).toContain('ui-menu-item--selected');
    expect(dangerItem.className).toContain('ui-menu-item--danger');
  });

  test('InlineBadge and NodeStatusBadge render shared badge primitives', () => {
    act(() => {
      root.render(
        <div>
          <InlineBadge icon={<span className="badge-icon-marker">+</span>} label="Current" />
          <Tag
            label="Subdomain"
            startIcon={<span className="tag-icon-marker">#</span>}
          />
          <NodeBadge label="Marketing" />
          <NodeStatusBadge status="moved" label="Moved" note />
          <CommentBadge count={3} />
        </div>
      );
    });

    expect(container.querySelector('.ui-inline-badge')).not.toBeNull();
    expect(container.querySelector('.ui-inline-badge__icon .badge-icon-marker')).not.toBeNull();
    expect(container.querySelector('.ui-tag')).not.toBeNull();
    expect(container.querySelector('.ui-tag__icon .tag-icon-marker')).not.toBeNull();
    expect(container.querySelector('.node-badge')).not.toBeNull();
    expect(container.querySelector('.node-status-badge.status-moved')).not.toBeNull();
    expect(container.querySelector('.node-status-note-dot')).not.toBeNull();
    expect(container.querySelector('.comment-badge')?.textContent).toBe('');
    expect(container.querySelector('.comment-badge')?.getAttribute('aria-label')).toBe('View 3 notes');
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

  test('Modal supports optional subtitle and shared close button', () => {
    act(() => {
      root.render(
        <Modal show onClose={() => {}} title="Test Modal" subtitle="Optional copy">
          <p>Body</p>
        </Modal>
      );
    });

    expect(container.querySelector('.modal-subtitle')?.textContent).toContain('Optional copy');
    expect(container.querySelector('.modal-close.ui-icon-btn')).not.toBeNull();
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

  test('TextInput supports shell props, field wrapper props, and icon slots', () => {
    act(() => {
      root.render(
        <TextInput
          size="lg"
          inputStyle="brand"
          label="Map name"
          hint="Used in save flows"
          error="Name is required"
          placeholder="Untitled map"
          leftIcon={<span className="left-icon-marker">L</span>}
          rightIcon={<span className="right-icon-marker">R</span>}
        />
      );
    });

    const shell = container.querySelector('.ui-input-shell');
    const input = container.querySelector('input');

    expect(container.querySelector('.field-label')).not.toBeNull();
    expect(container.querySelector('.field-error')).not.toBeNull();
    expect(shell.className).toContain('ui-input-shell--lg');
    expect(shell.className).toContain('ui-input-shell--style-brand');
    expect(shell.className).toContain('ui-input-shell--invalid');
    expect(container.querySelector('.ui-input-shell__icon--left .left-icon-marker')).not.toBeNull();
    expect(container.querySelector('.ui-input-shell__icon--right .right-icon-marker')).not.toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('placeholder')).toBe('Untitled map');
  });

  test('TextInput can render without chrome for inline uses', () => {
    act(() => {
      root.render(<TextInput framed={false} className="inline-input" value="Inline" readOnly />);
    });

    expect(container.querySelector('.ui-input-shell')).toBeNull();
    expect(container.querySelector('input.inline-input')).not.toBeNull();
  });

  test('SelectInput supports shell props and keeps the shared chevron', () => {
    act(() => {
      root.render(
        <SelectInput
          size="sm"
          inputStyle="mono"
          label="Workspace"
          error="Select a workspace"
          leftIcon={<span className="select-left-icon-marker">S</span>}
          value="default"
          onChange={() => {}}
        >
          <option value="default">Default workspace</option>
        </SelectInput>
      );
    });

    const shell = container.querySelector('.ui-select-shell');
    const select = container.querySelector('select');

    expect(container.querySelector('.field-label')).not.toBeNull();
    expect(container.querySelector('.field-error')).not.toBeNull();
    expect(shell.className).toContain('ui-input-shell--sm');
    expect(shell.className).toContain('ui-input-shell--style-mono');
    expect(container.querySelector('.ui-input-shell__icon--left .select-left-icon-marker')).not.toBeNull();
    expect(container.querySelector('.ui-select-chevron')).not.toBeNull();
    expect(select.getAttribute('aria-invalid')).toBe('true');
  });

  test('SegmentedControl and OptionCard emit interactions', () => {
    const onSegmentChange = jest.fn();
    const onOptionClick = jest.fn();

    act(() => {
      root.render(
        <div>
          <SegmentedControl
            value="one"
            onChange={onSegmentChange}
            options={[
              { value: 'one', label: 'One' },
              { value: 'two', label: 'Two' },
            ]}
          />
          <OptionCard
            title="Export PNG"
            description="Save an image"
            onClick={onOptionClick}
          />
        </div>
      );
    });

    const segmentButton = Array.from(container.querySelectorAll('.ui-segmented-control__option')).find(
      (button) => button.textContent.includes('Two')
    );
    const optionCard = container.querySelector('.ui-option-card');

    act(() => {
      segmentButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      optionCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSegmentChange).toHaveBeenCalledWith('two');
    expect(onOptionClick).toHaveBeenCalledTimes(1);
  });
});

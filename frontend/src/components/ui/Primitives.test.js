import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

import Accordion from './Accordion';
import Avatar from './Avatar';
import Badge from './Badge';
import Button from './Button';
import CheckboxField from './CheckboxField';
import Chip from './Chip';
import Icon from './Icon';
import IconButton from './IconButton';
import Modal from './Modal';
import { MenuItem, MenuRadioItem, MenuTitle } from './Menu';
import Tag from './Tag';
import CommentBadge from '../nodes/CommentBadge';
import NodeBadge from '../nodes/NodeBadge';
import OptionCard from './OptionCard';
import RadioCardGroup from './RadioCardGroup';
import SearchInput from './SearchInput';
import SegmentedControl from './SegmentedControl';
import SelectInput from './SelectInput';
import StatusAlert from './StatusAlert';
import TextInput from './TextInput';
import ToggleSwitch from './ToggleSwitch';
import Toast from './Toast';

const appCss = fs.readFileSync(path.join(__dirname, '../../App.css'), 'utf8');
const getCssRule = (selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return appCss.match(new RegExp(`${escapedSelector} \\{[^}]+\\}`))?.[0] || '';
};

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

  test('Accordion wires ARIA, meta content, class hooks, and toggle state', () => {
    const onOpenChange = jest.fn();

    act(() => {
      root.render(
        <Accordion
          id="accordion-panel"
          open={false}
          onOpenChange={onOpenChange}
          title={<strong>Panel title</strong>}
          meta={<span className="accordion-meta-marker">Meta</span>}
          headerActions={<button type="button" className="accordion-action-marker">Action</button>}
          className="custom-accordion"
          contentClassName="custom-accordion-content"
        >
          <p>Panel content</p>
        </Accordion>
      );
    });

    const button = container.querySelector('button[aria-controls="accordion-panel"]');
    expect(button).not.toBeNull();
    expect(button.id).toBe('accordion-panel-trigger');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.custom-accordion.ui-accordion')).not.toBeNull();
    expect(container.querySelector('.accordion-meta-marker')?.textContent).toBe('Meta');
    expect(container.querySelector('.ui-accordion__actions .accordion-action-marker')).not.toBeNull();
    expect(button.querySelector('.accordion-action-marker')).toBeNull();
    expect(container.querySelector('#accordion-panel')).toBeNull();

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onOpenChange).toHaveBeenCalledWith(true);

    act(() => {
      root.render(
        <Accordion
          id="accordion-panel"
          open
          onOpenChange={onOpenChange}
          title="Panel title"
          contentClassName="custom-accordion-content"
        >
          <p>Panel content</p>
        </Accordion>
      );
    });

    const panel = container.querySelector('#accordion-panel');
    expect(container.querySelector('.ui-accordion.is-open')).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(panel.className).toContain('custom-accordion-content');
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.getAttribute('aria-labelledby')).toBe('accordion-panel-trigger');
    expect(panel.textContent).toContain('Panel content');
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
    expect(fallbackAvatar.querySelector('.ui-avatar__fallback')).not.toBeNull();
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
            size="lg"
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
    expect(styledButton.className).toContain('ui-icon-btn--lg');
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

  test('MenuTitle and MenuRadioItem support shared menu structure and single-select rows', () => {
    const onChange = jest.fn();

    act(() => {
      root.render(
        <div>
          <MenuTitle>Map orientation</MenuTitle>
          <MenuRadioItem
            name="orientation"
            value="horizontal"
            checked={false}
            label="Horizontal"
            onChange={onChange}
          />
        </div>
      );
    });

    expect(container.querySelector('.ui-menu-title')?.textContent).toBe('Map orientation');

    const radio = container.querySelector('input[type="radio"][value="horizontal"]');
    const radioRow = container.querySelector('.ui-menu-radio-item');
    expect(radioRow).not.toBeNull();

    act(() => {
      radio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith('horizontal');
  });

  test('Badge, Tag, Chip, and node badges use shared primitives', () => {
    act(() => {
      root.render(
        <div>
          <Badge
            badgeStyle="amber"
            type="hollow"
            size="sm"
            icon={<span className="badge-icon-marker">+</span>}
            label="Current"
          />
          <Chip
            variant="filter"
            tone="amber"
            label="Missing"
            value={18}
            interactive
            selected
          />
          <Tag
            type="fill"
            tagStyle="teal"
            size="sm"
            state="focus"
            label="Subdomain"
            startIcon={<span className="tag-icon-marker">#</span>}
          />
          <NodeBadge label="Marketing" />
          <Badge className="node-status-badge status-moved" type="hollow" badgeStyle="info" size="sm">
            <span className="node-status-text">Moved</span>
            <span className="node-status-note-dot" />
          </Badge>
          <CommentBadge count={3} />
        </div>
      );
    });

    expect(container.querySelector('.ui-badge--sm.ui-badge--type-hollow.ui-badge--style-amber.ui-tone--amber')).not.toBeNull();
    expect(container.querySelector('.ui-badge__icon .badge-icon-marker')).not.toBeNull();
    expect(container.querySelector('.ui-chip--variant-filter.ui-chip--tone-amber.ui-tone--amber.ui-chip--selected')).not.toBeNull();
    expect(container.querySelector('.ui-chip__label')?.textContent).toBe('Missing');
    expect(container.querySelector('.ui-chip__value')?.textContent).toBe('18');
    expect(container.querySelector('.ui-tag--sm.ui-tag--type-fill.ui-tag--style-teal.ui-tone--teal.ui-tag--state-focus')).not.toBeNull();
    expect(container.querySelector('.ui-tag__icon .tag-icon-marker')).not.toBeNull();
    expect(container.querySelector('.node-badge.ui-badge')).not.toBeNull();
    expect(container.querySelector('.node-status-badge.status-moved.ui-badge')).not.toBeNull();
    expect(container.querySelector('.node-status-note-dot')).not.toBeNull();
    expect(container.querySelector('.comment-badge')?.textContent).toBe('');
    expect(container.querySelector('.comment-badge')?.getAttribute('aria-label')).toBe('View 3 notes');
    expect(getCssRule('.ui-badge')).toContain('height: 20px;');
    expect(getCssRule('.ui-badge__content')).toContain('line-height: 1;');
    expect(getCssRule('.ui-badge__content')).toContain('transform: translateY(0.04em);');
    expect(getCssRule('.ui-avatar__fallback')).toContain('letter-spacing: 0;');
    expect(getCssRule('.ui-avatar__fallback')).toContain('transform: translateY(0.04em);');
    expect(getCssRule('.ui-tag__content')).toContain('line-height: inherit;');
    expect(appCss).toMatch(/\.ui-chip__label,\n\.ui-chip__value \{[\s\S]*leading-trim: var\(--ui-leading-trim\);/);
    expect(getCssRule('.ui-chip[class*="ui-tone--"]')).toContain('--ui-chip-bg-current: var(--ui-tone-surface-current);');
  });

  test('StatusAlert and Toast share tone, icon, and dismiss primitives', () => {
    const onDismiss = jest.fn();

    act(() => {
      root.render(
        <div>
          <StatusAlert tone="warning" title="Heads up">Check this state</StatusAlert>
          <Toast type="success" message="Saved" onDismiss={onDismiss} />
          <Toast type="loading" message="Saving" onDismiss={() => {}} />
        </div>
      );
    });

    expect(container.querySelector('.ui-status-alert--warning')).not.toBeNull();
    expect(container.querySelector('.ui-status-alert__title')?.textContent).toContain('Heads up');
    const toast = container.querySelector('.toast-success');
    expect(toast).not.toBeNull();
    const closeButton = toast.querySelector('.toast-close.ui-icon-btn');
    expect(closeButton).not.toBeNull();
    expect(closeButton.className).toContain('ui-icon-btn--type-ghost');
    expect(closeButton.className).toContain('ui-icon-btn--style-mono');
    expect(container.querySelector('.toast-loading .ui-status-alert__spinner')).not.toBeNull();

    act(() => {
      closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
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

    const checkboxLabel = container.querySelector('.ui-checkbox-field__label');
    const radio = container.querySelector('input[type="radio"][value="editor"]');
    const toggle = container.querySelector('.ui-toggle__input');

    act(() => {
      checkboxLabel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      radio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCheckboxChange).toHaveBeenCalledTimes(1);
    expect(onRadioChange).toHaveBeenCalledWith('editor');
    expect(onToggleChange).toHaveBeenCalledTimes(1);
  });

  test('ToggleSwitch uses design-system color tokens for switch states', () => {
    expect(getCssRule('.ui-toggle__input')).toContain('border: 1px solid var(--ui-color-border-strong)');
    expect(getCssRule('.ui-toggle__input')).toContain('background: var(--ui-color-border-strong)');
    expect(getCssRule('.ui-toggle__input:checked')).toContain('background: var(--ui-button-brand-fill)');
    expect(getCssRule('.ui-toggle__input:checked')).toContain('border-color: var(--ui-button-brand-fill)');
    expect(getCssRule('.ui-toggle__input:disabled:checked')).toContain('background: var(--ui-button-brand-fill-disabled)');
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

  test('TextInput supports an interactive right-side element slot', () => {
    act(() => {
      root.render(
        <TextInput
          label="Password"
          type="password"
          rightElement={<button type="button" className="right-element-marker">Show</button>}
        />
      );
    });

    const shell = container.querySelector('.ui-input-shell');
    const button = container.querySelector('.right-element-marker');

    expect(shell.className).toContain('ui-input-shell--with-right-icon');
    expect(button).not.toBeNull();
    expect(button.closest('.ui-input-shell__element--right')).not.toBeNull();
  });

  test('SearchInput uses shared input chrome and clear action', () => {
    const onClear = jest.fn();

    act(() => {
      root.render(
        <SearchInput
          value="query"
          onChange={() => {}}
          onClear={onClear}
          placeholder="Search things"
        />
      );
    });

    const input = container.querySelector('input[type="search"]');
    const clearButton = container.querySelector('button[aria-label="Clear search"]');

    expect(container.querySelector('.ui-search-input.ui-input-shell')).not.toBeNull();
    expect(input.getAttribute('placeholder')).toBe('Search things');
    expect(clearButton).not.toBeNull();

    act(() => {
      clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClear).toHaveBeenCalledTimes(1);
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
          <OptionCard
            as="div"
            className="static-option-card"
            title="Index"
            description="Choose a format"
          >
            <span>Inline action</span>
          </OptionCard>
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

    const staticCard = container.querySelector('.static-option-card');
    expect(staticCard.tagName).toBe('DIV');
    expect(staticCard.getAttribute('type')).toBeNull();
    expect(staticCard.querySelector('.ui-option-card__children').textContent).toContain('Inline action');
  });
});

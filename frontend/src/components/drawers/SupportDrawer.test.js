import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import * as api from '../../api';
import SupportDrawer from './SupportDrawer';

vi.mock('../../api', () => ({
  submitMarketingContact: vi.fn(),
}));

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setTextareaValue(textarea, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('SupportDrawer', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    api.submitMarketingContact.mockResolvedValue({ ok: true });
    window.history.pushState({}, '', '/app/maps/map-1');
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

  test('shows a stacked support form with General inquiry as the default', () => {
    act(() => {
      root.render(
        <SupportDrawer
          isOpen
          onClose={vi.fn()}
          user={{ name: 'Dana Owner', email: 'dana@example.com' }}
        />
      );
    });

    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Support');
    expect(container.textContent).toContain('Sends to support@vellic.io.');
    expect(container.querySelector('#app-support-contact-form').className).toContain('support-contact-form--stacked');
    expect(container.querySelector('#app-support-contact-name').value).toBe('Dana Owner');
    expect(container.querySelector('#app-support-contact-email').value).toBe('dana@example.com');

    const reason = container.querySelector('#app-support-contact-reason');
    expect(reason.value).toBe('General inquiry');
    expect(Array.from(reason.options).map((option) => option.value)).toEqual([
      'General inquiry',
      'Scan issue',
      'Screenshots',
      'Exports',
      'Account access',
      'Other',
    ]);
  });

  test('submits support messages through the contact API', async () => {
    const showToast = vi.fn();

    act(() => {
      root.render(
        <SupportDrawer
          isOpen
          onClose={vi.fn()}
          user={{ name: 'Dana Owner', email: 'dana@example.com' }}
          showToast={showToast}
        />
      );
    });

    act(() => {
      setInputValue(container.querySelector('#app-support-contact-reason-detail'), 'Map sharing');
      setTextareaValue(container.querySelector('#app-support-contact-message'), 'I need help with sharing.');
    });

    await act(async () => {
      container.querySelector('#app-support-contact-form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
    });

    expect(api.submitMarketingContact).toHaveBeenCalledWith(expect.objectContaining({
      targetKey: 'support',
      name: 'Dana Owner',
      email: 'dana@example.com',
      reason: 'General inquiry',
      reasonDetail: 'Map sharing',
      message: 'I need help with sharing.',
    }));
    expect(showToast).toHaveBeenCalledWith('Support message sent', 'success');
    expect(container.textContent).toContain('Message sent');
  });
});

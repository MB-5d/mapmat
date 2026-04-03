import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import LandingPage from './LandingPage';

describe('LandingPage', () => {
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

  test('renders the landing page hero and comparison section', () => {
    act(() => {
      root.render(<LandingPage onLaunchApp={() => {}} />);
    });

    expect(container.textContent).toContain('Map site structure fast enough to use in real client work.');
    expect(container.textContent).toContain('A conservative feature matrix for adjacent tools.');
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
  });

  test('expands and collapses faq items accessibly', () => {
    act(() => {
      root.render(<LandingPage onLaunchApp={() => {}} />);
    });

    const faqButton = container.querySelector('#faq-button-0');
    expect(faqButton).not.toBeNull();
    expect(faqButton.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain(
      'It is built first for agencies, consultants, and internal web teams that need to understand site structure quickly and review it with other people.'
    );

    act(() => {
      faqButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(faqButton.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain(
      'It is built first for agencies, consultants, and internal web teams that need to understand site structure quickly and review it with other people.'
    );

    act(() => {
      faqButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(faqButton.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain(
      'It is built first for agencies, consultants, and internal web teams that need to understand site structure quickly and review it with other people.'
    );
  });
});

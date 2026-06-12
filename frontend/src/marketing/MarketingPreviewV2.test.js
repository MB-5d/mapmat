import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import { submitMarketingContact, submitMarketingMailingListSignup } from '../api';
import MarketingPreviewV2 from './MarketingPreviewV2';
import { parseCurrentRoute, ROUTE_SURFACES } from '../utils/appRoutes';

jest.mock('../api', () => ({
  submitMarketingContact: jest.fn(),
  submitMarketingMailingListSignup: jest.fn(),
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

function setSelectValue(select, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('MarketingPreviewV2', () => {
  let container;
  let root;
  let scrollIntoView;
  let originalScrollTo;
  let scrollTo;

  const renderAt = (path, navigateToRoute = jest.fn(), props = {}) => {
    window.history.pushState({}, '', path);
    const route = parseCurrentRoute(window.location);
    act(() => {
      root.render(
        <MarketingPreviewV2
          route={route}
          navigateToRoute={navigateToRoute}
          onOpenApp={jest.fn()}
          {...props}
        />
      );
    });
    return { route, navigateToRoute };
  };

  const openContactModal = (buttonText = 'Contact us') => {
    const button = Array.from(container.querySelectorAll('button'))
      .find((candidate) => candidate.textContent.includes(buttonText));
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    return button;
  };

  const openMailingListModal = () => {
    const button = Array.from(container.querySelectorAll('button'))
      .find((candidate) => candidate.textContent.trim() === 'Join mailing list');
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    return button;
  };

  const fillContactForm = ({
    name = 'Avery Test',
    email = 'avery@example.com',
    reason = 'Demo request',
    reasonDetail = 'Enterprise rollout',
    message = 'I would like to schedule a demo.',
  } = {}) => {
    act(() => {
      setInputValue(container.querySelector('#marketing-v2-contact-name'), name);
      setInputValue(container.querySelector('#marketing-v2-contact-email'), email);
      setSelectValue(container.querySelector('#marketing-v2-contact-reason'), reason);
      setInputValue(container.querySelector('#marketing-v2-contact-reason-detail'), reasonDetail);
      setTextareaValue(container.querySelector('#marketing-v2-contact-message'), message);
    });
  };

  const submitMailingListForm = async () => {
    await act(async () => {
      container.querySelector('#marketing-v2-mailing-form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    scrollIntoView = jest.fn();
    scrollTo = jest.fn();
    originalScrollTo = window.scrollTo;
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    window.scrollTo = scrollTo;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    submitMarketingContact.mockResolvedValue({ ok: true });
    submitMarketingMailingListSignup.mockResolvedValue({ alreadySubscribed: false });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
    delete window.HTMLElement.prototype.scrollIntoView;
    window.scrollTo = originalScrollTo;
    window.history.pushState({}, '', '/');
    jest.clearAllMocks();
  });

  test('renders a direct V2 section route with route-aware metadata', () => {
    renderAt('/features');

    expect(container.textContent).toContain('The map is the workspace.');
    expect(container.textContent).toContain('Bulk screenshots');
    expect(container.textContent).toContain('Flows & crosslinks');
    expect(container.textContent).toContain('Exports & Handoff');
    expect(container.textContent).toContain('Sitemap tools');
    expect(container.textContent).toContain('FlowMapp');
    expect(container.textContent).toContain('Slickplan');
    expect(container.textContent).toContain('Octopus.do');
    expect(container.textContent).toContain('DYNO Mapper');
    expect(container.textContent).toContain('mySitemapGenerator');
    expect(container.textContent).toContain('AI-ready handoff package');
    expect(container.querySelector('#marketing-v2-features')?.textContent).toContain('AI-ready handoff packageYes');
    expect(container.textContent).toContain('Collaboration');
    expect(container.querySelector('#marketing-v2-features')?.textContent).toContain('This is just the start!');
    expect(container.querySelector('.marketing-v2-feature-upcoming')).toBeNull();
    expect(container.querySelector('.marketing-v2-header__nav a[aria-current="page"]')?.textContent).toBe('Features');
    expect(document.title).toBe('Features | Vellic Marketing Preview V2');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://vellic.io/features');
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }));
  });

  test('uses real nav links and intercepts V2 routing for SPA navigation', () => {
    const navigateToRoute = jest.fn();
    renderAt('/', navigateToRoute);
    const examplesLink = Array.from(container.querySelectorAll('a')).find((link) => (
      link.getAttribute('href') === '/examples'
    ));

    act(() => {
      examplesLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(examplesLink.getAttribute('href')).toBe('/examples');
    expect(navigateToRoute).toHaveBeenCalledWith(expect.objectContaining({
      surface: ROUTE_SURFACES.MARKETING,
      marketingPreviewVersion: 'v2',
      marketingPageId: 'examples',
    }));
  });

  test('opens the app scan URL on desktop', () => {
    const openApp = jest.fn();
    renderAt('/', jest.fn(), { onOpenApp: openApp });

    const input = container.querySelector('.marketing-scan-bar input');
    act(() => {
      setInputValue(input, 'example.com');
      container.querySelector('.marketing-scan-bar .scan-btn').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
      );
    });

    const openedUrl = new URL(openApp.mock.calls[0][0]);
    expect(openedUrl.origin).toBe('https://app.vellic.io');
    expect(openedUrl.pathname).toBe('/app');
    expect(openedUrl.searchParams.get('intent')).toBe('scan');
    expect(openedUrl.searchParams.get('url')).toBe('https://example.com/');
  });

  test('shows the mobile scan modal instead of routing phones to the removed start section', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const navigateToRoute = jest.fn();
    renderAt('/', navigateToRoute);

    const input = container.querySelector('.marketing-scan-bar input');
    act(() => {
      setInputValue(input, 'vellic.io');
      container.querySelector('.marketing-scan-bar .scan-btn').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
      );
    });

    expect(navigateToRoute).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Use a larger screen');
    expect(container.textContent).toContain('Join mailing list');
    expect(container.textContent).toContain('Spread the word');
  });

  test('keeps updates and mailing-list content without the removed start handoff', () => {
    renderAt('/features');

    expect(container.textContent).toContain('Vellic is moving rapidly');
    expect(container.textContent).toContain('Join mailing list');
    expect(container.textContent).toContain('*Emails sent only occasionally for bigger updates and major rollouts.');
    expect(container.textContent).not.toContain('Copy app link');
    expect(container.textContent).not.toContain('Open app anyway');
  });

  test('blocks invalid mailing-list emails without submitting', async () => {
    renderAt('/features');
    openMailingListModal();

    act(() => {
      setInputValue(container.querySelector('#marketing-v2-mailing-email'), 'example.com');
    });
    await submitMailingListForm();

    expect(submitMarketingMailingListSignup).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Enter a valid email address.');
  });

  test('submits valid mailing-list emails and shows success', async () => {
    submitMarketingMailingListSignup.mockResolvedValueOnce({
      alreadySubscribed: false,
      signup: { email: 'person@example.com' },
    });
    renderAt('/features');
    openMailingListModal();

    act(() => {
      setInputValue(container.querySelector('#marketing-v2-mailing-email'), 'person@example.com');
    });
    await submitMailingListForm();

    expect(submitMarketingMailingListSignup).toHaveBeenCalledWith('person@example.com', expect.objectContaining({
      source: 'marketing-preview-v2',
      routePath: '/features',
    }));
    expect(container.textContent).toContain('You are on the mailing list.');
  });

  test('handles duplicate mailing-list signups as already subscribed', async () => {
    submitMarketingMailingListSignup.mockResolvedValueOnce({
      alreadySubscribed: true,
      signup: { email: 'person@example.com' },
    });
    renderAt('/features');
    openMailingListModal();

    act(() => {
      setInputValue(container.querySelector('#marketing-v2-mailing-email'), 'person@example.com');
    });
    await submitMailingListForm();

    expect(container.textContent).toContain('You are already on the mailing list.');
  });

  test('shows mailing-list submit failures', async () => {
    submitMarketingMailingListSignup.mockRejectedValueOnce(new Error('Storage unavailable.'));
    renderAt('/features');
    openMailingListModal();

    act(() => {
      setInputValue(container.querySelector('#marketing-v2-mailing-email'), 'person@example.com');
    });
    await submitMailingListForm();

    expect(container.textContent).toContain('Storage unavailable.');
  });

  test('keeps the hero scan CTA without the removed start-mode boxes', () => {
    renderAt('/');

    expect(container.querySelector('#marketing-v2-home-title')?.textContent).toBe('Be the architect of your next build.');
    expect(container.querySelector('.marketing-v2-hero .marketing-scan-bar input')?.getAttribute('placeholder')).toBe('Try it now. Enter a URL to start');
    expect(container.querySelector('.marketing-v2-hero .marketing-scan-bar .scan-btn')?.disabled).toBe(true);
    expect(container.querySelector('.marketing-v2-background')).not.toBeNull();
    expect(container.querySelectorAll('.marketing-v2-bg-shape')).toHaveLength(126);
    expect(container.querySelectorAll('.marketing-v2-bg-structure')).toHaveLength(0);
    expect(container.querySelector('.marketing-v2-hero .marketing-scan-bar')).not.toBeNull();
    expect(container.querySelector('.marketing-v2-hero-product img')?.getAttribute('alt')).toContain('Vellic canvas');
    expect(container.textContent).toContain('Scan a URL, import a file, or build from scratch.');
    expect(container.textContent).toContain('Capture screenshots, trace flows, and mark findings.');
    expect(container.querySelector('.marketing-v2-start-modes')).toBeNull();
  });

  test('uses the updated mission and final scan CTA copy', () => {
    renderAt('/mission');

    expect(container.textContent).toContain('Because foundations matter');
    expect(container.textContent).toContain('Information architecture shapes how people find, understand, and act.');
    expect(container.textContent).toContain('Improve constantly with and for the people doing the work');

    renderAt('/');

    expect(container.textContent).toContain('Start planning your next site');
    expect(container.querySelector('.marketing-v2-final-cta .marketing-scan-bar input')?.getAttribute('placeholder')).toBe('Enter a URL to start');
  });

  test('switches competitor comparison groups', () => {
    renderAt('/features');

    expect(container.textContent).toContain('AI-ready handoff package');
    expect(container.textContent).not.toContain('Organized screenshot downloads');

    const screenshotTab = Array.from(container.querySelectorAll('.marketing-v2-comparison-tabs button'))
      .find((button) => button.textContent === 'Bulk screenshot');

    act(() => {
      screenshotTab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(screenshotTab.getAttribute('aria-selected')).toBe('true');
    expect(container.textContent).toContain('Organized screenshot downloads');
  });

  test('renders supplied product screenshot examples', () => {
    renderAt('/examples');

    expect(container.textContent).toContain('Raycast main site');
    expect(container.textContent).toContain('Anthropic full site');
    expect(container.querySelector('.marketing-v2-example__stats')).toBeNull();
    expect(container.querySelectorAll('.marketing-v2-example__actions .ui-btn--type-link')).toHaveLength(2);
    expect(container.textContent).toContain('Show me');
    expect(container.querySelectorAll('.marketing-v2-example img')).toHaveLength(2);
  });

  test('renders public pricing plans without the internal Solo plan', () => {
    renderAt('/pricing');

    ['Free', 'Pro', 'Studio', 'Agency'].forEach((plan) => {
      expect(container.textContent).toContain(plan);
    });
    ['$0', '$8', '$15', '$25'].forEach((price) => {
      expect(container.textContent).toContain(price);
    });
    expect(container.textContent).toContain('2 organized exports');
    expect(container.querySelectorAll('.marketing-v2-pricing-card__cta')).toHaveLength(4);
    expect(container.querySelectorAll('.marketing-v2-pricing-card__cta')[0].textContent).toContain('Get started');
    expect(container.textContent).not.toContain('Solo');
  });

  test('routes pricing CTAs to signup, no-card trial, or checkout instead of scan', () => {
    const openApp = jest.fn();
    renderAt('/pricing', jest.fn(), { onOpenApp: openApp });

    const buttons = Array.from(container.querySelectorAll('.marketing-v2-pricing-card__cta'));
    buttons.forEach((button) => {
      act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      });
    });

    const urls = openApp.mock.calls.map(([url]) => new URL(url));
    expect(urls).toHaveLength(4);
    expect(urls[0].searchParams.get('intent')).toBe('signup');
    expect(urls[1].searchParams.get('intent')).toBe('trial');
    expect(urls[1].searchParams.get('trialPlan')).toBe('pro');
    expect(urls[1].searchParams.has('billingPlan')).toBe(false);
    expect(urls[2].searchParams.get('intent')).toBe('checkout');
    expect(urls[2].searchParams.get('billingPlan')).toBe('studio');
    expect(urls[3].searchParams.get('intent')).toBe('checkout');
    expect(urls[3].searchParams.get('billingPlan')).toBe('agency');
    urls.forEach((url) => {
      expect(url.searchParams.get('intent')).not.toBe('scan');
    });
  });

  test('renders FAQ answers as closed accordions until opened', () => {
    renderAt('/faq');

    expect(container.textContent).toContain('What is Vellic?');
    expect(container.textContent).not.toContain('Vellic is a visual sitemap workspace for auditing');

    const firstQuestion = Array.from(container.querySelectorAll('.marketing-v2-faq-item button'))
      .find((button) => button.textContent.includes('What is Vellic?'));

    act(() => {
      firstQuestion.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(firstQuestion.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Vellic is a visual sitemap workspace for auditing');
  });

  test('opens contact forms for inquiries and support', () => {
    renderAt('/contact');

    expect(container.textContent).toContain('Need help? Want a demo? Have some feedback? Or just want to say Hello👋?');
    expect(container.textContent).toContain('Send a note to the right inbox and we will follow up ASAP.');
    expect(container.textContent).toContain('Inquiries & Feedback');
    expect(container.textContent).toContain('Product support');
    expect(container.textContent).not.toContain('Best fit');

    const contactButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Contact us'));
    const supportButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Get help'));

    expect(contactButton.className).toContain('ui-btn');
    expect(contactButton.className).toContain('ui-btn--type-secondary');
    expect(contactButton.className).toContain('ui-btn--style-brand');
    expect(contactButton.className).toContain('ui-btn--md');
    expect(contactButton.className).toContain('marketing-v2-contact-card__button');
    expect(supportButton.className).toContain('ui-btn');
    expect(supportButton.className).toContain('ui-btn--type-secondary');
    expect(supportButton.className).toContain('ui-btn--style-brand');
    expect(supportButton.className).toContain('ui-btn--md');
    expect(supportButton.className).toContain('marketing-v2-contact-card__button');

    act(() => {
      contactButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(container.textContent).toContain('Sends to hello@vellic.io.');
    expect(container.querySelector('#marketing-v2-contact-name')).not.toBeNull();
    expect(container.querySelector('#marketing-v2-contact-email')).not.toBeNull();
    expect(container.querySelector('#marketing-v2-contact-reason')).not.toBeNull();
    expect(container.querySelector('#marketing-v2-contact-message')).not.toBeNull();
  });

  test('submits inquiry contact forms to the backend and shows success', async () => {
    renderAt('/contact');
    openContactModal('Contact us');
    fillContactForm();

    await act(async () => {
      container.querySelector('#marketing-v2-contact-form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
    });

    expect(submitMarketingContact).toHaveBeenCalledWith(expect.objectContaining({
      targetKey: 'inquiries',
      name: 'Avery Test',
      email: 'avery@example.com',
      reason: 'Demo request',
      reasonDetail: 'Enterprise rollout',
      message: 'I would like to schedule a demo.',
    }));
    expect(container.textContent).toContain('Message sent');
    expect(container.textContent).toContain('We will follow up soon.');
    expect(container.querySelector('#marketing-v2-contact-form')).toBeNull();
    expect(container.querySelector('#marketing-v2-contact-name')).toBeNull();
    expect(container.textContent).not.toContain('Send message');

    const footerButtons = Array.from(container.querySelectorAll('.marketing-v2-modal-actions button'));
    expect(footerButtons).toHaveLength(1);
    expect(footerButtons[0].textContent).toContain('Close');
  });

  test('shows validation errors without submitting contact forms', async () => {
    renderAt('/contact');
    openContactModal('Get help');

    await act(async () => {
      container.querySelector('#marketing-v2-contact-form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
    });

    expect(submitMarketingContact).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Enter your name.');
    expect(container.textContent).toContain('Enter a valid email address.');
    expect(container.textContent).toContain('Enter a message.');
  });

  test('shows loading and send-failure states for contact forms', async () => {
    let rejectSubmit;
    submitMarketingContact.mockReturnValueOnce(new Promise((resolve, reject) => {
      rejectSubmit = reject;
    }));
    renderAt('/contact');
    openContactModal('Get help');
    fillContactForm({
      reason: 'Scan issue',
      message: 'A scan did not finish.',
    });

    await act(async () => {
      container.querySelector('#marketing-v2-contact-form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
    });

    expect(container.textContent).toContain('Sending');
    expect(submitMarketingContact).toHaveBeenCalledWith(expect.objectContaining({
      targetKey: 'support',
      reason: 'Scan issue',
      message: 'A scan did not finish.',
    }));

    await act(async () => {
      rejectSubmit(new Error('Email delivery is not configured.'));
    });

    expect(container.textContent).toContain('Email delivery is not configured.');
    expect(container.querySelector('#marketing-v2-contact-form')).not.toBeNull();
    expect(container.textContent).toContain('Send message');
  });
});

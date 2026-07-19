import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import { getBillingConfig, submitMarketingContact, submitMarketingMailingListSignup } from '../api';
import MarketingPreviewV2, {
  applyMarketingPreviewV2Metadata,
  buildMarketingPreviewV2JsonLd,
  getMarketingPreviewV2RobotsContent,
} from './MarketingPreviewV2';
import {
  MARKETING_PREVIEW_V2_META_DESCRIPTION,
  MARKETING_PREVIEW_V2_META_TITLE,
  MARKETING_PREVIEW_V2_SOCIAL_IMAGE_ALT,
  MARKETING_PREVIEW_V2_SOCIAL_IMAGE_URL,
  getMarketingPreviewV2SectionById,
} from './marketingPreviewV2Config';
import { parseCurrentRoute, ROUTE_SURFACES } from '../utils/appRoutes';
import vercelConfig from '../../vercel.json';

jest.mock('../api', () => ({
  getBillingConfig: jest.fn(),
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

function getHeadContent(selector) {
  return document.head.querySelector(selector)?.getAttribute('content');
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

  const getMailingListModal = () => container.querySelector('.marketing-v2-mailing-modal');

  const getMailingListModalButton = (label) => Array.from(
    getMailingListModal()?.querySelectorAll('button') || []
  ).find((candidate) => candidate.textContent.trim() === label);

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
    getBillingConfig.mockReturnValue(new Promise(() => {}));
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
    expect(container.textContent).toContain('Exports and handoff');
    expect(container.querySelector('.marketing-v2-comparison')).toBeNull();
    expect(container.textContent).not.toContain('Features comparison');
    expect(container.textContent).not.toContain('FlowMapp');
    expect(container.textContent).not.toContain('Slickplan');
    expect(container.textContent).not.toContain('Octopus.do');
    expect(container.textContent).not.toContain('DYNO Mapper');
    expect(container.textContent).not.toContain('mySitemapGenerator');
    expect(container.textContent).toContain('Collaboration');
    expect(container.querySelector('#marketing-v2-features')?.textContent).toContain('This is just the start!');
    expect(container.querySelector('.marketing-v2-feature-upcoming')).toBeNull();
    expect(container.querySelector('.marketing-v2-header__nav a[aria-current="page"]')?.textContent).toBe('Features');
    expect(document.title).toBe('Features | Vellic Website Audit Tool');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://vellic.io/features');
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }));
  });

  test('keeps visible copy intact while applying SEO metadata and schema', () => {
    renderAt('/');

    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelector('h1')?.textContent).toBe('Be the architect of your next build.');
    expect(container.textContent).toContain('Nearly 5k page site scan, 7 levels deep with top-of-page screenshots.');
    expect(container.textContent).toContain('What is Vellic?');
    expect(document.title).toBe(MARKETING_PREVIEW_V2_META_TITLE);
    expect(getHeadContent('meta[name="description"]')).toBe(MARKETING_PREVIEW_V2_META_DESCRIPTION);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://vellic.io/');
    expect(getHeadContent('meta[property="og:title"]')).toBe(MARKETING_PREVIEW_V2_META_TITLE);
    expect(getHeadContent('meta[property="og:description"]')).toBe(MARKETING_PREVIEW_V2_META_DESCRIPTION);
    expect(getHeadContent('meta[property="og:url"]')).toBe('https://vellic.io/');
    expect(getHeadContent('meta[property="og:type"]')).toBe('website');
    expect(getHeadContent('meta[property="og:site_name"]')).toBe('Vellic');
    expect(getHeadContent('meta[property="og:image"]')).toBe(MARKETING_PREVIEW_V2_SOCIAL_IMAGE_URL);
    expect(getHeadContent('meta[property="og:image:alt"]')).toBe(MARKETING_PREVIEW_V2_SOCIAL_IMAGE_ALT);
    expect(getHeadContent('meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(getHeadContent('meta[name="twitter:title"]')).toBe(MARKETING_PREVIEW_V2_META_TITLE);
    expect(getHeadContent('meta[name="twitter:description"]')).toBe(MARKETING_PREVIEW_V2_META_DESCRIPTION);
    expect(getHeadContent('meta[name="twitter:image"]')).toBe(MARKETING_PREVIEW_V2_SOCIAL_IMAGE_URL);
    expect(getHeadContent('meta[name="twitter:image:alt"]')).toBe(MARKETING_PREVIEW_V2_SOCIAL_IMAGE_ALT);

    const jsonLdScript = document.head.querySelector('#marketing-v2-jsonld[type="application/ld+json"]');
    const jsonLd = JSON.parse(jsonLdScript.textContent);
    const graphTypes = jsonLd['@graph'].map((entry) => entry['@type']);
    expect(graphTypes).toEqual(expect.arrayContaining([
      'Organization',
      'WebSite',
      'SoftwareApplication',
      'FAQPage',
    ]));
    expect(jsonLd['@graph'].find((entry) => entry['@type'] === 'SoftwareApplication').featureList).toEqual(
      expect.arrayContaining(['Visual sitemap generator', 'Website screenshot crawler'])
    );
    expect(jsonLd['@graph'].find((entry) => entry['@type'] === 'FAQPage').mainEntity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'What is Vellic?',
          acceptedAnswer: expect.objectContaining({
            text: expect.stringContaining('visual sitemap workspace'),
          }),
        }),
      ])
    );
  });

  test('applies staging noindex without blocking production metadata', () => {
    const homeSection = getMarketingPreviewV2SectionById('home');

    expect(getMarketingPreviewV2RobotsContent('staging.vellic.io')).toBe('noindex, nofollow');
    expect(getMarketingPreviewV2RobotsContent('mapmat-staging.vercel.app')).toBe('noindex, nofollow');
    expect(getMarketingPreviewV2RobotsContent('preview-123.vercel.app')).toBe('noindex, nofollow');
    expect(getMarketingPreviewV2RobotsContent('vellic.io')).toBe('');
    expect(getMarketingPreviewV2RobotsContent('www.vellic.io')).toBe('');

    applyMarketingPreviewV2Metadata(homeSection, { hostname: 'staging.vellic.io' });
    expect(getHeadContent('meta[name="robots"]')).toBe('noindex, nofollow');

    applyMarketingPreviewV2Metadata(homeSection, { hostname: 'vellic.io' });
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  test('builds valid route-aware JSON-LD', () => {
    const schema = buildMarketingPreviewV2JsonLd(getMarketingPreviewV2SectionById('examples'));
    const software = schema['@graph'].find((entry) => entry['@type'] === 'SoftwareApplication');

    expect(schema['@context']).toBe('https://schema.org');
    expect(software.url).toBe('https://vellic.io/examples');
    expect(software.description).toBe(MARKETING_PREVIEW_V2_META_DESCRIPTION);
    expect(software.offers).toEqual(expect.objectContaining({
      '@type': 'AggregateOffer',
      lowPrice: '0',
      priceCurrency: 'USD',
      url: 'https://vellic.io/pricing',
    }));
  });

  test('sets a staging-only X-Robots-Tag header rule', () => {
    const robotsRule = vercelConfig.headers.find((rule) => (
      rule.headers.some((header) => header.key === 'X-Robots-Tag')
    ));
    const hostCondition = robotsRule.has.find((condition) => condition.type === 'host');
    const hostMatcher = new RegExp(hostCondition.value);

    expect(robotsRule.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex, nofollow' });
    expect(hostMatcher.test('app-staging.vellic.io')).toBe(true);
    expect(hostMatcher.test('staging.vellic.io')).toBe(false);
    expect(hostMatcher.test('mapmat-staging.vercel.app')).toBe(true);
    expect(hostMatcher.test('preview-123.vercel.app')).toBe(true);
    expect(hostMatcher.test('vellic.io')).toBe(false);
    expect(hostMatcher.test('www.vellic.io')).toBe(false);
  });

  test('redirects the app subdomain root to the app surface', () => {
    const appRootRedirect = vercelConfig.redirects.find((rule) => (
      rule.source === '/'
      && rule.destination === '/app'
    ));
    const hostCondition = appRootRedirect.has.find((condition) => (
      condition.type === 'header'
      && condition.key === 'host'
    ));
    const hostMatcher = new RegExp(hostCondition.value);

    expect(appRootRedirect.permanent).toBe(false);
    expect(hostMatcher.test('app.vellic.io')).toBe(true);
    expect(hostMatcher.test('vellic.io')).toBe(false);
    expect(hostMatcher.test('www.vellic.io')).toBe(false);
    expect(hostMatcher.test('staging.vellic.io')).toBe(false);
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
    expect(getMailingListModal().querySelector('#marketing-v2-mailing-email')).toBeNull();
    expect(getMailingListModalButton('Join list')).toBeUndefined();
    expect(getMailingListModalButton('Close')).not.toBeUndefined();
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
    expect(getMailingListModal().querySelector('#marketing-v2-mailing-email')).toBeNull();
    expect(getMailingListModalButton('Join list')).toBeUndefined();
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

  test('resets mailing-list form after close and reopen', () => {
    renderAt('/features');
    openMailingListModal();

    act(() => {
      setInputValue(container.querySelector('#marketing-v2-mailing-email'), 'person@example.com');
    });

    act(() => {
      getMailingListModalButton('Close').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
      );
    });
    openMailingListModal();

    expect(container.querySelector('#marketing-v2-mailing-email').value).toBe('');
  });

  test('resets mailing-list form after successful submission and reopen', async () => {
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

    act(() => {
      getMailingListModalButton('Close').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
      );
    });
    openMailingListModal();

    expect(container.querySelector('#marketing-v2-mailing-email').value).toBe('');
    expect(getMailingListModal().textContent).not.toContain('You are on the mailing list.');
    expect(getMailingListModalButton('Join list')).not.toBeUndefined();
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

  test('keeps competitor comparison groups hidden when disabled', () => {
    renderAt('/features');

    expect(container.querySelector('.marketing-v2-comparison')).toBeNull();
    expect(container.querySelector('.marketing-v2-comparison__panel')).toBeNull();
    expect(container.textContent).not.toContain('Organized screenshot downloads');
  });

  test('renders supplied product screenshot examples', () => {
    const openApp = jest.fn();
    renderAt('/examples', jest.fn(), { onOpenApp: openApp });

    expect(container.textContent).toContain('Large site audit');
    expect(container.textContent).toContain('Nearly 5k page site scan, 7 levels deep with top-of-page screenshots.');
    expect(container.textContent).toContain('Medium site audit');
    expect(container.textContent).toContain('Over 1,100 page scan including subdomains, orphan pages, and full-page screenshots');
    expect(container.querySelector('.marketing-v2-example__stats')).toBeNull();
    expect(container.querySelectorAll('.marketing-v2-example__actions .ui-btn--type-link')).toHaveLength(2);
    expect(container.textContent).toContain('Show me');
    expect(container.querySelectorAll('.marketing-v2-example img')).toHaveLength(2);

    const exampleButtons = container.querySelectorAll('.marketing-v2-example__actions .ui-btn--type-link');
    act(() => {
      exampleButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      exampleButtons[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(openApp).toHaveBeenCalledWith('https://app-staging.vellic.io/share/wd5bpg', { target: '_blank' });
    expect(openApp).toHaveBeenCalledWith('https://app-staging.vellic.io/share/amh6jd', { target: '_blank' });
  });

  test('renders public pricing plans without the internal Solo plan', () => {
    renderAt('/pricing');

    ['Free', 'Pro', 'Studio', 'Agency'].forEach((plan) => {
      expect(container.textContent).toContain(plan);
    });
    ['$0', '$8', '$18', '$88'].forEach((price) => {
      expect(container.textContent).toContain(price);
    });
    ['$96/year', '$216/year', '$1,056/year'].forEach((price) => {
      expect(container.textContent).toContain(`(${price})`);
    });
    expect(container.textContent).toContain('5 downloads (XML and Index)');
    expect(container.textContent).toContain('25 screenshots incl.');
    expect(container.textContent).toContain('300 screenshots incl.');
    expect(container.textContent).toContain('1,000 screenshots incl.');
    expect(container.textContent).toContain('5,000 screenshots incl.');
    expect(container.querySelectorAll('.marketing-v2-pricing-card__cta')).toHaveLength(4);
    expect(container.querySelectorAll('.marketing-v2-pricing-card__actions')).toHaveLength(4);
    expect(container.querySelectorAll('.marketing-v2-pricing-card__screenshot-note')).toHaveLength(4);
    container.querySelectorAll('.marketing-v2-pricing-card__screenshot-note').forEach((note) => {
      expect(note.textContent).toBe('*additional screenshot credits can be purchased anytime');
    });
    expect(container.querySelectorAll('.marketing-v2-pricing-card__cta')[0].textContent).toContain('Get started');
    expect(container.querySelectorAll('.marketing-v2-pricing-card__cta')[1].textContent).toContain('Subscribe');
    expect(container.textContent).toContain('Billing cycle');
    expect(container.querySelector('.marketing-v2-pricing-cycle.marketing-v2-comparison-tabs')).not.toBeNull();
    expect(container.querySelectorAll('.marketing-v2-pricing-cycle .marketing-v2-comparison-tab.ui-btn')).toHaveLength(2);
    expect(container.querySelectorAll('.marketing-v2-pricing-card')[1].textContent).toContain('Pro$8/mo($96/year)');
    expect(container.querySelectorAll('.marketing-v2-pricing-card')[2].textContent).toContain('Studio$18/mo($216/year)');
    expect(container.querySelectorAll('.marketing-v2-pricing-card')[3].textContent).toContain('Agency$88/mo($1,056/year)');
    const yearlyButton = Array.from(container.querySelectorAll('.marketing-v2-pricing-cycle button'))
      .find((button) => button.textContent === 'Yearly');
    act(() => {
      yearlyButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(container.querySelectorAll('.marketing-v2-pricing-card')[1].textContent).toContain('Pro$72/year($6/mo)');
    expect(container.querySelectorAll('.marketing-v2-pricing-card')[2].textContent).toContain('Studio$144/year($12/mo)');
    expect(container.querySelectorAll('.marketing-v2-pricing-card')[3].textContent).toContain('Agency$960/year($80/mo)');
    expect(container.textContent).not.toContain('Solo');
  });

  test('renders pricing from the billing catalog when available', async () => {
    getBillingConfig.mockResolvedValue({
      enabled: true,
      plans: [
        {
          key: 'free',
          name: 'Free',
          paid: false,
          accent: 'green',
          description: 'Catalog free plan.',
          marketingCta: 'Get started',
          marketingAction: 'signup',
          featureHighlights: ['1 active project', '1,000 active pages total on account'],
          prices: {
            monthly: { formatted: '$0', suffix: '/mo', configured: true },
            yearly: { formatted: '$0', suffix: '/yr', configured: true },
          },
        },
        {
          key: 'pro',
          name: 'Pro',
          paid: true,
          accent: 'blue',
          description: 'Catalog pro plan.',
          marketingCta: 'Subscribe',
          marketingAction: 'checkout',
          featureHighlights: ['9 active projects', '9,000 active pages total on account'],
          prices: {
            monthly: { formatted: '$9', suffix: '/mo', configured: true },
            yearly: { formatted: '$90', suffix: '/yr', configured: true },
          },
        },
      ],
    });

    renderAt('/pricing');

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('$9');
    expect(container.textContent).toContain('($108/year)');
    expect(container.textContent).toContain('9 active projects');
    expect(container.textContent).toContain('Catalog pro plan.');
  });

  test('routes pricing CTAs to signup or checkout instead of scan', () => {
    const openApp = jest.fn();
    renderAt('/pricing', jest.fn(), { onOpenApp: openApp });

    const yearlyButton = Array.from(container.querySelectorAll('.marketing-v2-pricing-cycle button'))
      .find((button) => button.textContent === 'Yearly');
    act(() => {
      yearlyButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });

    const buttons = Array.from(container.querySelectorAll('.marketing-v2-pricing-card__cta'));
    buttons.forEach((button) => {
      act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      });
    });

    const urls = openApp.mock.calls.map(([url]) => new URL(url));
    expect(urls).toHaveLength(4);
    expect(urls[0].searchParams.get('intent')).toBe('signup');
    expect(urls[1].searchParams.get('intent')).toBe('checkout');
    expect(urls[1].searchParams.get('billingPlan')).toBe('pro');
    expect(urls[1].searchParams.get('billingCycle')).toBe('yearly');
    expect(urls[2].searchParams.get('intent')).toBe('checkout');
    expect(urls[2].searchParams.get('billingPlan')).toBe('studio');
    expect(urls[2].searchParams.get('billingCycle')).toBe('yearly');
    expect(urls[3].searchParams.get('intent')).toBe('checkout');
    expect(urls[3].searchParams.get('billingPlan')).toBe('agency');
    expect(urls[3].searchParams.get('billingCycle')).toBe('yearly');
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
    expect(container.textContent).toContain('Inquiries and feedback');
    expect(container.textContent).toContain('Product support');
    expect(container.textContent).not.toContain('Best fit');
    expect(container.textContent).not.toContain('hello@vellic.io');
    expect(container.textContent).not.toContain('support@vellic.io');

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

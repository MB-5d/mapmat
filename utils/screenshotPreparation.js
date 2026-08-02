const DEFAULT_SCREENSHOT_OBSTRUCTION_SETTLE_MS = 250;
const DEFAULT_SCREENSHOT_OBSTRUCTION_PASSES = 3;
const DEFAULT_SCREENSHOT_OBSTRUCTION_PASS_DELAY_MS = 100;

async function dismissScreenshotObstructions(page, {
  settleMs = DEFAULT_SCREENSHOT_OBSTRUCTION_SETTLE_MS,
  maxPasses = DEFAULT_SCREENSHOT_OBSTRUCTION_PASSES,
  passDelayMs = DEFAULT_SCREENSHOT_OBSTRUCTION_PASS_DELAY_MS,
} = {}) {
  if (!page || typeof page.frames !== 'function') {
    return { clickedCount: 0, hiddenCount: 0 };
  }

  let clickedCount = 0;
  let hiddenCount = 0;
  const passCount = Math.max(1, Number(maxPasses) || 1);
  for (let passIndex = 0; passIndex < passCount; passIndex += 1) {
    const frames = page.frames();
    for (const frame of frames) {
      const result = await frame.evaluate(() => {
      const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const isVisible = (element) => {
        if (!element || !(element instanceof Element)) return false;
        const style = window.getComputedStyle(element);
        if (
          style.display === 'none'
          || style.visibility === 'hidden'
          || Number(style.opacity || 1) === 0
        ) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 2 && rect.height > 2;
      };
      const blockedContext = /(?:sign[\s-]?in|log[\s-]?in|password|purchase|checkout|payment)/i;
      const consentContext = /(?:cookie|consent|privacy|gdpr|tracking|preference|onetrust|trustarc|quantcast|didomi|cookiebot)/i;
      const acceptAction = /^(?:accept(?: all| additional| optional| analytics)?(?: cookies)?|hide(?: this)? cookie message|i accept|allow(?: all)?(?: cookies)?|agree|i agree|consent|continue|got it|ok(?:ay)?)$/i;
      const nuisanceContext = /(?:newsletter|notifications?|promotion|special offer|sign up for updates|subscribe|subscription|sale ends)/i;
      const fixedNuisanceContext = /(?:sale ends|special offer|newsletter|sign up for updates|enable notifications|subscription offer|subscribe (?:now|today))/i;
      const knownConsentSelectors = [
        '#onetrust-accept-btn-handler',
        '#truste-consent-button',
        '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
        '[data-testid="cookie-policy-dialog-accept-button"]',
        '[data-testid="accept-all-cookies"]',
        '[data-cy="accept-all-cookies"]',
        'button[aria-label="Accept all cookies"]',
        'button[title="Accept all cookies"]',
      ];
      const knownConsentContainers = [
        '#onetrust-banner-sdk',
        '#onetrust-consent-sdk',
        '#truste-consent-track',
        '#CybotCookiebotDialog',
        '[data-testid="cookie-banner"]',
        '[data-testid="consent-banner"]',
        '.govuk-cookie-banner',
      ];
      let clicked = 0;
      let hidden = 0;

      const click = (element) => {
        if (!isVisible(element)) return false;
        element.click();
        clicked += 1;
        return true;
      };

      for (const selector of knownConsentSelectors) {
        const element = document.querySelector(selector);
        if (click(element)) break;
      }

      const candidates = Array.from(document.querySelectorAll(
        'button, [role="button"], input[type="button"], input[type="submit"]'
      ));
      for (const candidate of candidates) {
        if (!isVisible(candidate)) continue;
        const actionText = normalizeText(
          candidate.innerText
          || candidate.value
          || candidate.getAttribute('aria-label')
          || candidate.getAttribute('title')
        );
        if (!acceptAction.test(actionText)) continue;
        const container = candidate.closest(
          '[role="dialog"], dialog, [aria-modal="true"], [class*="banner"], [class*="Banner"], [class*="modal"], [class*="Modal"]'
        ) || candidate.parentElement;
        const contextText = normalizeText([
          container?.id,
          container?.className,
          container?.getAttribute?.('aria-label'),
          container?.innerText,
        ].join(' '));
        if (blockedContext.test(contextText) || !consentContext.test(contextText)) continue;
        if (click(candidate)) break;
      }

      const closeCandidates = Array.from(document.querySelectorAll(
        'button[aria-label], [role="button"][aria-label], button[title]'
      ));
      for (const candidate of closeCandidates) {
        if (!isVisible(candidate)) continue;
        const actionText = normalizeText(
          candidate.getAttribute('aria-label') || candidate.getAttribute('title')
        );
        if (!/^(?:close|dismiss|no thanks|not now)$/i.test(actionText)) continue;
        const container = candidate.closest(
          '[role="dialog"], dialog, [aria-modal="true"], [class*="popup"], [class*="Popup"], [class*="modal"], [class*="Modal"]'
        );
        const contextText = normalizeText([
          container?.id,
          container?.className,
          container?.getAttribute?.('aria-label'),
          container?.innerText,
        ].join(' '));
        if (
          !container
          || blockedContext.test(contextText)
          || (!consentContext.test(contextText) && !nuisanceContext.test(contextText))
        ) {
          continue;
        }
        if (click(candidate)) break;
      }

      knownConsentContainers.forEach((selector) => {
        document.querySelectorAll(selector).forEach((element) => {
          if (!isVisible(element)) return;
          element.style.setProperty('display', 'none', 'important');
          hidden += 1;
        });
      });

      document.querySelectorAll([
        '[role="dialog"]',
        '[aria-modal="true"]',
        '[class*="banner"]',
        '[class*="Banner"]',
        '[class*="popup"]',
        '[class*="Popup"]',
        '[class*="modal"]',
        '[class*="Modal"]',
        '[class*="overlay"]',
        '[class*="Overlay"]',
      ].join(', ')).forEach((element) => {
        if (!isVisible(element)) return;
        const style = window.getComputedStyle(element);
        if (!['fixed', 'sticky'].includes(style.position)) return;
        const contextText = normalizeText([
          element.id,
          element.className,
          element.getAttribute('aria-label'),
          element.innerText,
        ].join(' '));
        if (blockedContext.test(contextText) || !nuisanceContext.test(contextText)) return;
        element.style.setProperty('display', 'none', 'important');
        hidden += 1;
      });

      document.querySelectorAll('body *').forEach((element) => {
        if (!isVisible(element)) return;
        const style = window.getComputedStyle(element);
        if (!['fixed', 'sticky'].includes(style.position)) return;
        const contextText = normalizeText([
          element.id,
          element.className,
          element.getAttribute('aria-label'),
          element.innerText,
        ].join(' '));
        if (blockedContext.test(contextText) || !fixedNuisanceContext.test(contextText)) return;
        element.style.setProperty('display', 'none', 'important');
        hidden += 1;
      });

      return { clicked, hidden };
      }).catch(() => ({ clicked: 0, hidden: 0 }));
      clickedCount += Number(result?.clicked || 0);
      hiddenCount += Number(result?.hidden || 0);
    }
    if (
      passIndex < passCount - 1
      && passDelayMs > 0
      && typeof page.waitForTimeout === 'function'
    ) {
      await page.waitForTimeout(passDelayMs).catch(() => {});
    }
  }

  if (clickedCount > 0 && settleMs > 0 && typeof page.waitForTimeout === 'function') {
    await page.waitForTimeout(settleMs).catch(() => {});
  }
  return { clickedCount, hiddenCount };
}

module.exports = {
  DEFAULT_SCREENSHOT_OBSTRUCTION_PASSES,
  DEFAULT_SCREENSHOT_OBSTRUCTION_PASS_DELAY_MS,
  DEFAULT_SCREENSHOT_OBSTRUCTION_SETTLE_MS,
  dismissScreenshotObstructions,
};

const assert = require('assert');
const { chromium } = require('playwright');
const { dismissScreenshotObstructions } = require('../utils/screenshotPreparation');

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <main><h1>Article</h1></main>
      <div id="onetrust-consent-sdk">
        <div id="onetrust-banner-sdk">
          <p>We use cookies and tracking technologies.</p>
          <button id="onetrust-accept-btn-handler">Accept All</button>
        </div>
      </div>
      <div role="dialog" aria-label="Newsletter signup">
        <p>Sign up for our newsletter.</p>
        <button aria-label="Close">×</button>
      </div>
      <div role="dialog" aria-label="Privacy choices">
        <p>Choose whether to allow cookies and tracking.</p>
        <button id="generic-cookie-accept">Accept all cookies</button>
      </div>
      <div role="dialog" aria-label="Sign in">
        <p>Sign in with your password.</p>
        <button aria-label="Close" id="protected-close">×</button>
      </div>
      <div class="subscription-banner" style="position: fixed; bottom: 0">
        <p>Sale ends soon. Subscribe today.</p>
        <button>Subscribe</button>
      </div>
      <script>
        document.querySelector('#onetrust-accept-btn-handler').addEventListener('click', () => {
          document.querySelector('#onetrust-consent-sdk').remove();
        });
        document.querySelector('[aria-label="Newsletter signup"] button').addEventListener('click', (event) => {
          event.currentTarget.closest('[role="dialog"]').remove();
        });
        document.querySelector('#generic-cookie-accept').addEventListener('click', (event) => {
          event.currentTarget.closest('[role="dialog"]').remove();
        });
      </script>
    `);

    const result = await dismissScreenshotObstructions(page, { settleMs: 0 });
    assert.ok(result.clickedCount >= 3, 'cookie and newsletter controls should be dismissed');
    assert.equal(await page.locator('#onetrust-consent-sdk').count(), 0);
    assert.equal(await page.locator('[aria-label="Newsletter signup"]').count(), 0);
    assert.equal(await page.locator('[aria-label="Privacy choices"]').count(), 0);
    assert.equal(
      await page.locator('.subscription-banner').isVisible(),
      false,
      'fixed subscription promotions should be hidden'
    );
    assert.equal(await page.locator('#protected-close').count(), 1, 'authentication dialogs must remain untouched');
  } finally {
    await browser.close();
  }
  console.log('Screenshot preparation checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

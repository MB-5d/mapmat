const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { waitForAuthenticatedPageReady } = require('../utils/authenticatedPageReadiness');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const ready = options => waitForAuthenticatedPageReady(page, { timeoutMs: 3000, stableMs: 200, ...options });
  try {
    await page.setContent('<title>Dashboard</title><main><div role="progressbar">Loading...</div></main><script>setTimeout(()=>{document.title="Extra Editor"; document.querySelector("main").innerHTML="<h1>Extra Editor</h1><p>Private sandbox product content has loaded.</p>"},900)</script>');
    const start = Date.now(); await ready(); assert(Date.now() - start >= 850); assert.equal(await page.title(), 'Extra Editor');
    for (const body of [
      '<title>Dashboard</title><style>body{background:#f3f8fa}</style><div style="width:40px;height:40px;background:#eee"></div>',
      '<main><h1>Loading...</h1></main>',
      '<nav>Dashboard Products Settings Notifications</nav><main aria-busy="true"><h1>Product</h1><p>Previous product content must not be treated as current.</p></main>',
      '<script>window.privateData="Enough text in scripts must not count as visible page content"</script><div hidden><h1>Secret page</h1></div>',
    ]) {
      await page.setContent(body); await assert.rejects(ready({ timeoutMs: 500 }), error => error.code === 'scan_auth_content_not_ready');
    }
    await page.setContent('<h1>About</h1>'); await ready();
    await page.setContent('<form><input type="password"><button>Unlock</button></form>'); await ready();
    await page.setContent('<main aria-busy="true">Loading...</main>');
    let checks = 0; await assert.rejects(ready({ verifyAccess() { if (++checks > 1) throw Object.assign(Error('expired'), { code: 'scan_auth_expired' }); } }), error => error.code === 'scan_auth_expired');
    await page.setContent('<main><h1>Private report</h1></main><script>addEventListener("resize",()=>{document.querySelector("main").innerHTML="Loading..."; setTimeout(()=>document.querySelector("main").innerHTML="<h1>Report loaded after resize</h1>",700)},{once:true})</script>');
    await ready(); await page.setViewportSize({width:1100,height:800}); await ready(); assert.match(await page.locator('main').innerText(), /loaded after resize/);
    console.log('Passed: delayed SPA content, permanent loading, busy content, hidden/script-only shells, short pages, login forms, expiry during wait and resize loading.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

// Shared by authenticated verification, crawling and capture. HTTP 200 and a
// quiet network are insufficient for apps that render an empty loading shell.
function inspectRenderedContent() {
  const visible = element => {
    if (!element || element.closest('[hidden], [aria-hidden="true"]')) return false;
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
      && rect.width > 0 && rect.height > 0;
  };
  const root = [...document.querySelectorAll('main,[role="main"]')].find(visible) || document.body;
  if (!root) return { ready: false, signature: '' };
  const busy = root.matches('[aria-busy="true"]') || [...root.querySelectorAll('[aria-busy="true"],[role="progressbar"],[role="status"]')]
    .some(element => {
      if (!visible(element)) return false;
      const r = element.getBoundingClientRect();
      return r.left < innerWidth / 2 && r.right > innerWidth / 2
        && r.top < innerHeight / 2 && r.bottom > innerHeight / 2;
    });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = '', count = 0, node;
  while ((node = walker.nextNode()) && count++ < 5000 && text.length < 5000) {
    const parent = node.parentElement;
    if (!parent || parent.closest('script,style,noscript,template,nav,header,footer,aside,[role="navigation"]') || !visible(parent)) continue;
    text += ' ' + node.textContent;
  }
  text = text.replace(/\s+/g, ' ').trim();
  const loadingOnly = /^(?:(?:loading|please wait|just a moment|preparing|connecting)(?:\s|[.…!:-])*)+$/i.test(text);
  const heading = [...root.querySelectorAll('h1,h2,[role="heading"]')].some(el => visible(el) && el.textContent.trim().length >= 3);
  const image = [...root.querySelectorAll('img')].some(el => visible(el) && el.complete && el.naturalWidth >= 100 && el.getBoundingClientRect().width >= 100);
  // Return login forms promptly so the existing auth classifier can reject them.
  const login = [...root.querySelectorAll('input[type="password"]')].some(visible);
  const ready = !busy && !loadingOnly && (login || text.length >= 40 || (heading && text.length >= 3) || image);
  return { ready, signature: ready ? document.title + '|' + text.slice(0,3000) + '|' + image : '' };
}

async function waitForAuthenticatedPageReady(page, { verifyAccess = () => {}, timeoutMs = 20000, stableMs = 600 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let signature = '', stableSince = 0;
  while (Date.now() < deadline) {
    await verifyAccess();
    const state = await page.evaluate(inspectRenderedContent);
    if (state.ready) {
      if (state.signature !== signature) { signature = state.signature; stableSince = Date.now(); }
      if (Date.now() - stableSince >= stableMs) { await verifyAccess(); return; }
    } else { signature = ''; stableSince = 0; }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  await verifyAccess();
  throw Object.assign(new Error('The protected page is still loading or has no visible content. Try again after the site finishes loading.'),
    { code: 'scan_auth_content_not_ready', captureReason: 'content_not_ready', captureStage: 'page_readiness' });
}
module.exports = { inspectRenderedContent, waitForAuthenticatedPageReady };

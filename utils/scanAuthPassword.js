function scanPasswordError(code, message) {
  return Object.assign(new Error(message), { code });
}

async function hasSimplePasswordGate(page, origin = null) {
  if (origin && new URL(page.url()).origin !== origin) return false;
  return page.evaluate(() => {
    const visible = (element) => !element.disabled && element.getClientRects().length > 0;
    const passwords = Array.from(document.querySelectorAll('input[type="password"]')).filter(visible);
    const field = passwords[0];
    if (passwords.length !== 1 || !field.form) return false;
    const fields = Array.from(field.form.querySelectorAll('input, textarea, select'))
      .filter((element) => !['hidden', 'submit', 'button', 'reset'].includes(element.type) && visible(element));
    const action = field.form.getAttribute('action') || location.href;
    const nativePost = field.form.method.toLowerCase() === 'post';
    const squarespaceGate = !field.form.hasAttribute('action') && field.form.matches('.password-form')
      && window.Static?.SQUARESPACE_CONTEXT?.pageType === 103;
    return fields.length === 1 && fields[0] === field
      && (nativePost || squarespaceGate)
      && new URL(action, location.href).origin === location.origin
      && !field.form.querySelector('[formaction], [formtarget]');
  }).catch(() => false);
}

async function submitSimpleScanPassword(page, password, origin) {
  if (!(await hasSimplePasswordGate(page, origin))) {
    throw scanPasswordError('scan_auth_browser_required', 'This site needs interactive sign-in, which is not available in this beta.');
  }
  const field = page.locator('input[type="password"]:visible').first();
  try {
    // A previous rejection must not be mistaken for the result of this attempt.
    await field.evaluate((element) => {
      element.removeAttribute('aria-invalid');
      element.form.querySelectorAll('.error-message, [role="alert"], .field-error')
        .forEach((error) => { error.textContent = ''; });
    });
    await field.fill(password);
    await field.press('Enter');
    // JavaScript password gates can finish well after the key event returns.
    const outcome = await page.waitForFunction(() => {
      const visible = (element) => element.getClientRects().length > 0;
      const gate = Array.from(document.querySelectorAll('input[type="password"]')).find(visible);
      if (!gate) return 'unlocked';
      const errors = gate.form?.querySelectorAll('.error-message, [role="alert"], .field-error') || [];
      if (gate.getAttribute('aria-invalid') === 'true'
        || Array.from(errors).some((element) => visible(element) && element.textContent.trim())) return 'rejected';
      return false;
    }, null, { timeout: 12000 }).then((handle) => handle.jsonValue());
    if (outcome === 'rejected') {
      throw scanPasswordError('scan_auth_password_rejected', 'This site did not accept the password. Check it and try again.');
    }
    if (new URL(page.url()).origin !== origin) {
      throw scanPasswordError('scan_auth_not_reusable', 'Sign-in moved to another site. This beta cannot reuse that login.');
    }
    const response = await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    if (!response || response.status() >= 400 || await hasSimplePasswordGate(page, origin)) {
      throw scanPasswordError('scan_auth_not_reusable', 'The page opened, but the site did not keep this login. Continue without login for now.');
    }
    return response;
  } catch (error) {
    await field.fill('', { timeout: 500 }).catch(() => {});
    if (error.code?.startsWith('scan_auth_')) throw error;
    throw scanPasswordError('scan_auth_login_timeout', 'The site did not finish signing in. Try again or continue without login.');
  }
}

module.exports = { hasSimplePasswordGate, submitSimpleScanPassword };

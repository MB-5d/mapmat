# Authenticated Scan Staging Beta

Staging test URL: https://app-staging.vellic.io/app

Use only a site you are authorized to access. This beta supports single-password page gates. Enter one password per scan; Vellic temporarily reuses a successfully verified password on matching gates at the same origin, including pages discovered during the scan. Passwords and login state are removed at completion, cancellation, failure, or expiry. Sign in again for each rescan.

## Test steps

1. Scan a site with separately protected pages using the same password. The quick check inspects up to 25 pages, so its count is a minimum. Choose **Enter password**. Confirm the dialog uses the standard small format, has no individual page links, and offers show/hide password. Choose **Unlock and scan**. Verify protected pages are scanned without re-entering the password.
2. Repeat the scan with **Scan without login**. Gated pages should remain labeled as requiring login; the scan should not claim full access.
3. Rescan the authenticated map. Vellic should ask for a fresh login. Confirm that one login again applies to the entire rescan.
4. Try a site with one page that stays locked. The scan should show partial results and identify the page still requiring login.
5. Cancel a login or scan, then start again. The canceled session must not be reusable. Restarting the backend during a scan must fail the job and require a new login.

6. Enter an incorrect password. A field error should explain that the site rejected it, retain the entry, and allow correction. A timed-out or non-reusable login must show a different message. Close the dialog during sign-in; the delayed response must not start a scan.

Browser/Google/SSO sign-in is deferred from this beta. Its implementation is preserved, but the screenshot and "Type" controls are hidden. Unsupported sign-in shows a clear explanation and allows continuing without login. A replacement browser interaction requires product/design review.

## Beta limits

- Authenticated pages are mapped, but new thumbnails and full-page screenshots are not captured in this beta. An existing preview from before a rescan is kept and labeled as not updated.
- The temporary login expires after 30 minutes. Long-running scans or a web-instance restart require another login.
- Reuse is limited to visible single-password gates using native POST forms or the recognized Squarespace JavaScript password form, with same-origin submission. Native GET forms, account logins, external form actions, and other origins never receive the site password automatically. Each matching URL receives at most one automatic attempt; pages using a different password remain labeled as requiring login. Unlinked pages cannot be found by the quick check.
- Password submission waits for the page to unlock and reloads it to confirm access is reusable. Merely displaying content is not sufficient. The representative fixture covers delayed JavaScript forms, twelve page-specific cookies, newly discovered pages, rejected passwords, non-reusable login, cancellation, and backend restart. A real password on mattbraun.design has not been tested by the agent.
- The login browser uses a credentialed local proxy that checks destinations and pins public IPv4 addresses, plus request/WebSocket filtering. It is not an operating-system network sandbox. Do not enable this feature in production without a separate security review.

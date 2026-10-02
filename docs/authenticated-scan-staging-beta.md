# Authenticated Scan Staging Beta

Staging test URL: https://app-staging.vellic.io/app

Use only a site or app you are authorized to access. This beta uses one temporary browser login for the entire scan. The login is removed at completion, cancellation, failure, or expiry. Sign in again for each rescan.

## Test steps

1. Scan a site with at least two pages behind the same login. The quick check inspects up to 25 pages, so its count is a minimum, not a complete site-wide count. Choose **Log in to this site**. A single-field password gate opens as a normal password field; other sign-in flows use the Vellic browser. Confirm that the protected pages are accessible, then continue.
2. Repeat the scan with **Continue without login**. Gated pages should remain labeled as requiring login; the scan should not claim full access.
3. Rescan the authenticated map. Vellic should ask for a fresh login. Confirm that one login again applies to the entire rescan.
4. Try a site with one page that stays locked. The scan should show partial results and identify the page still requiring login.
5. Cancel a login or scan, then start again. The canceled session must not be reusable. Restarting the backend during a scan must fail the job and require a new login.

Google and other SSO logins may require extra verification or refuse automated browsers. A provider refusal is not a Vellic login failure; use **Continue without login** and record the site and message shown.

## Beta limits

- Authenticated pages are mapped, but new thumbnails and full-page screenshots are not captured in this beta. An existing preview from before a rescan is kept and labeled as not updated.
- The temporary login expires after 30 minutes. Long-running scans or a web-instance restart require another login.
- The browser session is shared across the scan, but separately protected pages may use different passwords or page-specific access. A page still locked after the login remains labeled as requiring login. Unlinked pages cannot be found by the quick check.
- The login browser uses a credentialed local proxy that checks destinations and pins public IPv4 addresses, plus request/WebSocket filtering. It is not an operating-system network sandbox. Do not enable this feature in production without a separate security review.

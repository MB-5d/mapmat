# Authenticated Scan Staging Beta

Target staging test URL: https://app-staging.vellic.io/app

The single-password beta is enabled in staging. Production remains unchanged and authenticated scanning remains disabled there.

Use only a site you are authorized to access. This beta supports single-password page gates. Enter one password per scan; Vellic temporarily reuses a successfully verified password on matching gates at the same origin, including pages discovered during the scan. Passwords and login state are removed at completion, cancellation, failure, or expiry. Sign in again for each rescan.

## Test steps

1. Scan a site with separately protected pages using the same password. The quick check inspects up to 25 pages, so its count is a minimum. Choose **Enter password**. Confirm the dialog uses the standard small format, has no individual page links, and offers show/hide password. Choose **Unlock and scan**. Verify protected pages are scanned without re-entering the password.
2. Repeat the scan with **Scan without login**. Gated pages should remain labeled as requiring login; the scan should not claim full access.
3. Open a saved authenticated map, then choose **Images → Rescan with password**. Vellic should ask for a fresh password and create an updated draft copy with existing edits preserved. Save the draft as a new map; the saved original remains unchanged. Include thumbnails to replace old private previews.
4. Try a site with one page that stays locked. The scan should show partial results and identify the page still requiring login.
5. Cancel a login or scan, then start again. The canceled session must not be reusable. Restarting the backend during a scan must fail the job and require a new login.

6. Enter an incorrect password. A field error should explain that the site rejected it, retain the entry, and allow correction. A timed-out or non-reusable login must show a different message. Close the dialog during sign-in; the delayed response must not start a scan.
7. On a capped account, acknowledge the scan limit once. Neither unlocking nor continuing without login should repeat that warning. An unrestricted Admin account can test the password flow independently of plan limits.

8. Test a mixed site with an account-login page before a supported password page. The password flow must select the supported gate and leave account forms untouched.
9. Test a precheck failure. The dialog must wait for **Retry check** or **Scan without login**, with no silent scan. A capped account should perform the auth check only after acknowledging its page limit.
10. Test as a guest and with the beta disabled. Guests see an unchecked, disabled authenticated option with a sign-in explanation. With the frontend flag off the option is hidden and no auth requests are made.
11. Use Tab, Shift+Tab, and Escape in the password dialog. Focus starts inside, moves to the password field, stays inside the dialog, and returns when it closes. Repeat on a supported tablet viewport.

Browser/Google/SSO sign-in is deferred from this beta. Its implementation is preserved, but the screenshot and "Type" controls are hidden. Unsupported sign-in shows a clear explanation and allows continuing without login. A replacement browser interaction requires product/design review.

## Beta limits

- Mapping works without images. **Include private thumbnails** is off by default and explains the cost: one screenshot credit per captured page, including public pages, up to 100 pages within the available allowance. Missing private storage or zero screenshot credits falls back to mapping with an explanatory warning. Full-page capture is available only to backend validation, not the beta UI.
- New thumbnails appear immediately and are current. An older preview preserved through a map-only rescan is labeled as not updated. Private images are owner-only and expire after 24 hours; shared/collaborator delivery and durable previews are not included.
- The temporary login expires after 30 minutes. An exact-deadline timer closes the login and active scan contexts; page fetches also check expiry before using credentials. An expired scan fails with a fresh-login message instead of publishing a successful result. A web-instance restart also requires another login.
- Reuse is limited to visible single-password gates using native POST forms or the recognized Squarespace JavaScript password form, with same-origin submission. Native GET forms, account logins, external form actions, and other origins never receive the site password automatically. Rejected automatic attempts are not repeated; a successfully verified password may be reapplied if the site drops that page's access. Unlinked pages cannot be found by the quick check.
- Password submission waits for the page to unlock and reloads it to confirm access is reusable. Merely displaying content is not sufficient. Unlock requests are serialized within one temporary session so sites that replace a shared access cookie cannot overwrite parallel unlocks; normal page fetching stays parallel. The representative fixture covers delayed JavaScript forms, twelve pages sharing one cumulative access cookie, newly discovered pages, rejected passwords, non-reusable login, cancellation, and backend restart.
- A user-authorized live-site check on mattbraun.design reproduced lost access after successful sample verification. After the fix, all returned protected pages, including Back to College and Building Icons, returned HTTP 200 with no login-required labels. Some independently broken site links still return 404; this is not a guarantee that every possible page exists or is discoverable. The credential was supplied in memory and is not included in test files or output.
- The login browser uses a credentialed local proxy that checks destinations and pins public IPv4 addresses, plus request/WebSocket filtering. It is not an operating-system network sandbox. Do not enable this feature in production without a separate security review.

## Checks before staging deployment

Run `npm run check:backend`, `npm run check:backend:postgres`, `npm run check:scan-auth-session`, `npm run check:private-scan-capture`, and frontend tests/builds with `REACT_APP_AUTHENTICATED_SCAN_ENABLED=true` and `false`. The session fixture includes mixed-gate selection, zero-credit and missing-key map fallback, and ordinary scanning with the backend flag off.

After an approved staging deployment, verify the same flows on an authorized real site, private R2 persistence across restart, and the full temporary-login expiry lifecycle. Local fixtures and cross-origin browser tests do not establish those provider/runtime results. Keep production flags off.

## Local validation — 2026-11-06

- Frontend: 627 tests passed with the beta enabled; 619 passed with it disabled. The opposite-mode tests are intentionally skipped. Production builds passed in both modes.
- Backend and Postgres-mode boundary checks passed. This does not claim a live Postgres integration run; database-dependent checks without `DATABASE_URL` retain their explicit skips.
- Auth session fixtures passed, including mixed gates, password reuse/retry, cancellation/restart, zero credits, missing storage, and a regular scan with the backend flag disabled.
- Private-image HTTP, encryption, ownership, public-route exclusion, and expiry-boundary checks passed.
- Local browser checks passed for map-only scans, optional thumbnails, immediate current previews, save/reopen, fresh-login draft refresh, precheck retry/cancel, guest restrictions, keyboard containment, and supported tablet layout. With the frontend flag off, signed-in and guest public scans passed without auth requests.

Staging and production were not changed by this validation.

## Staging hardening — 2026-11-07

- Missing/structural parent pages and HTTP errors retain their own preview labels, including saved maps with older private-preview flags.
- Rescans that keep an older private image also keep its private-delivery/expiry metadata and mark it **Not updated by this scan**. Fresh private images replace old image variants rather than mixing different expiry periods. The saved original is unchanged.
- Whole-site sibling order now prioritizes the parent's navigation links, then content links in document order. A synthetic parent takes the position of its first linked descendant. XML sitemap order is a fallback for unlinked pages; timestamps, tags, title sorting, and response speed do not override known link order. This applies to both ordinary and authenticated whole-site scans. Existing focused-scan numbering is preserved. CSS/masonry visual positions may differ from document order.
- With authenticated scanning enabled, the web service sweeps private image storage on startup and every minute. Each pass checks at most 200 objects with five concurrent header reads, carries a pagination cursor between passes, and only deletes exact private-image filenames with expired headers. Larger backlogs take multiple passes. It works with local storage and R2, retries failures on subsequent passes, and does not depend on a user requesting an expired image. Public screenshots and unexpired private images are untouched. Provider failures are logged without credentials or image content.

Checks:

- `npm run check:scan-page-order`: real ordinary/authenticated crawler checks with reversed sitemap entries, delayed responses, and a nested project branch.
- `npm run check:private-scan-capture`: delivery/encryption plus cleanup boundary, pagination, restart, retry, and provider-error checks.
- `npm run check:scan-auth:active-expiry`: controlled real-time five-minute active-scan expiry check (the minimum supported lifetime).
- `SCAN_AUTH_EXPIRY_TEST_TTL_MS=1800000 SCAN_AUTH_EXPIRY_TEST_CAPTURE=true npm run check:scan-auth:active-expiry`: the same active scan through the default 30-minute deadline, with private thumbnails requested. No production configuration changes are needed.

The controlled expiry fixture tests the actual backend/browser process locally. Live staging cloud cleanup and deployed UI checks must be recorded separately. Google/account/MFA flows and the independent production security review remain outside this beta.

# Local browser-helper trial

Isolated research on `codex/auth-login-compatibility-prototype`. Do not deploy this branch or enable the helper in staging/production.

## Current evidence

- Policy/lifecycle tests passed: exact target, blocked identity-provider hosts, bounded snapshots, host-only cookie narrowing, local-only runtime, five-minute pairing expiry, cancellation, replay, and cancellation while importing.
- Backend integration passed with an independently signed-in fixture (no cooperative Vellic bridge): standalone password/email-code login, helper import, signed-out comparison, four protected pages, private captures, anonymous image denial, cancellation, replay rejection, and session removal after scanning.
- Frontend build, 56 focused UI tests and full backend checks passed during implementation. A large-bundle warning remains.
- Manual local UI check passed: the helper pairing code appears, attempting to continue before import shows a specific incomplete-login message, and closing the dialog cancels the pairing. This used a public example URL only and did not export a real session.
- The user approved loading the helper into Chrome and transferring the GitHub session to local Vellic. Both an existing-password session and a fresh Google sign-in session passed through the real Chrome helper: signed-out 404 versus signed-in access, exactly four private GitHub test pages, four private captures, no failures or skips. Anonymous image requests returned 401, owner requests returned 200, and each imported session returned 404 after scan completion. The helper confirmed removal of temporary site access. **Not ready for staging:** a real email/second-factor challenge through the generic helper remains unconfirmed, as do the hosted deployment gates below. Earlier email results in `../protected-site/` used a cooperative site and are not generic-helper evidence.

## Real-site trial in progress

The user does not have Notion, so the trial uses their existing GitHub account instead. A separate private repository with four dummy page folders was created at `https://github.com/MB-5d/vellic-auth-scan-test/tree/main/test-pages`. The project repository is not a test target. The first trial used the existing password. After explicit approval to sign out of MB-5d in Chrome, GitHub was signed out, its **Continue with Google** flow opened, and the user confirmed completing Google sign-in. The private repository was accessible afterward, and a new helper pairing and scan passed all four pages and image/session checks. The user confirmed that no additional verification was requested, so this is not 2FA evidence. Evidence is local at `/private/tmp/vellic-github-google-helper-evidence.json` and `/private/tmp/vellic-google-helper-map.png`; neither contains session credentials.

Helper verification now recognizes signed-out 404 responses as a possible hidden private resource, while still requiring active content at the same URL after import. Public 200 responses, challenge/limit responses and server errors do not satisfy the signed-out baseline. This change is local to the helper verification path.

Imported sessions restrict top-level document navigation to the selected URL path and its descendants, and skip focused-scan parent inspection. Policy tests, the four-page backend integration, and backend regression checks passed with this restriction. Assets and API requests still use the existing network guard; this is a navigation boundary, not page-level credential isolation.

The real trial exposed and fixed three issues locally:
- Chrome destroyed the toolbar popup during its permission prompt. The helper now opens a persistent connection window bound to the clicked tab. It no longer requests `activeTab`; it reads the source URL only after the exact-site optional grant and verifies that URL before reading cookies. Successful transfer is reported only after checking that the grant was removed.
- Stylesheet `data-href` identifiers were incorrectly discovered as pages. Non-navigation style/script/metadata elements are excluded from data-attribute discovery.
- Inferred structural ancestors were incorrectly queued for private screenshots. They are excluded from capture, retaining their children. The real scan then produced four captures, zero failures, and zero skips. The local integration fixture now covers stylesheet identifiers and structural ancestor capture, and the full backend checks passed again.

## Install for an approved local trial

1. Load `prototype/browser-helper/extension` as an unpacked extension in normal Chrome. Its stable ID is `chfjcbfapoiglecheoijdnbclmepcobe`. Installation and per-site access require the user's approval.
2. Use the supported Node runtime and run `NODE_USE_SYSTEM_CA=1 node prototype/browser-helper/run.cjs`. This creates a separate local database and random local account in `/private/tmp/vellic-browser-helper-live/`. Account credentials are in `account.json` (0600). No deployed credentials/configuration are used.
3. From `frontend/`, run `REACT_APP_SCAN_AUTH_BROWSER_HELPER=true REACT_APP_AUTHENTICATED_SCAN_ENABLED=true REACT_APP_API_BASE=http://127.0.0.1:4349 REACT_APP_APP_ONLY_MODE=true npm start -- --host 127.0.0.1 --port 5179 --strictPort`.
4. In http://127.0.0.1:5179/app, sign into the synthetic local account and scan the chosen private test-page URL with Authenticated pages on. Select **Connect browser helper**.
5. Sign into that target site in normal Chrome, completing Google/email/2FA there. On the protected page, open **Vellic Local Scan Helper**, paste the pairing code, review the target/destination, and explicitly allow the connection and exact-site Chrome permission. Local storage is optional and off by default.
6. Return to local Vellic and select **Use this login**. Vellic checks both signed-out and imported-session access before scanning. If access cannot be established, it reports a failure instead of treating a public page as success.

The extension can only send requests to the fixed loopback backend. It has no general browsing-history permission, no automatic content scripts, no remotely loaded code, and no persistent cookie/token storage. It reads cookies applicable to the selected tab URL only; optional local storage reads the top frame at the exact selected origin. Cookies are narrowed to that host. The helper excludes Google and common identity-provider origins.

Optional site permissions are removed after each attempt; the real helper displayed the verified removal result. A background alarm also revokes them after 30 seconds if the connection window closes, and on browser startup. Pairing tokens are 256-bit, stored hashed server-side, single-use for import, owner-bound to the Vellic scan, and unusable after cancellation/expiry. Snapshots stay in memory. Closing the scan dialog or finishing the scan discards server state. The existing scan lifetime and network guards remain active; the real-site launcher blocks private-network targets.

## Limits and remaining gates

- A site's session may authorize more account data than the selected URL. Use a disposable test workspace/account and explicitly approve the target before copying its session. No claim of page-level credential isolation is made.
- Cookies and optional localStorage only. IndexedDB, tab/sessionStorage, partitioned cookies, device/IP binding, and nonportable credentials may prevent access. The helper does not bypass those restrictions.
- Host/path-scoped cookies outside the selected page and cross-origin app authentication are excluded. The UI must not claim universal login compatibility.
- Signed-out SPA shells may not be recognized by the current classifier; fail closed and record a compatibility blocker.
- Real email/2FA and Chrome permission-denial/interrupted-window cleanup remain release gates. Google sign-in, successful transfer, and immediate cleanup were verified on GitHub, along with protected content and image access controls. A scanner running locally does not establish portability to a cloud scanner/IP.
- Production packaging, HTTPS pairing transport, published extension distribution, hosted origin/extension allowlisting and deployment review are intentionally pending. Local-only guards refuse hosted execution.
- Keep the separate local OAuth client from the earlier test unchanged. The generic helper does not use that client or request Google credentials.

## Checks

### Standalone real-email trial

After stopping the real-site launcher, use `NODE_USE_SYSTEM_CA=1 PROTOTYPE_CONFIG=/private/tmp/vellic-protected-site-config.json node prototype/browser-helper/run-email.cjs`. This reuses only the existing email delivery settings, not the Google OAuth client. It creates a separate local account/database under `/private/tmp/vellic-browser-helper-email-live/` and enables the controlled loopback fixture. Keep this launcher isolated; it is not the real-site launcher's private-network policy.

Open `http://localhost:4399/login?standalone=1` in normal Chrome. The user enters their email and real emailed code with the displayed synthetic test password. The site only sets its own browser session; it does not complete a Vellic pairing. Then scan `http://localhost:4399/members` in local Vellic, connect the generic browser helper on the protected page, and complete the scan. Real email delivery through this controlled site is distinct from a third-party site's MFA compatibility. Live verification is pending.

```sh
node prototype/browser-helper/check.cjs
node prototype/browser-helper/check-scan.cjs
npm run check:backend
npm run check:frontend-build
```

Stop live local servers before `check-scan.cjs` (ports 4349/4399). It uses synthetic credentials and a controlled inbox, then deletes its temporary database and captures. It does not drive or prove Chrome extension APIs.

Official references consulted: [cookies](https://developer.chrome.com/docs/extensions/reference/api/cookies), [optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions), [script injection](https://developer.chrome.com/docs/extensions/reference/api/scripting), and [unpacked installation](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world).

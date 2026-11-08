# Local protected-site scan trial

This isolated follow-up connects a four-page protected test site to the real local Vellic UI and scanner. It is research, not a deployable login feature. Staging and production must stay unchanged.

## Boundaries

- Site: `http://localhost:4399/`; local API: `http://127.0.0.1:4349`; local UI: `http://127.0.0.1:5179/app`.
- The backend bridge refuses to start outside `NODE_ENV=test`, a loopback bind, and a non-hosted environment. It is off unless `SCAN_AUTH_LOCAL_PROTOTYPE=true`.
- The UI extension requires `REACT_APP_SCAN_AUTH_LOCAL_PROTOTYPE=true`; external sign-in and URL validation accept only the fixed test origin when the UI is on localhost.
- The site explicitly grants its own temporary session to Vellic using a one-use grant, a per-run bridge key, and a random pairing token. Google cookies, credentials, and tokens are never transferred to the scanner. Google identity tokens are verified and discarded.
- Google authorization uses a separately approved local OAuth client, basic `openid email` scope, PKCE, state and nonce. Its callback is `http://localhost:4399/google/callback`. Existing hosted clients are unchanged.
- Password plus email-code verification uses a displayed synthetic test password. Never enter a personal password. Email codes expire after five minutes, pairing after ten minutes, and site sessions after fifteen minutes.
- A separate SQLite database, image directory and random synthetic Vellic account are created under `/private/tmp`. No deployed database is used.

## Run

Use Node 24.18 or the repository's compatible runtime and its installed dependencies.

```sh
# Automated trial; controlled inbox, no real email or Google interaction.
node prototype/protected-site/check-scan.cjs

# Live trial. PROTOTYPE_CONFIG points to a private 0600 JSON file outside Git.
NODE_USE_SYSTEM_CA=1 PROTOTYPE_CONFIG=/private/tmp/vellic-protected-site-config.json node prototype/protected-site/run.cjs

# Separate terminal, from frontend/:
REACT_APP_SCAN_AUTH_LOCAL_PROTOTYPE=true REACT_APP_AUTHENTICATED_SCAN_ENABLED=true REACT_APP_API_BASE=http://127.0.0.1:4349 REACT_APP_APP_ONLY_MODE=true npm start -- --host 127.0.0.1 --port 5179 --strictPort
```

Config fields: `google.clientId`, `google.clientSecret`, `resendKey`, `emailFrom`. Do not commit the config, account file, browser state, codes, tokens, private captures or databases. The live launcher writes its synthetic local Vellic account to `/private/tmp/vellic-protected-site-live/account.json` with owner-only permissions.

In local Vellic, scan the site root with Authenticated pages enabled. Choose **Sign in to test site**, open the paired link in normal Chrome, complete Google or password/email verification, return to Vellic and choose **Use this login**. Optional private thumbnails use the existing protected capture path.

## Evidence, November 8, 2026

The automated real-backend trial passed: signed-out scan detects login pages; premature completion, forged bridge requests, wrong password/code and replay are rejected; verified login scans all four protected pages; four private thumbnails are captured; anonymous image access is denied and owner access succeeds; the Vellic login session is removed after the scan. Email delivery in this test is a controlled inbox, not real mail.

Live Google sign-in passed after the user completed Google's account/consent flow in normal Chrome. Choosing **Use this login** in the local Vellic UI completed a five-page map (one public landing page and four protected pages), with five thumbnails. The follow-up read-only check confirmed HTTP 200 and private thumbnails for every protected page, anonymous image requests rejected with 401, and owner access accepted with 200. This did not force a fresh Google second-factor challenge.

Real password-plus-email verification also passed. The user entered their email, received the real verification code, and completed the code form in Chrome. **Use this login** then produced the same complete five-page map in Vellic. The read-only check again verified all four protected pages returned HTTP 200, all four had private thumbnails, anonymous image requests returned 401, and owner requests returned 200. The Google and email scans were separate Vellic authentication sessions.

Validation also passed: 56 focused frontend tests, the frontend production build, the full backend check suite (with local port access), and `git diff --check`. Build output retained the existing large-bundle warning.

`node prototype/protected-site/check-live-result.cjs` checks the latest completed local UI scan against its isolated database and image API without exposing session credentials.

## What this proves and does not prove

This tests provider login followed by the existing Vellic verification, scan and private-image pipeline on a cooperative test site. It does **not** establish that arbitrary Google/2FA sites work without a browser helper: other sites do not implement this bridge. Those require a separately designed target-site session handoff, in-browser scan or compatible cloud-browser approach. Provider challenges, passkeys, browser-bound sessions and nonportable storage still need separate compatibility evidence.

Stop both local processes when finished. Keep the experiment off staging and production. Local client removal, if desired later, is separate from deleting local test data.

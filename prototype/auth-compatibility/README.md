# Isolated login compatibility prototype

Local-only research on branch `codex/auth-login-compatibility-prototype`, based on staging `719016b`. No application routes, deployment settings, or dependencies were changed. Do not mount this synthetic fixture in staging or production. All accounts, codes, and identity-provider responses are fabricated test data.

## Run

Use the repository's Node 24 runtime and installed dependencies:

```sh
node prototype/auth-compatibility/check.cjs
node prototype/auth-compatibility/fixture.cjs
```

The second command serves http://127.0.0.1:4399 until stopped. It accepts only synthetic credentials shown in the UI. It does not send email, contact Google, or support real accounts. One-minute challenge/session lifetimes keep manual expiry checks short. Set `PROTOTYPE_RESULT` to save an aggregate test report; no browser state is written to disk.

## Verified on November 7, 2026

Eight automated compatibility groups passed using real isolated Chromium contexts and a loopback HTTP fixture:

- Email codes and password plus authenticator codes: wrong code rejected; correct code grants access to two protected pages; challenge cannot be replayed.
- A separate scanner context has no access until target-site state is explicitly transferred. The existing scope filter excludes the synthetic identity-provider cookie and retains the target's HTTP-only session cookie.
- Canceling the session invalidates the transferred session too.
- Browser-bound email link works in its original context, fails in another context, and cannot be replayed. Actual services may implement different link-binding rules.
- Simulated external-sign-in callback validates return state and rejects replay. This is not a live OAuth or Google test.
- Expired challenges/sessions, repeated wrong codes, and unrelated-origin submissions are rejected.
- Tab-bound storage works in the signed-in tab but fails in new scan tabs and after the current storage transfer.
- IndexedDB authentication fails with the current default storage snapshot; explicitly including IndexedDB restores fixture access. This is a finding, not a deployed fix or a guarantee for every provider.

Manual browser UI verification also passed email-code entry, wrong-code retry, access verification, and cancellation. The local form includes a CSRF token for browser requests that omit an Origin header under their referrer policy.

## What remains unverified

- Real Google login, real email delivery, provider anti-automation rules, third-party redirects/popups, Google phone approvals, real authenticator accounts, passkeys/security keys, and device/IP-bound sessions.
- A finished browser extension, session-import API, local crawler, or cloud-browser integration. The experiment transfers synthetic state in memory solely to measure compatibility.
- A real scan through Vellic after a third-party account login. These fixtures verify protected-page access and storage portability, not broad scanner compatibility.

## Browser helper decision

A normal-browser login does not automatically log the server-side scanner in. For that design, we need either a tightly scoped helper to transfer only the target site's authorized temporary session, scanning in the user's browser, or an explicit target-site integration. Opening a popup alone is insufficient. Never transfer Google account cookies or passwords.

A compatible cloud-browser flow may avoid a helper, but Google must not be treated as compatible without a live trial and a policy-compatible browser design. The existing Browserbase pilot remains inactive and its network-isolation prerequisite remains unresolved. Neither a provider purchase nor deployment is authorized by this prototype.

Recommended next live trials: a tiny private Notion page tree (Google/email), a disposable GitHub repository (password/2FA), or a small Linear test area (Google/email code). Framer is familiar but its editor is a login test, not a representative page-tree crawl. Confirm the user's selected site/account and exact test area before logging in or scanning.

Sources checked:
- https://developers.google.com/identity/protocols/oauth2/policies#use-secure-browsers
- https://playwright.dev/docs/auth
- https://linear.app/docs/login-methods
- https://www.notion.com/help/log-in-and-out
- https://www.notion.com/help/two-step-verification
- https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/accessing-github-using-two-factor-authentication

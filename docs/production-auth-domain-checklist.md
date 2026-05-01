# Production Auth + Domain Checklist

Use this after staging auth passes.

## Final URLs

- Main app: `https://vellic.io`
- API: `https://api.vellic.io`
- Optional website redirect: `https://www.vellic.io` -> `https://vellic.io`
- Staging stays separate:
  - `https://staging.vellic.io`
  - `https://api-staging.vellic.io`

## Railway Production Env

Set these on the production backend service:

```env
FRONTEND_URL=https://vellic.io
APP_BASE_URL=https://vellic.io
NODE_ENV=production
DB_PROVIDER=postgres
DATABASE_URL=<Railway production Postgres URL>
JWT_SECRET=<long random secret>
ADMIN_API_KEY=<long random admin key>
EMAIL_PROVIDER=resend
EMAIL_FROM_ADDRESS=noreply@vellic.io
EMAIL_FROM_NAME=Vellic
EMAIL_REPLY_TO_ADDRESS=support@vellic.io
GOOGLE_CLIENT_ID=<Google Web client ID>
GOOGLE_CLIENT_SECRET=<Google Web client secret, optional for the old redirect fallback>
GOOGLE_REDIRECT_URI=https://api.vellic.io/auth/google/callback
RESEND_API_KEY=<Resend production API key>
RESEND_WEBHOOK_SECRET=<Resend webhook signing secret, if webhooks are enabled>
TEST_AUTH_ENABLED=false
AUTH_HEADER_FALLBACK=false
RUN_MODE=both
```

## Vercel Production Env

Set this on the production frontend project:

```env
REACT_APP_API_BASE=https://api.vellic.io
REACT_APP_SHOW_THEME_TOGGLE=false
REACT_APP_COLLABORATION_UI_ENABLED=true
REACT_APP_REALTIME_BASELINE_ENABLED=true
REACT_APP_REALTIME_PRESENCE_HEARTBEAT_SEC=20
REACT_APP_COEDITING_EXPERIMENT_ENABLED=true
REACT_APP_COEDITING_SELECTION_BROADCAST_MS=200
REACT_APP_PERMISSION_GATING_ENABLED=true
REACT_APP_SCREENSHOT_JOB_PIPELINE_ENABLED=true
```

## DNS Order

1. Add `vellic.io` to the production Vercel project.
2. Add `www.vellic.io` to the production Vercel project and redirect it to `vellic.io`.
3. Add `api.vellic.io` to the production Railway backend.
4. In GoDaddy DNS, add the records Vercel and Railway show.
5. Wait for Vercel and Railway to show valid/active.

## Google Cloud

In the OAuth web client:

- Authorized JavaScript origins:
  - `https://vellic.io`
  - `https://staging.vellic.io`
- Authorized redirect URIs:
  - `https://api.vellic.io/auth/google/callback`
  - `https://api-staging.vellic.io/auth/google/callback`

If using the current Google Identity button flow, the client ID is required. The client secret and redirect URI are only needed for the older redirect fallback.

## Resend

- Verified sending domain: `vellic.io`
- Sending address: `noreply@vellic.io`
- Reply-to address: `support@vellic.io`
- Provider: `resend`

## Final Test

Run after production deploy:

```bash
npm run verify:runtime:production
npm run verify:realtime:production
```

Then manually test:

- Google login
- email signup verification
- forgot/reset password
- profile avatar
- one normal app action after refresh

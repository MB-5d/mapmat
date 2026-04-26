# Auth + Staging Handoff

Use this when starting a new Codex chat and you want it to pick up the Vellic auth + staging work quickly.

## Paste This Into a New Chat

```text
I need you to continue the Vellic auth + staging setup in this repo: /Users/matthewbraun/Desktop/mapmat

Please inspect the repo first and follow AGENTS.md.

Important context:
- Keep the current custom auth system. Do not migrate to Clerk/Auth0/Supabase/etc.
- The auth feature work is already implemented in code.
- New email/password signup now requires a 6-digit email verification code.
- Password reset now uses an emailed code.
- Google sign-in backend flow exists.
- The frontend now checks /auth/config before showing the Google button.
- I just bought a domain and want to finish staging setup for real email + Google OAuth.

Already implemented:
- POST /auth/signup creates an unverified user and emails a 6-digit code
- POST /auth/verify-email
- POST /auth/resend-verification
- POST /auth/forgot-password
- POST /auth/reset-password
- GET /auth/google/start
- GET /auth/google/callback
- GET /auth/config
- richer auth session payload with emailVerified/authProvider/hasPassword

Key files:
- routes/auth.js
- stores/authStore.js
- stores/authChallengeStore.js
- utils/emailTemplates.js
- frontend/src/api.js
- frontend/src/components/modals/AuthModal.js
- frontend/src/App.js
- frontend/src/components/drawers/ProfileDrawer.js
- scripts/check-auth-flows.js
- .env.staging.example
- frontend/.env.staging.example

Validation already passed locally:
- npm run check:backend
- npm run check:frontend-build
- CI=true npm test -- --runInBand --watch=false frontend/src/components/modals/AuthModal.test.js
- npm run check:auth-flows

Important limits / caveats:
- Real Google OAuth has not been live-tested yet because credentials were not configured.
- Real resend/postmark email delivery has not been live-tested yet; local auth email flow was validated with EMAIL_PROVIDER=log.
- There are many unrelated dirty worktree changes in this repo. Do not revert unrelated files.
- Stay tightly focused on auth/staging/domain/email/OAuth setup.

Staging context from earlier work:
- Existing default staging frontend URL in repo docs/examples: https://mapmat-staging.vercel.app
- Existing default staging backend URL in repo docs/examples: https://mapmat-staging.up.railway.app
- Google OAuth may require owned/verified domains, so if needed we should prefer my newly purchased domain over the default vercel.app / railway.app staging domains.
- .env.staging.example and frontend/.env.staging.example were already updated with the new auth-related placeholders.

What I need from this chat:
1. Inspect the current repo state and summarize what is already in place.
2. Help me wire my newly purchased domain into Resend, Railway, Vercel, and Google OAuth.
3. Give me the exact final values for:
   - FRONTEND_URL
   - APP_BASE_URL
   - REACT_APP_API_BASE
   - GOOGLE_REDIRECT_URI
   - EMAIL_FROM_ADDRESS
   - EMAIL_PROVIDER
   - any other auth env vars still needed
4. Tell me exactly what to click/type in Resend, Railway, Vercel, and Google Cloud.
5. Keep the answer short, plain English, and low-jargon.

Start by inspecting the repo and then tell me:
- what you found
- what exact values you still need from me
- the safest next step
```

## Current Auth Scope

- Email/password signup with verification code
- Resend verification code
- Forgot password and reset password by code
- Google sign-in flow
- Auth challenge persistence
- Email templates for auth emails
- Staging env examples updated for auth

## Main Files

- [routes/auth.js](/Users/matthewbraun/Desktop/mapmat/routes/auth.js:1)
- [stores/authStore.js](/Users/matthewbraun/Desktop/mapmat/stores/authStore.js:1)
- [stores/authChallengeStore.js](/Users/matthewbraun/Desktop/mapmat/stores/authChallengeStore.js:1)
- [frontend/src/api.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/api.js:1)
- [frontend/src/components/modals/AuthModal.js](/Users/matthewbraun/Desktop/mapmat/frontend/src/components/modals/AuthModal.js:1)
- [scripts/check-auth-flows.js](/Users/matthewbraun/Desktop/mapmat/scripts/check-auth-flows.js:1)
- [.env.staging.example](/Users/matthewbraun/Desktop/mapmat/.env.staging.example:1)
- [frontend/.env.staging.example](/Users/matthewbraun/Desktop/mapmat/frontend/.env.staging.example:1)

## Suggested Next Goal

Use the newly purchased domain to finish:

- Resend domain verification
- Railway backend env vars
- Vercel frontend env vars
- Google OAuth project/client setup
- staging smoke test for signup, verify, reset, and Google sign-in

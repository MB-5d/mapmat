# Staging Setup Runbook

Use this when you are ready to turn the current local alpha into a shared staging environment.

For the short “do this now, in order” version, use:

- [staging-live-operator-checklist.md](./staging-live-operator-checklist.md)

This is the exact execution order for:

- Railway staging backend
- Vercel staging frontend
- env setup
- rollout preflight
- runtime verification
- first internal multi-user test

This assumes the repo already has:

- `staging` branch
- current local alpha mostly green
- recent browser smoke passing locally

## 0. What You Need Before Starting

Accounts:

- GitHub repo admin access
- Railway access
- Vercel access

Values to prepare:

- a real staging JWT secret
- a real staging admin API key
- a Railway Postgres connection string
- a staging frontend URL
- a staging backend URL

Recommended secret quality:

- `JWT_SECRET`: at least 32 random characters
- `ADMIN_API_KEY`: at least 24 random characters

## 1. Confirm the Branch Model

Expected branch flow:

- `main` -> production
- `staging` -> staging

Local check:

```bash
git branch --show-current
git fetch origin
git branch -a | rg "staging|main"
```

If `staging` does not exist remotely yet, create it before doing anything else.

## 2. Preflight the Repo Locally

From the repo root:

```bash
npm run check:frontend-build
npm run check:backend
API_BASE=http://localhost:4002 node scripts/check-local-collaboration.js
API_BASE=http://localhost:4002 APP_BASE=http://localhost:3001 npm run test:smoke:browser
```

Expected:

- commands pass
- only known non-blocking frontend lint warnings remain

Do not move to staging if local alpha is still failing on blocker-level issues.

## 3. Prepare the Staging Backend Env

Start from:

- [.env.staging.example](../.env.staging.example)

Use these as the intended staging values:

```env
FRONTEND_URL=https://mapmat-staging.vercel.app
ALLOW_VERCEL_PREVIEWS=true
NODE_ENV=production
DB_PROVIDER=postgres
DATABASE_URL=postgres://staging_user:staging_password@staging-db.example.com:5432/mapmat_staging
JWT_SECRET=replace-with-a-long-random-staging-secret
ADMIN_API_KEY=replace-with-a-long-random-staging-admin-key
EMAIL_PROVIDER=log
TEST_AUTH_ENABLED=false
AUTH_HEADER_FALLBACK=true
COLLABORATION_BACKEND_ENABLED=true
COLLAB_INVITE_DEFAULT_DAYS=7
COLLAB_INVITE_MAX_DAYS=30
REALTIME_BASELINE_ENABLED=true
REALTIME_PRESENCE_TTL_SEC=90
REALTIME_PRESENCE_HEARTBEAT_SEC=20
COEDITING_EXPERIMENT_ENABLED=true
COEDITING_ROLLOUT_ENABLED=true
COEDITING_ROLLOUT_HARDENING_ENABLED=true
COEDITING_ROLLOUT_ALLOW_GLOBAL=true
COEDITING_ROLLOUT_GLOBAL_APPROVED=true
COEDITING_ROLLOUT_REQUIRE_INSTANCE_AGREEMENT=true
COEDITING_ROLLOUT_USER_IDS=
COEDITING_ROLLOUT_MAP_IDS=
COEDITING_ROLLOUT_BLOCK_USER_IDS=
COEDITING_ROLLOUT_BLOCK_MAP_IDS=
COEDITING_FORCE_READ_ONLY=false
COEDITING_METRICS_WINDOW_SEC=300
COEDITING_DEGRADE_CONFLICTS_PER_WINDOW=0
COEDITING_DEGRADE_RECONNECTS_PER_WINDOW=0
COEDITING_DEGRADE_DROPPED_PER_WINDOW=0
COEDITING_DISTRIBUTED_OBSERVABILITY_ENABLED=true
COEDITING_DISTRIBUTED_OBSERVABILITY_RETENTION_DAYS=30
COEDITING_WS_HEARTBEAT_SEC=20
COEDITING_WS_IDLE_TIMEOUT_SEC=90
COEDITING_WS_JOIN_TIMEOUT_SEC=15
COEDITING_WS_ROOM_RATE_LIMIT_PER_MIN=240
COEDITING_WS_MAX_MESSAGE_BYTES=32768
COEDITING_WS_MAX_BACKPRESSURE_BYTES=131072
SCREENSHOT_CAPTURE_TIMEOUT_MS=60000
SCREENSHOT_CACHE_TTL_MS=3600000
SCREENSHOT_FULL_MAX_HEIGHT=16000
SCREENSHOT_FULL_MAX_WIDTH=1920
SCREENSHOT_CLEANUP_INTERVAL_MS=300000
SCREENSHOT_CLEANUP_MAX_FILES=50
COEDITING_SYNC_ENGINE_ENABLED=true
RUN_MODE=both
```

Validate the intended env before entering it into Railway:

```bash
set -a
source .env.staging.example
npm run check:staging:backend
```

Expected:

- only warnings for `EMAIL_PROVIDER=log`
- warning about filesystem-backed screenshots

## 4. Prepare the Staging Frontend Env

Start from:

- [frontend/.env.staging.example](../frontend/.env.staging.example)

Use these intended values:

```env
REACT_APP_API_BASE=https://mapmat-staging.up.railway.app
REACT_APP_SHOW_THEME_TOGGLE=true
REACT_APP_COLLABORATION_UI_ENABLED=true
REACT_APP_REALTIME_BASELINE_ENABLED=true
REACT_APP_REALTIME_PRESENCE_HEARTBEAT_SEC=20
REACT_APP_COEDITING_EXPERIMENT_ENABLED=true
REACT_APP_COEDITING_SELECTION_BROADCAST_MS=200
REACT_APP_PERMISSION_GATING_ENABLED=true
REACT_APP_SCREENSHOT_JOB_PIPELINE_ENABLED=true
```

Validate the intended frontend env:

```bash
set -a
source frontend/.env.staging.example
npm run check:staging:frontend
```

## 5. Railway Setup

Create or open the Railway staging project/service.

Runtime:

- branch: `staging`
- start command: `node server.js`
- runtime: production

Database:

- attach Postgres
- use Postgres for runtime, not SQLite

Important:

- screenshots are still filesystem-backed
- for staging, keep this backend single-instance
- use a persistent volume if possible

Railway dashboard actions:

1. Create staging service if it does not exist.
2. Connect the repo and select branch `staging`.
3. Add all backend env vars from step 3.
4. Confirm the generated public domain.
5. Update `FRONTEND_URL` later if the final Vercel staging URL differs.

## 6. Vercel Setup

Create or open the Vercel staging project.

Project settings:

- root directory: `frontend`
- production branch: `staging`
- build command: `CI=false npm run build`

Vercel dashboard actions:

1. Import or open the frontend project.
2. Set branch `staging` as the staging deployment target.
3. Add all frontend env vars from step 4.
4. Deploy.
5. Copy the final staging frontend URL.

After Vercel is ready:

- go back to Railway
- set `FRONTEND_URL` to the real Vercel staging URL

## 7. First Deploy Verification

Check backend health:

```bash
curl https://<staging-backend-domain>/health
curl https://<staging-backend-domain>/health/db
curl https://<staging-backend-domain>/health/coediting
```

Expected:

- all return healthy responses

Then run repo checks against staging:

```bash
npm run verify:runtime:staging
npm run verify:realtime:staging
npm run verify:realtime:staging:preflight
```

Important:

- for this internal staging workflow, use approved broad rollout unless you are
  deliberately testing a scoped canary
- still run the realtime preflight first

## 8. Coediting Rollout Decision

Recommended first staging stance for the current internal alpha:

- approved broad rollout

That means:

- set `COEDITING_ROLLOUT_ALLOW_GLOBAL=true`
- set `COEDITING_ROLLOUT_GLOBAL_APPROVED=true`
- keep the scope lists blank unless you intentionally want a limited canary

If you want a stricter scoped canary later, flip both broad-rollout flags back
to `false` and explicitly set the user/map scope lists before testing.

## 9. Browser Smoke Against Staging

Run the browser smoke against the real staging URLs:

```bash
API_BASE=https://<staging-backend-domain> \
APP_BASE=https://<staging-frontend-domain> \
npm run test:smoke:browser
```

Expected coverage:

- direct `/app/maps/:mapId` route
- autosaved timeline entry
- invite accept flow
- viewer read-only comments
- commenter create/resolve comments
- owner comment verification

## 10. Manual Internal QA on Staging

Run the existing manual pass against staging:

- [alpha-manual-runbook.md](./alpha-manual-runbook.md)

But replace local targets with staging URLs.

Use at least:

- owner
- editor
- viewer
- commenter

Focus on:

- route reopen after refresh
- invite inbox
- access request inbox
- owner/editor live editing
- viewer/commenter read-only live updates
- comments
- screenshots on a few real sites

## 11. Email Decision for Internal Alpha

You have two realistic choices:

1. `EMAIL_PROVIDER=log`
   - fastest
   - no real inboxes
   - invite/access flow still works via in-app inbox

2. real provider
   - slower setup
   - enables real invite/access emails
   - closer to external testing readiness

Recommendation:

- for first internal staging alpha, `log` is acceptable
- before external testers, move to a real provider

## 12. First Internal Multi-User Test

After staging is green:

- invite 3 to 6 internal testers
- use separate accounts
- have at least two people editing the same saved map live

Suggested task set:

1. create project
2. scan URL
3. save map
4. direct-link reopen
5. invite another user
6. accept invite
7. owner/editor edit live together
8. commenter add/resolve comments
9. viewer read comments
10. save a version
11. inspect timeline
12. capture thumbnails/full screenshots

## 13. Go / No-Go for Internal Alpha

Go if:

- runtime checks pass
- realtime checks pass
- browser smoke passes
- manual runbook has no blocker-level failures

Do not go if any of these remain:

- saved maps fail to reopen reliably
- collaboration permissions are wrong
- screenshots or comments do not persist
- invite/access-request flows break
- owner/editor live editing desyncs in normal use

## 14. What Is Still Acceptable to Defer

For a small internal staging alpha, these can remain deferred:

- stronger parallax screenshot stabilization
- true multi-user undo/redo parity with Figma/Miro/Google
- screenshot remove/rescan controls
- final object-storage-backed screenshot architecture
- final `www` / `app` subdomain split

The one caveat there:

- screenshot storage should stay on a single staging backend instance until object storage is introduced

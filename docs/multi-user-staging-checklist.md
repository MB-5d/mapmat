# Multi-User Staging Checklist

Use this after the local alpha gate is mostly green.

For the exact execution order once you start setting up Railway and Vercel, use:

- [staging-setup-runbook.md](./staging-setup-runbook.md)
- [staging-live-operator-checklist.md](./staging-live-operator-checklist.md)

This checklist is specifically for getting from:

- local alpha on `localhost:3001` / `localhost:4002`

to:

- a shared staging environment that multiple internal testers can use at the same time

It is not the public beta checklist. It is the shortest safe path to a controlled internal alpha.

## Goal

Reach a staging environment where a small internal group can:

- log in with separate accounts
- invite each other
- collaborate on the same saved map live
- use comments, versions, activity, and screenshots
- reopen maps by direct route

without relying on localhost or manual backend state edits.

## Readiness Target

Before starting this checklist, aim for:

- local automated checks passing
- local browser smoke passing
- only a short list of known deferred items remaining

Recommended local preflight:

- `npm run check:frontend-build`
- `npm run check:backend`
- `API_BASE=http://localhost:4002 node scripts/check-local-collaboration.js`
- `API_BASE=http://localhost:4002 APP_BASE=http://localhost:3001 npm run test:smoke:browser`

Staging env/config preflight:

- `npm run check:staging:backend`
- `npm run check:staging:frontend`

Run those with the intended staging environment variables loaded before deployment.

## Phase 1: Decide the Staging Shape

Use the existing deployment split already assumed in the repo:

- frontend staging on Vercel
- backend staging on Railway
- Postgres runtime for staging

For the current internal alpha, keep staging simple:

- one staging frontend
- one staging backend web instance
- one staging worker process if email/job throughput needs isolation
- one staging Postgres database

Important current infrastructure constraint:

- screenshots are still stored on local disk under `/screenshots` in the backend
- that is acceptable for early staging only if you keep backend runtime simple
- do not treat this as horizontally scalable screenshot storage yet

## Phase 2: Provision the Backend

Follow [deployment-workflow.md](./deployment-workflow.md), but use this order:

1. Create or confirm the `staging` branch.
2. Create a Railway staging service.
3. Configure Railway runtime:
   - `NODE_ENV=production`
   - `DB_PROVIDER=postgres`
   - `DATABASE_URL=postgres://...`
   - `FRONTEND_URL=https://<staging-frontend-domain>`
   - `ALLOW_VERCEL_PREVIEWS=true`
   - `JWT_SECRET=<staging-secret>`
   - `ADMIN_API_KEY=<staging-admin-key>`
4. Turn on the collaboration/live features required for staging:
   - `COLLABORATION_BACKEND_ENABLED=true`
   - `REALTIME_BASELINE_ENABLED=true`
   - `COEDITING_EXPERIMENT_ENABLED=true`
   - `COEDITING_SYNC_ENGINE_ENABLED=true`
   - `COEDITING_ROLLOUT_ENABLED=true`
5. Decide rollout safety mode:
   - safest first staging mode: scoped canary
   - broad internal-alpha mode: allow approved broad rollout only after preflight

Recommended first staging stance:

- do not start with broad unscoped rollout if you have not run the coediting preflight checks yet
- use `npm run check:staging:backend` before entering the values into Railway

## Phase 3: Provision the Frontend

Create a Vercel staging project pointing at `frontend`.

Required frontend vars:

- `REACT_APP_API_BASE=https://<staging-backend-domain>`
- `REACT_APP_COLLABORATION_UI_ENABLED=true`
- `REACT_APP_REALTIME_BASELINE_ENABLED=true`
- `REACT_APP_COEDITING_EXPERIMENT_ENABLED=true`
- `REACT_APP_PERMISSION_GATING_ENABLED=true`
- `REACT_APP_SCREENSHOT_JOB_PIPELINE_ENABLED=true`

Expected staging UX:

- `/` shows the landing site
- `/app` shows the product shell
- `/app/maps/:mapId` works directly
- `/app/invites` works directly
- `/share/:shareId` works directly

Before promoting the frontend settings, run:

- `npm run check:staging:frontend`

## Phase 4: Real Auth and Account Policy

For internal staging, decide whether you want:

- temporary test-auth mode for internal team speed
- or real account signup/login only

For a true internal alpha, preferred path is:

- turn off local-style test auth
- use real account creation
- use real invite inbox flow

If you keep test auth enabled briefly for internal speed, keep it limited to staging only and do not confuse that environment with a user-facing beta.

## Phase 5: Email Delivery

Transactional email is already separated from marketing email in the codebase. For staging:

1. Pick a staging provider mode:
   - `EMAIL_PROVIDER=log` for backend-only verification
   - real provider mode for actual invite/access emails
2. Configure provider secrets in Railway.
3. Configure webhook endpoint delivery into the staging backend.
4. Verify:
   - invite emails
   - access request emails
   - approval / denial emails
   - removal / role change emails

Do not mix marketing email into this stage.

## Phase 6: Observability and Admin Safety

Before multiple users hit staging at once, make sure you can answer:

- Is the backend healthy?
- Is Postgres healthy?
- Is coediting healthy?
- Are emails being delivered?
- Can you see failures quickly?

At minimum, verify these:

- `/health`
- `/health/db`
- `/health/coediting`

And keep these checks usable:

- `npm run verify:runtime:staging`
- `npm run verify:realtime:staging`
- `npm run verify:realtime:staging:preflight`

Also make sure `ADMIN_API_KEY` is set so rollout/admin checks can work.

## Phase 7: Screenshot Risk Decision

This is the main infrastructure caveat for shared testing.

Current reality:

- screenshot assets are backend-generated and persisted
- but storage is still local filesystem based
- this is not yet the final scalable storage model

For internal staging, choose one of these explicitly:

1. Short-term acceptable:
   - single backend instance
   - persistent Railway volume
   - no horizontal scaling assumptions

2. More durable:
   - move screenshot assets to object storage before broader testing

Recommendation for the next internal alpha:

- use the short-term staging path if you only need a small internal group
- treat object storage as a later beta-readiness task

## Phase 8: Staging Verification Pass

After deployment, run these in order:

1. Runtime checks
   - `npm run verify:runtime:staging`

2. Realtime checks
   - `npm run verify:realtime:staging`
   - `npm run verify:realtime:staging:preflight`

3. Browser smoke against staging
   - adapt `APP_BASE` / `API_BASE` to the staging domains
   - run the alpha browser smoke

4. Manual internal QA
   - use [alpha-manual-runbook.md](./alpha-manual-runbook.md)
   - run it against staging, not localhost

## Phase 9: Small Internal Multi-User Alpha

Do not jump to many users at once.

Recommended first cohort:

- 3 to 6 internal testers
- at least:
  - 1 owner
  - 1 editor
  - 1 commenter
  - 1 viewer

Suggested tasks:

- create project
- scan and save a new map
- direct-link reopen
- invite and accept via inbox/email
- owner/editor live editing in parallel
- viewer/commenter passive observation
- comment create/resolve/read
- save version and inspect timeline
- capture screenshots on real sites

## Phase 10: Go / No-Go Rules

Do not open the environment to broader testing if any of these are still happening:

- saved maps fail to reopen reliably
- collaboration permissions are wrong
- comments or screenshot assets do not persist
- invite or access-request flow breaks
- live editing desyncs in normal owner/editor use
- email delivery cannot be audited

Acceptable deferred items for a small internal alpha:

- stronger parallax screenshot handling
- true collaborative undo/redo parity with Figma/Miro/Google
- screenshot remove/rescan controls
- final app-vs-www subdomain split

## Practical Estimate

From the current repo state, the remaining work before a shared internal alpha is mostly:

1. one more blocker sweep on local/manual alpha
2. staging environment setup
3. staging verification
4. a small internal multi-user test round

That is much closer than a new feature phase. It is mostly environment and final blocker cleanup now.

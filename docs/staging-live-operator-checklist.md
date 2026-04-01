# Staging Live Operator Checklist

Use this when you are actively setting up shared staging.

This is the short version of:

- [staging-setup-runbook.md](./staging-setup-runbook.md)

Do the steps in order.

## 1. Confirm Local Readiness

From the repo root:

```bash
npm run check:frontend-build
npm run check:backend
API_BASE=http://localhost:4002 node scripts/check-local-collaboration.js
API_BASE=http://localhost:4002 APP_BASE=http://localhost:3001 npm run test:smoke:browser
```

Do not continue if these fail on blocker-level issues.

## 2. Prepare Real Staging Values

You need:

- Railway staging backend URL
- Vercel staging frontend URL
- Postgres connection string
- real `JWT_SECRET`
- real `ADMIN_API_KEY`

Use these files as the source of truth:

- [/.env.staging.example](/Users/matthewbraun/Desktop/mapmat/.env.staging.example)
- [frontend/.env.staging.example](/Users/matthewbraun/Desktop/mapmat/frontend/.env.staging.example)

## 3. Validate the Intended Staging Env Locally

Load the backend example and replace placeholders with your real staging values.

Then run:

```bash
npm run check:staging:backend
```

Load the frontend example and replace placeholders with your real staging values.

Then run:

```bash
npm run check:staging:frontend
```

Expected:

- no errors
- warnings are acceptable for:
  - `EMAIL_PROVIDER=log`
  - filesystem-backed screenshots

## 4. Configure Railway Staging

In Railway:

1. Open or create the staging service.
2. Point it to branch `staging`.
3. Add backend env values.
4. Attach Postgres.
5. Keep backend as a single instance for now.
6. Deploy.

Important current rule:

- do not treat screenshot storage as horizontally scalable yet

## 5. Configure Vercel Staging

In Vercel:

1. Open or create the staging frontend project.
2. Root directory = `frontend`
3. Production branch = `staging`
4. Add frontend env values.
5. Deploy.

Then copy the final frontend URL and update Railway:

- `FRONTEND_URL=https://<real-staging-frontend-url>`

Redeploy backend if needed.

## 6. Verify Backend Health

Check:

```bash
curl https://<staging-backend-domain>/health
curl https://<staging-backend-domain>/health/db
curl https://<staging-backend-domain>/health/coediting
```

Expected:

- healthy responses from all three

## 7. Verify Staging from the Repo

Run:

```bash
npm run verify:runtime:staging
npm run verify:realtime:staging
npm run verify:realtime:staging:preflight
API_BASE=https://<staging-backend-domain> APP_BASE=https://<staging-frontend-domain> npm run test:smoke:browser
```

Do not continue if these fail.

## 8. Enable Shared Live Editing for Internal Staging

For a real internal multi-user staging test, the backend must allow writable
coediting. There are 2 valid ways to do that:

- easiest: approved broad internal-alpha rollout
- stricter: scoped rollout by specific user IDs or map IDs

For the current staging setup, use the easy internal-alpha option:

- `COEDITING_ROLLOUT_ALLOW_GLOBAL=true`
- `COEDITING_ROLLOUT_GLOBAL_APPROVED=true`

If both of those stay `false` while the scope lists are blank, presence may work
but writable live editing will stay disabled and edits will fall back to the old
save/conflict path.

## 9. Run Manual QA on Staging

Use:

- [alpha-manual-runbook.md](./alpha-manual-runbook.md)

But replace localhost with the real staging URLs.

Minimum roles to test:

- owner
- editor
- viewer
- commenter

## 10. Start the First Internal Multi-User Test

Recommended group:

- 3 to 6 internal testers

Minimum scenarios:

1. create project
2. scan URL
3. save map
4. reopen by direct route
5. invite another user
6. accept invite
7. owner/editor edit live together
8. commenter add/resolve comments
9. viewer read comments
10. save a version
11. inspect timeline
12. capture screenshots

## 11. Stop Conditions

Do not proceed with internal staging testing if any of these are still happening:

- saved maps fail to reopen
- collaboration permissions are wrong
- comments do not persist
- screenshot assets do not persist
- invite/access-request flow breaks
- owner/editor live editing desyncs in normal use

## 12. Current Acceptable Deferrals

These are acceptable for the first internal staging alpha:

- stronger parallax screenshot handling
- true multi-user undo/redo parity
- screenshot remove/rescan controls
- final object-storage screenshot architecture
- final `www` / `app` subdomain split

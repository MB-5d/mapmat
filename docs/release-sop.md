# Map Mat Release SOP

This is the operational playbook for shipping safely from `staging` to `main`.

## 1) Branch Model

- `staging`: QA/testing environment
- `main`: production environment
- `feature/*`: feature work branches, merged into `staging`

## 2) Before Any Release

1. Confirm you are testing on staging frontend:
- `https://mapmat-staging.vercel.app`
2. Confirm staging backend health:
- `https://mapmat-staging.up.railway.app/health`
- Expect: `{"ok":true}`
3. Smoke test on staging:
- Login/signup
- Save map
- Share link
- Version history
4. Confirm CI is passing on latest staging PR:
- `Backend Syntax`
- `Frontend Build`

## 3) Promote Staging to Production

Run in terminal from repo root:

```bash
git checkout staging
git pull origin staging
git checkout main
git pull origin main
git merge --no-ff staging -m "Merge staging into main (release)"
git push origin main
```

Notes:
- Same terminal tab is fine.
- If conflicts appear, resolve them, then `git add <files>` and `git commit`.

## 4) Post-Release Verification

1. Verify production frontend:
- `https://mapmat.vercel.app`
2. Verify production backend health:
- `https://<production-railway-domain>/health`
- Expect: `{"ok":true}`
3. Verify production auth policy:
- `TEST_AUTH_ENABLED=false`
- fake account auto-creation should not happen in production
4. Check deploy logs in Vercel and Railway for errors.

## 5) Sync Branches After Release

After `main` is updated, fast-forward `staging` to match:

```bash
git checkout staging
git merge --ff-only main
git push origin staging
```

This keeps future work based on the latest released state.

## 6) Required Environment Policies

### Production (Railway)

- `NODE_ENV=production`
- `FRONTEND_URL=https://mapmat.vercel.app` (exact origin)
- `TEST_AUTH_ENABLED=false`
- `AUTH_HEADER_FALLBACK=false`
- `ALLOW_VERCEL_PREVIEWS=false`
- `JWT_SECRET=<prod secret>`

### Staging (Railway)

- `NODE_ENV=production`
- `FRONTEND_URL=https://mapmat-staging.vercel.app`
- `TEST_AUTH_ENABLED=true`
- `AUTH_HEADER_FALLBACK=true`
- `ALLOW_VERCEL_PREVIEWS=true`
- `JWT_SECRET=<staging secret>`

### Vercel Branch Tracking

- Production Vercel project -> branch: `main`
- Staging Vercel project -> branch: `staging`

## 7) Branch Protection (GitHub)

Ruleset on `main` must include:

- target branch pattern: `main`
- enforcement status: `Active`
- require PR before merge
- require 1 approval
- require status checks:
  - `Backend Syntax`
  - `Frontend Build`
- block force pushes

## 8) Troubleshooting

### `/health` redirects to landing page

You are likely checking frontend URL (Vercel).  
Use backend URL (Railway) for `/health`.

### "Committing is not possible because you have unmerged files"

You are mid-merge. Check:

```bash
git status
```

Then resolve conflicts, `git add`, and `git commit`.

### Security logs not visible

Security logs are event-driven. They appear only when events occur (e.g., rate limit/CORS block).

### Rate-limit test left staging locked

Remove temporary overrides if used:

- `AUTH_LOGIN_RATE_LIMIT`
- `AUTH_RATE_WINDOW_MS`


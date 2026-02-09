# Map Mat Deployment Workflow

This repository uses separate branches and separate infrastructure for safe releases:

- `main` -> production deploy
- `staging` -> staging deploy
- `feature/*` -> pull requests into `staging` for QA
- `hotfix/*` -> pull requests into `main`, then back-merge into `staging`

## 1) Branch Setup

Run once from local clone:

```bash
git checkout main
git pull origin main
git branch staging
git push -u origin staging
```

## 2) GitHub Rules

Set these in GitHub repository settings:

1. Protect `main`:
   - Require pull request before merging.
   - Require at least 1 approval.
   - Require status checks to pass.
   - Disable force push and branch deletion.
2. Protect `staging`:
   - Require pull request before merging.
   - Require status checks to pass.
   - Optional: require 1 approval.
3. Mark these checks as required on protected branches:
   - `Backend Syntax`
   - `Frontend Build`

## 3) CI Checks

CI workflow is in `.github/workflows/pr-checks.yml`.

It runs on pull requests to `main` and `staging`:

1. Backend syntax checks:
   - `node --check server.js`
   - `node --check db.js`
   - `node --check routes/auth.js`
   - `node --check routes/api.js`
2. Frontend production build:
   - `CI=false npm --prefix frontend run build`

## 4) Vercel Projects

Keep two Vercel projects:

1. Production Vercel project:
   - Root Directory: `frontend`
   - Production Branch: `main`
   - Build command: `CI=false npm run build`
   - Env var: `REACT_APP_API_BASE=https://<production-railway-domain>`
2. Staging Vercel project:
   - Root Directory: `frontend`
   - Production Branch: `staging`
   - Build command: `CI=false npm run build`
   - Env var: `REACT_APP_API_BASE=https://<staging-railway-domain>`

Preview deployments:

1. Keep previews enabled.
2. Test `feature/*` pull requests on preview URLs before merge.

## 5) Railway Services

Keep two Railway services:

1. Production service:
   - Branch: `main`
   - Start command: `node server.js`
   - Volume mount: `/app/data` (or chosen mount path)
   - `DB_PATH=/app/data/mapmat.db`
2. Staging service:
   - Branch: `staging`
   - Start command: `node server.js`
   - Separate volume mount: `/app/data`
   - `DB_PATH=/app/data/mapmat.db`

Required backend vars per service:

- `FRONTEND_URL`
- `JWT_SECRET`
- `NODE_ENV`
- `DB_PATH`
- `ALLOW_VERCEL_PREVIEWS`
- `TEST_AUTH_ENABLED`
- `AUTH_HEADER_FALLBACK`

Recommended values:

1. Production:
   - `NODE_ENV=production`
   - `ALLOW_VERCEL_PREVIEWS=false`
   - `TEST_AUTH_ENABLED=false`
   - `AUTH_HEADER_FALLBACK=false`
2. Staging:
   - `NODE_ENV=production`
   - `ALLOW_VERCEL_PREVIEWS=true`
   - `TEST_AUTH_ENABLED=true`
   - `AUTH_HEADER_FALLBACK=true`

Health endpoint for both services:

- `GET /health` returns HTTP 200 and JSON `{ "ok": true }`

## 6) Daily Flow

1. Create branch from `staging`: `feature/<name>`.
2. Open PR: `feature/<name> -> staging`.
3. Verify CI + preview + staging behavior.
4. Merge PR into `staging`.
5. Open release PR: `staging -> main`.
6. Merge to deploy production.

Hotfix flow:

1. Create `hotfix/<name>` from `main`.
2. PR into `main`.
3. After merge, back-merge `main -> staging`.

## 7) Local and Backup

Local development remains primary for fast feedback:

```bash
npm install
cd frontend && npm install
```

Create backup archive (excluding `node_modules`, build outputs, and screenshot cache):

```bash
npm run backup:archive
```

Optional custom backup destination (for Google Drive synced folder):

```bash
bash scripts/backup-repo.sh "$HOME/Desktop/<your-drive-folder>/mapmat-backups"
```

## 8) Environment Templates

Use templates committed in repo:

- Backend local: `.env.example`
- Backend staging: `.env.staging.example`
- Backend production: `.env.production.example`
- Frontend local: `frontend/.env.example`
- Frontend staging: `frontend/.env.staging.example`
- Frontend production: `frontend/.env.production.example`

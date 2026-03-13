# Map Mat - Visual Sitemap Generator

A visual sitemap generator that crawls websites and creates interactive tree diagrams.

## Features

- 🕷️ Intelligent site crawler with progress tracking
- 🔐 User authentication (signup/login)
- 📁 Projects and saved maps
- 🔗 Share links with expiration
- 📜 Scan history
- 📤 Export to PNG/PDF/SVG
- 🌙 Dark mode support

## Local Development

### Backend (Port 4002)
```bash
cd mapmat
npm install
node server.js
```

### Worker (Jobs)
```bash
cd mapmat
npm run start:worker
```

### Frontend (Port 3000)
```bash
cd mapmat/frontend
npm install
npm start
```

## Deployment

### Safe Release Workflow

Use separate branches and services to avoid breaking production:

- `main` -> production (public)
- `staging` -> staging (QA)
- `feature/*` -> PR into `staging`

Detailed setup steps are in `docs/deployment-workflow.md`.
Release checklist and promotion steps are in `docs/release-sop.md`.
Current Postgres runtime ops are in `docs/postgres-runtime-ops.md`.
Historical migration log is in `docs/postgres-migration.md`.
Collaboration backend foundation docs are in `docs/collaboration-backend.md`.
Realtime collaboration baseline docs are in `docs/realtime-collaboration-baseline.md`.
True co-editing (CRDT/OT) follow-on plan is in `docs/coediting-follow-on.md`.
Phase 10A co-editing event contract docs are in `docs/coediting-event-contract.md`.
Phase 10B co-editing transport docs are in `docs/coediting-transport-layer.md`.
Phase 10C co-editing sync engine docs are in `docs/coediting-sync-engine.md`.
Permission feature-gating docs are in `docs/permission-feature-gating.md`.
Screenshot pipeline hardening docs are in `docs/screenshot-pipeline-hardening.md`.

Postgres runtime quick checks (repo root):

```bash
npm run verify:runtime:staging
npm run verify:runtime:production
```

CI checks for PRs are in `.github/workflows/pr-checks.yml`.

### Option 1: Railway + Vercel (Recommended)

**Backend → Railway:**
```bash
# Login to Railway (opens browser)
railway login

# Initialize and deploy
cd mapmat
railway init
railway up

# Set environment variables in Railway dashboard:
# - FRONTEND_URL = https://your-app.vercel.app
# - JWT_SECRET = your-secret-key
# - NODE_ENV = production
# - DB_PROVIDER = postgres
# - DATABASE_URL = postgres://...
```

Railway runtime config in `railway.json` uses:
- `startCommand`: `node server.js`
- health check endpoint: `GET /health` (returns `200` with JSON `{ "ok": true }`)

**Frontend → Vercel:**
```bash
# Login to Vercel (opens browser)
vercel login

# Deploy frontend
cd mapmat/frontend
vercel

# Set environment variable:
# - REACT_APP_API_BASE = https://your-railway-url.up.railway.app
```

Vercel project setting:
- Root Directory should be `frontend`

### Option 2: Quick Deploy Links

1. **Backend**: Push to GitHub, then connect to [Railway](https://railway.app/new)
2. **Frontend**: Push to GitHub, then import at [Vercel](https://vercel.com/new)

## Database Runtime on Railway

Production/staging should run with:

1. `DB_PROVIDER=postgres`
2. `DATABASE_URL=postgres://...`

Optional:

- `DB_PATH` can still be set for local SQLite/dev fallback scenarios.

## Environment Variables

### Backend
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 4002 |
| `FRONTEND_URL` | Frontend URL for CORS | http://localhost:3000 |
| `ALLOW_VERCEL_PREVIEWS` | Allow `*.vercel.app` preview origins for CORS | false |
| `JWT_SECRET` | Secret for JWT tokens | (dev default) |
| `NODE_ENV` | Environment | development |
| `DB_PROVIDER` | Active runtime provider (`sqlite` or `postgres`) | `sqlite` |
| `DB_PATH` | SQLite database file path (local/dev fallback) | `./data/mapmat.db` |
| `TEST_AUTH_ENABLED` | Enables temporary test-account mode | true locally, false in production |
| `TEST_AUTH_SEED_EMAIL` | Seed account email when test mode is enabled | matt@email.com |
| `TEST_AUTH_SEED_PASSWORD` | Seed account password when test mode is enabled | Admin123 |
| `TEST_AUTH_SEED_NAME` | Seed account display name when test mode is enabled | Matt Test |
| `AUTH_HEADER_FALLBACK` | Allows bearer token auth header fallback when cross-site cookies fail | same default as `TEST_AUTH_ENABLED` |
| `COLLABORATION_BACKEND_ENABLED` | Enables Phase 9B collaboration API endpoints | false |
| `COLLAB_INVITE_DEFAULT_DAYS` | Default invite expiration in days | 7 |
| `COLLAB_INVITE_MAX_DAYS` | Max invite expiration accepted by API | 30 |
| `REALTIME_BASELINE_ENABLED` | Enables Phase 9D realtime baseline API endpoints | false |
| `REALTIME_PRESENCE_TTL_SEC` | Presence session TTL window (seconds) | 90 |
| `REALTIME_PRESENCE_HEARTBEAT_SEC` | Suggested heartbeat interval returned by API (seconds) | 20 |
| `COEDITING_EXPERIMENT_ENABLED` | Enables Phase 10A/10B co-editing experimental backend endpoints and WebSocket transport | false |
| `COEDITING_WS_HEARTBEAT_SEC` | Client heartbeat cadence expected by Phase 10B WebSocket transport | 20 |
| `COEDITING_WS_IDLE_TIMEOUT_SEC` | Idle timeout before a co-editing socket is closed | 90 |
| `COEDITING_WS_JOIN_TIMEOUT_SEC` | Max time allowed before a socket must join a room session | 15 |
| `COEDITING_WS_ROOM_RATE_LIMIT_PER_MIN` | Max non-heartbeat messages accepted per map room per minute | 240 |
| `COEDITING_WS_MAX_MESSAGE_BYTES` | Max accepted WebSocket message size in bytes | 32768 |
| `COEDITING_WS_MAX_BACKPRESSURE_BYTES` | Max pending per-socket write buffer before the socket is closed | 131072 |
| `COEDITING_SYNC_ENGINE_ENABLED` | Enables Phase 10C live snapshot/op-log persistence and replay endpoints | false |
| `SCREENSHOT_CAPTURE_TIMEOUT_MS` | Per-attempt screenshot navigation timeout | 60000 |
| `SCREENSHOT_CACHE_TTL_MS` | Screenshot cache TTL before recapture | 3600000 |
| `SCREENSHOT_FULL_MAX_HEIGHT` | Max height for full screenshots (px) before truncation | 16000 |
| `SCREENSHOT_FULL_MAX_WIDTH` | Max width for full screenshots (px) | 1920 |
| `SCREENSHOT_CLEANUP_INTERVAL_MS` | Min interval between stale screenshot cleanup runs | 300000 |
| `SCREENSHOT_CLEANUP_MAX_FILES` | Max stale screenshot files deleted per cleanup run | 50 |
| `DATABASE_URL` | Postgres runtime connection string | (unset) |
| `RUN_MODE` | `web`, `worker`, or `both` | both |
| `USAGE_WINDOW_HOURS` | Usage window for quotas | 24 |
| `USAGE_LIMIT_SCAN` | Daily/rolling scan limit | 100 (prod) |
| `USAGE_LIMIT_SCAN_STREAM` | Daily/rolling scan-stream limit | 100 (prod) |
| `USAGE_LIMIT_SCAN_JOB` | Daily/rolling scan job limit | 100 (prod) |
| `USAGE_LIMIT_SCREENSHOT` | Daily/rolling screenshot limit | 200 (prod) |
| `USAGE_LIMIT_SCREENSHOT_JOB` | Daily/rolling screenshot job limit | 200 (prod) |
| `JOB_MAX_CONCURRENCY` | Max concurrent jobs in worker | 1 (prod) |
| `JOB_POLL_INTERVAL_MS` | Job polling interval | 1000 (prod) |
| `ADMIN_API_KEY` | Admin usage endpoint key | (unset) |

### Frontend
| Variable | Description | Default |
|----------|-------------|---------|
| `REACT_APP_API_BASE` | Backend API URL | http://localhost:4002 |
| `REACT_APP_COLLABORATION_UI_ENABLED` | Enables Phase 9C collaboration panel in Share modal | false |
| `REACT_APP_REALTIME_BASELINE_ENABLED` | Enables Phase 9D presence/session awareness UI | false |
| `REACT_APP_REALTIME_PRESENCE_HEARTBEAT_SEC` | Frontend heartbeat cadence (seconds) for presence baseline | 20 |
| `REACT_APP_COEDITING_EXPERIMENT_ENABLED` | Enables Phase 10D co-editing live-editing UI mode (future phase) | false |
| `REACT_APP_PERMISSION_GATING_ENABLED` | Enables Phase 9E API-driven role/feature UI gating | false |
| `REACT_APP_SCREENSHOT_JOB_PIPELINE_ENABLED` | Enables Phase 9F full screenshot job pipeline in UI | false |

Temporary testing note:
- `TEST_AUTH_ENABLED=true` allows login with auto-created fake accounts and seeds the default test user above.
- In test mode, the seed account password is refreshed on backend restart/deploy.
- Accepted truthy values for `TEST_AUTH_ENABLED`: `true`, `1`, `yes`, `on` (case-insensitive).
- `AUTH_HEADER_FALLBACK=true` lets the frontend send `Authorization: Bearer ...` if browser cross-site cookies are blocked.
- Set `TEST_AUTH_ENABLED=false` before launch.

## Tech Stack

- **Backend**: Node.js, Express, PostgreSQL (runtime), SQLite (local/dev), Playwright
- **Frontend**: React, Lucide Icons
- **Auth**: JWT + HTTP-only cookies

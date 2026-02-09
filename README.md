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
# - DB_PATH = /data/mapmat.db   # if using a Railway volume mounted at /data
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

## SQLite Persistence on Railway

1. Add a Railway Volume to the backend service.
2. Mount the volume to `/data` (or any mount path you choose).
3. Set `DB_PATH` to `<mount-path>/mapmat.db` (example: `/data/mapmat.db`).
4. Redeploy and confirm startup logs include the mounted `DB_PATH`.

## Environment Variables

### Backend
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 4002 |
| `FRONTEND_URL` | Frontend URL for CORS | http://localhost:3000 |
| `ALLOW_VERCEL_PREVIEWS` | Allow `*.vercel.app` preview origins for CORS | false |
| `JWT_SECRET` | Secret for JWT tokens | (dev default) |
| `NODE_ENV` | Environment | development |
| `DB_PATH` | SQLite database file path | `./data/mapmat.db` locally, `/data/mapmat.db` on Railway volume |
| `TEST_AUTH_ENABLED` | Enables temporary test-account mode | true locally, false in production |
| `TEST_AUTH_SEED_EMAIL` | Seed account email when test mode is enabled | matt@email.com |
| `TEST_AUTH_SEED_PASSWORD` | Seed account password when test mode is enabled | Admin123 |
| `TEST_AUTH_SEED_NAME` | Seed account display name when test mode is enabled | Matt Test |
| `AUTH_HEADER_FALLBACK` | Allows bearer token auth header fallback when cross-site cookies fail | same default as `TEST_AUTH_ENABLED` |
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

Temporary testing note:
- `TEST_AUTH_ENABLED=true` allows login with auto-created fake accounts and seeds the default test user above.
- In test mode, the seed account password is refreshed on backend restart/deploy.
- Accepted truthy values for `TEST_AUTH_ENABLED`: `true`, `1`, `yes`, `on` (case-insensitive).
- `AUTH_HEADER_FALLBACK=true` lets the frontend send `Authorization: Bearer ...` if browser cross-site cookies are blocked.
- Set `TEST_AUTH_ENABLED=false` before launch.

## Tech Stack

- **Backend**: Node.js, Express, SQLite, Playwright
- **Frontend**: React, Lucide Icons
- **Auth**: JWT + HTTP-only cookies

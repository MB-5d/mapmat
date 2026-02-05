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

### Backend (Port 4000)
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
```

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

### Option 2: Quick Deploy Links

1. **Backend**: Push to GitHub, then connect to [Railway](https://railway.app/new)
2. **Frontend**: Push to GitHub, then import at [Vercel](https://vercel.com/new)

## Environment Variables

### Backend
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 4000 |
| `FRONTEND_URL` | Frontend URL for CORS | http://localhost:3000 |
| `JWT_SECRET` | Secret for JWT tokens | (dev default) |
| `NODE_ENV` | Environment | development |
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
| `REACT_APP_API_BASE` | Backend API URL | http://localhost:4000 |

## Tech Stack

- **Backend**: Node.js, Express, SQLite, Playwright
- **Frontend**: React, Lucide Icons
- **Auth**: JWT + HTTP-only cookies

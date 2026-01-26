# CLAUDE.md - Map Mat Codebase Guide

This document provides AI assistants with comprehensive context about the Map Mat codebase structure, development workflows, and coding conventions.

## Project Overview

**Map Mat** is a full-stack web application that intelligently crawls websites and generates interactive visual sitemaps (tree diagrams). It features user authentication, project management, sharing capabilities, and export functionality (PNG/PDF/SVG).

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js 18+, Express.js |
| **Frontend** | React 18, Create React App |
| **Database** | SQLite (better-sqlite3) |
| **Web Crawling** | Playwright, Cheerio, Axios |
| **Authentication** | JWT + HTTP-only cookies, bcryptjs |
| **Icons** | Lucide React |
| **Drag & Drop** | @dnd-kit |
| **Export** | html-to-image, jsPDF |
| **Styling** | Custom CSS (no framework) |

## Directory Structure

```
/home/user/mapmat/
├── server.js              # Main Express server + crawling logic
├── db.js                  # SQLite database setup & schema
├── package.json           # Backend dependencies
├── railway.json           # Railway deployment config
├── routes/
│   ├── auth.js            # Authentication routes (/auth/*)
│   └── api.js             # REST API routes (/api/*)
├── screenshots/           # Generated webpage screenshots (gitignored)
├── data/                  # SQLite database storage (gitignored)
│
└── frontend/
    ├── package.json       # Frontend dependencies
    ├── vercel.json        # Vercel deployment config
    ├── public/            # Static assets
    └── src/
        ├── App.js         # Main application component
        ├── App.css        # Main application styles
        ├── LandingPage.js # Marketing/info page
        ├── api.js         # API client wrapper
        ├── components/
        │   ├── toolbar/   # Topbar, CanvasToolbar, RightRail, ZoomControls, etc.
        │   ├── modals/    # AuthModal, SaveMapModal, ExportModal, ShareModal, etc.
        │   ├── nodes/     # NodeCard (tree node component)
        │   ├── comments/  # CommentsPanel, CommentPopover
        │   ├── scan/      # ScanBar, ScanProgressModal
        │   ├── reports/   # ReportDrawer
        │   └── ui/        # Button, IconButton, TextInput, SelectInput
        └── utils/
            ├── url.js         # URL parsing utilities
            └── classNames.js  # CSS class concatenation utility
```

## Development Commands

### Backend (runs on port 4000)
```bash
cd /home/user/mapmat
npm install
node server.js
```

### Frontend (runs on port 3000)
```bash
cd /home/user/mapmat/frontend
npm install
npm start          # Development server with hot reload
npm run build      # Production build to /frontend/build/
npm test           # Run Jest tests
```

## Environment Variables

### Backend
| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | 4000 | Server port |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend origin for CORS |
| `JWT_SECRET` | `mapmat-dev-secret-change-in-production` | JWT signing key (CHANGE IN PRODUCTION) |
| `NODE_ENV` | `development` | Environment mode |
| `DISABLE_SCREENSHOTS` | (unset) | Set to disable screenshot feature |

### Frontend
| Variable | Default | Purpose |
|----------|---------|---------|
| `REACT_APP_API_BASE` | `http://localhost:4000` | Backend API URL |

## Database Schema

SQLite database with 5 main tables in `data/mapmat.db`:

- **users**: `id`, `email` (UNIQUE), `password_hash`, `name`, `created_at`, `updated_at`
- **projects**: `id`, `user_id` (FK), `name`, `created_at`, `updated_at`
- **maps**: `id`, `user_id` (FK), `project_id` (FK nullable), `name`, `url`, `root_data` (JSON), `colors` (JSON)
- **scan_history**: `id`, `user_id` (FK), `url`, `hostname`, `title`, `page_count`, `root_data` (JSON), `colors` (JSON)
- **shares**: `id`, `map_id` (FK nullable), `user_id` (FK), `root_data` (JSON), `colors` (JSON), `expires_at`, `view_count`

All tables use TEXT UUIDs as primary keys and have appropriate indexes on foreign keys.

## API Endpoints

### Authentication (`/auth/`)
- `POST /auth/signup` - Create account (email, password, name)
- `POST /auth/login` - Login (email, password)
- `POST /auth/logout` - Logout (clears cookie)
- `GET /auth/me` - Get current user
- `PUT /auth/me` - Update profile/password
- `DELETE /auth/me` - Delete account (requires password)

### Projects (`/api/projects`)
- `GET /api/projects` - List user's projects
- `POST /api/projects` - Create project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Maps (`/api/maps`)
- `GET /api/maps` - List maps (optional `?project_id=` filter)
- `GET /api/maps/:id` - Get specific map
- `POST /api/maps` - Save new map
- `PUT /api/maps/:id` - Update map
- `DELETE /api/maps/:id` - Delete map

### History (`/api/history`)
- `GET /api/history` - Get scan history
- `POST /api/history` - Add to history
- `DELETE /api/history` - Delete history items

### Shares (`/api/shares`)
- `POST /api/shares` - Create share link
- `GET /api/shares/:id` - Get shared map (public, no auth)
- `GET /api/shares` - Get user's shares
- `DELETE /api/shares/:id` - Delete share

### Scanning (main server.js)
- `POST /scan` - Initiate website crawl
- `GET /scan-stream` - Server-Sent Events for real-time progress
- `GET /screenshot` - Capture webpage screenshot
- `GET /screenshots/*` - Serve cached screenshots
- `GET /health` - Health check endpoint

## Code Conventions

### Frontend Patterns

**Component Structure:**
- Functional components with React hooks (`useState`, `useEffect`, `useRef`)
- Use `React.forwardRef` when components need to expose refs
- Set `displayName` for forwardRef components

**CSS Class Naming:**
```javascript
// Use the classNames utility for conditional classes
import classNames from '../../utils/classNames';

className={classNames('ui-btn', `ui-btn--${variant}`, `ui-btn--${size}`, conditionalClass)}
```

**UI Component Convention:**
- BEM-like naming: `.ui-btn`, `.ui-btn--primary`, `.ui-btn--md`
- Variant and size props: `variant="primary"`, `size="md"`
- Spread remaining props to the root element

**API Calls:**
```javascript
// Use the api.js wrapper functions
import { getProjects, createProject } from './api';

// All calls include credentials automatically
const projects = await getProjects();
```

### Backend Patterns

**Route Structure:**
```javascript
const express = require('express');
const router = express.Router();

// Use try-catch with consistent error responses
router.post('/endpoint', async (req, res) => {
  try {
    // ... logic
    res.json({ data });
  } catch (error) {
    console.error('Error description:', error);
    res.status(500).json({ error: 'User-friendly error message' });
  }
});

module.exports = router;
```

**Database Queries:**
```javascript
const db = require('../db');

// Use prepared statements
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
const result = db.prepare('INSERT INTO table (col) VALUES (?)').run(value);
```

**Authentication:**
- `authMiddleware` - Attaches `req.user` if authenticated (or null)
- `requireAuth` - Returns 401 if not authenticated
- Combine: `router.get('/protected', authMiddleware, requireAuth, handler)`

### Error Handling

**Backend:**
- Return JSON with `error` field: `res.status(400).json({ error: 'Message' })`
- Log errors to console with context: `console.error('Context:', error)`
- Use appropriate HTTP status codes (400, 401, 404, 500)

**Frontend:**
- Wrap API calls in try-catch
- Display user-friendly error messages
- The `fetchApi` wrapper throws errors for non-ok responses

## Important Files

| File | Purpose |
|------|---------|
| `server.js` | Main server, crawling logic, SSE streaming |
| `db.js` | Database schema, initialization, connection |
| `routes/auth.js` | Authentication routes and middleware |
| `routes/api.js` | CRUD routes for projects, maps, history, shares |
| `frontend/src/App.js` | Main React component, state management, layout |
| `frontend/src/api.js` | API client with all endpoint wrappers |
| `frontend/src/App.css` | Main stylesheet (3800+ lines) |

## Security Considerations

- Passwords hashed with bcryptjs (10 salt rounds)
- JWT tokens in HTTP-only cookies (7-day expiration)
- CORS configured for specific frontend origin
- All protected resources verify user ownership
- Query parameters sanitized (tracking params removed)
- Prepared statements prevent SQL injection

## Deployment

### Railway (Backend)
```bash
railway login
railway init
railway up
# Set env vars in dashboard: FRONTEND_URL, JWT_SECRET, NODE_ENV=production
```

### Vercel (Frontend)
```bash
vercel login
cd frontend && vercel
# Set env var: REACT_APP_API_BASE=https://your-railway-url.up.railway.app
```

## Git Conventions

Files ignored (from .gitignore):
- `node_modules/`, `frontend/node_modules/`
- `frontend/build/`
- `data/`, `*.db` (database)
- `screenshots/` (cached screenshots)
- `.env*` (environment files)
- `.claude/` (Claude Code workspace)

## Testing

- Jest configured via react-scripts in frontend
- Run: `cd frontend && npm test`
- Test file: `frontend/src/App.test.js`

## Common Tasks for AI Assistants

### Adding a New API Endpoint
1. Add route handler in `routes/api.js` or `routes/auth.js`
2. Add corresponding function in `frontend/src/api.js`
3. Use `authMiddleware` and `requireAuth` for protected endpoints

### Adding a New React Component
1. Create component in appropriate `frontend/src/components/` subdirectory
2. Use functional component with hooks pattern
3. Import from Lucide React for icons: `import { IconName } from 'lucide-react'`
4. Use `classNames` utility for dynamic class names

### Adding a New Modal
1. Create in `frontend/src/components/modals/`
2. Follow existing modal pattern (overlay, close button, form handling)
3. Add modal state in App.js and trigger logic

### Database Schema Changes
1. Update schema in `db.js`
2. For development: Delete `data/mapmat.db` to recreate
3. For production: Write migration script

## Notes

- The main `App.js` is large (~1300 lines) - consider component extraction for major changes
- Screenshot caching uses 1-hour TTL with URL-based hash filenames
- Real-time scan progress uses Server-Sent Events (SSE)
- Dark mode is supported via CSS custom properties and state

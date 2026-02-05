/**
 * API routes for Map Mat - Projects, Maps, History, Shares
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, requireAuth } = require('./auth');

const router = express.Router();

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || null;

function requireAdminKey(req, res, next) {
  if (!ADMIN_API_KEY) {
    return res.status(503).json({ error: 'Admin access not configured' });
  }
  const key = req.get('x-admin-key') || req.get('x-api-key') || req.query?.admin_key;
  if (key !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

function parsePagination(query, { defaultLimit = DEFAULT_PAGE_SIZE, maxLimit = MAX_PAGE_SIZE } = {}) {
  const limitRaw = query?.limit;
  const offsetRaw = query?.offset;
  const parsedLimit = Number.parseInt(limitRaw, 10);
  const parsedOffset = Number.parseInt(offsetRaw, 10);

  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), maxLimit)
    : defaultLimit;
  const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

  return { limit, offset };
}

// Safe JSON.parse wrapper — returns fallback for null/undefined,
// throws descriptive error if parsing fails.
function safeParse(raw, fieldName, fallback = undefined) {
  if (raw === null || raw === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required field: ${fieldName}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in ${fieldName}: ${e.message}`);
  }
}

// Shared parser for map/history/share rows that store JSON in *_data columns.
function parseMapFields(row) {
  return {
    root: safeParse(row.root_data, 'root_data'),
    orphans: safeParse(row.orphans_data, 'orphans_data', []),
    connections: safeParse(row.connections_data, 'connections_data', []),
    colors: safeParse(row.colors, 'colors', null),
    connectionColors: safeParse(row.connection_colors, 'connection_colors', null),
    root_data: undefined,
    orphans_data: undefined,
    connections_data: undefined,
    connection_colors: undefined,
  };
}

// Apply auth middleware to all routes
router.use(authMiddleware);

// ============================================
// ADMIN / USAGE
// ============================================

// GET /api/admin/usage - Aggregated usage metrics
router.get('/admin/usage', requireAdminKey, (req, res) => {
  try {
    const daysRaw = Number.parseInt(req.query?.days, 10);
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 30;
    const since = `-${days} days`;

    const byDay = db.prepare(`
      SELECT date(created_at) as day, event_type as eventType,
             COUNT(*) as events, SUM(quantity) as quantity
      FROM usage_events
      WHERE created_at >= datetime('now', ?)
      GROUP BY day, eventType
      ORDER BY day DESC
    `).all(since);

    const totals = db.prepare(`
      SELECT event_type as eventType, COUNT(*) as events, SUM(quantity) as quantity
      FROM usage_events
      WHERE created_at >= datetime('now', ?)
      GROUP BY eventType
      ORDER BY events DESC
    `).all(since);

    res.json({ days, totals, byDay });
  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({ error: 'Failed to get usage' });
  }
});

// ============================================
// PROJECTS
// ============================================

// GET /api/projects - Get all projects for current user
router.get('/projects', requireAuth, (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const projects = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM maps WHERE project_id = p.id) as map_count
      FROM projects p
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, limit, offset);
    const total = db.prepare('SELECT COUNT(*) as count FROM projects WHERE user_id = ?').get(req.user.id)?.count || 0;

    res.json({ projects, pagination: { limit, offset, total } });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to get projects' });
  }
});

// POST /api/projects - Create a new project
router.post('/projects', requireAuth, (req, res) => {
  try {
    const { name } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const projectId = uuidv4();

    db.prepare(`
      INSERT INTO projects (id, user_id, name)
      VALUES (?, ?, ?)
    `).run(projectId, req.user.id, name.trim());

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);

    res.json({ project: { ...project, map_count: 0 } });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// PUT /api/projects/:id - Update a project
router.put('/projects/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    // Verify ownership
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    db.prepare(`
      UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name.trim(), id);

    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    const mapCount = db.prepare('SELECT COUNT(*) as count FROM maps WHERE project_id = ?').get(id);

    res.json({ project: { ...updated, map_count: mapCount.count } });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:id - Delete a project
router.delete('/projects/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Delete project (maps will have project_id set to NULL due to ON DELETE SET NULL)
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// ============================================
// MAPS
// ============================================

// GET /api/maps - Get all maps for current user (optionally filtered by project)
router.get('/maps', requireAuth, (req, res) => {
  try {
    const { project_id } = req.query;
    const { limit, offset } = parsePagination(req.query);

    let query = `
      SELECT m.*, p.name as project_name
      FROM maps m
      LEFT JOIN projects p ON m.project_id = p.id
      WHERE m.user_id = ?
    `;
    const params = [req.user.id];

    if (project_id) {
      query += ' AND m.project_id = ?';
      params.push(project_id);
    }

    query += ' ORDER BY m.updated_at DESC LIMIT ? OFFSET ?';

    const maps = db.prepare(query).all(...params, limit, offset);
    let total = 0;
    if (project_id) {
      total = db.prepare('SELECT COUNT(*) as count FROM maps WHERE user_id = ? AND project_id = ?')
        .get(req.user.id, project_id)?.count || 0;
    } else {
      total = db.prepare('SELECT COUNT(*) as count FROM maps WHERE user_id = ?')
        .get(req.user.id)?.count || 0;
    }

    // Parse JSON fields
    const parsed = maps.map(m => ({
      ...m,
      ...parseMapFields(m),
    }));

    res.json({ maps: parsed, pagination: { limit, offset, total } });
  } catch (error) {
    console.error('Get maps error:', error);
    res.status(500).json({ error: 'Failed to get maps' });
  }
});

// GET /api/maps/:id - Get a specific map
router.get('/maps/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;

    const map = db.prepare(`
      SELECT m.*, p.name as project_name
      FROM maps m
      LEFT JOIN projects p ON m.project_id = p.id
      WHERE m.id = ? AND m.user_id = ?
    `).get(id, req.user.id);

    if (!map) {
      return res.status(404).json({ error: 'Map not found' });
    }

    res.json({
      map: {
        ...map,
        ...parseMapFields(map),
      },
    });
  } catch (error) {
    console.error('Get map error:', error);
    res.status(500).json({ error: 'Failed to get map' });
  }
});

// POST /api/maps - Save a new map
router.post('/maps', requireAuth, (req, res) => {
  try {
    const { name, url, root, orphans, connections, colors, connectionColors, project_id } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Map name is required' });
    }

    if (!root) {
      return res.status(400).json({ error: 'Map data is required' });
    }

    // If project_id provided, verify ownership
    if (project_id) {
      const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(project_id, req.user.id);
      if (!project) {
        return res.status(400).json({ error: 'Project not found' });
      }
    }

    const mapId = uuidv4();

    db.prepare(`
      INSERT INTO maps (id, user_id, project_id, name, url, root_data, orphans_data, connections_data, colors, connection_colors)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      mapId,
      req.user.id,
      project_id || null,
      name.trim(),
      url || root.url || '',
      JSON.stringify(root),
      orphans ? JSON.stringify(orphans) : null,
      connections ? JSON.stringify(connections) : null,
      colors ? JSON.stringify(colors) : null,
      connectionColors ? JSON.stringify(connectionColors) : null
    );

    const map = db.prepare('SELECT * FROM maps WHERE id = ?').get(mapId);

    res.json({
      map: {
        ...map,
        ...parseMapFields(map),
      },
    });
  } catch (error) {
    console.error('Create map error:', error);
    res.status(500).json({ error: 'Failed to save map' });
  }
});

// PUT /api/maps/:id - Update a map
router.put('/maps/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { name, root, orphans, connections, colors, connectionColors, project_id } = req.body;

    // Verify ownership
    const map = db.prepare('SELECT * FROM maps WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!map) {
      return res.status(404).json({ error: 'Map not found' });
    }

    // Build update query
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (root !== undefined) {
      updates.push('root_data = ?');
      params.push(JSON.stringify(root));
    }
    if (orphans !== undefined) {
      updates.push('orphans_data = ?');
      params.push(orphans ? JSON.stringify(orphans) : null);
    }
    if (connections !== undefined) {
      updates.push('connections_data = ?');
      params.push(connections ? JSON.stringify(connections) : null);
    }
    if (colors !== undefined) {
      updates.push('colors = ?');
      params.push(colors ? JSON.stringify(colors) : null);
    }
    if (connectionColors !== undefined) {
      updates.push('connection_colors = ?');
      params.push(connectionColors ? JSON.stringify(connectionColors) : null);
    }
    if (project_id !== undefined) {
      // Verify project ownership if setting a project
      if (project_id) {
        const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(project_id, req.user.id);
        if (!project) {
          return res.status(400).json({ error: 'Project not found' });
        }
      }
      updates.push('project_id = ?');
      params.push(project_id || null);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      db.prepare(`UPDATE maps SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const updated = db.prepare('SELECT * FROM maps WHERE id = ?').get(id);

    res.json({
      map: {
        ...updated,
        ...parseMapFields(updated),
      },
    });
  } catch (error) {
    console.error('Update map error:', error);
    res.status(500).json({ error: 'Failed to update map' });
  }
});

// DELETE /api/maps/:id - Delete a map
router.delete('/maps/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const map = db.prepare('SELECT * FROM maps WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!map) {
      return res.status(404).json({ error: 'Map not found' });
    }

    db.prepare('DELETE FROM maps WHERE id = ?').run(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete map error:', error);
    res.status(500).json({ error: 'Failed to delete map' });
  }
});

// GET /api/maps/:id/versions - Get version history for a map
router.get('/maps/:id/versions', requireAuth, (req, res) => {
  try {
    const { id } = req.params;

    const map = db.prepare('SELECT id FROM maps WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!map) {
      return res.status(404).json({ error: 'Map not found' });
    }

    const versions = db.prepare(`
      SELECT * FROM map_versions
      WHERE map_id = ? AND user_id = ?
      ORDER BY created_at DESC
      LIMIT 25
    `).all(id, req.user.id);

    const parsed = versions.map((v) => ({
      ...v,
      ...parseMapFields(v),
    }));

    res.json({ versions: parsed });
  } catch (error) {
    console.error('Get map versions error:', error);
    res.status(500).json({ error: 'Failed to get map versions' });
  }
});

// POST /api/maps/:id/versions - Create a new version
router.post('/maps/:id/versions', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { root, orphans, connections, colors, connectionColors, name, notes } = req.body;

    if (!root) {
      return res.status(400).json({ error: 'Map data is required' });
    }

    const map = db.prepare('SELECT id FROM maps WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!map) {
      return res.status(404).json({ error: 'Map not found' });
    }

    const versionRow = db.prepare(`
      SELECT MAX(version_number) as maxVersion
      FROM map_versions
      WHERE map_id = ? AND user_id = ?
    `).get(id, req.user.id);
    const nextVersion = (versionRow?.maxVersion || 0) + 1;

    const versionId = uuidv4();
    const title = name?.trim() || 'Updated';

    db.prepare(`
      INSERT INTO map_versions (
        id, map_id, user_id, version_number, name, notes,
        root_data, orphans_data, connections_data, colors, connection_colors
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      versionId,
      id,
      req.user.id,
      nextVersion,
      title,
      notes?.trim() || null,
      JSON.stringify(root),
      orphans ? JSON.stringify(orphans) : null,
      connections ? JSON.stringify(connections) : null,
      colors ? JSON.stringify(colors) : null,
      connectionColors ? JSON.stringify(connectionColors) : null
    );

    const allVersions = db.prepare(`
      SELECT id FROM map_versions
      WHERE map_id = ? AND user_id = ?
      ORDER BY created_at DESC
    `).all(id, req.user.id);

    if (allVersions.length > 25) {
      const toDelete = allVersions.slice(25).map((row) => row.id);
      const placeholders = toDelete.map(() => '?').join(',');
      db.prepare(`DELETE FROM map_versions WHERE id IN (${placeholders})`).run(...toDelete);
    }

    const saved = db.prepare('SELECT * FROM map_versions WHERE id = ?').get(versionId);

    res.json({
      version: {
        ...saved,
        ...parseMapFields(saved),
      },
    });
  } catch (error) {
    console.error('Create map version error:', error);
    res.status(500).json({ error: 'Failed to create map version' });
  }
});

// ============================================
// SCAN HISTORY
// ============================================

// GET /api/history - Get scan history for current user
router.get('/history', requireAuth, (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });

    const history = db.prepare(`
      SELECT * FROM scan_history
      WHERE user_id = ?
      ORDER BY scanned_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, limit, offset);
    const total = db.prepare('SELECT COUNT(*) as count FROM scan_history WHERE user_id = ?')
      .get(req.user.id)?.count || 0;

    // Parse JSON fields
    const parsed = history.map(h => ({
      ...h,
      ...parseMapFields(h),
      scan_options: safeParse(h.scan_options, 'scan_options', null),
      scan_depth: h.scan_depth ?? null,
      map_id: h.map_id || null,
    }));

    res.json({ history: parsed, pagination: { limit, offset, total } });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// POST /api/history - Add to scan history
router.post('/history', requireAuth, (req, res) => {
  try {
    const { url, hostname, title, page_count, root, orphans, connections, colors, connectionColors, scan_options, scan_depth, map_id } = req.body;

    if (!root) {
      return res.status(400).json({ error: 'Scan data is required' });
    }

    const historyId = uuidv4();

    db.prepare(`
      INSERT INTO scan_history (id, user_id, url, hostname, title, page_count, root_data, orphans_data, connections_data, colors, connection_colors, scan_options, scan_depth, map_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      historyId,
      req.user.id,
      url || root.url || '',
      hostname || '',
      title || '',
      page_count || 0,
      JSON.stringify(root),
      orphans ? JSON.stringify(orphans) : null,
      connections ? JSON.stringify(connections) : null,
      colors ? JSON.stringify(colors) : null,
      connectionColors ? JSON.stringify(connectionColors) : null,
      scan_options ? JSON.stringify(scan_options) : null,
      scan_depth ?? null,
      map_id || null
    );

    // Keep only last 50 entries
    db.prepare(`
      DELETE FROM scan_history
      WHERE user_id = ? AND id NOT IN (
        SELECT id FROM scan_history
        WHERE user_id = ?
        ORDER BY scanned_at DESC
        LIMIT 50
      )
    `).run(req.user.id, req.user.id);

    res.json({ success: true, id: historyId });
  } catch (error) {
    console.error('Add history error:', error);
    res.status(500).json({ error: 'Failed to add to history' });
  }
});

// PUT /api/history/:id - Update a history item (e.g., attach saved map)
router.put('/history/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { map_id } = req.body || {};

    const historyItem = db.prepare('SELECT * FROM scan_history WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!historyItem) {
      return res.status(404).json({ error: 'History item not found' });
    }

    db.prepare(`
      UPDATE scan_history SET map_id = ?, scanned_at = scanned_at
      WHERE id = ?
    `).run(map_id || null, id);

    res.json({ success: true });
  } catch (error) {
    console.error('Update history error:', error);
    res.status(500).json({ error: 'Failed to update history' });
  }
});

// DELETE /api/history - Delete history items
router.delete('/history', requireAuth, (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs are required' });
    }

    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`
      DELETE FROM scan_history
      WHERE id IN (${placeholders}) AND user_id = ?
    `).run(...ids, req.user.id);

    res.json({ success: true, deleted: ids.length });
  } catch (error) {
    console.error('Delete history error:', error);
    res.status(500).json({ error: 'Failed to delete history' });
  }
});

// ============================================
// SHARES
// ============================================

// POST /api/shares - Create a share link
router.post('/shares', requireAuth, (req, res) => {
  try {
    const { map_id, root, orphans, connections, colors, connectionColors, expires_in_days } = req.body;

    if (!root) {
      return res.status(400).json({ error: 'Map data is required' });
    }

    // If map_id provided, verify ownership
    if (map_id) {
      const map = db.prepare('SELECT id FROM maps WHERE id = ? AND user_id = ?').get(map_id, req.user.id);
      if (!map) {
        return res.status(400).json({ error: 'Map not found' });
      }
    }

    const shareId = uuidv4();
    const expiresAt = expires_in_days
      ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
      : null;

    db.prepare(`
      INSERT INTO shares (id, map_id, user_id, root_data, orphans_data, connections_data, colors, connection_colors, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      shareId,
      map_id || null,
      req.user.id,
      JSON.stringify(root),
      orphans ? JSON.stringify(orphans) : null,
      connections ? JSON.stringify(connections) : null,
      colors ? JSON.stringify(colors) : null,
      connectionColors ? JSON.stringify(connectionColors) : null,
      expiresAt
    );

    res.json({
      share: {
        id: shareId,
        expiresAt,
      },
    });
  } catch (error) {
    console.error('Create share error:', error);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

// GET /api/shares/:id - Get a shared map (public, no auth required)
router.get('/shares/:id', (req, res) => {
  try {
    const { id } = req.params;

    const share = db.prepare(`
      SELECT s.*, u.name as shared_by_name
      FROM shares s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `).get(id);

    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }

    // Check expiration
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This share link has expired' });
    }

    // Increment view count
    db.prepare('UPDATE shares SET view_count = view_count + 1 WHERE id = ?').run(id);

    res.json({
      share: {
        id: share.id,
        ...parseMapFields(share),
        sharedBy: share.shared_by_name,
        createdAt: share.created_at,
        viewCount: share.view_count + 1,
      },
    });
  } catch (error) {
    console.error('Get share error:', error);
    res.status(500).json({ error: 'Failed to get shared map' });
  }
});

// DELETE /api/shares/:id - Delete a share link
router.delete('/shares/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const share = db.prepare('SELECT * FROM shares WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }

    db.prepare('DELETE FROM shares WHERE id = ?').run(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete share error:', error);
    res.status(500).json({ error: 'Failed to delete share link' });
  }
});

// GET /api/shares - Get all shares created by current user
router.get('/shares', requireAuth, (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const shares = db.prepare(`
      SELECT s.id, s.map_id, s.created_at, s.expires_at, s.view_count,
        m.name as map_name
      FROM shares s
      LEFT JOIN maps m ON s.map_id = m.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, limit, offset);
    const total = db.prepare('SELECT COUNT(*) as count FROM shares WHERE user_id = ?')
      .get(req.user.id)?.count || 0;

    res.json({ shares, pagination: { limit, offset, total } });
  } catch (error) {
    console.error('Get shares error:', error);
    res.status(500).json({ error: 'Failed to get shares' });
  }
});

module.exports = router;

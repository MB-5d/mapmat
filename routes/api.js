/**
 * API routes for Map Mat - Projects, Maps, History, Shares
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, requireAuth } = require('./auth');

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// ============================================
// PROJECTS
// ============================================

// GET /api/projects - Get all projects for current user
router.get('/projects', requireAuth, (req, res) => {
  try {
    const projects = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM maps WHERE project_id = p.id) as map_count
      FROM projects p
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `).all(req.user.id);

    res.json({ projects });
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

    query += ' ORDER BY m.updated_at DESC';

    const maps = db.prepare(query).all(...params);

    // Parse JSON fields
    const parsed = maps.map(m => ({
      ...m,
      root: JSON.parse(m.root_data),
      orphans: m.orphans_data ? JSON.parse(m.orphans_data) : [],
      connections: m.connections_data ? JSON.parse(m.connections_data) : [],
      colors: m.colors ? JSON.parse(m.colors) : null,
      root_data: undefined,
      orphans_data: undefined,
      connections_data: undefined,
    }));

    res.json({ maps: parsed });
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
        root: JSON.parse(map.root_data),
        orphans: map.orphans_data ? JSON.parse(map.orphans_data) : [],
        connections: map.connections_data ? JSON.parse(map.connections_data) : [],
        colors: map.colors ? JSON.parse(map.colors) : null,
        root_data: undefined,
        orphans_data: undefined,
        connections_data: undefined,
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
    const { name, url, root, orphans, connections, colors, project_id } = req.body;

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
      INSERT INTO maps (id, user_id, project_id, name, url, root_data, orphans_data, connections_data, colors)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      mapId,
      req.user.id,
      project_id || null,
      name.trim(),
      url || root.url || '',
      JSON.stringify(root),
      orphans ? JSON.stringify(orphans) : null,
      connections ? JSON.stringify(connections) : null,
      colors ? JSON.stringify(colors) : null
    );

    const map = db.prepare('SELECT * FROM maps WHERE id = ?').get(mapId);

    res.json({
      map: {
        ...map,
        root: JSON.parse(map.root_data),
        orphans: map.orphans_data ? JSON.parse(map.orphans_data) : [],
        connections: map.connections_data ? JSON.parse(map.connections_data) : [],
        colors: map.colors ? JSON.parse(map.colors) : null,
        root_data: undefined,
        orphans_data: undefined,
        connections_data: undefined,
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
    const { name, root, orphans, connections, colors, project_id } = req.body;

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
        root: JSON.parse(updated.root_data),
        orphans: updated.orphans_data ? JSON.parse(updated.orphans_data) : [],
        connections: updated.connections_data ? JSON.parse(updated.connections_data) : [],
        colors: updated.colors ? JSON.parse(updated.colors) : null,
        root_data: undefined,
        orphans_data: undefined,
        connections_data: undefined,
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

// ============================================
// SCAN HISTORY
// ============================================

// GET /api/history - Get scan history for current user
router.get('/history', requireAuth, (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const history = db.prepare(`
      SELECT * FROM scan_history
      WHERE user_id = ?
      ORDER BY scanned_at DESC
      LIMIT ?
    `).all(req.user.id, parseInt(limit));

    // Parse JSON fields
    const parsed = history.map(h => ({
      ...h,
      root: JSON.parse(h.root_data),
      colors: h.colors ? JSON.parse(h.colors) : null,
      root_data: undefined,
    }));

    res.json({ history: parsed });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// POST /api/history - Add to scan history
router.post('/history', requireAuth, (req, res) => {
  try {
    const { url, hostname, title, page_count, root, colors } = req.body;

    if (!root) {
      return res.status(400).json({ error: 'Scan data is required' });
    }

    const historyId = uuidv4();

    db.prepare(`
      INSERT INTO scan_history (id, user_id, url, hostname, title, page_count, root_data, colors)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      historyId,
      req.user.id,
      url || root.url || '',
      hostname || '',
      title || '',
      page_count || 0,
      JSON.stringify(root),
      colors ? JSON.stringify(colors) : null
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
    const { map_id, root, orphans, connections, colors, expires_in_days } = req.body;

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
      INSERT INTO shares (id, map_id, user_id, root_data, orphans_data, connections_data, colors, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      shareId,
      map_id || null,
      req.user.id,
      JSON.stringify(root),
      orphans ? JSON.stringify(orphans) : null,
      connections ? JSON.stringify(connections) : null,
      colors ? JSON.stringify(colors) : null,
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
        root: JSON.parse(share.root_data),
        orphans: share.orphans_data ? JSON.parse(share.orphans_data) : [],
        connections: share.connections_data ? JSON.parse(share.connections_data) : [],
        colors: share.colors ? JSON.parse(share.colors) : null,
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
    const shares = db.prepare(`
      SELECT s.id, s.map_id, s.created_at, s.expires_at, s.view_count,
        m.name as map_name
      FROM shares s
      LEFT JOIN maps m ON s.map_id = m.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `).all(req.user.id);

    res.json({ shares });
  } catch (error) {
    console.error('Get shares error:', error);
    res.status(500).json({ error: 'Failed to get shares' });
  }
});

module.exports = router;

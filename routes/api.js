/**
 * API routes for Map Mat - Projects, Maps, History, Shares
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const projectStore = require('../stores/projectStore');
const mapStore = require('../stores/mapStore');
const historyStore = require('../stores/historyStore');
const shareStore = require('../stores/shareStore');
const usageStore = require('../stores/usageStore');
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
router.get('/admin/usage', requireAdminKey, async (req, res) => {
  try {
    const daysRaw = Number.parseInt(req.query?.days, 10);
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 30;
    const since = `-${days} days`;

    const byDay = await usageStore.getUsageByDaySinceAsync(since);
    const totals = await usageStore.getUsageTotalsSinceAsync(since);

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
router.get('/projects', requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const projects = await projectStore.listProjectsByUserAsync(req.user.id, { limit, offset });
    const total = await projectStore.countProjectsByUserAsync(req.user.id);

    res.json({ projects, pagination: { limit, offset, total } });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to get projects' });
  }
});

// POST /api/projects - Create a new project
router.post('/projects', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const projectId = uuidv4();

    await projectStore.createProjectAsync({
      id: projectId,
      userId: req.user.id,
      name: name.trim(),
    });
    const project = await projectStore.getProjectByIdAsync(projectId);

    res.json({ project: { ...project, map_count: 0 } });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// PUT /api/projects/:id - Update a project
router.put('/projects/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    // Verify ownership
    const project = await projectStore.getProjectForUserAsync(id, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    await projectStore.updateProjectNameAsync(id, name.trim());

    const updated = await projectStore.getProjectByIdAsync(id);
    const mapCount = await projectStore.countMapsByProjectAsync(id);

    res.json({ project: { ...updated, map_count: mapCount } });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:id - Delete a project
router.delete('/projects/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const project = await projectStore.getProjectForUserAsync(id, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Delete project (maps will have project_id set to NULL due to ON DELETE SET NULL)
    await projectStore.deleteProjectAsync(id);

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
router.get('/maps', requireAuth, async (req, res) => {
  try {
    const { project_id } = req.query;
    const { limit, offset } = parsePagination(req.query);

    const maps = await mapStore.listMapsByUserAsync({
      userId: req.user.id,
      projectId: project_id || null,
      limit,
      offset,
    });
    const total = await mapStore.countMapsByUserAsync({
      userId: req.user.id,
      projectId: project_id || null,
    });

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
router.get('/maps/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const map = await mapStore.getMapWithProjectForUserAsync(id, req.user.id);

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
router.post('/maps', requireAuth, async (req, res) => {
  try {
    const { name, url, root, orphans, connections, colors, connectionColors, project_id, notes } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Map name is required' });
    }

    if (!root) {
      return res.status(400).json({ error: 'Map data is required' });
    }

    // If project_id provided, verify ownership
    if (project_id) {
      const project = await projectStore.getProjectForUserAsync(project_id, req.user.id);
      if (!project) {
        return res.status(400).json({ error: 'Project not found' });
      }
    }

    const mapId = uuidv4();

    await mapStore.createMapAsync({
      id: mapId,
      userId: req.user.id,
      projectId: project_id || null,
      name: name.trim(),
      notes: notes ? notes.trim() : null,
      url: url || root.url || '',
      rootData: JSON.stringify(root),
      orphansData: orphans ? JSON.stringify(orphans) : null,
      connectionsData: connections ? JSON.stringify(connections) : null,
      colors: colors ? JSON.stringify(colors) : null,
      connectionColors: connectionColors ? JSON.stringify(connectionColors) : null,
    });

    const map = await mapStore.getMapByIdAsync(mapId);

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
router.put('/maps/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, root, orphans, connections, colors, connectionColors, project_id, notes } = req.body;

    // Verify ownership
    const map = await mapStore.getMapForUserAsync(id, req.user.id);
    if (!map) {
      return res.status(404).json({ error: 'Map not found' });
    }

    const patch = {};

    if (name !== undefined) {
      patch.name = name.trim();
    }
    if (notes !== undefined) {
      patch.notes = notes ? notes.trim() : null;
    }
    if (root !== undefined) {
      patch.rootData = JSON.stringify(root);
    }
    if (orphans !== undefined) {
      patch.orphansData = orphans ? JSON.stringify(orphans) : null;
    }
    if (connections !== undefined) {
      patch.connectionsData = connections ? JSON.stringify(connections) : null;
    }
    if (colors !== undefined) {
      patch.colors = colors ? JSON.stringify(colors) : null;
    }
    if (connectionColors !== undefined) {
      patch.connectionColors = connectionColors ? JSON.stringify(connectionColors) : null;
    }
    if (project_id !== undefined) {
      // Verify project ownership if setting a project
      if (project_id) {
        const project = await projectStore.getProjectForUserAsync(project_id, req.user.id);
        if (!project) {
          return res.status(400).json({ error: 'Project not found' });
        }
      }
      patch.projectId = project_id || null;
    }

    await mapStore.updateMapByIdAsync(id, patch);

    const updated = await mapStore.getMapByIdAsync(id);

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
router.delete('/maps/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const map = await mapStore.getMapForUserAsync(id, req.user.id);
    if (!map) {
      return res.status(404).json({ error: 'Map not found' });
    }

    await mapStore.deleteMapByIdAsync(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete map error:', error);
    res.status(500).json({ error: 'Failed to delete map' });
  }
});

// GET /api/maps/:id/versions - Get version history for a map
router.get('/maps/:id/versions', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const map = await mapStore.getMapForUserAsync(id, req.user.id);
    if (!map) {
      return res.status(404).json({ error: 'Map not found' });
    }

    const versions = await mapStore.listMapVersionsForUserMapAsync(id, req.user.id, 25);

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
router.post('/maps/:id/versions', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { root, orphans, connections, colors, connectionColors, name, notes } = req.body;

    if (!root) {
      return res.status(400).json({ error: 'Map data is required' });
    }

    const map = await mapStore.getMapForUserAsync(id, req.user.id);
    if (!map) {
      return res.status(404).json({ error: 'Map not found' });
    }

    const nextVersion = await mapStore.getNextMapVersionNumberAsync(id, req.user.id);

    const versionId = uuidv4();
    const title = name?.trim() || 'Updated';

    await mapStore.createMapVersionAsync({
      id: versionId,
      mapId: id,
      userId: req.user.id,
      versionNumber: nextVersion,
      name: title,
      notes: notes?.trim() || null,
      rootData: JSON.stringify(root),
      orphansData: orphans ? JSON.stringify(orphans) : null,
      connectionsData: connections ? JSON.stringify(connections) : null,
      colors: colors ? JSON.stringify(colors) : null,
      connectionColors: connectionColors ? JSON.stringify(connectionColors) : null,
    });

    const allVersions = await mapStore.listMapVersionIdsForUserMapAsync(id, req.user.id);

    if (allVersions.length > 25) {
      const toDelete = allVersions.slice(25).map((row) => row.id);
      await mapStore.deleteMapVersionsByIdsAsync(toDelete);
    }

    const saved = await mapStore.getMapVersionByIdAsync(versionId);

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
router.get('/history', requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });

    const history = await historyStore.listHistoryByUserAsync(req.user.id, { limit, offset });
    const total = await historyStore.countHistoryByUserAsync(req.user.id);

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
router.post('/history', requireAuth, async (req, res) => {
  try {
    const { url, hostname, title, page_count, root, orphans, connections, colors, connectionColors, scan_options, scan_depth, map_id } = req.body;

    if (!root) {
      return res.status(400).json({ error: 'Scan data is required' });
    }

    const historyId = uuidv4();

    await historyStore.createHistoryAsync({
      id: historyId,
      userId: req.user.id,
      url: url || root.url || '',
      hostname: hostname || '',
      title: title || '',
      pageCount: page_count || 0,
      rootData: JSON.stringify(root),
      orphansData: orphans ? JSON.stringify(orphans) : null,
      connectionsData: connections ? JSON.stringify(connections) : null,
      colors: colors ? JSON.stringify(colors) : null,
      connectionColors: connectionColors ? JSON.stringify(connectionColors) : null,
      scanOptions: scan_options ? JSON.stringify(scan_options) : null,
      scanDepth: scan_depth ?? null,
      mapId: map_id || null,
    });

    // Keep only last 50 entries
    await historyStore.trimHistoryByUserAsync(req.user.id, 50);

    res.json({ success: true, id: historyId });
  } catch (error) {
    console.error('Add history error:', error);
    res.status(500).json({ error: 'Failed to add to history' });
  }
});

// PUT /api/history/:id - Update a history item (e.g., attach saved map)
router.put('/history/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { map_id } = req.body || {};

    const historyItem = await historyStore.getHistoryItemForUserAsync(id, req.user.id);
    if (!historyItem) {
      return res.status(404).json({ error: 'History item not found' });
    }

    await historyStore.updateHistoryMapIdAsync(id, map_id || null);

    res.json({ success: true });
  } catch (error) {
    console.error('Update history error:', error);
    res.status(500).json({ error: 'Failed to update history' });
  }
});

// DELETE /api/history - Delete history items
router.delete('/history', requireAuth, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs are required' });
    }

    await historyStore.deleteHistoryByIdsForUserAsync(ids, req.user.id);

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
router.post('/shares', requireAuth, async (req, res) => {
  try {
    const { map_id, root, orphans, connections, colors, connectionColors, expires_in_days } = req.body;

    if (!root) {
      return res.status(400).json({ error: 'Map data is required' });
    }

    // If map_id provided, verify ownership
    if (map_id) {
      const map = await mapStore.getMapForUserAsync(map_id, req.user.id);
      if (!map) {
        return res.status(400).json({ error: 'Map not found' });
      }
    }

    const shareId = uuidv4();
    const expiresAt = expires_in_days
      ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString()
      : null;

    await shareStore.createShareAsync({
      id: shareId,
      mapId: map_id || null,
      userId: req.user.id,
      rootData: JSON.stringify(root),
      orphansData: orphans ? JSON.stringify(orphans) : null,
      connectionsData: connections ? JSON.stringify(connections) : null,
      colors: colors ? JSON.stringify(colors) : null,
      connectionColors: connectionColors ? JSON.stringify(connectionColors) : null,
      expiresAt,
    });

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
router.get('/shares/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const share = await shareStore.getShareWithUserByIdAsync(id);

    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }

    // Check expiration
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This share link has expired' });
    }

    // Increment view count
    await shareStore.incrementShareViewCountAsync(id);

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
router.delete('/shares/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const share = await shareStore.getShareForUserAsync(id, req.user.id);
    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }

    await shareStore.deleteShareAsync(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete share error:', error);
    res.status(500).json({ error: 'Failed to delete share link' });
  }
});

// GET /api/shares - Get all shares created by current user
router.get('/shares', requireAuth, async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const shares = await shareStore.listSharesByUserAsync(req.user.id, { limit, offset });
    const total = await shareStore.countSharesByUserAsync(req.user.id);

    res.json({ shares, pagination: { limit, offset, total } });
  } catch (error) {
    console.error('Get shares error:', error);
    res.status(500).json({ error: 'Failed to get shares' });
  }
});

module.exports = router;

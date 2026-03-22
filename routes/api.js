/**
 * API routes for Map Mat - Projects, Maps, History, Shares
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const projectStore = require('../stores/projectStore');
const mapStore = require('../stores/mapStore');
const collaborationStore = require('../stores/collaborationStore');
const mapCommentStore = require('../stores/mapCommentStore');
const historyStore = require('../stores/historyStore');
const shareStore = require('../stores/shareStore');
const usageStore = require('../stores/usageStore');
const emailDeliveryStore = require('../stores/emailDeliveryStore');
const { authMiddleware, requireAuth } = require('./auth');
const permissionPolicy = require('../policies/permissionPolicy');
const {
  ACTIVITY_SCOPES,
  ACTIVITY_TYPES,
  ensureCollaborationActivitySchemaAsync,
  recordMapActivityBestEffortAsync,
} = require('../utils/collaborationActivity');
const {
  resolveCoeditingRolloutAsync,
  resolveCoeditingSystemStatusAsync,
  summarizeCoeditingRolloutConfigAsync,
} = require('../utils/coeditingRollout');
const { getCoeditingHealthSnapshotAsync } = require('../utils/coeditingObservability');
const { buildHealthSnapshot: getEmailHealthSnapshot } = require('../utils/emailProvider');

const router = express.Router();

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || null;
const COLLABORATION_BACKEND_ENABLED = parseEnvBool(
  process.env.COLLABORATION_BACKEND_ENABLED,
  false
);

const FEATURE_GATES = Object.freeze({
  mapView: permissionPolicy.FEATURES.MAP_VIEW,
  activityView: permissionPolicy.FEATURES.ACTIVITY_VIEW,
  mapComment: permissionPolicy.FEATURES.MAP_COMMENT,
  mapEdit: permissionPolicy.FEATURES.MAP_EDIT,
  versionSave: permissionPolicy.FEATURES.VERSION_SAVE,
  historyManage: permissionPolicy.FEATURES.HISTORY_MANAGE,
  shareManage: permissionPolicy.FEATURES.SHARE_MANAGE,
  discoveryRun: permissionPolicy.FEATURES.DISCOVERY_RUN,
  collabPanelView: permissionPolicy.FEATURES.COLLAB_PANEL_VIEW,
  collabInviteSend: permissionPolicy.FEATURES.COLLAB_INVITE_SEND,
  collabSettingsManage: permissionPolicy.FEATURES.COLLAB_SETTINGS_MANAGE,
  accessRequestsView: permissionPolicy.FEATURES.ACCESS_REQUESTS_VIEW,
  accessRequestsCreate: permissionPolicy.FEATURES.ACCESS_REQUESTS_CREATE,
  presenceView: permissionPolicy.FEATURES.PRESENCE_VIEW,
});

function parseEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

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

function parseWindowDays(raw, fallback = 30, max = 365) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}

function parseJsonObject(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function redactSensitiveFields(value) {
  const sensitiveKeys = new Set([
    'inviteToken',
    'token',
    'acceptToken',
    'authorization',
    'apiKey',
    'api_key',
  ]);

  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveFields(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => {
      if (sensitiveKeys.has(key)) {
        return [key, '[redacted]'];
      }
      return [key, redactSensitiveFields(fieldValue)];
    })
  );
}

function serializeEmailDeliveryAdmin(row, { includeDebug = false } = {}) {
  if (!row) return null;

  const base = {
    id: row.id,
    jobId: row.job_id || null,
    mapId: row.map_id || null,
    inviteId: row.invite_id || null,
    templateKey: row.template_key,
    toEmail: row.to_email,
    fromEmail: row.from_email || null,
    replyToEmail: row.reply_to_email || null,
    subject: row.subject || null,
    provider: row.provider || null,
    status: row.status,
    attempts: Number(row.attempts || 0),
    lastAttemptAt: row.last_attempt_at || null,
    sentAt: row.sent_at || null,
    failedAt: row.failed_at || null,
    providerMessageId: row.provider_message_id || null,
    lastWebhookEventType: row.last_webhook_event_type || null,
    lastWebhookEventAt: row.last_webhook_event_at || null,
    error: row.error || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };

  if (!includeDebug) {
    return base;
  }

  return {
    ...base,
    payload: redactSensitiveFields(parseJsonObject(row.payload)),
    providerResponse: redactSensitiveFields(parseJsonObject(row.provider_response)),
  };
}

function serializeEmailDeliveryEventAdmin(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    eventSourceId: row.event_source_id || null,
    deliveryId: row.delivery_id || null,
    providerMessageId: row.provider_message_id || null,
    eventType: row.event_type,
    deliveryStatus: row.delivery_status || null,
    recipientEmail: row.recipient_email || null,
    occurredAt: row.occurred_at || null,
    payload: redactSensitiveFields(parseJsonObject(row.payload)),
    headers: redactSensitiveFields(parseJsonObject(row.headers)),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function parseCommentMentions(text) {
  return Array.from(
    new Set((String(text || '').match(/@(\w+)/g) || []).map((mention) => mention.slice(1)))
  );
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

function parseJsonArray(raw, fallback = []) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function serializeMapComment(row) {
  return {
    id: row.id,
    mapId: row.map_id,
    nodeId: row.node_id,
    parentCommentId: row.parent_comment_id || null,
    author: row.author_name || row.author_email || 'Anonymous',
    authorUserId: row.author_user_id || null,
    authorEmail: row.author_email || null,
    text: row.text,
    mentions: parseJsonArray(row.mentions, []),
    completed: !!row.completed,
    completedBy: row.completed_by_name || null,
    completedByUserId: row.completed_by_user_id || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    replies: [],
  };
}

function buildCommentsByNode(rows) {
  const serialized = rows.map((row) => serializeMapComment(row));
  const byId = new Map(serialized.map((comment) => [comment.id, comment]));
  const byNode = new Map();

  serialized.forEach((comment) => {
    if (comment.parentCommentId && byId.has(comment.parentCommentId)) {
      byId.get(comment.parentCommentId).replies.push(comment);
      return;
    }

    if (!byNode.has(comment.nodeId)) {
      byNode.set(comment.nodeId, []);
    }
    byNode.get(comment.nodeId).push(comment);
  });

  return Object.fromEntries(byNode.entries());
}

function collectNodeIds(node, out = new Set()) {
  if (!node?.id) return out;
  out.add(node.id);
  (node.children || []).forEach((child) => collectNodeIds(child, out));
  return out;
}

function getMapNodeIdSet(mapRow) {
  const parsed = parseMapFields(mapRow);
  const nodeIds = new Set();
  if (parsed.root) collectNodeIds(parsed.root, nodeIds);
  (parsed.orphans || []).forEach((orphan) => collectNodeIds(orphan, nodeIds));
  return nodeIds;
}

function normalizeIsoTimestamp(raw, fallback = null) {
  const value = String(raw || '').trim();
  if (!value) return fallback;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return fallback;
  return new Date(timestamp).toISOString();
}

function collectLegacyCommentsFromNode(node, mapId, out = []) {
  if (!node?.id) return out;

  const walkComment = (comment, parentCommentId = null) => {
    if (!comment || typeof comment !== 'object') return;
    const commentId = String(comment.id || '').trim() || uuidv4();
    out.push({
      id: commentId,
      mapId,
      nodeId: node.id,
      parentCommentId,
      authorName: String(comment.author || '').trim() || 'Anonymous',
      authorEmail: null,
      text: String(comment.text || '').trim(),
      mentions: Array.isArray(comment.mentions) ? comment.mentions : [],
      completed: !!comment.completed,
      completedByName: comment.completed ? (String(comment.completedBy || '').trim() || null) : null,
      completedAt: comment.completed ? normalizeIsoTimestamp(comment.completedAt, null) : null,
      createdAt: normalizeIsoTimestamp(comment.createdAt, new Date().toISOString()),
      updatedAt: normalizeIsoTimestamp(comment.completedAt || comment.createdAt, new Date().toISOString()),
    });
    (comment.replies || []).forEach((reply) => walkComment(reply, commentId));
  };

  (node.comments || []).forEach((comment) => walkComment(comment));
  (node.children || []).forEach((child) => collectLegacyCommentsFromNode(child, mapId, out));
  return out;
}

async function ensureLegacyMapCommentsImportedAsync(mapRow) {
  const existingCount = await mapCommentStore.countCommentsByMapAsync(mapRow.id);
  if (existingCount > 0) return;

  let parsed;
  try {
    parsed = parseMapFields(mapRow);
  } catch {
    return;
  }

  const legacyComments = [];
  if (parsed.root) {
    collectLegacyCommentsFromNode(parsed.root, mapRow.id, legacyComments);
  }
  (parsed.orphans || []).forEach((orphan) => collectLegacyCommentsFromNode(orphan, mapRow.id, legacyComments));

  const validComments = legacyComments.filter((comment) => comment.text);
  if (validComments.length === 0) return;

  await mapCommentStore.importLegacyCommentsAsync({
    mapId: mapRow.id,
    comments: validComments,
  });
}

async function getCommentAccessibleMapAsync(mapId, userId, collaborationEnabled) {
  return collaborationEnabled
    ? mapStore.getMapAccessibleToUserAsync(mapId, userId)
    : mapStore.getMapForUserAsync(mapId, userId);
}

function denyResource(res, { status = 404, error = 'Resource not found' } = {}) {
  res.status(status).json({ error });
  return false;
}

function ensureResourceAction({
  req,
  res,
  resource,
  action,
  failureStatus = 404,
  failureError = 'Resource not found',
}) {
  if (!resource) {
    return denyResource(res, { status: failureStatus, error: failureError });
  }

  const role = permissionPolicy.resolveResourceRole({
    actorUserId: req.user?.id || null,
    resourceOwnerUserId: resource.user_id || null,
    membershipRole: resource.membership_role || resource.membershipRole || null,
  });

  if (!permissionPolicy.can(action, role)) {
    return denyResource(res, { status: failureStatus, error: failureError });
  }

  return true;
}

async function ensureCollaborationSchemaIfEnabledAsync() {
  if (!COLLABORATION_BACKEND_ENABLED) return false;
  await Promise.all([
    collaborationStore.ensureCollaborationSchemaAsync(),
    ensureCollaborationActivitySchemaAsync(),
  ]);
  return true;
}

function buildFeatureGatePayload(role, { coediting = null, collaboration = null } = {}) {
  const features = {};
  for (const [key, feature] of Object.entries(FEATURE_GATES)) {
    features[key] = permissionPolicy.isFeatureAllowed(feature, role);
  }
  if (coediting?.features) {
    Object.assign(features, coediting.features);
  }
  return {
    role: permissionPolicy.normalizeRole(role),
    features,
    collaboration: collaboration || getDefaultCollaborationCapabilityPayload(),
    coediting: coediting
      ? {
        mode: coediting.mode,
        reason: coediting.reason,
        reasons: coediting.reasons,
        readOnlyFallbackActive: !!coediting.health?.readOnlyFallbackActive,
        healthStatus: coediting.health?.status || 'healthy',
      }
      : {
        mode: 'disabled',
        reason: 'unavailable',
        reasons: ['unavailable'],
        readOnlyFallbackActive: false,
        healthStatus: 'healthy',
      },
  };
}

function getDefaultCollaborationCapabilityPayload() {
  return {
    accessPolicy: 'private',
    accessRequestsEnabled: false,
    nonViewerInvitesRequireOwner: true,
    canSendInvites: false,
    inviteRoles: [],
    canRequestAccess: false,
  };
}

function resolveInviteRolesForActor(role, settings = {}) {
  const normalizedRole = permissionPolicy.normalizeRole(role);
  const accessPolicy = String(settings.access_policy || settings.accessPolicy || 'private')
    .trim()
    .toLowerCase();
  const requireOwnerForNonViewer = !!(
    settings.non_viewer_invites_require_owner
    ?? settings.nonViewerInvitesRequireOwner
  );

  if (normalizedRole === permissionPolicy.ROLES.OWNER) {
    return ['viewer', 'commenter', 'editor'];
  }

  if (normalizedRole === permissionPolicy.ROLES.EDITOR) {
    return requireOwnerForNonViewer
      ? ['viewer']
      : ['viewer', 'commenter', 'editor'];
  }

  if (
    accessPolicy === 'viewer_invites_open'
    && permissionPolicy.can(permissionPolicy.ACTIONS.MAP_READ, normalizedRole)
  ) {
    return ['viewer'];
  }

  return [];
}

async function buildCollaborationCapabilityPayload(mapId, role) {
  if (!COLLABORATION_BACKEND_ENABLED || !mapId) {
    return getDefaultCollaborationCapabilityPayload();
  }

  await ensureCollaborationSchemaIfEnabledAsync();
  const settings = await collaborationStore.getCollaborationSettingsByMapAsync(mapId);
  const inviteRoles = resolveInviteRolesForActor(role, settings);
  const normalizedRole = permissionPolicy.normalizeRole(role);
  const canReadMap = permissionPolicy.can(permissionPolicy.ACTIONS.MAP_READ, normalizedRole);

  return {
    accessPolicy: String(settings?.access_policy || 'private').trim().toLowerCase() || 'private',
    accessRequestsEnabled: !!settings?.access_requests_enabled,
    nonViewerInvitesRequireOwner: !!settings?.non_viewer_invites_require_owner,
    canSendInvites: inviteRoles.length > 0,
    inviteRoles,
    canRequestAccess: !!settings?.access_requests_enabled
      && !canReadMap
      && permissionPolicy.can(permissionPolicy.ACTIONS.ACCESS_REQUEST_CREATE, normalizedRole),
  };
}

async function resolveMembershipRoleAsync(mapId, userId) {
  if (!COLLABORATION_BACKEND_ENABLED || !mapId || !userId) return null;
  try {
    await ensureCollaborationSchemaIfEnabledAsync();
    const membership = await collaborationStore.getMembershipByMapAndUserAsync(mapId, userId);
    return membership?.role || null;
  } catch (error) {
    console.error('Resolve membership role error:', error);
    return null;
  }
}

async function resolveMapPermissionContextAsync({ mapId, actorUserId }) {
  const map = await mapStore.getMapByIdAsync(mapId);
  if (!map) return { map: null, role: permissionPolicy.ROLES.NONE };
  const membershipRole = await resolveMembershipRoleAsync(mapId, actorUserId);
  const role = permissionPolicy.resolveResourceRole({
    actorUserId,
    resourceOwnerUserId: map.user_id,
    membershipRole,
  });
  return { map, role };
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

// GET /api/admin/coediting - rollout + health summary for operational checks
router.get('/admin/coediting', requireAdminKey, async (_req, res) => {
  try {
    const health = await getCoeditingHealthSnapshotAsync();
    const status = await resolveCoeditingSystemStatusAsync({ healthSnapshot: health });
    res.json({
      ok: true,
      status: status.status,
      reason: status.reason,
      reasons: status.reasons,
      rollout: await summarizeCoeditingRolloutConfigAsync(process.env, {
        includeConfigErrors: true,
        includeSensitive: true,
      }),
      health,
    });
  } catch (error) {
    console.error('Get admin coediting health error:', error);
    res.status(500).json({ error: 'Failed to resolve coediting health' });
  }
});

// GET /api/admin/email-deliveries/summary - email health + recent aggregate delivery stats
router.get('/admin/email-deliveries/summary', requireAdminKey, async (req, res) => {
  try {
    const days = parseWindowDays(req.query?.days, 30, 365);
    const summary = await emailDeliveryStore.summarizeEmailDeliveriesAsync({
      days,
      recentFailureLimit: 10,
    });

    res.json({
      ok: true,
      days,
      health: getEmailHealthSnapshot(),
      summary: {
        ...summary,
        recentFailures: (summary.recentFailures || []).map((row) => serializeEmailDeliveryAdmin(row)),
      },
    });
  } catch (error) {
    console.error('Get admin email delivery summary error:', error);
    res.status(500).json({ error: 'Failed to summarize email deliveries' });
  }
});

// GET /api/admin/email-deliveries - list recent email delivery rows with filters
router.get('/admin/email-deliveries', requireAdminKey, async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query, {
      defaultLimit: 50,
      maxLimit: 200,
    });

    const filters = {
      status: req.query?.status || null,
      provider: req.query?.provider || null,
      templateKey: req.query?.template_key || req.query?.templateKey || null,
      toEmail: req.query?.to_email || req.query?.toEmail || null,
      jobId: req.query?.job_id || req.query?.jobId || null,
      mapId: req.query?.map_id || req.query?.mapId || null,
      inviteId: req.query?.invite_id || req.query?.inviteId || null,
      providerMessageId: req.query?.provider_message_id || req.query?.providerMessageId || null,
    };

    const [deliveries, total] = await Promise.all([
      emailDeliveryStore.listEmailDeliveriesAsync(filters, { limit, offset }),
      emailDeliveryStore.countEmailDeliveriesAsync(filters),
    ]);

    res.json({
      filters,
      pagination: { limit, offset, total },
      deliveries: deliveries.map((row) => serializeEmailDeliveryAdmin(row)),
    });
  } catch (error) {
    console.error('List admin email deliveries error:', error);
    res.status(500).json({ error: 'Failed to list email deliveries' });
  }
});

// GET /api/admin/email-deliveries/:deliveryId - inspect a single delivery row
router.get('/admin/email-deliveries/:deliveryId', requireAdminKey, async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const [delivery, events] = await Promise.all([
      emailDeliveryStore.getEmailDeliveryByIdAsync(deliveryId),
      emailDeliveryStore.listEmailDeliveryEventsByDeliveryAsync(deliveryId, {
        limit: 100,
        offset: 0,
      }),
    ]);
    if (!delivery) {
      return res.status(404).json({ error: 'Email delivery not found' });
    }

    return res.json({
      delivery: serializeEmailDeliveryAdmin(delivery, { includeDebug: true }),
      events: events.map((event) => serializeEmailDeliveryEventAdmin(event)),
    });
  } catch (error) {
    console.error('Get admin email delivery detail error:', error);
    res.status(500).json({ error: 'Failed to get email delivery detail' });
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
    if (!ensureResourceAction({
      req,
      res,
      resource: project,
      action: permissionPolicy.ACTIONS.PROJECT_UPDATE,
      failureError: 'Project not found',
    })) return;

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
    if (!ensureResourceAction({
      req,
      res,
      resource: project,
      action: permissionPolicy.ACTIONS.PROJECT_DELETE,
      failureError: 'Project not found',
    })) return;

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
    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();

    const maps = collaborationEnabled
      ? await mapStore.listMapsAccessibleToUserAsync({
        userId: req.user.id,
        projectId: project_id || null,
        limit,
        offset,
      })
      : await mapStore.listMapsByUserAsync({
        userId: req.user.id,
        projectId: project_id || null,
        limit,
        offset,
      });
    const total = collaborationEnabled
      ? await mapStore.countMapsAccessibleToUserAsync({
        userId: req.user.id,
        projectId: project_id || null,
      })
      : await mapStore.countMapsByUserAsync({
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
    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = collaborationEnabled
      ? await mapStore.getMapWithProjectAccessibleToUserAsync(id, req.user.id)
      : await mapStore.getMapWithProjectForUserAsync(id, req.user.id);

    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_READ,
      failureError: 'Map not found',
    })) return;

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

// GET /api/maps/:id/feature-gates - resolve role + feature access for current actor
router.get('/maps/:id/feature-gates', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { map, role } = await resolveMapPermissionContextAsync({
      mapId: id,
      actorUserId: req.user.id,
    });

    if (!map || !permissionPolicy.can(permissionPolicy.ACTIONS.MAP_READ, role)) {
      return res.status(404).json({ error: 'Map not found' });
    }

    const [coediting, collaboration] = await Promise.all([
      resolveCoeditingRolloutAsync({
        mapId: id,
        actorId: req.user.id,
        role,
      }),
      buildCollaborationCapabilityPayload(id, role),
    ]);

    res.json({
      permissions: buildFeatureGatePayload(role, { coediting, collaboration }),
    });
  } catch (error) {
    console.error('Get map feature gates error:', error);
    res.status(500).json({ error: 'Failed to resolve map permissions' });
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
      if (!ensureResourceAction({
        req,
        res,
        resource: project,
        action: permissionPolicy.ACTIONS.MAP_CREATE,
        failureStatus: 400,
        failureError: 'Project not found',
      })) return;
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
    const {
      name,
      root,
      orphans,
      connections,
      colors,
      connectionColors,
      project_id,
      notes,
      expected_updated_at,
    } = req.body;

    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = collaborationEnabled
      ? await mapStore.getMapAccessibleToUserAsync(id, req.user.id)
      : await mapStore.getMapForUserAsync(id, req.user.id);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_UPDATE,
      failureError: 'Map not found',
    })) return;

    if (expected_updated_at !== undefined && expected_updated_at !== null && expected_updated_at !== '') {
      const expectedMs = Date.parse(expected_updated_at);
      if (!Number.isFinite(expectedMs)) {
        return res.status(400).json({ error: 'Invalid expected_updated_at value' });
      }

      const actualMs = Date.parse(map.updated_at);
      if (Number.isFinite(actualMs) && actualMs !== expectedMs) {
        return res.status(409).json({
          error: 'Map has changed since your last load',
          code: 'MAP_UPDATE_CONFLICT',
          conflict: {
            expected_updated_at: new Date(expectedMs).toISOString(),
            actual_updated_at: new Date(actualMs).toISOString(),
          },
          latest: {
            id: map.id,
            name: map.name,
            project_id: map.project_id,
            updated_at: map.updated_at,
          },
        });
      }
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
        if (!ensureResourceAction({
          req,
          res,
          resource: project,
          action: permissionPolicy.ACTIONS.MAP_UPDATE,
          failureStatus: 400,
          failureError: 'Project not found',
        })) return;
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
    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = collaborationEnabled
      ? await mapStore.getMapAccessibleToUserAsync(id, req.user.id)
      : await mapStore.getMapForUserAsync(id, req.user.id);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_DELETE,
      failureError: 'Map not found',
    })) return;

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
    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = collaborationEnabled
      ? await mapStore.getMapAccessibleToUserAsync(id, req.user.id)
      : await mapStore.getMapForUserAsync(id, req.user.id);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_VERSION_LIST,
      failureError: 'Map not found',
    })) return;

    const versions = collaborationEnabled
      ? await mapStore.listMapVersionsByMapAsync(id, 25)
      : await mapStore.listMapVersionsForUserMapAsync(id, req.user.id, 25);

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

    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = collaborationEnabled
      ? await mapStore.getMapAccessibleToUserAsync(id, req.user.id)
      : await mapStore.getMapForUserAsync(id, req.user.id);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_VERSION_CREATE,
      failureError: 'Map not found',
    })) return;

    const nextVersion = collaborationEnabled
      ? await mapStore.getNextMapVersionNumberByMapAsync(id)
      : await mapStore.getNextMapVersionNumberAsync(id, req.user.id);

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

    const allVersions = collaborationEnabled
      ? await mapStore.listMapVersionIdsByMapAsync(id)
      : await mapStore.listMapVersionIdsForUserMapAsync(id, req.user.id);

    if (allVersions.length > 25) {
      const toDelete = allVersions.slice(25).map((row) => row.id);
      await mapStore.deleteMapVersionsByIdsAsync(toDelete);
    }

    const saved = await mapStore.getMapVersionByIdAsync(versionId);

    const actorRole = permissionPolicy.resolveResourceRole({
      actorUserId: req.user?.id || null,
      resourceOwnerUserId: map.user_id || null,
      membershipRole: map.membership_role || map.membershipRole || null,
    });
    await recordMapActivityBestEffortAsync({
      mapId: id,
      actorUserId: req.user.id,
      actorRole,
      eventType: ACTIVITY_TYPES.VERSION_SAVED,
      eventScope: ACTIVITY_SCOPES.VERSION,
      entityType: 'version',
      entityId: versionId,
      summary: `Saved version ${nextVersion}: ${title}`,
      payload: {
        versionId,
        versionNumber: nextVersion,
        name: title,
        notes: notes?.trim() || null,
      },
    }, { label: 'map version save' });

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

// GET /api/maps/:id/comments - list comments for a saved map
router.get('/maps/:id/comments', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await mapCommentStore.ensureMapCommentSchemaAsync();

    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = await getCommentAccessibleMapAsync(id, req.user.id, collaborationEnabled);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_READ,
      failureError: 'Map not found',
    })) return;

    await ensureLegacyMapCommentsImportedAsync(map);
    const rows = await mapCommentStore.listCommentsByMapAsync(id);

    res.json({
      commentsByNode: buildCommentsByNode(rows),
      totalComments: rows.length,
    });
  } catch (error) {
    console.error('Get map comments error:', error);
    res.status(500).json({ error: 'Failed to load map comments' });
  }
});

// POST /api/maps/:id/comments - create a comment or reply on a node
router.post('/maps/:id/comments', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { node_id, parent_comment_id, text } = req.body || {};
    const trimmedText = String(text || '').trim();
    const nodeId = String(node_id || '').trim();
    const parentCommentId = parent_comment_id ? String(parent_comment_id).trim() : null;

    if (!nodeId) {
      return res.status(400).json({ error: 'node_id is required' });
    }
    if (!trimmedText) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    await mapCommentStore.ensureMapCommentSchemaAsync();

    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = await getCommentAccessibleMapAsync(id, req.user.id, collaborationEnabled);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_COMMENT,
      failureError: 'Map not found',
    })) return;

    await ensureLegacyMapCommentsImportedAsync(map);
    const nodeIds = getMapNodeIdSet(map);
    if (!nodeIds.has(nodeId)) {
      return res.status(400).json({ error: 'Target node was not found in the map' });
    }

    if (parentCommentId) {
      const parentComment = await mapCommentStore.getCommentByIdAsync(parentCommentId);
      if (!parentComment || parentComment.map_id !== id || parentComment.node_id !== nodeId) {
        return res.status(404).json({ error: 'Parent comment not found' });
      }
    }

    const createdComment = await mapCommentStore.createCommentAsync({
      mapId: id,
      nodeId,
      parentCommentId,
      authorUserId: req.user.id,
      authorName: req.user?.name || 'Anonymous',
      authorEmail: req.user?.email || null,
      text: trimmedText,
      mentions: parseCommentMentions(trimmedText),
    });

    const actorRole = permissionPolicy.resolveResourceRole({
      actorUserId: req.user?.id || null,
      resourceOwnerUserId: map.user_id || null,
      membershipRole: map.membership_role || map.membershipRole || null,
    });
    await recordMapActivityBestEffortAsync({
      mapId: id,
      actorUserId: req.user.id,
      actorRole,
      eventType: ACTIVITY_TYPES.COMMENT_CREATED,
      eventScope: ACTIVITY_SCOPES.COMMENT,
      entityType: 'comment',
      entityId: createdComment.id,
      summary: parentCommentId ? 'Replied to comment' : 'Added comment',
      payload: {
        commentId: createdComment.id,
        nodeId,
        parentCommentId,
        text: trimmedText,
      },
    }, { label: 'map comment create' });

    res.status(201).json({ comment: serializeMapComment(createdComment) });
  } catch (error) {
    console.error('Create map comment error:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// PATCH /api/maps/:id/comments/:commentId - update comment text or completion state
router.patch('/maps/:id/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const hasText = Object.prototype.hasOwnProperty.call(req.body || {}, 'text');
    const hasCompleted = Object.prototype.hasOwnProperty.call(req.body || {}, 'completed');
    if (!hasText && !hasCompleted) {
      return res.status(400).json({ error: 'No comment changes provided' });
    }

    await mapCommentStore.ensureMapCommentSchemaAsync();

    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = await getCommentAccessibleMapAsync(id, req.user.id, collaborationEnabled);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_COMMENT,
      failureError: 'Map not found',
    })) return;

    await ensureLegacyMapCommentsImportedAsync(map);
    const existingComment = await mapCommentStore.getCommentByIdAsync(commentId);
    if (!existingComment || existingComment.map_id !== id) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    let updatedComment = existingComment;
    const actorRole = permissionPolicy.resolveResourceRole({
      actorUserId: req.user?.id || null,
      resourceOwnerUserId: map.user_id || null,
      membershipRole: map.membership_role || map.membershipRole || null,
    });

    if (hasText) {
      const trimmedText = String(req.body?.text || '').trim();
      if (!trimmedText) {
        return res.status(400).json({ error: 'Comment text is required' });
      }
      updatedComment = await mapCommentStore.replaceCommentTextAsync({
        commentId,
        text: trimmedText,
        mentions: parseCommentMentions(trimmedText),
      });
      await recordMapActivityBestEffortAsync({
        mapId: id,
        actorUserId: req.user.id,
        actorRole,
        eventType: ACTIVITY_TYPES.COMMENT_UPDATED,
        eventScope: ACTIVITY_SCOPES.COMMENT,
        entityType: 'comment',
        entityId: commentId,
        summary: 'Updated comment',
        payload: {
          commentId,
          nodeId: existingComment.node_id,
          text: trimmedText,
        },
      }, { label: 'map comment update text' });
    }

    if (hasCompleted) {
      const completed = !!req.body?.completed;
      updatedComment = await mapCommentStore.setCommentCompletedAsync({
        commentId,
        completed,
        completedByUserId: completed ? req.user.id : null,
        completedByName: completed ? (req.user?.name || 'Anonymous') : null,
        completedAt: completed ? new Date().toISOString() : null,
      });
      await recordMapActivityBestEffortAsync({
        mapId: id,
        actorUserId: req.user.id,
        actorRole,
        eventType: completed ? ACTIVITY_TYPES.COMMENT_RESOLVED : ACTIVITY_TYPES.COMMENT_REOPENED,
        eventScope: ACTIVITY_SCOPES.COMMENT,
        entityType: 'comment',
        entityId: commentId,
        summary: completed ? 'Resolved comment' : 'Reopened comment',
        payload: {
          commentId,
          nodeId: existingComment.node_id,
          completed,
        },
      }, { label: 'map comment update status' });
    }

    res.json({ comment: serializeMapComment(updatedComment) });
  } catch (error) {
    console.error('Update map comment error:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// DELETE /api/maps/:id/comments/:commentId - delete a comment thread
router.delete('/maps/:id/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const { id, commentId } = req.params;
    await mapCommentStore.ensureMapCommentSchemaAsync();

    const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
    const map = await getCommentAccessibleMapAsync(id, req.user.id, collaborationEnabled);
    if (!ensureResourceAction({
      req,
      res,
      resource: map,
      action: permissionPolicy.ACTIONS.MAP_COMMENT,
      failureError: 'Map not found',
    })) return;

    await ensureLegacyMapCommentsImportedAsync(map);
    const existingComment = await mapCommentStore.getCommentByIdAsync(commentId);
    if (!existingComment || existingComment.map_id !== id) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const deleted = await mapCommentStore.deleteCommentThreadAsync(commentId, id);
    if (!deleted) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const actorRole = permissionPolicy.resolveResourceRole({
      actorUserId: req.user?.id || null,
      resourceOwnerUserId: map.user_id || null,
      membershipRole: map.membership_role || map.membershipRole || null,
    });
    await recordMapActivityBestEffortAsync({
      mapId: id,
      actorUserId: req.user.id,
      actorRole,
      eventType: ACTIVITY_TYPES.COMMENT_DELETED,
      eventScope: ACTIVITY_SCOPES.COMMENT,
      entityType: 'comment',
      entityId: commentId,
      summary: 'Deleted comment',
      payload: {
        commentId,
        nodeId: existingComment.node_id,
      },
    }, { label: 'map comment delete' });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete map comment error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
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
    if (!ensureResourceAction({
      req,
      res,
      resource: historyItem,
      action: permissionPolicy.ACTIONS.HISTORY_UPDATE,
      failureError: 'History item not found',
    })) return;

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
      const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
      const map = collaborationEnabled
        ? await mapStore.getMapAccessibleToUserAsync(map_id, req.user.id)
        : await mapStore.getMapForUserAsync(map_id, req.user.id);
      if (!ensureResourceAction({
        req,
        res,
        resource: map,
        action: permissionPolicy.ACTIONS.SHARE_CREATE,
        failureStatus: 400,
        failureError: 'Map not found',
      })) return;
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

    if (share.map_id) {
      const collaborationEnabled = await ensureCollaborationSchemaIfEnabledAsync();
      if (collaborationEnabled) {
        const actorUserId = req.user?.id || null;
        const { map, role } = await resolveMapPermissionContextAsync({
          mapId: share.map_id,
          actorUserId,
        });

        if (!map || !permissionPolicy.can(permissionPolicy.ACTIONS.MAP_READ, role)) {
          return res.status(403).json({
            error: 'This shared map now requires app access',
            code: 'SHARE_ACCESS_REQUIRED',
            mapId: share.map_id,
          });
        }
      }
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
    if (!ensureResourceAction({
      req,
      res,
      resource: share,
      action: permissionPolicy.ACTIONS.SHARE_DELETE,
      failureError: 'Share not found',
    })) return;

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

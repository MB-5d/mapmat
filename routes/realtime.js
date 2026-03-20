const express = require('express');
const { authMiddleware, requireAuth } = require('./auth');
const mapStore = require('../stores/mapStore');
const collaborationStore = require('../stores/collaborationStore');
const presenceStore = require('../stores/presenceStore');
const permissionPolicy = require('../policies/permissionPolicy');
const { buildPresenceIdentity } = require('../utils/presenceIdentity');

const router = express.Router();

const REALTIME_BASELINE_ENABLED = parseEnvBool(
  process.env.REALTIME_BASELINE_ENABLED,
  false
);
const PRESENCE_TTL_SEC = clampInt(process.env.REALTIME_PRESENCE_TTL_SEC, 90, { min: 30, max: 600 });
const PRESENCE_HEARTBEAT_SEC = clampInt(
  process.env.REALTIME_PRESENCE_HEARTBEAT_SEC,
  20,
  { min: 5, max: 60 }
);
const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{6,120}$/;

function parseEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function clampInt(value, fallback, { min, max }) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function getCutoffIso() {
  return new Date(Date.now() - PRESENCE_TTL_SEC * 1000).toISOString();
}

function normalizeAccessMode(accessMode, role) {
  const normalized = String(accessMode || '').trim().toLowerCase();
  if (['view', 'comment', 'edit'].includes(normalized)) return normalized;
  if (role === permissionPolicy.ROLES.OWNER || role === permissionPolicy.ROLES.EDITOR) return 'edit';
  if (role === permissionPolicy.ROLES.COMMENTER) return 'comment';
  return 'view';
}

function safeParseJson(raw, fallback = null) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function serializePresenceSession(row) {
  const metadata = safeParseJson(row.metadata, null);
  return {
    id: row.id,
    mapId: row.map_id,
    userId: row.user_id,
    sessionId: row.session_id,
    displayName: row.display_name || null,
    userEmail: row.user_email || null,
    accessMode: row.access_mode || 'view',
    clientName: row.client_name || null,
    metadata,
    identityMode: metadata?.identityMode || 'named',
    tone: Number.isInteger(metadata?.tone) ? metadata.tone : null,
    avatarLabel: metadata?.avatarLabel || null,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function notFoundMap(res) {
  return res.status(404).json({ error: 'Map not found' });
}

async function resolveActorRoleAsync({ mapId, mapOwnerUserId, actorUserId }) {
  let membershipRole = null;
  if (actorUserId) {
    const membership = await collaborationStore.getMembershipByMapAndUserAsync(mapId, actorUserId);
    membershipRole = membership?.role || null;
  }
  return permissionPolicy.resolveResourceRole({
    actorUserId,
    resourceOwnerUserId: mapOwnerUserId,
    membershipRole,
  });
}

router.use(authMiddleware);
router.use((req, res, next) => {
  if (!REALTIME_BASELINE_ENABLED) return res.status(404).json({ error: 'Not found' });
  return next();
});
router.use(requireAuth);
router.use(async (req, res, next) => {
  try {
    await collaborationStore.ensureCollaborationSchemaAsync();
    await presenceStore.ensurePresenceSchemaAsync();
    next();
  } catch (error) {
    console.error('Realtime schema init error:', error);
    res.status(500).json({ error: 'Failed to initialize realtime baseline' });
  }
});

// GET /api/maps/:id/presence - list active sessions for a map
router.get('/maps/:id/presence', async (req, res) => {
  try {
    const { id } = req.params;
    const map = await mapStore.getMapByIdAsync(id);
    if (!map) return notFoundMap(res);

    const role = await resolveActorRoleAsync({
      mapId: id,
      mapOwnerUserId: map.user_id,
      actorUserId: req.user.id,
    });

    if (!permissionPolicy.can(permissionPolicy.ACTIONS.PRESENCE_LIST, role)) {
      return notFoundMap(res);
    }

    const cutoffIso = getCutoffIso();
    await presenceStore.pruneExpiredPresenceByMapAsync(id, cutoffIso);
    const sessions = await presenceStore.listActivePresenceByMapAsync(id, cutoffIso);

    res.json({
      presence: {
        mapId: id,
        ttlSeconds: PRESENCE_TTL_SEC,
        heartbeatSeconds: PRESENCE_HEARTBEAT_SEC,
        serverTime: new Date().toISOString(),
        sessions: sessions.map(serializePresenceSession),
      },
    });
  } catch (error) {
    console.error('List presence error:', error);
    res.status(500).json({ error: 'Failed to list presence sessions' });
  }
});

// POST /api/maps/:id/presence/heartbeat - upsert caller's session
router.post('/maps/:id/presence/heartbeat', async (req, res) => {
  try {
    const { id } = req.params;
    const map = await mapStore.getMapByIdAsync(id);
    if (!map) return notFoundMap(res);

    const role = await resolveActorRoleAsync({
      mapId: id,
      mapOwnerUserId: map.user_id,
      actorUserId: req.user.id,
    });

    if (!permissionPolicy.can(permissionPolicy.ACTIONS.PRESENCE_HEARTBEAT, role)) {
      return notFoundMap(res);
    }

    const sessionId = String(req.body?.session_id || '').trim();
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      return res.status(400).json({ error: 'Valid session_id is required' });
    }

    const accessMode = normalizeAccessMode(req.body?.access_mode, role);
    const clientName = String(req.body?.client_name || '').trim() || 'web';
    const settings = await collaborationStore.getCollaborationSettingsByMapAsync(id);
    const identity = buildPresenceIdentity({
      actorId: req.user.id,
      sessionId,
      role,
      accessMode,
      user: req.user,
      presenceIdentityMode: settings?.presence_identity_mode,
    });
    const metadataPayload = req.body?.metadata && typeof req.body.metadata === 'object'
      ? { ...req.body.metadata }
      : {};
    metadataPayload.identityMode = identity.identityMode;
    metadataPayload.tone = identity.tone;
    metadataPayload.avatarLabel = identity.avatarLabel;
    const metadata = JSON.stringify(metadataPayload);
    const nowIso = new Date().toISOString();
    const cutoffIso = getCutoffIso();

    await presenceStore.pruneExpiredPresenceByMapAsync(id, cutoffIso);
    const session = await presenceStore.upsertPresenceSessionAsync({
      mapId: id,
      userId: req.user.id,
      sessionId,
      displayName: identity.displayName,
      userEmail: identity.userEmail,
      accessMode,
      clientName,
      metadata,
      lastSeenAt: nowIso,
    });
    const sessions = await presenceStore.listActivePresenceByMapAsync(id, cutoffIso);

    res.json({
      presence: {
        mapId: id,
        ttlSeconds: PRESENCE_TTL_SEC,
        heartbeatSeconds: PRESENCE_HEARTBEAT_SEC,
        serverTime: nowIso,
        session: serializePresenceSession(session),
        sessions: sessions.map(serializePresenceSession),
      },
    });
  } catch (error) {
    console.error('Presence heartbeat error:', error);
    res.status(500).json({ error: 'Failed to update presence heartbeat' });
  }
});

// DELETE /api/maps/:id/presence/:sessionId - leave/remove a session
router.delete('/maps/:id/presence/:sessionId', async (req, res) => {
  try {
    const { id, sessionId } = req.params;
    if (!SESSION_ID_PATTERN.test(String(sessionId || '').trim())) {
      return res.status(400).json({ error: 'Valid sessionId is required' });
    }

    const map = await mapStore.getMapByIdAsync(id);
    if (!map) return notFoundMap(res);

    const role = await resolveActorRoleAsync({
      mapId: id,
      mapOwnerUserId: map.user_id,
      actorUserId: req.user.id,
    });

    const canHeartbeat = permissionPolicy.can(permissionPolicy.ACTIONS.PRESENCE_HEARTBEAT, role);
    if (!canHeartbeat) return notFoundMap(res);

    const canManage = permissionPolicy.can(permissionPolicy.ACTIONS.PRESENCE_MANAGE, role);

    let deleted = 0;
    if (canManage) {
      deleted = await presenceStore.deletePresenceByMapSessionAsync(id, sessionId);
    } else {
      deleted = await presenceStore.deletePresenceByMapUserSessionAsync(id, req.user.id, sessionId);
    }

    if (!deleted) {
      return res.status(404).json({ error: 'Presence session not found' });
    }

    res.json({ success: true, deleted });
  } catch (error) {
    console.error('Delete presence session error:', error);
    res.status(500).json({ error: 'Failed to delete presence session' });
  }
});

module.exports = router;

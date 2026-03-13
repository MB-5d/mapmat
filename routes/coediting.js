const express = require('express');
const { authMiddleware, requireAuth } = require('./auth');
const mapStore = require('../stores/mapStore');
const collaborationStore = require('../stores/collaborationStore');
const permissionPolicy = require('../policies/permissionPolicy');
const {
  normalizeOperationEnvelope,
  CoeditingContractError,
} = require('../utils/coeditingContract');
const {
  applyOperationAsync,
  getLiveDocumentAsync,
  listCommittedOperationsAsync,
  CoeditingSyncError,
} = require('../utils/coeditingSyncEngine');
const {
  broadcastRoomEventAsync,
  MESSAGE_TYPES,
} = require('../utils/coeditingTransport');
const { resolveCoeditingRollout } = require('../utils/coeditingRollout');
const {
  recordCommitLatency,
  recordVersionConflict,
  recordReadOnlyBlock,
} = require('../utils/coeditingObservability');

const router = express.Router();

const COEDITING_EXPERIMENT_ENABLED = parseEnvBool(
  process.env.COEDITING_EXPERIMENT_ENABLED,
  false
);
const COLLABORATION_BACKEND_ENABLED = parseEnvBool(
  process.env.COLLABORATION_BACKEND_ENABLED,
  false
);
const COEDITING_SYNC_ENGINE_ENABLED = parseEnvBool(
  process.env.COEDITING_SYNC_ENGINE_ENABLED,
  false
);

function parseEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function notFound(res) {
  return res.status(404).json({ error: 'Not found' });
}

async function resolveActorRoleAsync({ mapId, mapOwnerUserId, actorUserId }) {
  let membershipRole = null;
  if (COLLABORATION_BACKEND_ENABLED && actorUserId) {
    const membership = await collaborationStore.getMembershipByMapAndUserAsync(mapId, actorUserId);
    membershipRole = membership?.role || null;
  }

  return permissionPolicy.resolveResourceRole({
    actorUserId,
    resourceOwnerUserId: mapOwnerUserId,
    membershipRole,
  });
}

function sendReadOnlyFallback(res, rollout) {
  return res.status(423).json({
    error: 'Live editing is temporarily read-only for this map',
    code: 'COEDITING_READ_ONLY_FALLBACK',
    details: {
      mode: rollout.mode,
      reason: rollout.reason,
      reasons: rollout.reasons,
      readOnlyFallbackActive: !!rollout.health?.readOnlyFallbackActive,
      healthStatus: rollout.health?.status || 'healthy',
    },
  });
}

async function resolveCoeditingContextAsync(req, res, mapId) {
  const map = await mapStore.getMapByIdAsync(mapId);
  if (!map) {
    res.status(404).json({ error: 'Map not found' });
    return null;
  }

  const role = await resolveActorRoleAsync({
    mapId,
    mapOwnerUserId: map.user_id,
    actorUserId: req.user.id,
  });

  if (!permissionPolicy.can(permissionPolicy.ACTIONS.MAP_READ, role)) {
    res.status(404).json({ error: 'Map not found' });
    return null;
  }

  const rollout = resolveCoeditingRollout({
    mapId,
    actorId: req.user.id,
    role,
  });

  return { map, role, rollout };
}

async function requireCoeditingAccessAsync(req, res, mapId, { allowReadOnly = false, context = null } = {}) {
  const effectiveContext = context || await resolveCoeditingContextAsync(req, res, mapId);
  if (!effectiveContext) return null;

  if (effectiveContext.rollout.mode === 'disabled') {
    notFound(res);
    return null;
  }

  if (!allowReadOnly && effectiveContext.rollout.mode === 'read_only') {
    recordReadOnlyBlock();
    sendReadOnlyFallback(res, effectiveContext.rollout);
    return null;
  }

  return effectiveContext;
}

router.use(authMiddleware);
router.use((req, res, next) => {
  if (!COEDITING_EXPERIMENT_ENABLED) return notFound(res);
  return next();
});
router.use(requireAuth);
router.use(async (req, res, next) => {
  if (!COLLABORATION_BACKEND_ENABLED) return next();
  try {
    await collaborationStore.ensureCollaborationSchemaAsync();
    return next();
  } catch (error) {
    console.error('Coediting schema init error:', error);
    return res.status(500).json({ error: 'Failed to initialize coediting contract' });
  }
});

// GET /api/maps/:id/live-document - returns persisted live document snapshot + version
router.get('/maps/:id/live-document', async (req, res) => {
  try {
    if (!COEDITING_SYNC_ENGINE_ENABLED) return notFound(res);

    const { id: mapId } = req.params;
    const context = await requireCoeditingAccessAsync(req, res, mapId, {
      allowReadOnly: true,
    });
    if (!context) return;

    const liveDocument = await getLiveDocumentAsync({ mapId });
    return res.json({
      liveDocument: {
        mapId,
        version: liveDocument.version,
        name: liveDocument.name,
        notes: liveDocument.notes,
        root: liveDocument.root,
        orphans: liveDocument.orphans,
        connections: liveDocument.connections,
        colors: liveDocument.colors,
        connectionColors: liveDocument.connectionColors,
        mapUpdatedAt: liveDocument.mapUpdatedAt,
        lastOpId: liveDocument.lastOpId,
        lastActorId: liveDocument.lastActorId,
      },
    });
  } catch (error) {
    if (error instanceof CoeditingSyncError) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        details: error.details,
      });
    }
    console.error('Get live document error:', error);
    return res.status(500).json({ error: 'Failed to load live document' });
  }
});

// GET /api/maps/:id/ops/replay - returns committed ops after a known version
router.get('/maps/:id/ops/replay', async (req, res) => {
  try {
    if (!COEDITING_SYNC_ENGINE_ENABLED) return notFound(res);

    const { id: mapId } = req.params;
    const context = await requireCoeditingAccessAsync(req, res, mapId, {
      allowReadOnly: true,
    });
    if (!context) return;

    const afterVersionValue = req.query?.afterVersion;
    const afterVersionRaw = afterVersionValue === undefined
      ? 0
      : Number.parseInt(afterVersionValue, 10);
    if (!Number.isInteger(afterVersionRaw) || afterVersionRaw < 0) {
      return res.status(400).json({ error: 'afterVersion must be a non-negative integer' });
    }

    const limitRaw = Number.parseInt(req.query?.limit, 10);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : undefined;

    const replay = await listCommittedOperationsAsync({
      mapId,
      afterVersion: afterVersionRaw,
      limit,
    });

    return res.json({
      replay: {
        mapId,
        afterVersion: afterVersionRaw,
        currentVersion: replay.currentVersion,
        operations: replay.operations,
      },
    });
  } catch (error) {
    if (error instanceof CoeditingSyncError) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        details: error.details,
      });
    }
    console.error('Replay live ops error:', error);
    return res.status(500).json({ error: 'Failed to replay live operations' });
  }
});

// POST /api/maps/:id/ops/ingest - validates and normalizes co-editing operation envelope
router.post('/maps/:id/ops/ingest', async (req, res) => {
  try {
    const { id: mapId } = req.params;
    const context = await resolveCoeditingContextAsync(req, res, mapId);
    if (!context) return;

    if (!permissionPolicy.can(permissionPolicy.ACTIONS.MAP_UPDATE, context.role)) {
      res.status(404).json({ error: 'Map not found' });
      return;
    }

    const operationRaw = req.body?.operation && typeof req.body.operation === 'object'
      ? req.body.operation
      : req.body;

    const operation = normalizeOperationEnvelope(operationRaw, {
      expectedMapId: mapId,
      expectedActorId: req.user.id,
    });

    if (!COEDITING_SYNC_ENGINE_ENABLED) {
      return res.status(202).json({
        accepted: true,
        operation,
        serverReceivedAt: new Date().toISOString(),
      });
    }

    const access = await requireCoeditingAccessAsync(req, res, mapId, { context });
    if (!access) return;

    const startedAt = Date.now();
    const committed = await applyOperationAsync({ mapId, operation });
    recordCommitLatency(Date.now() - startedAt);

    await broadcastRoomEventAsync(mapId, {
      type: MESSAGE_TYPES.OPERATION_COMMITTED,
      mapId,
      operation: committed.operation,
      liveDocument: committed.liveDocument,
    });

    return res.status(committed.duplicate ? 200 : 201).json({
      committed: true,
      duplicate: committed.duplicate,
      operation: committed.operation,
      liveDocument: committed.liveDocument,
      serverCommittedAt: committed.operation.committedAt,
    });
  } catch (error) {
    if (error instanceof CoeditingContractError) {
      return res.status(400).json({
        error: 'Invalid coediting operation envelope',
        code: error.code,
        details: error.details,
      });
    }
    if (error instanceof CoeditingSyncError) {
      if (error.code === 'COEDITING_VERSION_CONFLICT') {
        recordVersionConflict();
      }
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        details: error.details,
      });
    }
    console.error('Coediting op ingest error:', error);
    return res.status(500).json({ error: 'Failed to ingest coediting operation' });
  }
});

module.exports = router;

const express = require('express');
const { authMiddleware, requireAuth } = require('./auth');
const mapStore = require('../stores/mapStore');
const collaborationStore = require('../stores/collaborationStore');
const permissionPolicy = require('../policies/permissionPolicy');
const {
  normalizeOperationEnvelope,
  CoeditingContractError,
} = require('../utils/coeditingContract');

const router = express.Router();

const COEDITING_EXPERIMENT_ENABLED = parseEnvBool(
  process.env.COEDITING_EXPERIMENT_ENABLED,
  false
);
const COLLABORATION_BACKEND_ENABLED = parseEnvBool(
  process.env.COLLABORATION_BACKEND_ENABLED,
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

// POST /api/maps/:id/ops/ingest - validates and normalizes co-editing operation envelope
router.post('/maps/:id/ops/ingest', async (req, res) => {
  try {
    const { id: mapId } = req.params;
    const map = await mapStore.getMapByIdAsync(mapId);
    if (!map) {
      return res.status(404).json({ error: 'Map not found' });
    }

    const role = await resolveActorRoleAsync({
      mapId,
      mapOwnerUserId: map.user_id,
      actorUserId: req.user.id,
    });
    if (!permissionPolicy.can(permissionPolicy.ACTIONS.MAP_UPDATE, role)) {
      return res.status(404).json({ error: 'Map not found' });
    }

    const operationRaw = req.body?.operation && typeof req.body.operation === 'object'
      ? req.body.operation
      : req.body;

    const operation = normalizeOperationEnvelope(operationRaw, {
      expectedMapId: mapId,
      expectedActorId: req.user.id,
    });

    return res.status(202).json({
      accepted: true,
      operation,
      serverReceivedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof CoeditingContractError) {
      return res.status(400).json({
        error: 'Invalid coediting operation envelope',
        code: error.code,
        details: error.details,
      });
    }
    console.error('Coediting op ingest error:', error);
    return res.status(500).json({ error: 'Failed to ingest coediting operation' });
  }
});

module.exports = router;

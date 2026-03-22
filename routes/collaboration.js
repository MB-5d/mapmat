const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, requireAuth } = require('./auth');
const mapStore = require('../stores/mapStore');
const authStore = require('../stores/authStore');
const collaborationStore = require('../stores/collaborationStore');
const collaborationActivityStore = require('../stores/collaborationActivityStore');
const permissionPolicy = require('../policies/permissionPolicy');
const {
  ACTIVITY_SCOPES,
  ACTIVITY_TYPES,
  ensureCollaborationActivitySchemaAsync,
  recordMapActivityBestEffortAsync,
  serializeActivityEvent,
} = require('../utils/collaborationActivity');

const router = express.Router();

const COLLABORATION_BACKEND_ENABLED = parseEnvBool(
  process.env.COLLABORATION_BACKEND_ENABLED,
  false
);
const COLLAB_INVITE_DEFAULT_DAYS = Number(process.env.COLLAB_INVITE_DEFAULT_DAYS ?? 7);
const COLLAB_INVITE_MAX_DAYS = Number(process.env.COLLAB_INVITE_MAX_DAYS ?? 30);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCESS_POLICIES = new Set(['private', 'viewer_invites_open']);
const PRESENCE_IDENTITY_MODES = new Set(['named', 'anonymous']);
const ACCESS_REQUEST_STATUSES = new Set(['approved', 'denied']);

const INVITE_ROLES = new Set([
  permissionPolicy.ROLES.EDITOR,
  permissionPolicy.ROLES.COMMENTER,
  permissionPolicy.ROLES.VIEWER,
]);
const MEMBERSHIP_ROLES = new Set([
  permissionPolicy.ROLES.OWNER,
  permissionPolicy.ROLES.EDITOR,
  permissionPolicy.ROLES.COMMENTER,
  permissionPolicy.ROLES.VIEWER,
]);

function parseEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeInviteRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (!INVITE_ROLES.has(normalized)) return null;
  return normalized;
}

function normalizeMembershipRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (!MEMBERSHIP_ROLES.has(normalized)) return null;
  return normalized;
}

function isOwnerRole(role) {
  return permissionPolicy.normalizeRole(role) === permissionPolicy.ROLES.OWNER;
}

function getRoleSortRank(role) {
  const normalized = permissionPolicy.normalizeRole(role);
  if (normalized === permissionPolicy.ROLES.OWNER) return 0;
  if (normalized === permissionPolicy.ROLES.EDITOR) return 1;
  if (normalized === permissionPolicy.ROLES.COMMENTER) return 2;
  if (normalized === permissionPolicy.ROLES.VIEWER) return 3;
  return 4;
}

function normalizeAccessPolicy(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!ACCESS_POLICIES.has(normalized)) return null;
  return normalized;
}

function normalizePresenceIdentityMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!PRESENCE_IDENTITY_MODES.has(normalized)) return null;
  return normalized;
}

function normalizeAccessRequestStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!ACCESS_REQUEST_STATUSES.has(normalized)) return null;
  return normalized;
}

function parseOptionalBoolean(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseActivityPagination(query) {
  const limitRaw = Number.parseInt(query?.limit, 10);
  const offsetRaw = Number.parseInt(query?.offset, 10);
  const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
  const offset = Number.isInteger(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;
  return { limit, offset };
}

function parseInviteExpiration(daysRaw) {
  const parsed = Number.parseInt(daysRaw, 10);
  const fallbackDays = Number.isFinite(COLLAB_INVITE_DEFAULT_DAYS) && COLLAB_INVITE_DEFAULT_DAYS > 0
    ? COLLAB_INVITE_DEFAULT_DAYS
    : 7;
  const maxDays = Number.isFinite(COLLAB_INVITE_MAX_DAYS) && COLLAB_INVITE_MAX_DAYS > 0
    ? COLLAB_INVITE_MAX_DAYS
    : 30;
  const days = Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, 1), maxDays)
    : Math.min(fallbackDays, maxDays);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function serializeMembership(row) {
  if (!row) return null;
  return {
    id: row.id,
    mapId: row.map_id,
    userId: row.user_id,
    role: row.role,
    invitedByUserId: row.invited_by_user_id || null,
    invitedByName: row.invited_by_name || null,
    invitedByEmail: row.invited_by_email || null,
    userName: row.user_name || null,
    userEmail: row.user_email || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    implicitOwner: !!row.is_implicit_owner,
  };
}

function serializeInvite(row, { includeToken = false } = {}) {
  if (!row) return null;
  const payload = {
    id: row.id,
    mapId: row.map_id,
    mapName: row.map_name || null,
    mapUrl: row.map_url || null,
    inviterUserId: row.inviter_user_id,
    inviterName: row.inviter_name || null,
    inviterEmail: row.inviter_email || null,
    inviteeEmail: row.invitee_email,
    role: row.role,
    status: row.status,
    expiresAt: row.expires_at || null,
    acceptedByUserId: row.accepted_by_user_id || null,
    acceptedByName: row.accepted_by_name || null,
    acceptedByEmail: row.accepted_by_email || null,
    acceptedAt: row.accepted_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (includeToken) {
    payload.token = row.token;
  }

  return payload;
}

function serializeCollaborationSettings(row) {
  if (!row) return null;
  return {
    mapId: row.map_id,
    accessPolicy: row.access_policy || 'private',
    nonViewerInvitesRequireOwner: !!row.non_viewer_invites_require_owner,
    accessRequestsEnabled: row.access_requests_enabled !== 0,
    presenceIdentityMode: row.presence_identity_mode || 'named',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function serializeAccessRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    mapId: row.map_id,
    requesterUserId: row.requester_user_id,
    requesterName: row.requester_name || null,
    requesterEmail: row.requester_email || null,
    requestedRole: row.requested_role,
    status: row.status,
    message: row.message || null,
    decisionUserId: row.decision_user_id || null,
    decisionUserName: row.decision_user_name || null,
    decisionUserEmail: row.decision_user_email || null,
    decisionRole: row.decision_role || null,
    decidedAt: row.decided_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function trimDisplayText(value, maxLength = 80) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function formatUserLabel(user, fallbackEmail = null) {
  const label = trimDisplayText(user?.name, 80)
    || trimDisplayText(user?.email, 120)
    || trimDisplayText(fallbackEmail, 120);
  return label || 'user';
}

function buildSettingsChanges(current, next) {
  const changes = {};

  const currentAccessPolicy = current?.access_policy || 'private';
  const nextAccessPolicy = next?.access_policy || 'private';
  if (currentAccessPolicy !== nextAccessPolicy) {
    changes.accessPolicy = { from: currentAccessPolicy, to: nextAccessPolicy };
  }

  const currentNonViewerInvitesRequireOwner = !!current?.non_viewer_invites_require_owner;
  const nextNonViewerInvitesRequireOwner = !!next?.non_viewer_invites_require_owner;
  if (currentNonViewerInvitesRequireOwner !== nextNonViewerInvitesRequireOwner) {
    changes.nonViewerInvitesRequireOwner = {
      from: currentNonViewerInvitesRequireOwner,
      to: nextNonViewerInvitesRequireOwner,
    };
  }

  const currentAccessRequestsEnabled = current?.access_requests_enabled !== 0;
  const nextAccessRequestsEnabled = next?.access_requests_enabled !== 0;
  if (currentAccessRequestsEnabled !== nextAccessRequestsEnabled) {
    changes.accessRequestsEnabled = {
      from: currentAccessRequestsEnabled,
      to: nextAccessRequestsEnabled,
    };
  }

  const currentPresenceIdentityMode = current?.presence_identity_mode || 'named';
  const nextPresenceIdentityMode = next?.presence_identity_mode || 'named';
  if (currentPresenceIdentityMode !== nextPresenceIdentityMode) {
    changes.presenceIdentityMode = {
      from: currentPresenceIdentityMode,
      to: nextPresenceIdentityMode,
    };
  }

  return changes;
}

function notFound(res) {
  return res.status(404).json({ error: 'Not found' });
}

async function resolveActorRoleAsync({ mapId, ownerUserId, actorUserId }) {
  let membershipRole = null;
  if (actorUserId) {
    const membership = await collaborationStore.getMembershipByMapAndUserAsync(mapId, actorUserId);
    membershipRole = membership?.role || null;
  }
  return permissionPolicy.resolveResourceRole({
    actorUserId,
    resourceOwnerUserId: ownerUserId,
    membershipRole,
  });
}

async function canMapActionAsync({ req, mapRow, action }) {
  const role = await resolveActorRoleAsync({
    mapId: mapRow.id,
    ownerUserId: mapRow.user_id,
    actorUserId: req.user?.id || null,
  });
  return permissionPolicy.can(action, role);
}

async function listCollaborationMembersAsync(mapRow) {
  const [memberships, creatorUser] = await Promise.all([
    collaborationStore.listMembershipsByMapAsync(mapRow.id),
    authStore.getPublicUserByIdAsync(mapRow.user_id),
  ]);

  const byUserId = new Map();

  if (creatorUser) {
    byUserId.set(mapRow.user_id, {
      id: `owner-${mapRow.id}-${mapRow.user_id}`,
      map_id: mapRow.id,
      user_id: mapRow.user_id,
      role: permissionPolicy.ROLES.OWNER,
      invited_by_user_id: null,
      invited_by_name: null,
      invited_by_email: null,
      user_name: creatorUser.name || null,
      user_email: creatorUser.email || null,
      created_at: mapRow.created_at,
      updated_at: mapRow.updated_at,
      is_implicit_owner: true,
    });
  }

  memberships.forEach((membership) => {
    const existing = byUserId.get(membership.user_id);
    const nextMembership = { ...membership, is_implicit_owner: false };

    if (!existing) {
      byUserId.set(membership.user_id, nextMembership);
      return;
    }

    if (!isOwnerRole(existing.role) && isOwnerRole(nextMembership.role)) {
      byUserId.set(membership.user_id, nextMembership);
    }
  });

  return Array.from(byUserId.values()).sort((left, right) => {
    const leftRank = getRoleSortRank(left.role);
    const rightRank = getRoleSortRank(right.role);
    if (leftRank !== rightRank) return leftRank - rightRank;

    const leftCreatedAt = new Date(left.created_at || 0).getTime();
    const rightCreatedAt = new Date(right.created_at || 0).getTime();
    if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt - rightCreatedAt;

    return String(left.user_name || left.user_email || left.user_id || '')
      .localeCompare(String(right.user_name || right.user_email || right.user_id || ''));
  });
}

async function getCollaborationSettingsAsync(mapId) {
  return collaborationStore.getCollaborationSettingsByMapAsync(mapId);
}

async function canCreateInviteAsync({ req, mapRow, inviteRole, settings }) {
  const actorRole = await resolveActorRoleAsync({
    mapId: mapRow.id,
    ownerUserId: mapRow.user_id,
    actorUserId: req.user?.id || null,
  });

  if (actorRole === permissionPolicy.ROLES.OWNER) {
    return true;
  }

  if (actorRole === permissionPolicy.ROLES.EDITOR) {
    if (inviteRole !== permissionPolicy.ROLES.VIEWER && settings?.non_viewer_invites_require_owner) {
      return false;
    }
    return true;
  }

  if (
    inviteRole === permissionPolicy.ROLES.VIEWER
    && settings?.access_policy === 'viewer_invites_open'
    && permissionPolicy.can(permissionPolicy.ACTIONS.MAP_READ, actorRole)
  ) {
    return true;
  }

  return false;
}

router.use(authMiddleware);
router.use((req, res, next) => {
  if (!COLLABORATION_BACKEND_ENABLED) return notFound(res);
  return next();
});
router.use(requireAuth);
router.use(async (req, res, next) => {
  try {
    await Promise.all([
      collaborationStore.ensureCollaborationSchemaAsync(),
      ensureCollaborationActivitySchemaAsync(),
    ]);
    next();
  } catch (error) {
    console.error('Ensure collaboration schema error:', error);
    res.status(500).json({ error: 'Failed to initialize collaboration backend' });
  }
});

async function acceptInviteForUserAsync(invite, user) {
  if (!invite) {
    const error = new Error('Invite not found');
    error.status = 404;
    throw error;
  }

  if (invite.status !== 'pending') {
    const error = new Error('Invite is no longer pending');
    error.status = 409;
    throw error;
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    await collaborationStore.markInviteExpiredAsync(invite.id);
    const error = new Error('Invite has expired');
    error.status = 410;
    throw error;
  }

  const actorEmail = normalizeEmail(user?.email);
  if (!actorEmail || actorEmail !== normalizeEmail(invite.invitee_email)) {
    const error = new Error('Invite email does not match your account');
    error.status = 403;
    throw error;
  }

  const map = await mapStore.getMapByIdAsync(invite.map_id);
  if (!map) {
    const error = new Error('Map not found');
    error.status = 404;
    throw error;
  }
  if (user.id === map.user_id) {
    const error = new Error('Map owner already has access');
    error.status = 400;
    throw error;
  }

  const existingMembership = await collaborationStore.getMembershipByMapAndUserAsync(
    invite.map_id,
    user.id
  );
  if (existingMembership) {
    const error = new Error('User already has access');
    error.status = 409;
    throw error;
  }

  await collaborationStore.setMembershipRoleAsync({
    mapId: invite.map_id,
    userId: user.id,
    role: invite.role,
    invitedByUserId: invite.inviter_user_id,
  });

  const [acceptedInvite, membership] = await Promise.all([
    collaborationStore.markInviteAcceptedAsync({
      inviteId: invite.id,
      acceptedByUserId: user.id,
    }),
    collaborationStore.getMembershipByMapAndUserAsync(invite.map_id, user.id),
  ]);

  await recordMapActivityBestEffortAsync({
    mapId: invite.map_id,
    actorUserId: user.id,
    actorRole: membership?.role || invite.role || null,
    eventType: ACTIVITY_TYPES.COLLAB_INVITE_ACCEPTED,
    eventScope: ACTIVITY_SCOPES.COLLABORATION,
    entityType: 'invite',
    entityId: invite.id,
    summary: `Accepted ${invite.role} invite`,
    payload: {
      inviteId: invite.id,
      role: invite.role,
      inviterUserId: invite.inviter_user_id,
      inviteeEmail: invite.invitee_email,
    },
  }, { label: 'invite accept' });

  return {
    invite: acceptedInvite,
    membership,
  };
}

async function declineInviteForUserAsync(invite, user) {
  if (!invite) {
    const error = new Error('Invite not found');
    error.status = 404;
    throw error;
  }

  if (invite.status !== 'pending') {
    const error = new Error('Invite is no longer pending');
    error.status = 409;
    throw error;
  }

  const actorEmail = normalizeEmail(user?.email);
  if (!actorEmail || actorEmail !== normalizeEmail(invite.invitee_email)) {
    const error = new Error('Invite email does not match your account');
    error.status = 403;
    throw error;
  }

  const declinedInvite = await collaborationStore.markInviteDeclinedAsync({
    inviteId: invite.id,
  });

  await recordMapActivityBestEffortAsync({
    mapId: invite.map_id,
    actorUserId: user.id,
    actorRole: permissionPolicy.ROLES.NONE,
    eventType: ACTIVITY_TYPES.COLLAB_INVITE_DECLINED,
    eventScope: ACTIVITY_SCOPES.COLLABORATION,
    entityType: 'invite',
    entityId: invite.id,
    summary: `Declined ${invite.role} invite`,
    payload: {
      inviteId: invite.id,
      role: invite.role,
      inviterUserId: invite.inviter_user_id,
      inviteeEmail: invite.invitee_email,
    },
  }, { label: 'invite decline' });

  return {
    invite: declinedInvite,
  };
}

// PATCH /api/maps/:id/collaboration/settings - update collaboration settings
router.patch('/maps/:id/collaboration/settings', async (req, res) => {
  try {
    const { id } = req.params;
    const map = await mapStore.getMapByIdAsync(id);
    if (!map) return res.status(404).json({ error: 'Map not found' });

    const actorRole = await resolveActorRoleAsync({
      mapId: id,
      ownerUserId: map.user_id,
      actorUserId: req.user?.id || null,
    });
    if (!permissionPolicy.can(permissionPolicy.ACTIONS.COLLAB_SETTINGS_UPDATE, actorRole)) {
      return res.status(404).json({ error: 'Map not found' });
    }

    const current = await getCollaborationSettingsAsync(id);
    const accessPolicy = normalizeAccessPolicy(
      req.body?.access_policy !== undefined ? req.body.access_policy : current.access_policy
    );
    if (!accessPolicy) {
      return res.status(400).json({ error: 'Invalid access_policy. Use private or viewer_invites_open.' });
    }

    const presenceIdentityMode = normalizePresenceIdentityMode(
      req.body?.presence_identity_mode !== undefined
        ? req.body.presence_identity_mode
        : current.presence_identity_mode
    );
    if (!presenceIdentityMode) {
      return res.status(400).json({ error: 'Invalid presence_identity_mode. Use named or anonymous.' });
    }

    const settings = await collaborationStore.upsertCollaborationSettingsAsync({
      mapId: id,
      accessPolicy,
      nonViewerInvitesRequireOwner: parseOptionalBoolean(
        req.body?.non_viewer_invites_require_owner,
        !!current.non_viewer_invites_require_owner
      ),
      accessRequestsEnabled: parseOptionalBoolean(
        req.body?.access_requests_enabled,
        current.access_requests_enabled !== 0
      ),
      presenceIdentityMode,
    });

    const changes = buildSettingsChanges(current, settings);
    if (Object.keys(changes).length > 0) {
      await recordMapActivityBestEffortAsync({
        mapId: id,
        actorUserId: req.user.id,
        actorRole,
        eventType: ACTIVITY_TYPES.COLLAB_SETTINGS_UPDATED,
        eventScope: ACTIVITY_SCOPES.COLLABORATION,
        entityType: 'settings',
        entityId: id,
        summary: 'Updated collaboration settings',
        payload: { changes },
      }, { label: 'collaboration settings update' });
    }

    res.json({ settings: serializeCollaborationSettings(settings) });
  } catch (error) {
    console.error('Update collaboration settings error:', error);
    res.status(500).json({ error: 'Failed to update collaboration settings' });
  }
});

// GET /api/maps/:id/access-requests - list access requests for owners
router.get('/maps/:id/access-requests', async (req, res) => {
  try {
    const { id } = req.params;
    const map = await mapStore.getMapByIdAsync(id);
    if (!map) return res.status(404).json({ error: 'Map not found' });

    const canListRequests = await canMapActionAsync({
      req,
      mapRow: map,
      action: permissionPolicy.ACTIONS.ACCESS_REQUEST_LIST,
    });
    if (!canListRequests) return res.status(404).json({ error: 'Map not found' });

    const status = req.query?.status ? String(req.query.status).trim().toLowerCase() : 'pending';
    const requests = await collaborationStore.listAccessRequestsByMapAsync(id, {
      status: status && status !== 'all' ? status : null,
      limit: 200,
      offset: 0,
    });

    res.json({
      accessRequests: requests.map((request) => serializeAccessRequest(request)),
    });
  } catch (error) {
    console.error('List access requests error:', error);
    res.status(500).json({ error: 'Failed to list access requests' });
  }
});

// POST /api/maps/:id/access-requests - request access to a map
router.post('/maps/:id/access-requests', async (req, res) => {
  try {
    const { id } = req.params;
    const { requested_role, message } = req.body || {};
    const map = await mapStore.getMapByIdAsync(id);
    if (!map) return res.status(404).json({ error: 'Map not found' });

    const actorRole = await resolveActorRoleAsync({
      mapId: id,
      ownerUserId: map.user_id,
      actorUserId: req.user?.id || null,
    });
    const canCreateRequest = permissionPolicy.can(
      permissionPolicy.ACTIONS.ACCESS_REQUEST_CREATE,
      actorRole
    );
    if (!canCreateRequest) return res.status(404).json({ error: 'Map not found' });
    if (permissionPolicy.can(permissionPolicy.ACTIONS.MAP_READ, actorRole)) {
      return res.status(409).json({ error: 'You already have access' });
    }
    if (req.user.id === map.user_id) {
      return res.status(400).json({ error: 'Map owner already has access' });
    }

    const settings = await getCollaborationSettingsAsync(id);
    if (settings.access_requests_enabled === 0) {
      return res.status(403).json({ error: 'Access requests are disabled for this map' });
    }

    const pendingInvite = await collaborationStore.getPendingInviteByMapAndEmailAsync(
      id,
      normalizeEmail(req.user?.email)
    );
    if (pendingInvite) {
      return res.status(409).json({ error: 'A pending invite already exists for your account' });
    }

    const existingRequest = await collaborationStore.getPendingAccessRequestByMapAndUserAsync(
      id,
      req.user.id
    );
    if (existingRequest) {
      return res.json({
        accessRequest: serializeAccessRequest(await collaborationStore.getAccessRequestByIdAsync(existingRequest.id)),
        reused: true,
      });
    }

    const requestedRole = normalizeInviteRole(requested_role || permissionPolicy.ROLES.VIEWER);
    if (!requestedRole) {
      return res.status(400).json({ error: 'Invalid requested_role. Use viewer, commenter, or editor.' });
    }

    const request = await collaborationStore.createAccessRequestAsync({
      id: uuidv4(),
      mapId: id,
      requesterUserId: req.user.id,
      requestedRole,
      message: String(message || '').trim().slice(0, 1000) || null,
    });

    await recordMapActivityBestEffortAsync({
      mapId: id,
      actorUserId: req.user.id,
      actorRole,
      eventType: ACTIVITY_TYPES.COLLAB_ACCESS_REQUEST_CREATED,
      eventScope: ACTIVITY_SCOPES.COLLABORATION,
      entityType: 'access_request',
      entityId: request.id,
      summary: `Requested ${requestedRole} access`,
      payload: {
        requesterUserId: req.user.id,
        requesterEmail: req.user?.email || null,
        requesterName: req.user?.name || null,
        requestedRole,
        message: request.message || null,
      },
    }, { label: 'access request create' });

    res.status(201).json({
      accessRequest: serializeAccessRequest(request),
    });
  } catch (error) {
    console.error('Create access request error:', error);
    res.status(500).json({ error: 'Failed to create access request' });
  }
});

// PATCH /api/maps/:id/access-requests/:requestId - approve or deny access request
router.patch('/maps/:id/access-requests/:requestId', async (req, res) => {
  try {
    const { id, requestId } = req.params;
    const { status, role } = req.body || {};
    const map = await mapStore.getMapByIdAsync(id);
    if (!map) return res.status(404).json({ error: 'Map not found' });

    const actorRole = await resolveActorRoleAsync({
      mapId: id,
      ownerUserId: map.user_id,
      actorUserId: req.user?.id || null,
    });
    if (!permissionPolicy.can(permissionPolicy.ACTIONS.ACCESS_REQUEST_REVIEW, actorRole)) {
      return res.status(404).json({ error: 'Map not found' });
    }

    const request = await collaborationStore.getAccessRequestByIdAsync(requestId);
    if (!request || request.map_id !== id) {
      return res.status(404).json({ error: 'Access request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(409).json({ error: 'Access request is no longer pending' });
    }

    const decisionStatus = normalizeAccessRequestStatus(status);
    if (!decisionStatus) {
      return res.status(400).json({ error: 'Invalid status. Use approved or denied.' });
    }

    let membership = null;
    let decisionRole = null;
    if (decisionStatus === 'approved') {
      decisionRole = normalizeInviteRole(role || request.requested_role || permissionPolicy.ROLES.VIEWER);
      if (!decisionRole) {
        return res.status(400).json({ error: 'Invalid role. Use viewer, commenter, or editor.' });
      }
      const existingMembership = await collaborationStore.getMembershipByMapAndUserAsync(
        id,
        request.requester_user_id
      );
      if (existingMembership) {
        return res.status(409).json({ error: 'Requester already has access' });
      }
      membership = await collaborationStore.setMembershipRoleAsync({
        mapId: id,
        userId: request.requester_user_id,
        role: decisionRole,
        invitedByUserId: req.user.id,
      });
    }

    const decidedRequest = await collaborationStore.decideAccessRequestAsync({
      requestId,
      decisionUserId: req.user.id,
      decisionRole,
      status: decisionStatus,
    });

    await recordMapActivityBestEffortAsync({
      mapId: id,
      actorUserId: req.user.id,
      actorRole,
      eventType: decisionStatus === 'approved'
        ? ACTIVITY_TYPES.COLLAB_ACCESS_REQUEST_APPROVED
        : ACTIVITY_TYPES.COLLAB_ACCESS_REQUEST_DENIED,
      eventScope: ACTIVITY_SCOPES.COLLABORATION,
      entityType: 'access_request',
      entityId: requestId,
      summary: decisionStatus === 'approved'
        ? `Approved ${decisionRole} access request for ${formatUserLabel({
          name: request.requester_name,
          email: request.requester_email,
        })}`
        : `Denied access request for ${formatUserLabel({
          name: request.requester_name,
          email: request.requester_email,
        })}`,
      payload: {
        requesterUserId: request.requester_user_id,
        requesterEmail: request.requester_email || null,
        requesterName: request.requester_name || null,
        requestedRole: request.requested_role,
        decisionRole,
        status: decisionStatus,
      },
    }, { label: 'access request review' });

    res.json({
      accessRequest: serializeAccessRequest(decidedRequest),
      membership: membership ? serializeMembership(membership) : null,
    });
  } catch (error) {
    console.error('Review access request error:', error);
    res.status(500).json({ error: 'Failed to review access request' });
  }
});

// GET /api/maps/:id/activity - list recent map activity events for readers
router.get('/maps/:id/activity', async (req, res) => {
  try {
    const { id } = req.params;
    const map = await mapStore.getMapByIdAsync(id);
    if (!map) return res.status(404).json({ error: 'Map not found' });

    const actorRole = await resolveActorRoleAsync({
      mapId: id,
      ownerUserId: map.user_id,
      actorUserId: req.user?.id || null,
    });
    if (!permissionPolicy.can(permissionPolicy.ACTIONS.MAP_ACTIVITY_LIST, actorRole)) {
      return res.status(404).json({ error: 'Map not found' });
    }

    const { limit, offset } = parseActivityPagination(req.query);
    const [events, total] = await Promise.all([
      collaborationActivityStore.listActivityEventsByMapAsync(id, { limit, offset }),
      collaborationActivityStore.countActivityEventsByMapAsync(id),
    ]);

    res.json({
      activity: events.map((event) => serializeActivityEvent(event)),
      pagination: { limit, offset, total },
    });
  } catch (error) {
    console.error('List activity error:', error);
    res.status(500).json({ error: 'Failed to list activity' });
  }
});

// GET /api/maps/:id/collaboration - list memberships and invites for a map
router.get('/maps/:id/collaboration', async (req, res) => {
  try {
    const { id } = req.params;
    const map = await mapStore.getMapByIdAsync(id);
    if (!map) return res.status(404).json({ error: 'Map not found' });

    const canListMemberships = await canMapActionAsync({
      req,
      mapRow: map,
      action: permissionPolicy.ACTIONS.COLLAB_MEMBERSHIP_LIST,
    });
    const canListInvites = await canMapActionAsync({
      req,
      mapRow: map,
      action: permissionPolicy.ACTIONS.COLLAB_INVITE_LIST,
    });
    const canReadSettings = await canMapActionAsync({
      req,
      mapRow: map,
      action: permissionPolicy.ACTIONS.COLLAB_SETTINGS_READ,
    });
    const canListAccessRequests = await canMapActionAsync({
      req,
      mapRow: map,
      action: permissionPolicy.ACTIONS.ACCESS_REQUEST_LIST,
    });
    if (!canListMemberships || !canListInvites || !canReadSettings) {
      return res.status(404).json({ error: 'Map not found' });
    }

    const [memberships, invites, settings, accessRequests] = await Promise.all([
      listCollaborationMembersAsync(map),
      collaborationStore.listInvitesByMapAsync(id, { status: 'pending', limit: 200, offset: 0 }),
      getCollaborationSettingsAsync(id),
      canListAccessRequests
        ? collaborationStore.listAccessRequestsByMapAsync(id, { status: 'pending', limit: 200, offset: 0 })
        : Promise.resolve([]),
    ]);

    res.json({
      collaboration: {
        mapId: id,
        memberships: memberships.map(serializeMembership),
        invites: invites.map((invite) => serializeInvite(invite)),
        settings: serializeCollaborationSettings(settings),
        accessRequests: accessRequests.map((request) => serializeAccessRequest(request)),
      },
    });
  } catch (error) {
    console.error('List collaboration error:', error);
    res.status(500).json({ error: 'Failed to list collaboration data' });
  }
});

// POST /api/maps/:id/invites - create collaboration invite
router.post('/maps/:id/invites', async (req, res) => {
  try {
    const { id } = req.params;
    const { email, role, expires_in_days } = req.body || {};
    const map = await mapStore.getMapByIdAsync(id);
    if (!map) return res.status(404).json({ error: 'Map not found' });

    const inviteeEmail = normalizeEmail(email);
    if (!inviteeEmail || !EMAIL_REGEX.test(inviteeEmail)) {
      return res.status(400).json({ error: 'Valid invite email is required' });
    }

    const inviteRole = normalizeInviteRole(role || permissionPolicy.ROLES.VIEWER);
    if (!inviteRole) {
      return res.status(400).json({ error: 'Invalid role. Use viewer, commenter, or editor.' });
    }
    const settings = await getCollaborationSettingsAsync(id);
    const canInvite = await canCreateInviteAsync({
      req,
      mapRow: map,
      inviteRole,
      settings,
    });
    if (!canInvite) return res.status(404).json({ error: 'Map not found' });

    if (inviteeEmail === normalizeEmail(req.user?.email)) {
      return res.status(400).json({ error: 'Cannot invite your own account' });
    }

    const inviteeUserId = await authStore.findUserIdByEmailAsync(inviteeEmail);
    if (inviteeUserId && inviteeUserId === map.user_id) {
      return res.status(400).json({ error: 'Cannot invite map owner' });
    }
    if (inviteeUserId) {
      const existingMembership = await collaborationStore.getMembershipByMapAndUserAsync(id, inviteeUserId);
      if (existingMembership) {
        return res.status(400).json({ error: 'User already has access' });
      }
    }

    const existingPendingInvite = await collaborationStore.getPendingInviteByMapAndEmailAsync(
      id,
      inviteeEmail
    );
    if (existingPendingInvite) {
      const isExpired = existingPendingInvite.expires_at
        && new Date(existingPendingInvite.expires_at) < new Date();
      if (!isExpired) {
        return res.json({
          invite: serializeInvite(existingPendingInvite, { includeToken: true }),
          reused: true,
        });
      }
      await collaborationStore.markInviteExpiredAsync(existingPendingInvite.id);
    }

    const token = crypto.randomBytes(24).toString('hex');
    const invite = await collaborationStore.createInviteAsync({
      id: uuidv4(),
      mapId: id,
      inviterUserId: req.user.id,
      inviteeEmail,
      role: inviteRole,
      token,
      expiresAt: parseInviteExpiration(expires_in_days),
    });

    const actorRole = await resolveActorRoleAsync({
      mapId: id,
      ownerUserId: map.user_id,
      actorUserId: req.user?.id || null,
    });
    await recordMapActivityBestEffortAsync({
      mapId: id,
      actorUserId: req.user.id,
      actorRole,
      eventType: ACTIVITY_TYPES.COLLAB_INVITE_CREATED,
      eventScope: ACTIVITY_SCOPES.COLLABORATION,
      entityType: 'invite',
      entityId: invite.id,
      summary: `Invited ${inviteeEmail} as ${inviteRole}`,
      payload: {
        inviteId: invite.id,
        inviteeEmail,
        role: inviteRole,
        expiresAt: invite.expires_at || null,
      },
    }, { label: 'invite create' });

    res.json({
      invite: serializeInvite(invite, { includeToken: true }),
    });
  } catch (error) {
    console.error('Create invite error:', error);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// GET /api/collaboration/invites - list pending invites for the logged-in user
router.get('/collaboration/invites', async (req, res) => {
  try {
    const actorEmail = normalizeEmail(req.user?.email);
    if (!actorEmail) {
      return res.json({ invites: [] });
    }

    const invites = await collaborationStore.listPendingInvitesForEmailAsync(actorEmail, {
      status: 'pending',
      limit: 100,
      offset: 0,
    });

    res.json({
      invites: invites.map((invite) => serializeInvite(invite)),
    });
  } catch (error) {
    console.error('List pending invites error:', error);
    res.status(500).json({ error: 'Failed to list pending invites' });
  }
});

// POST /api/collaboration/invites/:inviteId/accept - accept invite from inbox
router.post('/collaboration/invites/id/:inviteId/accept', async (req, res) => {
  try {
    const { inviteId } = req.params;
    const invite = await collaborationStore.getInviteByIdAsync(inviteId);
    const { invite: acceptedInvite, membership } = await acceptInviteForUserAsync(invite, req.user);

    res.json({
      success: true,
      invite: serializeInvite(acceptedInvite),
      membership: serializeMembership(membership),
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Accept invite by id error:', error);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

// POST /api/collaboration/invites/:inviteId/decline - decline invite from inbox
router.post('/collaboration/invites/id/:inviteId/decline', async (req, res) => {
  try {
    const { inviteId } = req.params;
    const invite = await collaborationStore.getInviteByIdAsync(inviteId);
    const result = await declineInviteForUserAsync(invite, req.user);

    res.json({
      success: true,
      invite: serializeInvite(result.invite),
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Decline invite error:', error);
    res.status(500).json({ error: 'Failed to decline invite' });
  }
});

// POST /api/collaboration/invites/:token/accept - accept invite as logged-in user
router.post('/collaboration/invites/:token/accept', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || token.length < 12) {
      return res.status(400).json({ error: 'Invalid invite token' });
    }

    const invite = await collaborationStore.getInviteByTokenAsync(token);
    if (!invite) return res.status(404).json({ error: 'Invite not found' });

    const { invite: acceptedInvite, membership } = await acceptInviteForUserAsync(invite, req.user);

    res.json({
      success: true,
      invite: serializeInvite(acceptedInvite),
      membership: serializeMembership(membership),
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Accept invite error:', error);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

// DELETE /api/maps/:id/invites/:inviteId - revoke invite
router.delete('/maps/:id/invites/:inviteId', async (req, res) => {
  try {
    const { id, inviteId } = req.params;
    const map = await mapStore.getMapByIdAsync(id);
    if (!map) return res.status(404).json({ error: 'Map not found' });

    const canRevoke = await canMapActionAsync({
      req,
      mapRow: map,
      action: permissionPolicy.ACTIONS.COLLAB_INVITE_REVOKE,
    });
    if (!canRevoke) return res.status(404).json({ error: 'Map not found' });

    const invite = await collaborationStore.getInviteByIdAsync(inviteId);
    if (!invite || invite.map_id !== id) return res.status(404).json({ error: 'Invite not found' });

    const revoked = await collaborationStore.revokeInviteAsync(inviteId, id);
    if (revoked) {
      const actorRole = await resolveActorRoleAsync({
        mapId: id,
        ownerUserId: map.user_id,
        actorUserId: req.user?.id || null,
      });
      await recordMapActivityBestEffortAsync({
        mapId: id,
        actorUserId: req.user.id,
        actorRole,
        eventType: ACTIVITY_TYPES.COLLAB_INVITE_REVOKED,
        eventScope: ACTIVITY_SCOPES.COLLABORATION,
        entityType: 'invite',
        entityId: invite.id,
        summary: `Revoked ${invite.role} invite for ${invite.invitee_email}`,
        payload: {
          inviteId: invite.id,
          inviteeEmail: invite.invitee_email,
          role: invite.role,
        },
      }, { label: 'invite revoke' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Revoke invite error:', error);
    res.status(500).json({ error: 'Failed to revoke invite' });
  }
});

// PATCH /api/maps/:id/members/:userId - update member role
router.patch('/maps/:id/members/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;
    const { role } = req.body || {};
    const map = await mapStore.getMapByIdAsync(id);
    if (!map) return res.status(404).json({ error: 'Map not found' });

    const canUpsertMember = await canMapActionAsync({
      req,
      mapRow: map,
      action: permissionPolicy.ACTIONS.COLLAB_MEMBERSHIP_UPSERT,
    });
    if (!canUpsertMember) return res.status(404).json({ error: 'Map not found' });

    if (userId === map.user_id) {
      return res.status(400).json({ error: 'Cannot change owner membership role' });
    }

    const actorRole = await resolveActorRoleAsync({
      mapId: id,
      ownerUserId: map.user_id,
      actorUserId: req.user?.id || null,
    });
    const normalizedRole = normalizeMembershipRole(role);
    if (!normalizedRole) {
      return res.status(400).json({ error: 'Invalid role. Use owner, viewer, commenter, or editor.' });
    }
    if (normalizedRole === permissionPolicy.ROLES.OWNER && actorRole !== permissionPolicy.ROLES.OWNER) {
      return res.status(403).json({ error: 'Only owners can grant owner access' });
    }

    const user = await authStore.getPublicUserByIdAsync(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const existingMembership = await collaborationStore.getMembershipByMapAndUserAsync(id, userId);
    if (isOwnerRole(existingMembership?.role) && actorRole !== permissionPolicy.ROLES.OWNER) {
      return res.status(403).json({ error: 'Only owners can change owner access' });
    }

    const membership = await collaborationStore.setMembershipRoleAsync({
      mapId: id,
      userId,
      role: normalizedRole,
      invitedByUserId: req.user.id,
    });

    if (!existingMembership || existingMembership.role !== normalizedRole) {
      await recordMapActivityBestEffortAsync({
        mapId: id,
        actorUserId: req.user.id,
        actorRole,
        eventType: ACTIVITY_TYPES.COLLAB_MEMBERSHIP_ROLE_CHANGED,
        eventScope: ACTIVITY_SCOPES.COLLABORATION,
        entityType: 'membership',
        entityId: membership.id,
        summary: !existingMembership
          ? `Granted ${normalizedRole} access to ${formatUserLabel(user)}`
          : `Changed ${formatUserLabel(user)} from ${existingMembership.role} to ${normalizedRole}`,
        payload: {
          userId,
          userEmail: user.email || null,
          userName: user.name || null,
          previousRole: existingMembership?.role || null,
          role: normalizedRole,
        },
      }, { label: 'membership upsert' });
    }

    res.json({ membership: serializeMembership(membership) });
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

// DELETE /api/maps/:id/members/:userId - remove member access
router.delete('/maps/:id/members/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;
    const map = await mapStore.getMapByIdAsync(id);
    if (!map) return res.status(404).json({ error: 'Map not found' });

    const canDeleteMember = await canMapActionAsync({
      req,
      mapRow: map,
      action: permissionPolicy.ACTIONS.COLLAB_MEMBERSHIP_DELETE,
    });
    if (!canDeleteMember) return res.status(404).json({ error: 'Map not found' });

    if (userId === map.user_id) {
      return res.status(400).json({ error: 'Cannot remove owner access' });
    }

    const actorRole = await resolveActorRoleAsync({
      mapId: id,
      ownerUserId: map.user_id,
      actorUserId: req.user?.id || null,
    });
    const membership = await collaborationStore.getMembershipByMapAndUserAsync(id, userId);
    if (!membership) return res.status(404).json({ error: 'Membership not found' });
    const user = await authStore.getPublicUserByIdAsync(userId);
    if (isOwnerRole(membership.role) && actorRole !== permissionPolicy.ROLES.OWNER) {
      return res.status(403).json({ error: 'Only owners can remove owner access' });
    }

    const deleted = await collaborationStore.deleteMembershipByMapAndUserAsync(id, userId);
    if (!deleted) return res.status(404).json({ error: 'Membership not found' });

    await recordMapActivityBestEffortAsync({
      mapId: id,
      actorUserId: req.user.id,
      actorRole,
      eventType: ACTIVITY_TYPES.COLLAB_MEMBERSHIP_REMOVED,
      eventScope: ACTIVITY_SCOPES.COLLABORATION,
      entityType: 'membership',
      entityId: membership.id,
      summary: `Removed ${membership.role} access from ${formatUserLabel(user)}`,
      payload: {
        userId,
        userEmail: user?.email || null,
        userName: user?.name || null,
        previousRole: membership.role,
      },
    }, { label: 'membership delete' });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete member error:', error);
    res.status(500).json({ error: 'Failed to remove member access' });
  }
});

module.exports = router;

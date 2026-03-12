const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, requireAuth } = require('./auth');
const mapStore = require('../stores/mapStore');
const authStore = require('../stores/authStore');
const collaborationStore = require('../stores/collaborationStore');
const permissionPolicy = require('../policies/permissionPolicy');

const router = express.Router();

const COLLABORATION_BACKEND_ENABLED = parseEnvBool(
  process.env.COLLABORATION_BACKEND_ENABLED,
  false
);
const COLLAB_INVITE_DEFAULT_DAYS = Number(process.env.COLLAB_INVITE_DEFAULT_DAYS ?? 7);
const COLLAB_INVITE_MAX_DAYS = Number(process.env.COLLAB_INVITE_MAX_DAYS ?? 30);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COLLAB_ROLES = new Set([
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

function normalizeRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (!COLLAB_ROLES.has(normalized)) return null;
  return normalized;
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
  };
}

function serializeInvite(row, { includeToken = false } = {}) {
  if (!row) return null;
  const payload = {
    id: row.id,
    mapId: row.map_id,
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

router.use(authMiddleware);
router.use((req, res, next) => {
  if (!COLLABORATION_BACKEND_ENABLED) return notFound(res);
  return next();
});
router.use(requireAuth);
router.use(async (req, res, next) => {
  try {
    await collaborationStore.ensureCollaborationSchemaAsync();
    next();
  } catch (error) {
    console.error('Ensure collaboration schema error:', error);
    res.status(500).json({ error: 'Failed to initialize collaboration backend' });
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
    if (!canListMemberships || !canListInvites) return res.status(404).json({ error: 'Map not found' });

    const [memberships, invites] = await Promise.all([
      collaborationStore.listMembershipsByMapAsync(id),
      collaborationStore.listInvitesByMapAsync(id, { status: 'pending', limit: 200, offset: 0 }),
    ]);

    res.json({
      collaboration: {
        mapId: id,
        memberships: memberships.map(serializeMembership),
        invites: invites.map((invite) => serializeInvite(invite)),
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

    const canInvite = await canMapActionAsync({
      req,
      mapRow: map,
      action: permissionPolicy.ACTIONS.COLLAB_INVITE_CREATE,
    });
    if (!canInvite) return res.status(404).json({ error: 'Map not found' });

    const inviteeEmail = normalizeEmail(email);
    if (!inviteeEmail || !EMAIL_REGEX.test(inviteeEmail)) {
      return res.status(400).json({ error: 'Valid invite email is required' });
    }

    const inviteRole = normalizeRole(role || permissionPolicy.ROLES.VIEWER);
    if (!inviteRole) {
      return res.status(400).json({ error: 'Invalid role. Use viewer, commenter, or editor.' });
    }

    if (inviteeEmail === normalizeEmail(req.user?.email)) {
      return res.status(400).json({ error: 'Cannot invite your own account' });
    }

    const inviteeUserId = await authStore.findUserIdByEmailAsync(inviteeEmail);
    if (inviteeUserId && inviteeUserId === map.user_id) {
      return res.status(400).json({ error: 'Cannot invite map owner' });
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

    res.json({
      invite: serializeInvite(invite, { includeToken: true }),
    });
  } catch (error) {
    console.error('Create invite error:', error);
    res.status(500).json({ error: 'Failed to create invite' });
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

    if (invite.status !== 'pending') {
      return res.status(409).json({ error: 'Invite is no longer pending' });
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      await collaborationStore.markInviteExpiredAsync(invite.id);
      return res.status(410).json({ error: 'Invite has expired' });
    }

    const actorEmail = normalizeEmail(req.user?.email);
    if (!actorEmail || actorEmail !== normalizeEmail(invite.invitee_email)) {
      return res.status(403).json({ error: 'Invite email does not match your account' });
    }

    const map = await mapStore.getMapByIdAsync(invite.map_id);
    if (!map) return res.status(404).json({ error: 'Map not found' });
    if (req.user.id === map.user_id) {
      return res.status(400).json({ error: 'Map owner already has access' });
    }

    await collaborationStore.setMembershipRoleAsync({
      mapId: invite.map_id,
      userId: req.user.id,
      role: invite.role,
      invitedByUserId: invite.inviter_user_id,
    });

    const [acceptedInvite, membership] = await Promise.all([
      collaborationStore.markInviteAcceptedAsync({
        inviteId: invite.id,
        acceptedByUserId: req.user.id,
      }),
      collaborationStore.getMembershipByMapAndUserAsync(invite.map_id, req.user.id),
    ]);

    res.json({
      success: true,
      invite: serializeInvite(acceptedInvite),
      membership: serializeMembership(membership),
    });
  } catch (error) {
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

    await collaborationStore.revokeInviteAsync(inviteId, id);
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

    const normalizedRole = normalizeRole(role);
    if (!normalizedRole) {
      return res.status(400).json({ error: 'Invalid role. Use viewer, commenter, or editor.' });
    }

    const user = await authStore.getPublicUserByIdAsync(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const membership = await collaborationStore.setMembershipRoleAsync({
      mapId: id,
      userId,
      role: normalizedRole,
      invitedByUserId: req.user.id,
    });

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

    const deleted = await collaborationStore.deleteMembershipByMapAndUserAsync(id, userId);
    if (!deleted) return res.status(404).json({ error: 'Membership not found' });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete member error:', error);
    res.status(500).json({ error: 'Failed to remove member access' });
  }
});

module.exports = router;

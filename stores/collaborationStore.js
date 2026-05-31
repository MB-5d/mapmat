const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');

let ensureSchemaPromise = null;

const DEFAULT_COLLABORATION_SETTINGS = Object.freeze({
  access_policy: 'private',
  non_viewer_invites_require_owner: 0,
  access_requests_enabled: 1,
  presence_identity_mode: 'named',
});

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase();
}

async function ensureCollaborationSchemaAsync() {
  if (ensureSchemaPromise) {
    return ensureSchemaPromise;
  }

  ensureSchemaPromise = (async () => {
    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS map_memberships (
        id TEXT PRIMARY KEY,
        map_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        invited_by_user_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (map_id, user_id),
        FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS map_invites (
        id TEXT PRIMARY KEY,
        map_id TEXT NOT NULL,
        inviter_user_id TEXT NOT NULL,
        invitee_email TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP,
        accepted_by_user_id TEXT,
        accepted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
        FOREIGN KEY (inviter_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS map_collaboration_settings (
        map_id TEXT PRIMARY KEY,
        access_policy TEXT NOT NULL DEFAULT 'private',
        non_viewer_invites_require_owner INTEGER NOT NULL DEFAULT 0,
        access_requests_enabled INTEGER NOT NULL DEFAULT 1,
        presence_identity_mode TEXT NOT NULL DEFAULT 'named',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
      )
    `);

    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS map_access_requests (
        id TEXT PRIMARY KEY,
        map_id TEXT NOT NULL,
        requester_user_id TEXT NOT NULL,
        requested_role TEXT NOT NULL DEFAULT 'viewer',
        status TEXT NOT NULL DEFAULT 'pending',
        message TEXT,
        decision_user_id TEXT,
        decision_role TEXT,
        decided_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
        FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (decision_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_map_memberships_map_id ON map_memberships(map_id)'
    );
    await adapter.executeAsync(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_map_memberships_map_user ON map_memberships(map_id, user_id)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_map_invites_map_status ON map_invites(map_id, status)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_map_invites_email_status ON map_invites(invitee_email, status)'
    );
    await adapter.executeAsync(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_map_invites_token ON map_invites(token)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_map_access_requests_map_status ON map_access_requests(map_id, status)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_map_access_requests_requester_status ON map_access_requests(requester_user_id, status)'
    );
    await adapter.executeAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_map_access_requests_pending_unique
      ON map_access_requests(map_id, requester_user_id)
      WHERE status = 'pending'
    `);
  })();

  try {
    await ensureSchemaPromise;
  } catch (error) {
    ensureSchemaPromise = null;
    throw error;
  }
}

function listMembershipsByMapAsync(mapId) {
  return adapter.queryAllAsync(`
    SELECT m.*,
      u.email as user_email,
      u.name as user_name,
      inviter.email as invited_by_email,
      inviter.name as invited_by_name
    FROM map_memberships m
    LEFT JOIN users u ON m.user_id = u.id
    LEFT JOIN users inviter ON m.invited_by_user_id = inviter.id
    WHERE m.map_id = ?
    ORDER BY m.created_at ASC
  `, [mapId]);
}

function getMembershipByMapAndUserAsync(mapId, userId) {
  return adapter.queryOneAsync(
    'SELECT * FROM map_memberships WHERE map_id = ? AND user_id = ?',
    [mapId, userId]
  );
}

async function setMembershipRoleAsync({
  mapId,
  userId,
  role,
  invitedByUserId = null,
}) {
  const normalizedRole = normalizeRole(role);
  const existing = await getMembershipByMapAndUserAsync(mapId, userId);

  if (existing) {
    await adapter.executeAsync(`
      UPDATE map_memberships
      SET role = ?, invited_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE map_id = ? AND user_id = ?
    `, [normalizedRole, invitedByUserId, mapId, userId]);
  } else {
    await adapter.executeAsync(`
      INSERT INTO map_memberships (id, map_id, user_id, role, invited_by_user_id)
      VALUES (?, ?, ?, ?, ?)
    `, [uuidv4(), mapId, userId, normalizedRole, invitedByUserId]);
  }

  return getMembershipByMapAndUserAsync(mapId, userId);
}

async function deleteMembershipByMapAndUserAsync(mapId, userId) {
  return (await adapter.executeAsync(
    'DELETE FROM map_memberships WHERE map_id = ? AND user_id = ?',
    [mapId, userId]
  )).changes || 0;
}

function listInvitesByMapAsync(mapId, { status = null, limit = 100, offset = 0 } = {}) {
  const params = [mapId];
  let query = `
    SELECT i.*,
      inviter.email as inviter_email,
      inviter.name as inviter_name,
      accepted.email as accepted_by_email,
      accepted.name as accepted_by_name
    FROM map_invites i
    LEFT JOIN users inviter ON i.inviter_user_id = inviter.id
    LEFT JOIN users accepted ON i.accepted_by_user_id = accepted.id
    WHERE i.map_id = ?
  `;

  if (status) {
    query += ' AND i.status = ?';
    params.push(normalizeStatus(status));
  }

  query += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return adapter.queryAllAsync(query, params);
}

function listPendingInvitesForEmailAsync(inviteeEmail, { limit = 100, offset = 0 } = {}) {
  return adapter.queryAllAsync(`
    SELECT i.*,
      maps.name as map_name,
      maps.url as map_url,
      inviter.email as inviter_email,
      inviter.name as inviter_name
    FROM map_invites i
    INNER JOIN maps ON maps.id = i.map_id
    LEFT JOIN users inviter ON i.inviter_user_id = inviter.id
    WHERE i.invitee_email = ? AND i.status = 'pending'
    ORDER BY i.created_at DESC
    LIMIT ? OFFSET ?
  `, [String(inviteeEmail || '').trim().toLowerCase(), limit, offset]);
}

function getInviteByIdAsync(inviteId) {
  return adapter.queryOneAsync('SELECT * FROM map_invites WHERE id = ?', [inviteId]);
}

function getInviteByTokenAsync(token) {
  return adapter.queryOneAsync('SELECT * FROM map_invites WHERE token = ?', [token]);
}

function getPendingInviteByMapAndEmailAsync(mapId, inviteeEmail) {
  return adapter.queryOneAsync(`
    SELECT * FROM map_invites
    WHERE map_id = ? AND invitee_email = ? AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `, [mapId, String(inviteeEmail || '').trim().toLowerCase()]);
}

async function createInviteAsync({
  id,
  mapId,
  inviterUserId,
  inviteeEmail,
  role,
  token,
  expiresAt = null,
}) {
  await adapter.executeAsync(`
    INSERT INTO map_invites (
      id, map_id, inviter_user_id, invitee_email, role, status, token, expires_at
    )
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `, [
    id,
    mapId,
    inviterUserId,
    String(inviteeEmail || '').trim().toLowerCase(),
    normalizeRole(role),
    token,
    expiresAt,
  ]);

  return getInviteByIdAsync(id);
}

async function markInviteAcceptedAsync({
  inviteId,
  acceptedByUserId,
}) {
  await adapter.executeAsync(`
    UPDATE map_invites
    SET status = 'accepted',
      accepted_by_user_id = ?,
      accepted_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'pending'
  `, [acceptedByUserId, inviteId]);
  return getInviteByIdAsync(inviteId);
}

async function markInviteDeclinedAsync({
  inviteId,
}) {
  await adapter.executeAsync(`
    UPDATE map_invites
    SET status = 'declined',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [inviteId]);

  return getInviteByIdAsync(inviteId);
}

async function revokeInviteAsync(inviteId, mapId) {
  return (await adapter.executeAsync(`
    UPDATE map_invites
    SET status = 'revoked',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND map_id = ? AND status = 'pending'
  `, [inviteId, mapId])).changes || 0;
}

async function markInviteExpiredAsync(inviteId) {
  return (await adapter.executeAsync(`
    UPDATE map_invites
    SET status = 'expired',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'pending'
  `, [inviteId])).changes || 0;
}

async function getCollaborationSettingsByMapAsync(mapId) {
  const row = await adapter.queryOneAsync(
    'SELECT * FROM map_collaboration_settings WHERE map_id = ?',
    [mapId]
  );

  if (row) return row;

  return {
    map_id: mapId,
    ...DEFAULT_COLLABORATION_SETTINGS,
    created_at: null,
    updated_at: null,
  };
}

async function upsertCollaborationSettingsAsync({
  mapId,
  accessPolicy = DEFAULT_COLLABORATION_SETTINGS.access_policy,
  nonViewerInvitesRequireOwner = DEFAULT_COLLABORATION_SETTINGS.non_viewer_invites_require_owner,
  accessRequestsEnabled = DEFAULT_COLLABORATION_SETTINGS.access_requests_enabled,
  presenceIdentityMode = DEFAULT_COLLABORATION_SETTINGS.presence_identity_mode,
}) {
  const existing = await adapter.queryOneAsync(
    'SELECT map_id FROM map_collaboration_settings WHERE map_id = ?',
    [mapId]
  );

  if (existing) {
    await adapter.executeAsync(`
      UPDATE map_collaboration_settings
      SET access_policy = ?,
        non_viewer_invites_require_owner = ?,
        access_requests_enabled = ?,
        presence_identity_mode = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE map_id = ?
    `, [
      accessPolicy,
      nonViewerInvitesRequireOwner ? 1 : 0,
      accessRequestsEnabled ? 1 : 0,
      presenceIdentityMode,
      mapId,
    ]);
  } else {
    await adapter.executeAsync(`
      INSERT INTO map_collaboration_settings (
        map_id, access_policy, non_viewer_invites_require_owner, access_requests_enabled, presence_identity_mode
      )
      VALUES (?, ?, ?, ?, ?)
    `, [
      mapId,
      accessPolicy,
      nonViewerInvitesRequireOwner ? 1 : 0,
      accessRequestsEnabled ? 1 : 0,
      presenceIdentityMode,
    ]);
  }

  return getCollaborationSettingsByMapAsync(mapId);
}

function listAccessRequestsByMapAsync(mapId, { status = null, limit = 100, offset = 0 } = {}) {
  const params = [mapId];
  let query = `
    SELECT ar.*,
      requester.email as requester_email,
      requester.name as requester_name,
      decision.email as decision_user_email,
      decision.name as decision_user_name
    FROM map_access_requests ar
    LEFT JOIN users requester ON ar.requester_user_id = requester.id
    LEFT JOIN users decision ON ar.decision_user_id = decision.id
    WHERE ar.map_id = ?
  `;

  if (status) {
    query += ' AND ar.status = ?';
    params.push(normalizeStatus(status));
  }

  query += ' ORDER BY ar.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return adapter.queryAllAsync(query, params);
}

function listReviewableAccessRequestsForUserAsync(userId, { status = 'pending', limit = 100, offset = 0 } = {}) {
  return adapter.queryAllAsync(`
    SELECT ar.*,
      maps.name as map_name,
      maps.url as map_url,
      requester.email as requester_email,
      requester.name as requester_name,
      decision.email as decision_user_email,
      decision.name as decision_user_name
    FROM map_access_requests ar
    INNER JOIN maps ON maps.id = ar.map_id
    LEFT JOIN users requester ON ar.requester_user_id = requester.id
    LEFT JOIN users decision ON ar.decision_user_id = decision.id
    LEFT JOIN map_memberships owner_membership
      ON owner_membership.map_id = ar.map_id
      AND owner_membership.user_id = ?
      AND owner_membership.role = 'owner'
    WHERE ar.status = ?
      AND (
        maps.user_id = ?
        OR owner_membership.user_id IS NOT NULL
      )
    ORDER BY ar.created_at DESC
    LIMIT ? OFFSET ?
  `, [userId, normalizeStatus(status || 'pending'), userId, limit, offset]);
}

function getAccessRequestByIdAsync(requestId) {
  return adapter.queryOneAsync(`
    SELECT ar.*,
      requester.email as requester_email,
      requester.name as requester_name,
      decision.email as decision_user_email,
      decision.name as decision_user_name
    FROM map_access_requests ar
    LEFT JOIN users requester ON ar.requester_user_id = requester.id
    LEFT JOIN users decision ON ar.decision_user_id = decision.id
    WHERE ar.id = ?
  `, [requestId]);
}

function getPendingAccessRequestByMapAndUserAsync(mapId, requesterUserId) {
  return adapter.queryOneAsync(`
    SELECT *
    FROM map_access_requests
    WHERE map_id = ? AND requester_user_id = ? AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `, [mapId, requesterUserId]);
}

async function createAccessRequestAsync({
  id,
  mapId,
  requesterUserId,
  requestedRole = 'viewer',
  message = null,
}) {
  await adapter.executeAsync(`
    INSERT INTO map_access_requests (
      id, map_id, requester_user_id, requested_role, status, message
    )
    VALUES (?, ?, ?, ?, 'pending', ?)
  `, [id, mapId, requesterUserId, normalizeRole(requestedRole), message]);

  return getAccessRequestByIdAsync(id);
}

async function decideAccessRequestAsync({
  requestId,
  decisionUserId,
  decisionRole = null,
  status,
}) {
  await adapter.executeAsync(`
    UPDATE map_access_requests
    SET status = ?,
      decision_user_id = ?,
      decision_role = ?,
      decided_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'pending'
  `, [normalizeStatus(status), decisionUserId, decisionRole ? normalizeRole(decisionRole) : null, requestId]);

  return getAccessRequestByIdAsync(requestId);
}

module.exports = {
  DEFAULT_COLLABORATION_SETTINGS,
  ensureCollaborationSchemaAsync,
  listMembershipsByMapAsync,
  getMembershipByMapAndUserAsync,
  setMembershipRoleAsync,
  deleteMembershipByMapAndUserAsync,
  listInvitesByMapAsync,
  listPendingInvitesForEmailAsync,
  getInviteByIdAsync,
  getInviteByTokenAsync,
  getPendingInviteByMapAndEmailAsync,
  createInviteAsync,
  markInviteAcceptedAsync,
  markInviteDeclinedAsync,
  revokeInviteAsync,
  markInviteExpiredAsync,
  getCollaborationSettingsByMapAsync,
  upsertCollaborationSettingsAsync,
  listAccessRequestsByMapAsync,
  listReviewableAccessRequestsForUserAsync,
  getAccessRequestByIdAsync,
  getPendingAccessRequestByMapAndUserAsync,
  createAccessRequestAsync,
  decideAccessRequestAsync,
};

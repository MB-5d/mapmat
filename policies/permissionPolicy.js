const ROLES = Object.freeze({
  OWNER: 'owner',
  EDITOR: 'editor',
  COMMENTER: 'commenter',
  VIEWER: 'viewer',
  ANONYMOUS: 'anonymous',
  NONE: 'none',
});

const ACTIONS = Object.freeze({
  PROJECT_LIST: 'project.list',
  PROJECT_CREATE: 'project.create',
  PROJECT_UPDATE: 'project.update',
  PROJECT_DELETE: 'project.delete',
  MAP_LIST: 'map.list',
  MAP_READ: 'map.read',
  MAP_CREATE: 'map.create',
  MAP_UPDATE: 'map.update',
  MAP_DELETE: 'map.delete',
  MAP_VERSION_LIST: 'mapVersion.list',
  MAP_VERSION_CREATE: 'mapVersion.create',
  HISTORY_LIST: 'history.list',
  HISTORY_CREATE: 'history.create',
  HISTORY_UPDATE: 'history.update',
  HISTORY_DELETE: 'history.delete',
  SHARE_LIST: 'share.list',
  SHARE_CREATE: 'share.create',
  SHARE_DELETE: 'share.delete',
  SHARE_READ_PUBLIC: 'share.readPublic',
  DISCOVERY_RUN: 'discovery.run',
});

const FEATURES = Object.freeze({
  PROJECT_MANAGE: 'project.manage',
  MAP_VIEW: 'map.view',
  MAP_EDIT: 'map.edit',
  VERSION_SAVE: 'map.version.save',
  HISTORY_MANAGE: 'history.manage',
  SHARE_MANAGE: 'share.manage',
  DISCOVERY_RUN: 'map.discovery.run',
});

const ROLE_SET = new Set(Object.values(ROLES));

const ACTION_ROLE_MATRIX = Object.freeze({
  [ACTIONS.PROJECT_LIST]: [ROLES.OWNER, ROLES.EDITOR, ROLES.COMMENTER, ROLES.VIEWER],
  [ACTIONS.PROJECT_CREATE]: [ROLES.OWNER],
  [ACTIONS.PROJECT_UPDATE]: [ROLES.OWNER, ROLES.EDITOR],
  [ACTIONS.PROJECT_DELETE]: [ROLES.OWNER],

  [ACTIONS.MAP_LIST]: [ROLES.OWNER, ROLES.EDITOR, ROLES.COMMENTER, ROLES.VIEWER],
  [ACTIONS.MAP_READ]: [ROLES.OWNER, ROLES.EDITOR, ROLES.COMMENTER, ROLES.VIEWER],
  [ACTIONS.MAP_CREATE]: [ROLES.OWNER, ROLES.EDITOR],
  [ACTIONS.MAP_UPDATE]: [ROLES.OWNER, ROLES.EDITOR],
  [ACTIONS.MAP_DELETE]: [ROLES.OWNER],

  [ACTIONS.MAP_VERSION_LIST]: [ROLES.OWNER, ROLES.EDITOR, ROLES.COMMENTER, ROLES.VIEWER],
  [ACTIONS.MAP_VERSION_CREATE]: [ROLES.OWNER, ROLES.EDITOR],

  [ACTIONS.HISTORY_LIST]: [ROLES.OWNER],
  [ACTIONS.HISTORY_CREATE]: [ROLES.OWNER],
  [ACTIONS.HISTORY_UPDATE]: [ROLES.OWNER],
  [ACTIONS.HISTORY_DELETE]: [ROLES.OWNER],

  [ACTIONS.SHARE_LIST]: [ROLES.OWNER],
  [ACTIONS.SHARE_CREATE]: [ROLES.OWNER, ROLES.EDITOR],
  [ACTIONS.SHARE_DELETE]: [ROLES.OWNER, ROLES.EDITOR],
  [ACTIONS.SHARE_READ_PUBLIC]: [ROLES.OWNER, ROLES.EDITOR, ROLES.COMMENTER, ROLES.VIEWER, ROLES.ANONYMOUS],

  [ACTIONS.DISCOVERY_RUN]: [ROLES.OWNER, ROLES.EDITOR],
});

const FEATURE_ACTION_MAP = Object.freeze({
  [FEATURES.PROJECT_MANAGE]: ACTIONS.PROJECT_UPDATE,
  [FEATURES.MAP_VIEW]: ACTIONS.MAP_READ,
  [FEATURES.MAP_EDIT]: ACTIONS.MAP_UPDATE,
  [FEATURES.VERSION_SAVE]: ACTIONS.MAP_VERSION_CREATE,
  [FEATURES.HISTORY_MANAGE]: ACTIONS.HISTORY_UPDATE,
  [FEATURES.SHARE_MANAGE]: ACTIONS.SHARE_CREATE,
  [FEATURES.DISCOVERY_RUN]: ACTIONS.DISCOVERY_RUN,
});

function normalizeRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (!normalized) return ROLES.NONE;
  return ROLE_SET.has(normalized) ? normalized : ROLES.NONE;
}

function resolveResourceRole({ actorUserId, resourceOwnerUserId, membershipRole = null } = {}) {
  if (actorUserId && resourceOwnerUserId && actorUserId === resourceOwnerUserId) {
    return ROLES.OWNER;
  }

  const normalizedMembership = normalizeRole(membershipRole);
  if ([ROLES.EDITOR, ROLES.COMMENTER, ROLES.VIEWER].includes(normalizedMembership)) {
    return normalizedMembership;
  }

  if (!actorUserId) {
    return ROLES.ANONYMOUS;
  }

  return ROLES.NONE;
}

function can(action, role) {
  const allowedRoles = ACTION_ROLE_MATRIX[action];
  if (!allowedRoles) return false;
  return allowedRoles.includes(normalizeRole(role));
}

function canForResource(action, context = {}) {
  const role = resolveResourceRole(context);
  return can(action, role);
}

function isFeatureAllowed(feature, role) {
  const action = FEATURE_ACTION_MAP[feature];
  if (!action) return false;
  return can(action, role);
}

module.exports = {
  ROLES,
  ACTIONS,
  FEATURES,
  ACTION_ROLE_MATRIX,
  FEATURE_ACTION_MAP,
  normalizeRole,
  resolveResourceRole,
  can,
  canForResource,
  isFeatureAllowed,
};

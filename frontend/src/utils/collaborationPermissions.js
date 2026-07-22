export const COLLABORATION_MANAGER_ROLES = Object.freeze(['owner', 'editor']);

export function normalizeCollaborationRole(role) {
  return String(role || '').trim().toLowerCase() || 'viewer';
}

export function canManageCollaborationForRole(role) {
  return COLLABORATION_MANAGER_ROLES.includes(normalizeCollaborationRole(role));
}

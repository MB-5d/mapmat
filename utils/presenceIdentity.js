const permissionPolicy = require('../policies/permissionPolicy');

function normalizePresenceIdentityMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'anonymous' ? 'anonymous' : 'named';
}

function hashString(value) {
  const input = String(value || '');
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function trimDisplayText(value, maxLength = 80) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function roleLabelFromAccessMode(accessMode, role) {
  if (accessMode === 'edit') return 'Editor';
  if (accessMode === 'comment') return 'Commenter';
  if (role === permissionPolicy.ROLES.OWNER) return 'Owner';
  return 'Viewer';
}

function buildAvatarLabel(displayName, fallback = 'C') {
  const source = trimDisplayText(displayName, 32) || trimDisplayText(fallback, 8) || 'C';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function buildPresenceIdentity({
  actorId,
  sessionId,
  role,
  accessMode,
  user,
  presenceIdentityMode,
}) {
  const identityMode = normalizePresenceIdentityMode(presenceIdentityMode);
  const seed = `${actorId || 'anon'}:${sessionId || 'session'}`;
  const tone = hashString(seed) % 4;

  if (identityMode === 'anonymous') {
    const roleLabel = roleLabelFromAccessMode(accessMode, role);
    const aliasNumber = (hashString(seed) % 90) + 10;
    const displayName = `${roleLabel} ${aliasNumber}`;
    return {
      identityMode,
      displayName,
      userEmail: null,
      tone,
      avatarLabel: buildAvatarLabel(displayName, roleLabel),
    };
  }

  const displayName = trimDisplayText(user?.name, 80)
    || trimDisplayText(user?.email, 120)
    || 'Collaborator';

  return {
    identityMode,
    displayName,
    userEmail: trimDisplayText(user?.email, 120),
    tone,
    avatarLabel: buildAvatarLabel(displayName, 'C'),
  };
}

module.exports = {
  buildPresenceIdentity,
  normalizePresenceIdentityMode,
};

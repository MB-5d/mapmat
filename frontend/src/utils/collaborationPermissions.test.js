import { canManageCollaborationForRole, normalizeCollaborationRole } from './collaborationPermissions';

describe('collaboration role permissions', () => {
  test('allows collaboration management for owners and editors only', () => {
    expect(canManageCollaborationForRole('owner')).toBe(true);
    expect(canManageCollaborationForRole('editor')).toBe(true);
    expect(canManageCollaborationForRole('commenter')).toBe(false);
    expect(canManageCollaborationForRole('viewer')).toBe(false);
  });

  test('normalizes role values before checking access', () => {
    expect(canManageCollaborationForRole(' Owner ')).toBe(true);
    expect(canManageCollaborationForRole('EDITOR')).toBe(true);
    expect(normalizeCollaborationRole(null)).toBe('viewer');
  });
});

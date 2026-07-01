export const UNCATEGORIZED_PROJECT_KEY = 'uncategorized';
export const SHARED_PROJECT_KEY = 'shared-with-me';

export const normalizeMapNameForCompare = (value) => (
  String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
);

export const normalizeProjectKey = (projectId) => {
  const normalized = String(projectId || '').trim();
  const lowered = normalized.toLowerCase();
  if (!lowered || lowered === UNCATEGORIZED_PROJECT_KEY || lowered === SHARED_PROJECT_KEY) {
    return '';
  }
  return normalized;
};

export const findMapNameConflict = (
  projects,
  {
    projectId = null,
    name = '',
    excludeMapId = null,
  } = {}
) => {
  const targetName = normalizeMapNameForCompare(name);
  if (!targetName) return null;
  const targetProjectKey = normalizeProjectKey(projectId);
  const excludedId = excludeMapId === undefined || excludeMapId === null ? '' : String(excludeMapId);

  for (const project of projects || []) {
    const projectKey = normalizeProjectKey(project?.id);
    if (String(project?.id || '').toLowerCase() === SHARED_PROJECT_KEY) continue;

    for (const map of project?.maps || []) {
      if (!map?.id || (excludedId && String(map.id) === excludedId)) continue;
      const mapProjectKey = normalizeProjectKey(
        map.project_id !== undefined && map.project_id !== null ? map.project_id : projectKey
      );
      if (mapProjectKey !== targetProjectKey) continue;
      if (normalizeMapNameForCompare(map.name) === targetName) {
        return { map, project };
      }
    }
  }

  return null;
};

export const getMapNameConflictMessage = (name) => (
  `A map named "${String(name || '').trim()}" already exists in this folder.`
);

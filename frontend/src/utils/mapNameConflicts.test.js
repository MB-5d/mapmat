import { findMapNameConflict, normalizeMapNameForCompare, normalizeProjectKey } from './mapNameConflicts';

describe('mapNameConflicts', () => {
  const projects = [
    {
      id: 'p1',
      name: 'Project One',
      maps: [
        { id: 'map-1', name: 'Homepage Map', project_id: 'p1' },
        { id: 'map-2', name: 'Launch Map', project_id: 'p1' },
      ],
    },
    {
      id: 'uncategorized',
      name: 'Uncategorized',
      maps: [{ id: 'map-3', name: 'Homepage Map', project_id: null }],
    },
  ];

  test('normalizes map names and virtual project ids', () => {
    expect(normalizeMapNameForCompare('  Homepage   Map ')).toBe('homepage map');
    expect(normalizeProjectKey('uncategorized')).toBe('');
    expect(normalizeProjectKey('shared-with-me')).toBe('');
    expect(normalizeProjectKey('p1')).toBe('p1');
  });

  test('finds conflicts only inside the selected project and excludes current map', () => {
    expect(findMapNameConflict(projects, {
      projectId: 'p1',
      name: 'homepage map',
    })?.map.id).toBe('map-1');

    expect(findMapNameConflict(projects, {
      projectId: 'p2',
      name: 'homepage map',
    })).toBeNull();

    expect(findMapNameConflict(projects, {
      projectId: 'p1',
      name: 'homepage map',
      excludeMapId: 'map-1',
    })).toBeNull();
  });
});

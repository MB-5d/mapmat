import { applyOperationToDocument } from './coeditingDocument';

describe('coediting document node.move', () => {
  test('moves a branch and preserves links for optimistic collaboration state', () => {
    const document = {
      mapId: 'map-1',
      version: 0,
      name: 'Live Map',
      root: {
        id: 'root',
        title: 'Home',
        children: [
          {
            id: 'branch',
            title: 'Branch',
            url: 'https://example.com/branch',
            children: [{ id: 'leaf', title: 'Leaf', url: 'https://example.com/leaf', children: [] }],
          },
          { id: 'target', title: 'Target', children: [] },
        ],
      },
      orphans: [],
      connections: [{ id: 'link-1', sourceNodeId: 'root', targetNodeId: 'leaf', type: 'crosslink' }],
    };

    const next = applyOperationToDocument(document, {
      type: 'node.move',
      payload: {
        nodeId: 'branch',
        targetParentId: 'target',
        insertIndex: 0,
        rootChanges: {
          annotations: { status: 'moved', tags: [], note: '', meta: { updatedAt: 'now' } },
        },
      },
    });

    const movedBranch = next.root.children[0].children[0];
    expect(next.root.children[0].id).toBe('target');
    expect(movedBranch.id).toBe('branch');
    expect(movedBranch.children[0].id).toBe('leaf');
    expect(movedBranch.annotations.status).toBe('moved');
    expect(movedBranch.children[0].annotations).toBeUndefined();
    expect(next.connections[0].targetNodeId).toBe('leaf');
  });
});

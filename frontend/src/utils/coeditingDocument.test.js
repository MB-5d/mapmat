import { applyOperationToDocument, normalizeLiveDocument } from './coeditingDocument';

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
          { id: 'target', title: 'Target', url: 'https://example.com/target', children: [] },
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
        markMovedPositionChanges: true,
        movedAt: 'now',
      },
    });

    const movedBranch = next.root.children[0].children[0];
    expect(next.root.children[0].id).toBe('target');
    expect(movedBranch.id).toBe('branch');
    expect(movedBranch.children[0].id).toBe('leaf');
    expect(next.root.children[0].annotations.status).toBe('moved');
    expect(next.root.children[0].annotations.meta.movedFromPosition).toBe('2');
    expect(movedBranch.annotations.status).toBe('moved');
    expect(movedBranch.annotations.meta.movedFromPosition).toBe('1');
    expect(movedBranch.children[0].annotations.status).toBe('moved');
    expect(movedBranch.children[0].annotations.meta.movedFromPosition).toBe('1.1');
    expect(next.connections[0].targetNodeId).toBe('leaf');
  });
});

describe('coediting document crosslinks', () => {
  const document = {
    mapId: 'map-1',
    version: 0,
    name: 'Live Map',
    root: {
      id: 'root',
      title: 'Home',
      children: [
        { id: 'target', title: 'Target', url: 'https://example.com/target', children: [] },
      ],
    },
    orphans: [],
    connections: [
      {
        id: 'link-1',
        sourceNodeId: 'root',
        sourceAnchor: 'right',
        targetNodeId: 'target',
        targetAnchor: 'left',
        type: 'crosslink',
      },
    ],
  };

  test('ignores duplicate crosslink add operations between the same nodes', () => {
    const next = applyOperationToDocument(document, {
      type: 'link.add',
      payload: {
        linkId: 'link-2',
        sourceId: 'target',
        targetId: 'root',
        link: {
          type: 'crosslink',
          sourceAnchor: 'left',
          targetAnchor: 'right',
        },
      },
    });

    expect(next.connections).toHaveLength(1);
    expect(next.connections[0].id).toBe('link-1');
  });

  test('normalizes persisted duplicate crosslinks down to one relationship', () => {
    const normalized = normalizeLiveDocument({
      ...document,
      connections: [
        ...document.connections,
        {
          id: 'link-2',
          sourceNodeId: 'target',
          targetNodeId: 'root',
          type: 'crosslink',
        },
      ],
    });

    expect(normalized.connections).toHaveLength(1);
    expect(normalized.connections[0].id).toBe('link-1');
  });
});

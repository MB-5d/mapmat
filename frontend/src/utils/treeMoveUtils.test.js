const {
  DEFAULT_ORPHAN_CONTAINER_ID,
  DEFAULT_SUBDOMAIN_CONTAINER_ID,
  applyBranchMoveToMap,
  getBranchMoveBlockReason,
} = require('./treeMoveUtils');

const buildMap = () => ({
  root: {
    id: 'root',
    title: 'Home',
    url: 'https://example.com',
    children: [
      {
        id: 'branch',
        title: 'Branch',
        url: 'https://example.com/branch',
        comments: [{ id: 'comment-1', text: 'keep' }],
        children: [
          {
            id: 'leaf',
            title: 'Leaf',
            url: 'https://example.com/branch/leaf',
            thumbnailUrl: '/thumbs/leaf.jpg',
            children: [],
          },
        ],
      },
      {
        id: 'target',
        title: 'Target',
        url: 'https://example.com/target',
        children: [],
      },
    ],
  },
  orphans: [],
});

describe('tree branch moves', () => {
  test('moves a branch with descendants and preserved node data', () => {
    const { root, orphans } = buildMap();
    const result = applyBranchMoveToMap({
      root,
      orphans,
      nodeId: 'branch',
      targetParentId: 'target',
      insertIndex: 0,
    });

    expect(result.ok).toBe(true);
    expect(result.root.children).toHaveLength(1);
    expect(result.root.children[0].id).toBe('target');
    expect(result.root.children[0].children[0].id).toBe('branch');
    expect(result.root.children[0].children[0].children[0].id).toBe('leaf');
    expect(result.root.children[0].children[0].comments[0].id).toBe('comment-1');
    expect(result.root.children[0].children[0].children[0].thumbnailUrl).toBe('/thumbs/leaf.jpg');
  });

  test('blocks moving root or dropping a branch into itself', () => {
    const { root, orphans } = buildMap();

    expect(getBranchMoveBlockReason({
      root,
      orphans,
      nodeId: 'root',
      targetParentId: 'target',
    })).toBe('Home cannot be moved.');

    expect(getBranchMoveBlockReason({
      root,
      orphans,
      nodeId: 'branch',
      targetParentId: 'leaf',
    })).toBe('Cannot drop a branch into itself.');
  });

  test('marks every URL node whose page position changed', () => {
    const { root, orphans } = buildMap();
    const result = applyBranchMoveToMap({
      root,
      orphans,
      nodeId: 'branch',
      targetParentId: 'target',
      insertIndex: 0,
      markMovedPositionChanges: true,
      movedAt: 'now',
    });

    const target = result.root.children[0];
    const movedBranch = result.root.children[0].children[0];
    const movedLeaf = movedBranch.children[0];
    expect(target.annotations.status).toBe('moved');
    expect(target.annotations.meta.movedFromPosition).toBe('2');
    expect(movedBranch.annotations.status).toBe('moved');
    expect(movedBranch.annotations.meta.movedFromPosition).toBe('1');
    expect(movedLeaf.annotations.status).toBe('moved');
    expect(movedLeaf.annotations.meta.movedFromPosition).toBe('1.1');
    expect(result.positionChanges.get('target')).toEqual({
      fromPosition: '2',
      toPosition: '1',
    });
  });

  test('moves a branch to orphan root without losing descendants', () => {
    const { root, orphans } = buildMap();
    const result = applyBranchMoveToMap({
      root,
      orphans,
      nodeId: 'branch',
      targetParentId: DEFAULT_ORPHAN_CONTAINER_ID,
      insertIndex: 0,
    });

    expect(result.ok).toBe(true);
    expect(result.root.children.map((child) => child.id)).toEqual(['target']);
    expect(result.orphans[0].id).toBe('branch');
    expect(result.orphans[0].orphanType).toBe('orphan');
    expect(result.orphans[0].children[0].id).toBe('leaf');
  });

  test('uses branch URL rules for subdomain moves', () => {
    const { root, orphans } = buildMap();

    expect(getBranchMoveBlockReason({
      root,
      orphans,
      nodeId: 'branch',
      targetParentId: DEFAULT_SUBDOMAIN_CONTAINER_ID,
    })).toBe('Subdomain root requires a branch with blank URLs.');

    const blankBranchRoot = {
      ...root,
      children: [
        {
          id: 'blank-branch',
          title: 'Blank Branch',
          url: '',
          children: [{ id: 'url-child', title: 'URL Child', url: 'https://example.com/child', children: [] }],
        },
      ],
    };

    expect(getBranchMoveBlockReason({
      root: blankBranchRoot,
      orphans,
      nodeId: 'blank-branch',
      targetParentId: DEFAULT_SUBDOMAIN_CONTAINER_ID,
    })).toBe('Subdomain root requires a branch with blank URLs.');
  });
});

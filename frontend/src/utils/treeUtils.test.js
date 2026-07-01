import { computeLayout } from '../layout/computeLayout';
import { shouldStackChildren } from './treeUtils';
import { STACK_THRESHOLD } from './constants';

const makeNode = (id, overrides = {}) => ({
  id,
  title: `Page ${id}`,
  url: `https://example.com/${id}`,
  children: [],
  ...overrides,
});

describe('stacking rules', () => {
  test('stacks 5 or more same-level children below level 1 without URL similarity checks', () => {
    const children = Array.from({ length: STACK_THRESHOLD }, (_, index) => makeNode(`child-${index}`, {
      title: `Unrelated ${index}`,
      url: `https://example.com/${index % 2 === 0 ? 'alpha' : 'beta'}/${index}`,
    }));

    expect(shouldStackChildren(children, 1)).toBe(true);
  });

  test('does not stack root-level children', () => {
    const children = Array.from({ length: STACK_THRESHOLD }, (_, index) => makeNode(`section-${index}`));

    expect(shouldStackChildren(children, 0)).toBe(false);
  });

  test('collapses crowded L2 groups even when those nodes have descendants', () => {
    const l2Children = Array.from({ length: STACK_THRESHOLD }, (_, index) => makeNode(`l2-${index}`, {
      children: [
        makeNode(`l3-${index}`, {
          children: [makeNode(`l4-${index}`)],
        }),
      ],
    }));
    const root = makeNode('root', {
      children: [
        makeNode('l1', {
          children: l2Children,
        }),
      ],
    });

    const layout = computeLayout(root, [], false, {});
    const firstStackNode = layout.nodes.get('l2-0');

    expect(firstStackNode?.stackInfo).toEqual({
      parentId: 'l1',
      totalCount: STACK_THRESHOLD,
      collapsed: true,
    });
    expect(layout.nodes.has('l2-1')).toBe(false);
  });
});

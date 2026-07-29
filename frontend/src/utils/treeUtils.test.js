import { computeLayout } from '../layout/computeLayout';
import {
  compareScanNumberStrings,
  countPageNodes,
  isImageCaptureEligibleNode,
  isPageNode,
  shouldStackChildren,
} from './treeUtils';
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

describe('page node contract', () => {
  test('counts only real HTTP pages in imported trees', () => {
    const root = {
      id: 'container',
      nodeKind: 'import-container',
      children: [{
        id: 'ghost',
        nodeKind: 'import-ghost',
        url: '',
        children: [makeNode('real', { nodeKind: 'page' })],
      }],
    };

    expect(isPageNode(root)).toBe(false);
    expect(isPageNode(root.children[0])).toBe(false);
    expect(isPageNode(root.children[0].children[0])).toBe(true);
    expect(countPageNodes(root)).toBe(1);
  });

  test('excludes focused context and deferred placeholders from captured page counts', () => {
    const root = makeNode('home', {
      nodeKind: 'focus-ghost',
      children: [
        makeNode('target'),
        makeNode('deferred', {
          nodeKind: 'deferred-group',
          url: '',
          remainingCount: 50,
        }),
      ],
    });

    expect(isPageNode(root)).toBe(false);
    expect(isPageNode(root.children[1])).toBe(false);
    expect(countPageNodes(root)).toBe(1);
  });

  test('excludes virtual Missing nodes from captured page counts', () => {
    const root = makeNode('home', {
      children: [
        makeNode('captured'),
        makeNode('virtual', {
          isMissing: true,
          isVirtualMissing: true,
          scanStatus: 'missing',
        }),
      ],
    });

    expect(isPageNode(root.children[1])).toBe(true);
    expect(countPageNodes(root)).toBe(2);
  });

  test('excludes structural, blocked, and HTTP error nodes from image capture', () => {
    expect(isImageCaptureEligibleNode(makeNode('ok', { httpStatus: 200 }))).toBe(true);
    expect(isImageCaptureEligibleNode(makeNode('virtual', { isVirtualMissing: true }))).toBe(false);
    expect(isImageCaptureEligibleNode(makeNode('ghost', { nodeKind: 'focus-ghost' }))).toBe(false);
    expect(isImageCaptureEligibleNode(makeNode('blocked', { isBlocked: true }))).toBe(false);
    expect(isImageCaptureEligibleNode(makeNode('error', { httpStatus: 404 }))).toBe(false);
    expect(isImageCaptureEligibleNode(makeNode('untyped-error', { isError: true }))).toBe(false);
    expect(isImageCaptureEligibleNode(makeNode('server-coded', {
      captureEligible: false,
      captureReasonCode: 'authentication',
    }))).toBe(false);
  });

  test('compares numeric suffixes after unknown focused prefixes', () => {
    expect(compareScanNumberStrings('XX.4.3.5', 'XX.4.3.10')).toBeLessThan(0);
    expect(compareScanNumberStrings('X.1.2', 'XX.1.10')).toBeLessThan(0);
  });
});

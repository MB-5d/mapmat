import { computeLayout } from './computeLayout';

const buildTree = () => ({
  id: 'root',
  title: 'Home',
  children: [
    {
      id: 'blog',
      title: 'Blog',
      children: [
        { id: 'post-1', title: 'Post 1', children: [] },
        { id: 'post-2', title: 'Post 2', children: [] },
      ],
    },
    { id: 'about', title: 'About', children: [] },
  ],
});

describe('computeLayout orientation', () => {
  test('keeps the existing vertical layout as the default', () => {
    const layout = computeLayout(buildTree(), [], false);
    const root = layout.nodes.get('root');
    const blog = layout.nodes.get('blog');
    const about = layout.nodes.get('about');
    const post = layout.nodes.get('post-1');

    expect(layout.orientation).toBe('vertical');
    expect(blog.y).toBeGreaterThan(root.y);
    expect(about.x).toBeGreaterThan(blog.x);
    expect(post.y).toBeGreaterThan(blog.y);
  });

  test('lays deep sitemap branches left to right in horizontal mode', () => {
    const layout = computeLayout(buildTree(), [], false, {}, { orientation: 'horizontal' });
    const root = layout.nodes.get('root');
    const blog = layout.nodes.get('blog');
    const about = layout.nodes.get('about');
    const post = layout.nodes.get('post-1');

    expect(layout.orientation).toBe('horizontal');
    expect(blog.x).toBeGreaterThan(root.x);
    expect(post.x).toBeGreaterThan(blog.x);
    expect(about.y).toBeGreaterThan(blog.y);
    expect(layout.connectors.length).toBeGreaterThan(0);
  });

  test('hides the internal import container and keeps flat pages unconnected', () => {
    const imported = {
      id: 'import-container',
      nodeKind: 'import-container',
      children: [
        { id: 'page-a', title: 'A', url: 'https://a.test', nodeKind: 'page', children: [] },
        { id: 'page-b', title: 'B', url: 'https://b.test', nodeKind: 'page', children: [] },
      ],
    };

    const layout = computeLayout(imported, [], false);

    expect(layout.nodes.has('import-container')).toBe(false);
    expect(layout.nodes.has('page-a')).toBe(true);
    expect(layout.nodes.has('page-b')).toBe(true);
    expect(layout.nodes.get('page-a').y).toBe(layout.nodes.get('page-b').y);
    expect(layout.connectors).toHaveLength(0);
  });

  test('keeps inferred hierarchy connectors without rendering the container', () => {
    const imported = {
      id: 'import-container',
      nodeKind: 'import-container',
      children: [{
        id: 'host',
        title: 'site.test',
        nodeKind: 'import-ghost',
        children: [{ id: 'page', title: 'Page', url: 'https://site.test/page', nodeKind: 'page', children: [] }],
      }],
    };

    const layout = computeLayout(imported, [], false);

    expect(layout.nodes.has('import-container')).toBe(false);
    expect(layout.nodes.has('host')).toBe(true);
    expect(layout.nodes.has('page')).toBe(true);
    expect(layout.connectors.length).toBeGreaterThan(0);
  });

  test('uses preserved full-map numbers for focused scans', () => {
    const focused = {
      id: 'home-context',
      title: 'example.com',
      url: 'https://example.com/',
      nodeKind: 'focus-ghost',
      scanNumber: '0',
      children: [{
        id: 'blog-context',
        title: 'Blog',
        url: 'https://example.com/blog',
        nodeKind: 'focus-ghost',
        scanNumber: '3',
        children: [{
          id: 'target',
          title: 'Post',
          url: 'https://example.com/blog/post',
          scanNumber: '3.2',
          children: [],
        }],
      }],
    };

    const layout = computeLayout(focused, [], false);
    expect(layout.nodes.get('home-context').number).toBe('0');
    expect(layout.nodes.get('blog-context').number).toBe('3');
    expect(layout.nodes.get('target').number).toBe('3.2');
    expect(layout.nodes.get('target').number).not.toBe('0');
  });

  test('keeps deferred pages inside the existing stack count', () => {
    const posts = Array.from({ length: 10 }, (_, index) => ({
      id: `post-${index + 1}`,
      title: `Post ${index + 1}`,
      children: [],
    }));
    const placeholder = {
      id: 'more-posts',
      nodeKind: 'deferred-group',
      remainingCount: 358,
      children: [],
    };
    const tree = {
      id: 'root',
      children: [{ id: 'blog', children: [...posts, placeholder] }],
    };

    const collapsed = computeLayout(tree, [], false, {});
    expect(collapsed.nodes.get('post-1').stackInfo.totalCount).toBe(368);

    const expanded = computeLayout(tree, [], false, { blog: true });
    expect(expanded.nodes.get('more-posts').number).toBe('');
    expect(expanded.nodes.get('more-posts').stackInfo.showCollapse).toBe(false);
    expect(expanded.nodes.get('post-10').stackInfo.showCollapse).toBe(true);
  });
});

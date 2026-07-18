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
});

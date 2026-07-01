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
});

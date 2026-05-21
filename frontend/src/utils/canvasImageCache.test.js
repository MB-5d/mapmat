import { CanvasImageCache, getThumbnailLodForScale } from './canvasImageCache';

describe('CanvasImageCache', () => {
  test('evicts least recently used images over the byte cap', () => {
    const cache = new CanvasImageCache({ maxBytes: 100, maxConcurrent: 1 });
    const first = { width: 5, height: 5, close: jest.fn() };
    const second = { width: 5, height: 5, close: jest.fn() };
    cache.entries.set('first', { image: first, bytes: 100, lastUsed: 1 });
    cache.entries.set('second', { image: second, bytes: 100, lastUsed: 2 });
    cache.bytes = 200;
    cache.evict();
    expect(cache.has('first')).toBe(false);
    expect(cache.has('second')).toBe(true);
    expect(first.close).toHaveBeenCalled();
  });

  test('thumbnail LOD avoids thumbnails when zoomed far out', () => {
    expect(getThumbnailLodForScale(0.1)).toBe('none');
    expect(getThumbnailLodForScale(0.4)).toBe('preview');
    expect(getThumbnailLodForScale(1)).toBe('thumbnail');
  });

  test('retain disposes images outside the visible set', () => {
    const cache = new CanvasImageCache({ maxBytes: 1000 });
    const kept = { width: 5, height: 5, close: jest.fn() };
    const removed = { width: 5, height: 5, close: jest.fn() };
    cache.entries.set('kept', { image: kept, bytes: 100, lastUsed: 1 });
    cache.entries.set('removed', { image: removed, bytes: 100, lastUsed: 2 });
    cache.bytes = 200;
    cache.retain(['kept']);
    expect(cache.has('kept')).toBe(true);
    expect(cache.has('removed')).toBe(false);
    expect(removed.close).toHaveBeenCalled();
    expect(cache.bytes).toBe(100);
  });
});

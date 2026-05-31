const DEFAULT_MAX_BYTES = 48 * 1024 * 1024;
const DEFAULT_MAX_CONCURRENT = 4;
const DEFAULT_TARGET_WIDTH = 256;
const DEFAULT_TARGET_HEIGHT = 160;

const estimateBytes = (image) => {
  const width = Number(image?.width || image?.naturalWidth || 0);
  const height = Number(image?.height || image?.naturalHeight || 0);
  return Math.max(1, width * height * 4);
};

const disposeImage = (image) => {
  if (image && typeof image.close === 'function') {
    image.close();
  }
};

export class CanvasImageCache {
  constructor({
    maxBytes = DEFAULT_MAX_BYTES,
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
    targetWidth = DEFAULT_TARGET_WIDTH,
    targetHeight = DEFAULT_TARGET_HEIGHT,
  } = {}) {
    this.maxBytes = maxBytes;
    this.maxConcurrent = maxConcurrent;
    this.targetWidth = targetWidth;
    this.targetHeight = targetHeight;
    this.bytes = 0;
    this.entries = new Map();
    this.pending = new Map();
    this.queue = [];
    this.activeCount = 0;
  }

  get(url) {
    const entry = this.entries.get(url);
    if (!entry) return null;
    entry.lastUsed = Date.now();
    return entry.image;
  }

  has(url) {
    return this.entries.has(url);
  }

  request(url) {
    const safeUrl = String(url || '').trim();
    if (!safeUrl || this.entries.has(safeUrl) || this.pending.has(safeUrl)) return;
    const controller = new AbortController();
    this.pending.set(safeUrl, controller);
    this.queue.push({ url: safeUrl, controller });
    this.flush();
  }

  retain(urls = []) {
    const keep = new Set((urls || []).map((url) => String(url || '').trim()).filter(Boolean));
    Array.from(this.pending.entries()).forEach(([url, controller]) => {
      if (keep.has(url)) return;
      controller.abort();
      this.pending.delete(url);
    });
    this.queue = this.queue.filter((item) => keep.has(item.url));
    Array.from(this.entries.entries()).forEach(([url, entry]) => {
      if (keep.has(url)) return;
      this.entries.delete(url);
      this.bytes = Math.max(0, this.bytes - entry.bytes);
      disposeImage(entry.image);
    });
  }

  clear() {
    this.queue = [];
    this.pending.forEach((controller) => controller.abort());
    this.pending.clear();
    this.entries.forEach((entry) => disposeImage(entry.image));
    this.entries.clear();
    this.bytes = 0;
    this.activeCount = 0;
  }

  flush() {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item || !this.pending.has(item.url)) continue;
      this.activeCount += 1;
      this.load(item.url, item.controller)
        .catch(() => {})
        .finally(() => {
          this.activeCount = Math.max(0, this.activeCount - 1);
          this.pending.delete(item.url);
          this.flush();
        });
    }
  }

  async load(url, controller) {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: 'include',
      priority: 'low',
    });
    if (!response.ok) throw new Error('Image request failed');
    const blob = await response.blob();
    if (controller.signal.aborted) return;

    let image;
    if (typeof createImageBitmap === 'function') {
      try {
        image = await createImageBitmap(blob, {
          resizeWidth: this.targetWidth,
          resizeHeight: this.targetHeight,
          resizeQuality: 'low',
        });
      } catch {
        image = await this.loadHtmlImage(blob, controller);
      }
    } else {
      image = await this.loadHtmlImage(blob, controller);
    }
    if (controller.signal.aborted || !image) {
      disposeImage(image);
      return;
    }
    const bytes = estimateBytes(image);
    this.entries.set(url, {
      image,
      bytes,
      lastUsed: Date.now(),
    });
    this.bytes += bytes;
    this.evict();
  }

  loadHtmlImage(blob, controller) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Image decode failed'));
      };
      controller.signal.addEventListener('abort', () => {
        URL.revokeObjectURL(objectUrl);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
      image.src = objectUrl;
    });
  }

  evict() {
    if (this.bytes <= this.maxBytes) return;
    const entries = Array.from(this.entries.entries())
      .sort((left, right) => left[1].lastUsed - right[1].lastUsed);
    for (const [url, entry] of entries) {
      if (this.bytes <= this.maxBytes) break;
      this.entries.delete(url);
      this.bytes = Math.max(0, this.bytes - entry.bytes);
      disposeImage(entry.image);
    }
  }
}

export const getThumbnailLodForScale = (scale) => {
  const safeScale = Number(scale) || 1;
  if (safeScale < 0.25) return 'none';
  if (safeScale < 0.65) return 'preview';
  return 'thumbnail';
};

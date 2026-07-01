export const getHostname = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export const RENDERABLE_TEXT_EXTENSIONS = new Set([
  'txt',
  'csv',
  'tsv',
  'rtf',
  'md',
  'markdown',
  'log',
]);

export const getUrlExtension = (value) => {
  try {
    const pathname = new URL(value).pathname || '';
    const match = pathname.match(/\.([a-z0-9]{2,8})$/i);
    return match?.[1]?.toLowerCase() || '';
  } catch {
    return '';
  }
};

export const isRenderableTextUrl = (value) => RENDERABLE_TEXT_EXTENSIONS.has(getUrlExtension(value));

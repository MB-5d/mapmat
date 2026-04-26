export const normalizeText = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
};

export const normalizeMetaTagsForInput = (value, seoMetadata = {}) => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(', ');

  if (value && typeof value === 'object') {
    const candidates = [
      value.keywords,
      value.keyword,
      value.tags,
      value.metaKeywords,
      seoMetadata.keywords,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string') return candidate;
      if (Array.isArray(candidate)) return candidate.map(normalizeText).filter(Boolean).join(', ');
    }

    return Object.entries(value)
      .map(([key, entryValue]) => {
        if (typeof entryValue === 'string') return `${key}: ${entryValue}`;
        if (Array.isArray(entryValue)) return `${key}: ${entryValue.map(normalizeText).filter(Boolean).join(', ')}`;
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }

  return normalizeText(seoMetadata.keywords);
};

export const getSeoMetadata = (node = {}) => (
  node?.seoMetadata && typeof node.seoMetadata === 'object' && !Array.isArray(node.seoMetadata)
    ? node.seoMetadata
    : {}
);

export const getSeoValue = (node = {}, key) => {
  const seoMetadata = getSeoMetadata(node);
  if (key === 'description') {
    return normalizeText(node.description || seoMetadata.description || seoMetadata.openGraph?.description || seoMetadata.twitter?.description);
  }
  if (key === 'keywords') {
    return normalizeMetaTagsForInput(node.metaTags, seoMetadata);
  }
  if (key === 'canonicalUrl') {
    return normalizeText(node.canonicalUrl || seoMetadata.canonicalUrl);
  }
  return normalizeText(seoMetadata[key]);
};

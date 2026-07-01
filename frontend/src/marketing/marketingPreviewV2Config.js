import { MARKETING_ORIGIN } from '../utils/constants';

export const MARKETING_PREVIEW_V2_VERSION = 'v2';
export const MARKETING_PREVIEW_V2_BASE_PATH = '/';
export const MARKETING_PREVIEW_V2_LEGACY_BASE_PATH = '/marketing-preview-v2';
export const MARKETING_PREVIEW_V2_META_TITLE = 'Vellic | Visual Sitemap Generator for Website Audits & Redesigns';
export const MARKETING_PREVIEW_V2_META_DESCRIPTION = 'Create a visual sitemap from any URL. Vellic helps teams crawl websites, capture screenshots, audit structure, and export clean briefs for UX, SEO, content, and redesign planning.';
export const MARKETING_PREVIEW_V2_SOCIAL_IMAGE_URL = `${MARKETING_ORIGIN}/logo512.png`;
export const MARKETING_PREVIEW_V2_SOCIAL_IMAGE_ALT = 'Vellic visual sitemap generator logo';

const section = ({
  id,
  slug,
  navLabel,
  metaTitle,
  metaDescription,
}) => ({
  id,
  slug,
  navLabel,
  metaTitle,
  metaDescription,
});

export const MARKETING_PREVIEW_V2_SECTIONS = [
  section({
    id: 'home',
    slug: '',
    navLabel: 'Home',
    metaTitle: MARKETING_PREVIEW_V2_META_TITLE,
    metaDescription: MARKETING_PREVIEW_V2_META_DESCRIPTION,
  }),
  section({
    id: 'use-cases',
    slug: 'use-cases',
    navLabel: 'Use cases',
    metaTitle: 'Use Cases | Vellic Visual Sitemap Generator',
    metaDescription: 'Use Vellic as a website redesign planning tool for content strategy, UX, SEO, information architecture audit work, and engineering cleanup.',
  }),
  section({
    id: 'features',
    slug: 'features',
    navLabel: 'Features',
    metaTitle: 'Features | Vellic Website Audit Tool',
    metaDescription: 'Explore Vellic features for visual sitemap generation, website screenshot crawling, content inventory, collaboration, exports, and AI website brief generation.',
  }),
  section({
    id: 'examples',
    slug: 'examples',
    navLabel: 'Examples',
    metaTitle: 'Examples | Vellic Website Screenshot Crawler',
    metaDescription: 'See example Vellic audits with visual website maps, screenshot inventories, subdomains, orphan pages, and website structure visualizer workflows.',
  }),
  section({
    id: 'pricing',
    slug: 'pricing',
    navLabel: 'Pricing',
    metaTitle: 'Pricing | Vellic Visual Sitemap Generator',
    metaDescription: 'Compare Vellic plans for saved maps, screenshot credits, exports, reports, team review, and website planning workflows.',
  }),
  section({
    id: 'faq',
    slug: 'faq',
    navLabel: 'FAQ',
    metaTitle: 'FAQ | Vellic Visual Sitemap Generator',
    metaDescription: 'Answers about Vellic visual sitemaps, website audits, bulk screenshots, collaboration, exports, AI website briefs, and device support.',
  }),
  section({
    id: 'mission',
    slug: 'mission',
    navLabel: 'Mission',
    metaTitle: 'Mission | Vellic',
    metaDescription: 'Vellic helps teams see, question, improve, and share website structure from one visual workspace for better information architecture.',
  }),
  section({
    id: 'contact',
    slug: 'contact',
    navLabel: 'Contact',
    metaTitle: 'Contact | Vellic',
    metaDescription: 'Contact Vellic for product questions, website audit workflows, walkthroughs, agency planning, and early feedback.',
  }),
];

export const MARKETING_PREVIEW_V2_NAV_SECTION_IDS = [
  'use-cases',
  'features',
  'examples',
  'pricing',
  'faq',
  'mission',
  'contact',
];

const trimPath = (value) => String(value || '').replace(/^\/+|\/+$/g, '');
const normalizePathname = (value) => {
  const normalized = `/${trimPath(value)}`;
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '');
};

export function getMarketingPreviewV2SectionById(sectionId = 'home') {
  return MARKETING_PREVIEW_V2_SECTIONS.find((entry) => entry.id === sectionId)
    || MARKETING_PREVIEW_V2_SECTIONS[0];
}

export function buildMarketingPreviewV2Path(sectionId = 'home', search = '') {
  const resolvedSection = getMarketingPreviewV2SectionById(sectionId);
  const path = resolvedSection.slug ? `/${resolvedSection.slug}` : MARKETING_PREVIEW_V2_BASE_PATH;
  const query = search ? (String(search).startsWith('?') ? search : `?${search}`) : '';
  return `${path}${query}`;
}

export function buildMarketingPreviewV2CanonicalUrl(sectionId = 'home') {
  return `${MARKETING_ORIGIN}${buildMarketingPreviewV2Path(sectionId)}`;
}

export function getMarketingPreviewV2RouteMatchByPathname(pathname) {
  const normalized = normalizePathname(pathname);
  if (normalized === '/') {
    return { section: getMarketingPreviewV2SectionById('home'), legacyAlias: false };
  }

  if (normalized === MARKETING_PREVIEW_V2_LEGACY_BASE_PATH) {
    return { section: getMarketingPreviewV2SectionById('home'), legacyAlias: true };
  }

  if (normalized.startsWith(`${MARKETING_PREVIEW_V2_LEGACY_BASE_PATH}/`)) {
    const legacySlug = normalized.slice(MARKETING_PREVIEW_V2_LEGACY_BASE_PATH.length + 1);
    const sectionId = legacySlug === 'start' ? 'home' : null;
    const section = sectionId
      ? getMarketingPreviewV2SectionById(sectionId)
      : MARKETING_PREVIEW_V2_SECTIONS.find((entry) => entry.slug === legacySlug);
    return section ? { section, legacyAlias: true } : null;
  }

  const slug = trimPath(normalized);
  const section = MARKETING_PREVIEW_V2_SECTIONS.find((entry) => entry.slug === slug);
  return section ? { section, legacyAlias: false } : null;
}

export function getMarketingPreviewV2SectionByPathname(pathname) {
  return getMarketingPreviewV2RouteMatchByPathname(pathname)?.section || null;
}

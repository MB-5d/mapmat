import { MARKETING_ORIGIN } from '../utils/constants';

export const MARKETING_PREVIEW_V2_VERSION = 'v2';
export const MARKETING_PREVIEW_V2_BASE_PATH = '/marketing-preview-v2';

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
    metaTitle: 'Vellic Marketing Preview V2 | Vellic',
    metaDescription: 'A product-led Vellic marketing preview for visual sitemap audits, screenshots, collaboration, exports, and IA planning.',
  }),
  section({
    id: 'use-cases',
    slug: 'use-cases',
    navLabel: 'Use Cases',
    metaTitle: 'Use Cases | Vellic Marketing Preview V2',
    metaDescription: 'Use Vellic for content strategy, UX and IA, engineering cleanup, SEO review, and website planning.',
  }),
  section({
    id: 'features',
    slug: 'features',
    navLabel: 'Features',
    metaTitle: 'Features | Vellic Marketing Preview V2',
    metaDescription: 'Explore Vellic features for IA audits, editable maps, bulk screenshots, collaboration, export packages, and planning handoff.',
  }),
  section({
    id: 'examples',
    slug: 'examples',
    navLabel: 'Examples',
    metaTitle: 'Examples | Vellic Marketing Preview V2',
    metaDescription: 'Preview placeholder Vellic examples for visual website maps and planning workflows.',
  }),
  section({
    id: 'pricing',
    slug: 'pricing',
    navLabel: 'Pricing',
    metaTitle: 'Pricing | Vellic Marketing Preview V2',
    metaDescription: 'Preview Vellic Free, Pro, Studio, and Agency plans for saved maps, screenshots, exports, and team review.',
  }),
  section({
    id: 'faq',
    slug: 'faq',
    navLabel: 'FAQ',
    metaTitle: 'FAQ | Vellic Marketing Preview V2',
    metaDescription: 'Answers about Vellic visual sitemaps, IA audits, bulk screenshots, collaboration, exports, AI handoff, and device support.',
  }),
  section({
    id: 'mission',
    slug: 'mission',
    navLabel: 'Mission',
    metaTitle: 'Mission | Vellic Marketing Preview V2',
    metaDescription: 'Vellic helps teams see, question, improve, and share website structure from one visual workspace.',
  }),
  section({
    id: 'contact',
    slug: 'contact',
    navLabel: 'Contact',
    metaTitle: 'Contact | Vellic Marketing Preview V2',
    metaDescription: 'Contact Vellic for product questions, walkthroughs, agency workflows, and early feedback.',
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

export function getMarketingPreviewV2SectionById(sectionId = 'home') {
  return MARKETING_PREVIEW_V2_SECTIONS.find((entry) => entry.id === sectionId)
    || MARKETING_PREVIEW_V2_SECTIONS[0];
}

export function buildMarketingPreviewV2Path(sectionId = 'home', search = '') {
  const resolvedSection = getMarketingPreviewV2SectionById(sectionId);
  const suffix = resolvedSection.slug ? `/${resolvedSection.slug}` : '';
  const query = search ? (String(search).startsWith('?') ? search : `?${search}`) : '';
  return `${MARKETING_PREVIEW_V2_BASE_PATH}${suffix}${query}`;
}

export function buildMarketingPreviewV2CanonicalUrl(sectionId = 'home') {
  return `${MARKETING_ORIGIN}${buildMarketingPreviewV2Path(sectionId)}`;
}

export function getMarketingPreviewV2SectionByPathname(pathname) {
  const normalized = `/${trimPath(pathname)}`;
  if (normalized === MARKETING_PREVIEW_V2_BASE_PATH) {
    return getMarketingPreviewV2SectionById('home');
  }
  if (!normalized.startsWith(`${MARKETING_PREVIEW_V2_BASE_PATH}/`)) return null;
  const slug = normalized.slice(MARKETING_PREVIEW_V2_BASE_PATH.length + 1);
  if (slug === 'start') return getMarketingPreviewV2SectionById('home');
  return MARKETING_PREVIEW_V2_SECTIONS.find((entry) => entry.slug === slug) || null;
}

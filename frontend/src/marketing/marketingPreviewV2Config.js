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
    metaDescription: 'A light, product-led Vellic marketing preview for scanning, editing, reviewing, and sharing visual website maps.',
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
    metaDescription: 'Scan, create, import, edit, review, capture screenshots, export, and share website structure in Vellic.',
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
    metaDescription: 'Preview compact Vellic plan direction for scans, saved maps, exports, screenshots, and team review.',
  }),
  section({
    id: 'faq',
    slug: 'faq',
    navLabel: 'FAQ',
    metaTitle: 'FAQ | Vellic Marketing Preview V2',
    metaDescription: 'Answers about Vellic website scans, visual maps, screenshots, sharing, exports, and device support.',
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
  section({
    id: 'start',
    slug: 'start',
    navLabel: 'Start',
    metaTitle: 'Start | Vellic Marketing Preview V2',
    metaDescription: 'Start a Vellic site scan from desktop or tablet, or copy the app scan link from mobile.',
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
  return MARKETING_PREVIEW_V2_SECTIONS.find((entry) => entry.slug === slug) || null;
}

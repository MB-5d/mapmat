import { APP_ORIGIN, MARKETING_ORIGIN } from '../utils/constants';

export const MARKETING_BASE_PATH = '/marketing-preview';

export const MARKETING_NODE_SIZE = Object.freeze({
  width: 1280,
  height: 680,
});

export const MARKETING_CANVAS_SIZE = Object.freeze({
  width: 10720,
  height: 4560,
});

export const MARKETING_OVERVIEW_SCALE = 0.1;

export const MARKETING_COLUMN_GAP = 1536;
export const MARKETING_ROW_GAP = 1120;

export const DEFAULT_MARKETING_SCAN_OPTIONS = Object.freeze({
  inactivePages: true,
  subdomains: false,
  authenticatedPages: false,
  orphanPages: false,
  errorPages: true,
  brokenLinks: false,
  duplicates: true,
  files: false,
  crosslinks: false,
});

const trimPath = (value) => String(value || '').replace(/^\/+|\/+$/g, '');

export const buildMarketingPath = (pageId = 'overview', search = '') => {
  const page = MARKETING_PAGES.find((entry) => entry.id === pageId) || MARKETING_PAGES[0];
  const suffix = page.slug ? `/${page.slug}` : '';
  const query = search ? (String(search).startsWith('?') ? search : `?${search}`) : '';
  return `${MARKETING_BASE_PATH}${suffix}${query}`;
};

export const buildMarketingCanonicalUrl = (pageId = 'overview') => `${MARKETING_ORIGIN}${buildMarketingPath(pageId)}`;

export const buildAppScanUrl = (scanUrl = '', options = null) => {
  const params = new URLSearchParams();
  params.set('intent', 'scan');
  if (scanUrl) params.set('url', scanUrl);
  if (options) {
    Object.keys(DEFAULT_MARKETING_SCAN_OPTIONS).forEach((key) => {
      params.set(key, options[key] ? 'true' : 'false');
    });
  }
  return `${APP_ORIGIN}/app?${params.toString()}`;
};

export const buildAppBillingUrl = (planKey = '', billingCycle = 'monthly') => {
  const params = new URLSearchParams();
  params.set('intent', 'checkout');
  params.set('billingPlan', String(planKey || '').trim().toLowerCase());
  params.set(
    'billingCycle',
    String(billingCycle || '').trim().toLowerCase() === 'yearly' ? 'yearly' : 'monthly'
  );
  return `${APP_ORIGIN}/app?${params.toString()}`;
};

export const buildAppSignupUrl = () => {
  return `${APP_ORIGIN}/app`;
};

export const buildAppTrialUrl = (planKey = 'pro') => {
  const params = new URLSearchParams();
  params.set('intent', 'trial');
  params.set('trialPlan', String(planKey || 'pro').trim().toLowerCase());
  return `${APP_ORIGIN}/app?${params.toString()}`;
};

const page = ({
  id,
  slug,
  parentId = null,
  navLabel,
  nodeLabel,
  eyebrow,
  title,
  titleLines,
  summary,
  body = [],
  proofPoints = [],
  cards = [],
  upcoming = [],
  comparisonMatrix = null,
  secondaryLink = null,
  metaTitle,
  metaDescription,
  x,
  y,
  depth = 1,
  visual = false,
}) => ({
  id,
  slug,
  parentId,
  navLabel,
  nodeLabel: nodeLabel || navLabel,
  eyebrow,
  title,
  titleLines,
  summary,
  body,
  proofPoints,
  cards,
  upcoming,
  comparisonMatrix,
  secondaryLink,
  metaTitle,
  metaDescription,
  x,
  y,
  depth,
  accent: `depth-${Math.min(Math.max(depth, 1), 6)}`,
  visual,
});

export const MARKETING_PAGES = [
  page({
    id: 'overview',
    slug: '',
    navLabel: 'Overview',
    eyebrow: 'Visual sitemap workspace',
    title: 'Start with a URL. Leave with a map.',
    titleLines: ['Start with a URL.', 'Leave with a map.'],
    summary: 'Vellic turns a live website into a visual map teams can scan, shape, edit, review, and export.',
    body: [
      'Most website work starts with scattered context: crawl data in one place, page lists in another, screenshots in another, and decisions spread across meetings.',
      'Vellic gives teams one visual structure to work from, so audits, redesigns, migrations, and stakeholder reviews can start from the actual site instead of a spreadsheet reconstruction.',
    ],
    proofPoints: ['Scan live sites', 'Create and import maps', 'Edit structure', 'Export the outcome'],
    cards: [
      { title: 'Review current structure', text: 'Move from raw URLs to a connected map that shows hierarchy, depth, and page relationships.', pageId: 'features-scanning' },
      { title: 'Shape the future state', text: 'Edit branches and page details so discovery can become a practical redesign or migration plan.', pageId: 'features-editing' },
      { title: 'Share the decision trail', text: 'Attach screenshots, comments, findings, and exports to the structure teams are discussing.', pageId: 'features-exports' },
    ],
    secondaryLink: { label: 'View example map', pageId: 'examples' },
    metaTitle: 'Vellic | Visual sitemap and website structure platform',
    metaDescription: 'Vellic scans live websites into visual maps that teams can edit, review, capture, export, and use to plan clearer site structure.',
    x: 0,
    y: 0,
    depth: 1,
    visual: true,
  }),
  page({
    id: 'use-cases',
    slug: 'use-cases',
    navLabel: 'Use cases',
    eyebrow: 'Who it helps',
    title: 'For the parts of website work that need shared context.',
    summary: 'Vellic helps teams see what exists, what is unclear, and what needs to change before decisions harden into a redesign, migration, audit, or launch plan.',
    body: [
      'Visual planning tools often focus on creating a proposed sitemap. SEO crawlers focus on diagnostics. Vellic connects both sides: the real site, the working structure, and the review context teams need to make decisions.',
    ],
    proofPoints: ['Content strategy', 'UX and IA', 'Engineering cleanup', 'SEO review'],
    cards: [
      { title: 'Content strategy', text: 'Find buried, duplicated, thin, or disconnected content before planning what to keep, merge, rewrite, or remove.', pageId: 'use-cases-content-strategy' },
      { title: 'UX', text: 'Review whether the hierarchy and navigation paths support the journeys people actually need to take.', pageId: 'use-cases-ux' },
      { title: 'Dev and engineering', text: 'Turn messy crawls, redirects, stale pages, and migration questions into a shared technical map.', pageId: 'use-cases-dev-engineering' },
      { title: 'SEO', text: 'Use crawl-based context to spot structural issues and prioritize what deserves deeper audit work.', pageId: 'use-cases-seo' },
    ],
    secondaryLink: { label: 'See examples', pageId: 'examples' },
    metaTitle: 'Use Cases | Vellic',
    metaDescription: 'Use Vellic for content strategy, UX audits, redesign planning, technical cleanup, SEO review, migrations, and stakeholder website decisions.',
    x: 0,
    y: MARKETING_ROW_GAP,
    depth: 2,
  }),
  page({
    id: 'features',
    slug: 'features',
    navLabel: 'Features',
    eyebrow: 'Core capabilities',
    title: 'Scan, create, edit, review, capture, and export.',
    summary: 'Vellic keeps the visual map at the center while adding the tools teams need to turn structure into useful review and planning work.',
    body: [
      'Competitors tend to split website work between crawlers, sitemap planners, diagramming tools, and spreadsheets. Vellic is designed around one connected workflow: scan the current site, shape the structure, add context, and deliver an artifact people can use.',
    ],
    proofPoints: ['Scanning', 'Creation and import', 'Editing', 'Screenshots', 'Exports'],
    cards: [
      { title: 'Live site scanning', text: 'Crawl a public site from a URL and generate a visual map from the pages found.', pageId: 'features-scanning' },
      { title: 'Structure editing', text: 'Move, rename, organize, tag, and annotate pages as the map becomes a working plan.', pageId: 'features-editing' },
      { title: 'Screenshots and capture', text: 'Capture supporting visuals for pages when review needs more than titles and URLs.', pageId: 'features-screenshots' },
      { title: 'Exports and handoff', text: 'Package maps, page lists, reports, and structured files for clients, teams, and stakeholders.', pageId: 'features-exports' },
    ],
    comparisonMatrix: {
      title: 'Comparison matrix',
      rows: [
        { need: 'Start from a live site', vellic: 'URL scan creates the first working map', crawler: 'Strong crawl data, usually table-first', planner: 'Often starts from manual planning or import' },
        { need: 'Create or import maps', vellic: 'Supports scanned, imported, and manual structures', crawler: 'Focused on discovered URLs', planner: 'Good for manual IA planning' },
        { need: 'Edit structure after discovery', vellic: 'Move, rename, group, and annotate nodes', crawler: 'Usually analysis-first, not editing-first', planner: 'Strong manual editing, less crawl context' },
        { need: 'Review with page context', vellic: 'Comments, screenshots, findings, and details stay tied to nodes', crawler: 'Deep diagnostics, often report-heavy', planner: 'Visual, but lighter on current-state evidence' },
        { need: 'Export and hand off', vellic: 'Visual map plus structured outputs for review and delivery', crawler: 'Powerful exports for specialists', planner: 'Good visuals, fewer audit signals' },
      ],
    },
    upcoming: [
      'Templates and assistant',
      'Navigation prototyping and tree testing',
      'Diagramming tools',
      'Integrations with Atlassian, Slack, Airtable, Figma, and more',
    ],
    secondaryLink: { label: 'Compare use cases', pageId: 'use-cases' },
    metaTitle: 'Features | Vellic',
    metaDescription: 'Explore Vellic features for live site scanning, visual sitemap creation, structure editing, screenshots, review, exports, and team handoff.',
    x: MARKETING_COLUMN_GAP,
    y: MARKETING_ROW_GAP,
    depth: 2,
  }),
  page({
    id: 'examples',
    slug: 'examples',
    navLabel: 'Examples',
    eyebrow: 'Example maps',
    title: 'See what a site structure can reveal.',
    summary: 'Example maps show how hierarchy, gaps, buried pages, and review questions become easier to discuss when the website is visible.',
    body: [
      'Examples should make the workflow concrete: a live site becomes a map, the map becomes a review surface, and the review becomes something teams can hand off.',
    ],
    proofPoints: ['Marketing sites', 'SaaS sites', 'Before and after', 'Stakeholder exports'],
    cards: [
      { title: 'Example map', text: 'A simple marketing-site scan that shows hierarchy, page depth, and the first review questions.', pageId: 'examples-map' },
      { title: 'Example workflow', text: 'A before-and-after planning flow for turning a current site into a cleaner proposed structure.', pageId: 'examples-workflow' },
    ],
    secondaryLink: { label: 'Start with your URL', pageId: 'overview' },
    metaTitle: 'Examples | Vellic',
    metaDescription: 'Explore example visual sitemap scenarios for marketing sites, SaaS sites, content hubs, redesigns, and stakeholder review.',
    x: MARKETING_COLUMN_GAP * 2,
    y: MARKETING_ROW_GAP,
    depth: 2,
  }),
  page({
    id: 'pricing',
    slug: 'pricing',
    navLabel: 'Pricing',
    eyebrow: 'Plans',
    title: 'Start with a scan. Upgrade when the map becomes part of the workflow.',
    summary: 'Vellic is built for quick checks, deeper audits, redesign planning, and team review. Plan details can stay flexible while the product is still evolving.',
    body: ['This preview frames the likely plan shape without inventing final pricing that has not been committed.'],
    proofPoints: ['Starter', 'Pro', 'Team'],
    cards: [
      { title: 'Starter', text: 'For quick scans, simple maps, and one-off website reviews.' },
      { title: 'Pro', text: 'For repeat project work, exports, screenshots, saved maps, and deeper review.' },
      { title: 'Team', text: 'For shared workspaces, comments, permissions, and stakeholder collaboration.' },
    ],
    secondaryLink: { label: 'Review features', pageId: 'features' },
    metaTitle: 'Pricing | Vellic',
    metaDescription: 'Review beta-friendly Vellic plan direction for quick scans, professional website audits, redesign planning, and team review.',
    x: MARKETING_COLUMN_GAP * 3,
    y: MARKETING_ROW_GAP,
    depth: 2,
  }),
  page({
    id: 'faq',
    slug: 'faq',
    navLabel: 'FAQ',
    eyebrow: 'Straight answers',
    title: 'Know what Vellic is before you scan.',
    summary: 'Vellic is a visual sitemap and website structure workspace. It is not trying to replace every crawler, performance audit, accessibility audit, or manual expert review.',
    body: ['These answers keep expectations clear before someone starts a scan or brings the map into a project.'],
    proofPoints: ['What it scans', 'How it compares', 'Exports', 'Device support'],
    cards: [
      { title: 'What does Vellic scan?', text: 'Public, reachable pages from a URL, using crawl data and selected scan options.' },
      { title: 'Can I create maps manually?', text: 'Yes. You can start from scratch or import supported sitemap data.' },
      { title: 'Can teams comment and share?', text: 'Saved maps support sharing, permissions, and review comments.' },
      { title: 'Does the app work on phones?', text: 'The marketing site does. The workspace is designed for desktop and tablet screens.' },
    ],
    secondaryLink: { label: 'Contact Vellic', pageId: 'contact' },
    metaTitle: 'FAQ | Vellic',
    metaDescription: 'Read answers about Vellic scanning, visual sitemap editing, sharing, exports, screenshots, insights, and device support.',
    x: MARKETING_COLUMN_GAP * 4,
    y: MARKETING_ROW_GAP,
    depth: 2,
  }),
  page({
    id: 'mission',
    slug: 'mission',
    navLabel: 'Mission',
    eyebrow: 'Why Vellic exists',
    title: 'Make website structure easier to see, question, and improve.',
    summary: 'Vellic exists because the structure behind a website often decides whether the work succeeds, but that structure is usually hard for teams to see together.',
    body: [
      'The product is meant to sit between strategy and implementation: close enough to the real site to be useful, visual enough for non-technical stakeholders, and structured enough for teams doing serious planning work.',
      'The longer-term vision is a calmer workspace for mapping, testing, diagramming, collaborating, and improving the systems that websites are built on.',
    ],
    proofPoints: ['Clarity over clutter', 'Structure over guesswork', 'Shared review', 'Better handoff'],
    cards: [
      { title: 'Brand mission', text: 'Help teams replace scattered website context with a clear visual source of truth.' },
      { title: 'Product mission', text: 'Make scanning, mapping, editing, capture, and export feel like one connected workflow.' },
      { title: 'Future vision', text: 'Bring templates, assistant workflows, navigation testing, diagramming, and integrations into the map.' },
    ],
    secondaryLink: { label: 'Explore features', pageId: 'features' },
    metaTitle: 'Mission | Vellic',
    metaDescription: 'Learn why Vellic exists and how it aims to make website structure easier to see, question, improve, and share.',
    x: MARKETING_COLUMN_GAP * 5,
    y: MARKETING_ROW_GAP,
    depth: 2,
  }),
  page({
    id: 'contact',
    slug: 'contact',
    navLabel: 'Contact',
    eyebrow: 'Get in touch',
    title: 'Use Vellic directly, or talk through a real website workflow.',
    summary: 'For product questions, walkthroughs, agency use cases, or early feedback, reach Vellic through the support address already used for product replies.',
    body: ['Vellic is still moving quickly. The best conversations are specific: a site you need to understand, a review you need to deliver, or a planning workflow that is hard to explain today.'],
    proofPoints: ['Product questions', 'Walkthroughs', 'Agency workflows', 'Early feedback'],
    cards: [
      { title: 'Email', text: 'support@vellic.io' },
      { title: 'Best fit', text: 'Website audits, redesign planning, IA review, migrations, and stakeholder handoff.' },
      { title: 'What to include', text: 'The site type, project stage, team role, and the decision the map needs to support.' },
    ],
    secondaryLink: { label: 'Start with a scan', pageId: 'overview' },
    metaTitle: 'Contact | Vellic',
    metaDescription: 'Contact Vellic for product questions, walkthroughs, agency website workflows, early feedback, and visual sitemap planning.',
    x: MARKETING_COLUMN_GAP * 6,
    y: MARKETING_ROW_GAP,
    depth: 2,
  }),
  page({
    id: 'use-cases-content-strategy',
    slug: 'use-cases/content-strategy',
    parentId: 'use-cases',
    navLabel: 'Content strategy',
    eyebrow: 'Use case',
    title: 'Plan content from the structure people actually navigate.',
    summary: 'Use Vellic to spot buried pages, duplicate sections, thin clusters, and missing journeys before the content plan turns into a spreadsheet.',
    body: ['Content strategy work needs more than a list of URLs. Vellic keeps page hierarchy, crawl context, screenshots, and review notes together so teams can decide what to keep, combine, rewrite, or remove.'],
    proofPoints: ['Content inventory', 'Gap review', 'Rewrite planning', 'Stakeholder alignment'],
    cards: [
      { title: 'Find buried content', text: 'See when important pages sit too deep or outside the paths users are likely to follow.' },
      { title: 'Group related pages', text: 'Turn scattered content into clusters that can be reviewed and planned together.' },
    ],
    secondaryLink: { label: 'Back to use cases', pageId: 'use-cases' },
    metaTitle: 'Content Strategy Use Case | Vellic',
    metaDescription: 'Use Vellic for content strategy, content inventory, gap review, buried page discovery, and stakeholder website planning.',
    x: 0,
    y: MARKETING_ROW_GAP * 2,
    depth: 3,
  }),
  page({
    id: 'use-cases-ux',
    slug: 'use-cases/ux',
    parentId: 'use-cases',
    navLabel: 'UX',
    eyebrow: 'Use case',
    title: 'Review navigation and information architecture before redesign work starts.',
    summary: 'Vellic helps UX and IA teams inspect whether a site structure supports the journeys, labels, and hierarchy that matter most.',
    body: ['Instead of debating navigation from memory, teams can work from a visual map of the current site, then shape a better structure while preserving the reasoning behind each change.'],
    proofPoints: ['IA review', 'Journey clarity', 'Navigation paths', 'Redesign planning'],
    cards: [
      { title: 'Audit hierarchy', text: 'Review whether key sections are easy to find and organized around user intent.' },
      { title: 'Plan cleaner paths', text: 'Turn current-state complexity into a proposed structure people can understand.' },
    ],
    secondaryLink: { label: 'Explore editing', pageId: 'features-editing' },
    metaTitle: 'UX and IA Use Case | Vellic',
    metaDescription: 'Use Vellic for UX audits, information architecture review, navigation planning, journey review, and redesign discovery.',
    x: 0,
    y: MARKETING_ROW_GAP * 3,
    depth: 3,
  }),
  page({
    id: 'use-cases-dev-engineering',
    slug: 'use-cases/dev-engineering',
    parentId: 'use-cases',
    navLabel: 'Dev and engineering',
    eyebrow: 'Use case',
    title: 'Give technical cleanup and migrations a shared map.',
    summary: 'Vellic helps engineering teams understand current structure, page status, redirects, stale sections, screenshots, and exports before implementation work starts.',
    body: ['Technical website projects often fail when business context and crawl data live in separate places. Vellic gives teams a visual map that can travel from discovery to cleanup to migration handoff.'],
    proofPoints: ['Migration prep', 'Redirect context', 'Cleanup scope', 'Structured exports'],
    cards: [
      { title: 'Clarify migration scope', text: 'Review what exists before deciding what moves, merges, redirects, or gets removed.' },
      { title: 'Export usable data', text: 'Package map and page data for implementation planning and stakeholder review.' },
    ],
    secondaryLink: { label: 'Review exports', pageId: 'features-exports' },
    metaTitle: 'Dev and Engineering Use Case | Vellic',
    metaDescription: 'Use Vellic for website migration planning, technical cleanup, redirect context, structured exports, and engineering handoff.',
    x: 0,
    y: MARKETING_ROW_GAP * 4,
    depth: 3,
  }),
  page({
    id: 'use-cases-seo',
    slug: 'use-cases/seo',
    parentId: 'use-cases',
    navLabel: 'SEO',
    eyebrow: 'Use case',
    title: 'Use crawl context without turning every review into a crawler spreadsheet.',
    summary: 'Vellic is not a replacement for deep technical SEO crawlers, but it helps teams see how crawl signals connect to structure, depth, and discoverability.',
    body: ['SEO teams can use Vellic to explain structural issues visually, then hand off deeper crawl exports or specialist audits when the work calls for them.'],
    proofPoints: ['Depth review', 'Orphan context', 'Metadata signals', 'Prioritization'],
    cards: [
      { title: 'Show structure clearly', text: 'Make page depth, clusters, and buried sections easier to explain.' },
      { title: 'Prioritize deeper audits', text: 'Use the map to decide where crawler-level detail is worth deeper attention.' },
    ],
    secondaryLink: { label: 'Compare features', pageId: 'features' },
    metaTitle: 'SEO Use Case | Vellic',
    metaDescription: 'Use Vellic to connect crawl-based website structure signals with SEO review, page depth, orphan context, and audit prioritization.',
    x: 0,
    y: MARKETING_ROW_GAP * 5,
    depth: 3,
  }),
  page({
    id: 'features-scanning',
    slug: 'features/site-scanning',
    parentId: 'features',
    navLabel: 'Site scanning',
    eyebrow: 'Feature',
    title: 'Start from the live site, not a blank diagram.',
    summary: 'Vellic scans a public URL and turns crawlable pages into an editable visual sitemap that teams can review immediately.',
    body: ['Crawlers are strong at collecting data. Sitemap tools are strong at planning. Vellic uses scanning as the starting point for a map that remains editable, visual, and useful for non-technical review.'],
    proofPoints: ['URL scan', 'Crawlable pages', 'Page hierarchy', 'Editable output'],
    cards: [
      { title: 'Scan first', text: 'Create a working map from the site that exists today.' },
      { title: 'Then shape it', text: 'Use scan output as the foundation for review, edits, and handoff.' },
    ],
    secondaryLink: { label: 'See editing', pageId: 'features-editing' },
    metaTitle: 'Website Scanning Feature | Vellic',
    metaDescription: 'Scan a live website with Vellic and turn crawlable pages into an editable visual sitemap for audits, redesigns, and planning.',
    x: MARKETING_COLUMN_GAP,
    y: MARKETING_ROW_GAP * 2,
    depth: 3,
  }),
  page({
    id: 'features-editing',
    slug: 'features/structure-editing',
    parentId: 'features',
    navLabel: 'Structure editing',
    eyebrow: 'Feature',
    title: 'Edit the map after the scan.',
    summary: 'Vellic lets teams move pages, adjust hierarchy, add context, and turn the current website into a clearer proposed structure.',
    body: ['A static crawl output is useful, but planning needs change. Vellic keeps the map editable so review can move from what exists to what should happen next.'],
    proofPoints: ['Move pages', 'Rename nodes', 'Annotate decisions', 'Plan future state'],
    cards: [
      { title: 'Current state', text: 'Keep the scanned site visible as a shared baseline.' },
      { title: 'Future state', text: 'Shape a cleaner structure without losing the review context.' },
    ],
    secondaryLink: { label: 'See UX use case', pageId: 'use-cases-ux' },
    metaTitle: 'Visual Sitemap Editing Feature | Vellic',
    metaDescription: 'Edit visual sitemap structure in Vellic after a scan, including hierarchy, labels, notes, annotations, and future-state planning.',
    x: MARKETING_COLUMN_GAP,
    y: MARKETING_ROW_GAP * 3,
    depth: 3,
  }),
  page({
    id: 'features-screenshots',
    slug: 'features/screenshots',
    parentId: 'features',
    navLabel: 'Screenshots',
    eyebrow: 'Feature',
    title: 'Add visual evidence to the pages under review.',
    summary: 'Vellic can capture supporting thumbnails and screenshots so reviews do not depend on titles and URLs alone.',
    body: ['Screenshots make stakeholder reviews easier because the map can show what a page is, not just where it sits. This is especially useful for audits, redesign planning, and content cleanup.'],
    proofPoints: ['Page thumbnails', 'Full-page context', 'Review evidence', 'Visual handoff'],
    cards: [
      { title: 'Preview the page', text: 'Use thumbnails to identify page types and patterns faster.' },
      { title: 'Support the decision', text: 'Capture visuals that make reviews and exports easier to understand.' },
    ],
    secondaryLink: { label: 'See examples', pageId: 'examples' },
    metaTitle: 'Website Screenshot Capture Feature | Vellic',
    metaDescription: 'Capture website thumbnails and screenshots in Vellic to support visual sitemap reviews, audits, redesigns, and stakeholder handoff.',
    x: MARKETING_COLUMN_GAP,
    y: MARKETING_ROW_GAP * 4,
    depth: 3,
  }),
  page({
    id: 'features-exports',
    slug: 'features/exports',
    parentId: 'features',
    navLabel: 'Exports',
    eyebrow: 'Feature',
    title: 'Turn the map into something teams can use outside the workspace.',
    summary: 'Vellic exports the structure and review context so clients, stakeholders, designers, and engineers can keep moving after the map is done.',
    body: ['Website planning often ends in scattered files. Vellic is designed to make the visual map, page list, screenshots, and review outputs easier to package for the next step.'],
    proofPoints: ['Map exports', 'Page lists', 'Reports', 'Structured files'],
    cards: [
      { title: 'Stakeholder review', text: 'Share a visual artifact people can understand quickly.' },
      { title: 'Implementation handoff', text: 'Export structured page data for planning, migration, or delivery.' },
    ],
    secondaryLink: { label: 'See engineering use case', pageId: 'use-cases-dev-engineering' },
    metaTitle: 'Visual Sitemap Export Feature | Vellic',
    metaDescription: 'Export visual sitemap maps, page lists, reports, and structured website planning data from Vellic for review and handoff.',
    x: MARKETING_COLUMN_GAP,
    y: MARKETING_ROW_GAP * 5,
    depth: 3,
  }),
  page({
    id: 'examples-map',
    slug: 'examples/example-map',
    parentId: 'examples',
    navLabel: 'Example map',
    eyebrow: 'Example',
    title: 'A simple scan can reveal structure, gaps, and review questions.',
    summary: 'Use an example map to show how a marketing site becomes a visual artifact teams can discuss.',
    body: ['The example map should show the relationship between top-level pages, deeper supporting pages, screenshots, and findings without overloading the first marketing preview.'],
    proofPoints: ['Hierarchy', 'Page depth', 'Review notes', 'Export path'],
    cards: [
      { title: 'What exists', text: 'Show the current site in a way stakeholders can scan.' },
      { title: 'What needs work', text: 'Highlight sections that deserve review before redesign or migration.' },
    ],
    secondaryLink: { label: 'See feature workflow', pageId: 'features-scanning' },
    metaTitle: 'Example Visual Sitemap | Vellic',
    metaDescription: 'See an example Vellic visual sitemap showing hierarchy, page depth, review notes, screenshots, and website planning context.',
    x: MARKETING_COLUMN_GAP * 2,
    y: MARKETING_ROW_GAP * 2,
    depth: 3,
  }),
  page({
    id: 'examples-workflow',
    slug: 'examples/workflow',
    parentId: 'examples',
    navLabel: 'Example workflow',
    eyebrow: 'Example',
    title: 'From current site to cleaner plan.',
    summary: 'A Vellic workflow can start with a scan, then move through review, editing, screenshot capture, and export.',
    body: ['This example frames Vellic as a workflow rather than a single sitemap generator: scan, understand, shape, review, and hand off.'],
    proofPoints: ['Scan', 'Review', 'Edit', 'Export'],
    cards: [
      { title: 'Before', text: 'The current site structure is visible and easier to question.' },
      { title: 'After', text: 'The proposed structure is clearer, annotated, and easier to share.' },
    ],
    secondaryLink: { label: 'Review features', pageId: 'features' },
    metaTitle: 'Website Planning Workflow Example | Vellic',
    metaDescription: 'See how Vellic supports a website planning workflow from scan to review, editing, screenshot capture, and export.',
    x: MARKETING_COLUMN_GAP * 2,
    y: MARKETING_ROW_GAP * 3,
    depth: 3,
  }),
  page({
    id: 'start',
    slug: 'start',
    parentId: 'features',
    navLabel: 'Start',
    eyebrow: 'Start site scan',
    title: 'Open Vellic on a larger screen to start a scan.',
    summary: 'Vellic is built for desktop and tablet screens. Visual sitemaps need room to breathe.',
    body: ['You can copy the app link, browse examples, or open the workspace anyway if you are already on a supported larger device.'],
    proofPoints: ['Copy app link', 'View examples', 'Learn more', 'Open anyway'],
    cards: [],
    metaTitle: 'Start site scan | Vellic',
    metaDescription: 'Start a Vellic site scan from a desktop or tablet, or copy the Vellic app link from a mobile device.',
    x: MARKETING_COLUMN_GAP,
    y: MARKETING_ROW_GAP * 6,
    depth: 3,
  }),
];

export const MARKETING_NAV_PAGE_IDS = [
  'overview',
  'use-cases',
  'features',
  'examples',
  'pricing',
  'faq',
  'mission',
  'contact',
];

export function getMarketingPageById(pageId) {
  return MARKETING_PAGES.find((entry) => entry.id === pageId) || MARKETING_PAGES[0];
}

export function getMarketingPageByPathname(pathname) {
  const normalized = `/${trimPath(pathname)}`;
  if (normalized === MARKETING_BASE_PATH) return getMarketingPageById('overview');
  if (!normalized.startsWith(`${MARKETING_BASE_PATH}/`)) return null;
  const slug = normalized.slice(MARKETING_BASE_PATH.length + 1);
  return MARKETING_PAGES.find((entry) => entry.slug === slug) || null;
}

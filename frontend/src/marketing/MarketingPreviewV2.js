import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  FileDown,
  ImageIcon,
  Import,
  Layers,
  MapIcon,
  Menu,
  MessageSquare,
  PenLine,
  Scan,
  Share2,
  X,
} from 'lucide-react';

import vellicLogo from '../assets/vellic-logo.svg';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';
import { ROUTE_SURFACES } from '../utils/appRoutes';
import classNames from '../utils/classNames';
import { sanitizeUrl } from '../utils/helpers';
import MarketingScanBar, { isMarketingPhoneViewport } from './MarketingScanBar';
import { buildAppScanUrl } from './marketingConfig';
import {
  MARKETING_PREVIEW_V2_BASE_PATH,
  MARKETING_PREVIEW_V2_NAV_SECTION_IDS,
  buildMarketingPreviewV2CanonicalUrl,
  buildMarketingPreviewV2Path,
  getMarketingPreviewV2SectionById,
  getMarketingPreviewV2SectionByPathname,
} from './marketingPreviewV2Config';
import './MarketingPreviewV2.css';

const workflowSteps = [
  {
    icon: Scan,
    title: 'Scan a site',
    text: 'Start from a live URL and get the first map fast.',
  },
  {
    icon: PenLine,
    title: 'Shape the map',
    text: 'Create, import, move, rename, and annotate structure.',
  },
  {
    icon: Share2,
    title: 'Export or share',
    text: 'Send screenshots, page lists, maps, and review context.',
  },
];

const useCaseCards = [
  {
    title: 'Content Strategy',
    text: 'Spot buried, duplicate, thin, or disconnected content.',
    accent: 'green',
  },
  {
    title: 'UX + IA',
    text: 'Review hierarchy, labels, and navigation paths.',
    accent: 'blue',
  },
  {
    title: 'Dev & Engineering',
    text: 'Clarify cleanup, migrations, redirects, and handoff data.',
    accent: 'gold',
  },
  {
    title: 'SEO',
    text: 'Connect crawl context to depth, structure, and priority.',
    accent: 'coral',
  },
];

const featureCards = [
  {
    icon: Scan,
    title: 'Scan',
    text: 'Turn a public site into a visual starting point.',
    accent: 'purple',
  },
  {
    icon: Import,
    title: 'Create / import',
    text: 'Begin from a scan, scratch map, or imported structure.',
    accent: 'blue',
  },
  {
    icon: PenLine,
    title: 'Edit',
    text: 'Move pages, group sections, rename, tag, and annotate.',
    accent: 'green',
  },
  {
    icon: ImageIcon,
    title: 'Screenshots',
    text: 'Attach page visuals when review needs evidence.',
    accent: 'gold',
  },
  {
    icon: FileDown,
    title: 'Export / share',
    text: 'Package the map, pages, reports, and structured files.',
    accent: 'coral',
  },
  {
    icon: MessageSquare,
    title: 'Review context',
    text: 'Keep comments, findings, and decisions tied to pages.',
    accent: 'purple',
  },
];

const comparisonRows = [
  ['Live site crawl from URL', 'Core mapping', 'Yes', 'Generate a map from a public website URL.'],
  ['Visual sitemap canvas', 'Core mapping', 'Yes', 'Interactive tree/canvas view for site structure.'],
  ['Manual sitemap editing', 'Core mapping', 'Yes', 'Users can edit maps after generation.'],
  ['Issue layers on visual map', 'Audit', 'Yes', 'Shows scan issues in map context.'],
  ['Page thumbnails', 'Screenshots', 'Yes', 'Captures page thumbnails.'],
  ['Export PNG / PDF / SVG / CSV / JSON', 'Export', 'Yes', 'Visual map and structured export formats.'],
  ['Shareable review links', 'Collaboration', 'Yes', 'Maps can be shared for review.'],
  ['Live co-editing', 'Collaboration', 'Yes', 'Live map editing support.'],
];

const exampleCards = [
  {
    title: 'Example map',
    text: 'Hierarchy, depth, screenshots, and review notes in one view.',
    variant: 'map',
  },
  {
    title: 'Example workflow',
    text: 'Current site, proposed structure, findings, and export path.',
    variant: 'workflow',
  },
];

const upcomingItems = [
  'Templates and assistant',
  'Tree testing / navigation prototyping',
  'Diagramming',
  'Integrations',
];

const pricingCards = [
  ['Starter', 'Quick scans and simple maps.'],
  ['Pro', 'Saved maps, screenshots, exports, and reports.'],
  ['Team', 'Shared review, permissions, and collaboration.'],
];

const faqItems = [
  ['What does Vellic scan?', 'Public, reachable pages from a URL.'],
  ['Can I create maps manually?', 'Yes. Create from scratch or import.'],
  ['Does it work on phones?', 'Marketing does. The app needs desktop or tablet space.'],
];

const defaultOpenApp = (url) => {
  window.location.assign(url);
};

const MARKETING_V2_SCROLL_OFFSET = 112;
const MARKETING_V2_REVEAL_SESSION_KEY = 'vellic-marketing-preview-v2-reveal-complete';

function isPlainLeftClick(event) {
  return event.button === 0 && !event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey;
}

function getMarketingV2ScrollTop(element) {
  return Math.max(0, element.offsetTop - MARKETING_V2_SCROLL_OFFSET);
}

function setMetaTag(selector, createAttrs, content) {
  if (!content) return;
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    Object.entries(createAttrs).forEach(([key, value]) => element.setAttribute(key, value));
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function setCanonical(url) {
  let element = document.head.querySelector('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', 'canonical');
    document.head.appendChild(element);
  }
  element.setAttribute('href', url);
}

function applyMarketingPreviewV2Metadata(section) {
  const canonicalUrl = buildMarketingPreviewV2CanonicalUrl(section.id);
  document.title = section.metaTitle;
  setMetaTag('meta[name="description"]', { name: 'description' }, section.metaDescription);
  setMetaTag('meta[property="og:title"]', { property: 'og:title' }, section.metaTitle);
  setMetaTag('meta[property="og:description"]', { property: 'og:description' }, section.metaDescription);
  setMetaTag('meta[property="og:url"]', { property: 'og:url' }, canonicalUrl);
  setMetaTag('meta[property="og:type"]', { property: 'og:type' }, 'website');
  setCanonical(canonicalUrl);
}

function buildV2StartPath(scanUrl = '') {
  const query = scanUrl ? `url=${encodeURIComponent(scanUrl)}` : '';
  return buildMarketingPreviewV2Path('start', query);
}

function MarketingV2Header({ activeSectionId, onNavigatePath, onOpenApp }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navSections = useMemo(() => (
    MARKETING_PREVIEW_V2_NAV_SECTION_IDS.map(getMarketingPreviewV2SectionById)
  ), []);

  const handleStart = () => {
    setMenuOpen(false);
    if (isMarketingPhoneViewport()) {
      onNavigatePath(buildMarketingPreviewV2Path('start'), { behavior: 'smooth' });
      return;
    }
    onOpenApp(buildAppScanUrl());
  };

  return (
    <header className="marketing-v2-header">
      <a className="marketing-v2-header__brand" href={buildMarketingPreviewV2Path('home')} aria-label="Vellic home">
        <img src={vellicLogo} alt="Vellic" />
      </a>
      <IconButton
        className="marketing-v2-header__menu"
        type="button"
        variant="ghost"
        buttonStyle="mono"
        size="md"
        icon={menuOpen ? <X size={20} /> : <Menu size={20} />}
        label={menuOpen ? 'Close navigation' : 'Open navigation'}
        aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      />
      <nav className={classNames('marketing-v2-header__nav', menuOpen && 'is-open')} aria-label="Marketing navigation">
        {navSections.map((section) => (
          <a
            key={section.id}
            href={buildMarketingPreviewV2Path(section.id)}
            aria-current={activeSectionId === section.id ? 'page' : undefined}
            onClick={() => setMenuOpen(false)}
          >
            {section.navLabel}
          </a>
        ))}
        <Button
          className="marketing-v2-header__cta"
          type="button"
          size="md"
          endIcon={<ArrowRight />}
          onClick={handleStart}
        >
          Get Started
        </Button>
      </nav>
    </header>
  );
}

function ProductFrame({ title = 'App screenshot placeholder', variant = 'map', large = false }) {
  const pages = variant === 'workflow'
    ? ['Current site', 'Proposed map', 'Review', 'Export']
    : ['Home', 'Product', 'Docs', 'Pricing'];

  return (
    <figure className={classNames('marketing-v2-product-frame marketing-v2-reveal', large && 'marketing-v2-product-frame--large')}>
      <div className="marketing-v2-product-frame__bar">
        <span>Vellic workspace</span>
        <span>{title}</span>
      </div>
      <div className="marketing-v2-product-frame__body">
        <aside className="marketing-v2-product-frame__sidebar" aria-hidden="true">
          <span className="is-active">Map</span>
          <span>Review</span>
          <span>Exports</span>
        </aside>
        <div className="marketing-v2-product-frame__canvas">
          {pages.map((page, index) => (
            <div
              key={page}
              className={classNames('marketing-v2-product-node', `marketing-v2-product-node--${index + 1}`)}
            >
              <span />
              <strong>{page}</strong>
              <small>{index + 2} pages</small>
            </div>
          ))}
        </div>
        <aside className="marketing-v2-product-frame__panel" aria-hidden="true">
          <strong>Review</strong>
          <span>Screenshot attached</span>
          <span>3 comments</span>
          <span>Ready to export</span>
        </aside>
      </div>
      <figcaption>{title}</figcaption>
    </figure>
  );
}

function MarketingV2Card({ children, accent = 'purple', className }) {
  return (
    <article className={classNames('marketing-v2-card marketing-v2-reveal', `marketing-v2-card--${accent}`, className)}>
      {children}
    </article>
  );
}

function MarketingV2ScanCta({ onNavigatePath, onOpenApp, compact = false }) {
  return (
    <MarketingScanBar
      compact={compact}
      onNavigate={onNavigatePath}
      onOpenApp={onOpenApp}
      buildStartPath={buildV2StartPath}
    />
  );
}

function SectionShell({ id, eyebrow, title, summary, children, className }) {
  return (
    <section
      id={`marketing-v2-${id}`}
      className={classNames('marketing-v2-section marketing-v2-reveal', className)}
      data-marketing-v2-section={id}
      aria-labelledby={`marketing-v2-${id}-title`}
    >
      <div className="marketing-v2-section__header">
        <div className="marketing-v2-eyebrow">{eyebrow}</div>
        <h2 id={`marketing-v2-${id}-title`}>{title}</h2>
        {summary ? <p>{summary}</p> : null}
      </div>
      {children}
    </section>
  );
}

function StartActions({ route, onNavigatePath, onOpenApp }) {
  const [copied, setCopied] = useState(false);
  const queryUrl = sanitizeUrl(route.searchParams?.get('url') || '');
  const appUrl = buildAppScanUrl(queryUrl);

  const copyAppLink = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = appUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }
    setCopied(true);
  };

  return (
    <div className="marketing-v2-start-actions" aria-label="Start site scan actions">
      <Button type="button" variant="secondary" buttonStyle="mono" size="lg" startIcon={<Copy />} onClick={copyAppLink}>
        {copied ? 'Copied app link' : 'Copy app link'}
      </Button>
      <Button
        type="button"
        variant="secondary"
        buttonStyle="mono"
        size="lg"
        startIcon={<MapIcon />}
        onClick={() => onNavigatePath(buildMarketingPreviewV2Path('examples'))}
      >
        View examples
      </Button>
      <Button
        type="button"
        variant="secondary"
        buttonStyle="mono"
        size="lg"
        startIcon={<Layers />}
        onClick={() => onNavigatePath(buildMarketingPreviewV2Path('features'))}
      >
        Learn more
      </Button>
      <Button type="button" size="lg" startIcon={<ExternalLink />} onClick={() => onOpenApp(appUrl)}>
        Open app anyway
      </Button>
    </div>
  );
}

function MarketingPreviewV2({ route, navigateToRoute, onOpenApp = defaultOpenApp }) {
  const activeSection = getMarketingPreviewV2SectionById(route.marketingPageId || route.section || 'home');
  const [activeNavSectionId, setActiveNavSectionId] = useState(activeSection.id);
  const [revealEnabled] = useState(() => {
    try {
      if (window.sessionStorage?.getItem(MARKETING_V2_REVEAL_SESSION_KEY) === '1') return false;
      window.sessionStorage?.setItem(MARKETING_V2_REVEAL_SESSION_KEY, '1');
      return true;
    } catch {
      return true;
    }
  });
  const pendingScrollBehaviorRef = useRef('auto');

  useEffect(() => {
    applyMarketingPreviewV2Metadata(activeSection);
    setActiveNavSectionId(activeSection.id);
    const element = document.getElementById(`marketing-v2-${activeSection.id}`);
    if (element && typeof window.scrollTo === 'function') {
      window.scrollTo({
        top: getMarketingV2ScrollTop(element),
        left: 0,
        behavior: pendingScrollBehaviorRef.current,
      });
      pendingScrollBehaviorRef.current = 'auto';
      return;
    }
    element?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  }, [activeSection]);

  useEffect(() => {
    let frame = null;

    const updateActiveSection = () => {
      frame = null;
      const sections = Array.from(document.querySelectorAll('[data-marketing-v2-section]'));
      if (sections.length === 0 || sections.every((section) => section.offsetTop === 0)) return;
      const position = window.scrollY + MARKETING_V2_SCROLL_OFFSET + 24;
      const currentSection = sections.reduce((current, section) => (
        section.offsetTop <= position ? section : current
      ), sections[0]);
      const nextSectionId = currentSection?.getAttribute('data-marketing-v2-section') || activeSection.id;
      setActiveNavSectionId(nextSectionId);
    };

    const handleScroll = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [activeSection.id]);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll('.marketing-v2-reveal'));
    if (!revealEnabled || typeof IntersectionObserver === 'undefined') {
      elements.forEach((element) => element.classList.add('is-revealed'));
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, {
      rootMargin: '0px 0px -12% 0px',
      threshold: 0.16,
    });

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [revealEnabled]);

  const navigateToPath = (path, { behavior = 'auto' } = {}) => {
    const url = new URL(path, window.location.origin);
    const section = getMarketingPreviewV2SectionByPathname(url.pathname);
    if (!section) return;
    pendingScrollBehaviorRef.current = behavior;
    navigateToRoute?.({
      surface: ROUTE_SURFACES.MARKETING,
      marketingPreviewVersion: 'v2',
      marketingPageId: section.id,
      section: section.id,
      pathname: url.pathname,
      search: url.search,
    });
  };

  const handleClick = (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor || !isPlainLeftClick(event)) return;
    const url = new URL(anchor.getAttribute('href'), window.location.origin);
    if (url.origin !== window.location.origin) return;
    if (!url.pathname.startsWith(MARKETING_PREVIEW_V2_BASE_PATH)) return;
    const section = getMarketingPreviewV2SectionByPathname(url.pathname);
    if (!section) return;
    event.preventDefault();
    navigateToPath(`${url.pathname}${url.search}`, { behavior: 'smooth' });
  };

  return (
    <div
      className={classNames('marketing-preview-v2', !revealEnabled && 'marketing-preview-v2--reveal-complete')}
      onClick={handleClick}
    >
      <MarketingV2Header
        activeSectionId={activeNavSectionId}
        onNavigatePath={navigateToPath}
        onOpenApp={onOpenApp}
      />
      <main className="marketing-v2-main">
        <section
          id="marketing-v2-home"
          className="marketing-v2-hero"
          data-marketing-v2-section="home"
          aria-labelledby="marketing-v2-home-title"
        >
          <div className="marketing-v2-hero__copy marketing-v2-reveal">
            <div className="marketing-v2-eyebrow">Visual website maps</div>
            <h1 id="marketing-v2-home-title">Scan a site. Shape the map. Share the plan.</h1>
            <p>Vellic turns live websites into editable maps for review, screenshots, exports, and handoff.</p>
            <MarketingV2ScanCta onNavigatePath={navigateToPath} onOpenApp={onOpenApp} />
          </div>
          <ProductFrame title="App screenshot placeholder" variant="map" large />
        </section>

        <SectionShell
          id="workflow"
          eyebrow="How it works"
          title="From live site to usable structure."
          summary="A short path from scan to shared artifact."
          className="marketing-v2-section--workflow"
        >
          <div className="marketing-v2-workflow">
            {workflowSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <MarketingV2Card key={step.title} accent={['purple', 'blue', 'green'][index]}>
                  <Icon size={22} aria-hidden="true" />
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </MarketingV2Card>
              );
            })}
          </div>
        </SectionShell>

        <SectionShell
          id="use-cases"
          eyebrow="Use cases"
          title="For teams that need shared website context."
          summary="Content, UX, engineering, and SEO work from the same map."
        >
          <div className="marketing-v2-card-grid marketing-v2-card-grid--four">
            {useCaseCards.map((card) => (
              <MarketingV2Card key={card.title} accent={card.accent}>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
              </MarketingV2Card>
            ))}
          </div>
        </SectionShell>

        <SectionShell
          id="features"
          eyebrow="Features"
          title="Scan, create, edit, review, capture, export."
          summary="Core tools for current-state audits and future-state planning."
        >
          <div className="marketing-v2-card-grid marketing-v2-card-grid--three">
            {featureCards.map((card) => {
              const Icon = card.icon;
              return (
                <MarketingV2Card key={card.title} accent={card.accent}>
                  <Icon size={22} aria-hidden="true" />
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                </MarketingV2Card>
              );
            })}
          </div>
          <div className="marketing-v2-comparison" aria-label="Light comparison matrix">
            <table>
              <thead>
                <tr>
                  <th scope="col">Capability</th>
                  <th scope="col">Category</th>
                  <th scope="col">Vellic</th>
                  <th scope="col">Evidence note</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(([capability, category, vellic, note]) => (
                  <tr key={capability}>
                    <th scope="row">{capability}</th>
                    <td>{category}</td>
                    <td>{vellic}</td>
                    <td>{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="marketing-v2-feature-upcoming marketing-v2-reveal">
            <div className="marketing-v2-section__header">
              <div className="marketing-v2-eyebrow">Upcoming</div>
              <h3>More ways to test and extend the map.</h3>
              <p>Future directions stay connected to the same visual workspace.</p>
            </div>
            <div className="marketing-v2-upcoming">
              {upcomingItems.map((item, index) => (
                <MarketingV2Card key={item} accent={['purple', 'blue', 'green', 'gold'][index]}>
                  <Check size={20} aria-hidden="true" />
                  <h3>{item}</h3>
                </MarketingV2Card>
              ))}
            </div>
          </div>
        </SectionShell>

        <SectionShell
          id="examples"
          eyebrow="Examples"
          title="Placeholder product frames for now."
          summary="Real screenshots can replace these once the page direction is approved."
        >
          <div className="marketing-v2-examples">
            {exampleCards.map((example) => (
              <MarketingV2Card key={example.title} accent={example.variant === 'map' ? 'blue' : 'green'}>
                <ProductFrame title={`${example.title}: app screenshot placeholder`} variant={example.variant} />
                <h3>{example.title}</h3>
                <p>{example.text}</p>
              </MarketingV2Card>
            ))}
          </div>
        </SectionShell>

        <SectionShell
          id="pricing"
          eyebrow="Pricing"
          title="Start small. Upgrade when the map becomes workflow."
          summary="FPO plan shape while the product is still moving."
        >
          <div className="marketing-v2-card-grid marketing-v2-card-grid--three">
            {pricingCards.map(([title, text], index) => (
              <MarketingV2Card key={title} accent={['green', 'blue', 'purple'][index]}>
                <h3>{title}</h3>
                <p>{text}</p>
              </MarketingV2Card>
            ))}
          </div>
        </SectionShell>

        <SectionShell
          id="faq"
          eyebrow="FAQ"
          title="Short answers before the first scan."
          summary="Keep expectations clear and lightweight."
        >
          <div className="marketing-v2-faq">
            {faqItems.map(([question, answer]) => (
              <MarketingV2Card key={question} accent="blue">
                <h3>{question}</h3>
                <p>{answer}</p>
              </MarketingV2Card>
            ))}
          </div>
        </SectionShell>

        <SectionShell
          id="mission"
          eyebrow="Mission"
          title="Make website structure easier to see and improve."
          summary="Vellic helps teams replace scattered context with a visual source of truth."
        >
          <ProductFrame title="Mission workflow placeholder" variant="workflow" />
        </SectionShell>

        <SectionShell
          id="contact"
          eyebrow="Contact"
          title="Use Vellic directly, or talk through a real workflow."
          summary="For product questions, walkthroughs, agency use cases, or early feedback."
        >
          <div className="marketing-v2-contact">
            <MarketingV2Card accent="green">
              <h3>Email</h3>
              <p>support@vellic.io</p>
            </MarketingV2Card>
            <MarketingV2Card accent="gold">
              <h3>Best fit</h3>
              <p>Audits, redesign planning, IA review, migrations, and handoff.</p>
            </MarketingV2Card>
          </div>
        </SectionShell>

        <SectionShell
          id="start"
          eyebrow="Start"
          title="Open Vellic on desktop or tablet."
          summary="Visual sitemap work needs room. Copy the app link from mobile, or open it anyway."
          className="marketing-v2-section--start"
        >
          <StartActions route={route} onNavigatePath={navigateToPath} onOpenApp={onOpenApp} />
        </SectionShell>

        <section className="marketing-v2-final-cta marketing-v2-reveal" aria-labelledby="marketing-v2-final-title">
          <div>
            <div className="marketing-v2-eyebrow">Start from any URL</div>
            <h2 id="marketing-v2-final-title">See the site before you restructure it.</h2>
          </div>
          <MarketingV2ScanCta onNavigatePath={navigateToPath} onOpenApp={onOpenApp} compact />
        </section>
      </main>
      <footer className="marketing-v2-footer">
        <img src={vellicLogo} alt="Vellic" />
        <p>Preview route. Metadata is client-rendered in this CRA build, not true SSR or SSG.</p>
      </footer>
    </div>
  );
}

export { applyMarketingPreviewV2Metadata };
export default MarketingPreviewV2;

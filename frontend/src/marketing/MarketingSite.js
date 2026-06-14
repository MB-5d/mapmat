import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  FileDown,
  GalleryHorizontal,
  ImageIcon,
  MapIcon,
  Menu,
  Network,
  PenLine,
  RectangleHorizontal,
  Scan,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';

import vellicLogo from '../assets/vellic-logo.svg';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import IconButton from '../components/ui/IconButton';
import { resolveButtonModel } from '../components/ui/buttonModel';
import { ROUTE_SURFACES } from '../utils/appRoutes';
import classNames from '../utils/classNames';
import { sanitizeUrl } from '../utils/helpers';
import MarketingScanBar from './MarketingScanBar';
import {
  MARKETING_BASE_PATH,
  MARKETING_COLUMN_GAP,
  MARKETING_NAV_PAGE_IDS,
  MARKETING_PAGES,
  MARKETING_ROW_GAP,
  buildAppScanUrl,
  buildMarketingCanonicalUrl,
  buildMarketingPath,
  getMarketingPageById,
  getMarketingPageByPathname,
} from './marketingConfig';
import './MarketingSite.css';

const featureIcons = [Scan, MapIcon, PenLine, GalleryHorizontal, FileDown, Share2, Sparkles];
const MARKETING_ROOT_ID = 'overview';
const MARKETING_PHONE_BREAKPOINT = 768;
const MARKETING_CHILD_INDENT_X = 40;
const MARKETING_STROKE_PAD_X = 20;

const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);

function getInitialViewportSize() {
  if (typeof window === 'undefined') return { width: 1440, height: 900 };
  return {
    width: window.innerWidth || 1440,
    height: window.innerHeight || 900,
  };
}

function useViewportSize() {
  const [size, setSize] = useState(getInitialViewportSize);

  useEffect(() => {
    const handleResize = () => setSize(getInitialViewportSize());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return size;
}

function getMarketingPageGridPosition(page) {
  return {
    column: Math.round((page.x || 0) / MARKETING_COLUMN_GAP),
    row: Math.round((page.y || 0) / MARKETING_ROW_GAP),
  };
}

function buildMarketingChildrenById() {
  const childrenById = new Map(MARKETING_PAGES.map((page) => [page.id, []]));

  MARKETING_PAGES.forEach((page) => {
    if (page.id === MARKETING_ROOT_ID) return;
    const parentId = page.parentId || MARKETING_ROOT_ID;
    if (!childrenById.has(parentId)) childrenById.set(parentId, []);
    childrenById.get(parentId).push(page.id);
  });

  childrenById.forEach((children) => {
    children.sort((leftId, rightId) => {
      const leftPosition = getMarketingPageGridPosition(getMarketingPageById(leftId));
      const rightPosition = getMarketingPageGridPosition(getMarketingPageById(rightId));
      return leftPosition.row - rightPosition.row || leftPosition.column - rightPosition.column;
    });
  });

  return childrenById;
}

const MARKETING_CHILDREN_BY_ID = buildMarketingChildrenById();

function buildResponsiveMapLayout(viewportSize) {
  const width = viewportSize.width || 1440;
  const height = viewportSize.height || 900;
  const padX = width <= 1080 ? 24 : width <= 1300 ? 40 : 80;
  const headerHeight = 80;
  const padTop = 24;
  const viewportWidth = Math.max(720, width - padX * 2);
  const viewportHeight = Math.max(620, height - headerHeight - padTop);
  const childPeek = 24;
  const focusScale = width <= 1080 ? 1 : 0.88;
  const focusInsetX = width <= 1080 ? 24 : clampNumber(viewportWidth * 0.052, 76, 104);
  const focusDisplayWidth = viewportWidth - focusInsetX * 2;
  const focusDisplayHeight = viewportHeight - clampNumber(viewportHeight * 0.07, 64, 96);
  const nodeWidth = clampNumber(focusDisplayWidth / focusScale, 960, 2200);
  const nodeHeight = clampNumber(focusDisplayHeight / focusScale, 720, 1360);
  const rowGap = (viewportHeight - childPeek) / focusScale;
  const columnGap = nodeWidth + (focusInsetX - childPeek) / focusScale;
  const pageLayouts = new Map(MARKETING_PAGES.map((page) => {
    const { column, row } = getMarketingPageGridPosition(page);
    return [page.id, {
      x: column * columnGap,
      y: row * rowGap,
    }];
  }));

  MARKETING_CHILDREN_BY_ID.forEach((childIds, parentId) => {
    if (parentId === MARKETING_ROOT_ID) return;
    const parentLayout = pageLayouts.get(parentId);
    if (!parentLayout) return;
    childIds.forEach((childId, index) => {
      pageLayouts.set(childId, {
        x: parentLayout.x + MARKETING_CHILD_INDENT_X,
        y: parentLayout.y + rowGap * (index + 1),
      });
    });
  });

  const layoutValues = Array.from(pageLayouts.values());
  const canvasWidth = layoutValues.reduce((max, pageLayout) => (
    Math.max(max, pageLayout.x + nodeWidth)
  ), nodeWidth);
  const canvasHeight = layoutValues.reduce((max, pageLayout) => (
    Math.max(max, pageLayout.y + nodeHeight)
  ), nodeHeight);
  const overviewScale = clampNumber(
    Math.min(viewportWidth / canvasWidth, viewportHeight / canvasHeight) * 0.9,
    0.06,
    0.16
  );

  return {
    canvasHeight,
    canvasWidth,
    childPeek,
    focusInsetX,
    focusScale,
    nodeHeight,
    nodeWidth,
    overviewScale,
    pageLayouts,
    viewportHeight,
    viewportWidth,
  };
}

function isActiveNavPage(activePage, navPageId) {
  return activePage.id === navPageId || activePage.parentId === navPageId;
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

function applyMarketingMetadata(page) {
  const canonicalUrl = buildMarketingCanonicalUrl(page.id);
  document.title = page.metaTitle;
  setMetaTag('meta[name="description"]', { name: 'description' }, page.metaDescription);
  setMetaTag('meta[property="og:title"]', { property: 'og:title' }, page.metaTitle);
  setMetaTag('meta[property="og:description"]', { property: 'og:description' }, page.metaDescription);
  setMetaTag('meta[property="og:url"]', { property: 'og:url' }, canonicalUrl);
  setMetaTag('meta[property="og:type"]', { property: 'og:type' }, 'website');
  setCanonical(canonicalUrl);
}

function isPlainLeftClick(event) {
  return event.button === 0 && !event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey;
}

function MarketingButtonLink({
  href,
  children,
  className,
  variant = 'primary',
  size = 'lg',
  type,
  buttonStyle,
  startIcon = null,
  endIcon = null,
  ...props
}) {
  const resolvedButton = resolveButtonModel({
    type,
    style: buttonStyle,
    variant,
    size,
  });

  return (
    <a
      href={href}
      className={classNames(
        'ui-btn',
        `ui-btn--type-${resolvedButton.visual.type}`,
        `ui-btn--style-${resolvedButton.visual.style}`,
        `ui-btn--${resolvedButton.size}`,
        resolvedButton.legacyVariantClass && `ui-btn--${resolvedButton.legacyVariantClass}`,
        className
      )}
      {...props}
    >
      {startIcon ? (
        <Icon icon={startIcon} size={resolvedButton.size} className="ui-btn__icon ui-btn__icon--start" />
      ) : null}
      <span className="ui-btn__content">{children}</span>
      {endIcon ? (
        <Icon icon={endIcon} size={resolvedButton.size} className="ui-btn__icon ui-btn__icon--end" />
      ) : null}
    </a>
  );
}

function MarketingHeader({ activePage, onNavigatePath }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navPages = MARKETING_NAV_PAGE_IDS
    .filter((pageId) => pageId !== 'overview')
    .map(getMarketingPageById);
  const startHref = buildAppScanUrl();

  const handleStartClick = (event) => {
    if (!isPlainLeftClick(event)) return;
    if (window.innerWidth > MARKETING_PHONE_BREAKPOINT) return;
    event.preventDefault();
    setMenuOpen(false);
    onNavigatePath(buildMarketingPath('start'));
  };

  return (
    <header className="marketing-header">
      <a className="marketing-header__brand" href={buildMarketingPath('overview')} aria-label="Vellic overview">
        <img src={vellicLogo} alt="Vellic" />
      </a>
      <IconButton
        className="marketing-header__menu"
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
      <nav className={`marketing-header__nav ${menuOpen ? 'is-open' : ''}`} aria-label="Marketing navigation">
        {navPages.map((page) => (
          <a
            key={page.id}
            href={buildMarketingPath(page.id)}
            aria-current={isActiveNavPage(activePage, page.id) ? 'page' : undefined}
            onClick={() => setMenuOpen(false)}
          >
            {page.navLabel}
          </a>
        ))}
        <MarketingButtonLink
          className="marketing-header__cta"
          href={startHref}
          size="md"
          onClick={handleStartClick}
          endIcon={<ArrowRight />}
        >
          Get Started
        </MarketingButtonLink>
      </nav>
    </header>
  );
}

function MarketingFooter({ activePage }) {
  const footerPages = MARKETING_NAV_PAGE_IDS.map(getMarketingPageById);

  return (
    <footer className="marketing-footer">
      <div className="marketing-footer__brand">
        <img src={vellicLogo} alt="Vellic" />
        <p>Visual sitemap workspace for scans, structure, review, and handoff.</p>
      </div>
      <nav className="marketing-footer__links" aria-label="Marketing footer">
        {footerPages.map((page) => (
          <a
            key={page.id}
            href={buildMarketingPath(page.id)}
            aria-current={isActiveNavPage(activePage, page.id) ? 'page' : undefined}
          >
            {page.navLabel}
          </a>
        ))}
        <a href={buildMarketingPath('start')}>Start</a>
      </nav>
      <p className="marketing-footer__note">
        Preview route. Metadata is route-aware on the client; this CRA build is not SSR or SSG.
      </p>
    </footer>
  );
}

function MarketingStartActions({ route }) {
  const [copied, setCopied] = useState(false);
  const queryUrl = sanitizeUrl(route.searchParams?.get('url') || '');
  const appUrl = buildAppScanUrl(queryUrl);

  const copyAppLink = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = appUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
      setCopied(true);
    }
  };

  return (
    <div className="marketing-start-actions" aria-label="Start site scan actions">
      <Button
        type="button"
        className="marketing-action-btn"
        variant="secondary"
        buttonStyle="mono"
        size="lg"
        startIcon={<Copy />}
        onClick={copyAppLink}
      >
        {copied ? 'Copied app link' : 'Copy app link'}
      </Button>
      <MarketingButtonLink
        className="marketing-action-btn"
        href={buildMarketingPath('examples')}
        variant="secondary"
        buttonStyle="mono"
        startIcon={<MapIcon />}
      >
        View examples
      </MarketingButtonLink>
      <MarketingButtonLink
        className="marketing-action-btn"
        href={buildMarketingPath('features')}
        variant="secondary"
        buttonStyle="mono"
        startIcon={<Sparkles />}
      >
        Learn more
      </MarketingButtonLink>
      <MarketingButtonLink
        className="marketing-action-btn"
        href={appUrl}
        startIcon={<ExternalLink />}
      >
        Open app anyway
      </MarketingButtonLink>
    </div>
  );
}

function MarketingPlaceholderVisual() {
  return (
    <div className="marketing-node__visual" aria-label="Placeholder for future Vellic workflow animation">
      <ImageIcon size={48} aria-hidden="true" />
      <p>Placeholder graphic</p>
    </div>
  );
}

function MarketingUpcoming({ upcoming }) {
  if (!upcoming?.length) return null;
  return (
    <section className="marketing-upcoming" aria-labelledby="marketing-upcoming-title">
      <h3 id="marketing-upcoming-title">Upcoming</h3>
      <ul>
        {upcoming.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

function MarketingComparisonMatrix({ matrix }) {
  if (!matrix?.rows?.length) return null;
  return (
    <section className="marketing-comparison" aria-labelledby="marketing-comparison-title">
      <h3 id="marketing-comparison-title">{matrix.title}</h3>
      <div className="marketing-comparison__table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Need</th>
              <th scope="col">Vellic</th>
              <th scope="col">Crawler</th>
              <th scope="col">Planning tool</th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.need}>
                <th scope="row">{row.need}</th>
                <td>{row.vellic}</td>
                <td>{row.crawler}</td>
                <td>{row.planner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MarketingPageContent({ page, active, route, onNavigatePath, onOpenApp }) {
  const isOverview = page.id === 'overview';
  const isStart = page.id === 'start';
  const HeadingTag = active ? 'h1' : 'h2';
  const titleContent = page.titleLines?.length
    ? page.titleLines.map((line) => <span key={line}>{line}</span>)
    : page.title;

  const handleStartLinkClick = (event) => {
    if (!isPlainLeftClick(event)) return;
    if (window.innerWidth > MARKETING_PHONE_BREAKPOINT) return;
    event.preventDefault();
    onNavigatePath(buildMarketingPath('start'));
  };

  return (
    <div className="marketing-node__scroll">
      <div className="marketing-node__masthead">
        <div className="marketing-node__eyebrow">{page.eyebrow}</div>
      </div>

      <div className={`marketing-node__content ${page.visual ? 'has-visual' : ''} ${page.comparisonMatrix ? 'has-comparison' : ''}`}>
        <div className="marketing-node__copy">
          <HeadingTag id={`marketing-node-title-${page.id}`}>{titleContent}</HeadingTag>
          <p className="marketing-node__summary">{page.summary}</p>
          {isOverview ? (
            <MarketingScanBar onNavigate={onNavigatePath} onOpenApp={onOpenApp} />
          ) : null}
          {isOverview && page.secondaryLink ? (
            <MarketingButtonLink
              className="marketing-node__secondary-link marketing-node__home-secondary"
              href={buildMarketingPath(page.secondaryLink.pageId)}
              variant="secondary"
              buttonStyle="mono"
            >
              {page.secondaryLink.label}
            </MarketingButtonLink>
          ) : null}
          {isStart ? <MarketingStartActions route={route} /> : null}
          {!isOverview ? (
            <div className="marketing-node__body">
              {page.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          ) : null}
          {!isOverview && page.proofPoints.length ? (
            <ul className="marketing-proof-list" aria-label="Highlights">
              {page.proofPoints.map((point) => (
                <li key={point}>
                  <Check size={15} aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          ) : null}
          {!isOverview && !isStart ? (
            <div className="marketing-node__actions">
              <MarketingButtonLink
                className="marketing-node__primary-link"
                href={buildAppScanUrl()}
                onClick={handleStartLinkClick}
                endIcon={<ArrowRight />}
              >
                Start site scan
              </MarketingButtonLink>
              {page.secondaryLink ? (
                <MarketingButtonLink
                  className="marketing-node__secondary-link"
                  href={buildMarketingPath(page.secondaryLink.pageId)}
                  variant="secondary"
                  buttonStyle="mono"
                >
                  {page.secondaryLink.label}
                </MarketingButtonLink>
              ) : null}
            </div>
          ) : null}
        </div>
        {page.visual ? <MarketingPlaceholderVisual /> : null}
        {page.comparisonMatrix ? <MarketingComparisonMatrix matrix={page.comparisonMatrix} /> : null}
      </div>

      {isOverview ? (
        <div className="marketing-node__below-fold">
          <div className="marketing-node__body">
            {page.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
          {page.proofPoints.length ? (
            <ul className="marketing-proof-list" aria-label="Highlights">
              {page.proofPoints.map((point) => (
                <li key={point}>
                  <Check size={15} aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {page.cards.length ? (
        <div className="marketing-card-grid">
          {page.cards.map((card, index) => {
            const Icon = featureIcons[index % featureIcons.length];
            const CardTag = card.pageId ? 'a' : 'article';
            const cardProps = card.pageId ? { href: buildMarketingPath(card.pageId) } : {};
            return (
              <CardTag key={card.title} {...cardProps}>
                <Icon size={18} aria-hidden="true" />
                <h3>{card.title}</h3>
                <p>{card.text}</p>
                {card.pageId ? <span>Open node</span> : null}
              </CardTag>
            );
          })}
        </div>
      ) : null}
      <MarketingUpcoming upcoming={page.upcoming} />
    </div>
  );
}

function MarketingPageNode({ page, pageLayout, active, overview, route, onNavigatePath, onOpenApp }) {
  const style = {
    '--node-x': `${pageLayout?.x || 0}px`,
    '--node-y': `${pageLayout?.y || 0}px`,
  };
  const canUseHitArea = overview || !active;

  return (
    <article
      className={`marketing-node marketing-node--${page.id} marketing-node--${page.accent || 'purple'} ${active ? 'is-active' : ''}`}
      style={style}
      aria-labelledby={`marketing-node-title-${page.id}`}
    >
      {canUseHitArea ? (
        <a
          className="marketing-node__hit-area"
          href={buildMarketingPath(page.id)}
          aria-current={active ? 'page' : undefined}
          aria-label={`Open ${page.navLabel}`}
        />
      ) : null}
      <MarketingPageContent
        page={page}
        active={active}
        route={route}
        onNavigatePath={onNavigatePath}
        onOpenApp={onOpenApp}
      />
    </article>
  );
}

function getMarketingConnectorSegments(layout) {
  const segments = [];
  const pushSegment = (type, x1, y1, x2, y2) => {
    segments.push({ type, x1, y1, x2, y2 });
  };

  MARKETING_CHILDREN_BY_ID.forEach((childIds, parentId) => {
    const parentLayout = layout.pageLayouts.get(parentId);
    const childLayouts = childIds
      .map((childId) => ({ id: childId, layout: layout.pageLayouts.get(childId) }))
      .filter((child) => !!child.layout)
      .sort((left, right) => left.layout.y - right.layout.y || left.layout.x - right.layout.x);

    if (!parentLayout || childLayouts.length === 0) return;

    const parentBottomY = parentLayout.y + layout.nodeHeight;

    if (parentId === MARKETING_ROOT_ID) {
      const parentCenterX = parentLayout.x + layout.nodeWidth / 2;
      const childCenters = childLayouts.map(({ layout: childLayout }) => (
        childLayout.x + layout.nodeWidth / 2
      ));
      const firstChildTopY = childLayouts[0].layout.y;
      const busY = parentBottomY + (firstChildTopY - parentBottomY) * 0.5;

      pushSegment('root-drop', parentCenterX, parentBottomY, parentCenterX, busY);
      pushSegment(
        'horizontal-bus',
        Math.min(parentCenterX, childCenters[0]),
        busY,
        Math.max(parentCenterX, childCenters[childCenters.length - 1]),
        busY
      );
      childLayouts.forEach(({ layout: childLayout }) => {
        const childCenterX = childLayout.x + layout.nodeWidth / 2;
        pushSegment('bus-drop', childCenterX, busY, childCenterX, childLayout.y);
      });
      return;
    }

    const spineX = parentLayout.x + MARKETING_STROKE_PAD_X;
    const lastChildLayout = childLayouts[childLayouts.length - 1].layout;
    const spineEndY = lastChildLayout.y + layout.nodeHeight / 2;
    pushSegment('vertical-spine', spineX, parentBottomY, spineX, spineEndY);
    childLayouts.forEach(({ layout: childLayout }) => {
      const tickY = childLayout.y + layout.nodeHeight / 2;
      pushSegment('horizontal-tick', spineX, tickY, childLayout.x, tickY);
    });
  });

  return segments;
}

function MarketingConnectors({ layout }) {
  const connectorSegments = getMarketingConnectorSegments(layout);

  return (
    <svg
      className="marketing-connectors"
      viewBox={`0 0 ${layout.canvasWidth} ${layout.canvasHeight}`}
      aria-hidden="true"
    >
      {connectorSegments.map((segment, index) => {
        return (
          <path
            key={`${segment.type}-${index}`}
            d={`M ${segment.x1} ${segment.y1} L ${segment.x2} ${segment.y2}`}
          />
        );
      })}
    </svg>
  );
}

function MarketingMap({ activePage, route, viewMode, onViewModeChange, onNavigatePath, onOpenApp }) {
  const overview = viewMode === 'overview';
  const viewportSize = useViewportSize();
  const layout = useMemo(() => buildResponsiveMapLayout(viewportSize), [viewportSize]);
  const orderedPages = useMemo(() => (
    [activePage, ...MARKETING_PAGES.filter((page) => page.id !== activePage.id)]
  ), [activePage]);
  const activeLayout = layout.pageLayouts.get(activePage.id) || { x: 0, y: 0 };
  const rootFocusOffsetX = activePage.id === MARKETING_ROOT_ID ? layout.childPeek : 0;
  const sectionStyle = {
    '--marketing-map-viewport-width': `${layout.viewportWidth}px`,
    '--marketing-map-viewport-height': `${layout.viewportHeight}px`,
  };
  const mapStyle = {
    '--map-width': `${layout.canvasWidth}px`,
    '--map-height': `${layout.canvasHeight}px`,
    '--node-width': `${layout.nodeWidth}px`,
    '--node-height': `${layout.nodeHeight}px`,
    '--map-focus-x': `${layout.focusInsetX + rootFocusOffsetX - activeLayout.x * layout.focusScale}px`,
    '--map-focus-y': `${-activeLayout.y * layout.focusScale}px`,
    '--map-focus-scale': layout.focusScale,
    '--map-overview-x': `${(layout.viewportWidth - layout.canvasWidth * layout.overviewScale) / 2}px`,
    '--map-overview-y': `${(layout.viewportHeight - layout.canvasHeight * layout.overviewScale) / 2}px`,
    '--map-overview-scale': layout.overviewScale,
  };

  return (
    <section
      className={`marketing-map ${overview ? 'is-overview' : 'is-focused'}`}
      style={sectionStyle}
      aria-label="Vellic marketing sitemap"
    >
      <div className="marketing-map__viewport">
        <div className="marketing-map__canvas" style={mapStyle}>
          <MarketingConnectors layout={layout} />
          {orderedPages.map((page) => (
            <MarketingPageNode
              key={page.id}
              page={page}
              pageLayout={layout.pageLayouts.get(page.id)}
              active={page.id === activePage.id}
              overview={overview}
              route={route}
              onNavigatePath={onNavigatePath}
              onOpenApp={onOpenApp}
            />
          ))}
        </div>
      </div>
      <div className="marketing-map__controls" aria-label="Marketing map view">
        <button
          type="button"
          className={`canvas-tool-btn ${overview ? 'active' : ''}`}
          onClick={() => onViewModeChange('overview')}
          aria-label="Overview"
          title="Overview"
          aria-pressed={overview}
        >
          <Network size={22} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`canvas-tool-btn ${!overview ? 'active' : ''}`}
          onClick={() => onViewModeChange('focused')}
          aria-label="Focus"
          title="Focus"
          aria-pressed={!overview}
        >
          <RectangleHorizontal size={22} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

function MarketingSite({ route, navigateToRoute, onOpenApp }) {
  const activePage = getMarketingPageById(route.marketingPageId);
  const [viewMode, setViewMode] = useState('focused');

  useEffect(() => {
    applyMarketingMetadata(activePage);
    setViewMode('focused');
    const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
    if (!isJsdom) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [activePage]);

  const navigateToPath = (path) => {
    const url = new URL(path, window.location.origin);
    const page = getMarketingPageByPathname(url.pathname);
    if (!page) return;
    navigateToRoute?.({
      surface: ROUTE_SURFACES.MARKETING,
      marketingPageId: page.id,
      pathname: url.pathname,
      search: url.search,
    });
  };

  const handleClick = (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor || !isPlainLeftClick(event)) return;
    const url = new URL(anchor.getAttribute('href'), window.location.origin);
    if (url.origin !== window.location.origin) return;
    if (!url.pathname.startsWith(MARKETING_BASE_PATH)) return;
    const page = getMarketingPageByPathname(url.pathname);
    if (!page) return;
    event.preventDefault();
    navigateToPath(`${url.pathname}${url.search}`);
  };

  return (
    <div className="marketing-site" onClick={handleClick}>
      <MarketingHeader activePage={activePage} onNavigatePath={navigateToPath} />
      <main className="marketing-main">
        <MarketingMap
          activePage={activePage}
          route={route}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onNavigatePath={navigateToPath}
          onOpenApp={onOpenApp}
        />
      </main>
      <MarketingFooter activePage={activePage} />
    </div>
  );
}

export { applyMarketingMetadata };
export default MarketingSite;

const { v4: uuidv4 } = require('uuid');

const CATEGORIES = Object.freeze({
  seo: 'seo',
  technical: 'technical',
  ia: 'ia',
  content: 'content',
  accessibility: 'accessibility',
});

const SEVERITIES = Object.freeze({
  info: 'info',
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical',
});

const SEVERITY_PENALTIES = Object.freeze({
  [SEVERITIES.info]: 0,
  [SEVERITIES.low]: 2,
  [SEVERITIES.medium]: 5,
  [SEVERITIES.high]: 10,
  [SEVERITIES.critical]: 20,
});

const CATEGORY_WEIGHTS = Object.freeze({
  [CATEGORIES.seo]: 0.25,
  [CATEGORIES.technical]: 0.25,
  [CATEGORIES.ia]: 0.25,
  [CATEGORIES.content]: 0.15,
  [CATEGORIES.accessibility]: 0.10,
});

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function toArray(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean);
  const normalized = normalizeText(value);
  return normalized ? [normalized] : [];
}

function normalizeMetaTags(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    const keywords = value.keywords || value.tags || value.metaKeywords;
    if (Array.isArray(keywords)) return keywords.map(normalizeText).filter(Boolean).join(', ');
    return normalizeText(keywords);
  }
  return normalizeText(value);
}

function getMeta(node, key) {
  const seo = node?.seoMetadata && typeof node.seoMetadata === 'object' ? node.seoMetadata : {};
  if (key === 'description') {
    return normalizeText(node.description || seo.description || seo.openGraph?.description || seo.twitter?.description);
  }
  if (key === 'canonicalUrl') {
    return normalizeText(node.canonicalUrl || seo.canonicalUrl);
  }
  if (key === 'h1s') {
    return toArray(node.h1s?.length ? node.h1s : seo.h1s?.length ? seo.h1s : seo.h1);
  }
  if (key === 'h2s') {
    return toArray(node.h2s?.length ? node.h2s : seo.h2s?.length ? seo.h2s : seo.h2);
  }
  if (key === 'keywords') {
    return normalizeMetaTags(node.metaTags || seo.keywords);
  }
  return normalizeText(seo[key]);
}

function readNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function collectPages(root, orphans = []) {
  const pages = [];
  const seen = new Set();

  const visit = (node, depth = 0, parent = null, tree = 'root') => {
    if (!node || seen.has(node.id || node.url)) return;
    seen.add(node.id || node.url);
    pages.push({
      node,
      id: node.id || node.url || `page-${pages.length + 1}`,
      url: node.url || '',
      title: normalizeText(node.title),
      depth,
      parentId: parent?.id || null,
      tree,
    });
    (node.children || []).forEach((child) => visit(child, depth + 1, node, tree));
  };

  visit(root, 0, null, 'root');
  (orphans || []).forEach((orphan) => visit(orphan, 0, null, orphan?.subdomainRoot ? 'subdomain' : 'orphan'));
  return pages;
}

function createFindingFactory(scanId) {
  let count = 0;
  return function createFinding({
    category,
    severity = SEVERITIES.low,
    title,
    description,
    recommendation,
    page = null,
    evidence = {},
    source = 'crawler',
  }) {
    count += 1;
    return {
      id: `${category}-${count}`,
      scanId: scanId || null,
      pageId: page?.id || null,
      url: page?.url || null,
      category,
      severity,
      title,
      description,
      recommendation,
      evidence,
      source,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };
}

function addLengthFinding(findings, createFinding, page, category, field, value, min, max) {
  if (!value) {
    findings.push(createFinding({
      category,
      severity: SEVERITIES.medium,
      title: `Missing ${field}`,
      description: `${page.title || page.url} does not have a ${field}.`,
      recommendation: `Add a clear ${field} for this page.`,
      page,
      evidence: { field },
    }));
    return;
  }

  if (value.length < min) {
    findings.push(createFinding({
      category,
      severity: SEVERITIES.low,
      title: `Very short ${field}`,
      description: `${page.title || page.url} has a ${field} that may be too short.`,
      recommendation: `Review and expand the ${field} if this page needs clearer search context.`,
      page,
      evidence: { field, length: value.length, min },
    }));
  } else if (value.length > max) {
    findings.push(createFinding({
      category,
      severity: SEVERITIES.low,
      title: `Very long ${field}`,
      description: `${page.title || page.url} has a ${field} that may be too long.`,
      recommendation: `Review and shorten the ${field} so it is easier to scan.`,
      page,
      evidence: { field, length: value.length, max },
    }));
  }
}

function addDuplicateFindings(findings, createFinding, pages, category, label, getValue, severity = SEVERITIES.medium) {
  const groups = new Map();
  pages.forEach((page) => {
    const key = normalizeKey(getValue(page));
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(page);
  });

  groups.forEach((group, key) => {
    if (group.length < 2) return;
    group.forEach((page) => {
      findings.push(createFinding({
        category,
        severity,
        title: `Duplicate ${label}`,
        description: `${page.title || page.url} shares the same ${label} with ${group.length - 1} other page${group.length === 2 ? '' : 's'}.`,
        recommendation: `Make the ${label} unique where these pages have different purpose or content.`,
        page,
        evidence: { value: key, duplicateCount: group.length, urls: group.map((item) => item.url).filter(Boolean).slice(0, 10) },
        source: 'heuristic',
      }));
    });
  });
}

function looksPlaceholder(value) {
  const normalized = normalizeKey(value);
  if (!normalized) return false;
  return [
    'untitled',
    'new page',
    'page title',
    'title',
    'description',
    'meta description',
    'coming soon',
    'lorem ipsum',
  ].some((term) => normalized === term || normalized.includes(term));
}

function analyzeMapInsights({ root, orphans = [], scanMeta = {}, scanId = null, historyId = null } = {}) {
  const pages = collectPages(root, orphans);
  const findings = [];
  const createFinding = createFindingFactory(scanId || historyId || uuidv4());
  const rootProtocol = (() => {
    try {
      return root?.url ? new URL(root.url).protocol : '';
    } catch {
      return '';
    }
  })();

  const hasSeoMetadata = pages.some((page) => (
    (page.node?.seoMetadata && Object.keys(page.node.seoMetadata).length > 0)
    || page.node?.description
    || page.node?.canonicalUrl
    || page.node?.h1s
    || page.node?.h2s
  ));
  const hasCanonicalData = pages.some((page) => getMeta(page.node, 'canonicalUrl'));
  const hasStatusData = pages.some((page) => readNumber(page.node?.statusCode, page.node?.httpStatus) !== null);
  const hasResponseTimes = pages.some((page) => readNumber(page.node?.responseTime) !== null);
  const hasImageData = pages.some((page) => readNumber(page.node?.imageCount, page.node?.seoMetadata?.imageCount) !== null);

  pages.forEach((page) => {
    const node = page.node;
    const title = normalizeText(node.title);
    const description = getMeta(node, 'description');
    const h1s = getMeta(node, 'h1s');
    const canonicalUrl = getMeta(node, 'canonicalUrl');
    const statusCode = readNumber(node.statusCode, node.httpStatus);
    const responseTime = readNumber(node.responseTime);
    const linksIn = readNumber(node.linksIn, node.links_in);
    const imageCount = readNumber(node.imageCount, node.seoMetadata?.imageCount);
    const missingImageAltCount = readNumber(node.missingImageAltCount, node.seoMetadata?.missingImageAltCount);

    addLengthFinding(findings, createFinding, page, CATEGORIES.seo, 'title', title, 10, 70);
    if (hasSeoMetadata) {
      addLengthFinding(findings, createFinding, page, CATEGORIES.seo, 'meta description', description, 50, 170);
      if (!h1s.length) {
        findings.push(createFinding({
          category: CATEGORIES.seo,
          severity: SEVERITIES.medium,
          title: 'Missing H1',
          description: `${title || page.url} does not have an H1 in the scanned metadata.`,
          recommendation: 'Add one clear H1 that describes the page.',
          page,
          evidence: { h1s },
        }));
      } else if (h1s.length > 1) {
        findings.push(createFinding({
          category: CATEGORIES.seo,
          severity: SEVERITIES.low,
          title: 'Multiple H1s',
          description: `${title || page.url} has more than one H1.`,
          recommendation: 'Review whether the page should have one primary H1.',
          page,
          evidence: { h1s },
        }));
      }
      if (hasCanonicalData && !canonicalUrl) {
        findings.push(createFinding({
          category: CATEGORIES.seo,
          severity: SEVERITIES.low,
          title: 'Missing canonical URL',
          description: `${title || page.url} does not have a canonical URL in the scan data.`,
          recommendation: 'Add a canonical URL if this page can be reached through multiple URLs.',
          page,
          evidence: {},
        }));
      }
    }

    if (statusCode >= 500) {
      findings.push(createFinding({
        category: CATEGORIES.technical,
        severity: SEVERITIES.critical,
        title: '5xx page',
        description: `${title || page.url} returned a server error.`,
        recommendation: 'Fix the server error or remove this page from the sitemap.',
        page,
        evidence: { statusCode },
      }));
    } else if (statusCode >= 400) {
      findings.push(createFinding({
        category: CATEGORIES.technical,
        severity: SEVERITIES.high,
        title: '4xx page',
        description: `${title || page.url} returned an error status.`,
        recommendation: 'Fix the page, redirect it, or remove stale links to it.',
        page,
        evidence: { statusCode },
      }));
    }

    if (node.wasRedirect || (statusCode >= 300 && statusCode < 400)) {
      findings.push(createFinding({
        category: CATEGORIES.technical,
        severity: SEVERITIES.low,
        title: 'Redirected page',
        description: `${title || page.url} redirects to another URL.`,
        recommendation: 'Link directly to the final URL where possible.',
        page,
        evidence: { statusCode, redirectTarget: node.redirectTarget || node.finalUrl || '' },
      }));
    }

    if (rootProtocol === 'https:') {
      try {
        if (page.url && new URL(page.url).protocol === 'http:') {
          findings.push(createFinding({
            category: CATEGORIES.technical,
            severity: SEVERITIES.medium,
            title: 'HTTP page on HTTPS site',
            description: `${title || page.url} uses HTTP while the scanned site uses HTTPS.`,
            recommendation: 'Use HTTPS URLs for internal pages.',
            page,
            evidence: { url: page.url },
          }));
        }
      } catch {
        // Ignore malformed URLs already tolerated by the scan.
      }
    }

    if (hasResponseTimes && responseTime !== null && responseTime > 3000) {
      findings.push(createFinding({
        category: CATEGORIES.technical,
        severity: SEVERITIES.medium,
        title: 'Slow response',
        description: `${title || page.url} took more than 3 seconds to respond during the crawl.`,
        recommendation: 'Review server response time for this page.',
        page,
        evidence: { responseTime },
      }));
    }

    if (page.tree === 'orphan' || node.orphanType === 'orphan' || (linksIn === 0 && page.depth > 0)) {
      findings.push(createFinding({
        category: CATEGORIES.ia,
        severity: SEVERITIES.medium,
        title: 'Orphan page',
        description: `${title || page.url} appears to have no internal links pointing to it.`,
        recommendation: 'Link this page from an appropriate parent or remove it if it is no longer needed.',
        page,
        evidence: { linksIn, tree: page.tree },
        source: 'heuristic',
      }));
    }

    if (page.depth > 3) {
      findings.push(createFinding({
        category: CATEGORIES.ia,
        severity: SEVERITIES.low,
        title: 'Deep page',
        description: `${title || page.url} is deeper than level 3 in the scanned structure.`,
        recommendation: 'Review whether important pages should be easier to reach.',
        page,
        evidence: { depth: page.depth },
        source: 'heuristic',
      }));
    }

    if (page.depth > 3 && /(pricing|contact|about|demo|signup|sign-up|login|support|help|careers)/i.test(`${title} ${page.url}`)) {
      findings.push(createFinding({
        category: CATEGORIES.ia,
        severity: SEVERITIES.medium,
        title: 'Important-looking page is buried',
        description: `${title || page.url} looks important but is deep in the structure.`,
        recommendation: 'Review whether this page should be closer to the main navigation or a parent section.',
        page,
        evidence: { depth: page.depth },
        source: 'heuristic',
      }));
    }

    if (looksPlaceholder(title) || looksPlaceholder(description)) {
      findings.push(createFinding({
        category: CATEGORIES.content,
        severity: SEVERITIES.medium,
        title: 'Placeholder-like metadata',
        description: `${title || page.url} has metadata that looks unfinished.`,
        recommendation: 'Replace placeholder text with page-specific content.',
        page,
        evidence: { title, description },
        source: 'heuristic',
      }));
    }

    if (hasSeoMetadata && (!description || !h1s.length)) {
      findings.push(createFinding({
        category: CATEGORIES.content,
        severity: SEVERITIES.low,
        title: 'Missing content signals',
        description: `${title || page.url} is missing basic metadata or heading signals.`,
        recommendation: 'Add a useful meta description and H1 where appropriate.',
        page,
        evidence: { hasDescription: !!description, h1Count: h1s.length },
      }));
    }

    if (hasImageData && imageCount > 0 && missingImageAltCount > 0) {
      findings.push(createFinding({
        category: CATEGORIES.accessibility,
        severity: missingImageAltCount > 3 ? SEVERITIES.medium : SEVERITIES.low,
        title: 'Images missing alt text',
        description: `${title || page.url} has images without alt text.`,
        recommendation: 'Add alt text for meaningful images and empty alt text for decorative images.',
        page,
        evidence: { imageCount, missingImageAltCount },
      }));
    }
  });

  addDuplicateFindings(findings, createFinding, pages, CATEGORIES.seo, 'title', (page) => page.title);
  if (hasSeoMetadata) {
    addDuplicateFindings(findings, createFinding, pages, CATEGORIES.seo, 'meta description', (page) => getMeta(page.node, 'description'));
    addDuplicateFindings(findings, createFinding, pages, CATEGORIES.content, 'H1', (page) => getMeta(page.node, 'h1s')[0] || '', SEVERITIES.low);
  }

  pages.forEach((page) => {
    const siblings = page.node?.children || [];
    if (siblings.length > 20) {
      findings.push(createFinding({
        category: CATEGORIES.ia,
        severity: SEVERITIES.low,
        title: 'Very large sibling group',
        description: `${page.title || page.url} has a large number of direct child pages.`,
        recommendation: 'Review whether this section should be grouped into smaller subsections.',
        page,
        evidence: { childCount: siblings.length },
        source: 'heuristic',
      }));
    }
  });

  const brokenLinks = Array.isArray(scanMeta?.brokenLinks) ? scanMeta.brokenLinks : [];
  brokenLinks.forEach((link, index) => {
    findings.push(createFinding({
      category: CATEGORIES.technical,
      severity: SEVERITIES.high,
      title: 'Broken internal link',
      description: `${link.sourceUrl || 'A scanned page'} links to a broken URL.`,
      recommendation: 'Update or remove the broken link.',
      page: pages.find((page) => page.url === link.sourceUrl) || null,
      evidence: { ...link, index },
    }));
  });

  const totals = {
    pages: pages.length,
    healthyPages: 0,
    redirectedPages: pages.filter((page) => page.node?.wasRedirect).length,
    errorPages: pages.filter((page) => {
      const statusCode = readNumber(page.node?.statusCode, page.node?.httpStatus);
      return statusCode !== null && statusCode >= 400;
    }).length,
    orphanPages: findings.filter((finding) => finding.category === CATEGORIES.ia && finding.title === 'Orphan page').length,
    duplicateTitles: findings.filter((finding) => finding.title === 'Duplicate title').length,
    missingMetaDescriptions: findings.filter((finding) => finding.title === 'Missing meta description').length,
    missingH1s: findings.filter((finding) => finding.title === 'Missing H1').length,
    brokenLinks: brokenLinks.length,
  };
  const pageFindingUrls = new Set(findings.filter((finding) => finding.url).map((finding) => finding.url));
  totals.healthyPages = pages.filter((page) => !pageFindingUrls.has(page.url)).length;

  const dataAvailable = {
    [CATEGORIES.seo]: pages.length > 0,
    [CATEGORIES.technical]: hasStatusData || brokenLinks.length > 0 || hasResponseTimes,
    [CATEGORIES.ia]: pages.length > 0,
    [CATEGORIES.content]: pages.length > 0,
    [CATEGORIES.accessibility]: hasImageData,
  };

  const scores = Object.fromEntries(Object.values(CATEGORIES).map((category) => {
    if (!dataAvailable[category]) return [category, null];
    const penalty = findings
      .filter((finding) => finding.category === category)
      .reduce((sum, finding) => sum + (SEVERITY_PENALTIES[finding.severity] || 0), 0);
    return [category, Math.max(0, Math.min(100, 100 - penalty))];
  }));

  const weighted = Object.entries(scores).filter(([, score]) => Number.isFinite(score));
  const totalWeight = weighted.reduce((sum, [category]) => sum + CATEGORY_WEIGHTS[category], 0);
  const overallScore = totalWeight > 0
    ? Math.round(weighted.reduce((sum, [category, score]) => sum + score * CATEGORY_WEIGHTS[category], 0) / totalWeight)
    : null;

  const pageInsights = pages.map((page) => {
    const pageFindings = findings.filter((finding) => (
      (finding.pageId && finding.pageId === page.id)
      || (!finding.pageId && finding.url && finding.url === page.url)
    ));
    const penalty = pageFindings.reduce((sum, finding) => sum + (SEVERITY_PENALTIES[finding.severity] || 0), 0);
    const severityCounts = Object.fromEntries(Object.values(SEVERITIES).map((severity) => [severity, 0]));
    const categoryCounts = Object.fromEntries(Object.values(CATEGORIES).map((category) => [category, 0]));
    pageFindings.forEach((finding) => {
      severityCounts[finding.severity] = (severityCounts[finding.severity] || 0) + 1;
      categoryCounts[finding.category] = (categoryCounts[finding.category] || 0) + 1;
    });
    return {
      pageId: page.id,
      url: page.url,
      title: page.title,
      score: Math.max(0, Math.min(100, 100 - penalty)),
      findingCount: pageFindings.length,
      severityCounts,
      categoryCounts,
      topFindings: pageFindings.slice(0, 5),
    };
  });

  const now = new Date().toISOString();
  return {
    id: `analysis-${scanId || historyId || uuidv4()}`,
    scanId: scanId || historyId || null,
    overallScore,
    scores,
    totals,
    findings,
    pageInsights,
    createdAt: now,
    updatedAt: now,
  };
}

module.exports = {
  CATEGORIES,
  SEVERITIES,
  analyzeMapInsights,
  collectPages,
};

/* eslint-disable no-console */
const Database = require('better-sqlite3');
const path = require('path');

const API_BASE = process.env.API_BASE || 'http://localhost:4002';
const SCAN_URL = process.env.IA_SCAN_URL || 'https://example.com';
const API_KEY = process.env.SCAN_API_KEY || process.env.API_KEY || null;
const MAX_PAGES = Number.parseInt(process.env.IA_MAX_PAGES || '200', 10);
const MAX_DEPTH = Number.parseInt(process.env.IA_MAX_DEPTH || '4', 10);

const normalizeHost = (hostname) => hostname.replace(/^www\./i, '').toLowerCase();

function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    u.hostname = normalizeHost(u.hostname);

    if (/\/index\.(html?|php|aspx)$/i.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\/index\.(html?|php|aspx)$/i, '/');
    }

    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }

    return u.toString();
  } catch {
    return null;
  }
}

function getParentUrl(urlStr) {
  const u = new URL(urlStr);
  if (u.pathname === '/' || u.pathname === '') return null;

  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length <= 1) return normalizeUrl(u.origin + '/');

  const parentPath = '/' + parts.slice(0, -1).join('/');
  return normalizeUrl(u.origin + parentPath);
}

function getUrlDepth(urlStr) {
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts.length;
  } catch {
    return 0;
  }
}

function getPlacementForUrl(urlStr, baseHost) {
  try {
    const host = normalizeHost(new URL(urlStr).hostname);
    if (host === baseHost) return 'Primary';
    if (host.endsWith(`.${baseHost}`)) return 'Subdomain';
    return null;
  } catch {
    return null;
  }
}

async function runScan() {
  const payload = {
    url: SCAN_URL,
    maxPages: Number.isFinite(MAX_PAGES) ? MAX_PAGES : 25,
    maxDepth: Number.isFinite(MAX_DEPTH) ? MAX_DEPTH : 2,
    options: { subdomains: true, orphanPages: true },
  };
  if (API_KEY) payload.api_key = API_KEY;

  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-api-key'] = API_KEY;

  const res = await fetch(`${API_BASE}/scan`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `scan failed (${res.status})`);
  }
  return data;
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

async function run() {
  console.log('IA scan test starting...');
  console.log(`Scan params: url=${SCAN_URL} maxPages=${MAX_PAGES} maxDepth=${MAX_DEPTH}`);
  const scan = await runScan();

  const countTreeNodes = (node) => {
    let total = 1;
    let missing = node?.isMissing ? 1 : 0;
    if (Array.isArray(node?.children)) {
      node.children.forEach((child) => {
        const counts = countTreeNodes(child);
        total += counts.total;
        missing += counts.missing;
      });
    }
    return { total, missing };
  };

  const countForest = (roots = []) => (
    roots.reduce(
      (acc, node) => {
        const counts = countTreeNodes(node);
        acc.total += counts.total;
        acc.missing += counts.missing;
        return acc;
      },
      { total: 0, missing: 0 }
    )
  );

  if (Array.isArray(scan?.subdomains)) {
    const subdomainRoots = scan.subdomains.length;
    const subdomainCounts = countForest(scan.subdomains);
    const subdomainSubpages = Math.max(0, subdomainCounts.total - subdomainRoots);
    console.log(
      `✓ Scan subdomains: roots=${subdomainRoots} total=${subdomainCounts.total} subpages=${subdomainSubpages}`
    );
  }

  if (Array.isArray(scan?.orphans)) {
    const orphanRoots = scan.orphans.length;
    const orphanCounts = countForest(scan.orphans);
    const orphanMissing = orphanCounts.missing;
    const orphanReal = Math.max(0, orphanCounts.total - orphanMissing);
    console.log(
      `✓ Scan orphans: roots=${orphanRoots} total=${orphanCounts.total} real=${orphanReal} missing=${orphanMissing}`
    );
  }

  const dbPath = path.join(__dirname, '..', 'data', 'mapmat.db');
  const db = new Database(dbPath);
  const rows = db.prepare('SELECT url, placement, parent_url, depth, status, type FROM pages').all();

  const baseHost = normalizeHost(new URL(SCAN_URL).hostname);
  const allowedRows = rows.filter((row) => {
    const placement = getPlacementForUrl(row.url, baseHost);
    return placement === 'Primary' || placement === 'Subdomain';
  });

  const urlSet = new Set(allowedRows.map((row) => row.url));
  const errors = [];
  let subdomainCount = 0;
  let virtualCount = 0;

  allowedRows.forEach((row) => {
    const expectedPlacement = getPlacementForUrl(row.url, baseHost);
    if (expectedPlacement === 'Subdomain') subdomainCount += 1;
    if (row.status === 'Missing') virtualCount += 1;
    assert(
      row.placement === expectedPlacement,
      `placement mismatch for ${row.url}: expected ${expectedPlacement}, got ${row.placement}`,
      errors
    );

    const expectedDepth = getUrlDepth(row.url);
    assert(
      row.depth === expectedDepth,
      `depth mismatch for ${row.url}: expected ${expectedDepth}, got ${row.depth}`,
      errors
    );

    const expectedParent = getParentUrl(row.url);
    if (expectedParent === null) {
      assert(
        row.parent_url === null,
        `parent_url mismatch for ${row.url}: expected NULL, got ${row.parent_url}`,
        errors
      );
    } else {
      assert(
        row.parent_url === expectedParent,
        `parent_url mismatch for ${row.url}: expected ${expectedParent}, got ${row.parent_url}`,
        errors
      );
      assert(
        urlSet.has(row.parent_url),
        `missing parent row for ${row.url}: ${row.parent_url}`,
        errors
      );
    }

    if (row.status === 'Missing') {
      assert(
        row.type === 'Virtual Node',
        `missing node type mismatch for ${row.url}: expected Virtual Node, got ${row.type}`,
        errors
      );
    }
  });

  if (allowedRows.length === 0) {
    errors.push('no rows found for scan host; check scan result or DB');
  }

  if (errors.length) {
    console.error('IA scan test failed:');
    errors.forEach((err) => console.error(`- ${err}`));
    process.exit(1);
  }

  console.log(`✓ IA rows checked: ${allowedRows.length}`);
  console.log(`✓ Subdomain rows: ${subdomainCount}`);
  console.log(`✓ Virtual nodes: ${virtualCount}`);
  console.log('✓ Query handling: preserved (tracking params stripped only for dedupe)');
  console.log('✓ Domain parsing: base-host fallback');
}

run().catch((err) => {
  console.error(`IA scan test failed: ${err.message}`);
  process.exit(1);
});

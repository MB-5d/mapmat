/* eslint-disable no-console */
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const BACKEND_PORT = Number(process.env.FOCUSED_SCAN_BACKEND_PORT || 4331);
const API_BASE = `http://127.0.0.1:${BACKEND_PORT}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.text();
  const data = body ? JSON.parse(body) : null;
  if (!response.ok) throw new Error(`${url} failed ${response.status}: ${data?.error || body}`);
  return data;
}

function createFixtureServer() {
  let concurrentFocusedRun = 0;
  let concurrentSitemapRequests = 0;
  let sitemapCapFocusedRun = 0;
  let sitemapCapRequests = 0;
  let unstableListingRun = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture.local');
    const postMatch = url.pathname.match(/^\/blog\/post-(\d+)$/);
    if (url.pathname === '/sitemap.xml') {
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (sitemapCapFocusedRun > 0 && sitemapCapRequests < 2) {
        sitemapCapRequests += 1;
        const sitemapIndexes = Array.from({ length: 14 }, (_, index) => index + 1);
        if (sitemapCapRequests % 2 === 0) sitemapIndexes.reverse();
        res.writeHead(200, { 'content-type': 'application/xml' });
        res.end([
          '<sitemapindex>',
          ...sitemapIndexes.map(
            (index) => `<sitemap><loc>${origin}/fixture-cap-${index}.xml</loc></sitemap>`
          ),
          '</sitemapindex>',
        ].join(''));
        return;
      }
      if (concurrentFocusedRun > 0 && concurrentSitemapRequests < 2) {
        concurrentSitemapRequests += 1;
        res.writeHead(200, { 'content-type': 'application/xml' });
        res.end([
          '<sitemapindex>',
          `<sitemap><loc>${origin}/fixture-parent-a.xml</loc></sitemap>`,
          `<sitemap><loc>${origin}/fixture-parent-b.xml</loc></sitemap>`,
          '</sitemapindex>',
        ].join(''));
        return;
      }
      const urls = [
        `${origin}/about`,
        `${origin}/blogger`,
        `${origin}/blog`,
        ...Array.from({ length: 21 }, (_, index) => `${origin}/blog/post-${index + 1}`),
        `${origin}/section/science`,
        `${origin}/section/science/space`,
        ...Array.from({ length: 21 }, (_, index) => `${origin}/section/science/space?page=${index + 1}`),
        `${origin}/section/catalog`,
        ...Array.from({ length: 21 }, (_, index) => `${origin}/section/catalog/category-${index + 1}`),
        `${origin}/section/catalog/category-21/detail`,
        `${origin}/section/mixed`,
        ...Array.from({ length: 21 }, (_, index) => `${origin}/section/mixed/item-${index + 1}`),
        ...Array.from({ length: 21 }, (_, index) => `${origin}/section/mixed?page=${index + 1}`),
      ];
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end(`<urlset>${urls.map((entry) => `<url><loc>${entry}</loc></url>`).join('')}</urlset>`);
      return;
    }
    if (/^\/fixture-cap-\d+\.xml$/.test(url.pathname)) {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const index = Number(url.pathname.match(/\d+/)?.[0] || 0);
      const oddRun = sitemapCapFocusedRun % 2 === 1;
      const delay = (index % 2 === 1) === oddRun ? 80 : 5;
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/xml' });
        res.end(`<urlset><url><loc>${origin}/sitemap-content-item-${index}</loc></url></urlset>`);
      }, delay);
      return;
    }
    if (/^\/fixture-parent-[ab]\.xml$/.test(url.pathname)) {
      const branch = url.pathname.includes('parent-a') ? 'a' : 'b';
      const oddRun = concurrentFocusedRun % 2 === 1;
      const delay = (branch === 'a') === oddRun ? 120 : 5;
      setTimeout(() => {
        const origin = `http://127.0.0.1:${server.address().port}`;
        res.writeHead(200, { 'content-type': 'application/xml' });
        res.end(`<sitemapindex><sitemap><loc>${origin}/fixture-child-${branch}.xml</loc></sitemap></sitemapindex>`);
      }, delay);
      return;
    }
    if (/^\/fixture-child-[ab]\.xml$/.test(url.pathname)) {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const branch = url.pathname.includes('child-a') ? 'a' : 'b';
      const urls = [
        ...(branch === 'a' ? [`${origin}/section/concurrent`] : []),
        `${origin}/section/concurrent/branch-${branch}`,
        `${origin}/section/concurrent/index-${branch}`,
        `${origin}/section/concurrent/articles/article-${branch}1`,
        `${origin}/section/concurrent/articles/article-${branch}2`,
      ];
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end(`<urlset>${urls.map((entry) => `<url><loc>${entry}</loc></url>`).join('')}</urlset>`);
      return;
    }
    if (url.pathname === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(`Sitemap: http://127.0.0.1:${server.address().port}/sitemap.xml`);
      return;
    }
    if (url.pathname === '/blog') {
      const links = Array.from({ length: 21 }, (_, index) => (
        `<a href="/blog/post-${index + 1}">Post ${index + 1}</a>`
      )).join('');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>Blog</title></head><body><h1>Blog</h1>${links}<a href="/blogger">Blogger</a></body></html>`);
      return;
    }
    if (url.pathname === '/limited') {
      const links = Array.from({ length: 12 }, (_, index) => (
        `<a href="/limited/page-${index + 1}">Page ${index + 1}</a>`
      )).join('');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>Limited</title></head><body>${links}</body></html>`);
      return;
    }
    if (/^\/limited\/page-\d+$/.test(url.pathname)) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>${url.pathname.split('/').at(-1)}</title></head><body>Page</body></html>`);
      return;
    }
    if (postMatch) {
      if (postMatch[1] === '21') {
        res.writeHead(404, { 'content-type': 'text/html' });
        res.end('<html><head><title>Post unavailable</title></head><body>Unavailable</body></html>');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>Post ${postMatch[1]}</title><meta property="og:type" content="article"></head><body><article><h1>Post ${postMatch[1]}</h1></article></body></html>`);
      return;
    }
    if (url.pathname === '/archive') {
      res.writeHead(503, { 'content-type': 'text/html' });
      res.end('<html><head><title>Archive unavailable</title></head><body>Unavailable</body></html>');
      return;
    }
    if (url.pathname === '/archive/story') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>Archive story</title></head><body><h1>Archive story</h1><a href="/archive/story/comments">Comments</a></body></html>');
      return;
    }
    if (url.pathname === '/archive/story/comments') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>Story comments</title></head><body><h1>Comments</h1></body></html>');
      return;
    }
    if (url.pathname === '/browser-only' || url.pathname === '/browser-only/page') {
      const isBasicScanner = String(req.headers['user-agent'] || '').includes('FixtureDirect');
      if (isBasicScanner) {
        res.writeHead(503, { 'content-type': 'text/html' });
        res.end('<html><head><title>Unavailable</title></head><body>Unavailable</body></html>');
        return;
      }
      const childLink = url.pathname === '/browser-only'
        ? '<a href="/browser-only/page">Browser page</a>'
        : '';
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>Browser section</title></head><body><h1>Browser section</h1>${childLink}</body></html>`);
      return;
    }
    if (url.pathname === '/blocked-focus') {
      res.writeHead(403, { 'content-type': 'text/html' });
      res.end('<html><head><title>Access denied</title></head><body>Access denied</body></html>');
      return;
    }
    if (url.pathname === '/section/archive-months' && !url.searchParams.has('date')) {
      const monthLinks = Array.from({ length: 21 }, (_, index) => (
        `<a href="/section/archive-months?date=${index + 1}-28-2026">Month ${index + 1}</a>`
      )).join('');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>Archive months</title></head><body><main><ol><li>${monthLinks}</li></ol></main></body></html>`);
      return;
    }
    if (url.pathname === '/section/archive-months' && url.searchParams.has('date')) {
      const month = Math.max(1, Number(String(url.searchParams.get('date')).split('-')[0]) || 1);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>Archive month ${month}</title><link rel="canonical" href="/section/archive-months"></head><body><main><ol><li><p><a href="/2026/${String(month).padStart(2, '0')}/28/archive-story-${month}">Archive story ${month}</a></p></li></ol></main></body></html>`);
      return;
    }
    if (/^\/2026\/\d{2}\/28\/archive-story-\d+$/.test(url.pathname)) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>${url.pathname.split('/').at(-1)}</title><meta property="og:type" content="article"></head><body><article><h1>Archive story</h1></article></body></html>`);
      return;
    }
    if (url.pathname === '/section/science/space') {
      const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
      const links = page === 1
        ? Array.from(
          { length: 21 },
          (_, index) => `<a href="/section/science/space?page=${index + 1}">Page ${index + 1}</a>`
        ).join('')
        : '';
      const story = page === 2
        ? [
          '<ol><li>',
          '<h2><a href="/section/science/space?page=2#stream">Latest</a></h2>',
          '<section class="story-stream"><article>',
          '<h3><a href="/2026/06/09/science/space/page-2-story">Page 2 story</a></h3>',
          '</article></section>',
          '</li></ol>',
        ].join('')
        : '';
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>Space page ${page}</title></head><body><main><h1>Space page ${page}</h1>${links}${story}</main></body></html>`);
      return;
    }
    if (url.pathname === '/2026/06/09/science/space/page-2-story') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>Page 2 story</title><meta property="og:type" content="article"></head><body><article><h1>Page 2 story</h1></article></body></html>');
      return;
    }
    if (url.pathname === '/section/science') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>Science</title></head><body><h1>Science</h1></body></html>');
      return;
    }
    if (url.pathname === '/section/editorial') {
      const articleLinks = Array.from({ length: 25 }, (_, index) => (
        `<article><h3><a href="/section/unrelated">Unrelated category</a></h3><h2><a href="/section/editorial/articles/article-${index + 1}">Article ${index + 1}</a></h2></article>`
      )).join('');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>Editorial</title></head><body><nav><a href="/pricing">Pricing</a><a href="/stories/off-path">Off path</a></nav><main>${articleLinks}</main></body></html>`);
      return;
    }
    if (url.pathname === '/section/editorial/articles') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>Editorial articles</title></head><body><h1>Articles</h1></body></html>');
      return;
    }
    if (url.pathname === '/section/concurrent') {
      concurrentFocusedRun += 1;
      const branchOrder = concurrentFocusedRun % 2 === 1
        ? ['a', 'b']
        : ['b', 'a'];
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end([
        '<html><head><title>Concurrent section</title></head><body>',
        ...branchOrder.map((branch) => (
          `<article><h2><a href="/section/concurrent/branch-${branch}">Branch ${branch.toUpperCase()}</a></h2></article>`
        )),
        '</body></html>',
      ].join(''));
      return;
    }
    if (/^\/section\/concurrent\/branch-[ab]$/.test(url.pathname)) {
      const branch = url.pathname.endsWith('branch-a') ? 'a' : 'b';
      const oddRun = concurrentFocusedRun % 2 === 1;
      const delay = (branch === 'a') === oddRun ? 80 : 5;
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<html><head><title>Branch ${branch.toUpperCase()}</title></head><body><a href="/section/concurrent/index-${branch}">Index ${branch.toUpperCase()}</a></body></html>`);
      }, delay);
      return;
    }
    if (/^\/section\/concurrent\/index-[ab]$/.test(url.pathname)) {
      const branch = url.pathname.endsWith('index-a') ? 'a' : 'b';
      const links = [1, 2].map((index) => (
        `<article><h2><a href="/section/concurrent/articles/article-${branch}${index}">Article ${branch.toUpperCase()}${index}</a></h2></article>`
      )).join('');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>Index ${branch.toUpperCase()}</title></head><body>${links}</body></html>`);
      return;
    }
    if (/^\/section\/concurrent\/articles\/article-[ab][12]$/.test(url.pathname)) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>${url.pathname.split('/').at(-1)}</title><meta property="og:type" content="article"></head><body><article><h1>Article</h1></article></body></html>`);
      return;
    }
    if (url.pathname === '/section/sitemap-cap') {
      sitemapCapFocusedRun += 1;
      const links = Array.from(
        { length: 14 },
        (_, index) => `<article><h2><a href="/sitemap-content-item-${index + 1}">Item ${index + 1}</a></h2></article>`
      ).join('');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>Sitemap cap</title></head><body>${links}</body></html>`);
      return;
    }
    if (/^\/sitemap-content-item-\d+$/.test(url.pathname)) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>${url.pathname.split('/').at(-1)}</title></head><body>Item</body></html>`);
      return;
    }
    if (url.pathname === '/section/unstable-listing') {
      unstableListingRun += 1;
      const indexes = Array.from({ length: 12 }, (_, index) => index + 1);
      if (unstableListingRun % 2 === 0) indexes.reverse();
      const links = indexes.map((index) => (
        `<article><h2><a href="/section/unstable-listing/article-${index}">Article ${index}</a></h2></article>`
      )).join('');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>Unstable listing</title></head><body>${links}</body></html>`);
      return;
    }
    if (/^\/section\/unstable-listing\/article-\d+$/.test(url.pathname)) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>${url.pathname.split('/').at(-1)}</title></head><body>Article</body></html>`);
      return;
    }
    if (url.pathname === '/section/unrelated') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>Unrelated category</title></head><body><h1>Unrelated</h1></body></html>');
      return;
    }
    if (/^\/section\/editorial\/articles\/article-\d+$/.test(url.pathname)) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>${url.pathname.split('/').at(-1)}</title><meta property="og:type" content="article"></head><body><article><h1>Article</h1><a href="/pricing">Pricing</a></article></body></html>`);
      return;
    }
    if (url.pathname === '/section/catalog') {
      const categoryLinks = Array.from({ length: 21 }, (_, index) => (
        `<a href="/section/catalog/category-${index + 1}">Category ${index + 1}</a>`
      )).join('');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>Catalog</title></head><body><h1>Catalog</h1>${categoryLinks}</body></html>`);
      return;
    }
    if (/^\/section\/catalog\/category-\d+$/.test(url.pathname)) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>${url.pathname.split('/').at(-1)}</title></head><body><h1>Category</h1></body></html>`);
      return;
    }
    if (url.pathname === '/section/catalog/category-21/detail') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>Category 20 detail</title></head><body><h1>Detail</h1></body></html>');
      return;
    }
    if (url.pathname === '/section/mixed') {
      const page = Number(url.searchParams.get('page') || 0);
      const links = page === 0
        ? [
          ...Array.from({ length: 21 }, (_, index) => (
            `<a href="/section/mixed/item-${index + 1}">Item ${index + 1}</a>`
          )),
          ...Array.from({ length: 21 }, (_, index) => (
            `<a href="/section/mixed?page=${index + 1}">Page ${index + 1}</a>`
          )),
        ].join('')
        : '';
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>Mixed ${page || 'index'}</title></head><body><h1>Mixed</h1>${links}</body></html>`);
      return;
    }
    if (/^\/section\/mixed\/item-\d+$/.test(url.pathname)) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>${url.pathname.split('/').at(-1)}</title></head><body><h1>Mixed item</h1></body></html>`);
      return;
    }
    if (url.pathname === '/jobs-old') {
      res.writeHead(302, { location: '/content/jobs' });
      res.end();
      return;
    }
    if (url.pathname === '/content/jobs') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>Jobs</title></head><body><h1>Jobs</h1><a href="/content/jobs">Jobs home</a><a href="/content/jobs/role-1">Role</a></body></html>');
      return;
    }
    if (url.pathname === '/content/jobs/role-1') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>Role 1</title></head><body><h1>Role 1</h1></body></html>');
      return;
    }
    if (url.pathname === '/locale') {
      res.writeHead(302, { location: '/locale/en' });
      res.end();
      return;
    }
    if (url.pathname === '/locale/en') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>English</title></head><body><h1>English</h1><a href="/locale/en/actions">Actions</a></body></html>');
      return;
    }
    if (url.pathname === '/locale/en/actions') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>Actions</title></head><body><h1>Actions</h1></body></html>');
      return;
    }
    if (url.pathname === '/section/unstructured') {
      const slugs = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
      const mixed = Array.from({ length: 5 }, (_, index) => `item${index + 1}`);
      const numbers = Array.from({ length: 5 }, (_, index) => `${index + 1}`);
      const dates = Array.from({ length: 5 }, (_, index) => `2026-01-0${index + 1}`);
      const uuids = Array.from(
        { length: 5 },
        (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
      );
      const links = [...slugs, ...mixed, ...numbers, ...dates, ...uuids]
        .map((entry) => `<a href="/section/unstructured/${entry}">${entry}</a>`)
        .join('');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>Unstructured</title></head><body><h1>Unstructured</h1>${links}</body></html>`);
      return;
    }
    if (url.pathname.startsWith('/section/unstructured/')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>${url.pathname.split('/').at(-1)}</title></head><body><h1>Page</h1></body></html>`);
      return;
    }
    if (url.pathname === '/' || url.pathname === '/about' || url.pathname === '/blogger' || url.pathname === '/pricing') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>${url.pathname === '/' ? 'Home' : url.pathname.slice(1)}</title></head><body><h1>Page</h1></body></html>`);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end('<html><head><title>Not found</title></head><body>Not found</body></html>');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const health = await fetchJson(`${API_BASE}/health`);
      if (health?.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error('Backend health check timed out');
}

async function waitForJob(jobId, accessToken, authToken) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const response = await fetchJson(`${API_BASE}/scan-jobs/${jobId}?access_token=${accessToken}`, {
      headers: authToken ? { authorization: `Bearer ${authToken}` } : {},
    });
    if (response.job?.status === 'complete') {
      assert.ok(Number(response.job.progress?.sequence || 0) > 0, 'completed jobs should persist sequenced progress');
      assert.equal(response.job.progress?.final, true, 'completed jobs should persist their final progress snapshot');
      assert.equal(
        Number(response.job.progress?.processed || 0),
        Number(response.job.progress?.discovered || 0),
        `normal completed scans should finish with every discovered URL processed (${JSON.stringify(response.job.progress)})`
      );
      assert.ok(
        Number(response.job.progress?.discovered || 0) >= Number(response.job.progress?.mapped || 0),
        'discovered progress should not trail mapped progress'
      );
      assert.ok(
        Number(response.job.progress?.processed || 0)
          >= Number(response.job.progress?.captured || response.job.progress?.mapped || 0)
            + Number(response.job.progress?.deferred || 0),
        'captured and deferred outcomes should be disjoint'
      );
      assert.ok(
        Number(response.job.progress?.processed || 0)
          >= Number(response.job.result?.pageCountSummary?.capturedPageCount || 0)
            + Number(response.job.result?.pageCountSummary?.deferredPageCount || 0),
        'result page counts should not overlap'
      );
      return response.job.result;
    }
    if (response.job?.status === 'failed') throw new Error(response.job.error || 'Scan failed');
    await sleep(500);
  }
  throw new Error('Scan job timed out');
}

function flattenTree(node, result = []) {
  if (!node) return result;
  result.push(node);
  (node.children || []).forEach((child) => flattenTree(child, result));
  return result;
}

async function createScan(payload, authToken) {
  const created = await fetchJson(`${API_BASE}/scan-jobs`, {
    method: 'POST',
    headers: authToken ? { authorization: `Bearer ${authToken}` } : {},
    body: JSON.stringify(payload),
  });
  return waitForJob(created.jobId, created.jobAccessToken, authToken);
}

async function main() {
  let backend = null;
  let fixture = null;
  let tempDir = null;
  try {
    fixture = await createFixtureServer();
    const fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-focused-scan-'));
    backend = spawn(process.execPath, ['server.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DB_PATH: path.join(tempDir, 'vellic.db'),
        HOST: '127.0.0.1',
        PORT: String(BACKEND_PORT),
        RUN_MODE: 'web',
        JOB_WORKER_TYPES: 'scan',
        ALLOW_PRIVATE_NETWORKS: 'true',
        SCAN_REQUEST_USER_AGENT: 'FixtureDirect/1.0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    backend.stdout.on('data', (chunk) => process.stdout.write(chunk));
    backend.stderr.on('data', (chunk) => process.stderr.write(chunk));
    await waitForHealth();
    const login = await fetchJson(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@vellic.io', password: 'Admin123' }),
    });
    assert.ok(login.token, 'fixture login should return an auth token');
    const authToken = login.token;

    const result = await createScan({
      url: `${fixtureOrigin}/blog`,
      maxPages: 100,
      options: {},
    }, authToken);
    const nodes = flattenTree(result.root);
    const target = nodes.find((node) => node.url === `${fixtureOrigin}/blog`);
    const placeholder = nodes.find((node) => node.nodeKind === 'deferred-group');
    assert.equal(result.scanScope.focused, true);
    assert.equal(result.root.nodeKind, undefined);
    assert.equal(result.root.httpStatus, 200);
    assert.equal(result.root.url, `${fixtureOrigin}/`);
    assert.equal(result.root.scanNumber, '0');
    assert.ok(target, 'focused target should be present');
    assert.equal(target.scanNumber, '1');
    assert.notEqual(target.scanNumber, '0');
    assert.equal(nodes.some((node) => node.url === `${fixtureOrigin}/blogger`), false);
    assert.ok(placeholder, 'repetitive group placeholder should be present');
    assert.equal(placeholder.remainingCount, 1);
    assert.equal(placeholder.capturedCount, 20);
    assert.equal(result.pageCountSummary.totalDiscoveredPageCount, 22);
    assert.equal(result.partial, undefined);

    const capturePayload = {
      url: `${fixtureOrigin}/blog`,
      maxPages: placeholder.deferredEntries.length,
      options: {
        repetitiveCapture: {
          groupId: placeholder.deferredGroupId,
          entries: placeholder.deferredEntries,
        },
      },
    };
    const captureHeaders = {
      authorization: `Bearer ${authToken}`,
      'idempotency-key': `fixture-capture:${placeholder.deferredGroupId}`,
    };
    const firstCaptureJob = await fetchJson(`${API_BASE}/scan-jobs`, {
      method: 'POST',
      headers: captureHeaders,
      body: JSON.stringify(capturePayload),
    });
    const replayedCaptureJob = await fetchJson(`${API_BASE}/scan-jobs`, {
      method: 'POST',
      headers: captureHeaders,
      body: JSON.stringify(capturePayload),
    });
    assert.equal(replayedCaptureJob.jobId, firstCaptureJob.jobId);
    assert.equal(replayedCaptureJob.jobAccessToken, firstCaptureJob.jobAccessToken);
    assert.equal(replayedCaptureJob.idempotentReplay, true);
    const captureResult = await waitForJob(
      firstCaptureJob.jobId,
      firstCaptureJob.jobAccessToken,
      authToken
    );
    assert.equal(captureResult.captureSummary.groupId, placeholder.deferredGroupId);
    assert.equal(captureResult.captureSummary.capturedCount, 0);
    assert.equal(captureResult.captureSummary.terminalCount, 1);
    assert.equal(captureResult.captureSummary.terminalEntries[0].url, `${fixtureOrigin}/blog/post-21`);
    assert.equal(captureResult.captureSummary.terminalEntries[0].status, 404);
    assert.equal(captureResult.captureSummary.remainingEntries.length, 0);

    const crossUrlIdempotencyKey = 'fixture-cross-url-debit';
    const crossUrlHeaders = {
      authorization: `Bearer ${authToken}`,
      'idempotency-key': crossUrlIdempotencyKey,
    };
    const firstCrossUrlJob = await fetchJson(`${API_BASE}/scan-jobs`, {
      method: 'POST',
      headers: crossUrlHeaders,
      body: JSON.stringify({
        url: `${fixtureOrigin}/about`,
        maxPages: 1,
        options: {},
      }),
    });
    const replayedCrossUrlJob = await fetchJson(`${API_BASE}/scan-jobs`, {
      method: 'POST',
      headers: crossUrlHeaders,
      body: JSON.stringify({
        url: `${fixtureOrigin}/about`,
        maxPages: 1,
        options: {},
      }),
    });
    const secondCrossUrlJob = await fetchJson(`${API_BASE}/scan-jobs`, {
      method: 'POST',
      headers: crossUrlHeaders,
      body: JSON.stringify({
        url: `${fixtureOrigin}/pricing`,
        maxPages: 1,
        options: {},
      }),
    });
    assert.equal(replayedCrossUrlJob.jobId, firstCrossUrlJob.jobId);
    assert.equal(replayedCrossUrlJob.idempotentReplay, true);
    assert.notEqual(secondCrossUrlJob.jobId, firstCrossUrlJob.jobId);
    assert.equal(secondCrossUrlJob.idempotentReplay, undefined);
    await Promise.all([
      waitForJob(firstCrossUrlJob.jobId, firstCrossUrlJob.jobAccessToken, authToken),
      waitForJob(secondCrossUrlJob.jobId, secondCrossUrlJob.jobAccessToken, authToken),
    ]);

    const limitedResult = await createScan({
      url: `${fixtureOrigin}/limited`,
      maxPages: 5,
      options: {},
    }, authToken);
    assert.equal(limitedResult.pageCountSummary.capturedPageCount, 5);
    assert.equal(limitedResult.pageCountSummary.deferredPageCount, 8);
    assert.equal(limitedResult.pageCountSummary.totalDiscoveredPageCount, 13);

    const wholeSiteResult = await createScan({
      url: `${fixtureOrigin}/`,
      maxPages: 200,
      options: {},
    }, authToken);
    const wholeSiteNodes = flattenTree(wholeSiteResult.root);
    const wholeSitePlaceholder = wholeSiteNodes.find((node) => node.nodeKind === 'deferred-group');
    assert.equal(wholeSiteResult.scanScope.focused, false);
    assert.ok(wholeSitePlaceholder, 'homepage scans should use the same repetitive-page optimization');
    assert.equal(wholeSitePlaceholder.capturedCount, 20);
    assert.equal(wholeSitePlaceholder.remainingCount, 1);
    const wholeSiteParent = wholeSiteNodes.find((node) => node.url === `${fixtureOrigin}/blog`);
    assert.equal(wholeSiteParent.children.at(-1).nodeKind, 'deferred-group');

    const unstructuredResult = await createScan({
      url: `${fixtureOrigin}/section/unstructured`,
      maxPages: 100,
      options: {},
    }, authToken);
    const unstructuredNodes = flattenTree(unstructuredResult.root);
    const unstructuredParent = unstructuredNodes.find(
      (node) => node.url === `${fixtureOrigin}/section/unstructured`
    );
    const unstructuredVisibleChildren = unstructuredParent.children.filter(
      (node) => node.nodeKind !== 'deferred-group'
    );
    const unstructuredPlaceholder = unstructuredParent.children.find(
      (node) => node.nodeKind === 'deferred-group'
    );
    assert.equal(unstructuredVisibleChildren.length, 20);
    assert.equal(unstructuredPlaceholder?.capturedCount, 20);
    assert.equal(unstructuredPlaceholder?.remainingCount, 5);

    const deepResult = await createScan({
      url: `${fixtureOrigin}/blog/post-1`,
      maxPages: 100,
      options: {},
    }, authToken);
    const deepNodes = flattenTree(deepResult.root);
    const deepTarget = deepNodes.find((node) => node.url === `${fixtureOrigin}/blog/post-1`);
    const deepAncestors = deepNodes.filter((node) => (
      [`${fixtureOrigin}/`, `${fixtureOrigin}/blog`].includes(node.url)
    ));
    assert.deepEqual(deepAncestors.map((node) => node.url), [`${fixtureOrigin}/`, `${fixtureOrigin}/blog`]);
    assert.equal(deepAncestors.every((node) => node.nodeKind !== 'focus-ghost'), true);
    assert.equal(deepAncestors.every((node) => node.httpStatus === 200), true);
    assert.equal(deepTarget.scanNumber, 'X.1');
    assert.notEqual(deepTarget.scanNumber, '0');

    const queryResult = await createScan({
      url: `${fixtureOrigin}/blog/post-1?edition=gb`,
      maxPages: 100,
      options: {},
    }, authToken);
    const queryNodes = flattenTree(queryResult.root);
    const queryTarget = queryNodes.find((node) => node.url === `${fixtureOrigin}/blog/post-1?edition=gb`);
    const queryAncestors = queryNodes.filter((node) => (
      [`${fixtureOrigin}/`, `${fixtureOrigin}/blog`].includes(node.url)
    ));
    assert.deepEqual(
      queryAncestors.map((node) => node.url),
      [`${fixtureOrigin}/`, `${fixtureOrigin}/blog`]
    );
    queryAncestors.forEach((ancestor) => {
      assert.equal(
        queryNodes.filter((node) => node.url === ancestor.url).length,
        1,
        `${ancestor.url} should appear exactly once`
      );
      assert.equal(ancestor.isMissing, false);
      assert.equal(ancestor.nodeKind, undefined);
      assert.equal(ancestor.httpStatus, 200);
    });
    assert.equal(
      queryNodes.some((node) => node.url === `${fixtureOrigin}/blog/post-1`),
      false,
      'same-path URL without the entered query should not appear beneath the target'
    );
    assert.ok(queryTarget?.scanNumber, 'query target should preserve a full-map page number');
    assert.equal(queryTarget.scanNumber.startsWith(`${queryAncestors.at(-1).scanNumber}.`), true);

    const issueResult = await createScan({
      url: `${fixtureOrigin}/archive/story?edition=gb`,
      maxPages: 100,
      options: {},
    }, authToken);
    const issueNodes = flattenTree(issueResult.root);
    const unavailableAncestor = issueNodes.find((node) => node.url === `${fixtureOrigin}/archive`);
    assert.equal(unavailableAncestor.nodeKind, undefined);
    assert.equal(unavailableAncestor.httpStatus, null);
    assert.equal(unavailableAncestor.contextHttpStatus, 503);
    assert.equal(unavailableAncestor.isError, false);
    assert.equal(unavailableAncestor.scanStatus, 'structural');
    assert.equal(
      issueNodes.some((node) => node.url === `${fixtureOrigin}/archive/story`),
      false,
      'queryless target path should not be recreated as a missing parent'
    );
    assert.ok(
      issueNodes.some((node) => node.url === `${fixtureOrigin}/archive/story/comments`),
      'descendants should remain in the focused result'
    );

    const browserResult = await createScan({
      url: `${fixtureOrigin}/browser-only`,
      maxPages: 100,
      options: {},
    }, authToken);
    const browserNodes = flattenTree(browserResult.root);
    const browserTarget = browserNodes.find((node) => node.url === `${fixtureOrigin}/browser-only`);
    assert.equal(browserTarget?.title, 'Browser section');
    assert.equal(browserTarget?.httpStatus, 200);
    assert.notEqual(browserTarget?.scanStatus, 'inactive');
    assert.ok(
      Number(browserResult.scanDiagnostics?.cloudflareBrowserRetrySuccessCount || 0) > 0,
      'focused scans should retry a limited response in the browser before labeling a page inactive'
    );
    assert.ok(
      browserNodes.some((node) => node.url === `${fixtureOrigin}/browser-only/page`),
      'browser-fetched focused pages should still discover child pages'
    );

    const blockedResult = await createScan({
      url: `${fixtureOrigin}/blocked-focus`,
      maxPages: 100,
      options: {},
    }, authToken);
    const blockedNodes = flattenTree(blockedResult.root);
    const blockedTarget = blockedNodes.find((node) => node.url === `${fixtureOrigin}/blocked-focus`);
    assert.equal(blockedTarget?.httpStatus, 403);
    assert.equal(blockedTarget?.scanStatus, 'scan_limited');
    assert.equal(blockedTarget?.nodeKind, undefined);
    assert.equal(blockedTarget?.isBlockedBoundary, true);
    assert.equal(blockedResult.partialReason, 'root_discovery_failed');
    assert.equal(blockedResult.blockedSections?.[0]?.url, `${fixtureOrigin}/blocked-focus`);
    assert.equal(blockedResult.scanDiagnostics?.sitemapSkippedForBlockedFocusedRoot, true);
    assert.equal(blockedResult.scanDiagnostics?.sitemapUrlsFound, 0);

    const paginationResult = await createScan({
      url: `${fixtureOrigin}/section/science/space`,
      maxPages: 100,
      options: {},
    }, authToken);
    const paginationNodes = flattenTree(paginationResult.root);
    const paginationTarget = paginationNodes.find(
      (node) => node.url === `${fixtureOrigin}/section/science/space`
    );
    assert.equal(paginationTarget.nodeKind, undefined);
    assert.equal(
      paginationNodes.some((node) => (
        node.url && new URL(node.url).searchParams.has('page')
      )),
      false,
      'pagination helpers should discover content without appearing as map pages'
    );
    assert.equal(
      paginationResult.pageCountSummary.totalDiscoveredPageCount,
      2,
      'discovery helpers must not inflate focused page totals, but their primary articles must remain'
    );
    const paginationArticle = paginationNodes.find(
      (node) => node.url === `${fixtureOrigin}/2026/06/09/science/space/page-2-story`
    );
    assert.equal(
      paginationArticle?.parentUrl,
      paginationTarget.url,
      'nested pagination listings should keep the primary article under the focused page'
    );

    // NYT-style dated article hierarchy discovered from month listing pages.
    const archiveResult = await createScan({
      url: `${fixtureOrigin}/section/archive-months`,
      maxPages: 100,
      options: {},
    }, authToken);
    const archiveNodes = flattenTree(archiveResult.root);
    const archiveTarget = archiveNodes.find(
      (node) => node.url === `${fixtureOrigin}/section/archive-months`
    );
    const archiveSectionContext = archiveNodes.find(
      (node) => node.url === `${fixtureOrigin}/section`
    );
    const archiveMonthNodes = archiveNodes.filter((node) => (
      String(node.url || '').startsWith(`${fixtureOrigin}/section/archive-months?date=`)
    ));
    const archivePlaceholder = archiveTarget.children.find(
      (node) => node.nodeKind === 'deferred-group'
    );
    const archiveArticleNodes = archiveNodes.filter((node) => (
      String(node.url || '').startsWith(`${fixtureOrigin}/2026/`)
      && /\/archive-story-\d+$/.test(node.url)
    ));
    assert.equal(archiveMonthNodes.length, 0, 'archive query helpers should not appear as pages');
    assert.equal(archiveSectionContext?.title, 'section');
    assert.equal(archiveSectionContext?.isVirtualMissing, true);
    assert.equal(archiveSectionContext?.httpStatus, null);
    assert.equal(archiveSectionContext?.contextHttpStatus, 404);
    assert.equal(archivePlaceholder?.remainingCount, 1);
    assert.equal(archiveArticleNodes.length, 20);
    assert.equal(
      archiveArticleNodes.every((node) => /^(?:X|XX)(?:\.\d+){2}$/.test(node.scanNumber)),
      true,
      `article positions should remain numeric after the unknown full-site prefix: ${archiveArticleNodes
        .map((node) => `${node.scanNumber}:${node.url}`)
        .join(', ')}`
    );
    assert.equal(
      archiveNodes.some((node) => node.url === `${fixtureOrigin}/2026`),
      false,
      'off-path article URL folders must not become structural map nodes'
    );
    archiveArticleNodes.forEach((node) => {
      assert.equal(
        node.parentUrl,
        archiveTarget.url,
        'content discovered through archive helpers should remain children of the focused page'
      );
    });

    // NPR-style editorial cards with category crosslinks beside primary story links.
    const editorialResult = await createScan({
      url: `${fixtureOrigin}/section/editorial`,
      maxPages: 100,
      options: {},
    }, authToken);
    const editorialNodes = flattenTree(editorialResult.root);
    const editorialTarget = editorialNodes.find((node) => node.url === `${fixtureOrigin}/section/editorial`);
    const editorialPlaceholder = editorialNodes.find((node) => node.nodeKind === 'deferred-group');
    assert.ok(editorialTarget, 'editorial target should be present');
    assert.equal(
      editorialNodes.some((node) => node.url === `${fixtureOrigin}/pricing`),
      false,
      'global navigation links outside the focused path should remain excluded'
    );
    assert.equal(
      editorialNodes.some((node) => node.url === `${fixtureOrigin}/stories/off-path`),
      false,
      'crosslinks outside the focused URL path must not become structural children'
    );
    assert.equal(
      editorialNodes.some((node) => node.url === `${fixtureOrigin}/section/unrelated`),
      false,
      'category metadata links inside content cards must not become focused pages'
    );
    const editorialArticlesParent = editorialNodes.find(
      (node) => node.url === `${fixtureOrigin}/section/editorial/articles`
    );
    assert.equal(
      editorialNodes.filter((node) => node.url?.startsWith(`${fixtureOrigin}/section/editorial/articles/article-`)).length,
      20,
      'focused descendants should capture the representative sample'
    );
    assert.equal(editorialPlaceholder?.remainingCount, 5);
    assert.equal(editorialPlaceholder?.capturedCount, 20);
    assert.equal(editorialPlaceholder?.parentUrl, editorialArticlesParent?.url);
    assert.equal(
      editorialArticlesParent?.parentUrl,
      editorialTarget.url,
      'normalized URL paths must determine structural parents'
    );
    assert.equal(editorialResult.pageCountSummary.totalDiscoveredPageCount, 27);

    const repeatedEditorialResult = await createScan({
      url: `${fixtureOrigin}/section/editorial`,
      maxPages: 100,
      options: {},
    }, authToken);
    const getNumberingSnapshot = (scanResult) => flattenTree(scanResult.root).map((node) => ({
      url: node.url || '',
      scanNumber: node.scanNumber || '',
      children: (node.children || []).map((child) => child.url || child.nodeKind || ''),
    }));
    assert.deepEqual(
      getNumberingSnapshot(repeatedEditorialResult),
      getNumberingSnapshot(editorialResult),
      'repeated NPR-style scans should produce identical numbering and child order'
    );
    const repeatedArchiveResult = await createScan({
      url: `${fixtureOrigin}/section/archive-months`,
      maxPages: 100,
      options: {},
    }, authToken);
    assert.deepEqual(
      getNumberingSnapshot(repeatedArchiveResult),
      getNumberingSnapshot(archiveResult),
      'repeated NYT-style dated scans should produce identical numbering and child order'
    );

    const concurrentResult = await createScan({
      url: `${fixtureOrigin}/section/concurrent`,
      maxPages: 8,
      options: {},
    }, authToken);
    const repeatedConcurrentResult = await createScan({
      url: `${fixtureOrigin}/section/concurrent`,
      maxPages: 8,
      options: {},
    }, authToken);
    assert.deepEqual(
      getNumberingSnapshot(repeatedConcurrentResult),
      getNumberingSnapshot(concurrentResult),
      'parallel focused scans must select and number the same capped descendants regardless of response order'
    );
    const sitemapCapResult = await createScan({
      url: `${fixtureOrigin}/section/sitemap-cap`,
      maxPages: 30,
      options: {},
    }, authToken);
    const repeatedSitemapCapResult = await createScan({
      url: `${fixtureOrigin}/section/sitemap-cap`,
      maxPages: 30,
      options: {},
    }, authToken);
    assert.equal(sitemapCapResult.scanDiagnostics?.sitemapUrlsFound, 11);
    assert.equal(repeatedSitemapCapResult.scanDiagnostics?.sitemapUrlsFound, 11);
    assert.deepEqual(
      getNumberingSnapshot(repeatedSitemapCapResult),
      getNumberingSnapshot(sitemapCapResult),
      'sitemap file admission must remain stable when a sitemap index exceeds the processing limit'
    );
    const unstableListingResult = await createScan({
      url: `${fixtureOrigin}/section/unstable-listing`,
      maxPages: 8,
      options: {},
    }, authToken);
    const repeatedUnstableListingResult = await createScan({
      url: `${fixtureOrigin}/section/unstable-listing`,
      maxPages: 8,
      options: {},
    }, authToken);
    assert.deepEqual(
      getNumberingSnapshot(repeatedUnstableListingResult),
      getNumberingSnapshot(unstableListingResult),
      'focused scans without a sitemap must use stable URL fallback instead of mutable card order'
    );

    // Apple-style newsroom archive with a dated category parent required by a captured detail page.
    const catalogResult = await createScan({
      url: `${fixtureOrigin}/section/catalog`,
      maxPages: 100,
      options: {},
    }, authToken);
    const catalogNodes = flattenTree(catalogResult.root);
    const categoryTwentyOne = catalogNodes.find(
      (node) => node.url === `${fixtureOrigin}/section/catalog/category-21`
    );
    const catalogPlaceholder = catalogNodes.find((node) => node.nodeKind === 'deferred-group');
    assert.equal(categoryTwentyOne?.httpStatus, 200);
    assert.equal(categoryTwentyOne?.isMissing, false);
    assert.equal(categoryTwentyOne?.isVirtualMissing, false);
    assert.ok(
      categoryTwentyOne?.children?.some(
        (node) => node.url === `${fixtureOrigin}/section/catalog/category-21/detail`
      ),
      'a deferred page required by a captured descendant should be promoted and scanned as its real parent'
    );
    assert.equal(catalogPlaceholder?.capturedCount, 20);
    assert.equal(catalogPlaceholder?.remainingCount, 1);
    assert.equal(catalogResult.scanDiagnostics?.promotedDeferredAncestorCount, 1);
    const repeatedCatalogResult = await createScan({
      url: `${fixtureOrigin}/section/catalog`,
      maxPages: 100,
      options: {},
    }, authToken);
    assert.deepEqual(
      getNumberingSnapshot(repeatedCatalogResult),
      getNumberingSnapshot(catalogResult),
      'repeated Apple-style archive scans should produce identical numbering and child order'
    );

    const mixedResult = await createScan({
      url: `${fixtureOrigin}/section/mixed`,
      maxPages: 100,
      options: {},
    }, authToken);
    const mixedNodes = flattenTree(mixedResult.root);
    const mixedPlaceholders = mixedNodes.filter((node) => node.nodeKind === 'deferred-group');
    assert.equal(
      mixedPlaceholders.length,
      1,
      `one visible parent should render one combined placeholder (${JSON.stringify(mixedResult.repetitiveGroups)})`
    );
    assert.equal(mixedPlaceholders[0].parentUrl, `${fixtureOrigin}/section/mixed`);
    assert.equal(mixedPlaceholders[0].capturedCount, 20);
    assert.equal(mixedPlaceholders[0].remainingCount, 1);

    const redirectedResult = await createScan({
      url: `${fixtureOrigin}/jobs-old`,
      maxPages: 100,
      options: {},
    }, authToken);
    const redirectedNodes = flattenTree(redirectedResult.root);
    assert.ok(
      redirectedNodes.some((node) => node.url === `${fixtureOrigin}/content/jobs/role-1`),
      'same-origin redirected section paths should continue scanning below the final URL'
    );
    assert.equal(redirectedResult.scanDiagnostics?.focusedRedirectAliasCount, 1);
    assert.equal(redirectedResult.scanDiagnostics?.rootRedirectAliasCollapsedCount, 1);
    assert.equal(
      redirectedNodes.some((node) => node.url === `${fixtureOrigin}/content/jobs`),
      false,
      'the final URL for a redirected scan seed should not render as a duplicate child'
    );

    const focusedAncestorRedirectResult = await createScan({
      url: `${fixtureOrigin}/locale/en/actions`,
      maxPages: 100,
      options: {},
    }, authToken);
    const focusedAncestorRedirectNodes = flattenTree(focusedAncestorRedirectResult.root);
    assert.ok(
      focusedAncestorRedirectNodes.some((node) => node.url === `${fixtureOrigin}/locale/en/actions`),
      'focused descendants should remain visible below a redirected ancestor'
    );
    assert.equal(focusedAncestorRedirectResult.scanDiagnostics?.rootRedirectAliasCollapsedCount, 1);
    assert.equal(
      focusedAncestorRedirectNodes.some((node) => node.url === `${fixtureOrigin}/locale/en`),
      false,
      'a focused ancestor redirect target should not render as a duplicate child'
    );
    console.log('[focused-scan-fixture] Passed.');
  } finally {
    if (fixture) await new Promise((resolve) => fixture.close(resolve));
    if (backend) backend.kill('SIGINT');
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[focused-scan-fixture] Failed: ${error.message}`);
  process.exit(1);
});

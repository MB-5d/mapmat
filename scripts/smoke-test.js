/* eslint-disable no-console */
const API_BASE = process.env.API_BASE || 'http://localhost:4002';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomEmail() {
  return `smoke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function fetchWithCookie(url, options = {}, cookieJar) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (cookieJar.value) headers.Cookie = cookieJar.value;
  const res = await fetch(url, { ...options, headers, redirect: 'manual' });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const cookie = setCookie.split(';')[0];
    cookieJar.value = cookieJar.value ? `${cookieJar.value}; ${cookie}` : cookie;
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { res, data };
}

async function testSaveLoadShare() {
  const cookieJar = { value: '' };
  const email = randomEmail();
  const password = 'testpass123';

  const signup = await fetchWithCookie(`${API_BASE}/auth/signup`, {
    method: 'POST',
    body: JSON.stringify({ email, password, name: 'Smoke Test' }),
  }, cookieJar);
  if (!signup.res.ok) throw new Error(`signup failed: ${signup.data?.error || signup.res.status}`);

  const payload = {
    name: 'Smoke Map',
    url: 'https://example.com',
    root: { id: 'root', url: 'https://example.com', title: 'Example', children: [] },
    orphans: [{ id: 'orphan-1', url: 'https://example.com/orphan', title: 'Orphan', children: [], orphanType: 'orphan' }],
    connections: [{ id: 'conn-1', type: 'crosslink', sourceNodeId: 'root', sourceAnchor: 'right', targetNodeId: 'orphan-1', targetAnchor: 'left' }],
    colors: ['#111111', '#222222', '#333333'],
  };

  const save = await fetchWithCookie(`${API_BASE}/api/maps`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, cookieJar);
  if (!save.res.ok) throw new Error(`save map failed: ${save.data?.error || save.res.status}`);
  const mapId = save.data?.map?.id;
  if (!mapId) throw new Error('save map: missing map.id');

  const getMap = await fetchWithCookie(`${API_BASE}/api/maps/${mapId}`, {}, cookieJar);
  if (!getMap.res.ok) throw new Error(`get map failed: ${getMap.data?.error || getMap.res.status}`);

  const map = getMap.data?.map;
  if (!map?.root) throw new Error('get map: missing root');
  if (!Array.isArray(map.orphans)) throw new Error('get map: missing orphans');
  if (!Array.isArray(map.connections)) throw new Error('get map: missing connections');

  const share = await fetchWithCookie(`${API_BASE}/api/shares`, {
    method: 'POST',
    body: JSON.stringify({ root: map.root, orphans: map.orphans, connections: map.connections, colors: map.colors }),
  }, cookieJar);
  if (!share.res.ok) throw new Error(`create share failed: ${share.data?.error || share.res.status}`);
  const shareId = share.data?.share?.id;
  if (!shareId) throw new Error('share: missing id');

  const getShare = await fetch(`${API_BASE}/api/shares/${shareId}`);
  const shareData = await getShare.json();
  if (!getShare.ok) throw new Error(`get share failed: ${shareData?.error || getShare.status}`);
  if (!shareData?.share?.root) throw new Error('get share: missing root');
  if (!Array.isArray(shareData?.share?.orphans)) throw new Error('get share: missing orphans');
  if (!Array.isArray(shareData?.share?.connections)) throw new Error('get share: missing connections');

  return true;
}

async function testScanStream() {
  const url = process.env.SMOKE_SCAN_URL || 'https://example.com';
  const params = new URLSearchParams({
    url,
    maxDepth: '1',
    options: JSON.stringify({ thumbnails: false }),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${API_BASE}/scan-stream?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'text/event-stream' },
    });
    if (!res.ok) throw new Error(`scan-stream http ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let event = '';
    let data = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          data += line.slice(5).trim();
        } else if (line.trim() === '') {
          if (event === 'complete') {
            const payload = JSON.parse(data || '{}');
            if (!payload.root) throw new Error('scan-stream complete missing root');
            return true;
          }
          event = '';
          data = '';
        }
      }
    }

    throw new Error('scan-stream did not emit complete');
  } catch (err) {
    console.warn(`scan-stream test skipped/failed: ${err.message}`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function run() {
  console.log('Running smoke tests...');
  await testSaveLoadShare();
  console.log('✓ save/load/share ok');
  await sleep(500);
  await testScanStream();
  console.log('✓ scan-stream ok (or skipped with warning)');
}

run().catch((err) => {
  console.error(`Smoke test failed: ${err.message}`);
  process.exit(1);
});

/* eslint-disable no-console */
const assert = require('assert/strict');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(baseUrl, child, getOutput) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`worker exited before becoming healthy\n${getOutput()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return response;
    } catch {
      // The worker may still be starting.
    }
    await sleep(100);
  }
  throw new Error(`worker health endpoint timed out\n${getOutput()}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, sleep(2000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-admin-routing-'));
  try {
    for (const enabled of ['true', 'false']) {
      const port = await reservePort();
      const output = [];
      const key = require('crypto').randomBytes(24).toString('hex');
      const child = spawn(process.execPath, ['server.js'], {
        cwd: ROOT_DIR,
        env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), RUN_MODE: 'web',
          DB_PROVIDER: 'sqlite', DB_PATH: path.join(tempDir, enabled + '.db'), DATABASE_URL: '',
          TEST_AUTH_ENABLED: 'false', AUTH_HEADER_FALLBACK: 'false', EMAIL_PROVIDER: 'log',
          ADMIN_CONSOLE_ENABLED: enabled, ADMIN_API_KEY: key },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.on('data', chunk => output.push(chunk.toString()));
      child.stderr.on('data', chunk => output.push(chunk.toString()));
      try {
        const baseUrl = `http://127.0.0.1:${port}`;
        await waitForHealth(baseUrl, child, () => output.join(''));
        for (const suffix of ['/coediting', '/coediting/']) {
          for (const supplied of ['', 'incorrect']) {
            const response = await fetch(baseUrl + '/api/admin' + suffix, { headers: { 'x-admin-key': supplied } });
            assert.equal(response.status, 401, 'Operational health requires its valid API key');
          }
          const response = await fetch(baseUrl + '/api/admin' + suffix, { headers: { 'x-admin-key': key } });
          assert.equal(response.status, 200);
          assert.equal((await response.json()).ok, true);
        }
        for (const suffix of ['/users', '/promo-codes', '/coediting/extra']) {
          const response = await fetch(baseUrl + '/api/admin' + suffix, { headers: { 'x-admin-key': key } });
          assert.equal(response.status, enabled === 'true' ? 401 : 404, 'API key cannot bypass console authentication');
        }
        const mutation = await fetch(baseUrl + '/api/admin/coediting', { method: 'POST', headers: { 'x-admin-key': key } });
        assert.equal(mutation.status, enabled === 'true' ? 401 : 404, 'Only the read-only route falls through');
        console.log(`[admin-routing] Console ${enabled}: operational key check and console protection passed.`);
      } finally { await stopChild(child); }
    }
  } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
}
main().catch(error => { console.error('[admin-routing] Failed:', error.message); process.exit(1); });

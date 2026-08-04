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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-worker-health-'));
  const port = await reservePort();
  const output = [];
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      RUN_MODE: 'worker',
      JOB_WORKER_TYPES: 'image_capture',
      DB_PROVIDER: 'sqlite',
      DB_PATH: path.join(tempDir, 'vellic.db'),
      DATABASE_URL: '',
      TEST_AUTH_ENABLED: 'false',
      AUTH_HEADER_FALLBACK: 'false',
      EMAIL_PROVIDER: 'log',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const health = await waitForHealth(baseUrl, child, () => output.join(''));
    assert.deepEqual(await health.json(), { ok: true });

    const nonHealthRoute = await fetch(`${baseUrl}/`);
    assert.equal(nonHealthRoute.status, 404);
    assert.deepEqual(await nonHealthRoute.json(), { error: 'Not found' });
    console.log('[worker-health] Passed. Worker mode exposes only the Railway health endpoint.');
  } finally {
    await stopChild(child);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[worker-health] Failed: ${error.message}`);
  process.exit(1);
});

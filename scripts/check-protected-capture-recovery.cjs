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
  for (let attempt = 0; attempt < 300; attempt += 1) {
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-capture-recovery-'));
  const dbPath = path.join(dir, 'db.sqlite');
  let child;
  const start = async (mode = 'web') => {
    const port = await reservePort();
    let output = '';
    child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT_DIR,
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), RUN_MODE: mode,
        JOB_WORKER_TYPES: mode === 'web' ? 'scan,image_capture' : 'image_capture',
        DB_PROVIDER: 'sqlite', DB_PATH: dbPath, DATABASE_URL: '',
        TEST_AUTH_ENABLED: 'false', EMAIL_PROVIDER: 'log', AUTH_HEADER_FALLBACK: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    await waitForHealth(`http://127.0.0.1:${port}`, child, () => output);
  };
  const database = () => new (require('better-sqlite3'))(dbPath);
  try {
    await start();
    let db = database();
    const insert = db.prepare('INSERT INTO jobs (id,type,status,payload,progress) VALUES (?,?,?,?,?)');
    for (const status of ['running', 'paused']) {
      insert.run('private-' + status, 'image_capture', status,
        JSON.stringify({ mapId: 'disposable', authSessionIds: ['lost-memory-session'] }),
        JSON.stringify({ saved: 1, completed: 1 }));
    }
    insert.run('public-running', 'image_capture', 'running', JSON.stringify({ mapId: 'public' }), '{}');
    insert.run('private-complete', 'image_capture', 'complete', JSON.stringify({ authSessionIds: ['old'] }), '{}');
    db.close();
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGKILL'); await exited;
    await start('worker');
    db = database();
    assert.equal(db.prepare('SELECT status FROM jobs WHERE id=?').get('private-running').status, 'running',
      'A separate worker restart must not invalidate web-owned login jobs');
    db.close(); await stopChild(child);
    db = database();
    db.prepare('INSERT INTO jobs (id,type,status,payload,progress) VALUES (?,?,?,?,?)').run('private-stopping', 'image_capture', 'stopping', JSON.stringify({authSessionIds:['lost-memory-session']}), JSON.stringify({saved:1}));
    db.close();
    await start();
    db = database();
    try {
      for (const status of ['running', 'paused', 'stopping']) {
        const row = db.prepare('SELECT status,error,progress FROM jobs WHERE id=?').get('private-' + status);
        assert.equal(row.status, 'failed', 'Lost login job must not remain active: ' + status);
        assert.match(row.error, /Sign in again/);
        assert.equal(JSON.parse(row.progress).saved, 1, 'Already saved image progress is retained');
      }
      assert.equal(db.prepare('SELECT status FROM jobs WHERE id=?').get('public-running').status, 'running');
      assert.equal(db.prepare('SELECT status FROM jobs WHERE id=?').get('private-complete').status, 'complete');
    } finally { db.close(); }
    console.log('PASS abrupt web restart resolves running/paused/stopping private capture jobs; worker restart, public jobs and completed captures are preserved.');
  } finally { if (child) await stopChild(child); fs.rmSync(dir, { recursive: true, force: true }); }
}
main().catch(error => { console.error('[protected-recovery] Failed:', error.message); process.exitCode = 1; });

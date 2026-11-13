// Runs as an unprivileged user inside one disposable VM. Never log protocol data.
const { chromium } = require('playwright');
const WebSocket = require('ws');
const readline = require('node:readline');
const MAX_FRAME = 32 * 1024 * 1024;
(async () => {
  const server = await chromium.launchServer({ headless: true, chromiumSandbox: true,
    host: '127.0.0.1', args: ['--disable-dev-shm-usage', '--disable-background-networking'] });
  const socket = new WebSocket(server.wsEndpoint(), { maxPayload: MAX_FRAME, perMessageDeflate: false });
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; lines.close(); socket.terminate(); await server.close().catch(() => {}); process.exit(0); };
  process.on('SIGTERM', stop); process.stdin.on('end', stop);
  socket.on('open', () => process.stdout.write(JSON.stringify({ ready: true }) + '\n'));
  socket.on('message', data => {
    if (data.length > MAX_FRAME || process.stdout.writableLength > MAX_FRAME * 2) return stop();
    process.stdout.write(JSON.stringify({ frame: data.toString('base64') }) + '\n');
  });
  socket.on('error', stop); socket.on('close', stop);
  lines.on('line', line => {
    try {
      if (line.length > MAX_FRAME * 2) throw Error();
      const value = JSON.parse(line);
      if (typeof value.frame !== 'string' || value.frame.length > MAX_FRAME * 1.4) throw Error();
      const data = Buffer.from(value.frame, 'base64');
      if (socket.bufferedAmount > MAX_FRAME * 2) throw Error();
      socket.send(data.toString('utf8'));
    } catch { stop(); }
  });
})().catch(() => { process.stderr.write('Isolated browser startup failed.\n'); process.exit(1); });

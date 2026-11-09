const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function prepare(output) {
  const repo = path.resolve(__dirname, '../..');
  if (fs.existsSync(output)) throw Error('Use a new output directory.');
  if (execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim()) {
    throw Error('Review and commit the isolated prototype before preparing a deployment.');
  }
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const archive = execFileSync('git', ['archive', 'HEAD'], { cwd: repo, maxBuffer: 100 * 1024 * 1024 });
  fs.mkdirSync(output, { mode: 0o700 });
  execFileSync('tar', ['-xf', '-', '-C', output], { input: archive });
  // Never upload ignored .env files, browser sessions, local databases or images.
  // Git archive excludes untracked runtime data; strip all tracked env templates too.
  function clean(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const item = path.join(directory, entry.name);
      if (entry.name.startsWith('.env')) fs.rmSync(item, { recursive: true, force: true });
      else if (entry.isDirectory()) clean(item);
    }
  }
  clean(output);
  fs.writeFileSync(path.join(output, 'railway.json'), JSON.stringify({
    build: { builder: 'DOCKERFILE', dockerfilePath: 'prototype/browser-helper/Dockerfile' },
    deploy: { startCommand: 'node prototype/browser-helper/run-hosted.cjs', healthcheckPath: '/health',
      healthcheckTimeout: 300, restartPolicyType: 'NEVER', numReplicas: 1 },
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'pilot-source.json'), JSON.stringify({ commit, preparedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log('Prepared isolated source at ' + output + ' from ' + commit + '. No cloud action performed.');
}
module.exports = { prepare };
if (require.main === module) {
  if (!process.argv[2]) throw Error('Pass a new absolute output directory.');
  prepare(path.resolve(process.argv[2]));
}

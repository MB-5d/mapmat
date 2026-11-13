// Controlled email trial. This site does not hand a session to Vellic directly;
// the same Chrome helper used for GitHub must import its cookie after sign-in.
const fs = require('node:fs');
const { startLab } = require('../protected-site/run.cjs');

async function main() {
  if (!process.env.PROTOTYPE_CONFIG) throw Error('A private email-test configuration file is required.');
  const source = JSON.parse(fs.readFileSync(process.env.PROTOTYPE_CONFIG, 'utf8'));
  if (!source.resendKey || !source.emailFrom) throw Error('Real email delivery is not configured.');
  const lab = await startLab({
    helper: true, hideProtected: true,
    config: { resendKey: source.resendKey, emailFrom: source.emailFrom },
    directory: '/private/tmp/vellic-browser-helper-email-live',
  });
  console.log('Standalone email test ready: http://localhost:4399/login?standalone=1');
  console.log('Local helper API: http://127.0.0.1:4349. No Google configuration loaded.');
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await lab.close(); process.exit(0); });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

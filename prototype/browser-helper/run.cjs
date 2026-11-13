const { startLab } = require('../protected-site/run.cjs');

startLab({ helper: true, realSites: true, directory: '/private/tmp/vellic-browser-helper-live' }).then(lab => {
  console.log('Local helper backend ready at http://127.0.0.1:4349');
  console.log('Private-network access blocked; Google identity cookies blocked; deployed environments refused.');
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await lab.close(); process.exit(0); });
}).catch(error => { console.error(error.message); process.exitCode = 1; });

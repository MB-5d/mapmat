// Explicit staging-only preparation. Uploads an allowlist, never a repo checkout.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const { Sandbox }=require('railway');
const { RailwayBrowserTransport }=require('../utils/railwayBrowserTransport.cjs');
const ROOT=path.resolve(__dirname,'..');
const environmentId='da475d9e-af16-4895-a572-db8b75f53573';
const files={
 'launch.cjs':fs.readFileSync(path.join(ROOT,'runtime/scan-browser/launch.cjs')),
 'namespace.cjs':fs.readFileSync(path.join(ROOT,'runtime/scan-browser/namespace.cjs')),
 'worker.cjs':fs.readFileSync(path.join(ROOT,'runtime/scan-browser/worker.cjs')),
 'scanAuthProxy.cjs':fs.readFileSync(path.join(ROOT,'utils/scanAuthProxy.js')),
 'package.json':Buffer.from(JSON.stringify({private:true,dependencies:{playwright:require('../node_modules/playwright/package.json').version,ws:require('../node_modules/ws/package.json').version}})),
};
const checkpoint='vellic-browser-'+crypto.createHash('sha256').update(Buffer.concat(Object.values(files))).digest('hex').slice(0,16);
(async()=>{
 if(process.argv[2]==='describe'){console.log(JSON.stringify({environmentId,checkpoint,files:Object.keys(files),network:'ISOLATED',cpu:2,memoryGB:2,idleMinutes:5}));return;}
 assert(['prepare','prepare-existing'].includes(process.argv[2]));
 const token=process.env.SCAN_BROWSER_RAILWAY_TOKEN;
 assert(token,'Supply an explicitly approved staging Railway token.');
 let vm; let phase="create";
 try{
  const options={token,environmentId,webSocketImpl:RailwayBrowserTransport};
  if(process.argv[2]==='prepare-existing') { assert(/^[a-f0-9-]{36}$/.test(process.argv[3]||'')); vm=await Sandbox.connect(process.argv[3],options); }
  else vm=await Sandbox.create({...options,networkIsolation:'ISOLATED',domains:[],env:{},idleTimeoutMinutes:5,resources:{cpu:2,memoryGB:2}});
  assert.equal(vm.networkIsolation,'ISOLATED');assert.equal(vm.environmentId,environmentId);assert.equal(vm.domains.length,0);
  phase='upload';
  for(const [name,data] of Object.entries(files))await vm.files.write('/opt/vellic-browser/'+name,data);
  phase='install';
  const result=await vm.exec('node -e "require(\'fs\').copyFileSync(process.execPath,\'/usr/local/bin/vellic-browser-node\');require(\'fs\').chmodSync(\'/usr/local/bin/vellic-browser-node\',0o755)" && apt-get update -qq && apt-get install -y -qq iproute2 util-linux && (getent passwd 1001 >/dev/null || useradd --uid 1001 --create-home vellic-browser) && cd /opt/vellic-browser && npm install --ignore-scripts --no-audit --no-fund && PLAYWRIGHT_BROWSERS_PATH=/ms-playwright npx playwright install --with-deps chromium',{
   timeoutSec:600,ephemeral:true,captureOutput:true,maxOutputBytes:16000
  });
  if(result.exitCode!==0) { console.error((result.stderr || result.stdout).slice(-2500)); throw Error('Browser image preparation failed.'); }
  phase='checkpoint';
  // A checkpoint is made before any site session, browser process or credentials exist.
  await vm.checkpoint(checkpoint);
  console.log(JSON.stringify({prepared:true,checkpoint,environmentId}));
 }catch(error){console.error(JSON.stringify({phase,name:error.name,message:String(error.message).replaceAll(token,'[redacted]')}));throw error;}finally{if(vm && process.argv[2]!=='prepare-existing')await vm.destroy();}
})().catch(()=>{console.error('Isolated browser preparation failed; inspect provider status and cleanup before retrying.');process.exitCode=1;});

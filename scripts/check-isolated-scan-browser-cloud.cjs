// Explicit, one-machine staging test. Requires approved usage and a scoped token.
const assert=require('node:assert/strict');
const {Sandbox}=require('railway');
const {chromium}=require('playwright');
const {RailwayBrowserTransport}=require('../utils/railwayBrowserTransport.cjs');
const {openIsolatedBrowser}=require('../utils/isolatedScanBrowser.cjs');
const config={token:process.env.SCAN_BROWSER_RAILWAY_TOKEN,environmentId:'da475d9e-af16-4895-a572-db8b75f53573',checkpoint:process.env.SCAN_BROWSER_CHECKPOINT};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function denied(page,url){
 let response;
 try {response=await page.goto(url,{timeout:4000});}
 catch(error){assert(/net::ERR_|Timeout/.test(error.message),'denial must be a network failure');return;}
 assert([403,407,502].includes(response?.status()),'private destination must be explicitly denied, never served');
}
(async()=>{
 assert(process.argv.includes('--approved-staging-test'),'Explicit staging test approval is required.');
 assert(config.token && /^vellic-browser-[a-f0-9]{16}$/.test(config.checkpoint||''));
 const options={...config,webSocketImpl:RailwayBrowserTransport};
 let vm,remote;
 try {
  vm=await Sandbox.create(config.checkpoint,{...options,networkIsolation:'ISOLATED',domains:[],env:{},idleTimeoutMinutes:5,resources:{cpu:2,memoryGB:2}});
  console.log('Created one isolated staging test machine: '+vm.id);
  // Reuse only this disposable VM between synthetic transport checks. The real
  // provider destroys its VM per lease; the final block always removes this one.
  const provider={create:async()=>({id:vm.id,environmentId:vm.environmentId,networkIsolation:vm.networkIsolation,domains:vm.domains,exec:vm.exec.bind(vm),destroy:async()=>{}})};
  remote=await openIsolatedBrowser({config,expiresAt:Date.now()+120000,connect:chromium.connect.bind(chromium),provider});
  const context=await remote.browser.newContext({proxy:remote.proxy});const page=await context.newPage();
  assert.equal((await page.goto('https://example.com/',{timeout:30000})).status(),200);assert.equal(await page.title(),'Example Domain');
  assert((await page.screenshot()).length>1000);console.log('PASS public page and image through restricted proxy.');
  for(const url of ['http://169.254.169.254/','http://10.0.0.1/','http://127.0.0.1:4002/','http://[::1]/'])await denied(page,url);
  console.log('PASS private, metadata, loopback and IPv6 destinations denied.');
  const direct=await remote.browser.newContext();const directPage=await direct.newPage();
  for(const url of ['https://example.com/','http://169.254.169.254/'])await denied(directPage,url);
  console.log('PASS direct network bypass denied.');
  await context.addCookies([{name:'synthetic',value:'fixture-only',url:'https://example.com'}]);
  assert.equal((await direct.cookies()).length,0);console.log('PASS separate browser contexts do not share cookies.');
  const proof=await vm.exec("test ! -e /app/server.js && pid=$(pgrep -u 1001 -f '/opt/vellic-browser/worker.cjs' | head -1) && test -n \"$pid\" && nsenter -t \"$pid\" -n ip -j address",{ephemeral:true,captureOutput:true,maxOutputBytes:4000,timeoutSec:10,signal:AbortSignal.timeout(20000)});
  assert.equal(proof.exitCode,0);
  const interfaces=JSON.parse(proof.stdout);
  assert(interfaces.some(item=>item.ifname==='lo'));
  for(const item of interfaces.filter(item=>item.ifname!=='lo')) {
    assert(!item.flags.includes('UP') && !(item.addr_info||[]).length,'non-loopback interfaces must have no address and remain down');
  }
  console.log('PASS browser has only active loopback and no application checkout.');
  await remote.close();remote=null;
  remote=await openIsolatedBrowser({config,expiresAt:Date.now()+20000,connect:chromium.connect.bind(chromium),provider});
  const expiration=Date.now()+25000;
  while(remote.browser.isConnected()&&Date.now()<expiration)await pause(250);
  assert.equal(remote.browser.isConnected(),false);await remote.close();remote=null;
  console.log('PASS hard expiry disconnects the isolated browser.');
 } finally {
  await remote?.close();
  if(vm){await vm.destroy();let destroyed=false;for(let i=0;i<20;i++){const item=await vm.refresh();if(item.status==='DESTROYED'){destroyed=true;break;}await pause(500);}assert(destroyed,'Test machine removal must be verified');console.log('PASS test machine removal verified.');}
 }
})().catch(e=>{console.error(e.name,e.code||'',String(e.message).replaceAll(config.token||'__unset__','[redacted]'));process.exitCode=1;});

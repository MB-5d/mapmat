const assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const {openIsolatedBrowser,isolationConfig}=require('../utils/isolatedScanBrowser.cjs');
const path=require('node:path');
const tick=()=>new Promise(r=>setImmediate(r));
const config={checkpoint:'vellic-browser-0123456789abcdef',environmentId:'fixture',token:'must-not-reach-browser'};
(async()=>{
 assert.equal(isolationConfig({}),null);
 assert.throws(()=>isolationConfig({SCAN_BROWSER_ISOLATION:'railway',RAILWAY_ENVIRONMENT_NAME:'production'}));
 let destroyed=0,received,child;
 const provider={create:async(_checkpoint,options)=>{
  received=options;
  return{id:'fixture',environmentId:'fixture',domains:[],networkIsolation:'ISOLATED',destroy:async()=>{destroyed++;child?.kill('SIGKILL');},exec:(_command,opts)=>{
   assert.equal(opts.ephemeral,true);assert.equal(opts.captureOutput,false);
   // Exercise actual Playwright protocol over the transport. This local test is
   // deliberately not evidence of Linux/VM/network isolation.
   child=spawn(process.execPath,[path.resolve(__dirname,'../runtime/scan-browser/worker.cjs')],{stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH,HOME:process.env.HOME}});
   const promise=new Promise(resolve=>child.once('exit',code=>resolve({exitCode:code})));
   opts.onStdout(JSON.stringify({proxy:{server:'http://127.0.0.1:9999',username:'scan-auth',password:'a'.repeat(48)}})+'\n');
   child.stdout.on('data',data=>opts.onStdout(data.toString()));child.stderr.resume();
   promise.stdin={write:data=>new Promise((resolve,reject)=>child.stdin.write(data,error=>error?reject(error):resolve()))};
   promise.kill=async()=>{child.kill('SIGKILL');};return promise;
  }};
 }};
 const remote=await openIsolatedBrowser({config,expiresAt:Date.now()+60000,connect:chromium.connect.bind(chromium),provider});
 const context=await remote.browser.newContext();const page=await context.newPage();
 await page.setContent('<h1>Isolated transport fixture</h1>');assert.equal(await page.textContent('h1'),'Isolated transport fixture');
 const png=await page.screenshot();assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 await remote.close();assert.equal(destroyed,1);assert.deepEqual(received.env,{});assert.equal(received.networkIsolation,'ISOLATED');assert.deepEqual(received.domains,[]);
 let rejectedDestroyed=0;
 await assert.rejects(openIsolatedBrowser({config,expiresAt:Date.now()+60000,connect:()=>assert.fail('must not connect'),provider:{create:async()=>({networkIsolation:'PRIVATE',environmentId:'fixture',domains:[],destroy:async()=>{rejectedDestroyed++;}})}}),e=>e.code==='scan_auth_isolation_unavailable');
 assert.equal(rejectedDestroyed,1);
 console.log('Passed real browser protocol/screenshots over ephemeral transport, empty remote environment, production rejection, cleanup and fail-closed network mode. Cloud isolation requires separate live probes.');
})().catch(error=>{console.error(error);process.exitCode=1;});

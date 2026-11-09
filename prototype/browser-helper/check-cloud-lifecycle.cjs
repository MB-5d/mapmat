const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const path=require('node:path');
const configFile=process.env.VELLIC_CLOUD_TEST_CONFIG;
assert(configFile && path.isAbsolute(configFile), 'Set VELLIC_CLOUD_TEST_CONFIG to a private pilot config file.');
const c=JSON.parse(fs.readFileSync(configFile));
assert(c.project === '5c1fef1f-dd9b-47fc-8673-be0e50b335c8' && c.origin === 'https://scanner-pilot-auth-helper-pilot.up.railway.app', 'This harness only targets the approved disposable pilot.');
const dir=path.dirname(configFile), target=c.origin+'/__helper-fixture/members';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let cookie;
const req=(p,method='GET',body,headers)=>fetch(c.origin+p,{method,headers:{'Content-Type':'application/json',...(headers||{Cookie:cookie})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
const json=async(p,method='GET',body,headers)=>{const r=await req(p,method,body,headers);const j=await r.json();assert(r.ok,p+': '+r.status+' '+(j.error||''));return j};
const pairing=()=>json('/scan-auth/sessions','POST',{url:target,sampleUrls:[target],browserHelper:true});
const helper=(s,p,body={})=>req('/scan-auth/helper/'+p,'POST',body,{Origin:'chrome-extension://'+c.extension,Authorization:'Bearer '+s.helperPairingCode});
async function connected(){const s=await pairing();const state=await json('/__helper-fixture/state');const r=await helper(s,'import',{origin:c.origin,storageState:{cookies:[{name:state.cookieName,value:state.token,domain:new URL(c.origin).hostname,path:'/__helper-fixture',secure:true,httpOnly:true,sameSite:'Lax',expires:-1}],origins:[]}});assert.equal(r.status,200);assert((await json('/scan-auth/sessions/'+s.sessionId+'/complete','POST',{})).ready);return s;}
const start=s=>json('/scan-jobs','POST',{url:target,maxPages:20,options:{authenticatedPages:true},authSessionId:s.sessionId});
const job=j=>json('/scan-jobs/'+j.jobId+'?access_token='+j.jobAccessToken);
(async()=>{
 const login=await req('/auth/login','POST',{email:c.variables.SCAN_AUTH_HELPER_OWNER_EMAIL,password:c.variables.SCAN_AUTH_HELPER_OWNER_PASSWORD},{});assert(login.ok,'owner login');cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');fs.writeFileSync(dir+'/owner-cookie.txt',cookie,{mode:0o600});
 const command=process.argv[2];
 if(command==='package'){
  const config=await json('/scan-auth/helper/config');assert.equal(config.version,'0.3.0');assert.equal(config.extensionId,c.extension);assert(config.downloadAvailable);
  assert.equal((await req('/scan-auth/helper/download','GET',undefined,{})).status,401);
  const response=await req('/scan-auth/helper/download');assert(response.ok);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),config.sha256);
  fs.writeFileSync(dir+'/download.zip',bytes,{mode:0o600});console.log('Cloud package: authorized download, anonymous denial, stable identity and SHA-256 passed.');return;
 }
 if(command==='abort'){
  await json('/__helper-fixture/slow','POST',{enabled:false,delayImport:true});const s=await pairing(), state=await json('/__helper-fixture/state');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),1000);
  try { await fetch(c.origin+'/scan-auth/helper/import',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',Origin:'chrome-extension://'+c.extension,Authorization:'Bearer '+s.helperPairingCode},body:JSON.stringify({origin:c.origin,storageState:{cookies:[{name:state.cookieName,value:state.token,domain:new URL(c.origin).hostname,path:'/__helper-fixture',secure:true,httpOnly:true,sameSite:'Lax',expires:-1}],origins:[]}})});throw Error('Import should be interrupted'); }
  catch(error){assert.equal(error.name,'AbortError');}finally{clearTimeout(timer);}
  await sleep(17000);assert.equal((await req('/scan-auth/sessions/'+s.sessionId)).status,404);assert.equal((await helper(s,'describe')).status,410);
  await json('/__helper-fixture/slow','POST',{enabled:false});
  fs.writeFileSync('/private/tmp/vellic-cloud-aborted-import.json',JSON.stringify({passed:true,actualCloud:true,disconnectedImportRemoved:true,pairingRejected:true},null,2));console.log('Cloud interrupted import discarded; pairing cannot be reused.');return;
 }
 if(command==='cancel'){
  await json('/__helper-fixture/slow','POST',{enabled:false});const s=await connected();assert.equal((await json('/__helper-fixture/slow','POST',{enabled:true})).slow,true);const j=await start(s);await sleep(5000);
  assert.equal((await job(j)).job.status,'running');await json('/scan-jobs/'+j.jobId+'/cancel','POST',{});const canceledAt=Date.now();let final;
  for(let i=0;i<50;i++){final=(await job(j)).job;if(['canceled','failed'].includes(final.status))break;await sleep(1000);}
  assert.equal(final.status,'canceled');assert(!final.result?.root);await sleep(2000);
  assert.equal((await req('/scan-auth/sessions/'+s.sessionId)).status,404);assert.equal((await helper(s,'describe')).status,410);
  const state=await json('/__helper-fixture/state');assert(!state.requests.some(r=>r.unlocked&&r.at>canceledAt+1500));
  fs.writeFileSync('/private/tmp/vellic-cloud-cancel-integration.json',JSON.stringify({passed:true,actualCloud:true,status:final.status,sessionRemoved:true,noRequestsAfterCancel:true},null,2));console.log('Cloud active cancellation passed.');return;
 }
 if(command==='expiry'){
  await json('/__helper-fixture/slow','POST',{enabled:false});const s=await connected();assert.equal((await json('/__helper-fixture/slow','POST',{enabled:true})).slow,true);const j=await start(s);
  const status=await json('/scan-auth/sessions/'+s.sessionId);const expiresAt=Date.parse(status.expiresAt);let lastRunning=0,final,nextLog=Date.now();
  while(Date.now()<expiresAt+90000){const current=(await job(j)).job;if(current.status==='running')lastRunning=Date.now();else if(['failed','complete','canceled'].includes(current.status)){final=current;break;}
   if(Date.now()>=nextLog){console.log(JSON.stringify({phase:'active-cloud-expiry',secondsRemaining:Math.ceil((expiresAt-Date.now())/1000)}));nextLog=Date.now()+45000;}await sleep(1000);}
  assert(lastRunning>=expiresAt-3500,'Must remain active until expiry');assert.equal(final?.status,'failed');assert.match(final.error,/login.*expired/i);assert(!final.result?.root);
  const state=await json('/__helper-fixture/state');assert(state.requests.some(r=>r.unlocked));assert(!state.requests.some(r=>r.unlocked&&r.at>expiresAt+1000));assert.equal((await req('/scan-auth/sessions/'+s.sessionId)).status,404);assert.equal((await helper(s,'describe')).status,410);
  const evidence={passed:true,actualCloud:true,activeAtExpiry:true,expiresAt:status.expiresAt,finalStatus:final.status,noRequestsAfterExpiry:true,sessionRemoved:true,protectedRequests:state.requests.filter(r=>r.unlocked).length};fs.writeFileSync('/private/tmp/vellic-cloud-active-expiry-integration.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));return;
 }
 if(command==='restart-start'){
  await json('/__helper-fixture/slow','POST',{enabled:false});const s=await connected();const pending=await pairing();assert.equal((await json('/__helper-fixture/slow','POST',{enabled:true})).slow,true);const j=await start(s);await sleep(3000);assert.equal((await job(j)).job.status,'running');
  fs.writeFileSync(dir+'/restart-state.json',JSON.stringify({s,pending,j}),{mode:0o600});console.log('Cloud running scan and unused pairing ready for restart.');return;
 }
 if(command==='restart-check'){
  const {s,pending,j}=JSON.parse(fs.readFileSync(dir+'/restart-state.json'));
  for(const session of [s,pending]){assert.equal((await req('/scan-auth/sessions/'+session.sessionId)).status,404);assert.equal((await helper(session,'describe')).status,410);}
  assert.equal((await req('/scan-jobs','POST',{url:target,authSessionId:s.sessionId})).status,400);
  const prior=await req('/scan-jobs/'+j.jobId+'?access_token='+j.jobAccessToken);let status=prior.status;if(prior.ok){const data=await prior.json();assert.notEqual(data.job.status,'complete');status=data.job.status;}
  const fresh=await connected();await req('/scan-auth/sessions/'+fresh.sessionId,'DELETE');
  fs.writeFileSync('/private/tmp/vellic-cloud-restart-integration.json',JSON.stringify({passed:true,actualCloud:true,priorSessionsRemoved:true,oldPairingRejected:true,oldScanNotResumed:true,oldJobStatus:status,newConnectionWorks:true},null,2));console.log('Cloud restart: prior sessions invalid, pairing rejected, no successful old result, fresh login works.');return;
 }
 throw Error('Unknown command');
})().catch(e=>{console.error(e.message);process.exitCode=1});

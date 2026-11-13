const fs=require('node:fs'),assert=require('node:assert/strict');
const dir=process.env.VELLIC_STAGING_FAILURE_TEST_DIR;
assert(dir,'Set VELLIC_STAGING_FAILURE_TEST_DIR to a private directory outside the repository.');
const a=JSON.parse(fs.readFileSync(dir+'/accounts.json')),c=JSON.parse(fs.readFileSync(dir+'/control.json'));
const fixture=c.fixtureOrigin;
assert.equal(fixture,'https://auth-failure-fixture-staging.up.railway.app');
assert.equal(a.origin,'https://api-staging.vellic.io');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function req(path,method='GET',body,account='agency'){
 const r=await fetch(a.origin+path,{method,headers:{'Content-Type':'application/json',...(account?{Cookie:a[account].cookie}:{} )},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)});
 const j=await r.json().catch(()=>({}));return {...j,status:r.status};
}
async function good(path,method='GET',body,account='agency'){const r=await req(path,method,body,account);assert(r.status<300,path+': '+r.status+' '+(r.error||''));return r;}
async function control(path,method='GET'){const r=await fetch(fixture+'/control'+path,{method,headers:{Authorization:'Bearer '+c.key},signal:AbortSignal.timeout(15000)});assert(r.ok,'Fixture control '+r.status);return r.json();}
async function connect({wrong=false}={}){
 const run=await control('/runs','POST'),url=fixture+'/runs/'+run.id+'/members';
 const s=await good('/scan-auth/sessions','POST',{url,sampleUrls:[url]});
 assert(s.simplePasswordGate,'Fixture password form recognized');
 if(wrong){const r=await req('/scan-auth/sessions/'+s.sessionId+'/action','POST',{action:'password',text:'deliberately-incorrect'});assert.equal(r.status,409);}
 await good('/scan-auth/sessions/'+s.sessionId+'/action','POST',{action:'password',text:run.token});
 assert((await good('/scan-auth/sessions/'+s.sessionId+'/complete','POST',{})).ready);return {run,url,s};
}
const start=x=>good('/scan-jobs','POST',{url:x.url,maxPages:1200,authSessionId:x.s.sessionId,options:{authenticatedPages:true}});
const job=j=>good('/scan-jobs/'+j.jobId);
const write=(name,x)=>{fs.writeFileSync(dir+'/'+name+'.json',JSON.stringify(x,null,2),{mode:0o600});};
(async()=>{
 const command=process.argv[2];
 if(command==='preflight'){
  assert.equal((await fetch(fixture+'/health')).status,200);
  for(const who of ['agency','free']){const r=await req('/scan-preview','POST',{maxPages:50000},who);console.log(JSON.stringify({account:who,status:r.status,allowedPages:r.entitlement?.allowedPages,capped:r.entitlement?.capped,code:r.code}));}
  return;
 }
 if(command==='public-single'){
  const j=await good('/scan-jobs','POST',{url:'https://example.com/',maxPages:2,options:{authenticatedPages:false}});write('public-running',j);
  for(let i=0;i<80;i++){const r=(await job(j)).job;if(['failed','complete','canceled'].includes(r.status)){assert.equal(r.status,'complete');assert.equal(r.result?.pageCountSummary?.remainingPageCount,0);const evidence={status:r.status,error:r.error,pageCount:r.result?.pageCountSummary,diagnostics:r.result?.scanDiagnostics};write('public-single',evidence);console.log(JSON.stringify(evidence));return;}await sleep(1000);}throw Error('Public scan timeout');
 }
 if(command==='checks'){
  for(const endpoint of ['precheck','sessions']) assert.equal((await req('/scan-auth/'+endpoint,'POST',{url:fixture},'free')).status,403);
  const x=await connect({wrong:true});
  assert.equal((await req('/scan-auth/sessions/'+x.s.sessionId,'GET',undefined,'free')).status,404);
  assert.equal((await req('/scan-auth/sessions/'+x.s.sessionId+'/complete','POST',{},'free')).status,410);
  await good('/scan-auth/sessions/'+x.s.sessionId,'DELETE',undefined,'free');
  assert((await good('/scan-auth/sessions/'+x.s.sessionId)).ready);
  assert.equal((await req('/scan-auth/sessions/'+x.s.sessionId,'GET',undefined,null)).status,401);
  assert.equal((await req('/scan-auth/helper/config')).status,403);
  assert.equal((await req('/scan-auth/sessions','POST',{url:x.url,browserHelper:true})).status,403);
  assert.equal((await req('/screenshot?url='+encodeURIComponent(x.url)+'&authSessionId='+x.s.sessionId)).status,400);
  assert.equal((await req('/scan-jobs','POST',{url:x.url,authSessionId:x.s.sessionId,authenticatedCaptureType:'thumb'})).status,400);
  assert.equal((await req('/scan','POST',{url:x.url,authSessionId:x.s.sessionId})).status,400);
  await control('/'+x.run.id+'?slow=true','POST');
  const both=await Promise.all([1,2].map(()=>req('/scan-jobs','POST',{url:x.url,maxPages:1200,authSessionId:x.s.sessionId,options:{authenticatedPages:true}})));
  assert.deepEqual(both.map(r=>r.status).sort(),[200,409]);const j=both.find(r=>r.status===200);
  await sleep(3000);assert.equal((await job(j)).job.status,'running');
  await good('/scan-jobs/'+j.jobId+'/cancel','POST',{});const canceledAt=Date.now();await sleep(5000);
  assert.equal((await job(j)).job.status,'canceled');assert.equal((await req('/scan-auth/sessions/'+x.s.sessionId)).status,404);
  const state=await control('/'+x.run.id);assert(!state.requests.some(r=>r.unlocked&&r.at>canceledAt+1000));
  write('checks',{passed:true,wrongPassword:true,ownership:true,guestDenial:true,helperAccountScope:true,legacyImageDenied:true,singleSessionClaim:true,activeCancellation:true,noRequestsAfterCancel:true});console.log('Staging ownership, access, map-only policy, concurrent claim and active cancellation passed.');return;
 }
 if(command==='cancel-expiry'){const x=JSON.parse(fs.readFileSync(dir+'/expiry-running.json'));await good('/scan-jobs/'+x.jobId+'/cancel','POST',{});console.log('Disposable expiry attempt stopped for fixture adjustment.');return;}
 if(command==='expiry-monitor'){const x=JSON.parse(fs.readFileSync(dir+'/expiry-running.json'));const r=(await job({jobId:x.jobId})).job,st=await control('/'+x.runId);console.log(JSON.stringify({status:r.status,fetched:r.progress?.fetched,grouped:r.progress?.deferred,error:r.error,requests:st.requests.map(v=>({at:v.at,pathDepth:v.path.split('/').length}))}));return;}
 if(command==='expiry'){
  const x=await connect();await control('/'+x.run.id+'?slow=true','POST');const j=await start(x);
  const expiry=Date.parse((await good('/scan-auth/sessions/'+x.s.sessionId)).expiresAt);let lastRunning=0,final,nextLog=0;
  write('expiry-running',{sessionId:x.s.sessionId,jobId:j.jobId,runId:x.run.id,expiresAt:expiry});
  while(Date.now()<expiry+90000){const current=(await job(j)).job;if(current.status==='running')lastRunning=Date.now();else if(['failed','complete','canceled'].includes(current.status)){final=current;break;}
   if(Date.now()>=nextLog){console.log(JSON.stringify({phase:'staging-active-expiry',secondsRemaining:Math.ceil((expiry-Date.now())/1000)}));nextLog=Date.now()+45000;}await sleep(1000);}
  assert(lastRunning>=expiry-4000,'Must run through expiry');assert.equal(final?.status,'failed');assert.match(final.error,/login.*expired/i);assert(!final.result?.root);
  const state=await control('/'+x.run.id);assert(state.requests.some(r=>r.unlocked));assert(!state.requests.some(r=>r.unlocked&&r.at>expiry+1000));assert.equal((await req('/scan-auth/sessions/'+x.s.sessionId)).status,404);
  write('expiry',{passed:true,activeAtExpiry:true,expiresAt:expiry,status:final.status,noRequestsAfterExpiry:true,sessionRemoved:true,protectedRequests:state.requests.length});console.log('Actual staging active expiry passed.');return;
 }
 if(command==='capacity'){
  const active=[];
  try {
   for(let i=0;i<2;i++){const x=await connect();await control('/'+x.run.id+'?slow=true','POST');active.push({x,j:await start(x)});}
   for(const {j} of active)assert.equal((await job(j)).job.status,'running');
   const denied=await req('/scan-auth/sessions','POST',{url:active[0].x.url});assert.equal(denied.status,429);assert.equal(denied.code,'scan_auth_capacity');
   for(const {x,j} of active){assert.equal((await job(j)).job.status,'running');assert((await good('/scan-auth/sessions/'+x.s.sessionId)).ready);}
   write('capacity',{passed:true,rejectedWith429:true,activeScansPreserved:true});console.log('Staging capacity limit preserves both active scans and returns a clear retry response.');
  } finally {for(const {j} of active)await good('/scan-jobs/'+j.jobId+'/cancel','POST',{});}
  return;
 }
 if(command==='success'){
  const x=await connect(),j=await good('/scan-jobs','POST',{url:x.url,maxPages:4,authSessionId:x.s.sessionId,options:{authenticatedPages:true}});let result;
  for(let i=0;i<90;i++){const r=(await job(j)).job;if(r.status==='failed')throw Error(r.error);if(r.status==='complete'){result=r.result;break;}await sleep(1000);}
  assert(result?.root,'Protected scan completes');assert(!JSON.stringify(result).includes(x.run.token),'Login secret must not be returned');const flatten=n=>[n,...(n.children||[]).flatMap(flatten)],nodes=flatten(result.root);
  assert(nodes.filter(n=>n.httpStatus===200).length>=4);assert(!result.authenticatedCaptureSummary);assert(!nodes.some(n=>n.thumbnailUrl||n.screenshotUrl));
  assert.equal((await req('/scan-auth/sessions/'+x.s.sessionId)).status,404);
  const saved=await good('/api/maps','POST',{name:'Disposable auth security '+Date.now(),url:x.url,root:result.root,orphans:result.orphans}),id=saved.map.id;
  try{const reopened=(await good('/api/maps/'+id)).map;assert(reopened.root);assert.deepEqual(reopened.root,saved.map.root);assert([403,404].includes((await req('/api/maps/'+id,'GET',undefined,'free')).status));assert.equal((await req('/api/maps/'+id,'GET',undefined,null)).status,401);}
  finally{await good('/api/maps/'+id,'DELETE');}
  write('success',{passed:true,protectedPages:nodes.filter(n=>n.httpStatus===200).length,mapOnly:true,sessionRemoved:true,mapSavedAndReopened:true,crossAccountDenied:true,testMapRemoved:true});console.log('Protected map-only scan, save/reopen, ownership and cleanup passed.');return;
 }
 if(command==='restart-start'){
  const x=await connect();await control('/'+x.run.id+'?slow=true','POST');const j=await start(x);await sleep(3000);assert.equal((await job(j)).job.status,'running');write('restart-running',{x,j});console.log('Disposable staging scan running and ready for restart.');return;
 }
 if(command==='restart-check'){
  const {x,j}=JSON.parse(fs.readFileSync(dir+'/restart-running.json'));
  assert.equal((await req('/scan-auth/sessions/'+x.s.sessionId)).status,404);const checkedAt=Date.now();await sleep(3000);const state=await control('/'+x.run.id);assert(!state.requests.some(r=>r.unlocked&&r.at>checkedAt));const prior=(await job(j)).job;assert.equal(prior.status,'failed');assert.match(prior.error,/interrupted|expired/i);assert(!prior.result?.root);
  const fresh=await connect();await good('/scan-auth/sessions/'+fresh.s.sessionId,'DELETE');write('restart',{passed:true,persistentJobFailed:true,oldSessionRemoved:true,newConnectionWorks:true});console.log('Staging restart and persistent job recovery passed.');return;
 }
 throw Error('Unknown test');
})().catch(e=>{console.error(e.stack);process.exit(1)});

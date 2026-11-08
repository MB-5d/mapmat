const assert=require('node:assert/strict'),fs=require('node:fs');
const {startLab}=require('./run.cjs');
(async()=>{
  const inbox=new Map();const lab=await startLab({testInbox:inbox});const base='http://127.0.0.1:4349',target='http://localhost:4399';
  const api=async(path,body)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+lab.token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();assert(r.ok,`${path}: ${r.status} ${j.error||''}`);return j;};
  let cookies='';const request=async(path,form)=>{const r=await fetch(target+path,{redirect:'manual',method:form?'POST':'GET',headers:{cookie:cookies,...(form?{'content-type':'application/x-www-form-urlencoded',origin:target}:{})},...(form?{body:new URLSearchParams(form)}:{})});const next=r.headers.getSetCookie().map(c=>c.split(';')[0]);if(next.length)cookies=next.join('; ');return r;};
  const allNodes=result=>{const flat=n=>[n,...(n.children||[]).flatMap(flat)];return flat(result.root).concat((result.orphans||[]).flatMap(flat));};
  const scan=async authSessionId=>{const created=await api('/scan-jobs',{url:target+'/',maxPages:12,options:{authenticatedPages:true,inactivePages:true,errorPages:true},...(authSessionId?{authSessionId,authenticatedCaptureType:'thumb'}:{})});for(let i=0;i<120;i++){const {job}=await api('/scan-jobs/'+created.jobId+'?access_token='+created.jobAccessToken);if(job.status==='failed')throw Error(job.error);if(job.status==='complete')return job.result;await new Promise(r=>setTimeout(r,500));}throw Error('Scan timeout');};
  try{
    const guest=await scan();assert(allNodes(guest).some(n=>n.authRequired),'Guest scan must recognize login');
    const precheck=await api('/scan-auth/precheck',{url:target+'/'});assert(precheck.authCount>0);
    const s=await api('/scan-auth/sessions',{url:target+'/',sampleUrls:[target+'/members']});assert(s.externalLoginUrl);
    const pending=await fetch(base+'/scan-auth/sessions/'+s.sessionId+'/complete',{method:'POST',headers:{authorization:'Bearer '+lab.token,'content-type':'application/json'},body:'{}'});assert.equal(pending.status,409);
    const invalidCallback=await fetch(base+'/scan-auth/local-prototype/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pair:'a'.repeat(48),grant:'b'.repeat(48)})});assert.equal(invalidCallback.status,401);
    await request(new URL(s.externalLoginUrl).pathname+new URL(s.externalLoginUrl).search);const form=await(await request('/sign-in')).text();const csrf=form.match(/name="csrf" value="([a-f0-9]+)"/)[1];
    assert.equal((await request('/email/start',{csrf,email:'local@example.invalid',password:'wrong'})).status,401);
    assert.equal((await request('/email/start',{csrf,email:'local@example.invalid',password:'Vellic-local-test-only'})).status,303);
    assert.equal((await request('/email/verify',{csrf,code:'wrong'})).status,401);
    const completed=await request('/email/verify',{csrf,code:inbox.get('local@example.invalid')});assert.equal(completed.status,200,await completed.text());
    assert.equal((await request('/email/verify',{csrf,code:inbox.get('local@example.invalid')})).status,403);
    const verified=await api('/scan-auth/sessions/'+s.sessionId+'/complete',{});assert.equal(verified.ready,true);
    const result=await scan(s.sessionId);const expected=['/members','/members/about','/members/projects','/members/projects/sample'];const nodes=allNodes(result);for(const path of expected){const n=nodes.find(n=>n.url===target+path);assert(n,'Missing '+path);assert(!n.authRequired);assert.equal(n.httpStatus,200);assert(n.thumbnailUrl?.startsWith('/api/private-scan-captures/'),'Private capture missing '+path);}
    const privateURL=nodes.find(n=>n.thumbnailUrl).thumbnailUrl;assert.equal((await fetch(base+privateURL)).status,401);assert.equal((await fetch(base+privateURL,{headers:{authorization:'Bearer '+lab.token}})).status,200);
    assert.equal((await fetch(base+'/scan-auth/sessions/'+s.sessionId,{headers:{authorization:'Bearer '+lab.token}})).status,404);
    const report={ordinaryScanDetectsLogin:true,passwordAndEmailCodeFlow:true,emailDelivery:'controlled local inbox; live delivery not tested',wrongPasswordAndCodeRejected:true,verificationRequiredBeforeScan:true,unauthorizedBridgeRejected:true,oneUseLogin:true,protectedPagesScanned:expected.length,privateThumbnailsCaptured:expected.length,privateImagesOwnerOnly:true,loginRemovedAfterScan:true,google:'not yet tested',scope:'local Vellic backend and four-page loopback site; no staging or production changes'};
    fs.writeFileSync('/private/tmp/vellic-protected-site-scan-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{await lab.close();fs.rmSync(lab.dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

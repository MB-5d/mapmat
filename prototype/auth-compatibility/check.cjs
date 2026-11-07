const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {startFixture}=require('./fixture.cjs');
const {scopeScanAuthStorageState}=require('../../utils/scanAuthState');
(async()=>{
  let clock=Date.now();const site=await startFixture({now:()=>clock});const browser=await chromium.launch({headless:true});const contexts=[];const results=[];
  const context=async options=>{const c=await browser.newContext(options);contexts.push(c);return c;};
  const post=(c,path,form={})=>c.request.post(site.base+path,{form,headers:{Origin:site.base},maxRedirects:0});
  const start=async(method)=>{const c=await context();const r=await post(c,'/start',{email:'tester@example.invalid',password:'fixture-only',method});assert.equal(r.status(),303);const html=await(await c.request.get(site.base+'/challenge')).text();return{c,html,code:html.match(/<strong>(\d+)<\/strong>/)?.[1],nonce:html.match(/(?:token=|name="state" value=")([a-f0-9]+)/)?.[1]};};
  const status=async(c,path='/protected')=>(await c.request.get(site.base+path)).status();
  const ok=name=>{results.push({name,passed:true});console.log('PASS '+name);};
  try{
    for(const method of ['email','totp']){
      const {c,code}=await start(method);assert.equal(await status(c),401);assert.equal((await post(c,'/verify',{code:'wrong'})).status(),401);assert.equal((await post(c,'/verify',{code})).status(),303);assert.equal(await status(c),200);assert.equal(await status(c,'/protected/second'),200);assert.equal((await post(c,'/verify',{code})).status(),410);
      const fresh=await context();assert.equal(await status(fresh),401);
      await c.addCookies([{name:'identity_provider_session',value:'synthetic-provider-only',domain:'accounts.example.invalid',path:'/',httpOnly:true,secure:true,sameSite:'Lax'}]);
      const state=scopeScanAuthStorageState(await c.storageState(),{baseHost:'127.0.0.1',rootDomain:'127.0.0.1'});assert(!state.cookies.some(k=>k.name==='identity_provider_session'));assert(state.cookies.some(k=>k.name==='lab_session'&&k.httpOnly));
      const imported=await context({storageState:state});assert.equal(await status(imported),200);await post(c,'/cancel');assert.equal(await status(imported),401);
      ok(method+': wrong code, one-use verification, protected pages, target-only session transfer, cancellation');
    }
    {
      const {c,nonce}=await start('magic');const other=await context();assert.equal((await other.request.get(site.base+'/magic?token='+nonce)).status(),410);assert.equal((await c.request.get(site.base+'/magic?token='+nonce,{maxRedirects:0})).status(),303);assert.equal(await status(c),200);assert.equal((await c.request.get(site.base+'/magic?token='+nonce)).status(),410);ok('Magic link: same-browser binding and replay rejection');
    }
    {
      const {c,nonce}=await start('sso');assert.equal((await post(c,'/callback',{state:'wrong'})).status(),401);assert.equal((await post(c,'/callback',{state:nonce})).status(),303);assert.equal(await status(c),200);assert.equal((await post(c,'/callback',{state:nonce})).status(),410);ok('Simulated SSO return: state validation and one-use completion (not Google)');
    }
    {
      const {c,code}=await start('email');clock+=61000;assert.equal((await post(c,'/verify',{code})).status(),410);const active=await start('email');await post(active.c,'/verify',{code:active.code});assert.equal(await status(active.c),200);clock+=61000;assert.equal(await status(active.c),401);ok('Challenge expiry and authenticated-session expiry');
    }
    {
      const {c}=await start('email');for(let i=0;i<3;i++)assert.equal((await post(c,'/verify',{code:'wrong'})).status(),401);assert.equal((await post(c,'/verify',{code:'wrong'})).status(),410);const outsider=await c.request.post(site.base+'/start',{headers:{Origin:'https://unrelated.invalid'},form:{method:'email'}});assert.equal(outsider.status(),403);ok('Attempt limit and cross-origin submission rejection');
    }
    // Programmatic crawler pages test storage reuse; no real accounts or provider UI.
    for(const method of ['tab','indexeddb']){
      const {c,code}=await start(method);const response=await post(c,'/verify',{code});const html=await response.text();const page=await c.newPage();
      await page.route(site.base+'/finish',route=>route.fulfill({status:200,contentType:'text/html',body:html}));await page.goto(site.base+'/finish');await page.waitForURL(site.base+'/'+(method==='tab'?'tab':'indexeddb')+'-protected');await page.getByText('Protected content verified',{exact:true}).waitFor();
      const basic=scopeScanAuthStorageState(await c.storageState(),{baseHost:'127.0.0.1',rootDomain:'127.0.0.1'});const copied=await context({storageState:basic});const copiedPage=await copied.newPage();await copiedPage.goto(page.url());await copiedPage.getByText('Login required',{exact:true}).waitFor();
      if(method==='tab'){
        const newPage=await c.newPage();await newPage.goto(page.url());await newPage.getByText('Login required',{exact:true}).waitFor();ok('Tab-bound login: same tab works; fresh scan tabs and standard transfer fail');
      }else{
        const expanded=scopeScanAuthStorageState(await c.storageState({indexedDB:true}),{baseHost:'127.0.0.1',rootDomain:'127.0.0.1'});const restored=await context({storageState:expanded});const restoredPage=await restored.newPage();await restoredPage.goto(page.url());await restoredPage.getByText('Protected content verified',{exact:true}).waitFor();ok('IndexedDB login: default transfer fails; explicit IndexedDB transfer works');
      }
    }
    const report={scope:'isolated local prototype; no deployed changes',checks:results,googleLive:'not tested: authorized target and interactive user sign-in required',emailDelivery:'synthetic inbox only; no real email was sent',helper:'Separate normal-browser login does not authenticate the scanner. A scoped transfer helper, local scanning, or target-site integration is required for that architecture.',limitations:['A scoped storage snapshot is not a finished extension or secure import endpoint.','Tab-bound, device-bound, passkey, and provider-specific sessions need separate compatibility checks.','Current cloud login can avoid a helper only where the provider permits it and the scanner reuses usable session state.']};
    if(process.env.PROTOTYPE_RESULT)fs.writeFileSync(process.env.PROTOTYPE_RESULT,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:results.length}));
  }finally{await browser.close();await site.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

const assert=require('node:assert/strict');
const express=require('express');
const {installCloudFixture}=require('./cloud-fixture.cjs');
(async()=>{
 const previous=process.env.SCAN_AUTH_HELPER_CLOUD_FIXTURE;process.env.SCAN_AUTH_HELPER_CLOUD_FIXTURE='true';
 const app=express(),config={mode:'hosted',origin:'https://fixture.example',ownerEmail:'fixture@example.invalid'};
 installCloudFixture({app,config,authenticate:async req=>req.headers.authorization==='owner'?{email:config.ownerEmail}:null});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base+'/__helper-fixture/state')).status,401);
  const headers={authorization:'owner','Content-Type':'application/json'};
  const configured=await fetch(base+'/__helper-fixture/slow',{method:'POST',headers,body:JSON.stringify({enabled:true})});
  assert.equal((await configured.json()).slow,true,'Cloud fixture must parse the control body');
  const state=await (await fetch(base+'/__helper-fixture/state',{headers})).json();
  assert.equal((await fetch(base+'/__helper-fixture/members')).status,401);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),300);
  await assert.rejects(fetch(base+'/__helper-fixture/members/page-1',{headers:{Cookie:state.cookieName+'='+state.token},signal:controller.signal}),error=>error.name==='AbortError');clearTimeout(timer);
  assert.equal((await fetch(base+'/__helper-fixture/login')).headers.get('referrer-policy'),'same-origin');
  let installed=false;installCloudFixture({app:{get(){installed=true},post(){installed=true},use(){installed=true}},config:{...config,mode:'staging'}});assert.equal(installed,false);
  console.log('Passed: disposable cloud fixture parses slowdown controls, enforces owner-only controls, actually delays pages and stays absent from staging mode.');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(previous===undefined)delete process.env.SCAN_AUTH_HELPER_CLOUD_FIXTURE;else process.env.SCAN_AUTH_HELPER_CLOUD_FIXTURE=previous;}
})().catch(e=>{console.error(e.message);process.exitCode=1});

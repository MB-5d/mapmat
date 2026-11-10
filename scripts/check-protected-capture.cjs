const assert=require('node:assert/strict');
const {createPrivateScanCaptureStore,createPrivateScanCaptureHandler}=require('../utils/privateScanCapture');
const {createPrivateScanCaptureCleanup}=require('../utils/privateScanCaptureCleanup');
const {claimCaptureLogins,validateCaptureClaim}=require('../utils/scanCaptureLease.cjs');
const {captureProtectedImage}=require('../utils/protectedImageCapture.cjs');
(async()=>{
 const ownerKey='user:owner',mapId='map-one',objects=new Map();let now=1000;
 const store=createPrivateScanCaptureStore({encryptionKey:'a'.repeat(64),now:()=>now,saveObject:async o=>objects.set(o.key,o),readObject:async key=>objects.get(key)});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQp8AAAAASUVORK5CYII=','base64');
 const saved=await store.save({ownerKey,mapId,buffer:png});now+=86400001;
 assert.equal(saved.expiresAt,null);assert.deepEqual((await store.read({ownerKey,mapId,key:saved.key})).buffer,png);
 for(const args of [{ownerKey:'user:other',mapId},{ownerKey,mapId:'other-map'},{ownerKey}])assert.equal(await store.read({...args,key:saved.key}),null);
 const handler=createPrivateScanCaptureHandler({getStore:()=>store,enabled:()=>true,resolveMapAccess:async user=>['owner','member'].includes(user)?{mapId,ownerUserId:'owner'}:null});
 for(const [user,expected] of [['owner',200],['member',200],['other',404],[null,401]]){
  const res={code:200,setHeader(){},status(n){this.code=n;return this;},json(){},send(){}};
  await handler({user:user?{id:user}:null,params:{filename:saved.key}},res);assert.equal(res.code,expected);
 }
 let removed=0,retained=true;
 const cleanup=createPrivateScanCaptureCleanup({now:()=>now,listObjects:async()=>({keys:[saved.key],cursor:null}),readHeader:async key=>objects.get(key).buffer.subarray(0,21),removeObject:async()=>removed++,isMapCaptureRetained:async()=>retained});
 await cleanup.run();assert.equal(removed,0);retained=false;await cleanup.run();assert.equal(removed,1);
 const login={id:'login',ownerKey,origin:'https://example.com',status:'ready',storageState:{cookies:[],origins:[]},expiresAt:2000,jobId:null};
 const records=[{node:{url:'https://example.com/private',authCaptureRequired:true}}];
 const sessions=new Map([[login.id,login]]);
 for(const overrides of [{ownerKey:'user:other'},{sessionIds:['unknown']},{now:2000}])assert.throws(()=>claimCaptureLogins({records,sessionIds:['login'],ownerKey,sessions,now:1000,...overrides}),{code:'scan_auth_required'});
 assert.throws(()=>claimCaptureLogins({records:[...records,{node:{url:'https://other.com/private',authCaptureRequired:true}}],sessionIds:['login'],ownerKey,sessions,now:1000}),{code:'scan_auth_required'});assert.equal(login.jobId,null,'failed multi-origin claim cannot consume a valid session');
 assert.deepEqual(claimCaptureLogins({records,sessionIds:['login'],ownerKey,sessions,now:1000}),[login]);
 assert.throws(()=>claimCaptureLogins({records,sessionIds:['login'],ownerKey,sessions,now:1000}),{code:'scan_auth_required'});
 login.jobId='job';validateCaptureClaim(login,{ownerKey,jobId:'job',url:records[0].node.url,now:1000});
 assert.throws(()=>validateCaptureClaim(login,{ownerKey,jobId:'job',url:records[0].node.url,now:2000}),{code:'scan_auth_required'});
 let gate=false,checks=0,writes=0,expireAtCheck=Infinity;
 const page={setViewportSize:async()=>{},content:async()=>'<h1>Private</h1>',url:()=>records[0].node.url,evaluate:async()=>1200,screenshot:async()=>png};
 const args={session:login,url:records[0].node.url,captureType:'thumb',mapId,ownerUserId:'owner',context:{},fetchPage:async(_c,_u,cb)=>cb(page,{finalUrl:records[0].node.url,status:200}),verifyAccess:async()=>{if(++checks>=expireAtCheck)throw Object.assign(Error('expired'),{code:'scan_auth_expired'});},assertSafeUrl:async u=>u,classify:()=>({scanStatus:'active'}),hasPasswordGate:async()=>gate,preparePage:async()=>{},waitForReady:async()=>{},resizeBuffer:async b=>b,store:{save:async()=>{writes++;return saved;}},register:async()=>{},width:1365,height:900,maxHeight:20000,quality:80};
 await captureProtectedImage(args);assert.equal(writes,2);
 checks=0;expireAtCheck=3;await assert.rejects(captureProtectedImage(args),{code:'scan_auth_expired'});assert.equal(writes,2,'expired screenshots never persist');
 checks=0;expireAtCheck=Infinity;await assert.rejects(captureProtectedImage({...args,waitForReady:async()=>{gate=true;}}),{code:'scan_auth_required'});assert.equal(writes,2,'late login screens never persist');
 console.log('Passed durable encrypted map images, owner/member access, cross-map denial, deleted-map cleanup, atomic login claims, replay/expiry and late login-screen rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;});

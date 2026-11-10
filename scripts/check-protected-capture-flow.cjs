const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'vellic-capture-later-'));
 const seedPassword=crypto.randomBytes(24).toString('hex');let backend,logs='',seeded=false;
 const fixture=http.createServer((req,res)=>{
  if(req.method==='POST'){req.resume();req.on('end',()=>{res.writeHead(303,{'set-cookie':'fixture_login=yes; Path=/; SameSite=Lax',location:'/private'});res.end();});return;}
  res.setHeader('Content-Type','text/html');
  if(!String(req.headers.cookie||'').includes('fixture_login=yes')){res.end('<title>Protected fixture</title><form method="post" action="/login"><input type="password" name="password"><button>Unlock</button></form>');return;}
  res.end('<title>Private fixture</title><style>body{background:#a8d5f9;font-family:Arial;margin:32px}main{height:1300px}</style><main><h1>Private capture-later fixture</h1><p>This generated content must remain available after login expires, without exposing it publicly.</p></main>');
 });
 await new Promise(r=>fixture.listen(0,'127.0.0.1',r));const site='http://127.0.0.1:'+fixture.address().port+'/private';
 const portServer=http.createServer();await new Promise(r=>portServer.listen(0,'127.0.0.1',r));const port=portServer.address().port;await new Promise(r=>portServer.close(r));
 let token;const base='http://127.0.0.1:'+port;
 const raw=(url,options={})=>fetch(base+url,{...options,signal:AbortSignal.timeout(45000),headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...options.headers}});
 const json=async(url,options={})=>{const response=await raw(url,options);const data=await response.json();assert(response.ok,`${url}: ${response.status} ${data.error||''}`);return data;};
 const post=(url,body)=>json(url,{method:'POST',body:JSON.stringify(body||{})});
 try {
  backend=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,NODE_ENV:'test',DB_PROVIDER:'sqlite',DB_PATH:path.join(directory,'db.sqlite'),HOST:'127.0.0.1',PORT:String(port),RUN_MODE:'web',COLLABORATION_BACKEND_ENABLED:'true',JOB_WORKER_TYPES:'scan,image_capture',TEST_AUTH_ENABLED:'true',AUTH_HEADER_FALLBACK:'true',TEST_AUTH_SEED_EMAIL:'admin@vellic.io',TEST_AUTH_SEED_PASSWORD:seedPassword,SCAN_AUTH_FEATURE_ENABLED:'true',SCAN_AUTH_CAPTURE_LATER_ENABLED:'true',SCAN_BROWSER_ISOLATION:'off',ALLOW_PRIVATE_NETWORKS:'true',PRIVATE_SCAN_CAPTURE_KEY:crypto.randomBytes(32).toString('hex'),SCREENSHOT_STORAGE_PROVIDER:'local',SCREENSHOT_STORAGE_DIR:path.join(directory,'images'),EMAIL_PROVIDER:'log'},stdio:['ignore','pipe','pipe']});
  const output=chunk=>{logs=(logs+chunk).slice(-12000);seeded||=/Seeded test account|Refreshed test account/.test(logs);};backend.stdout.on('data',output);backend.stderr.on('data',output);
  for(let i=0;i<100;i++){if(backend.exitCode!==null)throw Error('Backend stopped: '+logs);try{if(seeded&&(await raw('/health')).ok)break;}catch{}await sleep(100);}
  token=(await post('/auth/login',{email:'admin@vellic.io',password:seedPassword})).token;assert(token);
  const login=await post('/scan-auth/sessions',{url:site,sampleUrls:[site]});assert(login.simplePasswordGate);
  await post('/scan-auth/sessions/'+login.sessionId+'/action',{action:'password',text:'fixture-only'});
  assert((await post('/scan-auth/sessions/'+login.sessionId+'/complete')).ready);
  const scan=await post('/scan-jobs',{url:site,maxPages:1,authSessionId:login.sessionId,options:{authenticatedPages:true}});
  async function wait(url){for(let i=0;i<180;i++){const data=await json(url);if(data.job.status==='complete')return data.job.result;if(['failed','canceled'].includes(data.job.status))throw Error('Job failed: '+JSON.stringify(data.job.error));await sleep(250);}throw Error('Job timed out');}
  const result=await wait('/scan-jobs/'+scan.jobId+'?includeResult=true');assert.equal(result.authConnection.sessionId,login.sessionId);assert(!result.root.thumbnailUrl,'scanning cannot capture images');
  const findPage=node=>node.url===site?node:(node.children||[]).map(findPage).find(Boolean);
  const scannedPage=findPage(result.root);assert(scannedPage);
  const root={...scannedPage,children:[],id:scannedPage.id||'root',authCaptureRequired:true,authPreviewUnavailable:true};
  const saved=await post('/api/maps',{name:'Protected image fixture',url:site,root,orphans:[],connections:[],colors:[]});const mapId=saved.map.id;
  const capture=await post('/api/maps/'+mapId+'/image-capture-jobs',{captureType:'thumb',scope:'all',authSessionIds:[login.sessionId]});
  const images=await wait('/api/maps/'+mapId+'/image-capture-jobs/'+capture.jobId+'?includeResult=true');assert.equal(images.saved,1,JSON.stringify(images));
  const map=await json('/api/maps/'+mapId);const node=map.map.root;assert(node.thumbnailUrl?.startsWith('/api/private-scan-captures/'),JSON.stringify(node));
  const lazyNode=await json('/api/maps/'+mapId+'/nodes/'+encodeURIComponent(root.id));assert.equal(lazyNode.node.authCaptureRequired,true);
  const outsider=await post('/auth/login',{email:'other@fixture.local',password:seedPassword});assert(outsider.token);
  const otherHeaders={authorization:'Bearer '+outsider.token};assert.equal((await raw(node.thumbnailUrl,{headers:otherHeaders})).status,404);
  const copiedBody={name:'Protected image copy',url:site,root:node,orphans:[]};
  const deniedCopy=await raw('/api/maps',{method:'POST',headers:otherHeaders,body:JSON.stringify(copiedBody)});
  assert.equal(deniedCopy.status,403,'knowing a private image URL does not grant copy access');
  assert.equal((await deniedCopy.json()).error.includes('access'),true);
  const unrelated=await json('/api/maps',{method:'POST',headers:otherHeaders,body:JSON.stringify({name:'Unrelated map',root,orphans:[]})});
  for(const [suffix,method,body] of [
    ['', 'PUT', {root:node,orphans:[]}],
    ['/versions', 'POST', {name:'Unauthorized image version',root:node,orphans:[]}],
    ['/node-assets', 'PATCH', {updates:[{nodeId:root.id,assets:{thumbnailUrl:node.thumbnailUrl}}]}],
  ]) {
    const deniedSave=await raw('/api/maps/'+unrelated.map.id+suffix,{method,headers:otherHeaders,body:JSON.stringify(body)});
    assert.equal(deniedSave.status,403,'unauthorized private reference blocked at '+suffix);
    assert((await deniedSave.json()).error.includes('access'));
  }
  assert.equal((await raw('/api/maps/'+unrelated.map.id,{method:'DELETE',headers:otherHeaders})).status,200);
  const database=new(require('better-sqlite3'))(path.join(directory,'db.sqlite'));
  let viewerCopyId;

  try {
    database.prepare('INSERT INTO map_memberships (id,map_id,user_id,role) VALUES (?,?,?,?)').run('fixture-viewer',mapId,outsider.user.id,'viewer');
    assert.equal((await raw(node.thumbnailUrl,{headers:otherHeaders})).status,200);
    const originalCount=database.prepare('SELECT COUNT(*) AS count FROM maps').get().count;
    database.exec("CREATE TRIGGER fixture_reject_reference BEFORE INSERT ON private_image_references BEGIN SELECT RAISE(ABORT, 'fixture reference failure'); END");
    try {
      const failedCopy=await raw('/api/maps',{method:'POST',body:JSON.stringify({...copiedBody,name:'Rolled back copy'})});
      assert.equal(failedCopy.status,500);
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM maps').get().count,originalCount,'failed reference save must roll back the map');
    } finally {database.exec('DROP TRIGGER fixture_reject_reference');}
    database.prepare('UPDATE map_memberships SET role=? WHERE id=?').run('none','fixture-viewer');
    assert.equal((await raw(node.thumbnailUrl,{headers:otherHeaders})).status,404);
    database.prepare('UPDATE map_memberships SET role=? WHERE id=?').run('unexpected-role','fixture-viewer');
    assert.equal((await raw(node.thumbnailUrl,{headers:otherHeaders})).status,404,'unknown roles fail closed');
    database.prepare('UPDATE map_memberships SET role=? WHERE id=?').run('viewer','fixture-viewer');
    const viewerCopy=await json('/api/maps',{method:'POST',headers:otherHeaders,body:JSON.stringify(copiedBody)});
    viewerCopyId=viewerCopy.map.id;
    database.prepare('DELETE FROM map_memberships WHERE id=?').run('fixture-viewer');
    assert.equal((await raw(node.thumbnailUrl,{headers:otherHeaders})).status,200,'authorized copy retains its own image access');
  } finally {database.close();}
  const first=await raw(node.thumbnailUrl);assert.equal(first.status,200);assert.equal(first.headers.get('content-type'),'image/jpeg');const bytes=Buffer.from(await first.arrayBuffer());assert(bytes.length>1000);
  assert.equal((await raw('/screenshots/'+node.thumbnailUrl.split('/').pop())).status,404);
  assert.equal((await fetch(base+node.thumbnailUrl)).status,401);
  const download=await raw('/api/maps/'+mapId+'/images/download',{method:'POST',body:JSON.stringify({scope:'selected',selectedNodeIds:[root.id]})});
  assert.equal(download.status,200);assert(download.headers.get('content-type').includes('image/jpeg'));assert(download.headers.get('content-disposition').includes('.jpg'));assert((await download.arrayBuffer()).byteLength>1000);
  const fullJob=await post('/api/maps/'+mapId+'/image-capture-jobs',{captureType:'full',scope:'all',authSessionIds:[login.sessionId]});
  assert.equal((await wait('/api/maps/'+mapId+'/image-capture-jobs/'+fullJob.jobId+'?includeResult=true')).saved,1);
  const fullMap=await json('/api/maps/'+mapId);assert(fullMap.map.root.fullScreenshotUrl.startsWith('/api/private-scan-captures/'));
  await raw('/scan-auth/sessions/'+login.sessionId,{method:'DELETE'});
  assert.equal((await raw(node.thumbnailUrl)).status,200,'saved image survives login removal');
  const reauth=await raw('/api/maps/'+mapId+'/image-capture-jobs',{method:'POST',body:JSON.stringify({captureType:'full',scope:'selected',nodeIds:[root.id],authSessionIds:[login.sessionId]})});assert.equal(reauth.status,409);assert.equal((await reauth.json()).code,'scan_auth_required');
  const ownerCopy=await post('/api/maps',{...copiedBody,name:'Owner image copy'});
  await post('/api/maps/'+ownerCopy.map.id+'/versions',{name:'Protected image version',root:node,orphans:[]});
  const sourceDelete=await raw('/api/maps/'+mapId,{method:'DELETE'});assert.equal(sourceDelete.status,200);
  assert.equal((await raw(node.thumbnailUrl)).status,200,'owner copy survives source deletion');
  assert.equal((await raw(node.thumbnailUrl,{headers:otherHeaders})).status,200,'viewer copy survives source deletion');
  const copyDownload=await raw('/api/maps/'+ownerCopy.map.id+'/images/download',{method:'POST',body:JSON.stringify({scope:'selected',selectedNodeIds:[root.id]})});
  assert.equal(copyDownload.status,200,'normal download works on a copy after source deletion');
  assert((await copyDownload.arrayBuffer()).byteLength>1000);
  const replaced=await json('/api/maps/'+ownerCopy.map.id,{method:'PUT',body:JSON.stringify({root:{...root,id:'replacement'},orphans:[]})});
  assert(!replaced.map.root.thumbnailUrl,'current map no longer includes the old image');
  assert.equal((await raw(node.thumbnailUrl)).status,200,'historical version retains image access after current page replacement');
  await raw('/api/maps/'+ownerCopy.map.id,{method:'DELETE'});
  assert.equal((await raw(node.thumbnailUrl)).status,404,'former source owner cannot read another account copy');
  assert.equal((await raw(node.thumbnailUrl,{headers:otherHeaders})).status,200);
  assert.equal((await raw('/api/maps/'+viewerCopyId,{method:'DELETE',headers:otherHeaders})).status,200);
  assert.equal((await raw(node.thumbnailUrl,{headers:otherHeaders})).status,404,'last map deletion revokes image access');
  console.log('PASS authorized copy/version retention, revoked memberships, unknown roles, rejected URL copying, atomic save rollback and last-map deletion.');
  console.log('PASS real local app: password login → map-only scan → Images capture → private saved image → login removal → saved image retained → recapture asks for login without rescanning.');
 }catch(error){console.error(error);console.error(logs.slice(-4000).replaceAll(seedPassword,'[redacted]'));throw error;}
 finally {backend?.kill('SIGTERM');if(backend&&backend.exitCode===null)await new Promise(r=>backend.once('exit',r));fixture.closeAllConnections();await new Promise(r=>fixture.close(r));fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});

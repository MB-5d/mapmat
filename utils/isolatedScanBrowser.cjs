const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');
const { Sandbox } = require('railway');
const { RailwayBrowserTransport } = require('./railwayBrowserTransport.cjs');
const MAX_FRAME = 32 * 1024 * 1024;
const failure = () => Object.assign(new Error('The isolated sign-in browser is unavailable. Please retry.'), { code:'scan_auth_isolation_unavailable', status:503 });

function isolationConfig(env = process.env) {
  if (!env.SCAN_BROWSER_ISOLATION || env.SCAN_BROWSER_ISOLATION === 'off') return null;
  if (env.SCAN_BROWSER_ISOLATION !== 'railway') throw Error('Unknown browser isolation provider.');
  if (env.RAILWAY_ENVIRONMENT_NAME !== 'staging'
    || env.RAILWAY_ENVIRONMENT_ID !== 'da475d9e-af16-4895-a572-db8b75f53573'
    || !env.SCAN_BROWSER_RAILWAY_TOKEN
    || !/^vellic-browser-[a-f0-9]{16}$/.test(env.SCAN_BROWSER_CHECKPOINT || '')
    || env.ALLOW_PRIVATE_NETWORKS !== 'false') throw Error('Isolated browser requires explicit staging-only configuration.');
  return { authType:'project-token', token:env.SCAN_BROWSER_RAILWAY_TOKEN, environmentId:env.RAILWAY_ENVIRONMENT_ID, checkpoint:env.SCAN_BROWSER_CHECKPOINT };
}

// The loopback bridge never logs browser protocol frames (cookies/content/images).
// Railway's ephemeral stream kills its process group when the app disconnects.
async function openIsolatedBrowser({ config, expiresAt, connect, provider = Sandbox }) {
  let vm, exec, relay, client, browser, timer, readyTimer, closed = false, closing;
  const abort = new AbortController();
  let buffer = '', writeQueue = Promise.resolve(), queuedBytes = 0, proxy;
  let resolveReady, rejectReady;
  const ready = new Promise((resolve,reject) => { resolveReady=resolve; rejectReady=reject; });
  ready.catch(() => {});
  let removing;
  const removeVm = () => {
    if (!vm) return Promise.resolve();
    if (!removing) removing = (async () => {
      for (let attempt=0; attempt<3; attempt++) {
        try {
          await vm.destroy();
          if (!vm.refresh || (await vm.refresh()).status === 'DESTROYED') return;
        } catch {}
        await new Promise(resolve=>setTimeout(resolve,1000));
      }
      throw Object.assign(failure(),{cleanupPending:true});
    })();
    return removing;
  };
  const close = () => {
    if (closing) return closing;
    closed = true; abort.abort(); clearTimeout(timer); clearTimeout(readyTimer); rejectReady(failure());
    closing = (async () => {
      client?.terminate(); relay?.close();
      await exec?.kill('KILL').catch(() => {});
      await removeVm();
    })();
    return closing;
  };
  const fail = () => { rejectReady(failure()); close().catch(() => {}); };
  const consume = chunk => {
    buffer += chunk;
    if (buffer.length > MAX_FRAME * 2) return fail();
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line=buffer.slice(0,end); buffer=buffer.slice(end+1);
      try {
        const record=JSON.parse(line);
        if (record.proxy) {
          if (proxy || !/^http:\/\/127\.0\.0\.1:\d+$/.test(record.proxy.server)
            || record.proxy.username !== 'scan-auth' || !/^[a-f0-9]{48}$/.test(record.proxy.password)) throw Error();
          proxy=record.proxy;
        } else if (record.ready && proxy) resolveReady();
        else if (typeof record.frame === 'string' && client?.readyState === 1) {
          const data=Buffer.from(record.frame,'base64');
          if (data.length>MAX_FRAME || client.bufferedAmount>MAX_FRAME*2) throw Error();
          client.send(data.toString('utf8'));
        } else throw Error();
      } catch { return fail(); }
    }
  };
  try {
    if (!config || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt-Date.now()>1800000) throw failure();
    timer=setTimeout(fail, expiresAt-Date.now()); timer.unref?.();
    vm=await provider.create(config.checkpoint, { token:config.token, ...(config.authType ? {authType:config.authType} : {}), environmentId:config.environmentId, webSocketImpl:RailwayBrowserTransport,
      networkIsolation:'ISOLATED', domains:[], env:{}, idleTimeoutMinutes:5, resources:{cpu:2,memoryGB:2} });
    if (closed || vm.networkIsolation !== 'ISOLATED' || vm.environmentId !== config.environmentId || vm.domains.length) throw failure();
    const seconds=Math.floor((expiresAt-Date.now())/1000);
    if (seconds<1 || seconds>1800) throw failure();
    exec=vm.exec('/usr/local/bin/vellic-browser-node /opt/vellic-browser/launch.cjs '+seconds, { stdin:true, ephemeral:true,
      captureOutput:false, timeoutSec:seconds, signal:abort.signal, onStdout:consume, onStderr:()=>{} });
    exec.then(fail,fail);
    readyTimer=setTimeout(fail,30000); readyTimer.unref?.(); await ready; clearTimeout(readyTimer);
    if (closed) throw failure();
    const path='/'+crypto.randomBytes(24).toString('hex');
    relay=new WebSocketServer({host:'127.0.0.1',port:0,path,maxPayload:MAX_FRAME,perMessageDeflate:false});
    await new Promise((resolve,reject)=>{relay.once('listening',resolve);relay.once('error',reject);});
    relay.on('connection',socket=>{
      if (client || closed) { socket.terminate(); return; } client=socket;
      socket.on('message',data=>{
        queuedBytes+=data.length;
        if (queuedBytes>MAX_FRAME*2) return fail();
        writeQueue=writeQueue.then(()=>exec.stdin.write(JSON.stringify({frame:data.toString('base64')})+'\n'))
          .then(()=>{queuedBytes-=data.length;}).catch(fail);
      });
      socket.on('close',fail); socket.on('error',fail);
    });
    browser=await connect('ws://127.0.0.1:'+relay.address().port+path);
    if (closed) throw failure();
    return {browser,proxy,close,id:vm.id};
  } catch {
    // Handle create resolving after the deadline: it still must be destroyed.
    await close();
    await removeVm();
    throw failure();
  }
}
module.exports={isolationConfig,openIsolatedBrowser};

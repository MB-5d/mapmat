const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));

async function contextCancellation() {
  const pending = deferred(); let closed = 0, guards = 0;
  const sessions = new Map();
  const session = { id: 's', scanContexts: new Set(), expiresAt: Date.now() + 60000 };
  sessions.set('s', session);
  const sandbox = { scanAuthSessions: sessions, isScanAuthSessionExpired: s => s.expiresAt <= Date.now(),
    getBrowser: async () => ({ newContext: () => pending.promise }), getScanAuthProxyOptions: async () => ({}),
    SCREENSHOT_USER_AGENTS: ['fixture'], installScanAuthNetworkGuard: async () => { guards++; },
    scanAuthContextOwners: new WeakMap(), assertSafeUrl: async u => u, require };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(source.indexOf('function assertScanAuthSessionActive('),source.indexOf('async function startInteractiveScanAuthSession(')),sandbox);
  const operation = sandbox.createAuthenticatedBrowserContext(null, undefined, session);
  await tick(); sessions.delete('s');
  pending.resolve({ close: async () => { closed++; }, on() {} });
  await assert.rejects(operation, error => error.code === 'scan_auth_expired');
  assert.equal(closed,1);assert.equal(guards,0);assert.equal(session.scanContexts.size,0);
}
async function claimRace() {
  let handler, creates = 0;const persisted=deferred();
  const session={id:'s',status:'ready',ownerKey:'user:owner',expiresAt:Date.now()+60000};
  const sessions=new Map([['s',session]]);
  const sandbox={app:{post:(_path,...handlers)=>{handler=handlers.at(-1);}},authMiddleware(){},scanLimiter(){},requireApiKey(){},enforceUsageLimit:()=>()=>{},
    assertSafeUrl:async u=>u,getRequestedScanPageLimit:()=>10,normalizeScanDepthLimit:()=>2,
    getScanAuthSessionForRequest:()=>session,SCAN_AUTH_FEATURE_ENABLED:true,JOB_WORKER_TYPES:['scan'],JOB_TYPES:{scan:'scan'},JOB_STATUS:{running:'running',queued:'queued'},
    resolveScanEntitlementForRequestAsync:async()=>({allowed:true,entitledMaxPages:10,entitlementPayload:{}}),
    findScanJobByIdempotencyKey:async()=>null,scanAuthSessions:sessions,isScanAuthSessionExpired:s=>s.expiresAt<=Date.now(),crypto:require('node:crypto'),
    getPublicScanOptions:()=>({}),createJob:async()=>{creates++;await persisted.promise;return 'job';},
    markJobFailed:async()=>{},SCAN_AUTH_SESSION_TTL_MS:300000,scheduleScanAuthExpiry(){},scheduleClaimedJob(){},recordUsage(){},URL,
  };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(source.indexOf('function assertScanAuthSessionActive('),source.indexOf('async function createAuthenticatedBrowserContext(')),sandbox);
  vm.runInContext(source.slice(source.indexOf("app.post('/scan-jobs',"),source.indexOf("app.get('/scan-jobs/:id',")),sandbox);
  const req={body:{url:'https://example.com/private',authSessionId:'s'},get:()=>null};
  const response=()=>({statusCode:200,status(s){this.statusCode=s;return this;},json(body){this.body=body;return this;}});
  const first=response(),second=response();const pending=handler(req,first);await tick();await handler(req,second);
  assert.equal(second.statusCode,409);assert.equal(creates,1);persisted.resolve();await pending;
  assert.equal(first.statusCode,200);assert.equal(session.jobId,'job');
}
(async()=>{await contextCancellation();await claimRace();console.log('Passed: canceled browser startup closes its context; simultaneous requests cannot reuse one login.');})().catch(e=>{console.error(e);process.exitCode=1;});

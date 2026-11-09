const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { helperConfig } = require('../utils/scanBrowserHelper/config.cjs');
const { readArtifact, extensionIdForKey, allowed } = require('../utils/scanBrowserHelper/distribution.cjs');
const { buildExtension } = require('../prototype/browser-helper/build-extension.cjs');
const origin = 'https://api-staging.vellic.io', appOrigin = 'https://app-staging.vellic.io';
const env = { SCAN_AUTH_BROWSER_HELPER:'true', SCAN_AUTH_HELPER_MODE:'staging', NODE_ENV:'production',
  RAILWAY_PROJECT_ID:'78076aad-fdc1-4248-9730-4f265a7f2129', RAILWAY_ENVIRONMENT_NAME:'staging',
  SCAN_AUTH_HELPER_ENVIRONMENT_ID:'11111111-1111-1111-1111-111111111111', RAILWAY_ENVIRONMENT_ID:'11111111-1111-1111-1111-111111111111',
  SCAN_AUTH_HELPER_PUBLIC_ORIGIN:origin, SCAN_AUTH_HELPER_APP_ORIGIN:appOrigin, SCAN_AUTH_HELPER_EXTENSION_ID:'a'.repeat(32),
  SCAN_AUTH_HELPER_SINGLE_INSTANCE:'true', RUN_MODE:'web', DB_PROVIDER:'postgres', SCAN_AUTH_HELPER_ALLOWED_USER_IDS:'reviewer',
  TEST_AUTH_ENABLED:'false', ALLOW_PRIVATE_NETWORKS:'false', SCAN_AUTH_LOCAL_PROTOTYPE:'false', SCAN_AUTH_HELPER_ALLOW_FIXTURE:'false',
  SCAN_AUTH_FEATURE_ENABLED:'true', ALLOW_VERCEL_PREVIEWS:'false', FRONTEND_URL:appOrigin+',chrome-extension://'+'a'.repeat(32),
  SCAN_AUTH_HELPER_ARTIFACT_DIR:'/tmp/reviewed-release' };
const config=helperConfig(env); assert(allowed(config,{id:'reviewer'})); assert(!allowed(config,{id:'other'}));
assert(!allowed(config,null)); assert.equal(helperConfig({...env,SCAN_AUTH_BROWSER_HELPER:'false'}),null);
for(const change of [{RAILWAY_ENVIRONMENT_NAME:'production'},{SCAN_AUTH_HELPER_SINGLE_INSTANCE:'false'},{RUN_MODE:'worker'},
 {SCAN_AUTH_HELPER_ALLOWED_USER_IDS:''},{DB_PROVIDER:'sqlite'},{ALLOW_PRIVATE_NETWORKS:'true'},{TEST_AUTH_ENABLED:'true'},
 {SCAN_AUTH_HELPER_PUBLIC_ORIGIN:'https://api.vellic.io'},{RAILWAY_ENVIRONMENT_ID:'other'},{SCAN_AUTH_HELPER_ARTIFACT_DIR:''}]) assert.throws(()=>helperConfig({...env,...change}));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vellic-release-check-'));
try {
 const key=require('node:crypto').generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({type:'spki',format:'der'}).toString('base64');
 const first=buildExtension(origin,path.join(dir,'v1'),{publicKey:key,appOrigin,staging:true,packageRelease:true});
 const second=buildExtension(origin,path.join(dir,'v2'),{publicKey:key,appOrigin,staging:true,packageRelease:true});
 assert.equal(extensionIdForKey(first.key),extensionIdForKey(second.key));
 assert.deepEqual(first.externally_connectable.matches,[appOrigin+'/*']);
 const target={...config,extensionId:extensionIdForKey(key)};
 assert(readArtifact(path.join(dir,'v2'),target));
 assert.throws(()=>readArtifact(path.join(dir,'v2'),{...target,origin:'https://api.vellic.io'}));
 fs.appendFileSync(path.join(dir,'v2/vellic-scan-helper.zip'),'tamper');
 assert.throws(()=>readArtifact(path.join(dir,'v2'),target));
 assert.throws(()=>buildExtension(origin,path.join(dir,'bad'),{appOrigin,staging:true}));
 console.log('Passed: scoped staging config, production rejection, stable update identity, exact app messaging origin and artifact integrity.');
} finally {fs.rmSync(dir,{recursive:true,force:true});}

// Readiness must accept only the exact validated staging helper exception.
const { spawnSync } = require('node:child_process');
const readinessEnv = { ...process.env, ...env, DATABASE_URL:'postgres://fixture', JWT_SECRET:'j'.repeat(40), ADMIN_API_KEY:'a'.repeat(32),
 COLLABORATION_BACKEND_ENABLED:'true', REALTIME_BASELINE_ENABLED:'true', COEDITING_EXPERIMENT_ENABLED:'true', COEDITING_SYNC_ENGINE_ENABLED:'true', COEDITING_ROLLOUT_ENABLED:'true', AUTH_HEADER_FALLBACK:'true', SCREENSHOT_STORAGE_PROVIDER:'r2', EMAIL_PROVIDER:'resend', R2_BUCKET:'fixture', R2_ACCOUNT_ID:'fixture', R2_ACCESS_KEY_ID:'fixture', R2_SECRET_ACCESS_KEY:'fixture' };
const readiness = changes => spawnSync(process.execPath,[path.join(__dirname,'check-staging-readiness.js'),'--target=backend'],{env:{...readinessEnv,...changes},encoding:'utf8'});
const valid = readiness({}); assert.equal(valid.status,0,valid.stdout+valid.stderr);
for (const changes of [{FRONTEND_URL:env.FRONTEND_URL+',chrome-extension://'+'b'.repeat(32)}, {TEST_AUTH_ENABLED:'true'}, {RAILWAY_ENVIRONMENT_NAME:'production'}, {ALLOW_VERCEL_PREVIEWS:'true'}]) assert.notEqual(readiness(changes).status,0);
console.log('Passed: staging readiness accepts the reviewed helper and rejects other extension origins or weakened helper settings.');

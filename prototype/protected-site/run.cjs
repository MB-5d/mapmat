const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {startSite}=require('./site.cjs');
const repo=path.resolve(__dirname,'../..');
async function startLab({testInbox=null,config={},directory}={}){
  const dir=directory||fs.mkdtempSync(path.join(os.tmpdir(),'vellic-protected-lab-'));fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const bridgeKey=crypto.randomBytes(32).toString('hex'),password=crypto.randomBytes(24).toString('hex');
  const site=await startSite({bridgeKey,google:config.google||{},testInbox,sendCode:config.resendKey?async(email,code)=>{
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:'Bearer '+config.resendKey,'content-type':'application/json'},body:JSON.stringify({from:config.emailFrom,to:[email],subject:'Vellic local test — verification code',text:`Your code for the local protected test site is ${code}. It expires in five minutes. This test does not change your Vellic account.`}),signal:AbortSignal.timeout(15000),redirect:'error'});
    if(!response.ok)throw Error('Email delivery failed');
  }:null});
  const backend=spawn(process.execPath,['server.js'],{cwd:repo,env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:'4349',DB_PROVIDER:'sqlite',DB_PATH:path.join(dir,'lab.db'),RUN_MODE:'web',TEST_AUTH_ENABLED:'true',AUTH_HEADER_FALLBACK:'true',TEST_AUTH_SEED_EMAIL:'admin@vellic.io',TEST_AUTH_SEED_PASSWORD:password,JWT_SECRET:crypto.randomBytes(32).toString('hex'),ALLOW_PRIVATE_NETWORKS:'true',SCAN_AUTH_FEATURE_ENABLED:'true',SCAN_AUTH_LOCAL_PROTOTYPE:'true',PROTOTYPE_BRIDGE_KEY:bridgeKey,SCREENSHOT_STORAGE_PROVIDER:'local',SCREENSHOT_STORAGE_DIR:path.join(dir,'images'),PRIVATE_SCAN_CAPTURE_KEY:crypto.randomBytes(32).toString('hex'),EMAIL_PROVIDER:'log',FRONTEND_URL:'http://127.0.0.1:5179',APP_BASE_URL:'http://127.0.0.1:5179',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',RAILWAY_ENVIRONMENT_ID:'',VERCEL:''},stdio:['ignore','pipe','pipe']});
  let logs='';backend.stdout.on('data',c=>logs=(logs+c).slice(-12000));backend.stderr.on('data',c=>logs=(logs+c).slice(-12000));
  const close=async()=>{if(backend.exitCode===null&&backend.signalCode===null){const exit=new Promise(r=>backend.once('exit',r));backend.kill('SIGTERM');const timer=setTimeout(()=>backend.kill('SIGKILL'),5000);await exit;clearTimeout(timer);}await site.close();};
  try{let ready=false;for(let i=0;i<150;i++){if(backend.exitCode!==null)throw Error('Local backend stopped: '+logs.slice(-1500));try{const r=await fetch('http://127.0.0.1:4349/health');if(r.ok&&/Seeded test account|Refreshed test account/.test(logs)){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw Error('Local backend did not become ready');
    const response=await fetch('http://127.0.0.1:4349/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@vellic.io',password})});const account=await response.json();if(!response.ok||!account.token)throw Error('Local account could not sign in');
    fs.writeFileSync(path.join(dir,'account.json'),JSON.stringify({email:'admin@vellic.io',password,token:account.token}),{mode:0o600});
    return {dir,site,backend,token:account.token,close};
  }catch(e){await close();throw e;}
}
module.exports={startLab};
if(require.main===module){const configPath=process.env.PROTOTYPE_CONFIG;const config=configPath?JSON.parse(fs.readFileSync(configPath)):{};startLab({config,directory:'/private/tmp/vellic-protected-site-live'}).then(lab=>{console.log('Local test site: http://localhost:4399/');console.log('Local Vellic API ready: http://127.0.0.1:4349');console.log('Google configured: '+Boolean(config.google?.clientId&&config.google?.clientSecret));console.log('Real email configured: '+Boolean(config.resendKey));for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await lab.close();process.exit(0);});}).catch(e=>{console.error(e.message);process.exitCode=1;});}

// Local research only: this cooperative site grants its own session to Vellic.
// This is NOT a generic browser-session exporter or production authentication path.
const crypto = require('node:crypto');
function createLocalBridge({ app, sessions, closeSession, createContext, expired }) {
  if (process.env.SCAN_AUTH_LOCAL_PROTOTYPE !== 'true') return null;
  if (process.env.NODE_ENV !== 'test' || process.env.HOST !== '127.0.0.1' || process.env.RAILWAY_ENVIRONMENT_ID || process.env.VERCEL) throw new Error('Local prototype must run on the isolated loopback test backend');
  const origin = 'http://localhost:4399';
  const key = process.env.PROTOTYPE_BRIDGE_KEY;
  if (!/^[a-f0-9]{64}$/.test(key || '')) throw new Error('Local prototype bridge key missing');
  const authorized = req => {
    const supplied=String(req.headers.authorization||'').replace(/^Bearer /,'');
    return supplied.length===key.length && crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(key));
  };
  app.post('/scan-auth/local-prototype/complete',async(req,res)=>{
    if(!authorized(req))return res.sendStatus(401);
    const pair=String(req.body?.pair||'');
    const session=[...sessions.values()].find(s=>s.prototypePair===pair && pair.length===48);
    if(!session || expired(session) || session.prototypeCompleting || session.browserContext)return res.sendStatus(410);
    session.prototypeCompleting=true;
    let context;
    try {
      const response=await fetch(origin+'/bridge/redeem',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({grant:req.body?.grant,pair}),signal:AbortSignal.timeout(10000),redirect:'error'});
      if(!response.ok)throw new Error();
      const {cookie}=await response.json();
      if(cookie?.name!=='protected_test_session'||cookie.domain!=='localhost'||cookie.path!=='/'||!cookie.httpOnly||!/^[a-f0-9]{48}$/.test(cookie.value||''))throw new Error();
      context=await createContext({cookies:[cookie],origins:[]},undefined,session);
      if(sessions.get(session.id)!==session||expired(session))throw new Error();
      session.browserContext=context;session.prototypePair=null;
      res.json({readyForVerification:true});
    }catch{
      await context?.close().catch(()=>{});closeSession(session);sessions.delete(session.id);
      res.status(409).json({error:'Test login could not be connected. Start a new login.'});
    }finally{session.prototypeCompleting=false;}
  });
  return {
    start(session) {
      if(session.origin!==origin)return null;
      session.prototypePair=crypto.randomBytes(24).toString('hex');session.status='interactive';
      session.sampleUrls=[origin+'/members',origin+'/members/projects'];
      return {sessionId:session.id,status:'interactive',interactiveSupported:true,simplePasswordGate:false,externalLoginUrl:origin+'/login?pair='+session.prototypePair,expiresAt:new Date(session.expiresAt).toISOString()};
    },
  };
}
module.exports={createLocalBridge};

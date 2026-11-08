const http=require('node:http'),crypto=require('node:crypto'),jwt=require('jsonwebtoken');
const random=()=>crypto.randomBytes(24).toString('hex');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function startSite({bridgeKey,backend='http://127.0.0.1:4349',google={},sendCode,now=Date.now,testInbox=null,standalone=false,hideProtected=false}={}) {
  if(!/^[a-f0-9]{64}$/.test(bridgeKey||''))throw Error('Bridge key required');
  if(backend!=='http://127.0.0.1:4349')throw Error('Loopback backend required');
  const base='http://localhost:4399',logins=new Map(),sessions=new Map(),grants=new Map();
  const password=process.env.PROTOTYPE_TEST_PASSWORD||'Vellic-local-test-only';
  const valid=s=>s&&s.expires>now();
  const html=(title,body)=>`<!doctype html><html><head><title>${escape(title)} · Vellic test site</title><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{font:17px system-ui;max-width:720px;margin:45px auto;padding:24px;background:#f7f7fb;color:#19203a}section{background:white;padding:24px;border:1px solid #d7dae7;border-radius:12px}input,button{display:block;font:inherit;padding:10px;margin:12px 0}a{color:#3448b5}nav a{margin-right:20px}small{color:#5c6275}</style></head><body><small>LOCAL PROTECTED TEST SITE · NOT STAGING OR PRODUCTION</small><h1>${escape(title)}</h1><section>${body}</section></body></html>`;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
    if(req.headers.host!==new URL(base).host){res.writeHead(403);return res.end();}
    const url=new URL(req.url,base);
    const reply=(status,title,body)=>{res.writeHead(status,{'content-type':'text/html; charset=utf-8'});res.end(html(title,body));};
    const redirect=location=>{res.writeHead(303,{location});res.end();};
    const cookie=name=>String(req.headers.cookie||'').split('; ').find(c=>c.startsWith(name+'='))?.slice(name.length+1);
    const login=logins.get(cookie('test_login'));
    const token=cookie('protected_test_session'),session=sessions.get(token);
    let body={};
    try{
      if(req.method==='POST'){
        let raw='';for await(const c of req){raw+=c;if(raw.length>8192)return reply(413,'Request too large','Please restart.');}
        body=String(req.headers['content-type']).includes('application/json')?JSON.parse(raw):Object.fromEntries(new URLSearchParams(raw));
        if(url.pathname!=='/bridge/redeem'&&(!valid(login)||body.csrf!==login.csrf||!['null',undefined,base].includes(req.headers.origin)))return reply(403,'Request rejected','Start again from Vellic.');
      }
      const form=(action,content)=>`<form method="post" action="${action}"><input type="hidden" name="csrf" value="${login.csrf}">${content}</form>`;
      const finish=async method=>{
        if(!valid(login))return reply(410,'Sign-in expired','Start again from Vellic.');
        const sid=random(),grant=random();sessions.set(sid,{expires:now()+15*60000,method});
        if(login.pair) {
        grants.set(grant,{sid,pair:login.pair,expires:now()+30000});
        const r=await fetch(backend+'/scan-auth/local-prototype/complete',{method:'POST',headers:{authorization:'Bearer '+bridgeKey,'content-type':'application/json'},body:JSON.stringify({pair:login.pair,grant}),signal:AbortSignal.timeout(15000),redirect:'error'});
        if(!r.ok){sessions.delete(sid);grants.delete(grant);throw Error('connection');}
        }
        logins.delete(cookie('test_login'));
        res.setHeader('Set-Cookie',[`protected_test_session=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=900`,'test_login=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0']);
        return login.pair ? reply(200,'Sign-in connected to Vellic','<p>Return to Vellic and choose <strong>Use this login</strong>. Vellic will verify access and scan these four protected pages.</p><a href="/members">View the test site</a>') : reply(200,'Signed in to the test site','<p>No session was sent to Vellic. Open a protected page, then use the browser helper.</p><a href="/members">View the test site</a>');
      };
      if(url.pathname==='/bridge/redeem'&&req.method==='POST'){
        const auth=String(req.headers.authorization||'');if(auth!=='Bearer '+bridgeKey){res.writeHead(401);return res.end();}
        const g=grants.get(body.grant);grants.delete(body.grant);if(!valid(g)||g.pair!==body.pair){res.writeHead(410);return res.end();}
        const s=sessions.get(g.sid);if(!valid(s)){res.writeHead(410);return res.end();}
        res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({cookie:{name:'protected_test_session',value:g.sid,domain:'localhost',path:'/',httpOnly:true,secure:false,sameSite:'Lax',expires:Math.floor(s.expires/1000)}}));
      }
      if(url.pathname==='/login'){
        if(!(standalone && url.searchParams.get('standalone')==='1') && !/^[a-f0-9]{48}$/.test(url.searchParams.get('pair')||''))return reply(400,'Start in Vellic','Scan http://localhost:4399/members in the local Vellic app and choose Enter password.');
        const id=random(),entry={pair:url.searchParams.get('pair'),csrf:random(),expires:now()+10*60000,attempts:0};logins.set(id,entry);res.setHeader('Set-Cookie',`test_login=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`);return redirect('/sign-in');
      }
      if(url.pathname==='/sign-in'){
        if(!valid(login))return reply(410,'Login expired','Start again from Vellic.');
        return reply(200,'Sign in to the test site',`<p>${login.pair?'Only four sample pages. This test site explicitly supplies its own temporary session to your local Vellic scan. No Google cookies are transferred.':'Sign in to four sample pages with the test password and an emailed code. After signing in, the browser helper will connect this site to local Vellic.'}</p>${google.clientId?'<a href="/google/start">Continue with Google</a>':login.pair?'<p>Google setup is pending.</p>':''}<hr>${form('/email/start','<label>Email<input type="email" name="email" required autocomplete="email"></label><label>Test-site password<input type="password" name="password" required></label><small>Test-only password: '+escape(password)+'</small><button>Send verification code</button>')}<p>${testInbox?'Local test inbox mode: no real email will be sent.':'A one-time code will be sent to the email you enter.'}</p>`);
      }
      if(url.pathname==='/email/start'&&req.method==='POST'){
        if(login.sentAt && now()-login.sentAt<30000)return reply(429,'Please wait','Wait 30 seconds before requesting another code.');
        if(body.password!==password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email||'')){login.attempts++;if(login.attempts>=5)logins.delete(cookie('test_login'));return reply(401,'Sign-in not accepted','Check the test password and email. <a href="/sign-in">Try again</a>');}
        const code=String(crypto.randomInt(100000,1000000));login.email=String(body.email).trim().toLowerCase();login.codeHash=crypto.createHash('sha256').update(code).digest('hex');login.codeExpires=now()+5*60000;login.sentAt=now();
        if(testInbox)testInbox.set(login.email,code);else if(sendCode)await sendCode(login.email,code);else return reply(503,'Email setup is pending','No email was sent.');
        return redirect('/email/verify');
      }
      if(url.pathname==='/email/verify'&&req.method==='GET'){
        if(!valid(login)||!login.codeHash)return reply(410,'Verification expired','Start again from Vellic.');
        return reply(200,'Check your email',form('/email/verify','<label>Six-digit verification code<input name="code" inputmode="numeric" autocomplete="one-time-code" required></label><button>'+(login.pair?'Verify and connect to Vellic':'Verify and sign in')+'</button>'));
      }
      if(url.pathname==='/email/verify'&&req.method==='POST'){
        if(!valid(login)||login.codeExpires<=now()||login.attempts>=5)return reply(410,'Verification expired','Start again from Vellic.');
        if(crypto.createHash('sha256').update(String(body.code||'')).digest('hex')!==login.codeHash){login.attempts++;return reply(401,'Code not accepted','<a href="/email/verify">Try again</a>');}
        delete login.codeHash;return await finish('password+email');
      }
      if(url.pathname==='/google/start'){
        if(!valid(login)||!google.clientId||!google.clientSecret)return reply(503,'Google setup is pending','No Google sign-in attempt was made.');
        login.state=random();login.nonce=random();login.verifier=crypto.randomBytes(32).toString('base64url');
        const params=new URLSearchParams({client_id:google.clientId,redirect_uri:base+'/google/callback',response_type:'code',scope:'openid email',state:login.state,nonce:login.nonce,code_challenge:crypto.createHash('sha256').update(login.verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'});
        return redirect('https://accounts.google.com/o/oauth2/v2/auth?'+params);
      }
      if(url.pathname==='/google/callback'){
        if(!valid(login)||!login.state||url.searchParams.get('state')!==login.state)return reply(403,'Google return rejected','Start a new sign-in from Vellic.');
        delete login.state;if(url.searchParams.get('error'))return reply(409,'Google sign-in cancelled','<a href="/sign-in">Try again</a>');
        const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:google.clientId,client_secret:google.clientSecret,redirect_uri:base+'/google/callback',code:url.searchParams.get('code')||'',code_verifier:login.verifier,grant_type:'authorization_code'}),signal:AbortSignal.timeout(15000),redirect:'error'});
        if(!response.ok)throw Error('Google exchange');const tokens=await response.json();const header=jwt.decode(tokens.id_token,{complete:true})?.header;if(header?.alg!=='RS256')throw Error('Google signature');
        const keysResponse=await fetch('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(10000),redirect:'error'});if(!keysResponse.ok)throw Error('Google keys');const keys=await keysResponse.json();const jwk=keys.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)throw Error('Google key');
        const claims=jwt.verify(tokens.id_token,crypto.createPublicKey({key:jwk,format:'jwk'}),{algorithms:['RS256'],audience:google.clientId,issuer:['https://accounts.google.com','accounts.google.com']});
        if(!claims.sub||!claims.email_verified||claims.nonce!==login.nonce||!Number.isFinite(claims.exp))throw Error('Google claims');
        // Deliberately discard Google tokens/profile. Only our site's random session is retained.
        return await finish('google');
      }
      const paths=['/members','/members/about','/members/projects','/members/projects/sample'];
      if(url.pathname==='/')return reply(200,'Protected Site Test','<p>Public landing page for four protected sample pages.</p><nav>'+paths.map(p=>`<a href="${p}">${escape(p)}</a>`).join(' ')+'</nav>');
      if(paths.includes(url.pathname)){
        if(!valid(session))return hideProtected ? reply(404,'Page not found','This resource is unavailable.') : reply(401,'Login required','<p>This page requires sign-in. Start from Vellic to connect a test login.</p><form><label>Email<input type="email" name="email"></label><label>Password<input type="password" name="password"></label></form>');
        const titles=['Test Home','About the Test','Test Projects','Sample Project'];return reply(200,titles[paths.indexOf(url.pathname)],'<style data-href="github-ui-cascade-layer-order">@layer test;</style><nav>'+paths.map((p,i)=>`<a href="${p}">${titles[i]}</a>`).join('')+'</nav><p>Protected sample content. No customer or project data.</p>');
      }
      if(url.pathname==='/sitemap.xml'){res.writeHead(200,{'content-type':'application/xml'});return res.end('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+paths.map(p=>'<url><loc>'+base+p+'</loc></url>').join('')+'</urlset>');}
      if(url.pathname==='/robots.txt'){res.writeHead(200,{'content-type':'text/plain'});return res.end('User-agent: *\nAllow: /members\nDisallow: /login\nDisallow: /sign-in\nDisallow: /google\nDisallow: /email\nDisallow: /bridge');}
      return reply(404,'Page not found','Only four protected test pages are available.');
    }catch{return reply(409,'Sign-in could not finish','No scan was started. Return to Vellic and start a new login.');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4399,'127.0.0.1',resolve);});
  const sweep=setInterval(()=>{for(const map of [logins,sessions,grants])for(const [key,value] of map)if(!valid(value))map.delete(key);},60000);sweep.unref();
  return {base,close:async()=>{clearInterval(sweep);server.closeAllConnections();await new Promise(r=>server.close(r));for(const m of [logins,sessions,grants])m.clear();}};
}
module.exports={startSite};

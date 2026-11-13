// Isolated synthetic login site. Never mount in the application or use real credentials.
const http = require('node:http');
const crypto = require('node:crypto');
const id = () => crypto.randomBytes(24).toString('hex');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const secret = Buffer.from('synthetic-authenticator-secret');
function totp(now) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const digest = crypto.createHmac('sha1', secret).update(counter).digest(); const offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
async function startFixture({ now = Date.now, port = 0 } = {}) {
  const sessions = new Map(), challenges = new Map(), csrf = id(); let base;
  const page = (title, content) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title><style>body{font:17px system-ui;max-width:650px;margin:50px auto;padding:24px;background:#f6f7fb;color:#182037}a{color:#324bbe}input,button{font:inherit;padding:10px;margin:8px 0;display:block}section{background:white;padding:24px;border:1px solid #d9deea;border-radius:12px}small{display:block;color:#596477}nav a{display:block;margin:15px 0}</style></head><body><small>LOCAL COMPATIBILITY LAB · SYNTHETIC ACCOUNTS ONLY</small><h1>${escape(title)}</h1><section>${content}</section><p><a href="/">Back to test methods</a></p></body></html>`;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.headers.host !== new URL(base).host) { res.writeHead(403); return res.end('Unexpected host'); }
    const url = new URL(req.url, base);
    const reply = (status, title, html) => { res.writeHead(status, {'Content-Type':'text/html; charset=utf-8'}); res.end(page(title, html.replace(/(<form method="post"[^>]*>)/g, `$1<input type="hidden" name="lab_csrf" value="${csrf}">`))); };
    const redirect = location => { res.writeHead(303,{Location:location}); res.end(); };
    const cookie = name => String(req.headers.cookie || '').split('; ').find(c => c.startsWith(name+'='))?.slice(name.length+1);
    const sid = cookie('lab_session'), session = sessions.get(sid);
    const authenticated = session && session.expires > now();
    const issue = () => { const token=id();sessions.set(token,{expires:now()+60000});res.setHeader('Set-Cookie',`lab_session=${token}; Path=/; HttpOnly; SameSite=Lax`);return token; };
    const cid=cookie('lab_challenge'), challenge=challenges.get(cid);
    const valid = challenge && challenge.expires > now() && challenge.attempts < 3;
    let data = new URLSearchParams();
    if (req.method==='POST') {
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)return reply(413,'Request too large','Try again.');}data=new URLSearchParams(raw);
      const origin=req.headers.origin;
      if (origin !== base && (!(!origin || origin === 'null') || data.get('lab_csrf') !== csrf)) return reply(403,'Request rejected','Use this local test page.');
    }
    if (url.pathname==='/') return reply(200,'Sign-in compatibility prototype','<p>No connection to staging, production, email providers, or Google. Codes below are synthetic test data.</p><nav>'+['email','totp','magic','sso','tab','indexeddb'].map(m=>`<a href="/login?method=${m}">${({email:'Email code',totp:'Password + authenticator code',magic:'Email sign-in link',sso:'External sign-in (simulated, not Google)',tab:'Tab-bound login',indexeddb:'IndexedDB login'})[m]}</a>`).join('')+'</nav>');
    if (url.pathname==='/login' && req.method==='GET') {
      const method=url.searchParams.get('method');if(!['email','totp','magic','sso','tab','indexeddb'].includes(method))return reply(400,'Unknown method','Choose a test method.');
      return reply(200,'Start '+method+' test',`<form method="post" action="/start"><input type="hidden" name="method" value="${method}"><label>Email<input type="email" name="email" value="tester@example.invalid" required></label><label>Test password<input type="password" name="password" required></label><small>Use the synthetic password: fixture-only</small><button>Continue</button></form>`);
    }
    if (url.pathname==='/start' && req.method==='POST') {
      const method=data.get('method');if(!['email','totp','magic','sso','tab','indexeddb'].includes(method)||data.get('email')!=='tester@example.invalid'||data.get('password')!=='fixture-only')return reply(401,'Sign-in rejected','Use only the synthetic credentials shown.');
      const token=id();challenges.set(token,{method,expires:now()+60000,code:String(crypto.randomInt(100000,999999)),nonce:id(),attempts:0});
      res.setHeader('Set-Cookie',`lab_challenge=${token}; Path=/; HttpOnly; SameSite=Lax`);return redirect('/challenge');
    }
    if (url.pathname==='/challenge') {
      if(!valid)return reply(410,'Verification expired','Start a new sign-in.');
      const {method,nonce,code}=challenge;
      if(method==='sso')return reply(200,'Simulated external provider',`<p>This checks the return-state boundary only. It does not test Google.</p><form method="post" action="/callback"><input type="hidden" name="state" value="${nonce}"><button>Approve simulated sign-in</button></form>`);
      if(method==='magic')return reply(200,'Check the test inbox',`<p>No real email was sent. Open this one-time link in this browser.</p><a href="/magic?token=${nonce}">Open synthetic email link</a>`);
      return reply(200,'Complete verification',`<form method="post" action="/verify"><label>Verification code<input name="code" inputmode="numeric" autocomplete="one-time-code" required></label><button>Verify access</button></form><p>Test ${method==='totp'?'authenticator':'email'} code: <strong>${method==='totp'?totp(now()):code}</strong></p><form method="post" action="/resend"><button>Restart verification</button></form>`);
    }
    if(url.pathname==='/resend'&&req.method==='POST') {challenges.delete(cid);return redirect('/');}
    if(['/verify','/magic','/callback'].includes(url.pathname)) {
      if(!valid)return reply(410,'Verification expired','Start a new sign-in.');
      let good=false;
      if(url.pathname==='/magic'&&challenge.method==='magic')good=url.searchParams.get('token')===challenge.nonce;
      if(url.pathname==='/callback'&&req.method==='POST'&&challenge.method==='sso')good=data.get('state')===challenge.nonce;
      if(url.pathname==='/verify'&&req.method==='POST'&&!['sso','magic'].includes(challenge.method))good=data.get('code')===(challenge.method==='totp'?totp(now()):challenge.code);
      if(!good){challenge.attempts++;return reply(401,'Code not accepted','The code is wrong or expired. <a href="/challenge">Try again</a>');}
      challenges.delete(cid);
      const token=issue();
      if(['tab','indexeddb'].includes(challenge.method)) {
        // These synthetic modes deliberately require browser storage, not a session cookie.
        res.setHeader('Set-Cookie','lab_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
        const script=challenge.method==='tab'?`sessionStorage.setItem('lab_token',${JSON.stringify(token)});location.href='/tab-protected';`:`const r=indexedDB.open('lab_auth',1);r.onupgradeneeded=()=>r.result.createObjectStore('tokens');r.onsuccess=()=>{const t=r.result.transaction('tokens','readwrite');t.objectStore('tokens').put(${JSON.stringify(token)},'access');t.oncomplete=()=>location.href='/indexeddb-protected';};`;
        return reply(200,'Completing login',`<script>${script}</script>`);
      }
      return redirect('/protected');
    }
    if(url.pathname==='/protected'||url.pathname==='/protected/second')return authenticated?reply(200,'Protected content verified','<p>Ready to scan. Access expires after one minute in this lab.</p><a href="/protected/second">Second protected page</a><form method="post" action="/cancel"><button>End test session</button></form>'):reply(401,'Login required','Complete sign-in first.');
    if(['/tab-protected','/indexeddb-protected'].includes(url.pathname)) {
      const getter=url.pathname==='/tab-protected'?`Promise.resolve(sessionStorage.getItem('lab_token'))`:`new Promise(resolve=>{const r=indexedDB.open('lab_auth');r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains('tokens'))return resolve(null);const q=db.transaction('tokens').objectStore('tokens').get('access');q.onsuccess=()=>resolve(q.result);};r.onerror=()=>resolve(null);})`;
      return reply(200,'Browser-storage access test',`<p id="status">Checking access…</p><script>${getter}.then(token=>fetch('/token-protected',{headers:{Authorization:'Bearer '+token}})).then(r=>{document.getElementById('status').textContent=r.ok?'Protected content verified':'Login required';});</script>`);
    }
    if(url.pathname==='/token-protected'){const s=sessions.get(String(req.headers.authorization||'').replace(/^Bearer /,''));res.writeHead(s&&s.expires>now()?200:401);return res.end('Synthetic protected response');}
    if(url.pathname==='/cancel'&&req.method==='POST'){sessions.delete(sid);challenges.delete(cid);return reply(200,'Session ended','This browser session can no longer open protected pages.');}
    reply(404,'Not found','Choose a test method.');
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
  return {base,totp:()=>totp(now()),close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));sessions.clear();challenges.clear();}};
}
module.exports={startFixture,totp};
if(require.main===module)startFixture({port:Number(process.env.PROTOTYPE_PORT||4399)}).then(f=>{console.log('Synthetic login lab: '+f.base);for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await f.close();process.exit(0);});});

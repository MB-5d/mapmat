// Disposable external target. Contains no Vellic credentials or real customer data.
const http = require('node:http');
const crypto = require('node:crypto');
const key = process.env.FIXTURE_CONTROL_KEY;
const deadline = Date.parse(process.env.FIXTURE_EXPIRES_AT || '');
if (!key || key.length < 32 || !Number.isFinite(deadline) || deadline < Date.now() || deadline > Date.now() + 86400000) throw Error('A private control key and a deadline within 24 hours are required.');
const runs = new Map();
const html = (res, status, body) => { res.writeHead(status, {'content-type':'text/html','cache-control':'no-store'});res.end(`<html><title>Vellic disposable test</title><body>${body}</body></html>`); };
const server = http.createServer(async (req,res) => {
 const url = new URL(req.url,'http://fixture');
 if (Date.now() >= deadline) {res.writeHead(410);res.end();return;}
 if (url.pathname === '/health') {res.end('Disposable staging test target');return;}
 if (url.pathname.startsWith('/control')) {
  if(req.headers.authorization !== 'Bearer '+key){res.writeHead(401);res.end();return;}
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(req.method==='POST' && url.pathname==='/control/runs'){
   const id=crypto.randomBytes(12).toString('hex'),token=crypto.randomBytes(24).toString('hex');
   runs.set(id,{token,slow:false,requests:[]});res.end(JSON.stringify({id,token,cookieName:'vellic_failure_fixture'}));return;
  }
  const id=url.pathname.split('/')[2],run=runs.get(id);if(!run){res.writeHead(404);res.end('{}');return;}
  if(req.method==='POST'){run.slow=url.searchParams.get('slow')==='true';run.requests=[];}
  res.end(JSON.stringify({slow:run.slow,requests:run.requests}));return;
 }
 const match=url.pathname.match(/^\/runs\/([a-f0-9]{24})(?:\/(.*))?$/),run=match&&runs.get(match[1]);
 if(!run)return html(res,404,'<h1>Not found</h1>');
 const prefix='/runs/'+match[1],tail=match[2]||'';
 const unlocked=String(req.headers.cookie||'').split(';').some(v=>v.trim()==='vellic_failure_fixture='+run.token);
 if(req.method==='POST' && tail==='login'){
  let body='';for await(const c of req){body+=c;if(body.length>1024){res.writeHead(413);res.end();return;}}
  if(new URLSearchParams(body).get('password')!==run.token)return html(res,401,`<h1>Sign in</h1><form method="post" action="${prefix}/login"><p role="alert">Incorrect password</p><input name="password" type="password" aria-invalid="true"><button>Unlock</button></form>`);
  res.writeHead(303,{'set-cookie':`vellic_failure_fixture=${run.token}; Path=${prefix}; Secure; HttpOnly; SameSite=Lax`,location:prefix+'/members'});res.end();return;
 }
 if(tail==='login'||(!unlocked&&tail.startsWith('members')))return html(res,401,`<h1>Login required</h1><form method="post" action="${prefix}/login"><input name="password" type="password"><button>Unlock</button></form>`);
 if(!/^members(?:\/next){0,150}$/.test(tail))return html(res,404,'<h1>Not found</h1>');
 run.requests.push({at:Date.now(),unlocked,path:tail});if(run.requests.length>10000)run.requests.shift();
 const page=tail.split('/').length-1;
 const body=`<h1>Disposable protected page ${page}</h1><p>No account or customer data.</p>`+(page<150?`<a href="${prefix}/${tail}/next">Next test page</a>`:'');
 const timer=setTimeout(()=>{if(!res.destroyed)html(res,200,body);},run.slow&&page>0?18000:0);res.on('close',()=>clearTimeout(timer));
});
server.listen(Number(process.env.PORT||4401),'0.0.0.0');
setTimeout(()=>server.close(()=>process.exit(0)),deadline-Date.now()).unref();

// Trusted bridge inside a fresh network namespace. The browser can reach only
// this loopback proxy; its Unix upstream is served outside the namespace.
const {spawn,execFileSync}=require('node:child_process');
const net=require('node:net');
const os=require('node:os');
(async()=>{
  if(process.getuid()!==0)throw Error('Network setup requires its supervisor.');
  execFileSync('ip',['link','set','lo','up']);
  if(Object.keys(os.networkInterfaces()).some(name=>name!=='lo'))throw Error('Unexpected browser network interface.');
  const sockets=new Set();
  const bridge=net.createServer(socket=>{
    const upstream=net.connect(process.argv[2]);
    sockets.add(socket);sockets.add(upstream);
    const stop=()=>{socket.destroy();upstream.destroy();sockets.delete(socket);sockets.delete(upstream);};
    socket.on('error',stop);upstream.on('error',stop);socket.on('close',stop);upstream.on('close',stop);
    socket.pipe(upstream);upstream.pipe(socket);
  });
  await new Promise((resolve,reject)=>{bridge.once('error',reject);bridge.listen(0,'127.0.0.1',resolve);});
  const proxy=JSON.parse(process.env.VELLIC_PROXY_AUTH);
  proxy.server='http://127.0.0.1:'+bridge.address().port;
  process.stdout.write(JSON.stringify({proxy})+'\n');
  const child=spawn('/usr/local/bin/vellic-browser-node',['/opt/vellic-browser/worker.cjs'],{
    uid:1001,gid:1001,stdio:['pipe','pipe','pipe'],
    env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp/browser-home',PLAYWRIGHT_BROWSERS_PATH:'/ms-playwright',LANG:'C.UTF-8'},
  });
  let stopped=false;
  const stop=()=>{if(stopped)return;stopped=true;child.kill('SIGKILL');for(const socket of sockets)socket.destroy();bridge.close();process.exit(0);};
  process.on('SIGTERM',stop);process.stdin.on('end',stop);
  process.stdin.pipe(child.stdin);child.stdout.pipe(process.stdout);child.stderr.resume();
  child.on('exit',stop);child.on('error',stop);
})().catch(()=>{process.stderr.write('Browser network boundary setup failed.\n');process.exit(1);});

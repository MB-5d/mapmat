// Trusted VM supervisor: browser processes receive no app files or credentials.
const {spawn}=require('node:child_process');
const {createScanAuthProxy}=require('./scanAuthProxy.cjs');
const fs=require('node:fs'),net=require('node:net'),crypto=require('node:crypto');
(async()=>{
  if(process.getuid()!==0)throw Error('Supervisor must establish the network boundary.');
  const ttl=Number(process.argv[2]);
  if(!Number.isSafeInteger(ttl)||ttl<1||ttl>1800)throw Error('Invalid lifetime.');
  const proxy=await createScanAuthProxy({allowPrivateNetworks:false}).start();
  const endpoint=new URL(proxy.server);
  const socketPath='/tmp/vellic-proxy-'+crypto.randomBytes(12).toString('hex')+'.sock';
  const bridge=net.createServer(socket=>{
    const upstream=net.connect(Number(endpoint.port),'127.0.0.1');
    const stop=()=>{socket.destroy();upstream.destroy();};
    socket.on('error',stop);upstream.on('error',stop);socket.on('close',stop);upstream.on('close',stop);
    socket.pipe(upstream);upstream.pipe(socket);
  });
  await new Promise((resolve,reject)=>{bridge.once('error',reject);bridge.listen(socketPath,resolve);});
  fs.chmodSync(socketPath,0o600);
  fs.mkdirSync('/tmp/browser-home',{recursive:true});fs.chownSync('/tmp/browser-home',1001,1001);
  const child=spawn('unshare',['--net','/usr/local/bin/vellic-browser-node','/opt/vellic-browser/namespace.cjs',socketPath],{
    stdio:['pipe','pipe','pipe'],env:{PATH:'/usr/local/bin:/usr/bin:/bin',VELLIC_PROXY_AUTH:JSON.stringify(proxy)},
  });
  let stopped=false;
  const stop=()=>{if(stopped)return;stopped=true;child.kill('SIGKILL');bridge.close();fs.rmSync(socketPath,{force:true});process.exit(0);};
  setTimeout(stop,ttl*1000).unref();process.on('SIGTERM',stop);process.stdin.on('end',stop);
  process.stdin.pipe(child.stdin);child.stdout.pipe(process.stdout);child.stderr.resume();child.on('exit',stop);child.on('error',stop);
})().catch(()=>{process.stderr.write('Browser isolation setup failed.\n');process.exit(1);});

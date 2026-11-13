const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createIsolatedBrowserPool}=require('../utils/isolatedBrowserPool.cjs');
(async()=>{
 let creates=0,destroys=0;
 const pool=createIsolatedBrowserPool({limit:1,open:async()=>{creates++;return{browser:new EventEmitter(),close:async()=>destroys++};}});
 const first=await pool.acquire({});await assert.rejects(pool.acquire({}),{code:'scan_auth_capacity'});assert.equal(creates,1);
 await Promise.all([first.close(),first.close()]);assert.equal(destroys,1);
 const second=await pool.acquire({});second.browser.emit('disconnected');await new Promise(r=>setImmediate(r));assert.equal(destroys,2);
 const third=await pool.acquire({});await pool.close();assert.equal(destroys,3);
 let release,lateRemoved=0;
 const pending=createIsolatedBrowserPool({open:()=>new Promise(resolve=>{release=resolve;})});
 const opening=pending.acquire({});await new Promise(r=>setImmediate(r));const stopping=pending.close();
 release({browser:new EventEmitter(),close:async()=>lateRemoved++});await assert.rejects(opening);await stopping;assert.equal(lateRemoved,1);
 const blocked=createIsolatedBrowserPool({limit:1,open:async()=>{throw Object.assign(Error('not removed'),{cleanupPending:true});}});
 await assert.rejects(blocked.acquire({}));await assert.rejects(blocked.acquire({}),{code:'scan_auth_capacity'});
 console.log('PASS isolated-browser capacity, close-once, disconnect, shutdown and failed-cleanup capacity preservation.');
})().catch(error=>{console.error(error);process.exitCode=1;});

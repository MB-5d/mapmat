const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const context = { self: {} }; vm.runInNewContext(fs.readFileSync(__dirname+'/extension/permissions.js','utf8'),context);
const cleanup = context.self.VELLIC_PERMISSIONS;
const permanent = 'https://pilot.example/*';
function browser({ refuse = false, retained = false, broad = false } = {}) {
  let origins = [permanent, 'https://site.example/*'], permissions = ['alarms','cookies','scripting'];
  return { permissions: {
    getAll: async () => ({origins:[...origins],permissions:[...permissions]}),
    remove: async () => { if(refuse)throw Error('Denied'); if(!retained){origins=[permanent]; permissions=['alarms'];}return !retained; },
    contains: async query => broad && query.origins?.length ? true : (query.origins||query.permissions).some(x=>origins.includes(x)||permissions.includes(x)),
  }};
}
(async()=>{
 const api=browser();assert(await cleanup.revoke(api,permanent));assert.deepEqual((await api.permissions.getAll()).origins,[permanent]);
 for(const options of [{refuse:true},{retained:true},{broad:true}])await assert.rejects(cleanup.revoke(browser(options),permanent));
 assert(await cleanup.verifyDenied({},1,'https://site.example','1'));
 assert(await cleanup.verifyDenied({cookies:{get:async()=>{throw Error("'cookies.get' is not available in this context.");}}},1,'https://site.example','1'));
 const denied=async()=>{throw Error('Cannot access contents of the page. Extension manifest must request permission.');};
 assert(await cleanup.verifyDenied({scripting:{executeScript:denied},cookies:{get:denied}},1,'https://site.example','1'));
 await assert.rejects(cleanup.verifyDenied({scripting:{executeScript:async()=>[]}},1,'https://site.example','1'));
 await assert.rejects(cleanup.verifyDenied({cookies:{get:async()=>[]}},1,'https://site.example','1'));
 await assert.rejects(cleanup.verifyDenied({scripting:{executeScript:async()=>{throw Error('Tab closed');}}},1,'https://site.example','1'));
 // Test cleanup after closing a connection window, independently of popup finally.
 const listeners={};const event=name=>({addListener:fn=>listeners[name]=fn});let revoked=0;
 const chrome={permissions:{onAdded:event('added'),getAll:async()=>({origins:['https://pilot.example/*'],permissions:['alarms']})},alarms:{create(){},clear:async()=>{},onAlarm:event('alarm')},runtime:{onStartup:event('startup'),onInstalled:event('install'),onMessageExternal:event('external'),getManifest:()=>({version:'0.4.0'})},windows:{onRemoved:event('closed')},action:{onClicked:event('clicked'),setBadgeText:async()=>{},setTitle:async()=>{}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/extension/worker.js','utf8'),{self:{VELLIC_HELPER:{origin:'https://pilot.example',appOrigin:'https://app.example'},VELLIC_PERMISSIONS:{revoke:async()=>revoked++}},chrome,importScripts(){}});
 listeners.closed(3);listeners.alarm({name:'revoke-temporary-site-access'});listeners.startup();listeners.install();await new Promise(resolve=>setImmediate(resolve));assert.equal(revoked,4);
 let reply;assert.equal(listeners.external({type:'vellic-helper-status'},{origin:'https://evil.example'},value=>{reply=value;}),false);assert.equal(reply,undefined);
 assert.equal(listeners.external({type:'vellic-helper-status'},{origin:'https://app.example'},value=>{reply=value;}),true);await new Promise(resolve=>setImmediate(resolve));assert.equal(reply.temporaryAccessRemoved,true);
 let updateChecks=0;chrome.runtime.requestUpdateCheck=async()=>{updateChecks++;return{status:'no_update'};};
 assert.equal(listeners.external({type:'vellic-helper-update'},{origin:'https://evil.example'},()=>{}),false);
 listeners.external({type:'vellic-helper-update'},{origin:'https://app.example'},value=>{reply=value;});await new Promise(resolve=>setImmediate(resolve));assert.equal(reply.updateStatus,'no_update');assert.equal(updateChecks,1);
 chrome.permissions.getAll=async()=>({origins:['https://pilot.example/*','https://site.example/*'],permissions:['alarms','cookies']});
 listeners.external({type:'vellic-helper-update'},{origin:'https://app.example'},value=>{reply=value;});await new Promise(resolve=>setImmediate(resolve));assert.equal(reply.updateStatus,'busy');assert.equal(updateChecks,1);
 console.log('Passed: named/host permission revocation, failure reporting, broad-grant detection, denied page/cookie probes and cleanup after closed windows/startup/alarm.');
})().catch(error=>{console.error(error);process.exitCode=1});

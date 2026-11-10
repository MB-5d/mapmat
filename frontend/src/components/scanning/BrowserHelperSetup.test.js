import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { vi } from 'vitest';
import BrowserHelperSetup, { checkInstalledHelper } from './BrowserHelperSetup';
import * as api from '../../api';
vi.mock('../../api', () => ({ getBrowserHelperConfig: vi.fn(), getScanAuthSession: vi.fn(), downloadBrowserHelper: vi.fn() }));
const config={enabled:true,extensionId:'a'.repeat(32),version:'0.3.0',origin:'https://pilot.example',downloadAvailable:true,temporaryAccessRemoved:true};
describe('browser helper integration',()=>{
 let container,root;
 beforeEach(()=>{ vi.clearAllMocks(); container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);api.getBrowserHelperConfig.mockResolvedValue(config); });
 afterEach(()=>{act(()=>root.unmount());container.remove();delete window.chrome;vi.useRealTimers();});
 test('missing, old and wrong-destination helpers cannot pass installation',async()=>{
  expect(await checkInstalledHelper(config,{})).toBe(false);
  for(const response of [{version:'0.2.0',origin:config.origin},{version:config.version,origin:'https://wrong.example'}]) expect(await checkInstalledHelper(config,{sendMessage:(_id,_msg,cb)=>cb(response)})).toBe(false);
  expect(await checkInstalledHelper(config,{sendMessage:(_id,_msg,cb)=>cb(config)})).toBe(true);
 });
 test('offers installation and same-folder update before connecting',async()=>{
  const onReady=vi.fn();await act(async()=>root.render(<BrowserHelperSetup onReady={onReady} onStatus={vi.fn()}/>));
  expect(container.textContent).toContain('Install or update');expect(container.textContent).toContain('existing helper folder');expect(onReady).toHaveBeenLastCalledWith(false);
 });
 test('imported session enables verification; closed dialog stops polling',async()=>{
  vi.useFakeTimers();window.chrome={runtime:{sendMessage:(_id,_msg,cb)=>cb(config)}};api.getScanAuthSession.mockResolvedValue({helperImported:true});
  const onStatus=vi.fn();await act(async()=>root.render(<BrowserHelperSetup session={{sessionId:'s',helperExpiresAt:Date.now()+60000}} onReady={vi.fn()} onStatus={onStatus}/>));
  expect(onStatus).toHaveBeenLastCalledWith('connected');expect(container.textContent).toContain('Site connected');
  act(()=>root.unmount());root=createRoot(container);const count=api.getScanAuthSession.mock.calls.length;
  await act(async()=>vi.advanceTimersByTimeAsync(10000));expect(api.getScanAuthSession).toHaveBeenCalledTimes(count);
 });
 test('import alone cannot enable scanning while helper access remains',async()=>{
  window.chrome={runtime:{sendMessage:(_id,_msg,cb)=>cb({...config,temporaryAccessRemoved:false})}};
  api.getScanAuthSession.mockResolvedValue({helperImported:true});const onStatus=vi.fn();
  await act(async()=>root.render(<BrowserHelperSetup session={{sessionId:'s',helperExpiresAt:Date.now()+60000}} onReady={vi.fn()} onStatus={onStatus}/>));
  expect(onStatus).toHaveBeenLastCalledWith('cleanup');expect(container.textContent).toContain('Waiting for the helper to end');
 });
 test('a late installation check cannot re-enable a closed dialog',async()=>{
  let resolveConfig;api.getBrowserHelperConfig.mockReturnValue(new Promise(resolve=>{resolveConfig=resolve;}));
  window.chrome={runtime:{sendMessage:(_id,_msg,cb)=>cb(config)}};const onReady=vi.fn();
  await act(async()=>root.render(<BrowserHelperSetup onReady={onReady} onStatus={vi.fn()}/>));
  act(()=>root.unmount());root=createRoot(container);await act(async()=>resolveConfig(config));
  expect(onReady.mock.calls.some(([value])=>value===true)).toBe(false);
 });
 test.each([401,403,404,410])('lost session (%s) offers a new connection instead of continuing',async(status)=>{
  window.chrome={runtime:{sendMessage:(_id,_msg,cb)=>cb(config)}};api.getScanAuthSession.mockRejectedValue(Object.assign(Error('gone'),{status}));
  const onStatus=vi.fn(),restart=vi.fn();await act(async()=>root.render(<BrowserHelperSetup session={{sessionId:'s',helperExpiresAt:Date.now()+60000}} onReady={vi.fn()} onStatus={onStatus} onRestart={restart}/>));
  expect(onStatus).toHaveBeenLastCalledWith('expired');const button=[...container.querySelectorAll('button')].find(b=>b.textContent==='Start new connection');act(()=>button.click());expect(restart).toHaveBeenCalledOnce();
 });
});

describe('reviewed store installation and protocol-compatible updates',()=>{
 test('accepts a newer compatible helper, rejects old and incompatible versions',async()=>{
  const current={...config,version:'0.4.0',protocolVersion:1};
  const response=(version,protocolVersion)=>({sendMessage:(_id,_msg,cb)=>cb({...current,version,protocolVersion})});
  expect(await checkInstalledHelper(current,response('0.4.1',1))).toBe(true);
  expect(await checkInstalledHelper(current,response('0.3.9',1))).toBe(false);
  expect(await checkInstalledHelper(current,response('0.5.0',2))).toBe(false);
 });
 test.each(['busy','throttled','update_available','no_update'])('store update state %s remains explicit',async(updateStatus)=>{
  const current={...config,version:'0.4.0',protocolVersion:1,distribution:'webstore',storeUrl:'https://chromewebstore.google.com/detail/vellic/'+config.extensionId};
  api.getBrowserHelperConfig.mockResolvedValue(current);
  window.chrome={runtime:{sendMessage:(_id,msg,cb)=>cb(msg.type==='vellic-helper-update'?{updateStatus}:null)}};
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  try {
   await act(async()=>root.render(<BrowserHelperSetup onReady={()=>{}} onStatus={()=>{}}/>));
   expect(container.querySelector('a').href).toBe(current.storeUrl);
   expect(container.textContent).not.toContain('Load unpacked');
   const button=[...container.querySelectorAll('button')].find(b=>b.textContent==='Check for helper update');
   await act(async()=>button.click());expect(container.querySelector('[role="alert"]')).not.toBeNull();
  }finally{act(()=>root.unmount());container.remove();delete window.chrome;}
 });
});

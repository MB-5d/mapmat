import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { vi } from 'vitest';
import BrowserHelperSetup, { checkInstalledHelper } from './BrowserHelperSetup';
import * as api from '../../api';
vi.mock('../../api', () => ({ getBrowserHelperConfig: vi.fn(), getScanAuthSession: vi.fn(), downloadBrowserHelper: vi.fn() }));
const config={enabled:true,extensionId:'a'.repeat(32),version:'0.3.0',origin:'https://pilot.example',downloadAvailable:true};
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
 test('lost session offers a new connection instead of continuing',async()=>{
  window.chrome={runtime:{sendMessage:(_id,_msg,cb)=>cb(config)}};api.getScanAuthSession.mockRejectedValue(Object.assign(Error('gone'),{status:404}));
  const onStatus=vi.fn(),restart=vi.fn();await act(async()=>root.render(<BrowserHelperSetup session={{sessionId:'s',helperExpiresAt:Date.now()+60000}} onReady={vi.fn()} onStatus={onStatus} onRestart={restart}/>));
  expect(onStatus).toHaveBeenLastCalledWith('expired');const button=[...container.querySelectorAll('button')].find(b=>b.textContent==='Start new connection');act(()=>button.click());expect(restart).toHaveBeenCalledOnce();
 });
});

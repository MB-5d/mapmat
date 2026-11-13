import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../../api';
import Button from '../ui/Button';

function versionAtLeast(actual, minimum) {
  if (!/^\d+(?:\.\d+){2,3}$/.test(actual || '') || !/^\d+(?:\.\d+){2,3}$/.test(minimum || '')) return false;
  const left = actual.split('.').map(Number), right = minimum.split('.').map(Number);
  for (let i=0; i<4; i++) { if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0); }
  return true;
}
export function helperMessage(config, type, runtime = window.chrome?.runtime) {
  return new Promise(resolve => {
    if (!runtime?.sendMessage) return resolve(null);
    let finished = false;
    const finish = value => { if (!finished) { finished = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => finish(null), 5000);
    try {
      runtime.sendMessage(config.extensionId, { type }, response => finish(runtime.lastError ? null : response));
    } catch { finish(null); }
  });
}
export async function checkInstalledHelper(config, runtime = window.chrome?.runtime, onAccess = () => {}) {
  const response = await helperMessage(config, 'vellic-helper-status', runtime);
  const matches = response?.origin === config.origin && (config.protocolVersion
    ? response.protocolVersion === config.protocolVersion && versionAtLeast(response.version, config.version)
    : response?.version === config.version);
  if (matches) onAccess(response.temporaryAccessRemoved === true);
  return Boolean(matches);
}

export default function BrowserHelperSetup({ session, onReady, onStatus, onRestart, loading }) {
  const requestId = useRef(0);
  const [config, setConfig] = useState(null);
  const [accessRemoved, setAccessRemoved] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState('Checking browser helper…');
  const [connection, setConnection] = useState('waiting');
  const [downloadError, setDownloadError] = useState('');
  const [updating, setUpdating] = useState(false);
  const storeUrl = config?.distribution === 'webstore' && (() => {
    try { const url=new URL(config.storeUrl); return url.origin==='https://chromewebstore.google.com' && !url.search && !url.hash && url.pathname.startsWith('/detail/') && url.pathname.split('/').at(-1)===config.extensionId ? url.href : null; } catch { return null; }
  })();
  const check = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setChecking(true); onReady(false);
    try {
      const next = await api.getBrowserHelperConfig();
      if (currentRequest !== requestId.current) return;
      if (!next.enabled || !/^[a-p]{32}$/.test(next.extensionId)) throw Error('Browser helper is unavailable.');
      setConfig(next);
      const found = await checkInstalledHelper(next, undefined, value => { if (currentRequest === requestId.current) setAccessRemoved(value); });
      if (currentRequest !== requestId.current) return;
      setInstalled(found); onReady(found);
      setMessage(found ? `Browser helper ${next.version} is ready.` : `Install or update the Chrome helper to version ${next.version}, then check again.`);
    } catch (error) { if (currentRequest !== requestId.current) return; setMessage(error.message || 'Could not check the helper. Try again.'); setInstalled(false); }
    finally { if (currentRequest === requestId.current) setChecking(false); }
  }, [onReady]);
  useEffect(() => { check(); return () => { requestId.current += 1; onReady(false); }; }, [check, onReady]);
  useEffect(() => {
    if (!session?.sessionId) { onStatus('waiting'); setConnection('waiting'); return undefined; }
    let stopped = false, timer;
    const update = value => { if (!stopped) { setConnection(value); onStatus(value); } };
    const poll = async () => {
      try {
        const result = await api.getScanAuthSession(session.sessionId);
        if (stopped) return;
        let permissionsOff = false;
        const currentHelper = config && await checkInstalledHelper(config, undefined, value => { permissionsOff = value; });
        if (stopped) return;
        setAccessRemoved(permissionsOff);
        if (result.helperImported) update(currentHelper && permissionsOff ? 'connected' : 'cleanup');
        else if (Date.now() >= session.helperExpiresAt) { update('expired'); return; }
        else update('waiting');
      } catch (error) {
        if (stopped) return;
        if ([401, 403, 404, 410].includes(error.status)) { update('expired'); return; }
        update('offline');
      }
      if (!stopped) timer = setTimeout(poll, 2500);
    };
    update('waiting'); poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [session?.sessionId, session?.helperExpiresAt, config, onStatus]);
  const download = async () => {
    setDownloadError('');
    try {
      await api.downloadBrowserHelper();
    } catch (error) { setDownloadError(error.message || 'Download failed. Try again.'); }
  };
  const update = async () => {
    setUpdating(true); setDownloadError('');
    const response = await helperMessage(config, 'vellic-helper-update');
    setUpdating(false);
    const states = {
      update_available: 'Chrome found an update. Close the helper window, then check installation again once Chrome finishes updating.',
      no_update: 'Chrome has no newer version available yet. Try again shortly.',
      throttled: 'Chrome checked recently. Wait a few minutes before trying again.',
      busy: 'Finish or cancel your site connection before updating the helper.',
    };
    setDownloadError(states[response?.updateStatus] || 'Open the helper’s Chrome Web Store page to install or update it, then check installation again.');
  };
  return <section aria-label="Browser helper setup">
    <p role="status">{message}</p>
    {installed && accessRemoved && <p>Last permission check: temporary site access was off.</p>}
    {!installed && storeUrl && <div>
      <p>Install the Vellic helper from the Chrome Web Store, then return here. Chrome handles future updates automatically.</p>
      <a className="inline-link" href={storeUrl} target="_blank" rel="noreferrer">Open Chrome Web Store</a>
      <Button variant="secondary" loading={updating} onClick={update}>Check for helper update</Button>
    </div>}
    {!installed && config?.distribution === 'webstore' && !storeUrl && <p role="alert">The helper installation link is unavailable. Please try again later.</p>}
    {!installed && config && config.distribution !== 'webstore' && <details open>
      <summary>Install or update the staging helper</summary>
      <ol>
        <li>Download and unzip this reviewed helper package into a folder you will keep.</li>
        <li>In Chrome, open <code>chrome://extensions</code> and turn on Developer mode.</li>
        <li>For a first install, choose Load unpacked and select the unzipped folder.</li>
        <li>To update, replace the files in the existing helper folder, then click its Reload button. The helper ID stays the same.</li>
        <li>Return here and choose Check installation. For a private-window scan, temporarily enable Allow in Incognito in the helper’s details.</li>
      </ol>
      <p>This is a private staging test build. Public installation and automatic updates require a reviewed Chrome Web Store release.</p>
      <Button variant="secondary" disabled={!config.downloadAvailable} onClick={download}>Download helper</Button>
    </details>}
    <Button variant="secondary" loading={checking} onClick={check}>Check installation</Button>
    {downloadError && <p role="alert">{downloadError}</p>}
    {session?.sessionId && <>
      <p role="status">{connection === 'connected' ? 'Site connected. Choose Use this login to continue.'
        : connection === 'cleanup' ? 'Site received. Waiting for the helper to end its temporary access. If cleanup fails, remove the helper and close this login dialog.'
        : connection === 'expired' ? 'This connection expired or the scanner restarted. Start a new connection.'
        : connection === 'offline' ? 'Connection interrupted. Retrying… Your login is not ready to use.'
        : 'Waiting for you to connect the signed-in site in Chrome.'}</p>
      {(connection === 'expired' || connection === 'offline') && <Button variant="secondary" disabled={!installed || loading} onClick={onRestart}>Start new connection</Button>}
    </>}
  </section>;
}

import React, { useCallback, useEffect, useState } from 'react';
import * as api from '../../api';
import Button from '../ui/Button';

export function checkInstalledHelper(config, runtime = window.chrome?.runtime) {
  return new Promise(resolve => {
    if (!runtime?.sendMessage) return resolve(false);
    let finished = false;
    const finish = value => { if (!finished) { finished = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => finish(false), 2500);
    try {
      runtime.sendMessage(config.extensionId, { type: 'vellic-helper-status' }, response => {
        const error = runtime.lastError;
        finish(!error && response?.origin === config.origin && response?.version === config.version);
      });
    } catch { finish(false); }
  });
}

export default function BrowserHelperSetup({ session, onReady, onStatus, onRestart, loading }) {
  const [config, setConfig] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState('Checking browser helper…');
  const [connection, setConnection] = useState('waiting');
  const [downloadError, setDownloadError] = useState('');
  const check = useCallback(async () => {
    setChecking(true); onReady(false);
    try {
      const next = await api.getBrowserHelperConfig();
      if (!next.enabled || !/^[a-p]{32}$/.test(next.extensionId)) throw Error('Browser helper is unavailable.');
      setConfig(next);
      const found = await checkInstalledHelper(next);
      setInstalled(found); onReady(found);
      setMessage(found ? `Browser helper ${next.version} is ready.` : `Install or update the Chrome helper to version ${next.version}, then check again.`);
    } catch (error) { setMessage(error.message || 'Could not check the helper. Try again.'); setInstalled(false); }
    finally { setChecking(false); }
  }, [onReady]);
  useEffect(() => { check(); return () => onReady(false); }, [check, onReady]);
  useEffect(() => {
    if (!session?.sessionId) { onStatus('waiting'); setConnection('waiting'); return undefined; }
    let stopped = false, timer;
    const update = value => { if (!stopped) { setConnection(value); onStatus(value); } };
    const poll = async () => {
      try {
        const result = await api.getScanAuthSession(session.sessionId);
        if (stopped) return;
        if (result.helperImported) update('connected');
        else if (Date.now() >= session.helperExpiresAt) { update('expired'); return; }
        else update('waiting');
      } catch (error) {
        if (stopped) return;
        if ([404, 410].includes(error.status)) { update('expired'); return; }
        update('offline');
      }
      if (!stopped) timer = setTimeout(poll, 2500);
    };
    update('waiting'); poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [session?.sessionId, session?.helperExpiresAt, onStatus]);
  const download = async () => {
    setDownloadError('');
    try {
      const blob = await api.downloadBrowserHelper();
      const href = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = href; link.download = `vellic-scan-helper-${config.version}.zip`; link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (error) { setDownloadError(error.message || 'Download failed. Try again.'); }
  };
  return <section aria-label="Browser helper setup">
    <p role="status">{message}</p>
    {!installed && config && <details open>
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
      <p role="status">{connection === 'connected' ? 'Site connected. Choose Use this login to verify access and scan.'
        : connection === 'expired' ? 'This connection expired or the scanner restarted. Start a new connection.'
        : connection === 'offline' ? 'Connection interrupted. Retrying… Your login is not ready to use.'
        : 'Waiting for you to connect the signed-in site in Chrome.'}</p>
      {(connection === 'expired' || connection === 'offline') && <Button variant="secondary" disabled={!installed || loading} onClick={onRestart}>Start new connection</Button>}
    </>}
  </section>;
}

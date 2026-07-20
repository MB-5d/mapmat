import React, { useEffect, useRef, useState } from 'react';

import ScanBar from '../components/scan/ScanBar';
import { sanitizeUrl } from '../utils/helpers';
import {
  DEFAULT_MARKETING_SCAN_OPTIONS,
  buildAppScanUrl,
  buildMarketingPath,
} from './marketingConfig';

const MARKETING_PHONE_BREAKPOINT = 768;

export function isMarketingPhoneViewport(source = {}) {
  const win = source.window || (typeof window !== 'undefined' ? window : null);
  const width = Number(source.width ?? win?.innerWidth ?? 1024);
  if (Number.isFinite(width) && width <= MARKETING_PHONE_BREAKPOINT) return true;
  return typeof win?.matchMedia === 'function' && win.matchMedia(`(max-width: ${MARKETING_PHONE_BREAKPOINT}px)`).matches;
}

const defaultOpenApp = (url) => {
  window.location.assign(url);
};

function MarketingScanBar({
  initialValue = '',
  onNavigate,
  onOpenApp = defaultOpenApp,
  onPhoneScan,
  buildStartPath,
  buildScanUrl = buildAppScanUrl,
  compact = false,
  placeholder = 'https://example.com',
  translateText = (source) => source,
}) {
  const t = translateText;
  const [urlValue, setUrlValue] = useState(initialValue);
  const [scanOptions, setScanOptions] = useState({ ...DEFAULT_MARKETING_SCAN_OPTIONS });
  const [showOptions, setShowOptions] = useState(false);
  const [error, setError] = useState('');
  const optionsRef = useRef(null);
  const errorId = compact ? 'marketing-scan-error-compact' : 'marketing-scan-error';

  useEffect(() => {
    if (!showOptions) return undefined;
    const handleClickOutside = (event) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target)) {
        setShowOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showOptions]);

  const handleScan = () => {
    const sanitizedUrl = sanitizeUrl(urlValue);
    if (!sanitizedUrl) {
      setError(t('Enter a public website URL, like example.com.'));
      return;
    }

    setError('');
    const appUrl = buildScanUrl(sanitizedUrl, scanOptions);

    if (isMarketingPhoneViewport()) {
      if (onPhoneScan) {
        onPhoneScan({ url: sanitizedUrl, appUrl, options: scanOptions });
        return;
      }

      const startUrl = buildStartPath
        ? buildStartPath(sanitizedUrl)
        : buildMarketingPath('start', `url=${encodeURIComponent(sanitizedUrl)}`);
      onNavigate?.(startUrl);
      return;
    }

    onOpenApp(appUrl);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') handleScan();
  };

  return (
    <div className={`marketing-scan-bar ${compact ? 'marketing-scan-bar--compact' : ''}`}>
      <div
        className={`search-container scan-bar-shell blank-scan-shell marketing-scan-bar__app-shell ${error ? 'is-invalid' : ''}`}
        aria-describedby={error ? errorId : undefined}
      >
        <ScanBar
          canEdit
          urlInput={urlValue}
          onUrlInputChange={(event) => {
            setUrlValue(event.target.value);
            if (error) setError('');
          }}
          onUrlKeyDown={handleKeyDown}
          options={scanOptions}
          showOptions={showOptions}
          optionsRef={optionsRef}
          onToggleOptions={() => setShowOptions((open) => !open)}
          onOptionChange={(key) => setScanOptions((prev) => ({ ...prev, [key]: !prev[key] }))}
          onScan={handleScan}
          scanDisabled={!urlValue.trim()}
          scanTitle={t('Scan')}
          scanLabel={t('Scan')}
          optionsLabel={t('Options')}
          scanOptionsTitle={t('Options')}
          placeholder={placeholder}
          optionsDisabled={false}
          showClearUrl={false}
        />
      </div>
      <p id={errorId} className="marketing-scan-bar__sr-only" role={error ? 'alert' : undefined}>
        {error}
      </p>
    </div>
  );
}

export default MarketingScanBar;

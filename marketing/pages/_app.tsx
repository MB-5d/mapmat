import { useEffect } from 'react';
import type { AppProps } from 'next/app';
import { clearLegacyServiceWorkers } from '../../frontend/src/utils/legacyServiceWorkerCleanup';
import '../../frontend/src/index.css';
import '../../frontend/src/App.css';
import '../../frontend/src/marketing/MarketingPreviewV2.css';
import '../src/styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    clearLegacyServiceWorkers();
  }, []);

  return <Component {...pageProps} />;
}

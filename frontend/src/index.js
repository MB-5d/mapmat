import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './App.css';
import './marketing/MarketingPreviewV2.css';
import RootApp from './RootApp';
import ErrorBoundary from './components/ErrorBoundary';
import { ConsentProvider } from './contexts/ConsentContext';
import { clearLegacyServiceWorkers } from './utils/legacyServiceWorkerCleanup';

clearLegacyServiceWorkers();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConsentProvider>
        <RootApp />
      </ConsentProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

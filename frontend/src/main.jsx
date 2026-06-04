import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { CustomerAuthProvider } from './contexts/CustomerAuthContext.jsx';
import { installInteractionGuard } from './utils/interactionGuard.js';
import { migrateLegacyHashToCleanUrl, watchLegacyHashNavigation } from './utils/navigation.js';
import './index.css';

migrateLegacyHashToCleanUrl();
const cleanupLegacyHashNavigation = watchLegacyHashNavigation();
const SERVICE_WORKER_URL = '/sw.js?v=20260604-2';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register(SERVICE_WORKER_URL, { updateViaCache: 'none' }).catch(() => {});
      return;
    }

    // Keep localhost fresh during development by removing stale SW caches.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
    });
  });
}

const cleanupInteractionGuard = installInteractionGuard();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanupInteractionGuard();
    cleanupLegacyHashNavigation();
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <CustomerAuthProvider>
        <App />
      </CustomerAuthProvider>
    </AuthProvider>
  </React.StrictMode>
);

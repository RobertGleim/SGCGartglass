import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { CustomerAuthProvider } from './contexts/CustomerAuthContext.jsx';
import { installInteractionGuard } from './utils/interactionGuard.js';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const cleanupInteractionGuard = installInteractionGuard();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanupInteractionGuard();
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

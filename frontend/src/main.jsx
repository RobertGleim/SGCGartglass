import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { CustomerAuthProvider } from './contexts/CustomerAuthContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <CustomerAuthProvider>
        <App />
      </CustomerAuthProvider>
    </AuthProvider>
  </React.StrictMode>
);

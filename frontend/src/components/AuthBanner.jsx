import React from 'react';
import useAuth from '../hooks/useAuth';
import styles from './AuthBanner.module.css';

export default function AuthBanner() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return null;
  return (
    <div className={styles.banner}>
      <span role="img" aria-label="Warning">⚠️</span> Sign in to save your design. Guest progress is lost when you close this tab.
    </div>
  );
}

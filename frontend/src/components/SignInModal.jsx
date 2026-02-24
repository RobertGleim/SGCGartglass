import React, { useState } from 'react';
import useAuth from '../hooks/useAuth';
import styles from './SignInModal.module.css';

export default function SignInModal({ open, onClose, onRegister }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await login(email, password);
      if (!res.success) setError('Invalid credentials');
      else onClose && onClose();
    } catch {
      setError('Login failed');
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        <h2>Sign In</h2>
        <form onSubmit={handleSubmit}>
          <label>Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </label>
          <label>Password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </label>
          {error && <div className={styles.error}>{error}</div>}
          <button type="submit" className={styles.submitBtn}>Sign In</button>
        </form>
        <div className={styles.links}>
          <a href="#" onClick={() => alert('Forgot password placeholder')}>Forgot Password?</a>
          <span> | </span>
          <a href="#" onClick={onRegister}>Don't have an account? Register</a>
        </div>
      </div>
    </div>
  );
}

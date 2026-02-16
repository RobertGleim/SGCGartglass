import { useState } from 'react'
import '../../styles/AdminDashboard.css'

export default function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setStatus('Signing in...')
    try {
      await onLogin(email, password)
    } catch {
      setStatus('Login failed. Check credentials.')
    }
  }

  return (
    <div className="admin-login">
      <form className="card login-card" onSubmit={handleSubmit}>
        <h2>Admin Access</h2>
        <p className="form-note">Sign in to access the dashboard.</p>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@example.com"
            required
          />
        </label>
        <label className="password-label-wrapper">
          Password
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="********"
            required
            className="password-input"
          />
          <span
            className="password-toggle"
            onClick={() => setShowPassword((v) => !v)}
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 11C3.5 6 7.5 3 11 3C14.5 3 18.5 6 21 11C18.5 16 14.5 19 11 19C7.5 19 3.5 16 1 11Z" stroke="#222" strokeWidth="2"/>
                <circle cx="11" cy="11" r="3" stroke="#222" strokeWidth="2"/>
                <line x1="5" y1="17" x2="17" y2="5" stroke="#222" strokeWidth="2"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 11C3.5 6 7.5 3 11 3C14.5 3 18.5 6 21 11C18.5 16 14.5 19 11 19C7.5 19 3.5 16 1 11Z" stroke="#222" strokeWidth="2"/>
                <circle cx="11" cy="11" r="3" stroke="#222" strokeWidth="2"/>
              </svg>
            )}
          </span>
        </label>
        <button className="button primary" type="submit">
          Sign in
        </button>
        {status && <p className="status-text">{status}</p>}
      </form>
    </div>
  )
}

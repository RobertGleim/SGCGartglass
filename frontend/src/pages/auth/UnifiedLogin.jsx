import { useState } from 'react'
import '../../styles/CustomerAuth.css'

export default function UnifiedLogin({ onAdminLogin, onCustomerLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Try admin login first
      await onAdminLogin(email, password)
      // If successful, will redirect to admin dashboard via App.jsx
    // eslint-disable-next-line no-unused-vars
    } catch (adminError) {
      // If admin login fails, try customer login
      try {
        await onCustomerLogin(email, password)
        // If successful, redirect to customer account
        window.location.hash = '#/account'
      // eslint-disable-next-line no-unused-vars
      } catch (customerError) {
        // Both failed
        setError('Invalid email or password. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="customer-auth-page">
      <h2>Sign In</h2>
      <p>Access your account or admin dashboard</p>

      {error && <div className="customer-auth-error">{error}</div>}

      <form className="customer-auth-form" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="password-field-wrapper">
          <label htmlFor="login-password">Password</label>
          <div className="password-input-wrapper">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPassword((v) => !v)}
              title={showPassword ? 'Hide password' : 'Show password'}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                  <path d="M1 11C3.5 6 7.5 3 11 3C14.5 3 18.5 6 21 11C18.5 16 14.5 19 11 19C7.5 19 3.5 16 1 11Z" stroke="currentColor" strokeWidth="2"/>
                  <circle cx="11" cy="11" r="3" stroke="currentColor" strokeWidth="2"/>
                  <line x1="5" y1="17" x2="17" y2="5" stroke="currentColor" strokeWidth="2"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                  <path d="M1 11C3.5 6 7.5 3 11 3C14.5 3 18.5 6 21 11C18.5 16 14.5 19 11 19C7.5 19 3.5 16 1 11Z" stroke="currentColor" strokeWidth="2"/>
                  <circle cx="11" cy="11" r="3" stroke="currentColor" strokeWidth="2"/>
                </svg>
              )}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <div className="customer-auth-footer">
        New customer? <a href="#/account/signup">Create an account</a>
      </div>
    </div>
  )
}

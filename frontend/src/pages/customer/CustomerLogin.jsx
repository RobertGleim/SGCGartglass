import { useState } from 'react'
import '../../styles/CustomerAuth.css'

export default function CustomerLogin({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      await onLogin(email, password)
      window.location.hash = '#/account'
    } catch (err) {
      setError(err.message || 'Unable to sign in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="customer-auth-page">
      <h2>Welcome back</h2>
      <p>Sign in to see your orders, favorites, and saved items.</p>

      {error && <div className="customer-auth-error">{error}</div>}

      <form className="customer-auth-form" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="customer-login-email">Email</label>
          <input
            id="customer-login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="customer-login-password">Password</label>
          <input
            id="customer-login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <div className="customer-auth-footer">
        New here? <a href="#/account/signup">Create an account</a>
      </div>
    </div>
  )
}

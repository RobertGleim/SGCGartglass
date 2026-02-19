import { useState } from 'react'
import '../../styles/forms/CustomerSignupForm.css'

export default function CustomerSignupForm({ onSignup }) {
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      await onSignup(form)
      window.location.hash = '#/account'
    } catch (err) {
      setError(err.message || 'Unable to create account. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="customer-auth-page">
      <h2>Create your account</h2>
      <p>Track orders, save favorites, and leave verified reviews.</p>

      {error && <div className="customer-auth-error">{error}</div>}

      <form className="customer-auth-form" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="customer-first-name">First name</label>
          <input
            id="customer-first-name"
            type="text"
            value={form.first_name}
            onChange={(event) => updateField('first_name', event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="customer-last-name">Last name</label>
          <input
            id="customer-last-name"
            type="text"
            value={form.last_name}
            onChange={(event) => updateField('last_name', event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="customer-signup-email">Email</label>
          <input
            id="customer-signup-email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => updateField('email', event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="customer-phone">Phone (optional)</label>
          <input
            id="customer-phone"
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(event) => updateField('phone', event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="customer-signup-password">Password</label>
          <input
            id="customer-signup-password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => updateField('password', event.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create account'}
        </button>
      </form>

      <div className="customer-auth-footer">
        Already have an account? <a href="#/account/login">Sign in</a>
      </div>
    </div>
  )
}

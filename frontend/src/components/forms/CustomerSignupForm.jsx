
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

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
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
      <form className="customer-auth-form" onSubmit={handleSubmit}>
        <input
          name="first_name"
          type="text"
          placeholder="First name"
          value={form.first_name}
          onChange={handleChange}
          required
        />
        <input
          name="last_name"
          type="text"
          placeholder="Last name"
          value={form.last_name}
          onChange={handleChange}
          required
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          required
        />
        <input
          name="phone"
          type="tel"
          placeholder="Phone (optional)"
          value={form.phone}
          onChange={handleChange}
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={handleChange}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create account'}
        </button>
        {error && <div className="customer-auth-error">{error}</div>}
      </form>
      <div className="customer-auth-footer">
        Already have an account? <a href="#/account/login">Sign in</a>
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { resetCustomerPassword } from '../../services/api'
import '../../styles/CustomerAuth.css'

const getResetToken = () => {
  const rawHash = window.location.hash || ''
  const queryString = rawHash.includes('?') ? rawHash.split('?')[1] : ''
  const params = new URLSearchParams(queryString)
  return params.get('token') || ''
}

export default function CustomerResetPassword() {
  const token = useMemo(() => getResetToken(), [])
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setStatus('')

    if (!token) {
      setError('This reset link is invalid. Please request a new one.')
      return
    }
    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await resetCustomerPassword(token, newPassword)
      setStatus('Password reset successfully. You can now sign in.')
      setNewPassword('')
      setConfirmPassword('')
    } catch (submitError) {
      const code = submitError?.response?.data?.error
      if (code === 'invalid_or_expired_token') {
        setError('This reset link is invalid or expired. Please request a new one.')
      } else if (code === 'password_too_short') {
        setError('Password must be at least 8 characters.')
      } else {
        setError(code || submitError?.message || 'Unable to reset password.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="customer-auth-page">
      <h2>Reset password</h2>
      <p>Enter a new password for your account.</p>

      {error && <div className="customer-auth-error">{error}</div>}
      {status && <div className="customer-auth-success">{status}</div>}

      <form className="customer-auth-form" onSubmit={handleSubmit}>
        <input
          type="text"
          name="username"
          autoComplete="username"
          value=""
          readOnly
          hidden
          aria-hidden="true"
        />

        <div>
          <label htmlFor="reset-new-password">New password</label>
          <input
            id="reset-new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="reset-confirm-password">Confirm password</label>
          <input
            id="reset-confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Resetting...' : 'Reset password'}
        </button>
      </form>

      <div className="customer-auth-footer">
        <a href="#/account/login">Back to sign in</a>
      </div>
    </div>
  )
}

import { useCallback, useMemo, useState } from 'react'
import { adminLogin } from '../services/api'
import { AuthContext } from './AuthContext'
import { isValidToken, cleanupCorruptedTokens } from '../utils/auth'

// Clean up any corrupted tokens on module load
cleanupCorruptedTokens();

export function AuthProvider({ children }) {
  const [authToken, setAuthToken] = useState(() => {
    const sessionToken = window.sessionStorage.getItem('sgcg_token') || ''
    // Force admin auth to be tab/session scoped only.
    window.localStorage.removeItem('sgcg_token')
    return isValidToken(sessionToken) ? sessionToken : ''
  })

  const logout = useCallback(() => {
    setAuthToken('')
    window.sessionStorage.removeItem('sgcg_token')
    window.localStorage.removeItem('sgcg_token')
    // Redirect to sign-in page
    if (window.location.hash.includes('/admin')) {
      window.location.hash = '#/account/login'
    }
  }, [])

  const loginWithCredentials = useCallback(async (email, password) => {
    const token = await adminLogin(email, password)
    if (isValidToken(token)) {
      setAuthToken(token)
      window.sessionStorage.setItem('sgcg_token', token)
      console.log('[Auth] Admin login successful')
    } else {
      throw new Error('Invalid authentication response from server')
    }
    return token
  }, [])

  const value = useMemo(
    () => ({
      authToken,
      login: loginWithCredentials,
      logout,
    }),
    [authToken, loginWithCredentials, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

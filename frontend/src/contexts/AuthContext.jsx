import { useCallback, useMemo, useState } from 'react'
import { adminLogin } from '../services/api'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }) {
  const [authToken, setAuthToken] = useState(
    () => window.localStorage.getItem('sgcg_token') || ''
  )

  const loginWithCredentials = useCallback(async (email, password) => {
    console.log('[Auth] Attempting admin login...')
    const token = await adminLogin(email, password)
    console.log('[Auth] Login success, token received')
    setAuthToken(token)
    window.localStorage.setItem('sgcg_token', token)
  }, [])

  const logout = useCallback(() => {
    setAuthToken('')
    window.localStorage.removeItem('sgcg_token')
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

import { useCallback, useMemo, useState } from 'react'
import { login } from '../services/api'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }) {
  const [authToken, setAuthToken] = useState(
    () => window.localStorage.getItem('sgcg_token') || ''
  )

  const loginWithCredentials = useCallback(async (email, password) => {
    const token = await login(email, password)
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

import { createContext, useCallback, useMemo, useState } from 'react'
import { customerLogin, customerSignup } from '../services/api'

export const CustomerAuthContext = createContext({
  customerToken: '',
  login: async () => {},
  signup: async () => {},
  logout: () => {},
})

export function CustomerAuthProvider({ children }) {
  const [customerToken, setCustomerToken] = useState(
    () => window.localStorage.getItem('sgcg_customer_token') || ''
  )

  const loginWithCredentials = useCallback(async (email, password) => {
    const token = await customerLogin(email, password)
    setCustomerToken(token)
    window.localStorage.setItem('sgcg_customer_token', token)
  }, [])

  const signupWithCredentials = useCallback(async (payload) => {
    const token = await customerSignup(payload)
    setCustomerToken(token)
    window.localStorage.setItem('sgcg_customer_token', token)
  }, [])

  const logout = useCallback(() => {
    setCustomerToken('')
    window.localStorage.removeItem('sgcg_customer_token')
  }, [])

  const value = useMemo(
    () => ({
      customerToken,
      login: loginWithCredentials,
      signup: signupWithCredentials,
      logout,
    }),
    [customerToken, loginWithCredentials, signupWithCredentials, logout]
  )

  return (
    <CustomerAuthContext.Provider value={value}>
      {children}
    </CustomerAuthContext.Provider>
  )
}

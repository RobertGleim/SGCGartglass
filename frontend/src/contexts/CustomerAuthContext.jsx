import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { customerLogin, customerSignup } from '../services/api'
import { isValidToken, cleanupCorruptedTokens } from '../utils/auth'

const INACTIVITY_TIMEOUT = 60 * 60 * 1000 // 1 hour in milliseconds
const CHECK_INTERVAL = 60 * 1000 // Check every minute

// Clean up any corrupted tokens on module load
cleanupCorruptedTokens();

export const CustomerAuthContext = createContext({
  customerToken: '',
  login: async () => {},
  signup: async () => {},
  logout: () => {},
})

export function CustomerAuthProvider({ children }) {
  const [customerToken, setCustomerToken] = useState(() => {
    const token = window.localStorage.getItem('sgcg_customer_token') || '';
    return isValidToken(token) ? token : '';
  })
  const lastActivityRef = useRef(Date.now())
  const checkIntervalRef = useRef(null)

  const logout = useCallback(() => {
    setCustomerToken('')
    window.localStorage.removeItem('sgcg_customer_token')
    // Redirect to sign-in page
    if (window.location.hash.includes('/account')) {
      window.location.hash = '#/account/login'
    }
  }, [])

  const loginWithCredentials = useCallback(async (email, password) => {
    const token = await customerLogin(email, password)
    if (isValidToken(token)) {
      setCustomerToken(token)
      window.localStorage.setItem('sgcg_customer_token', token)
      lastActivityRef.current = Date.now()
    } else {
      console.warn('[CustomerAuth] Login response missing valid token')
      throw new Error('Invalid authentication response from server')
    }
  }, [])

  const signupWithCredentials = useCallback(async (payload) => {
    console.log('CustomerAuthContext: signupWithCredentials called', payload)
    const token = await customerSignup(payload)
    if (isValidToken(token)) {
      setCustomerToken(token)
      window.localStorage.setItem('sgcg_customer_token', token)
      lastActivityRef.current = Date.now()
    } else {
      console.warn('[CustomerAuth] Signup response missing valid token')
      throw new Error('Invalid authentication response from server')
    }
  }, [])

  // Update last activity time on user interaction
  const updateActivity = useCallback(() => {
    if (customerToken) {
      lastActivityRef.current = Date.now()
    }
  }, [customerToken])

  // Set up activity listeners and inactivity checker
  useEffect(() => {
    if (!customerToken) {
      // Clear interval if not authenticated
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
        checkIntervalRef.current = null
      }
      return
    }

    // Reset activity timestamp when customer logs in
    lastActivityRef.current = Date.now()

    // Activity event listeners
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
    
    events.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true })
    })

    // Check for inactivity periodically
    checkIntervalRef.current = setInterval(() => {
      const now = Date.now()
      const timeSinceLastActivity = now - lastActivityRef.current

      if (timeSinceLastActivity >= INACTIVITY_TIMEOUT) {
        console.log('[CustomerAuth] Auto-logout due to inactivity')
        logout()
      }
    }, CHECK_INTERVAL)

    // Cleanup
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity)
      })
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
        checkIntervalRef.current = null
      }
    }
  }, [customerToken, updateActivity, logout])

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

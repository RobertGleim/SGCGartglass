import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { adminLogin } from '../services/api'
import { AuthContext } from './AuthContext'

const INACTIVITY_TIMEOUT = 60 * 60 * 1000 // 1 hour in milliseconds
const CHECK_INTERVAL = 60 * 1000 // Check every minute

export function AuthProvider({ children }) {
  const [authToken, setAuthToken] = useState(
    () => window.localStorage.getItem('sgcg_token') || ''
  )
  const lastActivityRef = useRef(Date.now())
  const checkIntervalRef = useRef(null)

  const logout = useCallback(() => {
    setAuthToken('')
    window.localStorage.removeItem('sgcg_token')
    // Redirect to sign-in page
    if (window.location.hash.includes('/admin')) {
      window.location.hash = '#/account/login'
    }
  }, [])

  const loginWithCredentials = useCallback(async (email, password) => {
    console.log('[Auth] Attempting admin login...')
    const token = await adminLogin(email, password)
    console.log('[Auth] Login success, token received')
    setAuthToken(token)
    window.localStorage.setItem('sgcg_token', token)
    lastActivityRef.current = Date.now()
  }, [])

  // Update last activity time on user interaction
  const updateActivity = useCallback(() => {
    if (authToken) {
      lastActivityRef.current = Date.now()
    }
  }, [authToken])

  // Set up activity listeners and inactivity checker
  useEffect(() => {
    if (!authToken) {
      // Clear interval if not authenticated
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
        checkIntervalRef.current = null
      }
      return
    }

    // Reset activity timestamp when admin logs in
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
        console.log('[Auth] Auto-logout due to inactivity')
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
  }, [authToken, updateActivity, logout])

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

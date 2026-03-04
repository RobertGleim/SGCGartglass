import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { adminLogin } from '../services/api'
import { AuthContext } from './AuthContext'
import { isValidToken, cleanupCorruptedTokens } from '../utils/auth'

const INACTIVITY_TIMEOUT = 60 * 60 * 1000 // 1 hour in milliseconds
const CHECK_INTERVAL = 60 * 1000 // Check every minute

// Clean up any corrupted tokens on module load
cleanupCorruptedTokens();

export function AuthProvider({ children }) {
  const [authToken, setAuthToken] = useState(() => {
    const sessionToken = window.sessionStorage.getItem('sgcg_token') || '';
    const persistedToken = window.localStorage.getItem('sgcg_token') || '';
    const token = sessionToken || persistedToken;
    if (!sessionToken && persistedToken) {
      window.localStorage.removeItem('sgcg_token');
    }
    return isValidToken(token) ? token : '';
  })
  const lastActivityRef = useRef(Date.now())
  const checkIntervalRef = useRef(null)

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
      window.localStorage.setItem('sgcg_token', token)
      console.log('[Auth] Admin login successful')
    } else {
      throw new Error('Invalid authentication response from server')
    }
    lastActivityRef.current = Date.now()
    return token
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

import { useEffect, useState } from 'react'

const getRoute = () => {
  const raw = window.location.hash.replace('#', '') || '/'
  // Strip query string before parsing route path
  const hash = raw.split('?')[0]
  const parts = hash.split('/').filter(Boolean)
  if (parts[0] === 'product') {
    return { path: '/product', params: { id: parts[1] } }
  }
  if (parts[0] === 'admin') {
    return { path: '/admin', params: {} }
  }
  if (parts[0] === 'account') {
    if (parts[1] === 'login') {
      return { path: '/account/login', params: {} }
    }
    if (parts[1] === 'signup') {
      return { path: '/account/signup', params: {} }
    }
    if (parts[1] === 'reset-password') {
      return { path: '/account/reset-password', params: {} }
    }
    return { path: '/account', params: {} }
  }
  if (parts[0] === 'my-projects') {
    return { path: '/my-projects', params: {} }
  }
  if (parts[0] === 'my-work-orders') {
    return { path: '/my-work-orders', params: {} }
  }
  if (parts[0] === 'designer') {
    return { path: '/designer', params: {} }
  }
  if (parts[0] === 'gallery') {
    return { path: '/gallery', params: {} }
  }
  if (parts[0] === 'checkout') {
    return { path: '/checkout', params: {} }
  }
  if (parts[0] === 'reviews') {
    return { path: '/reviews', params: {} }
  }
  if (parts[0] === 'diagnostics') {
    return { path: '/diagnostics', params: {} }
  }
  return { path: '/', params: {} }
}

export default function useHashRoute() {
  const [route, setRoute] = useState(getRoute())

  useEffect(() => {
    const handleHashChange = () => setRoute(getRoute())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  return route
}

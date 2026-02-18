import { useEffect, useState } from 'react'

const getRoute = () => {
  const hash = window.location.hash.replace('#', '') || '/'
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
    return { path: '/account', params: {} }
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

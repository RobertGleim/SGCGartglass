import { useEffect, useState } from 'react'

const parseParts = (parts) => {
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
    if (parts[1] === 'success') {
      return { path: '/checkout/success', params: {} }
    }
    return { path: '/checkout', params: {} }
  }
  if (parts[0] === 'reviews') {
    return { path: '/reviews', params: {} }
  }
  if (parts[0] === 'public-review') {
    return { path: '/public-review', params: {} }
  }
  if (parts[0] === 'diagnostics') {
    return { path: '/diagnostics', params: {} }
  }
  if (parts[0] === 'terms') {
    return { path: '/terms', params: {} }
  }
  if (parts[0] === 'privacy') {
    return { path: '/privacy', params: {} }
  }
  if (parts[0] === 'custom-order-terms') {
    return { path: '/custom-order-terms', params: {} }
  }
  if (parts[0] === 'repair-warranty') {
    return { path: '/repair-warranty', params: {} }
  }
  if (parts[0] === 'faq') {
    return { path: '/faq', params: {} }
  }
  if (parts[0] === 'stained-glass-guide') {
    return { path: '/stained-glass-guide', params: {} }
  }

  return null
}

const getRoute = () => {
  const rawHash = window.location.hash.replace('#', '') || ''
  const hashParts = rawHash.split('?')[0].split('/').filter(Boolean)
  const hashRoute = parseParts(hashParts)
  if (hashRoute) {
    return hashRoute
  }

  const pathname = window.location.pathname || '/'
  const pathParts = pathname.split('/').filter(Boolean)
  const pathRoute = parseParts(pathParts)
  if (pathRoute) {
    return pathRoute
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

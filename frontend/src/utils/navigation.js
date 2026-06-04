const normalizePath = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return '/'
  if (raw === '/') return '/'
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`
  return withLeading.replace(/\/+$/, '') || '/'
}

const extractHashRoute = (hashValue) => {
  const raw = String(hashValue || '').trim()
  if (!raw) return null

  const withoutHash = raw.startsWith('#') ? raw.slice(1) : raw
  if (!withoutHash.startsWith('/')) return null

  const [pathPart, searchPart = ''] = withoutHash.split('?')
  const path = normalizePath(pathPart)
  const search = searchPart ? `?${searchPart}` : ''
  return `${path}${search}`
}

export const getCurrentPathname = () => {
  return normalizePath(window.location.pathname || '/')
}

export const getCurrentSearch = () => {
  return String(window.location.search || '')
}

export const getCurrentUrlKey = () => `${getCurrentPathname()}${getCurrentSearch()}`

export const navigateTo = (to, { replace = false } = {}) => {
  const targetRaw = String(to || '').trim() || '/'
  const fromHash = extractHashRoute(targetRaw)
  const normalizedTarget = fromHash || targetRaw
  const target = normalizedTarget.startsWith('/') ? normalizedTarget : `/${normalizedTarget}`
  const nextUrl = new URL(target, window.location.origin)
  const nextKey = `${normalizePath(nextUrl.pathname)}${nextUrl.search}`
  const currentKey = getCurrentUrlKey()

  if (nextKey === currentKey) {
    return
  }

  if (replace) {
    window.history.replaceState({}, '', nextKey)
  } else {
    window.history.pushState({}, '', nextKey)
  }

  window.dispatchEvent(new PopStateEvent('popstate'))
  window.dispatchEvent(new Event('sgcg:navigation'))
}

export const migrateLegacyHashToCleanUrl = () => {
  const fromHash = extractHashRoute(window.location.hash)
  if (!fromHash) return false

  const currentKey = getCurrentUrlKey()
  if (fromHash === currentKey) {
    window.history.replaceState({}, '', fromHash)
    return true
  }

  window.history.replaceState({}, '', fromHash)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.dispatchEvent(new Event('sgcg:navigation'))
  return true
}

export const watchLegacyHashNavigation = () => {
  const handleHashChange = () => {
    migrateLegacyHashToCleanUrl()
  }

  window.addEventListener('hashchange', handleHashChange)
  return () => {
    window.removeEventListener('hashchange', handleHashChange)
  }
}

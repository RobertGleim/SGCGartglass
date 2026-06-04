const normalizePath = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return '/'
  if (raw === '/') return '/'
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`
  return withLeading.replace(/\/+$/, '') || '/'
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
  const target = targetRaw.startsWith('/') ? targetRaw : `/${targetRaw}`
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
  return false
}

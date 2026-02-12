const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

const request = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const message = payload.error || 'request_failed'
    throw new Error(message)
  }

  return response.json()
}

export const fetchItems = () => request('/api/items')

export const fetchItemById = (id) => request(`/api/items/${id}`)

export const login = async (email, password) => {
  const payload = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return payload.token
}

export const createItem = async (token, listingValue) => {
  return request('/api/items', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      etsy_listing_id: listingValue,
      etsy_url: listingValue,
    }),
  })
}

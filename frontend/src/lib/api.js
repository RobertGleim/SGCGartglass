const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

const request = async (path, options = {}) => {
  console.log(`Making ${options.method || 'GET'} request to ${path}`, {
    headers: options.headers,
    bodyLength: options.body?.length,
    hasBody: !!options.body
  })
  
  const { headers: optionsHeaders, ...restOptions } = options
  
  const fetchOptions = {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(optionsHeaders || {}),
    },
  }
  
  console.log('Fetch options:', fetchOptions)
  
  const response = await fetch(`${API_BASE}${path}`, fetchOptions)

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const message = payload.error || `request_failed (${response.status})`
    // Include status for 401 Unauthorized detection
    if (response.status === 401) {
      throw new Error(`Unauthorized: ${message}`)
    }
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

export const fetchManualProducts = () => request('/api/manual-products')

export const fetchManualProductById = (id) => request(`/api/manual-products/${id}`)

export const createManualProduct = async (token, productData) => {
  console.log('createManualProduct called with:', { token: token?.substring(0, 20) + '...', productData })
  return request('/api/manual-products', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(productData),
  })
}

export const updateManualProduct = async (token, id, productData) => {
  return request(`/api/manual-products/${id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(productData),
  })
}

export const deleteManualProduct = async (token, id) => {
  console.log('deleteManualProduct called with id:', id)
  return request(`/api/manual-products/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

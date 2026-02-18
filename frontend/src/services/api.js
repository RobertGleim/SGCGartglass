import { request } from '../utils/request'

export const fetchItems = () => request('/api/items')

export const fetchItemById = (id) => request(`/api/items/${id}`)

export const login = async (email, password) => {
  const payload = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return payload.token
}

export const createItem = async (token, listingValue) =>
  request('/api/items', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      etsy_listing_id: listingValue,
      etsy_url: listingValue,
    }),
  })

export const fetchManualProducts = () => request('/api/manual-products')

export const fetchManualProductById = (id) => request(`/api/manual-products/${id}`)

export const createManualProduct = async (token, productData) => {
  console.log('createManualProduct called with:', {
    token: token?.substring(0, 20) + '...',
    productData,
  })
  return request('/api/manual-products', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(productData),
  })
}

export const updateManualProduct = async (token, id, productData) => {
  console.log('updateManualProduct called with:', {
    token: token ? `${token.substring(0, 20)}...` : 'NO TOKEN',
    id,
    productData
  })
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

export const customerSignup = async (payload) => {
  const response = await request('/api/customer/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return response.token
}

export const customerLogin = async (email, password) => {
  const response = await request('/api/customer/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return response.token
}

export const fetchCustomerProfile = (token) =>
  request('/api/customer/me', {
    headers: { Authorization: `Bearer ${token}` },
  })

export const fetchCustomerAddresses = (token) =>
  request('/api/customer/addresses', {
    headers: { Authorization: `Bearer ${token}` },
  })

export const addCustomerAddress = (token, payload) =>
  request('/api/customer/addresses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })

export const fetchCustomerFavorites = (token) =>
  request('/api/customer/favorites', {
    headers: { Authorization: `Bearer ${token}` },
  })

export const addCustomerFavorite = (token, payload) =>
  request('/api/customer/favorites', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })

export const removeCustomerFavorite = (token, favoriteId) =>
  request(`/api/customer/favorites/${favoriteId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })

export const fetchCustomerCart = (token) =>
  request('/api/customer/cart', {
    headers: { Authorization: `Bearer ${token}` },
  })

export const addCustomerCartItem = (token, payload) =>
  request('/api/customer/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })

export const updateCustomerCartItem = (token, itemId, payload) =>
  request(`/api/customer/cart/items/${itemId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })

export const removeCustomerCartItem = (token, itemId) =>
  request(`/api/customer/cart/items/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })

export const fetchCustomerOrders = (token) =>
  request('/api/customer/orders', {
    headers: { Authorization: `Bearer ${token}` },
  })

export const fetchCustomerOrderItems = (token, orderId) =>
  request(`/api/customer/orders/${orderId}/items`, {
    headers: { Authorization: `Bearer ${token}` },
  })

export const fetchCustomerReviews = (token) =>
  request('/api/customer/reviews', {
    headers: { Authorization: `Bearer ${token}` },
  })

export const fetchProductReviews = (productType, productId) =>
  request(`/api/reviews?product_type=${productType}&product_id=${productId}`)

export const createCustomerReview = (token, payload) =>
  request('/api/customer/reviews', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })

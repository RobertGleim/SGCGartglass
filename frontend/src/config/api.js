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

export const updateManualProduct = async (token, id, productData) =>
  request(`/api/manual-products/${id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(productData),
  })

export const deleteManualProduct = async (token, id) => {
  console.log('deleteManualProduct called with id:', id)
  return request(`/api/manual-products/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

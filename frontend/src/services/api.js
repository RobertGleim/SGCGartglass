export const fetchCustomers = () => api.get('/customers');
export const updateManualProduct = (id, product) => api.put(`/manual-products/${id}`, product);
export const fetchManualProducts = () => api.get('/manual-products');
export const fetchItems = () => api.get('/items');
export const deleteManualProduct = (id) => api.delete(`/manual-products/${id}`);
export const createManualProduct = (product) => api.post('/manual-products', product);
export const createItem = (item) => api.post('/items', item);
// Customer profile/address/favorites/cart/orders/reviews APIs
export const fetchCustomerProfile = () => api.get('/customer/profile');
export const fetchCustomerAddresses = () => api.get('/customer/addresses');
export const addCustomerAddress = (address) => api.post('/customer/addresses', address);
export const fetchCustomerFavorites = () => api.get('/customer/favorites');
export const removeCustomerFavorite = (id) => api.delete(`/customer/favorites/${id}`);
export const fetchCustomerCart = () => api.get('/customer/cart');
export const updateCustomerCartItem = (itemId, data) => api.put(`/customer/cart/${itemId}`, data);
export const removeCustomerCartItem = (itemId) => api.delete(`/customer/cart/${itemId}`);
export const fetchCustomerOrders = () => api.get('/customer/orders');
export const fetchCustomerOrderItems = (orderId) => api.get(`/customer/orders/${orderId}/items`);
export const fetchCustomerReviews = () => api.get('/customer/reviews');
export const createCustomerReview = (review) => api.post('/customer/reviews', review);
export const customerLogin = async (email, password) => {
  const res = await api.post('/auth/customer/login', { email, password });
  return res?.token || res?.access_token || res?.jwt || '';
};

export const adminLogin = async (email, password) => {
  const res = await api.post('/auth/login', { email, password });
  return res?.token || res?.access_token || res?.jwt || '';
};

export const customerSignup = async (payload) => {
  console.log('customerSignup: function called', payload)
  try {
    const res = await api.post('/customer/signup', payload)
    console.log('customerSignup: response', res)
    return res.token
  } catch (err) {
    console.error('customerSignup: error', err)
    return undefined
  }
};
import axios from 'axios';
import { getAuthToken } from '../utils/auth';

console.log('api.js: VITE_API_BASE_URL =', import.meta.env.VITE_API_BASE_URL)
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
});

api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // Log the error for debugging but do NOT alert — let calling code handle it
    const message = error.response?.data?.error || error.message;
    console.error('[API error]', error.response?.status, message);
    return Promise.reject(error);
  }
);

export const getTemplates = (filters) => api.get('/templates', { params: filters });
export const getTemplate = (id) => api.get(`/templates/${id}`);
export const saveProject = (data) => api.post('/projects/save', data);
export const submitWorkOrder = (data) => api.post('/work-orders/submit', data);
export const getMyProjects = () => api.get('/projects');
export const getMyWorkOrders = () => api.get('/work-orders');
export const getAdminTemplates = () => api.get('/admin/templates');
export const getAdminGlassTypes = () => api.get('/admin/glass-types');
export const getAdminWorkOrders = () => api.get('/admin/work-orders');
export const updateWorkOrderStatus = (id, status, notes) => api.put(`/admin/work-orders/${id}/status`, { new_status: status, notes });

export default api;

const toArrayResponse = (res) => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.results)) return res.results;
  if (Array.isArray(res?.customers)) return res.customers;
  if (Array.isArray(res?.products)) return res.products;
  return [];
};

export const fetchCustomers = async () => toArrayResponse(await api.get('/customers'));
export const updateCustomer = (id, payload) => api.put(`/customers/${id}`, payload);
export const deleteCustomer = (id) => api.delete(`/customers/${id}`);
export const getCustomerDetails = (id) => api.get(`/customers/${id}/details`);
export const updateManualProduct = (id, product) => api.put(`/manual-products/${id}`, product);
export const fetchManualProducts = async (params = {}) => toArrayResponse(await api.get('/manual-products', { params }));
export const fetchManualProduct = (id) => api.get(`/manual-products/${id}`);
export const fetchItems = async () => toArrayResponse(await api.get('/items'));
export const deleteManualProduct = (id) => api.delete(`/manual-products/${id}`);
export const createManualProduct = (product) => api.post('/manual-products', product);
export const publishManualProductToFacebook = (id) => api.post(`/admin/manual-products/${id}/facebook-post`);
export const createItem = (item) => api.post('/items', item);
// Customer profile/address/favorites/cart/orders/reviews APIs
export const fetchCustomerProfile = () => api.get('/customer/me');
export const updateCustomerProfile = (payload) => api.put('/customer/me', payload);
export const fetchCustomerAddresses = () => api.get('/customer/addresses');
export const addCustomerAddress = (address) => api.post('/customer/addresses', address);
export const upsertCustomerPrimaryAddress = (address) => api.put('/customer/addresses/primary', address);
export const changeCustomerPassword = (payload) => api.put('/customer/password', payload);
export const fetchCustomerFavorites = () => api.get('/customer/favorites');
export const addCustomerFavorite = (payload) => api.post('/customer/favorites', payload);
export const removeCustomerFavorite = (id) => api.delete(`/customer/favorites/${id}`);
export const fetchCustomerCart = () => api.get('/customer/cart');
export const addCustomerCartItem = (payload) => api.post('/customer/cart/items', payload);
export const updateCustomerCartItem = (itemId, data) => api.put(`/customer/cart/items/${itemId}`, data);
export const removeCustomerCartItem = (itemId) => api.delete(`/customer/cart/items/${itemId}`);
export const fetchCustomerCartSummary = () => api.get('/customer/cart/summary');
export const createCheckoutIntent = (payload) => api.post('/customer/checkout/intent', payload);
export const placeCustomerOrder = (payload) => api.post('/customer/checkout/place-order', payload);
export const fetchCustomerOrders = () => api.get('/customer/orders');
export const fetchCustomerOrderItems = (orderId) => api.get(`/customer/orders/${orderId}/items`);
export const fetchAdminRecentOrders = (params = {}) => api.get('/admin/orders/recent', { params });
export const markAdminOrderSeen = (orderId) => api.put(`/admin/orders/${orderId}/seen`);
export const fetchCustomerReviews = () => api.get('/customer/reviews');
export const createCustomerReview = (review) => api.post('/customer/reviews', review);
const extractAuthToken = (payload) => {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  return (
    payload.token
    || payload.access_token
    || payload.accessToken
    || payload.jwt
    || payload.jwt_token
    || payload.authToken
    || payload?.data?.token
    || payload?.data?.access_token
    || payload?.data?.accessToken
    || payload?.data?.jwt
    || ''
  );
};

export const customerLogin = async (email, password) => {
  const res = await api.post('/customer/login', { email, password });
  return extractAuthToken(res);
};

export const requestCustomerPasswordReset = (email) =>
  api.post('/customer/password/forgot', { email });

export const resetCustomerPassword = (token, newPassword) =>
  api.post('/customer/password/reset', { token, new_password: newPassword });

export const adminLogin = async (email, password) => {
  const res = await api.post('/auth/login', { email, password });
  return extractAuthToken(res);
};

export const customerSignup = async (payload) => {
  try {
    const res = await api.post('/customer/signup', payload)
    return res.token
  } catch {
    return undefined
  }
};
import axios from 'axios';
import { getAuthToken, isValidToken, cleanupCorruptedTokens } from '../utils/auth';

// Clean up any corrupted tokens on module load
cleanupCorruptedTokens();

const configuredBaseURL = import.meta.env.VITE_API_BASE_URL || '/api';
const isLocalDevHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const baseURL = isLocalDevHost ? '/api' : configuredBaseURL;
const api = axios.create({
  baseURL,
  withCredentials: false,
});

const getRoutePath = () => {
  const hash = window.location.hash || '';
  return hash.startsWith('#') ? hash.slice(1) : hash;
};

const isTopLevelEndpoint = (requestUrl, endpoint) =>
  requestUrl === endpoint || requestUrl.startsWith(`${endpoint}/`);

const getTokenForRequest = (config) => {
  const adminToken = sessionStorage.getItem('sgcg_token')
    || localStorage.getItem('sgcg_token')
    || '';
  const customerToken = sessionStorage.getItem('sgcg_customer_token')
    || localStorage.getItem('sgcg_customer_token')
    || '';
  const requestUrl = String(config?.url || '');
  const routePath = getRoutePath();

  const isAdminScopedEndpoint =
    isTopLevelEndpoint(requestUrl, '/manual-products')
    || isTopLevelEndpoint(requestUrl, '/items')
    || isTopLevelEndpoint(requestUrl, '/customers');

  // Admin API endpoints must always use admin token.
  if (
    requestUrl.startsWith('/admin/')
    || requestUrl.includes('/admin/')
    || isAdminScopedEndpoint
  ) {
    return isValidToken(adminToken) ? adminToken : '';
  }

  // Customer account/workflow routes should prioritize customer auth.
  const isCustomerRoute =
    routePath.startsWith('/account')
    || routePath.startsWith('/checkout')
    || routePath.startsWith('/my-work-orders')
    || routePath.startsWith('/my-projects')
    || routePath.startsWith('/designer');

  if (isCustomerRoute && isValidToken(customerToken)) {
    return customerToken;
  }

  // Default for non-admin endpoints: prefer customer token, then fallback.
  if (isValidToken(customerToken)) return customerToken;
  if (isValidToken(adminToken)) return adminToken;

  return getAuthToken();
};

api.interceptors.request.use(
  (config) => {
    const token = getTokenForRequest(config);
    if (token && isValidToken(token)) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalConfig = error?.config || {};

    if (
      error?.message === 'Network Error'
      && isLocalDevHost
      && !originalConfig.__networkRetry
    ) {
      const retryConfig = {
        ...originalConfig,
        baseURL: '/api',
        __networkRetry: true,
      };
      console.warn('[API] Network error detected, retrying once via local proxy base /api:', retryConfig.url);
      return api.request(retryConfig);
    }

    // Check if error response is HTML (404 or misconfigured routing)
    if (error.response?.data && typeof error.response.data === 'string' && error.response.data.startsWith('<!')) {
      console.error('[API] Server returned HTML instead of JSON. Likely API routing misconfiguration.');
      console.error('[API] Request URL:', error.config?.url);
      console.error('[API] Request method:', error.config?.method);
      console.error('[API] Status:', error.response?.status);
    }
    
    // Don't log 401s for auth endpoints (expected during unified login flow)
    const isAuthEndpoint = error.config?.url?.includes('/auth/login');
    const is401 = error.response?.status === 401;
    const apiErrorCode = error.response?.data?.error || error.response?.data?.detail;

    if (is401 && String(apiErrorCode || '').toLowerCase().includes('token_expired')) {
      const authHeader = String(error.config?.headers?.Authorization || '');
      const usedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      const sessionAdminToken = sessionStorage.getItem('sgcg_token') || '';
      const sessionCustomerToken = sessionStorage.getItem('sgcg_customer_token') || '';
      const storedAdminToken = localStorage.getItem('sgcg_token') || '';
      const storedCustomerToken = localStorage.getItem('sgcg_customer_token') || '';

      if (usedToken && usedToken === sessionAdminToken) {
        sessionStorage.removeItem('sgcg_token');
      }
      if (usedToken && usedToken === sessionCustomerToken) {
        sessionStorage.removeItem('sgcg_customer_token');
      }
      if (usedToken && usedToken === storedAdminToken) {
        localStorage.removeItem('sgcg_token');
      }
      if (usedToken && usedToken === storedCustomerToken) {
        localStorage.removeItem('sgcg_customer_token');
      }
    }
    
    if (!isAuthEndpoint || !is401) {
      const message = error.response?.data?.error || error.message;
      console.error('[API error]', error.response?.status, message);
    }
    return Promise.reject(error);
  }
);

export const getTemplates = (filters) => api.get('/templates', { params: filters });
export const getTemplate = (id) => api.get(`/templates/${id}`);
export const saveProject = (data) => api.post('/projects/save', data);
export const getProject = (id) => api.get(`/projects/${id}`);
export const deleteProject = (id) => api.delete(`/projects/${id}`);
export const submitWorkOrder = (data) => api.post('/work-orders/submit', data);
export const getMyProjects = () => api.get('/projects');
export const getMyWorkOrders = () => api.get('/work-orders');
export const getAdminTemplates = () => api.get('/admin/templates');
export const getAdminGlassTypes = () => api.get('/admin/glass-types');
export const getAdminWorkOrders = () => api.get('/admin/work-orders');
export const getAdminWorkOrder = (id) => api.get(`/admin/work-orders/${id}`);
export const updateWorkOrderStatus = (id, status, notes) => api.put(`/admin/work-orders/${id}/status`, { new_status: status, notes });
export const updateAdminWorkOrderDesign = (id, design_data) => api.put(`/admin/work-orders/${id}/design-data`, { design_data });
export const uploadAdminTemplateImage = (formData) =>
  api.post('/admin/templates/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const createAdminTemplate = (payload) => api.post('/admin/templates', payload);
export const sendTemplateToCustomerWorkOrder = (customerId, payload) =>
  api.post(`/admin/customers/${customerId}/template-message`, payload);

// Revision endpoints
export const getWorkOrderRevisions = (id) => api.get(`/work-orders/${id}/revisions`);
export const createCustomerRevision = (id, design_data, notes) =>
  api.post(`/work-orders/${id}/revisions`, { design_data, notes });
export const approveWorkOrder = (id) => api.put(`/work-orders/${id}/approve`);
export const getWorkOrder = (id) => api.get(`/work-orders/${id}`);

export const getAdminWorkOrderRevisions = (id) => api.get(`/admin/work-orders/${id}/revisions`);
export const createAdminRevision = (id, design_data, notes, sendForReview = false) =>
  api.post(`/admin/work-orders/${id}/revisions`, { design_data, notes, send_for_review: sendForReview });

export const getGalleryPhotos = (filters) => api.get('/gallery/photos', { params: filters });
export const submitGalleryPhoto = (formData) => api.post('/gallery/photos', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
export const getAdminGalleryPhotos = (filters) => api.get('/admin/gallery/photos', { params: filters });
export const updateAdminGalleryPhoto = (id, payload) => api.put(`/admin/gallery/photos/${id}`, payload);
export const deleteAdminGalleryPhoto = (id) => api.delete(`/admin/gallery/photos/${id}`);

export default api;

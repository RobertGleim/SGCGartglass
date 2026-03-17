/**
 * Validates that a token looks like a JWT (not HTML or garbage)
 */
function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadBase64 + '='.repeat((4 - (payloadBase64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isValidToken(token) {
  if (!token || typeof token !== 'string') return false;
  // Reject HTML responses
  if (token.startsWith('<!') || token.startsWith('<html')) return false;
  // Basic JWT format check: header.payload.signature
  const parts = token.split('.');
  if (!(parts.length === 3 && parts.every(p => p.length > 0))) return false;

  // If token has exp, enforce expiry check to avoid repeated 401 polling.
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const exp = Number(payload.exp);
  if (Number.isFinite(exp)) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (exp <= nowSeconds) return false;
  }

  return true;
}

/**
 * Cleans up corrupted tokens from localStorage
 */
export function cleanupCorruptedTokens() {
  const sessionAdminToken = sessionStorage.getItem('sgcg_token');
  const sessionCustomerToken = sessionStorage.getItem('sgcg_customer_token');
  const adminToken = localStorage.getItem('sgcg_token');
  const customerToken = localStorage.getItem('sgcg_customer_token');

  if (sessionAdminToken && !isValidToken(sessionAdminToken)) {
    console.warn('[Auth] Removing corrupted admin session token from storage');
    sessionStorage.removeItem('sgcg_token');
  }
  if (sessionCustomerToken && !isValidToken(sessionCustomerToken)) {
    console.warn('[Auth] Removing corrupted customer session token from storage');
    sessionStorage.removeItem('sgcg_customer_token');
  }
  
  if (adminToken && !isValidToken(adminToken)) {
    console.warn('[Auth] Removing corrupted admin token from storage');
    localStorage.removeItem('sgcg_token');
  }
  if (customerToken && !isValidToken(customerToken)) {
    console.warn('[Auth] Removing corrupted customer token from storage');
    localStorage.removeItem('sgcg_customer_token');
  }
}

export function isAuthenticated() {
  const token = getAuthToken();
  return isValidToken(token);
}

export function getUser() {
  try {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}

export function getAuthToken() {
  // Check session tokens first, then fallback to persisted tokens
  const sessionAdminToken = sessionStorage.getItem('sgcg_token') || '';
  if (isValidToken(sessionAdminToken)) return sessionAdminToken;

  const sessionCustomerToken = sessionStorage.getItem('sgcg_customer_token') || '';
  if (isValidToken(sessionCustomerToken)) return sessionCustomerToken;

  const adminToken = localStorage.getItem('sgcg_token') || '';
  if (isValidToken(adminToken)) return adminToken;
  
  const customerToken = localStorage.getItem('sgcg_customer_token') || '';
  return isValidToken(customerToken) ? customerToken : '';
}

export function logout() {
  sessionStorage.removeItem('sgcg_token');
  sessionStorage.removeItem('sgcg_customer_token');
  localStorage.removeItem('sgcg_token');
  localStorage.removeItem('sgcg_customer_token');
  localStorage.removeItem('user');
  window.location.href = '/';
}

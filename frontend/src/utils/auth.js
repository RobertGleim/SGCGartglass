/**
 * Validates that a token looks like a JWT (not HTML or garbage)
 */
export function isValidToken(token) {
  if (!token || typeof token !== 'string') return false;
  // Reject HTML responses
  if (token.startsWith('<!') || token.startsWith('<html')) return false;
  // Basic JWT format check: header.payload.signature
  const parts = token.split('.');
  return parts.length === 3 && parts.every(p => p.length > 0);
}

/**
 * Cleans up corrupted tokens from localStorage
 */
export function cleanupCorruptedTokens() {
  const adminToken = localStorage.getItem('sgcg_token');
  const customerToken = localStorage.getItem('sgcg_customer_token');
  
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
  const token = localStorage.getItem('sgcg_token') || '';
  // Don't return corrupted tokens
  return isValidToken(token) ? token : '';
}

export function logout() {
  localStorage.removeItem('sgcg_token');
  localStorage.removeItem('sgcg_customer_token');
  localStorage.removeItem('user');
  window.location.href = '/';
}

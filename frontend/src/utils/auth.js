export function isAuthenticated() {
  return !!getAuthToken();
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
  return localStorage.getItem('sgcg_token') || '';
}

export function logout() {
  localStorage.removeItem('sgcg_token');
  localStorage.removeItem('user');
  window.location.href = '/';
}

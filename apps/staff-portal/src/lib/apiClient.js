// Lightweight fetch-based API client (same as citizen-pwa).
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

const ACCESS_KEY = 'dlpms.staff.accessToken';
const REFRESH_KEY = 'dlpms.staff.refreshToken';
const USER_KEY = 'dlpms.staff.user';

export const storage = {
  getAccess() { return localStorage.getItem(ACCESS_KEY); },
  getRefresh() { return localStorage.getItem(REFRESH_KEY); },
  getUser() {
    const raw = localStorage.getItem(USER_KEY);
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  setSession({ user, accessToken, refreshToken }) {
    if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  }
};

async function refreshTokens() {
  const refresh = storage.getRefresh();
  if (!refresh) return null;
  const res = await fetch(`${API_BASE}/auth/token/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh })
  });
  if (!res.ok) return null;
  const data = await res.json();
  storage.setSession(data);
  return data.accessToken;
}

export async function apiRequest(path, { method = 'GET', body, headers = {}, returnRaw = false, skipAuth = false } = {}) {
  const finalHeaders = { ...headers };
  if (body && !(body instanceof FormData)) {
    finalHeaders['content-type'] = 'application/json';
  }
  if (!skipAuth) {
    const token = storage.getAccess();
    if (token) finalHeaders.authorization = `Bearer ${token}`;
  }

  const init = {
    method,
    headers: finalHeaders,
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {})
  };

  let res = await fetch(`${API_BASE}${path}`, init);

  if (res.status === 401 && !skipAuth) {
    const newToken = await refreshTokens();
    if (newToken) {
      finalHeaders.authorization = `Bearer ${newToken}`;
      const retryInit = {
        method,
        headers: finalHeaders,
        ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {})
      };
      res = await fetch(`${API_BASE}${path}`, retryInit);
    }
  }

  if (returnRaw) return res;

  if (!res.ok) {
    let err;
    try { err = await res.json(); } catch { err = { error: { message: res.statusText } }; }
    const e = new Error(err?.error?.message ?? 'Request failed');
    e.status = res.status;
    e.code = err?.error?.code;
    e.details = err?.error?.details;
    throw e;
  }

  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

export const api = {
  get: (path, opts) => apiRequest(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => apiRequest(path, { ...opts, method: 'POST', body }),
  patch: (path, body, opts) => apiRequest(path, { ...opts, method: 'PATCH', body }),
  put: (path, body, opts) => apiRequest(path, { ...opts, method: 'PUT', body }),
  del: (path, opts) => apiRequest(path, { ...opts, method: 'DELETE' }),
  raw: (path, opts) => apiRequest(path, { ...opts, returnRaw: true })
};

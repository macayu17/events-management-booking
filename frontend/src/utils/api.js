import axios from 'axios';

const configuredApiUrl = import.meta.env.VITE_API_URL;

if (import.meta.env.PROD && !configuredApiUrl) {
  throw new Error('VITE_API_URL must be configured for production builds');
}

const normalizeUrl = (url) => String(url || '').replace(/\/+$/, '');

export const API_URL = normalizeUrl(configuredApiUrl || 'http://localhost:5000/api');
export const BACKEND_URL = API_URL.replace(/\/api$/, '');

export const buildApiUrl = (path) => `${API_URL}/${String(path || '').replace(/^\/+/, '')}`;

const isProtectedRequest = (config = {}) => {
  if (config.skipAuthRedirect) return false;

  const url = String(config.url || '');
  return [
    '/admin',
    '/discounts',
    '/team',
    '/tickets/verify',
    '/push'
  ].some(prefix => url.startsWith(prefix));
};

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && isProtectedRequest(error.config)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (import.meta.env.DEV) {
    return url;
  }
  return `${BACKEND_URL}${url}`;
};

export default api;

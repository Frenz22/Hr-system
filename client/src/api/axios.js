import axios from 'axios';

const api = axios.create({ baseURL: '/api', withCredentials: true });

let accessToken = localStorage.getItem('hr_access_token') || null;

export function setAccessToken(token) {
  accessToken = token;
  if (token) localStorage.setItem('hr_access_token', token);
  else localStorage.removeItem('hr_access_token');
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshPromise = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const isAuthRoute = original?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && !original._retried && !isAuthRoute) {
      original._retried = true;
      try {
        refreshPromise ||= api.post('/auth/refresh');
        const { data } = await refreshPromise;
        refreshPromise = null;
        setAccessToken(data.accessToken);
        return api(original);
      } catch {
        refreshPromise = null;
        setAccessToken(null);
        window.dispatchEvent(new Event('hr:logout'));
      }
    }
    return Promise.reject(error);
  }
);

export default api;

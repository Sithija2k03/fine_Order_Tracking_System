import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Log responses for debugging
api.interceptors.response.use(
  (response) => response,   // (success logging removed — it slowed phones with large payloads)
  (error) => {
    console.error('API Error:', error.config?.url, error.response?.data);
    return Promise.reject(error);
  }
);

export default api;
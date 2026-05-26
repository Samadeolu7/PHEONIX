export const env = {
  API_URL: '/api', // Force proxy usage for production
  API_BASE: import.meta.env.VITE_API_BASE || '',
};

export function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.localStorage) {
    const custom = localStorage.getItem('pos_api_url');
    if (custom) return custom;
  }
  return import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000`;
}

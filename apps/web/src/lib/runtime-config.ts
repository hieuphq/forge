declare global {
  interface Window {
    __APP_CONFIG__?: { API_URL?: string };
  }
}

export const apiBaseUrl =
  window.__APP_CONFIG__?.API_URL ??
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:3000";

export const MIN_ATTRACTIONS_ZOOM = 13;
export const API_BASE = import.meta.env.VITE_API_BASE || "";

// We default to "admin:password" as per your server.js fallback
// btoa("admin:password") -> "YWRtaW46cGFzc3dvcmQ="
// If you change the username/password on the live server, you need to update this!
export const AUTH_HEADER = {
  "Authorization": "Basic YWRtaW46cGFzc3dvcmQ="
};

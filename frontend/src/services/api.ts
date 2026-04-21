import { getStoredToken } from "../contexts/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const TIMEOUT_MS = 12000;

async function request(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const token = getStoredToken();

  // Check token expiry before making the request
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem("sweet_home_token");
        localStorage.removeItem("sweet_home_user");
        window.location.reload();
        throw new Error("Sesión expirada");
      }
    } catch (e) {
      if (e instanceof Error && e.message === "Sesión expirada") throw e;
      // Malformed token — will fail on server anyway
    }
  }

  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
        ...options.headers,
      },
      signal: controller.signal,
      ...options,
    });

    if (response.status === 401) {
      // Only reload if user had a session (token expired). If there was never a
      // token, silently throw so unauthenticated sync attempts don't loop.
      const hadToken = !!localStorage.getItem("sweet_home_token");
      localStorage.removeItem("sweet_home_token");
      localStorage.removeItem("sweet_home_user");
      if (hadToken) window.location.reload();
      throw new Error("Sesión expirada");
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    if (response.status === 204) return null;
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body: any) =>
    request(path, { method: "POST", body: JSON.stringify(body) }),
  put: (path: string, body: any) =>
    request(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path: string, body?: any) =>
    request(
      path,
      body === undefined
        ? { method: "DELETE" }
        : { method: "DELETE", body: JSON.stringify(body) }
    ),
};

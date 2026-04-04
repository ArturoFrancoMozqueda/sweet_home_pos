import { getStoredToken } from "../contexts/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const TIMEOUT_MS = 12000;

async function request(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const token = getStoredToken();
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
      // Token expired or invalid — clear storage and force reload to login screen
      localStorage.removeItem("sweet_home_token");
      localStorage.removeItem("sweet_home_user");
      window.location.reload();
      throw new Error("Sesión expirada");
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

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
};

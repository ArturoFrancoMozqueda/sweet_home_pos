import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { api } from "../services/api";

export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "employee";
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "sweet_home_token";
const USER_KEY = "sweet_home_user";
// Exposed so the sale-draft writer stays in lockstep with logout / session change.
export const SALE_DRAFT_KEY = "sweet_home_sale_draft";

function loadFromStorage(): { user: AuthUser | null; token: string | null } {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const userStr = localStorage.getItem(USER_KEY);
    if (!token || !userStr) return { user: null, token: null };

    // Check token expiry (JWT payload is base64 encoded in the middle section)
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      return { user: null, token: null };
    }

    return { user: JSON.parse(userStr), token };
  } catch {
    return { user: null, token: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [{ user, token }, setAuth] = useState(loadFromStorage);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.post("/api/auth/login", { username, password });
    const authUser: AuthUser = { id: data.user_id, username: data.username, role: data.role };
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(authUser));
    setAuth({ user: authUser, token: data.token });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(SALE_DRAFT_KEY);
    setAuth({ user: null, token: null });
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

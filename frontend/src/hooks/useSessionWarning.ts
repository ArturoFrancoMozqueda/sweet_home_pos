import { useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";

const WARN_BEFORE_EXPIRY_MS = 5 * 60 * 1000;

// Decodes the JWT exp claim and schedules a one-shot toast 5 minutes before
// the token expires. If the warning window has already passed (e.g. a stale
// restored session), we stay silent — api.ts will handle the 401 and reload.
export function useSessionWarning() {
  const { token } = useAuth();
  const { showToast } = useToast();
  // useToast returns a fresh object each render, so pin it in a ref to keep
  // the effect's deps stable.
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  useEffect(() => {
    if (!token) return;

    let payload: { exp?: number } | null = null;
    try {
      payload = JSON.parse(atob(token.split(".")[1]));
    } catch {
      return;
    }
    if (!payload?.exp) return;

    const delayMs = payload.exp * 1000 - WARN_BEFORE_EXPIRY_MS - Date.now();
    if (delayMs <= 0) return;

    const timer = setTimeout(() => {
      showToastRef.current(
        "Tu sesión expira pronto. Vuelve a iniciar sesión para evitar interrupciones."
      );
    }, delayMs);

    return () => clearTimeout(timer);
  }, [token]);
}

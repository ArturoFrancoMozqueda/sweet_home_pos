import { useCallback, useEffect, useRef, useState } from "react";
import { syncToServer } from "../db/sync";

// Retry schedule for auto-sync after a failure while online.
// Caps at 30s; gives up after the last entry so the indicator stays visible
// and the user can decide to tap manually.
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState(false);
  const syncingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);

  const cancelPendingRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const runSync = useCallback(async (isRetry: boolean) => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setIsSyncing(true);
    if (!isRetry) setSyncError(false);
    let ok = false;
    try {
      const result = await syncToServer();
      ok = result.ok;
    } catch {
      ok = false;
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }

    if (ok) {
      setLastSync(new Date());
      setSyncError(false);
      retryAttemptRef.current = 0;
      cancelPendingRetry();
      return;
    }

    setSyncError(true);
    // Schedule the next retry only if still online and retries remain.
    if (navigator.onLine && retryAttemptRef.current < RETRY_DELAYS_MS.length) {
      const delay = RETRY_DELAYS_MS[retryAttemptRef.current];
      retryAttemptRef.current += 1;
      cancelPendingRetry();
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        runSync(true);
      }, delay);
    }
  }, [cancelPendingRetry]);

  const triggerSync = useCallback(() => {
    // Manual trigger: reset backoff so the user gets an immediate attempt.
    retryAttemptRef.current = 0;
    cancelPendingRetry();
    runSync(false);
  }, [cancelPendingRetry, runSync]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      retryAttemptRef.current = 0;
      cancelPendingRetry();
      runSync(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
      cancelPendingRetry();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        retryAttemptRef.current = 0;
        cancelPendingRetry();
        runSync(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    if (navigator.onLine) runSync(false);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      cancelPendingRetry();
    };
  }, [cancelPendingRetry, runSync]);

  return { isOnline, isSyncing, lastSync, syncError, triggerSync };
}

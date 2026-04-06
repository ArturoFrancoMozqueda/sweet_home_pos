import { useEffect, useRef, useState } from "react";
import { syncToServer } from "../db/sync";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState(false);
  const syncingRef = useRef(false);

  const triggerSync = async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setIsSyncing(true);
    setSyncError(false);
    try {
      const success = await syncToServer();
      if (success) {
        setLastSync(new Date());
      } else {
        setSyncError(true);
      }
    } catch {
      setSyncError(true);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        triggerSync();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    if (navigator.onLine) triggerSync();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { isOnline, isSyncing, lastSync, syncError, triggerSync };
}

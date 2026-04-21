interface Props {
  isOnline: boolean;
  isSyncing: boolean;
  syncError?: boolean;
  pendingCount?: number;
  failedCount?: number;
  onSync: () => void;
}

export function SyncIndicator({
  isOnline,
  isSyncing,
  syncError,
  pendingCount,
  failedCount,
  onSync,
}: Props) {
  const hasFailed = !!failedCount && failedCount > 0;
  const status = isSyncing
    ? "syncing"
    : syncError || hasFailed
      ? "error"
      : isOnline
        ? "online"
        : "offline";

  const label = isSyncing
    ? "Sincronizando..."
    : hasFailed
      ? `${failedCount} venta${failedCount !== 1 ? "s" : ""} rechazada${failedCount !== 1 ? "s" : ""}`
      : syncError
        ? "Error de sincronización"
        : isOnline
          ? "En línea"
          : "Sin conexión";

  const showPending = !isSyncing && pendingCount && pendingCount > 0;

  return (
    <div className={`sync-bar ${status}`} onClick={onSync}>
      <span className={`sync-dot ${status}`} />
      <span>
        {label}
        {showPending ? ` · ${pendingCount} pendiente${pendingCount !== 1 ? "s" : ""}` : ""}
      </span>
    </div>
  );
}

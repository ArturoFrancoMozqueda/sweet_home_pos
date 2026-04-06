interface Props {
  isOnline: boolean;
  isSyncing: boolean;
  syncError?: boolean;
  pendingCount?: number;
  onSync: () => void;
}

export function SyncIndicator({ isOnline, isSyncing, syncError, pendingCount, onSync }: Props) {
  const status = isSyncing
    ? "syncing"
    : syncError
      ? "error"
      : isOnline
        ? "online"
        : "offline";

  const label = isSyncing
    ? "Sincronizando..."
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

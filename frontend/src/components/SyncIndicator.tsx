interface Props {
  isOnline: boolean;
  isSyncing: boolean;
  onSync: () => void;
}

export function SyncIndicator({ isOnline, isSyncing, onSync }: Props) {
  const status = isSyncing ? "syncing" : isOnline ? "online" : "offline";
  const label = isSyncing
    ? "Sincronizando..."
    : isOnline
      ? "En linea"
      : "Sin conexion";

  return (
    <div className={`sync-bar ${status}`} onClick={onSync}>
      <span className={`sync-dot ${status}`} />
      <span>{label}</span>
    </div>
  );
}

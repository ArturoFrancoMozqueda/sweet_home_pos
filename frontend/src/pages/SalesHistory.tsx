import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type DBSaleItem } from "../db/database";
import { api } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";

function toUtcDate(dateStr: string): Date {
  // Server returns naive strings (no Z) — treat them as UTC
  if (!dateStr.endsWith("Z") && !dateStr.includes("+")) {
    return new Date(dateStr + "Z");
  }
  return new Date(dateStr);
}

function formatTime(dateStr: string): string {
  return toUtcDate(dateStr).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  return toUtcDate(dateStr).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

interface ServerSale {
  id: number;
  client_uuid: string;
  total: number;
  payment_method: string;
  created_at: string;
  synced_at: string;
  items: { product_name: string; quantity: number; subtotal: number }[];
}

export function SalesHistory() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const [dateFilter, setDateFilter] = useState(() => {
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  });
  const [serverSales, setServerSales] = useState<ServerSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Fetch from server when online and date changes
  useEffect(() => {
    if (!navigator.onLine) return;
    setLoading(true);
    const params = dateFilter
      ? `?date_from=${dateFilter}&date_to=${dateFilter}&limit=200`
      : `?limit=200`;
    api
      .get(`/api/sales${params}`)
      .then((data: ServerSale[]) => setServerSales(data))
      .catch(() => setServerSales([]))
      .finally(() => setLoading(false));
  }, [dateFilter]);

  // Local unsynced sales (not yet on server)
  const localPending = useLiveQuery(async () => {
    const all = await db.sales.orderBy("created_at").reverse().toArray();
    const toMxDate = (s: string) => new Date(s).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
    const filtered = dateFilter ? all.filter((s) => toMxDate(s.created_at) === dateFilter) : all;
    return filtered.filter((s) => !s.synced);
  }, [dateFilter], []);

  const localItems = useLiveQuery(async () => {
    if (!localPending || localPending.length === 0) return new Map<string, DBSaleItem[]>();
    const uuids = localPending.map((s) => s.client_uuid);
    const allItems = await db.saleItems.toArray();
    const map = new Map<string, DBSaleItem[]>();
    for (const item of allItems) {
      if (uuids.includes(item.sale_uuid)) {
        const existing = map.get(item.sale_uuid) || [];
        existing.push(item);
        map.set(item.sale_uuid, existing);
      }
    }
    return map;
  }, [localPending], new Map<string, DBSaleItem[]>());

  const handleCancel = async (saleId: number) => {
    setCancelling(true);
    try {
      await api.delete(`/api/sales/${saleId}`);
      setServerSales((prev) => prev.filter((s) => s.id !== saleId));
      setConfirmCancelId(null);
      showToast("Venta anulada");
    } catch {
      showToast("Error al anular la venta");
    } finally {
      setCancelling(false);
    }
  };

  // Merge: server sales + local unsynced (avoid duplicates by uuid)
  const serverUuids = new Set(serverSales.map((s) => s.client_uuid));
  const pendingNotOnServer = (localPending ?? []).filter((s) => !serverUuids.has(s.client_uuid));

  const totalFiltered =
    serverSales.reduce((sum, s) => sum + s.total, 0) +
    pendingNotOnServer.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {user?.role === "admin" ? "Historial de Ventas" : "Mis Ventas"}
        </h1>
        <button
          className="btn btn-secondary"
          style={{ padding: "8px 14px", minHeight: "auto", fontSize: "0.85rem" }}
          onClick={logout}
        >
          Cerrar sesión
        </button>
      </div>

      <div className="history-date-filter">
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        />
        <button
          className="btn btn-secondary"
          style={{ padding: "10px 14px", minHeight: "auto", fontSize: "0.85rem" }}
          onClick={() => setDateFilter("")}
        >
          Todas
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: "center", color: "var(--text-light)", padding: "8px 0", fontSize: "0.85rem" }}>
          Cargando...
        </div>
      )}

      {(serverSales.length > 0 || pendingNotOnServer.length > 0) && (
        <div className="card" style={{ marginBottom: 12, textAlign: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-light)" }}>
            {serverSales.length + pendingNotOnServer.length} venta
            {serverSales.length + pendingNotOnServer.length !== 1 ? "s" : ""}
          </span>
          <span style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--primary)", marginLeft: 12 }}>
            ${totalFiltered.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {serverSales.length === 0 && pendingNotOnServer.length === 0 && !loading ? (
        <div className="empty-state">
          <p style={{ fontSize: "2rem" }}>🕐</p>
          <p>No hay ventas {dateFilter ? "en esta fecha" : "registradas"}.</p>
        </div>
      ) : (
        <>
          {/* Server sales */}
          {serverSales.map((sale) => (
            <div key={sale.client_uuid} className="history-sale">
              <div className="history-sale-header">
                <div>
                  <div className="history-sale-time">
                    {formatDate(sale.created_at)} — {formatTime(sale.created_at)}
                  </div>
                  <div className="history-sale-method">
                    {sale.payment_method === "efectivo" ? "Efectivo" : "Transferencia"}
                    {" · "}
                    <span className="sale-synced yes">✓ Sincronizada</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {user?.role === "admin" && (
                    confirmCancelId === sale.id ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: "0.8rem", color: "var(--danger, #dc2626)" }}>¿Anular?</span>
                        <button
                          className="btn btn-danger"
                          style={{ padding: "4px 10px", fontSize: "0.8rem", minHeight: "auto" }}
                          onClick={() => handleCancel(sale.id)}
                          disabled={cancelling}
                        >
                          Sí
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: "4px 10px", fontSize: "0.8rem", minHeight: "auto" }}
                          onClick={() => setConfirmCancelId(null)}
                          disabled={cancelling}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmCancelId(sale.id)}
                        aria-label="Anular venta"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-light)", padding: "4px" }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                        </svg>
                      </button>
                    )
                  )}
                  <span className="history-sale-total">${sale.total}</span>
                </div>
              </div>
              {sale.items.length > 0 && (
                <div className="history-sale-items">
                  {sale.items.map((item, i) => (
                    <div key={i} className="history-sale-item">
                      <span>{item.product_name} x{item.quantity}</span>
                      <span>${item.subtotal}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Local pending (not yet synced) */}
          {pendingNotOnServer.map((sale) => {
            const items = localItems?.get(sale.client_uuid) || [];
            return (
              <div key={sale.client_uuid} className="history-sale">
                <div className="history-sale-header">
                  <div>
                    <div className="history-sale-time">
                      {formatDate(sale.created_at)} — {formatTime(sale.created_at)}
                    </div>
                    <div className="history-sale-method">
                      {sale.payment_method === "efectivo" ? "Efectivo" : "Transferencia"}
                      {" · "}
                      <span className="sale-synced no">⏳ Pendiente</span>
                    </div>
                  </div>
                  <span className="history-sale-total">${sale.total}</span>
                </div>
                {items.length > 0 && (
                  <div className="history-sale-items">
                    {items.map((item: DBSaleItem, i: number) => (
                      <div key={i} className="history-sale-item">
                        <span>{item.product_name} x{item.quantity}</span>
                        <span>${item.subtotal}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

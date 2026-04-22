import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type DBSale, type DBSaleItem } from "../db/database";
import { syncToServer } from "../db/sync";
import { api } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { getPaymentMethodLabel } from "../utils/payments";
import { AdminHistoryView } from "./AdminHistoryView";

function toUtcDate(dateStr: string): Date {
  if (!dateStr.endsWith("Z") && !dateStr.includes("+")) {
    return new Date(`${dateStr}Z`);
  }
  return new Date(dateStr);
}

function formatTime(dateStr: string): string {
  return toUtcDate(dateStr).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  return toUtcDate(dateStr).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface ServerSale {
  id: number;
  client_uuid: string;
  total: number;
  payment_method: string;
  created_at: string;
  synced_at: string;
  cancelled?: boolean;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  cancelled_by_username?: string | null;
  items: { product_name: string; quantity: number; subtotal: number }[];
}

export function SalesHistory() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const [dateFilter, setDateFilter] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })
  );
  const [serverSales, setServerSales] = useState<ServerSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [retryingUuid, setRetryingUuid] = useState<string | null>(null);
  const [discardingUuid, setDiscardingUuid] = useState<string | null>(null);
  const [adminManageMode, setAdminManageMode] = useState(false);

  const isAdmin = user?.role === "admin";
  const showAdminAnalytics = isAdmin && !adminManageMode;

  useEffect(() => {
    if (showAdminAnalytics) return;
    if (!navigator.onLine) return;
    setLoading(true);
    const qs = new URLSearchParams();
    if (dateFilter) {
      qs.set("date_from", dateFilter);
      qs.set("date_to", dateFilter);
    }
    qs.set("limit", "200");
    if (isAdmin) qs.set("include_cancelled", "true");
    api
      .get(`/api/sales?${qs.toString()}`)
      .then((data: ServerSale[]) => setServerSales(data))
      .catch(() => setServerSales([]))
      .finally(() => setLoading(false));
  }, [dateFilter, isAdmin, showAdminAnalytics]);

  const localUnsynced = useLiveQuery(async () => {
    const all = await db.sales.orderBy("created_at").reverse().toArray();
    const toMxDate = (s: string) =>
      new Date(s).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
    const filtered = dateFilter ? all.filter((s) => toMxDate(s.created_at) === dateFilter) : all;
    return filtered.filter((s) => s.synced !== 1);
  }, [dateFilter], []);

  const localItems = useLiveQuery(async () => {
    if (!localUnsynced || localUnsynced.length === 0) return new Map<string, DBSaleItem[]>();
    const uuids = new Set(localUnsynced.map((s) => s.client_uuid));
    const allItems = await db.saleItems.toArray();
    const map = new Map<string, DBSaleItem[]>();
    for (const item of allItems) {
      if (!uuids.has(item.sale_uuid)) continue;
      const existing = map.get(item.sale_uuid) || [];
      existing.push(item);
      map.set(item.sale_uuid, existing);
    }
    return map;
  }, [localUnsynced], new Map<string, DBSaleItem[]>());

  const openCancelPrompt = (saleId: number) => {
    setConfirmCancelId(saleId);
    setCancelReason("");
  };

  const closeCancelPrompt = () => {
    setConfirmCancelId(null);
    setCancelReason("");
  };

  const handleCancel = async (saleId: number) => {
    setCancelling(true);
    try {
      const reason = cancelReason.trim();
      await api.delete(`/api/sales/${saleId}`, reason ? { reason } : undefined);
      const nowIso = new Date().toISOString();
      setServerSales((prev) =>
        prev.map((s) =>
          s.id === saleId
            ? {
                ...s,
                cancelled: true,
                cancelled_at: nowIso,
                cancellation_reason: reason || null,
                cancelled_by_username: user?.username ?? null,
              }
            : s
        )
      );
      closeCancelPrompt();
      showToast("Venta anulada");
    } catch {
      showToast("Error al anular la venta");
    } finally {
      setCancelling(false);
    }
  };

  const retryRejectedSale = async (sale: DBSale) => {
    setRetryingUuid(sale.client_uuid);
    try {
      await db.sales.where("client_uuid").equals(sale.client_uuid).modify({
        synced: 0,
        sync_error: undefined,
      });
      if (navigator.onLine) {
        const result = await syncToServer();
        if (result.ok) {
          showToast("Reintento enviado");
        } else {
          showToast("No se pudo sincronizar aún");
        }
      } else {
        showToast("La venta quedó lista para reintentarse al reconectar");
      }
    } catch {
      showToast("No se pudo reintentar la venta");
    } finally {
      setRetryingUuid(null);
    }
  };

  const discardRejectedSale = async (sale: DBSale) => {
    setDiscardingUuid(sale.client_uuid);
    try {
      await db.transaction("rw", [db.sales, db.saleItems, db.products], async () => {
        const items = await db.saleItems.where("sale_uuid").equals(sale.client_uuid).toArray();
        for (const item of items) {
          const product = await db.products.get(item.product_id);
          if (product) {
            await db.products.update(item.product_id, { stock: product.stock + item.quantity });
          }
        }
        await db.saleItems.where("sale_uuid").equals(sale.client_uuid).delete();
        await db.sales.where("client_uuid").equals(sale.client_uuid).delete();
      });
      showToast("Venta descartada y stock restaurado");
    } catch {
      showToast("No se pudo descartar la venta");
    } finally {
      setDiscardingUuid(null);
    }
  };

  const serverUuids = new Set(serverSales.map((s) => s.client_uuid));
  const localOnlySales = (localUnsynced ?? []).filter((s) => !serverUuids.has(s.client_uuid));
  const pendingLocalSales = localOnlySales.filter((s) => s.synced === 0);
  const rejectedLocalSales = localOnlySales.filter((s) => s.synced === 2);

  const totalFiltered =
    serverSales.reduce((sum, s) => sum + s.total, 0) +
    localOnlySales.reduce((sum, s) => sum + s.total, 0);

  const renderLocalSale = (sale: DBSale, status: "pending" | "rejected") => {
    const items = localItems?.get(sale.client_uuid) || [];
    const isRejected = status === "rejected";

    return (
      <div
        key={sale.client_uuid}
        className="history-sale"
        style={
          isRejected
            ? { border: "1px solid var(--danger-soft)", background: "rgba(231, 76, 60, 0.04)" }
            : { border: "1px solid rgba(230, 126, 34, 0.16)" }
        }
      >
        <div className="history-sale-header">
          <div>
            <div className="history-sale-time">
              {formatDate(sale.created_at)} — {formatTime(sale.created_at)}
            </div>
            <div className="history-sale-method">
              {getPaymentMethodLabel(sale.payment_method)}
              {" · "}
              <span className={`sale-synced ${isRejected ? "rejected" : "no"}`}>
                {isRejected ? "✕ Rechazada" : "⏳ Pendiente"}
              </span>
            </div>
          </div>
          <span className="history-sale-total">
            ${sale.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </span>
        </div>

        {sale.sync_error && (
          <div className="history-inline-note history-inline-note-danger">
            {sale.sync_error}
          </div>
        )}

        {items.length > 0 && (
          <div className="history-sale-items">
            {items.map((item, i) => (
              <div key={i} className="history-sale-item">
                <span>
                  {item.product_name} x{item.quantity}
                </span>
                <span>${item.subtotal}</span>
              </div>
            ))}
          </div>
        )}

        {isRejected && (
          <div className="history-local-actions">
            <button
              className="btn btn-secondary"
              style={{ flex: 1, padding: "10px 12px", minHeight: "auto", fontSize: "0.85rem" }}
              onClick={() => retryRejectedSale(sale)}
              disabled={retryingUuid === sale.client_uuid || discardingUuid === sale.client_uuid}
            >
              {retryingUuid === sale.client_uuid ? "Reintentando..." : "Reintentar"}
            </button>
            <button
              className="btn btn-danger"
              style={{ flex: 1, padding: "10px 12px", minHeight: "auto", fontSize: "0.85rem" }}
              onClick={() => discardRejectedSale(sale)}
              disabled={retryingUuid === sale.client_uuid || discardingUuid === sale.client_uuid}
            >
              {discardingUuid === sale.client_uuid ? "Descartando..." : "Descartar"}
            </button>
          </div>
        )}
      </div>
    );
  };

  if (showAdminAnalytics) {
    return <AdminHistoryView onOpenManage={() => setAdminManageMode(true)} />;
  }

  return (
    <div className="page">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <h1 className="page-title" style={{ margin: 0 }}>
          {isAdmin ? "Gestionar ventas" : "Mis Ventas"}
        </h1>
        {isAdmin ? (
          <button
            className="btn btn-secondary"
            style={{ padding: "8px 14px", minHeight: "auto", fontSize: "0.85rem" }}
            onClick={() => setAdminManageMode(false)}
          >
            ← Análisis
          </button>
        ) : (
          <button
            className="btn btn-secondary"
            style={{ padding: "8px 14px", minHeight: "auto", fontSize: "0.85rem" }}
            onClick={logout}
          >
            Cerrar sesión
          </button>
        )}
      </div>

      <div className="history-date-filter">
        <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
        <button
          className="btn btn-secondary"
          style={{ padding: "10px 14px", minHeight: "auto", fontSize: "0.85rem" }}
          onClick={() => setDateFilter("")}
        >
          Todas
        </button>
      </div>

      {loading && (
        <div
          style={{
            textAlign: "center",
            color: "var(--text-light)",
            padding: "8px 0",
            fontSize: "0.85rem",
          }}
        >
          Cargando...
        </div>
      )}

      {(serverSales.length > 0 || localOnlySales.length > 0) && (
        <div className="card" style={{ marginBottom: 12, textAlign: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-light)" }}>
            {serverSales.length + localOnlySales.length} venta
            {serverSales.length + localOnlySales.length !== 1 ? "s" : ""}
          </span>
          <span
            style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--primary)", marginLeft: 12 }}
          >
            ${totalFiltered.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {serverSales.length === 0 && localOnlySales.length === 0 && !loading ? (
        <div className="empty-state">
          <p style={{ fontSize: "2rem" }}>🕐</p>
          <p>No hay ventas {dateFilter ? "en esta fecha" : "registradas"}.</p>
        </div>
      ) : (
        <>
          {serverSales.map((sale) => (
            <div
              key={sale.client_uuid}
              className="history-sale"
              style={sale.cancelled ? { opacity: 0.6 } : undefined}
            >
              <div className="history-sale-header">
                <div>
                  <div
                    className="history-sale-time"
                    style={sale.cancelled ? { textDecoration: "line-through" } : undefined}
                  >
                    {formatDate(sale.created_at)} — {formatTime(sale.created_at)}
                  </div>
                  <div className="history-sale-method">
                    {getPaymentMethodLabel(sale.payment_method)}
                    {" · "}
                    {sale.cancelled ? (
                      <span style={{ color: "var(--danger, #dc2626)", fontWeight: 600 }}>✕ Anulada</span>
                    ) : (
                      <span className="sale-synced yes">✓ Sincronizada</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  {isAdmin && !sale.cancelled &&
                    (confirmCancelId === sale.id ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                          alignItems: "flex-end",
                        }}
                      >
                        <span style={{ fontSize: "0.8rem", color: "var(--danger, #dc2626)" }}>
                          ¿Anular?
                        </span>
                        <input
                          type="text"
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Motivo (opcional)"
                          maxLength={200}
                          disabled={cancelling}
                          autoFocus
                          style={{
                            fontSize: "0.8rem",
                            padding: "4px 8px",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            width: 180,
                          }}
                        />
                        <div style={{ display: "flex", gap: 6 }}>
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
                            onClick={closeCancelPrompt}
                            disabled={cancelling}
                          >
                            No
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => openCancelPrompt(sale.id)}
                        aria-label="Anular venta"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-light)",
                          padding: "4px",
                        }}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                        </svg>
                      </button>
                    ))}
                  <span
                    className="history-sale-total"
                    style={sale.cancelled ? { textDecoration: "line-through" } : undefined}
                  >
                    ${sale.total}
                  </span>
                </div>
              </div>
              {sale.cancelled &&
                (sale.cancelled_by_username || sale.cancelled_at || sale.cancellation_reason) && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-light)",
                      marginTop: 6,
                      padding: "6px 10px",
                      background: "var(--bg, #f9f9f9)",
                      borderLeft: "3px solid var(--danger, #dc2626)",
                      borderRadius: 4,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Anulada</span>
                    {sale.cancelled_by_username && (
                      <>
                        {" "}
                        por <strong>{sale.cancelled_by_username}</strong>
                      </>
                    )}
                    {sale.cancelled_at && (
                      <>
                        {" "}
                        · {formatDate(sale.cancelled_at)} {formatTime(sale.cancelled_at)}
                      </>
                    )}
                    {sale.cancellation_reason && (
                      <div style={{ marginTop: 2, fontStyle: "italic" }}>
                        Motivo: {sale.cancellation_reason}
                      </div>
                    )}
                  </div>
                )}
              {sale.items.length > 0 && (
                <div className="history-sale-items">
                  {sale.items.map((item, i) => (
                    <div key={i} className="history-sale-item">
                      <span>
                        {item.product_name} x{item.quantity}
                      </span>
                      <span>${item.subtotal}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {pendingLocalSales.map((sale) => renderLocalSale(sale, "pending"))}
          {rejectedLocalSales.map((sale) => renderLocalSale(sale, "rejected"))}
        </>
      )}
    </div>
  );
}

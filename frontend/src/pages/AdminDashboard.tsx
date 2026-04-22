import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/database";
import { api } from "../services/api";
import type { DailyReport } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { getPaymentMethodLabel } from "../utils/payments";

function getTodayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

export function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { triggerSync, isSyncing } = useOnlineStatus();
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const today = getTodayStr();

  const pendingCount = useLiveQuery(() => db.sales.where("synced").equals(0).count(), [], 0);
  const failedCount = useLiveQuery(() => db.sales.where("synced").equals(2).count(), [], 0);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/reports/daily?date=${today}`)
      .then((data: DailyReport) => {
        if (!cancelled) setReport(data);
      })
      .catch(() => {
        if (!cancelled) setReport(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [today]);

  const lowStockCount = report?.low_stock_products.length ?? 0;
  const topProduct = report?.top_products[0];
  const topPayment = report?.payment_breakdown.length
    ? [...report.payment_breakdown].sort((a, b) => b.total - a.total)[0]
    : null;

  const hasAlerts = pendingCount > 0 || failedCount > 0 || lowStockCount > 0;

  return (
    <div className="page">
      <h1 className="page-title" style={{ marginBottom: 4 }}>
        Hola, {user?.username}
      </h1>
      <p
        style={{
          fontSize: "0.85rem",
          color: "var(--text-light)",
          marginBottom: 16,
          marginTop: 0,
        }}
      >
        Panel de administración
      </p>

      <div className="summary-hero">
        <div className="summary-label">Total Hoy</div>
        <div className="summary-amount">
          {loading
            ? "—"
            : `$${(report?.total_amount ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}
        </div>
        <div className="summary-count">
          {loading
            ? "cargando..."
            : `${report?.total_sales_count ?? 0} venta${report?.total_sales_count !== 1 ? "s" : ""}`}
        </div>
      </div>

      {hasAlerts && (
        <div className="dashboard-alerts">
          {pendingCount > 0 && (
            <button
              className="alert-card alert-warning"
              onClick={triggerSync}
              disabled={isSyncing}
              type="button"
            >
              <span className="alert-text">
                {pendingCount} venta{pendingCount !== 1 ? "s" : ""} pendiente
                {pendingCount !== 1 ? "s" : ""} de sincronizar
              </span>
              <span className="alert-action">
                {isSyncing ? "Sincronizando..." : "Sincronizar"}
              </span>
            </button>
          )}
          {failedCount > 0 && (
            <button
              className="alert-card alert-danger"
              onClick={() => navigate("/history")}
              type="button"
            >
              <span className="alert-text">
                {failedCount} venta{failedCount !== 1 ? "s" : ""} rechazada
                {failedCount !== 1 ? "s" : ""}
              </span>
              <span className="alert-action">Ver en Historial →</span>
            </button>
          )}
          {lowStockCount > 0 && (
            <button
              className="alert-card alert-info"
              onClick={() => navigate("/inventory")}
              type="button"
            >
              <span className="alert-text">
                {lowStockCount} producto{lowStockCount !== 1 ? "s" : ""} con stock bajo
              </span>
              <span className="alert-action">Ver productos →</span>
            </button>
          )}
        </div>
      )}

      {report && report.total_sales_count > 0 && (topProduct || topPayment) && (
        <div className="dashboard-quickstats">
          {topProduct && (
            <div className="quickstat">
              <div className="quickstat-label">Más vendido</div>
              <div className="quickstat-value">{topProduct.name}</div>
              <div className="quickstat-sub">{topProduct.quantity} uds</div>
            </div>
          )}
          {topPayment && (
            <div className="quickstat">
              <div className="quickstat-label">Pago principal</div>
              <div className="quickstat-value">{getPaymentMethodLabel(topPayment.method)}</div>
              <div className="quickstat-sub">
                ${topPayment.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="summary-section">
        <h3 className="summary-section-title">Atajos</h3>
        <div className="dashboard-grid">
          <button className="dashboard-shortcut" onClick={() => navigate("/inventory")} type="button">
            <span className="shortcut-label">Productos</span>
            <span className="shortcut-sub">Ajustar stock e inventario</span>
          </button>
          <button className="dashboard-shortcut" onClick={() => navigate("/summary")} type="button">
            <span className="shortcut-label">Resumen</span>
            <span className="shortcut-sub">Ventas del día por vendedor</span>
          </button>
          <button className="dashboard-shortcut" onClick={() => navigate("/history")} type="button">
            <span className="shortcut-label">Historial</span>
            <span className="shortcut-sub">Análisis por rango de fechas</span>
          </button>
          <button className="dashboard-shortcut" onClick={() => navigate("/")} type="button">
            <span className="shortcut-label">Registrar venta</span>
            <span className="shortcut-sub">Abrir caja rápida</span>
          </button>
        </div>
      </div>
    </div>
  );
}

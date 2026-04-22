import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { db, type DBSale, type DBSaleItem } from "../db/database";
import type { DailyReport } from "../types";
import { api } from "../services/api";
import { getSalePaymentEntries, getPaymentMethodLabel } from "../utils/payments";
import { useAuth, type AuthUser } from "../contexts/AuthContext";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

function getTodayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

function toMexicoDateStr(utcStr: string): string {
  return new Date(utcStr).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

function mergeUnsyncedIntoReport(
  serverReport: DailyReport,
  pendingSales: DBSale[],
  pendingItems: DBSaleItem[],
  currentUser?: AuthUser | null
): DailyReport {
  if (pendingSales.length === 0) return serverReport;

  const extraAmount = pendingSales.reduce((s, sale) => s + sale.total, 0);

  const paymentMap = new Map(
    serverReport.payment_breakdown.map((p) => [p.method, { count: p.count, total: p.total }])
  );
  for (const sale of pendingSales) {
    for (const payment of getSalePaymentEntries(sale)) {
      const prev = paymentMap.get(payment.method) ?? { count: 0, total: 0 };
      paymentMap.set(payment.method, {
        count: prev.count + 1,
        total: prev.total + payment.amount,
      });
    }
  }

  const productMap = new Map(
    serverReport.top_products.map((p) => [p.name, { quantity: p.quantity, revenue: p.revenue }])
  );
  for (const item of pendingItems) {
    const prev = productMap.get(item.product_name) ?? { quantity: 0, revenue: 0 };
    productMap.set(item.product_name, {
      quantity: prev.quantity + item.quantity,
      revenue: prev.revenue + item.subtotal,
    });
  }

  // Local pending sales belong to the currently logged-in user. Add them
  // to that user's row in the per-vendor breakdown so admins see the real
  // day total even before sync completes.
  let salesByUser = serverReport.sales_by_user;
  if (salesByUser && currentUser) {
    const byUserMap = new Map(
      salesByUser.map((r) => [r.user_id ?? -1, { ...r }])
    );
    const key = currentUser.id;
    const prev = byUserMap.get(key) ?? {
      user_id: currentUser.id,
      username: currentUser.username,
      count: 0,
      total: 0,
    };
    byUserMap.set(key, {
      ...prev,
      count: prev.count + pendingSales.length,
      total: prev.total + extraAmount,
    });
    salesByUser = Array.from(byUserMap.values()).sort((a, b) => b.total - a.total);
  }

  return {
    ...serverReport,
    total_sales_count: serverReport.total_sales_count + pendingSales.length,
    total_amount: serverReport.total_amount + extraAmount,
    payment_breakdown: Array.from(paymentMap, ([method, data]) => ({ method, ...data })),
    top_products: Array.from(productMap, ([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5),
    sales_by_user: salesByUser,
  };
}

export function DailySummary() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { triggerSync, isSyncing } = useOnlineStatus();
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getTodayStr);

  const pendingCount = useLiveQuery(
    () => db.sales.where("synced").equals(0).count(),
    [],
    0
  );
  const failedCount = useLiveQuery(
    () => db.sales.where("synced").equals(2).count(),
    [],
    0
  );

  const localSales = useLiveQuery(async () => {
    const allSales = await db.sales.toArray();
    return allSales.filter(
      (s) => toMexicoDateStr(s.created_at) === selectedDate && s.synced !== 2
    );
  }, [selectedDate], []);

  const localSaleItems = useLiveQuery(async () => {
    if (!localSales || localSales.length === 0) return [];
    const uuids = new Set(localSales.map((s) => s.client_uuid));
    const allItems = await db.saleItems.toArray();
    return allItems.filter((item) => uuids.has(item.sale_uuid));
  }, [localSales], []);

  useEffect(() => {
    const buildLocalReport = () => {
      if (!localSales) return;

      const totalAmount = localSales.reduce((s, sale) => s + sale.total, 0);
      const paymentMap = new Map<string, { count: number; total: number }>();
      for (const sale of localSales) {
        for (const payment of getSalePaymentEntries(sale)) {
          const prev = paymentMap.get(payment.method) ?? { count: 0, total: 0 };
          paymentMap.set(payment.method, {
            count: prev.count + 1,
            total: prev.total + payment.amount,
          });
        }
      }

      const productMap = new Map<string, { quantity: number; revenue: number }>();
      for (const item of localSaleItems ?? []) {
        const prev = productMap.get(item.product_name) ?? { quantity: 0, revenue: 0 };
        productMap.set(item.product_name, {
          quantity: prev.quantity + item.quantity,
          revenue: prev.revenue + item.subtotal,
        });
      }

      setReport({
        date: selectedDate,
        total_sales_count: localSales.length,
        total_amount: totalAmount,
        payment_breakdown: Array.from(paymentMap, ([method, data]) => ({ method, ...data })),
        top_products: Array.from(productMap, ([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5),
        low_stock_products: [],
      });
    };

    const fetchReport = async () => {
      if (navigator.onLine) {
        try {
          const data = await api.get(`/api/reports/daily?date=${selectedDate}`);
          const pendingSales = (localSales ?? []).filter((s) => s.synced === 0);
          const pendingUuids = new Set(pendingSales.map((s) => s.client_uuid));
          const pendingItems = (localSaleItems ?? []).filter((item) =>
            pendingUuids.has(item.sale_uuid)
          );

          setReport(mergeUnsyncedIntoReport(data, pendingSales, pendingItems, user));
          setLoading(false);
          return;
        } catch {
          // Fall back to local report.
        }
      }
      buildLocalReport();
      setLoading(false);
    };

    fetchReport().catch(() => {
      setLoading(false);
    });
  }, [selectedDate, localSaleItems, localSales, user]);

  const attentionItems = useMemo(() => {
    if (!report) return [];
    const topMap = new Map(report.top_products.map((product) => [product.name, product]));
    return report.low_stock_products
      .map((product) => {
        const top = topMap.get(product.name);
        if (product.stock === 0) {
          return `${product.name}: agotado. Conviene reponer hoy mismo.`;
        }
        if (top) {
          return `${product.name}: stock bajo y alta rotación (${top.quantity} vendidas). Conviene producir o surtir pronto.`;
        }
        return `${product.name}: stock bajo (${product.stock} uds). Revísalo antes del siguiente pico de venta.`;
      })
      .slice(0, 4);
  }, [report]);

  const title = user?.role === "employee" ? "Mi Resumen" : "Resumen del Día";
  const hasSyncAlerts = pendingCount > 0 || failedCount > 0;

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">{title}</h1>
        <div className="empty-state">
          <p>Cargando...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="page">
        <h1 className="page-title">{title}</h1>
        <div className="empty-state">
          <p style={{ fontSize: "2rem" }}>📊</p>
          <p>No hay datos disponibles.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}
      >
        <h1 className="page-title" style={{ margin: 0 }}>
          {title}
        </h1>
        <button
          className="btn btn-secondary no-print"
          style={{ padding: "8px 14px", minHeight: "auto", fontSize: "0.85rem" }}
          onClick={() => window.print()}
        >
          Imprimir
        </button>
      </div>

      <div className="history-date-filter no-print" style={{ marginBottom: 12 }}>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value);
            setLoading(true);
          }}
        />
        <button
          className="btn btn-secondary"
          style={{ padding: "10px 14px", minHeight: "auto", fontSize: "0.85rem" }}
          onClick={() => {
            setSelectedDate(getTodayStr());
            setLoading(true);
          }}
        >
          Hoy
        </button>
      </div>

      {hasSyncAlerts && (
        <div className="dashboard-alerts no-print">
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
          {failedCount > 0 && user?.role === "admin" && (
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
          {failedCount > 0 && user?.role !== "admin" && (
            <div className="alert-card alert-danger" style={{ cursor: "default" }}>
              <span className="alert-text">
                {failedCount} venta{failedCount !== 1 ? "s" : ""} rechazada
                {failedCount !== 1 ? "s" : ""}
              </span>
              <span className="alert-action">Avisa a tu admin</span>
            </div>
          )}
        </div>
      )}

      <div className="summary-hero">
        <div className="summary-label">Total Vendido</div>
        <div className="summary-amount">
          ${report.total_amount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
        </div>
        <div className="summary-count">
          {report.total_sales_count} venta{report.total_sales_count !== 1 ? "s" : ""}
        </div>
      </div>

      {report.estimated_profit != null && report.total_cost != null && report.total_cost > 0 && (
        <div
          className="card"
          style={{ display: "flex", justifyContent: "space-around", textAlign: "center", marginBottom: 12 }}
        >
          <div>
            <div
              style={{ fontSize: "0.75rem", color: "var(--text-light)", textTransform: "uppercase" }}
            >
              Costo
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)" }}>
              ${report.total_cost.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div
              style={{ fontSize: "0.75rem", color: "var(--text-light)", textTransform: "uppercase" }}
            >
              Ganancia Estimada
            </div>
            <div
              style={{
                fontSize: "1.1rem",
                fontWeight: 700,
                color: report.estimated_profit >= 0 ? "var(--success)" : "var(--danger)",
              }}
            >
              ${report.estimated_profit.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div
              style={{ fontSize: "0.75rem", color: "var(--text-light)", textTransform: "uppercase" }}
            >
              Margen
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)" }}>
              {report.total_amount > 0
                ? Math.round((report.estimated_profit / report.total_amount) * 100)
                : 0}
              %
            </div>
          </div>
        </div>
      )}

      {report.total_sales_count === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--text-light)" }}>
          <p>No hay ventas registradas para esta fecha.</p>
        </div>
      ) : (
        <>
          {report.top_products.length > 0 && (
            <div className="summary-section">
              <h3 className="summary-section-title">Más Vendidos</h3>
              <div className="card" style={{ padding: "4px 16px" }}>
                {report.top_products.map((p, i) => (
                  <div key={i} className="summary-row">
                    <span className="summary-row-label">
                      <span className="summary-rank">{i + 1}</span>
                      {p.name}
                      <span className="summary-row-qty"> x{p.quantity}</span>
                    </span>
                    <span className="summary-row-value">
                      ${p.revenue.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.payment_breakdown.length > 0 && (
            <div className="summary-section">
              <h3 className="summary-section-title">Por Método de Pago</h3>
              {report.payment_breakdown.map((p, i) => (
                <div key={i} className={`payment-chip ${p.method}`}>
                  <span className="payment-chip-label">
                    {getPaymentMethodLabel(p.method)}
                    <span className="summary-row-qty"> ({p.count})</span>
                  </span>
                  <span className="payment-chip-amount">
                    ${p.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}

          {report.sales_by_user && report.sales_by_user.length > 0 && (
            <div className="summary-section">
              <h3 className="summary-section-title">Ventas por Vendedor</h3>
              <div className="card" style={{ padding: "4px 16px" }}>
                {report.sales_by_user.map((u, i) => (
                  <div key={`${u.user_id ?? "none"}-${i}`} className="summary-row">
                    <span className="summary-row-label">
                      <span className="summary-rank">{i + 1}</span>
                      {u.username}
                      <span className="summary-row-qty">
                        {" "}
                        {u.count} venta{u.count !== 1 ? "s" : ""}
                      </span>
                    </span>
                    <span className="summary-row-value">
                      ${u.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {report.low_stock_products.length > 0 && (
        <div className="summary-section">
          <h3 className="summary-section-title">Inventario Bajo</h3>
          <div className="card" style={{ padding: "4px 16px" }}>
            {report.low_stock_products.map((p, i) => (
              <div key={i} className="summary-row">
                <span className="summary-row-label">{p.name}</span>
                <span className={`badge ${p.stock === 0 ? "badge-danger" : "badge-warning"}`}>
                  {p.stock} uds
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {attentionItems.length > 0 && (
        <div className="summary-section">
          <h3 className="summary-section-title">Atención Sugerida</h3>
          <div className="card" style={{ padding: "12px 16px" }}>
            {attentionItems.map((item, index) => (
              <div key={index} style={{ fontSize: "0.9rem", color: "var(--text)", padding: "6px 0" }}>
                {item}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

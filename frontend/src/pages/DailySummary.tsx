import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/database";
import type { DailyReport } from "../types";
import { api } from "../services/api";

function getTodayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export function DailySummary() {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);

  // Local sales from Dexie as fallback
  const todayStr = getTodayStr();
  const localSales = useLiveQuery(async () => {
    const allSales = await db.sales.toArray();
    return allSales.filter((s) => s.created_at.startsWith(todayStr));
  }, [todayStr], []);

  const localSaleItems = useLiveQuery(async () => {
    if (!localSales || localSales.length === 0) return [];
    const uuids = localSales.map((s) => s.client_uuid);
    const allItems = await db.saleItems.toArray();
    return allItems.filter((item) => uuids.includes(item.sale_uuid));
  }, [localSales], []);

  // Try to get report from server, fallback to local
  useEffect(() => {
    const fetchReport = async () => {
      if (navigator.onLine) {
        try {
          const data = await api.get(`/api/reports/daily?date=${todayStr}`);
          setReport(data);
          setLoading(false);
          return;
        } catch {
          // fallback to local
        }
      }
      buildLocalReport();
      setLoading(false);
    };

    const buildLocalReport = () => {
      if (!localSales) return;

      const totalAmount = localSales.reduce((s, sale) => s + sale.total, 0);
      const paymentMap = new Map<string, { count: number; total: number }>();
      for (const sale of localSales) {
        const prev = paymentMap.get(sale.payment_method) || { count: 0, total: 0 };
        paymentMap.set(sale.payment_method, {
          count: prev.count + 1,
          total: prev.total + sale.total,
        });
      }

      const productMap = new Map<string, { quantity: number; revenue: number }>();
      for (const item of localSaleItems || []) {
        const prev = productMap.get(item.product_name) || { quantity: 0, revenue: 0 };
        productMap.set(item.product_name, {
          quantity: prev.quantity + item.quantity,
          revenue: prev.revenue + item.subtotal,
        });
      }

      setReport({
        date: todayStr,
        total_sales_count: localSales.length,
        total_amount: totalAmount,
        payment_breakdown: Array.from(paymentMap, ([method, data]) => ({
          method,
          ...data,
        })),
        top_products: Array.from(productMap, ([name, data]) => ({
          name,
          ...data,
        }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5),
        low_stock_products: [],
      });
    };

    fetchReport();
  }, [todayStr, localSales, localSaleItems]);

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">Resumen del Dia</h1>
        <div className="empty-state"><p>Cargando...</p></div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="page">
        <h1 className="page-title">Resumen del Dia</h1>
        <div className="empty-state">
          <p style={{ fontSize: "2rem" }}>📊</p>
          <p>No hay datos disponibles.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Resumen del Dia</h1>

      <div className="summary-hero">
        <div className="summary-label">Total Vendido</div>
        <div className="summary-amount">${report.total_amount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</div>
        <div className="summary-count">
          {report.total_sales_count} venta{report.total_sales_count !== 1 ? "s" : ""}
        </div>
      </div>

      {report.total_sales_count === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--text-light)" }}>
          <p>No hay ventas registradas hoy.</p>
        </div>
      ) : (
        <>
          {report.top_products.length > 0 && (
            <div className="summary-section">
              <h3>🏆 Mas Vendidos</h3>
              <div className="card" style={{ padding: "4px 16px" }}>
                {report.top_products.map((p, i) => (
                  <div key={i} className="summary-row">
                    <span className="summary-row-label">
                      {p.name}
                      <span className="summary-row-qty"> x{p.quantity}</span>
                    </span>
                    <span className="summary-row-value">${p.revenue.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.payment_breakdown.length > 0 && (
            <div className="summary-section">
              <h3>💳 Por Metodo de Pago</h3>
              <div className="card" style={{ padding: "4px 16px" }}>
                {report.payment_breakdown.map((p, i) => (
                  <div key={i} className="summary-row">
                    <span className="summary-row-label">
                      {p.method === "efectivo" ? "💵 Efectivo" : "📱 Transferencia"}
                      <span className="summary-row-qty"> ({p.count})</span>
                    </span>
                    <span className="summary-row-value">${p.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {report.low_stock_products.length > 0 && (
        <div className="summary-section">
          <h3>⚠️ Inventario Bajo</h3>
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
    </div>
  );
}

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type DBSaleItem } from "../db/database";

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

export function SalesHistory() {
  const [dateFilter, setDateFilter] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  const sales = useLiveQuery(async () => {
    const allSales = await db.sales.orderBy("created_at").reverse().toArray();
    if (!dateFilter) return allSales;
    return allSales.filter((s) => s.created_at.startsWith(dateFilter));
  }, [dateFilter], []);

  const saleItems = useLiveQuery(async () => {
    if (!sales || sales.length === 0) return new Map();
    const uuids = sales.map((s) => s.client_uuid);
    const allItems = await db.saleItems.toArray();
    const map = new Map<string, typeof allItems>();
    for (const item of allItems) {
      if (uuids.includes(item.sale_uuid)) {
        const existing = map.get(item.sale_uuid) || [];
        existing.push(item);
        map.set(item.sale_uuid, existing);
      }
    }
    return map;
  }, [sales], new Map<string, DBSaleItem[]>());

  const totalFiltered = sales?.reduce((s, sale) => s + sale.total, 0) ?? 0;

  return (
    <div className="page">
      <h1 className="page-title">Historial de Ventas</h1>

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

      {sales && sales.length > 0 && (
        <div className="card" style={{ marginBottom: 12, textAlign: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-light)" }}>
            {sales.length} venta{sales.length !== 1 ? "s" : ""}
          </span>
          <span style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--primary)", marginLeft: 12 }}>
            ${totalFiltered.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {sales && sales.length > 0 ? (
        sales.map((sale) => {
          const items = saleItems?.get(sale.client_uuid) || [];
          return (
            <div key={sale.client_uuid} className="history-sale">
              <div className="history-sale-header">
                <div>
                  <div className="history-sale-time">
                    {formatDate(sale.created_at)} — {formatTime(sale.created_at)}
                  </div>
                  <div className="history-sale-method">
                    {sale.payment_method === "efectivo" ? "💵 Efectivo" : "📱 Transferencia"}
                    {" · "}
                    <span className={`sale-synced ${sale.synced ? "yes" : "no"}`}>
                      {sale.synced ? "✓ Sincronizada" : "⏳ Pendiente"}
                    </span>
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
        })
      ) : (
        <div className="empty-state">
          <p style={{ fontSize: "2rem" }}>🕐</p>
          <p>No hay ventas {dateFilter ? "en esta fecha" : "registradas"}.</p>
        </div>
      )}
    </div>
  );
}

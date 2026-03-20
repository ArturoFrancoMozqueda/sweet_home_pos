import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/database";
import { api } from "../services/api";
import { useToast } from "../components/Toast";

export function Inventory() {
  const products = useLiveQuery(() => db.products.orderBy("name").toArray(), [], []);
  const { showToast } = useToast();

  const adjustStock = async (productId: number, delta: number) => {
    const product = await db.products.get(productId);
    if (!product) return;

    const newStock = Math.max(0, product.stock + delta);
    await db.products.update(productId, { stock: newStock });

    // Try to sync stock to server
    if (navigator.onLine) {
      try {
        await api.put(`/api/products/${productId}/stock`, { stock: newStock });
      } catch {
        // Will sync later
      }
    }
  };

  const setStock = async (productId: number, value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) return;

    await db.products.update(productId, { stock: num });

    if (navigator.onLine) {
      try {
        await api.put(`/api/products/${productId}/stock`, { stock: num });
        showToast("Stock actualizado");
      } catch {
        showToast("Guardado local (sync pendiente)");
      }
    }
  };

  const lowStockCount = products?.filter(
    (p) => p.active && p.stock <= p.low_stock_threshold
  ).length ?? 0;

  return (
    <div className="page">
      <h1 className="page-title">Inventario</h1>

      {lowStockCount > 0 && (
        <div className="card" style={{ background: "#fff3cd", marginBottom: 16 }}>
          <span style={{ fontWeight: 600, color: "#856404", fontSize: "0.9rem" }}>
            ⚠️ {lowStockCount} producto{lowStockCount !== 1 ? "s" : ""} con inventario bajo
          </span>
        </div>
      )}

      {products && products.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {products.map((product) => {
            const isLow = product.active && product.stock <= product.low_stock_threshold;
            const isCritical = product.stock === 0;
            return (
              <div key={product.id} className="inventory-item">
                <div className="inventory-info">
                  <div className="inventory-name">
                    {product.name}
                    {isLow && (
                      <span
                        className={`low-stock-indicator ${isCritical ? "critical" : ""}`}
                        style={{ marginLeft: 8 }}
                      >
                        {isCritical ? "⛔ Agotado" : "⚠️ Bajo"}
                      </span>
                    )}
                  </div>
                  <div className="inventory-price">${product.price}</div>
                </div>
                <div className="inventory-stock">
                  <button
                    className="stock-btn"
                    onClick={() => adjustStock(product.id, -1)}
                    disabled={product.stock <= 0}
                  >
                    -
                  </button>
                  <input
                    className={`stock-value ${isCritical ? "critical" : isLow ? "low" : ""}`}
                    type="number"
                    value={product.stock}
                    onChange={(e) => setStock(product.id, e.target.value)}
                    style={{
                      width: 50,
                      textAlign: "center",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "4px 2px",
                      fontWeight: 700,
                      fontSize: "1rem",
                    }}
                    min={0}
                  />
                  <button
                    className="stock-btn"
                    onClick={() => adjustStock(product.id, 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <p style={{ fontSize: "2rem" }}>📦</p>
          <p>No hay productos cargados.</p>
        </div>
      )}
    </div>
  );
}

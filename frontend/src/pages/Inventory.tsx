import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type DBProduct } from "../db/database";
import { api } from "../services/api";
import { useToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";

type FormMode = "create" | "edit" | null;

export function Inventory() {
  const products = useLiveQuery(() => db.products.orderBy("name").toArray(), [], []);
  const { showToast } = useToast();
  const { user } = useAuth();
  const readOnly = user?.role !== "admin";

  // Form state
  const [mode, setMode] = useState<FormMode>(null);
  const [editTarget, setEditTarget] = useState<DBProduct | null>(null);
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formStock, setFormStock] = useState("0");
  const [formThreshold, setFormThreshold] = useState("5");
  const [formActive, setFormActive] = useState(true);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const openCreate = () => {
    setFormName(""); setFormPrice(""); setFormStock("0");
    setFormThreshold("5"); setFormActive(true); setFormError("");
    setEditTarget(null);
    setMode("create");
  };

  const openEdit = (product: DBProduct) => {
    setFormName(product.name);
    setFormPrice(String(product.price));
    setFormStock(String(product.stock));
    setFormThreshold(String(product.low_stock_threshold));
    setFormActive(product.active);
    setFormError("");
    setEditTarget(product);
    setMode("edit");
  };

  const closeForm = () => { setMode(null); setEditTarget(null); };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    const price = parseFloat(formPrice);
    const stock = parseInt(formStock, 10);
    const threshold = parseInt(formThreshold, 10);
    if (!name || isNaN(price) || price < 0) {
      setFormError("Nombre y precio son requeridos");
      return;
    }
    setFormSaving(true);
    setFormError("");
    try {
      if (mode === "create") {
        const p = await api.post("/api/products", {
          name, price,
          stock: isNaN(stock) ? 0 : stock,
          low_stock_threshold: isNaN(threshold) ? 5 : threshold,
          active: true,
        });
        await db.products.put({ id: p.id, name: p.name, price: p.price, stock: p.stock, low_stock_threshold: p.low_stock_threshold, active: p.active });
        showToast("Producto creado");
      } else if (editTarget) {
        const p = await api.put(`/api/products/${editTarget.id}`, {
          name, price,
          low_stock_threshold: isNaN(threshold) ? 5 : threshold,
          active: formActive,
        });
        await db.products.update(editTarget.id, { name: p.name, price: p.price, low_stock_threshold: p.low_stock_threshold, active: p.active });
        showToast("Producto actualizado");
      }
      closeForm();
    } catch {
      setFormError("Error al guardar el producto");
    } finally {
      setFormSaving(false);
    }
  };

  const adjustStock = async (productId: number, delta: number) => {
    const product = await db.products.get(productId);
    if (!product) return;
    const newStock = Math.max(0, product.stock + delta);
    await db.products.update(productId, { stock: newStock });
    if (navigator.onLine) {
      try { await api.put(`/api/products/${productId}/stock`, { stock: newStock }); }
      catch { /* Will sync later */ }
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          Inventario
          {readOnly && <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--text-light)", marginLeft: 8 }}>(solo lectura)</span>}
        </h1>
        {!readOnly && (
          <button
            className="btn btn-primary"
            style={{ padding: "8px 14px", minHeight: "auto", fontSize: "0.85rem" }}
            onClick={openCreate}
          >
            + Nuevo
          </button>
        )}
      </div>

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
              <div key={product.id} className="inventory-item" style={{ opacity: product.active ? 1 : 0.45 }}>
                <div className="inventory-info">
                  <div className="inventory-name">
                    {product.name}
                    {!product.active && (
                      <span style={{ marginLeft: 8, fontSize: "0.72rem", color: "var(--text-light)", fontWeight: 500 }}>inactivo</span>
                    )}
                    {product.active && isLow && (
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
                {!readOnly && (
                  <button
                    onClick={() => openEdit(product)}
                    aria-label="Editar producto"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px", color: "var(--text-light)", flexShrink: 0 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                )}
                <div className="inventory-stock">
                  <button
                    className="stock-btn"
                    onClick={() => adjustStock(product.id, -1)}
                    disabled={readOnly || product.stock <= 0}
                  >
                    -
                  </button>
                  <input
                    className={`stock-value ${isCritical ? "critical" : isLow ? "low" : ""}`}
                    type="number"
                    value={product.stock}
                    onChange={(e) => setStock(product.id, e.target.value)}
                    readOnly={readOnly}
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
                    disabled={readOnly}
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

      {mode && (
        <div className="product-sheet-overlay" onClick={closeForm}>
          <div className="product-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="product-sheet-title">
              {mode === "create" ? "Nuevo producto" : "Editar producto"}
            </h2>
            <form onSubmit={handleSave}>
              <div className="login-field">
                <label>Nombre</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nombre del producto"
                  disabled={formSaving}
                  autoFocus
                />
              </div>
              <div className="login-field">
                <label>Precio ($)</label>
                <input
                  type="number"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  disabled={formSaving}
                />
              </div>
              {mode === "create" && (
                <div className="login-field">
                  <label>Stock inicial</label>
                  <input
                    type="number"
                    value={formStock}
                    onChange={(e) => setFormStock(e.target.value)}
                    placeholder="0"
                    min="0"
                    disabled={formSaving}
                  />
                </div>
              )}
              <div className="login-field">
                <label>Alerta stock bajo (cantidad)</label>
                <input
                  type="number"
                  value={formThreshold}
                  onChange={(e) => setFormThreshold(e.target.value)}
                  placeholder="5"
                  min="0"
                  disabled={formSaving}
                />
              </div>
              {mode === "edit" && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <input
                    type="checkbox"
                    id="product-active"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                    disabled={formSaving}
                    style={{ width: 18, height: 18, cursor: "pointer" }}
                  />
                  <label htmlFor="product-active" style={{ margin: 0, fontSize: "0.9rem", cursor: "pointer" }}>
                    Producto activo
                  </label>
                </div>
              )}
              {formError && <p className="login-error">{formError}</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={closeForm}
                  disabled={formSaving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={formSaving || !formName.trim() || !formPrice}
                >
                  {formSaving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

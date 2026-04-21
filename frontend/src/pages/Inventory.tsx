import { useState, useRef, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type DBProduct } from "../db/database";
import { api } from "../services/api";
import { getStoredToken } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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
  const [formCostPrice, setFormCostPrice] = useState("");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formImagePreview, setFormImagePreview] = useState("");
  const [formImageData, setFormImageData] = useState("");
  const [formUploading, setFormUploading] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState("");
  // Per-product draft while the user types in the stock input.
  // Keeps the input editable even though the committed value comes from a live query.
  const [stockDrafts, setStockDrafts] = useState<Record<number, string>>({});

  const openCreate = () => {
    setFormName(""); setFormPrice(""); setFormCostPrice(""); setFormStock("0");
    setFormThreshold("5"); setFormActive(true); setFormImageUrl(""); setFormImagePreview(""); setFormImageData(""); setFormError("");
    setEditTarget(null);
    setMode("create");
  };

  const openEdit = (product: DBProduct) => {
    setFormName(product.name);
    setFormPrice(String(product.price));
    setFormStock(String(product.stock));
    setFormThreshold(String(product.low_stock_threshold));
    setFormActive(product.active);
    setFormCostPrice(product.cost_price != null ? String(product.cost_price) : "");
    setFormImageUrl(product.image_url || "");
    setFormImagePreview(product.image_data || "");
    setFormImageData(product.image_data || "");
    setFormError("");
    setEditTarget(product);
    setMode("edit");
  };

  const closeForm = () => { setMode(null); setEditTarget(null); };
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read as base64 immediately (works offline)
    const base64 = await readAsBase64(file);
    setFormImagePreview(base64);
    setFormImageData(base64);

    // Upload to server for persistence
    setFormUploading(true);
    setFormError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getStoredToken();
      const res = await fetch(`${API_URL}/api/products/upload-image`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || "Error al subir imagen");
      }
      const data = await res.json();
      setFormImageUrl(data.url);
      showToast("Imagen subida");
    } catch (err: any) {
      // Base64 is already stored locally — image works offline even if upload fails
      showToast("Imagen guardada solo en este dispositivo");
    } finally {
      setFormUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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
      const imageUrl = formImageUrl.trim() || undefined;
      const costPrice = formCostPrice ? parseFloat(formCostPrice) : undefined;
      if (mode === "create") {
        const p = await api.post("/api/products", {
          name, price,
          stock: isNaN(stock) ? 0 : stock,
          low_stock_threshold: isNaN(threshold) ? 5 : threshold,
          active: true,
          cost_price: costPrice,
          image_url: imageUrl,
        });
        await db.products.put({ id: p.id, name: p.name, price: p.price, stock: p.stock, low_stock_threshold: p.low_stock_threshold, active: p.active, cost_price: p.cost_price, image_url: p.image_url, image_data: formImageData || undefined });
        showToast("Producto creado");
      } else if (editTarget) {
        const p = await api.put(`/api/products/${editTarget.id}`, {
          name, price,
          low_stock_threshold: isNaN(threshold) ? 5 : threshold,
          active: formActive,
          cost_price: costPrice,
          image_url: imageUrl,
        });
        await db.products.update(editTarget.id, { name: p.name, price: p.price, low_stock_threshold: p.low_stock_threshold, active: p.active, cost_price: p.cost_price, image_url: p.image_url, image_data: formImageData || undefined });
        showToast("Producto actualizado");
      }
      closeForm();
    } catch (err: any) {
      setFormError(err?.message || "Error al guardar el producto");
    } finally {
      setFormSaving(false);
    }
  };

  const clearStockDraft = (productId: number) => {
    setStockDrafts((prev) => {
      if (!(productId in prev)) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const adjustStock = async (productId: number, delta: number) => {
    // Typed-but-uncommitted input should not linger once +/- is used.
    clearStockDraft(productId);
    if (!navigator.onLine) {
      showToast("Se requiere conexión para ajustar stock");
      return;
    }
    const product = await db.products.get(productId);
    if (!product) return;
    const newStock = Math.max(0, product.stock + delta);
    const previousStock = product.stock;
    // Optimistic local update so the UI responds instantly; revert on API failure.
    await db.products.update(productId, { stock: newStock });
    try {
      await api.put(`/api/products/${productId}/stock`, { stock: newStock });
    } catch {
      await db.products.update(productId, { stock: previousStock });
      showToast("Error al actualizar stock");
    }
  };

  const handleStockInputChange = (productId: number, value: string) => {
    setStockDrafts((prev) => ({ ...prev, [productId]: value }));
  };

  const commitStockDraft = async (productId: number) => {
    const draft = stockDrafts[productId];
    if (draft === undefined) return;

    const product = await db.products.get(productId);
    if (!product) {
      clearStockDraft(productId);
      return;
    }

    const num = parseInt(draft, 10);
    if (isNaN(num) || num < 0 || num === product.stock) {
      clearStockDraft(productId);
      return;
    }

    if (!navigator.onLine) {
      clearStockDraft(productId);
      showToast("Se requiere conexión para ajustar stock");
      return;
    }

    const previousStock = product.stock;
    // Write Dexie first so the live query already shows `num` before we clear the
    // draft — otherwise the input briefly falls back to the old product.stock.
    await db.products.update(productId, { stock: num });
    clearStockDraft(productId);

    try {
      await api.put(`/api/products/${productId}/stock`, { stock: num });
      showToast("Stock actualizado");
    } catch {
      await db.products.update(productId, { stock: previousStock });
      showToast("Error al actualizar stock");
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
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={5}
                    value={stockDrafts[product.id] ?? product.stock}
                    onChange={(e) => handleStockInputChange(product.id, e.target.value)}
                    onFocus={(e) => {
                      // Defer select() so it runs after the browser has placed the
                      // cursor from the tap; without this, mobile browsers move the
                      // cursor AFTER onFocus fires and undo the selection.
                      const el = e.currentTarget;
                      setTimeout(() => el.select(), 0);
                    }}
                    onBlur={() => commitStockDraft(product.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      } else if (e.key === "Escape") {
                        clearStockDraft(product.id);
                        e.currentTarget.blur();
                      }
                    }}
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
            <div className="product-sheet-handle" />
            <div className="product-sheet-header">
              <h2 className="product-sheet-title">
                {mode === "create" ? "Nuevo producto" : "Editar producto"}
              </h2>
              <button
                type="button"
                className="product-sheet-close"
                onClick={closeForm}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="product-sheet-body">
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
                  <label>Precio de venta ($)</label>
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
                <div className="login-field">
                  <label>Costo ($) <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>opcional</span></label>
                  <input
                    type="number"
                    value={formCostPrice}
                    onChange={(e) => setFormCostPrice(e.target.value)}
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
                  <label>Imagen</label>
                  {(formImagePreview || formImageUrl) && (
                    <div style={{ marginBottom: 8, textAlign: "center" }}>
                      <img
                        src={formImagePreview || `${API_URL}${formImageUrl}`}
                        alt="Vista previa"
                        style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 12, border: "2px solid var(--border)" }}
                      />
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleImageUpload}
                    disabled={formSaving || formUploading}
                    style={{ fontSize: "0.85rem" }}
                  />
                  {formUploading && <p style={{ fontSize: "0.8rem", color: "var(--text-light)", marginTop: 4 }}>Subiendo imagen...</p>}
                </div>
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
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: 8 }}
                  disabled={formSaving || formUploading || !formName.trim() || !formPrice}
                >
                  {formUploading ? "Subiendo imagen..." : formSaving ? "Guardando..." : "Guardar"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

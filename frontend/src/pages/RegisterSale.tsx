import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type DBProduct } from "../db/database";
import { syncToServer } from "../db/sync";
import { ProductGrid } from "../components/ProductGrid";
import { useToast } from "../components/Toast";
import { useAuth, SALE_DRAFT_KEY } from "../contexts/AuthContext";
import { api } from "../services/api";
import type { CartItem } from "../types";

type PaymentMethod = "efectivo" | "transferencia" | null;

interface SaleDraft {
  user_id?: number;
  cart: CartItem[];
  paymentMethod: PaymentMethod;
  amountPaid: string;
}

function loadSaleDraft(userId: number | undefined): SaleDraft | null {
  try {
    const raw = sessionStorage.getItem(SALE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaleDraft;
    // Discard a draft left by a previous user to avoid cross-session cart leaks.
    if (parsed.user_id !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function RegisterSale() {
  const { user } = useAuth();
  const initialDraft = loadSaleDraft(user?.id);

  const [cart, setCart] = useState<CartItem[]>(initialDraft?.cart ?? []);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialDraft?.paymentMethod ?? null);
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [amountPaid, setAmountPaid] = useState(initialDraft?.amountPaid ?? "");
  const [hasShift, setHasShift] = useState<boolean | null>(null); // null = loading
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Persist the in-flight sale so a 401-triggered reload, crash, or accidental nav
  // doesn't lose what the cashier already rang up.
  useEffect(() => {
    try {
      if (cart.length === 0) {
        sessionStorage.removeItem(SALE_DRAFT_KEY);
      } else {
        const draft: SaleDraft = { user_id: user?.id, cart, paymentMethod, amountPaid };
        sessionStorage.setItem(SALE_DRAFT_KEY, JSON.stringify(draft));
      }
    } catch {
      // sessionStorage may be unavailable or full — fail silently, losing draft
      // is not worse than today's behavior.
    }
  }, [cart, paymentMethod, amountPaid, user?.id]);

  // Check if user has an open shift
  useEffect(() => {
    if (!navigator.onLine) { setHasShift(true); return; } // Allow offline sales
    api.get("/api/shifts/me/current")
      .then((data) => setHasShift(data !== null))
      .catch(() => setHasShift(true)); // On error, don't block sales
  }, []);

  const products = useLiveQuery(() => db.products.orderBy("name").toArray(), [], []);

  const addToCart = (product: DBProduct) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          showToast("Sin stock suficiente");
          return prev;
        }
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      if (product.stock <= 0) {
        showToast("Sin stock suficiente");
        return prev;
      }
      return [...prev, { product: product as any, quantity: 1 }];
    });
  };

  const updateQty = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.product.id !== productId) return c;
          const newQty = c.quantity + delta;
          if (newQty <= 0) return null;
          if (newQty > c.product.stock) {
            showToast("Sin stock suficiente");
            return c;
          }
          return { ...c, quantity: newQty };
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const total = cart.reduce((sum, c) => sum + c.product.price * c.quantity, 0);
  const paidNum = parseFloat(amountPaid) || 0;
  const change = paidNum - total;

  const handleRegister = async () => {
    if (cart.length === 0 || !paymentMethod) return;
    setSaving(true);
    try {
      const uuid = crypto.randomUUID();
      const now = new Date().toISOString();

      await db.transaction("rw", [db.sales, db.saleItems, db.products], async () => {
        await db.sales.add({
          client_uuid: uuid,
          total,
          payment_method: paymentMethod,
          created_at: now,
          synced: 0,
          user_id: user?.id,
        });
        for (const item of cart) {
          await db.saleItems.add({
            sale_uuid: uuid,
            product_id: item.product.id,
            product_name: item.product.name,
            quantity: item.quantity,
            unit_price: item.product.price,
            subtotal: item.product.price * item.quantity,
          });
          const current = await db.products.get(item.product.id);
          if (current) {
            await db.products.update(item.product.id, {
              stock: Math.max(0, current.stock - item.quantity),
            });
          }
        }
      });

      setCart([]);
      setPaymentMethod(null);
      const changeMsg = paymentMethod === "efectivo" && change > 0 ? ` · Cambio: $${change.toFixed(2)}` : "";
      setAmountPaid("");
      showToast(`Venta registrada: $${total}${changeMsg}`);

      if (navigator.onLine) {
        syncToServer().catch(() => {});
      }
    } catch (error) {
      console.error("Error saving sale:", error);
      showToast("Error al guardar la venta");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sale-page">
      {/* ── Catalog zone — scrollable ── */}
      <div className="sale-catalog">
        <h1 className="page-title">Registrar Venta</h1>

        {hasShift === false && (
          <div className="card" style={{ background: "var(--warning-soft)", marginBottom: 12, textAlign: "center" }}>
            <p style={{ fontWeight: 600, color: "#92400e", fontSize: "0.9rem", marginBottom: 8 }}>
              No tienes un turno abierto
            </p>
            <button
              className="btn btn-primary"
              style={{ padding: "8px 20px", minHeight: "auto", fontSize: "0.85rem" }}
              onClick={() => navigate("/shifts")}
            >
              Abrir Turno
            </button>
          </div>
        )}

        {products && products.length > 0 ? (
          <ProductGrid products={products} cart={cart} onAddToCart={addToCart} />
        ) : (
          <div className="empty-state">
            <p style={{ fontSize: "2rem" }}>📦</p>
            <p>No hay productos cargados. Sincroniza con el servidor.</p>
          </div>
        )}
      </div>

      {/* ── Checkout zone — always visible ── */}
      <div className="sale-footer">
        {cart.length > 0 ? (
          <div className="sale-footer-content">
            {/* Cart header */}
            <div className="cart-header">
              <span>Carrito ({cart.length})</span>
              {confirmClear ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--danger, #dc2626)" }}>¿Limpiar?</span>
                  <button
                    className="btn btn-danger"
                    style={{ padding: "4px 10px", fontSize: "0.8rem", minHeight: "auto" }}
                    onClick={() => { setCart([]); setConfirmClear(false); }}
                  >
                    Sí
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: "4px 10px", fontSize: "0.8rem", minHeight: "auto" }}
                    onClick={() => setConfirmClear(false)}
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-secondary"
                  style={{ padding: "6px 12px", fontSize: "0.8rem", minHeight: "auto" }}
                  onClick={() => setConfirmClear(true)}
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Cart items — capped height, scrollable */}
            <div className="cart-items-mini">
              {cart.map((item) => (
                <div key={item.product.id} className="cart-item">
                  <div className="cart-item-info">
                    <div className="cart-item-name">{item.product.name}</div>
                    <div className="cart-item-price">${item.product.price} c/u</div>
                  </div>
                  <div className="qty-controls">
                    <button className="qty-btn" onClick={() => updateQty(item.product.id, -1)}>-</button>
                    <span className="qty-value">{item.quantity}</span>
                    <button className="qty-btn" onClick={() => updateQty(item.product.id, 1)}>+</button>
                  </div>
                  <span className="cart-item-subtotal">${item.product.price * item.quantity}</span>
                </div>
              ))}
            </div>

            {/* Payment method */}
            <div className="payment-section">
              <button
                className={`payment-btn ${paymentMethod === "efectivo" ? "selected" : ""}`}
                onClick={() => { setPaymentMethod("efectivo"); setAmountPaid(""); }}
              >
                <span className="payment-icon">💵</span>
                Efectivo
              </button>
              <button
                className={`payment-btn ${paymentMethod === "transferencia" ? "selected" : ""}`}
                onClick={() => { setPaymentMethod("transferencia"); setAmountPaid(""); }}
              >
                <span className="payment-icon">📱</span>
                Transferencia
              </button>
            </div>

            {/* Cash change calculator — only for efectivo */}
            {paymentMethod === "efectivo" && (
              <div className="cash-calculator">
                <div className="cash-input-row">
                  <label>Recibido</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    placeholder="$0.00"
                  />
                </div>
                <div className="cash-quick-buttons">
                  {[20, 50, 100, 200, 500].map((d) => (
                    <button key={d} type="button" onClick={() => setAmountPaid(String(d))}>${d}</button>
                  ))}
                </div>
                {paidNum > 0 && (
                  <div className={`cash-change ${change >= 0 ? "ok" : "short"}`}>
                    {change >= 0
                      ? `Cambio: $${change.toFixed(2)}`
                      : `Falta: $${Math.abs(change).toFixed(2)}`}
                  </div>
                )}
              </div>
            )}

            {/* Register button */}
            <button
              className="btn btn-primary btn-block register-btn"
              onClick={handleRegister}
              disabled={!paymentMethod || saving || (paymentMethod === "efectivo" && paidNum < total)}
            >
              {saving ? "Guardando..." : `Registrar $${total}`}
            </button>
          </div>
        ) : (
          <p className="sale-footer-hint">Toca un producto para agregar al carrito</p>
        )}
      </div>
    </div>
  );
}

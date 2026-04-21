import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type DBProduct, type DBPayment } from "../db/database";
import { syncToServer } from "../db/sync";
import { ProductGrid } from "../components/ProductGrid";
import { useToast } from "../components/Toast";
import { useAuth, SALE_DRAFT_KEY } from "../contexts/AuthContext";
import { api } from "../services/api";
import type { CartItem } from "../types";

interface SaleDraft {
  user_id?: number;
  cart: CartItem[];
  discountInput: string;
  efectivoActive: boolean;
  transferActive: boolean;
  efectivoInput: string;
  amountPaid: string;
  // Legacy field, read for backward compat when restoring a pre-split-payment draft.
  paymentMethod?: "efectivo" | "transferencia" | null;
}

function loadSaleDraft(userId: number | undefined): SaleDraft | null {
  try {
    const raw = sessionStorage.getItem(SALE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaleDraft;
    if (parsed.user_id !== userId) return null;
    // Translate legacy single-method drafts into the new toggle model.
    if (
      parsed.paymentMethod !== undefined &&
      parsed.efectivoActive === undefined &&
      parsed.transferActive === undefined
    ) {
      parsed.efectivoActive = parsed.paymentMethod === "efectivo";
      parsed.transferActive = parsed.paymentMethod === "transferencia";
      parsed.discountInput = parsed.discountInput ?? "";
      parsed.efectivoInput = parsed.efectivoInput ?? "";
    }
    return parsed;
  } catch {
    return null;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function RegisterSale() {
  const { user } = useAuth();
  const initialDraft = loadSaleDraft(user?.id);

  const [cart, setCart] = useState<CartItem[]>(initialDraft?.cart ?? []);
  const [discountInput, setDiscountInput] = useState(initialDraft?.discountInput ?? "");
  const [efectivoActive, setEfectivoActive] = useState(initialDraft?.efectivoActive ?? false);
  const [transferActive, setTransferActive] = useState(initialDraft?.transferActive ?? false);
  const [efectivoInput, setEfectivoInput] = useState(initialDraft?.efectivoInput ?? "");
  const [amountPaid, setAmountPaid] = useState(initialDraft?.amountPaid ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [hasShift, setHasShift] = useState<boolean | null>(null);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    try {
      if (cart.length === 0) {
        sessionStorage.removeItem(SALE_DRAFT_KEY);
      } else {
        const draft: SaleDraft = {
          user_id: user?.id,
          cart,
          discountInput,
          efectivoActive,
          transferActive,
          efectivoInput,
          amountPaid,
        };
        sessionStorage.setItem(SALE_DRAFT_KEY, JSON.stringify(draft));
      }
    } catch {
      // sessionStorage unavailable/full — non-fatal.
    }
  }, [cart, discountInput, efectivoActive, transferActive, efectivoInput, amountPaid, user?.id]);

  useEffect(() => {
    if (!navigator.onLine) { setHasShift(true); return; }
    api.get("/api/shifts/me/current")
      .then((data) => setHasShift(data !== null))
      .catch(() => setHasShift(true));
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

  const subtotal = cart.reduce((sum, c) => sum + c.product.price * c.quantity, 0);
  const discountRaw = parseFloat(discountInput);
  const discount = Math.max(0, Math.min(subtotal, isNaN(discountRaw) ? 0 : discountRaw));
  const total = round2(subtotal - discount);

  const isSplit = efectivoActive && transferActive;
  const hasMethod = efectivoActive || transferActive;

  // Cash amount the customer owes in cash (not bills handed over).
  let efectivoAmount = 0;
  if (isSplit) {
    const raw = parseFloat(efectivoInput);
    efectivoAmount = round2(Math.max(0, Math.min(total, isNaN(raw) ? 0 : raw)));
  } else if (efectivoActive) {
    efectivoAmount = total;
  }
  const transferAmount = hasMethod ? round2(total - efectivoAmount) : 0;

  const paidCashNum = parseFloat(amountPaid) || 0;
  const change = paidCashNum - efectivoAmount;

  const toggleEfectivo = () => {
    setEfectivoActive((prev) => {
      const next = !prev;
      if (!next) {
        // Leaving split or turning off efectivo entirely — reset cash entry fields.
        setEfectivoInput("");
        setAmountPaid("");
      }
      return next;
    });
  };

  const toggleTransfer = () => {
    setTransferActive((prev) => {
      const next = !prev;
      if (!next) setEfectivoInput("");
      return next;
    });
  };

  const canRegister =
    cart.length > 0 &&
    total > 0 &&
    hasMethod &&
    (!efectivoActive || paidCashNum >= efectivoAmount) &&
    (!isSplit || (efectivoAmount > 0 && transferAmount > 0));

  const resetCheckout = () => {
    setCart([]);
    setDiscountInput("");
    setEfectivoActive(false);
    setTransferActive(false);
    setEfectivoInput("");
    setAmountPaid("");
  };

  const handleRegister = async () => {
    if (!canRegister) return;
    setSaving(true);
    try {
      const uuid = crypto.randomUUID();
      const now = new Date().toISOString();

      const payments: DBPayment[] = [];
      if (efectivoActive && efectivoAmount > 0) {
        payments.push({ method: "efectivo", amount: efectivoAmount });
      }
      if (transferActive && transferAmount > 0) {
        payments.push({ method: "transferencia", amount: transferAmount });
      }
      const paymentMethod = payments.length === 1 ? payments[0].method : "mixto";

      await db.transaction("rw", [db.sales, db.saleItems, db.products], async () => {
        await db.sales.add({
          client_uuid: uuid,
          total,
          payment_method: paymentMethod,
          payments,
          discount_amount: discount,
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

      const cashChange = efectivoActive && change > 0 ? ` · Cambio: $${change.toFixed(2)}` : "";
      resetCheckout();
      showToast(`Venta registrada: $${total.toFixed(2)}${cashChange}`);

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
                    onClick={() => { resetCheckout(); setConfirmClear(false); }}
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

            {/* Subtotal / Discount / Total */}
            <div className="totals-block">
              <div className="totals-row">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="totals-row">
                <label htmlFor="discount-input" style={{ margin: 0 }}>Descuento</label>
                <input
                  id="discount-input"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]*"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  onFocus={(e) => {
                    const el = e.currentTarget;
                    setTimeout(() => el.select(), 0);
                  }}
                  placeholder="0"
                  maxLength={7}
                  style={{
                    width: 80,
                    textAlign: "right",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontWeight: 600,
                  }}
                />
              </div>
              <div className="totals-row totals-total">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment methods — multi-select */}
            <div className="payment-section">
              <button
                className={`payment-btn ${efectivoActive ? "selected" : ""}`}
                onClick={toggleEfectivo}
                type="button"
              >
                <span className="payment-icon">💵</span>
                Efectivo
              </button>
              <button
                className={`payment-btn ${transferActive ? "selected" : ""}`}
                onClick={toggleTransfer}
                type="button"
              >
                <span className="payment-icon">📱</span>
                Transferencia
              </button>
            </div>

            {/* Split payment breakdown */}
            {isSplit && (
              <div className="split-panel">
                <div className="split-row">
                  <label htmlFor="efectivo-split" style={{ margin: 0 }}>Efectivo</label>
                  <input
                    id="efectivo-split"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*\.?[0-9]*"
                    value={efectivoInput}
                    onChange={(e) => setEfectivoInput(e.target.value)}
                    onFocus={(e) => {
                      const el = e.currentTarget;
                      setTimeout(() => el.select(), 0);
                    }}
                    placeholder="$0.00"
                    maxLength={8}
                  />
                </div>
                <div className="split-row" style={{ color: "var(--text-light)" }}>
                  <span>Transferencia</span>
                  <span style={{ fontWeight: 600 }}>${transferAmount.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Cash received + change calculator — only when efectivo is involved */}
            {efectivoActive && (
              <div className="cash-calculator">
                <div className="cash-input-row">
                  <label>
                    Recibido{isSplit ? " en efectivo" : ""}
                  </label>
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
                {paidCashNum > 0 && (
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
              disabled={!canRegister || saving}
            >
              {saving ? "Guardando..." : `Registrar $${total.toFixed(2)}`}
            </button>
          </div>
        ) : (
          <p className="sale-footer-hint">Toca un producto para agregar al carrito</p>
        )}
      </div>
    </div>
  );
}

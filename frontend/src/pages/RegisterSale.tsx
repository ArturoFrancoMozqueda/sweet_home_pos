import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type DBPayment, type DBProduct } from "../db/database";
import { syncToServer } from "../db/sync";
import { ProductGrid } from "../components/ProductGrid";
import { useToast } from "../components/Toast";
import { useAuth, SALE_DRAFT_KEY } from "../contexts/AuthContext";
import { api } from "../services/api";
import {
  getCachedShiftState,
  setCachedShiftState,
  type CachedShiftState,
} from "../services/shiftCache";
import type { CartItem } from "../types";

type PaymentMode = "efectivo" | "transferencia" | "mixto" | null;

interface SaleDraft {
  user_id?: number;
  cart: CartItem[];
  discountInput: string;
  paymentMode: PaymentMode;
  efectivoInput: string;
  amountPaid: string;
  // Legacy fields, read for backward compat.
  efectivoActive?: boolean;
  transferActive?: boolean;
  paymentMethod?: "efectivo" | "transferencia" | null;
}

function loadSaleDraft(userId: number | undefined): SaleDraft | null {
  try {
    const raw = sessionStorage.getItem(SALE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaleDraft;
    if (parsed.user_id !== userId) return null;

    if (!parsed.paymentMode) {
      if (parsed.efectivoActive && parsed.transferActive) {
        parsed.paymentMode = "mixto";
      } else if (parsed.efectivoActive) {
        parsed.paymentMode = "efectivo";
      } else if (parsed.transferActive) {
        parsed.paymentMode = "transferencia";
      } else {
        parsed.paymentMode = parsed.paymentMethod ?? null;
      }
    }

    parsed.discountInput = parsed.discountInput ?? "";
    parsed.efectivoInput = parsed.efectivoInput ?? "";
    parsed.amountPaid = parsed.amountPaid ?? "";
    return parsed;
  } catch {
    return null;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function toShiftCache(userId: number | undefined, data: any | null): CachedShiftState | null {
  if (!userId) return null;
  if (!data) {
    return {
      user_id: userId,
      shift_id: null,
      is_open: false,
      updated_at: new Date().toISOString(),
    };
  }
  return {
    user_id: userId,
    shift_id: data.id,
    is_open: true,
    opened_at: data.opened_at,
    opening_cash: data.opening_cash,
    cash_sales: data.cash_sales,
    transfer_sales: data.transfer_sales,
    expected_cash: data.expected_cash,
    updated_at: new Date().toISOString(),
  };
}

export function RegisterSale() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const initialDraft = loadSaleDraft(user?.id);
  const [cart, setCart] = useState<CartItem[]>(initialDraft?.cart ?? []);
  const [discountInput, setDiscountInput] = useState(initialDraft?.discountInput ?? "");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(initialDraft?.paymentMode ?? null);
  const [efectivoInput, setEfectivoInput] = useState(initialDraft?.efectivoInput ?? "");
  const [amountPaid, setAmountPaid] = useState(initialDraft?.amountPaid ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [shiftState, setShiftState] = useState<CachedShiftState | null>(() =>
    getCachedShiftState(user?.id)
  );

  useEffect(() => {
    try {
      if (cart.length === 0) {
        sessionStorage.removeItem(SALE_DRAFT_KEY);
      } else {
        const draft: SaleDraft = {
          user_id: user?.id,
          cart,
          discountInput,
          paymentMode,
          efectivoInput,
          amountPaid,
        };
        sessionStorage.setItem(SALE_DRAFT_KEY, JSON.stringify(draft));
      }
    } catch {
      // sessionStorage unavailable/full â€” non-fatal.
    }
  }, [amountPaid, cart, discountInput, efectivoInput, paymentMode, user?.id]);

  useEffect(() => {
    const cached = getCachedShiftState(user?.id);
    if (!navigator.onLine) {
      setShiftState(cached);
      return;
    }

    api
      .get("/api/shifts/me/current")
      .then((data) => {
        const next = toShiftCache(user?.id, data);
        setShiftState(next);
        if (next) {
          setCachedShiftState(user?.id, {
            shift_id: next.shift_id,
            is_open: next.is_open,
            opened_at: next.opened_at,
            opening_cash: next.opening_cash,
            cash_sales: next.cash_sales,
            transfer_sales: next.transfer_sales,
            expected_cash: next.expected_cash,
          });
        }
      })
      .catch(() => setShiftState(cached));
  }, [user?.id]);

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
  const totalUnits = cart.reduce((sum, item) => sum + item.quantity, 0);

  const discountRaw = parseFloat(discountInput);
  const requestedDiscount = isNaN(discountRaw) ? 0 : discountRaw;
  const discountTooHigh = subtotal > 0 && requestedDiscount >= subtotal;
  const discount = round2(Math.max(0, Math.min(subtotal, requestedDiscount)));
  const total = round2(subtotal - discount);

  const hasCashComponent = paymentMode === "efectivo" || paymentMode === "mixto";
  const isSplit = paymentMode === "mixto";

  let efectivoAmount = 0;
  if (paymentMode === "mixto") {
    const raw = parseFloat(efectivoInput);
    efectivoAmount = round2(Math.max(0, Math.min(total, isNaN(raw) ? 0 : raw)));
  } else if (paymentMode === "efectivo") {
    efectivoAmount = total;
  }
  const transferAmount =
    paymentMode === "transferencia"
      ? total
      : paymentMode === "mixto"
        ? round2(total - efectivoAmount)
        : 0;

  const hasAmountPaid = amountPaid.trim() !== "";
  const typedAmountPaid = hasAmountPaid ? round2(parseFloat(amountPaid) || 0) : 0;
  const effectiveAmountPaid = hasCashComponent
    ? hasAmountPaid
      ? typedAmountPaid
      : efectivoAmount
    : 0;
  const change = round2(effectiveAmountPaid - efectivoAmount);

  const hasShift = shiftState?.is_open === true;
  const shiftStatusKnown = shiftState !== null;
  const shiftMessage = hasShift
    ? ""
    : navigator.onLine
      ? "Necesitas abrir un turno antes de registrar ventas."
      : shiftStatusKnown
        ? "Sin turno abierto en este dispositivo. Abre uno al reconectar para continuar."
        : "No se pudo confirmar un turno abierto sin conexión.";

  const canRegister =
    cart.length > 0 &&
    total > 0 &&
    !!paymentMode &&
    hasShift &&
    !discountTooHigh &&
    (!isSplit || (efectivoAmount > 0 && transferAmount > 0)) &&
    (!hasCashComponent || effectiveAmountPaid >= efectivoAmount);

  let registerLabel = `Registrar ${formatMoney(total)}`;
  if (saving) {
    registerLabel = "Guardando...";
  } else if (!hasShift) {
    registerLabel = "Abre un turno";
  } else if (discountTooHigh) {
    registerLabel = "Ajusta el descuento";
  } else if (!paymentMode) {
    registerLabel = "Elige un método de pago";
  } else if (isSplit && !(efectivoAmount > 0 && transferAmount > 0)) {
    registerLabel = "Completa el pago mixto";
  } else if (hasCashComponent && effectiveAmountPaid < efectivoAmount) {
    registerLabel = "Falta efectivo";
  }

  const resetCheckout = () => {
    setCart([]);
    setDiscountInput("");
    setPaymentMode(null);
    setEfectivoInput("");
    setAmountPaid("");
  };

  const addCashAmount = (denomination: number) => {
    setAmountPaid((prev) => {
      const current = parseFloat(prev) || 0;
      return String(round2(current + denomination));
    });
  };

  const handleRegister = async () => {
    if (!canRegister) return;
    setSaving(true);
    try {
      const uuid = crypto.randomUUID();
      const now = new Date().toISOString();

      const payments: DBPayment[] = [];
      if (hasCashComponent && efectivoAmount > 0) {
        payments.push({ method: "efectivo", amount: efectivoAmount });
      }
      if ((paymentMode === "transferencia" || paymentMode === "mixto") && transferAmount > 0) {
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

      const cashChange =
        hasCashComponent && hasAmountPaid && change > 0
          ? ` · Cambio: ${formatMoney(change)}`
          : "";
      resetCheckout();
      showToast(`Venta registrada: ${formatMoney(total)}${cashChange}`);

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
      <div className="sale-catalog">
        <h1 className="page-title">Registrar Venta</h1>

        {!hasShift && (
          <div
            className="card"
            style={{ background: "var(--warning-soft)", marginBottom: 12, textAlign: "center" }}
          >
            <p
              style={{
                fontWeight: 600,
                color: "#92400e",
                fontSize: "0.9rem",
                marginBottom: 8,
              }}
            >
              {shiftMessage}
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

      <div className="sale-footer">
        {cart.length > 0 ? (
          <div className="sale-footer-content">
            <div className="cart-header">
              <span>
                Carrito ({cart.length} producto{cart.length !== 1 ? "s" : ""} · {totalUnits} ud
                {totalUnits !== 1 ? "s" : ""})
              </span>
              {confirmClear ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--danger, #dc2626)" }}>
                    ¿Limpiar?
                  </span>
                  <button
                    className="btn btn-danger"
                    style={{ padding: "4px 10px", fontSize: "0.8rem", minHeight: "auto" }}
                    onClick={() => {
                      resetCheckout();
                      setConfirmClear(false);
                    }}
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

            <div className="cart-items-mini">
              {cart.map((item) => (
                <div key={item.product.id} className="cart-item">
                  <div className="cart-item-info">
                    <div className="cart-item-name">{item.product.name}</div>
                    <div className="cart-item-price">{formatMoney(item.product.price)} c/u</div>
                  </div>
                  <div className="qty-controls">
                    <button className="qty-btn" onClick={() => updateQty(item.product.id, -1)}>
                      -
                    </button>
                    <span className="qty-value">{item.quantity}</span>
                    <button className="qty-btn" onClick={() => updateQty(item.product.id, 1)}>
                      +
                    </button>
                  </div>
                  <span className="cart-item-subtotal">
                    {formatMoney(item.product.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            <div className="totals-block">
              <div className="totals-row">
                <span>Subtotal</span>
                <span>{formatMoney(subtotal)}</span>
              </div>
              <div className="totals-row">
                <label htmlFor="discount-input" style={{ margin: 0 }}>
                  Descuento
                </label>
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
              {discountTooHigh && (
                <div className="sale-inline-warning">
                  El descuento debe ser menor que el subtotal ({formatMoney(subtotal)}).
                </div>
              )}
              <div className="totals-row totals-total">
                <span>Total</span>
                <span>{formatMoney(total)}</span>
              </div>
            </div>

            <div className="payment-section payment-section-triple">
              <button
                className={`payment-btn ${paymentMode === "efectivo" ? "selected" : ""}`}
                onClick={() => {
                  setPaymentMode("efectivo");
                  setEfectivoInput("");
                }}
                type="button"
              >
                <span className="payment-icon">💵</span>
                Efectivo
              </button>
              <button
                className={`payment-btn ${paymentMode === "transferencia" ? "selected" : ""}`}
                onClick={() => {
                  setPaymentMode("transferencia");
                  setEfectivoInput("");
                  setAmountPaid("");
                }}
                type="button"
              >
                <span className="payment-icon">📱</span>
                Transferencia
              </button>
              <button
                className={`payment-btn ${paymentMode === "mixto" ? "selected" : ""}`}
                onClick={() => setPaymentMode("mixto")}
                type="button"
              >
                <span className="payment-icon">🧾</span>
                Mixto
              </button>
            </div>

            {isSplit && (
              <div className="split-panel">
                <div className="split-row">
                  <label htmlFor="efectivo-split" style={{ margin: 0 }}>
                    Efectivo
                  </label>
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
                  <span style={{ fontWeight: 600 }}>{formatMoney(transferAmount)}</span>
                </div>
                {!(efectivoAmount > 0 && transferAmount > 0) && (
                  <div className="sale-inline-warning">
                    Captura una parte en efectivo para calcular la transferencia restante.
                  </div>
                )}
              </div>
            )}

            {hasCashComponent && (
              <div className="cash-calculator">
                <div className="cash-input-row">
                  <label>Recibido{isSplit ? " en efectivo" : ""}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    placeholder={hasCashComponent ? `Exacto: ${formatMoney(efectivoAmount)}` : "$0.00"}
                  />
                </div>
                <div className="sale-inline-note">
                  Déjalo vacío si te pagaron exacto.
                </div>
                <div className="cash-quick-buttons">
                  {[20, 50, 100, 200, 500].map((d) => (
                    <button key={d} type="button" onClick={() => addCashAmount(d)}>
                      +${d}
                    </button>
                  ))}
                </div>
                {hasAmountPaid && (
                  <div className={`cash-change ${change >= 0 ? "ok" : "short"}`}>
                    {change >= 0
                      ? `Cambio: ${formatMoney(change)}`
                      : `Falta: ${formatMoney(Math.abs(change))}`}
                  </div>
                )}
              </div>
            )}

            {!canRegister && (
              <div className="sale-register-hint">
                {!hasShift
                  ? shiftMessage
                  : discountTooHigh
                    ? "Corrige el descuento para continuar."
                    : !paymentMode
                      ? "Selecciona cómo pagó el cliente."
                      : isSplit && !(efectivoAmount > 0 && transferAmount > 0)
                        ? "Completa la parte en efectivo del pago mixto."
                        : hasCashComponent && effectiveAmountPaid < efectivoAmount
                          ? "El efectivo recibido no alcanza para completar la venta."
                          : ""}
              </div>
            )}

            <button
              className="btn btn-primary btn-block register-btn"
              onClick={handleRegister}
              disabled={!canRegister || saving}
            >
              {registerLabel}
            </button>

            {!hasShift && (
              <button
                className="btn btn-secondary btn-block"
                style={{ marginTop: 8 }}
                onClick={() => navigate("/shifts")}
              >
                Ir a Turnos
              </button>
            )}
          </div>
        ) : (
          <p className="sale-footer-hint">Toca un producto para agregar al carrito</p>
        )}
      </div>
    </div>
  );
}

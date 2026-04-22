import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { useToast } from "../components/Toast";
import { db } from "../db/database";
import { api } from "../services/api";

interface InventoryMovementRecord {
  id: number;
  product_id: number;
  product_name: string;
  user_id: number;
  username: string;
  movement_type: string;
  quantity_delta: number;
  resulting_stock: number;
  reason: string;
  notes?: string | null;
  created_at: string;
}

const MOVEMENT_TYPES = [
  { value: "purchase", label: "Compra", sign: "+" },
  { value: "production", label: "Producción", sign: "+" },
  { value: "waste", label: "Merma", sign: "-" },
  { value: "breakage", label: "Rotura", sign: "-" },
  { value: "adjustment_in", label: "Ajuste +", sign: "+" },
  { value: "adjustment_out", label: "Ajuste -", sign: "-" },
];

function formatDateTime(value: string): string {
  return new Date(value.endsWith("Z") ? value : `${value}Z`).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  });
}

export function InventoryMovements() {
  const products = useLiveQuery(() => db.products.orderBy("name").toArray(), [], []);
  const { showToast } = useToast();
  const [movements, setMovements] = useState<InventoryMovementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [productId, setProductId] = useState("");
  const [movementType, setMovementType] = useState("production");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const loadMovements = async () => {
    setLoading(true);
    try {
      const data = await api.get("/api/inventory-movements");
      setMovements(Array.isArray(data) ? data : []);
    } catch {
      showToast("No se pudieron cargar los movimientos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMovements().catch(() => {});
  }, []);

  const createMovement = async () => {
    const selectedProductId = parseInt(productId, 10);
    const qty = parseInt(quantity, 10);
    if (!selectedProductId || Number.isNaN(qty) || qty <= 0 || !reason.trim()) {
      showToast("Completa producto, tipo, cantidad y motivo");
      return;
    }
    setSaving(true);
    try {
      const data = await api.post("/api/inventory-movements", {
        product_id: selectedProductId,
        movement_type: movementType,
        quantity: qty,
        reason: reason.trim(),
        notes: notes.trim() || null,
      });
      await db.products.update(data.product_id, { stock: data.resulting_stock });
      setMovements((prev) => [data, ...prev]);
      setQuantity("");
      setReason("");
      setNotes("");
      showToast("Movimiento aplicado");
    } catch {
      showToast("No se pudo guardar el movimiento");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Movimientos</h1>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Registrar movimiento</h3>
        <div className="login-field">
          <label>Producto</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Selecciona un producto</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} · Stock {product.stock}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 10 }}>
          <div className="login-field">
            <label>Tipo</label>
            <select value={movementType} onChange={(e) => setMovementType(e.target.value)}>
              {MOVEMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <div className="login-field">
            <label>Cantidad</label>
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        </div>
        <div className="login-field">
          <label>Motivo</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. horneado de la mañana, merma, compra urgente..." />
        </div>
        <div className="login-field">
          <label>Notas</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
        </div>
        <button className="btn btn-primary" style={{ width: "100%" }} onClick={createMovement} disabled={saving}>
          {saving ? "Guardando..." : "Aplicar movimiento"}
        </button>
      </div>

      {loading ? (
        <div className="empty-state">
          <p>Cargando...</p>
        </div>
      ) : movements.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: "2rem" }}>📦</p>
          <p>No hay movimientos registrados.</p>
        </div>
      ) : (
        movements.map((movement) => (
          <div key={movement.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 800 }}>{movement.product_name}</div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-light)" }}>
                  {formatDateTime(movement.created_at)} · {movement.username}
                </div>
              </div>
              <span className={`badge ${movement.quantity_delta > 0 ? "badge-success" : "badge-danger"}`}>
                {movement.quantity_delta > 0 ? "+" : ""}
                {movement.quantity_delta}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: "0.88rem" }}>
              <span>{MOVEMENT_TYPES.find((type) => type.value === movement.movement_type)?.label || movement.movement_type}</span>
              <strong>Stock final: {movement.resulting_stock}</strong>
            </div>
            <div style={{ marginTop: 8, color: "var(--text-light)", fontSize: "0.82rem" }}>
              {movement.reason}
              {movement.notes ? ` · ${movement.notes}` : ""}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

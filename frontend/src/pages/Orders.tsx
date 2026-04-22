import { useEffect, useMemo, useState } from "react";

import { useToast } from "../components/Toast";
import { api } from "../services/api";
import type { OrderRecord } from "../types";

const STATUS_OPTIONS: Array<{ value: OrderRecord["status"] | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "new", label: "Nuevos" },
  { value: "in_production", label: "Producción" },
  { value: "ready", label: "Listos" },
  { value: "delivered", label: "Entregados" },
  { value: "cancelled", label: "Cancelados" },
];

function formatMoney(value: number): string {
  return `$${value.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
}

function formatPickup(dateStr: string): string {
  return new Date(dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  });
}

function toDateTimeLocal(dateStr: string): string {
  const date = new Date(dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function statusLabel(status: OrderRecord["status"]): string {
  switch (status) {
    case "new":
      return "Nuevo";
    case "in_production":
      return "Producción";
    case "ready":
      return "Listo";
    case "delivered":
      return "Entregado";
    case "cancelled":
      return "Cancelado";
    default:
      return status;
  }
}

export function Orders() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<OrderRecord | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [pickupAt, setPickupAt] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [status, setStatus] = useState<OrderRecord["status"]>("new");
  const [notes, setNotes] = useState("");

  const loadOrders = async () => {
    setLoading(true);
    try {
      const query = statusFilter === "all" ? "" : `?status=${statusFilter}`;
      const data = await api.get(`/api/orders${query}`);
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      showToast("No se pudieron cargar los pedidos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders().catch(() => {});
  }, [statusFilter]);

  const resetForm = () => {
    setEditing(null);
    setCustomerName("");
    setCustomerPhone("");
    setPickupAt("");
    setTotalAmount("");
    setDepositAmount("");
    setStatus("new");
    setNotes("");
    setShowForm(false);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (order: OrderRecord) => {
    setEditing(order);
    setCustomerName(order.customer_name);
    setCustomerPhone(order.customer_phone || "");
    setPickupAt(toDateTimeLocal(order.pickup_at));
    setTotalAmount(String(order.total_amount));
    setDepositAmount(String(order.deposit_amount));
    setStatus(order.status);
    setNotes(order.notes || "");
    setShowForm(true);
  };

  const saveOrder = async () => {
    const total = parseFloat(totalAmount);
    const deposit = parseFloat(depositAmount || "0");
    if (!customerName.trim() || !pickupAt || Number.isNaN(total) || total <= 0) {
      showToast("Completa cliente, entrega y total");
      return;
    }
    if (Number.isNaN(deposit) || deposit < 0 || deposit > total) {
      showToast("El anticipo debe ser válido");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        pickup_at: new Date(pickupAt).toISOString(),
        total_amount: total,
        deposit_amount: deposit,
        status,
        notes: notes.trim() || null,
      };
      if (editing) {
        await api.put(`/api/orders/${editing.id}`, payload);
        showToast("Pedido actualizado");
      } else {
        await api.post("/api/orders", payload);
        showToast("Pedido creado");
      }
      await loadOrders();
      resetForm();
    } catch {
      showToast("No se pudo guardar el pedido");
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => {
    return orders.reduce(
      (acc, order) => {
        if (order.status !== "cancelled") {
          acc.total += order.total_amount;
          acc.pending += order.balance_due;
        }
        if (order.status === "ready") acc.ready += 1;
        return acc;
      },
      { total: 0, pending: 0, ready: 0 }
    );
  }, [orders]);

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          Pedidos
        </h1>
        <button
          className="btn btn-primary"
          style={{ padding: "8px 14px", minHeight: "auto", fontSize: "0.85rem" }}
          onClick={openCreate}
        >
          + Pedido
        </button>
      </div>

      <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-light)", textTransform: "uppercase" }}>Total</div>
          <div style={{ fontWeight: 800 }}>{formatMoney(summary.total)}</div>
        </div>
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-light)", textTransform: "uppercase" }}>Pendiente</div>
          <div style={{ fontWeight: 800, color: summary.pending > 0 ? "var(--warning)" : "var(--text)" }}>
            {formatMoney(summary.pending)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-light)", textTransform: "uppercase" }}>Listos</div>
          <div style={{ fontWeight: 800 }}>{summary.ready}</div>
        </div>
      </div>

      <div className="category-chips" style={{ marginBottom: 12 }}>
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`category-chip ${statusFilter === option.value ? "active" : ""}`}
            onClick={() => setStatusFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>{editing ? "Editar pedido" : "Nuevo pedido"}</h3>
          <div className="login-field">
            <label>Cliente</label>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div className="login-field">
            <label>Teléfono</label>
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </div>
          <div className="login-field">
            <label>Entrega</label>
            <input type="datetime-local" value={pickupAt} onChange={(e) => setPickupAt(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="login-field">
              <label>Total</label>
              <input type="number" min="0" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
            </div>
            <div className="login-field">
              <label>Anticipo</label>
              <input type="number" min="0" step="0.01" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
            </div>
          </div>
          <div className="login-field">
            <label>Estado</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as OrderRecord["status"])}>
              {STATUS_OPTIONS.filter((item) => item.value !== "all").map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="login-field">
            <label>Notas</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sabor, tamaño, decoración..." />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveOrder} disabled={saving}>
              {saving ? "Guardando..." : editing ? "Actualizar" : "Crear pedido"}
            </button>
            <button className="btn btn-secondary" style={{ minHeight: "auto", padding: "10px 14px" }} onClick={resetForm} disabled={saving}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty-state">
          <p>Cargando...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: "2rem" }}>🧁</p>
          <p>No hay pedidos en este estado.</p>
        </div>
      ) : (
        orders.map((order) => (
          <div key={order.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 800 }}>{order.customer_name}</div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-light)" }}>
                  {order.customer_phone || "Sin teléfono"} · {formatPickup(order.pickup_at)}
                </div>
              </div>
              <span className={`badge ${order.status === "ready" ? "badge-success" : order.status === "cancelled" ? "badge-danger" : "badge-warning"}`}>
                {statusLabel(order.status)}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 12 }}>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-light)" }}>Total</div>
                <div style={{ fontWeight: 700 }}>{formatMoney(order.total_amount)}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-light)" }}>Anticipo</div>
                <div style={{ fontWeight: 700 }}>{formatMoney(order.deposit_amount)}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-light)" }}>Saldo</div>
                <div style={{ fontWeight: 700, color: order.balance_due > 0 ? "var(--warning)" : "var(--success)" }}>
                  {formatMoney(order.balance_due)}
                </div>
              </div>
            </div>
            {order.notes && (
              <div style={{ marginTop: 10, fontSize: "0.85rem", color: "var(--text-light)" }}>
                {order.notes}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-light)" }}>Registró: {order.username}</span>
              <button className="btn btn-secondary" style={{ padding: "8px 12px", minHeight: "auto", fontSize: "0.82rem" }} onClick={() => openEdit(order)}>
                Editar
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

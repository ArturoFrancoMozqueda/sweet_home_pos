import { useEffect, useMemo, useState } from "react";

import { api } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";
import { setCachedShiftState } from "../services/shiftCache";

interface ShiftData {
  id: number;
  user_id: number;
  username: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  cash_sales: number | null;
  transfer_sales: number | null;
  cash_in: number | null;
  cash_out: number | null;
  variance: number | null;
  notes: string | null;
}

interface CashMovement {
  id: number;
  user_id: number;
  username: string;
  shift_id: number;
  movement_type: "in" | "out";
  amount: number;
  reason: string;
  notes?: string | null;
  created_at: string;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`);
  return d.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`);
  return d.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    timeZone: "America/Mexico_City",
  });
}

function formatMoney(n: number | null | undefined): string {
  if (n == null) return "$0.00";
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
}

function elapsedHours(openedAt: string): string {
  const start = new Date(openedAt.endsWith("Z") ? openedAt : `${openedAt}Z`);
  const ms = Date.now() - start.getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function varianceClass(variance: number): "ok" | "over" | "short" {
  if (variance === 0) return "ok";
  return variance > 0 ? "over" : "short";
}

export function Shifts() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === "admin";

  const [currentShift, setCurrentShift] = useState<ShiftData | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [lastClosedShift, setLastClosedShift] = useState<ShiftData | null>(null);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);

  const [openingCash, setOpeningCash] = useState("");
  const [opening, setOpening] = useState(false);

  const [closingCash, setClosingCash] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [closing, setClosing] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState(false);

  const [movementType, setMovementType] = useState<"in" | "out">("out");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [movementNotes, setMovementNotes] = useState("");
  const [savingMovement, setSavingMovement] = useState(false);

  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadCurrentShift = async () => {
    setLoadingCurrent(true);
    try {
      const data = await api.get("/api/shifts/me/current");
      setCurrentShift(data);
      if (data) {
        setCachedShiftState(user?.id, {
          shift_id: data.id,
          is_open: true,
          opened_at: data.opened_at,
          opening_cash: data.opening_cash,
          cash_sales: data.cash_sales,
          transfer_sales: data.transfer_sales,
          expected_cash: data.expected_cash,
        });
        const movementData = await api.get(`/api/cash-movements?shift_id=${data.id}`);
        setCashMovements(Array.isArray(movementData) ? movementData : []);
      } else {
        setCachedShiftState(user?.id, {
          shift_id: null,
          is_open: false,
        });
        setCashMovements([]);
      }
    } catch {
      setCurrentShift(null);
      setCashMovements([]);
    } finally {
      setLoadingCurrent(false);
    }
  };

  const loadHistory = async () => {
    if (!isAdmin) return;
    setLoadingHistory(true);
    try {
      const data = await api.get("/api/shifts?limit=50");
      setShifts(Array.isArray(data) ? data : []);
    } catch {
      setShifts([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadCurrentShift().catch(() => {});
    loadHistory().catch(() => {});
  }, []);

  const handleOpen = async () => {
    const amount = parseFloat(openingCash);
    if (isNaN(amount) || amount < 0) {
      showToast("Ingresa un monto válido");
      return;
    }
    setOpening(true);
    try {
      const shift = await api.post("/api/shifts/open", { opening_cash: amount });
      setCurrentShift(shift);
      setLastClosedShift(null);
      setOpeningCash("");
      setShowCloseForm(false);
      setCachedShiftState(user?.id, {
        shift_id: shift.id,
        is_open: true,
        opened_at: shift.opened_at,
        opening_cash: shift.opening_cash,
        cash_sales: shift.cash_sales,
        transfer_sales: shift.transfer_sales,
        expected_cash: shift.expected_cash,
      });
      setCashMovements([]);
      showToast("Turno abierto");
      loadHistory().catch(() => {});
    } catch {
      showToast("Error al abrir turno");
    } finally {
      setOpening(false);
    }
  };

  const handleClose = async () => {
    if (!currentShift) return;
    const amount = parseFloat(closingCash);
    if (isNaN(amount) || amount < 0) {
      showToast("Ingresa el monto contado");
      return;
    }
    setClosing(true);
    try {
      const closed = await api.post(`/api/shifts/${currentShift.id}/close`, {
        closing_cash: amount,
        notes: closingNotes.trim() || null,
      });
      setCurrentShift(null);
      setLastClosedShift(closed);
      setClosingCash("");
      setClosingNotes("");
      setShowCloseForm(false);
      setCashMovements([]);
      setCachedShiftState(user?.id, {
        shift_id: null,
        is_open: false,
      });
      showToast("Turno cerrado");
      loadHistory().catch(() => {});
    } catch {
      showToast("Error al cerrar turno");
    } finally {
      setClosing(false);
    }
  };

  const handleMovement = async () => {
    const amount = parseFloat(movementAmount);
    if (isNaN(amount) || amount <= 0 || !movementReason.trim()) {
      showToast("Completa monto y motivo");
      return;
    }
    setSavingMovement(true);
    try {
      const movement = await api.post("/api/cash-movements", {
        movement_type: movementType,
        amount,
        reason: movementReason.trim(),
        notes: movementNotes.trim() || null,
      });
      setCashMovements((prev) => [movement, ...prev]);
      setMovementAmount("");
      setMovementReason("");
      setMovementNotes("");
      await loadCurrentShift();
      showToast("Movimiento de caja registrado");
    } catch {
      showToast("No se pudo registrar el movimiento");
    } finally {
      setSavingMovement(false);
    }
  };

  const currentExpectedCash =
    currentShift?.expected_cash ??
    (currentShift
      ? currentShift.opening_cash +
        (currentShift.cash_sales ?? 0) +
        (currentShift.cash_in ?? 0) -
        (currentShift.cash_out ?? 0)
      : 0);

  const countedCash = closingCash.trim() === "" ? null : parseFloat(closingCash);
  const previewVariance =
    countedCash == null || Number.isNaN(countedCash) ? null : countedCash - currentExpectedCash;

  const movementSummary = useMemo(
    () => ({
      cashIn: currentShift?.cash_in ?? 0,
      cashOut: currentShift?.cash_out ?? 0,
    }),
    [currentShift]
  );

  return (
    <div className="page">
      <h1 className="page-title">Caja</h1>

      {loadingCurrent ? (
        <div className="empty-state">
          <p>Cargando...</p>
        </div>
      ) : currentShift ? (
        <>
          <div className="shift-active-card">
            <div className="shift-active-header">
              <div>
                <div className="shift-active-label">Caja activa</div>
                <div className="shift-active-time">
                  Desde {formatTime(currentShift.opened_at)} ({elapsedHours(currentShift.opened_at)})
                </div>
              </div>
              <div className="shift-active-opening">
                <span className="shift-money-label">Fondo inicial</span>
                <span className="shift-money-value">{formatMoney(currentShift.opening_cash)}</span>
              </div>
            </div>

            <div className="shift-summary-grid">
              <div className="shift-summary-item">
                <span className="shift-money-label">Ventas efectivo</span>
                <strong>{formatMoney(currentShift.cash_sales)}</strong>
              </div>
              <div className="shift-summary-item">
                <span className="shift-money-label">Entradas caja</span>
                <strong>{formatMoney(movementSummary.cashIn)}</strong>
              </div>
              <div className="shift-summary-item">
                <span className="shift-money-label">Salidas caja</span>
                <strong>{formatMoney(movementSummary.cashOut)}</strong>
              </div>
              <div className="shift-summary-item">
                <span className="shift-money-label">Ventas transferencia</span>
                <strong>{formatMoney(currentShift.transfer_sales)}</strong>
              </div>
              <div className="shift-summary-item shift-summary-item-wide">
                <span className="shift-money-label">Esperado en caja</span>
                <strong>{formatMoney(currentExpectedCash)}</strong>
              </div>
            </div>

            <div className="card" style={{ marginTop: 16, background: "var(--bg-accent)" }}>
              <h3 style={{ marginTop: 0, marginBottom: 10 }}>Movimiento de caja</h3>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button
                  type="button"
                  className={`category-chip ${movementType === "out" ? "active" : ""}`}
                  onClick={() => setMovementType("out")}
                >
                  Salida
                </button>
                <button
                  type="button"
                  className={`category-chip ${movementType === "in" ? "active" : ""}`}
                  onClick={() => setMovementType("in")}
                >
                  Entrada
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10 }}>
                <div className="login-field">
                  <label>Monto</label>
                  <input type="number" min="0" step="0.01" value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} />
                </div>
                <div className="login-field">
                  <label>Motivo</label>
                  <input value={movementReason} onChange={(e) => setMovementReason(e.target.value)} placeholder="Ej. retiro, gasto, cambio, abono..." />
                </div>
              </div>
              <div className="login-field">
                <label>Notas</label>
                <input value={movementNotes} onChange={(e) => setMovementNotes(e.target.value)} placeholder="Opcional" />
              </div>
              <button className="btn btn-secondary" style={{ width: "100%" }} onClick={handleMovement} disabled={savingMovement}>
                {savingMovement ? "Guardando..." : "Registrar movimiento"}
              </button>
            </div>

            {!showCloseForm ? (
              <button
                className="btn btn-primary"
                style={{ width: "100%", marginTop: 16 }}
                onClick={() => setShowCloseForm(true)}
              >
                Cerrar caja
              </button>
            ) : (
              <div className="shift-close-form">
                <div className="shift-reconciliation-card">
                  <div className="shift-detail-row">
                    <span>Fondo inicial</span>
                    <span>{formatMoney(currentShift.opening_cash)}</span>
                  </div>
                  <div className="shift-detail-row">
                    <span>Ventas efectivo</span>
                    <span>{formatMoney(currentShift.cash_sales)}</span>
                  </div>
                  <div className="shift-detail-row">
                    <span>Entradas de caja</span>
                    <span>{formatMoney(currentShift.cash_in)}</span>
                  </div>
                  <div className="shift-detail-row">
                    <span>Salidas de caja</span>
                    <span>{formatMoney(currentShift.cash_out)}</span>
                  </div>
                  <div className="shift-detail-row" style={{ fontWeight: 700 }}>
                    <span>Esperado en caja</span>
                    <span>{formatMoney(currentExpectedCash)}</span>
                  </div>
                </div>

                <div className="login-field">
                  <label>Dinero contado en caja ($)</label>
                  <input
                    type="number"
                    value={closingCash}
                    onChange={(e) => setClosingCash(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    autoFocus
                    disabled={closing}
                  />
                </div>

                {previewVariance != null && !Number.isNaN(previewVariance) && (
                  <div className={`shift-preview-variance ${varianceClass(previewVariance)}`}>
                    <span>Varianza previa</span>
                    <strong>
                      {previewVariance === 0
                        ? "Cuadra"
                        : previewVariance > 0
                          ? `Sobra ${formatMoney(previewVariance)}`
                          : `Falta ${formatMoney(Math.abs(previewVariance))}`}
                    </strong>
                  </div>
                )}

                <div className="login-field">
                  <label>Notas (opcional)</label>
                  <input
                    type="text"
                    value={closingNotes}
                    onChange={(e) => setClosingNotes(e.target.value)}
                    placeholder="Observaciones del cierre"
                    disabled={closing}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleClose} disabled={closing || !closingCash}>
                    {closing ? "Cerrando..." : "Confirmar cierre"}
                  </button>
                  <button className="btn btn-secondary" style={{ padding: "10px 16px", minHeight: "auto" }} onClick={() => setShowCloseForm(false)} disabled={closing}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="summary-section">
            <h2 className="summary-section-title">Movimientos del turno</h2>
            {cashMovements.length === 0 ? (
              <div className="card" style={{ color: "var(--text-light)" }}>
                No hay movimientos de caja registrados.
              </div>
            ) : (
              cashMovements.map((movement) => (
                <div key={movement.id} className="card" style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{movement.reason}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-light)" }}>
                        {formatDate(movement.created_at)} · {formatTime(movement.created_at)} · {movement.username}
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, color: movement.movement_type === "in" ? "var(--success)" : "var(--danger)" }}>
                      {movement.movement_type === "in" ? "+" : "-"}
                      {formatMoney(movement.amount)}
                    </div>
                  </div>
                  {movement.notes && (
                    <div style={{ marginTop: 8, fontSize: "0.82rem", color: "var(--text-light)" }}>
                      {movement.notes}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          {lastClosedShift && (
            <div className="shift-closed-success">
              <div className="shift-active-label">Caja cerrada</div>
              <div className="shift-active-time" style={{ marginBottom: 12 }}>
                {formatDate(lastClosedShift.closed_at || lastClosedShift.opened_at)} ·{" "}
                {formatTime(lastClosedShift.closed_at || lastClosedShift.opened_at)}
              </div>
              <div className="shift-detail-row">
                <span>Esperado</span>
                <span>{formatMoney(lastClosedShift.expected_cash)}</span>
              </div>
              <div className="shift-detail-row">
                <span>Contado</span>
                <span>{formatMoney(lastClosedShift.closing_cash)}</span>
              </div>
              <div className={`shift-variance ${varianceClass(lastClosedShift.variance ?? 0)}`} style={{ marginTop: 12 }}>
                {lastClosedShift.variance === 0
                  ? "Caja cuadrada"
                  : (lastClosedShift.variance ?? 0) > 0
                    ? `Sobró ${formatMoney(lastClosedShift.variance ?? 0)}`
                    : `Faltó ${formatMoney(Math.abs(lastClosedShift.variance ?? 0))}`}
              </div>
            </div>
          )}

          <div className="shift-open-card">
            <p className="shift-open-label">No tienes una caja abierta</p>
            <div className="login-field" style={{ marginBottom: 12 }}>
              <label>Dinero inicial en caja ($)</label>
              <input
                type="number"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                disabled={opening}
              />
            </div>
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={handleOpen} disabled={opening || !openingCash}>
              {opening ? "Abriendo..." : "Abrir caja"}
            </button>
          </div>
        </>
      )}

      {isAdmin && (
        <>
          <h2 className="summary-section-title" style={{ marginTop: 24 }}>
            Historial de cajas
          </h2>
          {loadingHistory ? (
            <div className="empty-state">
              <p>Cargando...</p>
            </div>
          ) : shifts.length === 0 ? (
            <div className="empty-state">
              <p>No hay cajas registradas.</p>
            </div>
          ) : (
            shifts.map((shift) => (
              <div key={shift.id} className="shift-history-card">
                <div className="shift-history-header">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{shift.username}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-light)" }}>
                      {formatDate(shift.opened_at)} · {formatTime(shift.opened_at)}
                      {shift.closed_at ? ` — ${formatTime(shift.closed_at)}` : " (abierta)"}
                    </div>
                  </div>
                  {shift.variance != null && (
                    <div className={`shift-variance ${varianceClass(shift.variance)}`}>
                      {shift.variance === 0 ? "Cuadra" : shift.variance > 0 ? `+${formatMoney(shift.variance)}` : formatMoney(shift.variance)}
                    </div>
                  )}
                </div>
                <div className="shift-history-detail">
                  <div className="shift-detail-row">
                    <span>Fondo inicial</span>
                    <span>{formatMoney(shift.opening_cash)}</span>
                  </div>
                  <div className="shift-detail-row">
                    <span>Ventas efectivo</span>
                    <span>{formatMoney(shift.cash_sales)}</span>
                  </div>
                  <div className="shift-detail-row">
                    <span>Entradas</span>
                    <span>{formatMoney(shift.cash_in)}</span>
                  </div>
                  <div className="shift-detail-row">
                    <span>Salidas</span>
                    <span>{formatMoney(shift.cash_out)}</span>
                  </div>
                  <div className="shift-detail-row" style={{ fontWeight: 700 }}>
                    <span>Esperado en caja</span>
                    <span>{formatMoney(shift.expected_cash)}</span>
                  </div>
                  {shift.closed_at && (
                    <div className="shift-detail-row" style={{ fontWeight: 700 }}>
                      <span>Contado</span>
                      <span>{formatMoney(shift.closing_cash)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

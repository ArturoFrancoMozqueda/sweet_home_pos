import { useState, useEffect } from "react";
import { api } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/Toast";

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
  variance: number | null;
  notes: string | null;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "America/Mexico_City" });
}

function formatMoney(n: number | null | undefined): string {
  if (n == null) return "$0.00";
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
}

function elapsedHours(openedAt: string): string {
  const start = new Date(openedAt.endsWith("Z") ? openedAt : openedAt + "Z");
  const ms = Date.now() - start.getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export function Shifts() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === "admin";

  // Current shift state
  const [currentShift, setCurrentShift] = useState<ShiftData | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(true);

  // Open shift form
  const [openingCash, setOpeningCash] = useState("");
  const [opening, setOpening] = useState(false);

  // Close shift form
  const [closingCash, setClosingCash] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [closing, setClosing] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState(false);

  // Shift history (admin)
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Fetch current shift on mount
  useEffect(() => {
    api.get("/api/shifts/me/current")
      .then((data) => setCurrentShift(data))
      .catch(() => setCurrentShift(null))
      .finally(() => setLoadingCurrent(false));
  }, []);

  // Fetch history for admin
  useEffect(() => {
    if (!isAdmin) return;
    setLoadingHistory(true);
    api.get("/api/shifts?limit=50")
      .then((data) => setShifts(data))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [isAdmin]);

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
      setOpeningCash("");
      showToast("Turno abierto");
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
      setClosingCash("");
      setClosingNotes("");
      setShowCloseForm(false);
      showToast("Turno cerrado");
      // Refresh history
      if (isAdmin) {
        setShifts((prev) => [closed, ...prev]);
      }
    } catch {
      showToast("Error al cerrar turno");
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Turnos</h1>

      {/* ── Current Shift Section ── */}
      {loadingCurrent ? (
        <div className="empty-state"><p>Cargando...</p></div>
      ) : currentShift ? (
        <div className="shift-active-card">
          <div className="shift-active-header">
            <div>
              <div className="shift-active-label">Turno activo</div>
              <div className="shift-active-time">
                Desde {formatTime(currentShift.opened_at)} ({elapsedHours(currentShift.opened_at)})
              </div>
            </div>
            <div className="shift-active-opening">
              <span className="shift-money-label">Fondo inicial</span>
              <span className="shift-money-value">{formatMoney(currentShift.opening_cash)}</span>
            </div>
          </div>

          {!showCloseForm ? (
            <button
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 16 }}
              onClick={() => setShowCloseForm(true)}
            >
              Cerrar Turno
            </button>
          ) : (
            <div className="shift-close-form">
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
              <div className="login-field">
                <label>Notas (opcional)</label>
                <input
                  type="text"
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="Observaciones del turno"
                  disabled={closing}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={handleClose}
                  disabled={closing || !closingCash}
                >
                  {closing ? "Cerrando..." : "Confirmar Cierre"}
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: "10px 16px", minHeight: "auto" }}
                  onClick={() => setShowCloseForm(false)}
                  disabled={closing}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="shift-open-card">
          <p className="shift-open-label">No tienes un turno abierto</p>
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
          <button
            className="btn btn-primary"
            style={{ width: "100%" }}
            onClick={handleOpen}
            disabled={opening || !openingCash}
          >
            {opening ? "Abriendo..." : "Abrir Turno"}
          </button>
        </div>
      )}

      {/* ── Shift History (Admin) ── */}
      {isAdmin && (
        <>
          <h2 className="summary-section-title" style={{ marginTop: 24 }}>Historial de Turnos</h2>
          {loadingHistory ? (
            <div className="empty-state"><p>Cargando...</p></div>
          ) : shifts.length === 0 ? (
            <div className="empty-state"><p>No hay turnos registrados.</p></div>
          ) : (
            shifts.map((s) => (
              <div key={s.id} className="shift-history-card">
                <div className="shift-history-header">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{s.username}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-light)" }}>
                      {formatDate(s.opened_at)} · {formatTime(s.opened_at)}
                      {s.closed_at ? ` — ${formatTime(s.closed_at)}` : " (abierto)"}
                    </div>
                  </div>
                  {s.variance != null && (
                    <div className={`shift-variance ${s.variance === 0 ? "ok" : s.variance > 0 ? "over" : "short"}`}>
                      {s.variance === 0 ? "Cuadra" : s.variance > 0 ? `+${formatMoney(s.variance)}` : formatMoney(s.variance)}
                    </div>
                  )}
                </div>
                {s.closed_at && (
                  <div className="shift-history-detail">
                    <div className="shift-detail-row">
                      <span>Fondo inicial</span>
                      <span>{formatMoney(s.opening_cash)}</span>
                    </div>
                    <div className="shift-detail-row">
                      <span>Ventas efectivo</span>
                      <span>{formatMoney(s.cash_sales)}</span>
                    </div>
                    <div className="shift-detail-row">
                      <span>Ventas transferencia</span>
                      <span>{formatMoney(s.transfer_sales)}</span>
                    </div>
                    <div className="shift-detail-row" style={{ fontWeight: 700 }}>
                      <span>Esperado en caja</span>
                      <span>{formatMoney(s.expected_cash)}</span>
                    </div>
                    <div className="shift-detail-row" style={{ fontWeight: 700 }}>
                      <span>Contado</span>
                      <span>{formatMoney(s.closing_cash)}</span>
                    </div>
                    {s.notes && (
                      <div style={{ fontSize: "0.8rem", color: "var(--text-light)", marginTop: 8, fontStyle: "italic" }}>
                        {s.notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

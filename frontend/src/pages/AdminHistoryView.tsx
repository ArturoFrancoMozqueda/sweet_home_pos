import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../services/api";
import { getPaymentMethodLabel } from "../utils/payments";
import type { RangeReport } from "../types";

type Preset = "today" | "7d" | "30d" | "custom";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

function subtractDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

function rangeForPreset(preset: Preset): { from: string; to: string } {
  if (preset === "today") return { from: todayStr(), to: todayStr() };
  if (preset === "7d") return { from: daysAgoStr(6), to: todayStr() };
  return { from: daysAgoStr(29), to: todayStr() };
}

function formatShortDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

const CHART_COLORS = ["#d4845a", "#e8a87c", "#b5694a", "#f2b98c", "#c6724a", "#ebb58f"];

export function AdminHistoryView({ onOpenManage }: { onOpenManage: () => void }) {
  const [preset, setPreset] = useState<Preset>("7d");
  const [customFrom, setCustomFrom] = useState<string>(daysAgoStr(6));
  const [customTo, setCustomTo] = useState<string>(todayStr());
  const [report, setReport] = useState<RangeReport | null>(null);
  const [prevReport, setPrevReport] = useState<RangeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { from, to } = useMemo(() => {
    if (preset === "custom") return { from: customFrom, to: customTo };
    return rangeForPreset(preset);
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const rangeDays =
      Math.round(
        (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1;
    const prevTo = subtractDaysStr(from, 1);
    const prevFrom = subtractDaysStr(prevTo, rangeDays - 1);

    Promise.all([
      api.get(`/api/reports/range?date_from=${from}&date_to=${to}`),
      api.get(`/api/reports/range?date_from=${prevFrom}&date_to=${prevTo}`),
    ])
      .then(([curr, prev]: [RangeReport, RangeReport]) => {
        if (cancelled) return;
        setReport(curr);
        setPrevReport(prev);
      })
      .catch(() => {
        if (cancelled) return;
        setError("No se pudo cargar el reporte. Verifica tu conexión.");
        setReport(null);
        setPrevReport(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const delta = useMemo(() => {
    if (!report || !prevReport) return null;
    if (prevReport.total_amount === 0) return report.total_amount > 0 ? 1 : 0;
    return (report.total_amount - prevReport.total_amount) / prevReport.total_amount;
  }, [report, prevReport]);

  const averageTicket = report && report.total_sales_count > 0
    ? report.total_amount / report.total_sales_count
    : 0;

  const dailyChartData = useMemo(() => {
    if (!report) return [];
    return report.sales_by_day.map((d) => ({
      ...d,
      label: formatShortDate(d.date),
    }));
  }, [report]);

  const topChartData = useMemo(() => {
    if (!report) return [];
    return [...report.top_products]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10)
      .map((p) => ({ name: p.name, quantity: p.quantity, revenue: p.revenue }));
  }, [report]);

  return (
    <div className="page">
      <h1 className="page-title">Historial y análisis</h1>

      <div className="range-presets no-print">
        <button
          className={`range-preset ${preset === "today" ? "active" : ""}`}
          onClick={() => setPreset("today")}
          type="button"
        >
          Hoy
        </button>
        <button
          className={`range-preset ${preset === "7d" ? "active" : ""}`}
          onClick={() => setPreset("7d")}
          type="button"
        >
          7 días
        </button>
        <button
          className={`range-preset ${preset === "30d" ? "active" : ""}`}
          onClick={() => setPreset("30d")}
          type="button"
        >
          30 días
        </button>
        <button
          className={`range-preset ${preset === "custom" ? "active" : ""}`}
          onClick={() => setPreset("custom")}
          type="button"
        >
          Personalizado
        </button>
      </div>

      {preset === "custom" && (
        <div className="history-date-filter no-print" style={{ marginBottom: 12 }}>
          <input
            type="date"
            value={customFrom}
            max={customTo}
            onChange={(e) => setCustomFrom(e.target.value)}
          />
          <span style={{ color: "var(--text-light)", fontSize: "0.85rem" }}>hasta</span>
          <input
            type="date"
            value={customTo}
            min={customFrom}
            max={todayStr()}
            onChange={(e) => setCustomTo(e.target.value)}
          />
        </div>
      )}

      <div className="summary-hero">
        <div className="summary-label">Ventas del período</div>
        <div className="summary-amount">
          {loading
            ? "—"
            : `$${(report?.total_amount ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}
        </div>
        <div className="summary-count">
          {loading
            ? "cargando..."
            : `${report?.total_sales_count ?? 0} venta${report?.total_sales_count !== 1 ? "s" : ""} · ticket promedio $${averageTicket.toLocaleString(
                "es-MX",
                { minimumFractionDigits: 2 }
              )}`}
        </div>
        {delta !== null && !loading && (
          <div
            className="summary-count"
            style={{
              marginTop: 6,
              color: delta >= 0 ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.8)",
            }}
          >
            {delta >= 0 ? "▲" : "▼"} {(Math.abs(delta) * 100).toFixed(0)}% vs. período anterior
          </div>
        )}
      </div>

      {error && (
        <div
          className="card"
          style={{ textAlign: "center", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      {report && report.total_sales_count === 0 && !loading && (
        <div className="card" style={{ textAlign: "center", color: "var(--text-light)" }}>
          <p>No hay ventas en este rango.</p>
        </div>
      )}

      {report && report.total_sales_count > 0 && (
        <>
          <div className="summary-section">
            <h3 className="summary-section-title">Ventas por día</h3>
            <div className="card" style={{ padding: 12 }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyChartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0e6e0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#7a5c50" }}
                    tickLine={false}
                    axisLine={{ stroke: "#f0e6e0" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#7a5c50" }}
                    tickLine={false}
                    axisLine={{ stroke: "#f0e6e0" }}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`
                    }
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(212, 132, 90, 0.08)" }}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #f0e6e0",
                      fontSize: "0.85rem",
                    }}
                    formatter={((value: unknown) => {
                      const n = typeof value === "number" ? value : 0;
                      return [
                        `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`,
                        "Total",
                      ];
                    }) as never}
                  />
                  <Bar dataKey="total" fill="#d4845a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="summary-section">
            <h3 className="summary-section-title">Más vendidos (por unidades)</h3>
            <div className="card" style={{ padding: 12 }}>
              <ResponsiveContainer
                width="100%"
                height={Math.max(180, topChartData.length * 34)}
              >
                <BarChart
                  data={topChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0e6e0" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "#7a5c50" }}
                    tickLine={false}
                    axisLine={{ stroke: "#f0e6e0" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 11, fill: "#2c1810" }}
                    tickLine={false}
                    axisLine={{ stroke: "#f0e6e0" }}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(212, 132, 90, 0.08)" }}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #f0e6e0",
                      fontSize: "0.85rem",
                    }}
                    formatter={((value: unknown, _name: unknown, item: { payload?: { revenue?: number } }) => {
                      const qty = typeof value === "number" ? value : 0;
                      const revenue = item?.payload?.revenue ?? 0;
                      return [
                        `${qty} uds · $${revenue.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`,
                        "Vendidos",
                      ];
                    }) as never}
                  />
                  <Bar dataKey="quantity" radius={[0, 6, 6, 0]}>
                    {topChartData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {report.payment_breakdown.length > 0 && (
            <div className="summary-section">
              <h3 className="summary-section-title">Por Método de Pago</h3>
              {report.payment_breakdown.map((p, i) => (
                <div key={i} className={`payment-chip ${p.method}`}>
                  <span className="payment-chip-label">
                    {getPaymentMethodLabel(p.method)}
                    <span className="summary-row-qty"> ({p.count})</span>
                  </span>
                  <span className="payment-chip-amount">
                    ${p.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="summary-section">
        <button
          className="btn btn-secondary btn-block"
          onClick={onOpenManage}
          type="button"
        >
          Gestionar ventas individuales
        </button>
      </div>
    </div>
  );
}

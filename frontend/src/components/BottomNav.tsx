import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const icons = {
  venta: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 5h12M9 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z" />
    </svg>
  ),
  inventario: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  resumen: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  historial: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  usuarios: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const tabs = [
    { path: "/",          icon: icons.venta,      label: "Venta"      },
    { path: "/inventory", icon: icons.inventario, label: "Inventario" },
    { path: "/history",   icon: icons.historial,  label: user?.role === "admin" ? "Historial" : "Mis Ventas" },
    ...(user?.role === "admin" ? [
      { path: "/summary", icon: icons.resumen,    label: "Resumen"    },
      { path: "/users",   icon: icons.usuarios,   label: "Usuarios"   },
    ] : []),
  ];

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Navegación principal">
      {tabs.map((tab) => {
        const active = location.pathname === tab.path;
        return (
          <button
            key={tab.path}
            className={`nav-item ${active ? "active" : ""}`}
            onClick={() => navigate(tab.path)}
            aria-label={tab.label}
            aria-current={active ? "page" : undefined}
          >
            <span className="nav-icon-wrap">
              <span className="nav-icon">{tab.icon}</span>
            </span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

import { useLocation, useNavigate } from "react-router-dom";

const tabs = [
  { path: "/", icon: "🏠", label: "Venta" },
  { path: "/catalog", icon: "📋", label: "Catálogo" },
  { path: "/inventory", icon: "📦", label: "Inventario" },
  { path: "/summary", icon: "📊", label: "Resumen" },
  { path: "/history", icon: "🕐", label: "Historial" },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => (
        <button
          key={tab.path}
          className={`nav-item ${location.pathname === tab.path ? "active" : ""}`}
          onClick={() => navigate(tab.path)}
        >
          <span className="nav-icon">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

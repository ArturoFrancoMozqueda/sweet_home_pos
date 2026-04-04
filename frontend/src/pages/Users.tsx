import { useState, useEffect } from "react";
import { api } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

interface UserRecord {
  id: number;
  username: string;
  role: string;
  active: boolean;
}

export function Users() {
  const { user: currentUser, logout } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"employee" | "admin">("employee");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadUsers = async () => {
    try {
      const data = await api.get("/api/auth/users");
      setUsers(data);
    } catch {
      setError("No se pudo cargar la lista de usuarios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setError("");
    setSaving(true);
    try {
      await api.post("/api/auth/users", { username, password, role });
      setUsername("");
      setPassword("");
      setRole("employee");
      setShowForm(false);
      await loadUsers();
    } catch (err: any) {
      setError(err.message?.includes("409") ? "Ese usuario ya existe" : "Error al crear usuario");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: UserRecord) => {
    try {
      await api.put(`/api/auth/users/${u.id}/active?active=${!u.active}`, {});
      await loadUsers();
    } catch {
      setError("No se pudo actualizar el usuario");
    }
  };

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Usuarios</h1>
        <button
          className="btn btn-secondary"
          style={{ padding: "8px 14px", minHeight: "auto", fontSize: "0.85rem" }}
          onClick={logout}
        >
          Cerrar sesión
        </button>
      </div>

      <div style={{ marginBottom: 8, fontSize: "0.8rem", color: "var(--text-light)" }}>
        Sesión: <strong>{currentUser?.username}</strong> ({currentUser?.role === "admin" ? "Administrador" : "Empleado"})
      </div>

      {error && <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>}

      <button
        className="btn btn-primary"
        style={{ marginBottom: 16, width: "100%" }}
        onClick={() => setShowForm(!showForm)}
      >
        {showForm ? "Cancelar" : "+ Nuevo empleado"}
      </button>

      {showForm && (
        <form onSubmit={handleCreate} className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: "1rem" }}>Nuevo usuario</h3>
          <div className="login-field">
            <label>Usuario</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              placeholder="nombre de usuario"
              disabled={saving}
            />
          </div>
          <div className="login-field">
            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="contraseña"
              disabled={saving}
            />
          </div>
          <div className="login-field">
            <label>Rol</label>
            <select value={role} onChange={(e) => setRole(e.target.value as "employee" | "admin")} disabled={saving}>
              <option value="employee">Empleado (cajero)</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving || !username || !password} style={{ width: "100%", marginTop: 8 }}>
            {saving ? "Creando..." : "Crear usuario"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="empty-state"><p>Cargando...</p></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {users.map((u) => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{u.username}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-light)" }}>
                  {u.role === "admin" ? "Administrador" : "Empleado"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "0.75rem", color: u.active ? "var(--success)" : "var(--text-light)" }}>
                  {u.active ? "Activo" : "Inactivo"}
                </span>
                {u.id !== currentUser?.id && (
                  <button
                    className={`btn ${u.active ? "btn-secondary" : "btn-primary"}`}
                    style={{ padding: "6px 12px", minHeight: "auto", fontSize: "0.8rem" }}
                    onClick={() => toggleActive(u)}
                  >
                    {u.active ? "Desactivar" : "Activar"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

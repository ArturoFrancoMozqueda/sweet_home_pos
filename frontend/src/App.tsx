import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { BottomNav } from "./components/BottomNav";
import { SyncIndicator } from "./components/SyncIndicator";
import { ToastContainer } from "./components/Toast";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { db } from "./db/database";
import { RegisterSale } from "./pages/RegisterSale";
import { Inventory } from "./pages/Inventory";
import { DailySummary } from "./pages/DailySummary";
import { SalesHistory } from "./pages/SalesHistory";
import { Login } from "./pages/Login";
import { Users } from "./pages/Users";
import { Shifts } from "./pages/Shifts";

function AuthenticatedApp({ user }: { user: import("./contexts/AuthContext").AuthUser }) {
  const { isOnline, isSyncing, syncError, triggerSync } = useOnlineStatus();
  const pendingCount = useLiveQuery(() => db.sales.where("synced").equals(0).count(), [], 0);
  return (
    <>
      <SyncIndicator isOnline={isOnline} isSyncing={isSyncing} syncError={syncError} pendingCount={pendingCount} onSync={triggerSync} />
      <Routes>
        <Route path="/" element={<RegisterSale />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/history" element={<SalesHistory />} />
        <Route path="/shifts" element={<Shifts />} />
        {user.role === "admin" && (
          <>
            <Route path="/summary" element={<DailySummary />} />
            <Route path="/users" element={<Users />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
      <ToastContainer />
    </>
  );
}

function AppRoutes() {
  const { user } = useAuth();

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return <AuthenticatedApp user={user} />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { BottomNav } from "./components/BottomNav";
import { SyncIndicator } from "./components/SyncIndicator";
import { ToastContainer } from "./components/Toast";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { RegisterSale } from "./pages/RegisterSale";
import { Inventory } from "./pages/Inventory";
import { DailySummary } from "./pages/DailySummary";
import { SalesHistory } from "./pages/SalesHistory";
import { Login } from "./pages/Login";
import { Users } from "./pages/Users";

function AppRoutes() {
  const { user } = useAuth();
  const { isOnline, isSyncing, triggerSync } = useOnlineStatus();

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <>
      <SyncIndicator isOnline={isOnline} isSyncing={isSyncing} onSync={triggerSync} />
      <Routes>
        <Route path="/" element={<RegisterSale />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/history" element={<SalesHistory />} />
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

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

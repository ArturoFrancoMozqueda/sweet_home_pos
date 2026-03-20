import { BrowserRouter, Routes, Route } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { SyncIndicator } from "./components/SyncIndicator";
import { ToastContainer } from "./components/Toast";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { RegisterSale } from "./pages/RegisterSale";
import { Catalog } from "./pages/Catalog";
import { Inventory } from "./pages/Inventory";
import { DailySummary } from "./pages/DailySummary";
import { SalesHistory } from "./pages/SalesHistory";

export function App() {
  const { isOnline, isSyncing, triggerSync } = useOnlineStatus();

  return (
    <BrowserRouter>
      <SyncIndicator isOnline={isOnline} isSyncing={isSyncing} onSync={triggerSync} />
      <Routes>
        <Route path="/" element={<RegisterSale />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/summary" element={<DailySummary />} />
        <Route path="/history" element={<SalesHistory />} />
      </Routes>
      <BottomNav />
      <ToastContainer />
    </BrowserRouter>
  );
}

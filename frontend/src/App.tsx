import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { Spinner } from "./components/ui/Spinner";
import { ProtectedRoute, PublicOnlyRoute } from "./routes/ProtectedRoute";
import LoginPage from "./pages/Login";
import RegisterPage from "./pages/Register";
import DashboardPage from "./pages/Dashboard";
import ProductsPage from "./pages/Products";
import CategoriesPage from "./pages/Categories";
import InventoryPage from "./pages/Inventory";
import CustomersPage from "./pages/Customers";
import SalesPage from "./pages/Sales";
import SalesHistoryPage from "./pages/SalesHistory";
import ReportsPage from "./pages/Reports";
import BusinessAnalyticsOverviewPage from "./pages/BusinessAnalyticsOverview";
import BusinessAnalyticsProcessPage from "./pages/BusinessAnalyticsProcess";
import UsersPage from "./pages/Users";
import AuditLogsPage from "./pages/AuditLogs";
import ProfilePage from "./pages/Profile";
import SettingsPage from "./pages/Settings";

// Markdown rendering adds a sizeable dependency; load the AI workspace on demand.
const AiAssistantPage = lazy(() => import("./pages/AiAssistant"));

function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-sm font-medium text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">The page you’re looking for doesn’t exist.</p>
      <a href="/dashboard" className="mt-6 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
        Go to dashboard
      </a>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/sales-history" element={<SalesHistoryPage />} />
          <Route path="/analytics/overview" element={<BusinessAnalyticsOverviewPage />} />
          <Route
            path="/ai"
            element={
              <Suspense fallback={<Spinner label="Loading AI Assistant…" className="min-h-[60vh]" />}>
                <AiAssistantPage />
              </Suspense>
            }
          />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />

          <Route element={<ProtectedRoute roles={["admin"]} />}>
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/analytics" element={<ReportsPage />} />
            <Route path="/analytics/process" element={<BusinessAnalyticsProcessPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/audit-logs" element={<AuditLogsPage />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

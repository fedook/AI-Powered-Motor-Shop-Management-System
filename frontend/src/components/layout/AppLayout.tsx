import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isAiPage = location.pathname.startsWith("/ai");

  return (
    <div className="min-h-screen bg-[var(--app-canvas)]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-72">
        <Topbar onMenu={() => setSidebarOpen(true)} />
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div
            className={`mx-auto w-full animate-fade-in motion-reduce:animate-none ${
              isAiPage ? "max-w-[1560px]" : "max-w-7xl"
            }`}
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

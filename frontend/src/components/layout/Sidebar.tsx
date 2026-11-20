import { useEffect, type ComponentType } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Tags,
  Boxes,
  Users,
  ShoppingCart,
  ReceiptText,
  BarChart3,
  BookOpen,
  Bot,
  GitBranch,
  UserCog,
  ScrollText,
  Settings,
  X,
  Wrench,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Operations",
    items: [
      { to: "/products", label: "Products", icon: Package },
      { to: "/categories", label: "Categories", icon: Tags },
      { to: "/inventory", label: "Inventory", icon: Boxes },
      { to: "/customers", label: "Customers", icon: Users },
      { to: "/sales", label: "Sales / POS", icon: ShoppingCart },
      { to: "/sales-history", label: "Sales History", icon: ReceiptText },
    ],
  },
  {
    label: "Business Analytics",
    items: [
      { to: "/analytics/overview", label: "BA Overview", icon: BookOpen },
      { to: "/reports", label: "BA Dashboard", icon: BarChart3, adminOnly: true },
      { to: "/analytics/process", label: "BA Process", icon: GitBranch, adminOnly: true },
    ],
  },
  {
    label: "Assistant",
    items: [{ to: "/ai", label: "AI Assistant", icon: Bot }],
  },
  {
    label: "Administration",
    items: [
      { to: "/users", label: "User Management", icon: UserCog, adminOnly: true },
      { to: "/audit-logs", label: "Audit Logs", icon: ScrollText, adminOnly: true },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const content = (
    <div className="flex h-full flex-col bg-ink-950 text-slate-200">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm shadow-brand-950/40">
          <Wrench className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">Motor Shop</p>
          <p className="truncate text-[11px] text-slate-400">Management System</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {navGroups.map((group) => {
          const items = group.items.filter((item) => !item.adminOnly || isAdmin);
          if (!items.length) return null;
          return (
            <div key={group.label} className="mb-4 last:mb-0">
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {group.label}
              </p>
              <ul className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        onClick={onClose}
                        className={({ isActive }) =>
                          `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 ${
                            isActive
                              ? "bg-brand-600 text-white shadow-sm shadow-brand-950/40"
                              : "text-slate-300 hover:bg-white/10 hover:text-white"
                          }`
                        }
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-4">
        <div className="rounded-lg bg-white/5 px-3 py-3">
          <p className="truncate text-sm font-medium text-white">{user?.name}</p>
          <p className="truncate text-xs text-slate-400">{user?.email}</p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-brand-300">{user?.role}</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 lg:block no-print">{content}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden no-print">
          <div className="absolute inset-0 bg-slate-950/50" onClick={onClose} aria-hidden="true" />
          <aside
            className="absolute inset-y-0 left-0 w-72 shadow-pop"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            {content}
          </aside>
        </div>
      )}
    </>
  );
}

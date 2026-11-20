import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Package,
  Users,
  ReceiptText,
  Banknote,
  AlertTriangle,
  TrendingUp,
  Boxes,
  PackageX,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Spinner } from "../components/ui/Spinner";
import { ErrorState } from "../components/ui/ErrorState";
import { EmptyState } from "../components/ui/EmptyState";
import { Badge, statusTone } from "../components/ui/Badge";
import { RevenueChart } from "../components/charts/RevenueChart";
import { getDashboard } from "../services/data.service";
import type { DashboardData } from "../types";
import { formatCurrency, formatDateTime, titleCase } from "../utils/format";
import { useAuth } from "../context/AuthContext";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await getDashboard();
        if (mounted) setData(result);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load dashboard.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <Spinner label="Loading dashboard..." />;
  if (error || !data) {
    return (
      <div className="card">
        <ErrorState message={error || "No dashboard data available."} />
      </div>
    );
  }

  const { stats, inventory } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={
          isAdmin
            ? `Welcome back, ${user?.name?.split(" ")[0] || "there"}. Here's how the shop is doing.`
            : `Welcome back, ${user?.name?.split(" ")[0] || "there"}. Here's your operational overview.`
        }
      />

      {isAdmin ? (
        <>
          <div className="flex items-center gap-3">
            <h2 className="section-title">Business snapshot</h2>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <StatCard
              label="Total Products"
              value={stats.totalProducts}
              icon={<Package className="h-5 w-5" />}
            />
            <StatCard
              label="Total Customers"
              value={stats.totalCustomers}
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              label="Sales Transactions"
              value={stats.totalSales ?? 0}
              hint={`${stats.cancelledSales} cancelled`}
              icon={<ReceiptText className="h-5 w-5" />}
            />
            <StatCard
              label="Total Revenue"
              value={formatCurrency(stats.totalRevenue ?? 0)}
              hint={`Today: ${formatCurrency(stats.revenueToday ?? 0)}`}
              icon={<Banknote className="h-5 w-5" />}
              tone="success"
            />
          </div>

          <div className="flex items-center gap-3">
            <h2 className="section-title">Inventory health</h2>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <StatCard
              label="Low Stock Products"
              value={stats.lowStockCount}
              hint={`${stats.outOfStockCount} out of stock`}
              icon={<AlertTriangle className="h-5 w-5" />}
              tone={stats.lowStockCount > 0 ? "warn" : "default"}
            />
            <StatCard
              label="SKUs in Inventory"
              value={inventory.skuCount}
              icon={<Boxes className="h-5 w-5" />}
            />
            <StatCard
              label="Units on Hand"
              value={inventory.unitsOnHand}
              icon={<TrendingUp className="h-5 w-5" />}
            />
            <StatCard
              label="Inventory Retail Value"
              value={formatCurrency(inventory.retailValue ?? 0)}
              hint={
                inventory.costValue != null
                  ? `Cost: ${formatCurrency(inventory.costValue)}`
                  : "Cost visible to admins only"
              }
              icon={<Banknote className="h-5 w-5" />}
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <h2 className="section-title">Operational snapshot</h2>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <StatCard
              label="Products Tracked"
              value={stats.totalProducts}
              hint={`${inventory.skuCount} SKUs in inventory`}
              icon={<Package className="h-5 w-5" />}
            />
            <StatCard
              label="Units on Hand"
              value={inventory.unitsOnHand}
              icon={<Boxes className="h-5 w-5" />}
            />
            <StatCard
              label="Low Stock Products"
              value={stats.lowStockCount}
              hint={`${stats.outOfStockCount} out of stock`}
              icon={<AlertTriangle className="h-5 w-5" />}
              tone={stats.lowStockCount > 0 ? "warn" : "default"}
            />
            <StatCard
              label="Your Sales Today"
              value={stats.mySalesToday ?? 0}
              hint={`${stats.mySalesTotal ?? 0} completed in total`}
              icon={<ReceiptText className="h-5 w-5" />}
              tone="success"
            />
          </div>

          <div className="flex items-center gap-3">
            <h2 className="section-title">Additional context</h2>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <StatCard
              label="Out of Stock"
              value={stats.outOfStockCount}
              hint="Report shortages to an administrator"
              icon={<PackageX className="h-5 w-5" />}
              tone={stats.outOfStockCount > 0 ? "warn" : "default"}
            />
            <StatCard
              label="Customers"
              value={stats.totalCustomers}
              hint="Available for POS lookup"
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              label="Shop Sales Today"
              value={stats.mySalesToday ?? 0}
              hint="Your completed transactions"
              icon={<TrendingUp className="h-5 w-5" />}
            />
            <StatCard
              label="Cancelled Sales"
              value={stats.cancelledSales}
              hint="Shop-wide count"
              icon={<AlertTriangle className="h-5 w-5" />}
            />
          </div>
        </>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        {isAdmin ? (
          <div className="card p-5 xl:col-span-2">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="card-title">Monthly Sales Overview</h2>
                <p className="card-subtitle">Revenue over the last 6 months</p>
              </div>
              <Link to="/reports" className="text-link shrink-0">
                View reports
              </Link>
            </div>
            <RevenueChart data={data.monthlySales} />
          </div>
        ) : (
          <div className="card p-5 xl:col-span-2">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="card-title">Stock by Category</h2>
                <p className="card-subtitle">Units on hand across product categories</p>
              </div>
              <Link to="/inventory" className="text-link shrink-0">
                View inventory
              </Link>
            </div>
            {data.categoryMix.length === 0 ? (
              <EmptyState className="py-8" title="No inventory data yet" description="Stock levels will appear here once products are added." />
            ) : (
              <ul className="space-y-3">
                {data.categoryMix.map((row) => (
                  <li key={row.category} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{row.category}</p>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{
                            width: `${Math.min(
                              100,
                              (row.units /
                                Math.max(1, ...data.categoryMix.map((item) => item.units))) *
                                100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-medium text-slate-700">{row.units} units</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="card p-5">
          <h2 className="card-title">Best-Selling Products</h2>
          <p className="mb-4 text-sm text-slate-500">By units sold (all time)</p>
          {data.bestSellers.length === 0 ? (
            <EmptyState className="py-8" title="No sales data yet" description="Completed sales will appear here." />
          ) : (
            <ul className="space-y-3">
              {data.bestSellers.map((item, index) => (
                <li key={item.id} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold tabular-nums text-slate-600">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {item.sku} • {item.unitsSold} sold
                    </p>
                  </div>
                  {isAdmin && item.revenue != null ? (
                    <span className="text-sm font-medium text-slate-700">
                      {formatCurrency(item.revenue)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                {isAdmin ? "Recent Transactions" : "Your Recent Transactions"}
              </h2>
              <p className="card-subtitle">
                {isAdmin ? "Latest sales activity" : "Sales you processed"}
              </p>
            </div>
            <Link to="/sales-history" className="text-link shrink-0">
              View all
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Transaction</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Total</th>
                  <th scope="col">Status</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState className="py-8" title="No transactions yet" />
                    </td>
                  </tr>
                ) : (
                  data.recentTransactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="font-medium text-slate-800">
                        {tx.transactionNumber}
                      </td>
                      <td className="text-slate-600">{tx.customerName}</td>
                      <td className="text-slate-700">
                        {formatCurrency(tx.totalAmount)}
                      </td>
                      <td>
                        <Badge tone={statusTone(tx.status)}>{titleCase(tx.status)}</Badge>
                      </td>
                      <td className="text-slate-500">{formatDateTime(tx.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="card-header">
            <div>
              <h2 className="card-title">Low-Stock Products</h2>
              <p className="card-subtitle">Items at or below minimum levels</p>
            </div>
            <Link to="/inventory" className="text-link shrink-0">
              Manage
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Category</th>
                  <th scope="col">Stock</th>
                  <th scope="col">Minimum</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStockProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState className="py-8" title="Stock levels are healthy" description="All stocked items are above minimum levels." />
                    </td>
                  </tr>
                ) : (
                  data.lowStockProducts.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <p className="font-medium text-slate-800">{p.name}</p>
                        <p className="text-xs text-slate-500">{p.sku}</p>
                      </td>
                      <td className="text-slate-600">{p.categoryName}</td>
                      <td>
                        <Badge tone={p.stockQuantity === 0 ? "red" : "amber"}>
                          {p.stockQuantity}
                        </Badge>
                      </td>
                      <td className="text-slate-600">{p.minimumStock}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Search, ArrowUpCircle, ArrowDownCircle, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Pagination } from "../components/ui/Pagination";
import { Badge } from "../components/ui/Badge";
import { StatCard } from "../components/ui/StatCard";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { ApiRequestError } from "../services/api";
import {
  listInventory,
  listInventoryMovements,
  createInventoryMovement,
  listProducts,
} from "../services/data.service";
import type { InventoryMovement, InventoryRow, Product } from "../types";
import { formatCurrency, formatDateTime, titleCase } from "../utils/format";

export default function InventoryPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "admin";

  const [tab, setTab] = useState<"stock" | "movements">("stock");
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [summary, setSummary] = useState<Record<string, number> | undefined>();
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    productId: "",
    movementType: "stock_in" as "stock_in" | "stock_out" | "adjustment",
    quantity: "",
    newQuantity: "",
    reason: "",
  });

  async function loadStock() {
    setLoading(true);
    try {
      const res = await listInventory({ page, pageSize: 20, search: search || undefined, lowStock: lowStockOnly || undefined });
      setRows(res.data);
      setTotalPages(res.meta.totalPages);
      setSummary(res.summary);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMovements() {
    setLoading(true);
    try {
      const res = await listInventoryMovements({ page, pageSize: 20 });
      setMovements(res.data);
      setTotalPages(res.meta.totalPages);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Failed to load movements.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "stock") void loadStock();
    else void loadMovements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, search, lowStockOnly]);

  async function openModal() {
    try {
      const res = await listProducts({ page: 1, pageSize: 100, sort: "name_asc" });
      setProducts(res.data);
      setForm({ productId: res.data[0]?.id || "", movementType: "stock_in", quantity: "", newQuantity: "", reason: "" });
      setModalOpen(true);
    } catch {
      toast.error("Failed to load products for stock movement.");
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Parameters<typeof createInventoryMovement>[0] = {
        productId: form.productId,
        movementType: form.movementType,
        reason: form.reason.trim(),
      };
      if (form.movementType === "adjustment") payload.newQuantity = Number(form.newQuantity);
      else payload.quantity = Number(form.quantity);
      await createInventoryMovement(payload);
      toast.success("Inventory movement recorded.");
      setModalOpen(false);
      if (tab === "stock") await loadStock();
      else await loadMovements();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Unable to record movement.");
    } finally {
      setSaving(false);
    }
  }

  function movementIcon(type: string) {
    if (type === "stock_in" || type === "sale_cancellation") return <ArrowUpCircle className="h-4 w-4 text-emerald-600" />;
    if (type === "stock_out" || type === "sale") return <ArrowDownCircle className="h-4 w-4 text-rose-600" />;
    return <RefreshCw className="h-4 w-4 text-sky-600" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        subtitle="Track stock levels, movements, and low-stock alerts."
        actions={isAdmin ? <Button onClick={openModal}><Plus className="h-4 w-4" /> Record Movement</Button> : undefined}
      />

      {summary && (
        <div className={`grid gap-4 sm:grid-cols-2 md:grid-cols-3 ${isAdmin ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
          <StatCard label="SKUs" value={summary.skuCount ?? 0} />
          <StatCard label="Units on Hand" value={summary.unitsOnHand ?? 0} />
          {isAdmin && (
            <StatCard label="Retail Value" value={formatCurrency(summary.retailValue ?? 0)} tone="success" />
          )}
          <StatCard label="Low / Out of Stock" value={`${summary.lowStockCount ?? 0} / ${summary.outOfStockCount ?? 0}`} tone={(summary.lowStockCount ?? 0) > 0 ? "warn" : "default"} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Inventory views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "stock"}
          onClick={() => { setTab("stock"); setPage(1); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              setTab("movements");
              setPage(1);
              e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[1]?.focus();
            }
          }}
          className={`tab-button ${tab === "stock" ? "tab-button-active" : "tab-button-inactive"}`}
        >
          Stock Levels
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "movements"}
          onClick={() => { setTab("movements"); setPage(1); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              setTab("stock");
              setPage(1);
              e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[0]?.focus();
            }
          }}
          className={`tab-button ${tab === "movements" ? "tab-button-active" : "tab-button-inactive"}`}
        >
          Movement History
        </button>
      </div>

      {tab === "stock" && (
        <div className="card toolbar">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}>
              <div className="flex-1 max-w-sm"><Input placeholder="Search inventory..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} left={<Search className="h-4 w-4" />} /></div>
              <Button type="submit" variant="secondary">Search</Button>
            </form>
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={lowStockOnly} onChange={(e) => { setPage(1); setLowStockOnly(e.target.checked); }} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
              Low stock only
            </label>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? <Spinner label="Loading..." /> : tab === "stock" ? (
          rows.length === 0 ? <EmptyState title="No inventory items" description="No products match your filters." /> : (
            <>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Product</th>
                      <th scope="col">Category</th>
                      <th scope="col">Stock</th>
                      <th scope="col">Min</th>
                      <th scope="col">Status</th>
                      <th scope="col">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/60">
                        <td><p className="font-medium text-slate-900">{row.name}</p><p className="text-xs text-slate-500">{row.sku}</p></td>
                        <td className="text-slate-600">{row.categoryName}</td>
                        <td className="font-medium text-slate-800">{row.stockQuantity}</td>
                        <td className="text-slate-600">{row.minimumStock}</td>
                        <td><Badge tone={row.stockStatus === "out_of_stock" ? "red" : row.stockStatus === "low_stock" ? "amber" : "green"}>{titleCase(row.stockStatus || "in_stock")}</Badge></td>
                        <td className="text-slate-500">{formatDateTime(row.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )
        ) : movements.length === 0 ? <EmptyState title="No movements yet" description="Stock movements will appear here." /> : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Type</th>
                    <th scope="col">Change</th>
                    <th scope="col">Stock</th>
                    <th scope="col">Reason</th>
                    <th scope="col">By</th>
                    <th scope="col">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/60">
                      <td><p className="font-medium text-slate-900">{m.productName}</p><p className="text-xs text-slate-500">{m.sku}</p></td>
                      <td><span className="inline-flex items-center gap-1.5 text-slate-700">{movementIcon(m.movementType)} {titleCase(m.movementType)}</span></td>
                      <td className="text-slate-700">{m.quantity}</td>
                      <td className="text-slate-600">{m.previousQuantity} → {m.newQuantity}</td>
                      <td className="text-slate-600 max-w-xs truncate" title={m.reason}>{m.reason}</td>
                      <td className="text-slate-600">{m.userName || "System"}</td>
                      <td className="text-slate-500">{formatDateTime(m.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>

      <Modal open={modalOpen} title="Record Inventory Movement" description="All stock changes are logged for audit integrity." onClose={() => setModalOpen(false)}
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" form="inventory-movement-form" loading={saving}>Save Movement</Button></>}>
        <form id="inventory-movement-form" onSubmit={onSave} className="space-y-4">
          <Select label="Product" required value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}>
            <option value="">Select product</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku}) — stock {p.stockQuantity}</option>)}
          </Select>
          <Select label="Movement type" required value={form.movementType} onChange={(e) => setForm((f) => ({ ...f, movementType: e.target.value as typeof f.movementType }))}>
            <option value="stock_in">Stock In</option>
            <option value="stock_out">Stock Out</option>
            <option value="adjustment">Adjustment (set exact quantity)</option>
          </Select>
          {form.movementType === "adjustment" ? (
            <Input label="New stock quantity" type="number" min="0" step="1" required value={form.newQuantity} onChange={(e) => setForm((f) => ({ ...f, newQuantity: e.target.value }))} />
          ) : (
            <Input label="Quantity" type="number" min="1" step="1" required value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
          )}
          <Textarea label="Reason" required rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Explain why this stock change is being made" />
        </form>
      </Modal>
    </div>
  );
}

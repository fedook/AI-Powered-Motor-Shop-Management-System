import { useEffect, useState } from "react";
import { Search, Eye, XCircle, Printer } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Pagination } from "../components/ui/Pagination";
import { Badge, statusTone } from "../components/ui/Badge";
import { IconButton } from "../components/ui/IconButton";
import { Textarea } from "../components/ui/Textarea";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { ApiRequestError } from "../services/api";
import { listSales, getSale, cancelSale } from "../services/data.service";
import type { Sale } from "../types";
import { formatCurrency, formatDateTime, titleCase } from "../utils/format";

export default function SalesHistoryPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "admin";

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("");

  const [viewing, setViewing] = useState<Sale | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await listSales({ page, pageSize: 20, search: search || undefined, status: status || undefined });
      setSales(res.data);
      setTotalPages(res.meta.totalPages);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Failed to load sales.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [page, search, status]);

  async function openView(id: string) {
    setViewLoading(true);
    try {
      const detail = await getSale(id);
      setViewing(detail);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Failed to load sale.");
    } finally {
      setViewLoading(false);
    }
  }

  async function onCancel() {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 3) {
      toast.error("Please provide a cancellation reason (at least 3 characters).");
      return;
    }
    setCancelling(true);
    try {
      const updated = await cancelSale(cancelTarget.id, cancelReason.trim());
      toast.success("Sale cancelled and stock restored.");
      setCancelTarget(null);
      setCancelReason("");
      if (viewing?.id === updated.id) setViewing(updated);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Unable to cancel sale.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Sales History" subtitle="Review transactions and receipts." />

      <div className="card toolbar">
        <div className="grid gap-3 sm:grid-cols-3">
          <form className="flex gap-2 sm:col-span-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}>
            <div className="flex-1"><Input placeholder="Search by transaction number or customer..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} left={<Search className="h-4 w-4" />} /></div>
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          <Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? <Spinner label="Loading sales..." /> : sales.length === 0 ? (
          <EmptyState title="No sales found" description="Transactions will appear here once recorded." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr><th scope="col">Transaction</th><th scope="col">Customer</th><th scope="col">Cashier</th><th scope="col">Total</th><th scope="col">Payment</th><th scope="col">Status</th><th scope="col">Date</th><th scope="col" className="text-right">Actions</th></tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50/60">
                      <td className="font-medium text-slate-900">{sale.transactionNumber}</td>
                      <td className="text-slate-600">{sale.customerName || "Walk-in"}</td>
                      <td className="text-slate-600">{sale.cashierName || "—"}</td>
                      <td className="font-medium text-slate-800">{formatCurrency(sale.totalAmount)}</td>
                      <td className="text-slate-600">{titleCase(sale.paymentMethod)}</td>
                      <td><Badge tone={statusTone(sale.status)}>{titleCase(sale.status)}</Badge></td>
                      <td className="text-slate-500">{formatDateTime(sale.createdAt)}</td>
                      <td><div className="flex justify-end gap-1">
                        <IconButton label={`View receipt ${sale.transactionNumber}`} onClick={() => void openView(sale.id)}><Eye className="h-4 w-4" /></IconButton>
                        {isAdmin && sale.status === "completed" && <IconButton label={`Cancel ${sale.transactionNumber}`} tone="danger" onClick={() => { setCancelTarget(sale); setCancelReason(""); }}><XCircle className="h-4 w-4" /></IconButton>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>

      <Modal open={!!viewing || viewLoading} title={viewing ? `Receipt ${viewing.transactionNumber}` : "Receipt"} description={viewing ? formatDateTime(viewing.createdAt) : undefined} onClose={() => setViewing(null)} width="lg"
        footer={viewing ? <><Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>{isAdmin && viewing.status === "completed" && <Button variant="danger" onClick={() => { setCancelTarget(viewing); setCancelReason(""); }}><XCircle className="h-4 w-4" /> Cancel Sale</Button>}</> : undefined}>
        {viewLoading || !viewing ? <Spinner label="Loading receipt..." /> : (
          <div className="print-area space-y-5">
            <div className="grid gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <div><p className="text-xs uppercase tracking-wide text-slate-500">Customer</p><p className="mt-1 font-medium text-slate-800">{viewing.customerName || "Walk-in customer"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-slate-500">Cashier</p><p className="mt-1 font-medium text-slate-800">{viewing.cashierName || "—"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-slate-500">Payment</p><p className="mt-1 text-slate-800">{titleCase(viewing.paymentMethod)}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-slate-500">Status</p><div className="mt-1"><Badge tone={statusTone(viewing.status)}>{titleCase(viewing.status)}</Badge></div></div>
              {viewing.cancellationReason && <div className="sm:col-span-2"><p className="text-xs uppercase tracking-wide text-slate-500">Cancellation reason</p><p className="mt-1 text-rose-700">{viewing.cancellationReason}</p></div>}
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="data-table data-table-compact">
                <thead><tr><th scope="col" className="px-4 py-2">Item</th><th scope="col" className="px-4 py-2 text-right">Qty</th><th scope="col" className="px-4 py-2 text-right">Unit Price</th><th scope="col" className="px-4 py-2 text-right">Subtotal</th></tr></thead>
                <tbody>
                  {(viewing.items || []).map((item) => (
                    <tr key={item.id || item.productId}><td className="px-4 py-2"><p className="font-medium text-slate-800">{item.productName}</p><p className="text-xs text-slate-500">{item.sku}</p></td><td className="px-4 py-2 text-right">{item.quantity}</td><td className="px-4 py-2 text-right">{formatCurrency(item.unitPrice ?? 0)}</td><td className="px-4 py-2 text-right font-medium">{formatCurrency(item.subtotal ?? 0)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ml-auto max-w-xs space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{formatCurrency(viewing.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>-{formatCurrency(viewing.discount)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold"><span>Total</span><span>{formatCurrency(viewing.totalAmount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Amount Paid</span><span>{formatCurrency(viewing.amountPaid)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Change</span><span>{formatCurrency(viewing.changeAmount)}</span></div>
            </div>
          </div>
        )}
      </Modal>

      {cancelTarget && (
        <Modal
          open={!!cancelTarget}
          title={`Cancel ${cancelTarget.transactionNumber}`}
          description="Inventory will be restored and the cancellation will be audited. A reason is required."
          onClose={() => setCancelTarget(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCancelTarget(null)} disabled={cancelling}>Back</Button>
              <Button type="submit" form="cancel-sale-form" variant="danger" loading={cancelling}>Confirm Cancellation</Button>
            </>
          }
        >
          <form id="cancel-sale-form" onSubmit={onCancel}>
            <Textarea
              label="Reason"
              required
              rows={4}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Customer returned items, incorrect entry, etc."
            />
          </form>
        </Modal>
      )}
    </div>
  );
}

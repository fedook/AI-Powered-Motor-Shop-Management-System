import { useEffect, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, Search, Eye } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Textarea } from "../components/ui/Textarea";
import { Modal } from "../components/ui/Modal";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Spinner } from "../components/ui/Spinner";
import { EmptyState } from "../components/ui/EmptyState";
import { IconButton } from "../components/ui/IconButton";
import { Pagination } from "../components/ui/Pagination";
import { Badge } from "../components/ui/Badge";
import { MiniStat } from "../components/ui/MiniStat";
import { Callout } from "../components/ui/Callout";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { ApiRequestError } from "../services/api";
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "../services/data.service";
import type { Customer } from "../types";
import { formatCurrency, formatDate, formatDateTime } from "../utils/format";

interface FormState {
  fullName: string;
  email: string;
  contactNumber: string;
  address: string;
}
const empty: FormState = { fullName: "", email: "", contactNumber: "", address: "" };

export default function CustomersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "admin";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [viewing, setViewing] = useState<Customer | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await listCustomers({ page, pageSize: 20, search: search || undefined });
      setCustomers(res.data);
      setTotalPages(res.meta.totalPages);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Failed to load customers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setModalOpen(true);
  }
  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      fullName: c.fullName,
      email: c.email || "",
      contactNumber: c.contactNumber || "",
      address: c.address || "",
    });
    setModalOpen(true);
  }

  async function openView(id: string) {
    setViewLoading(true);
    try {
      const detail = await getCustomer(id);
      setViewing(detail);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Failed to load customer.");
    } finally {
      setViewLoading(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        email: form.email.trim() || null,
        contactNumber: form.contactNumber.trim() || null,
        address: form.address.trim() || null,
      };
      if (editing) {
        await updateCustomer(editing.id, payload);
        toast.success("Customer updated.");
      } else {
        await createCustomer(payload);
        toast.success("Customer created.");
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Unable to save customer.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCustomer(deleteTarget.id);
      toast.success("Customer deleted.");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Unable to delete customer.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        subtitle={
          isAdmin
            ? "Manage customer profiles and purchase history."
            : "Look up customer contact details for sales and service."
        }
        actions={<Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Customer</Button>}
      />

      <div className="card toolbar">
        <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}>
          <div className="flex-1"><Input placeholder="Search by name, email, or contact..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} left={<Search className="h-4 w-4" />} /></div>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
      </div>

      <div className="card overflow-hidden">
        {loading ? <Spinner label="Loading customers..." /> : customers.length === 0 ? (
          <EmptyState title="No customers found" description="Add customers to track their purchases." action={<Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Customer</Button>} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    <th scope="col">Contact</th>
                    <th scope="col">Registered</th>
                    <th scope="col" className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/60">
                      <td className="font-medium text-slate-900">{c.fullName}</td>
                      <td className="text-slate-600">{c.email || "—"}</td>
                      <td className="text-slate-600">{c.contactNumber || "—"}</td>
                      <td className="text-slate-500">{formatDate(c.createdAt)}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <IconButton label={`View ${c.fullName}`} onClick={() => void openView(c.id)}><Eye className="h-4 w-4" /></IconButton>
                          <IconButton label={`Edit ${c.fullName}`} onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></IconButton>
                          {isAdmin && <IconButton label={`Delete ${c.fullName}`} tone="danger" onClick={() => setDeleteTarget(c)}><Trash2 className="h-4 w-4" /></IconButton>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>

      <Modal open={modalOpen} title={editing ? "Edit Customer" : "Add Customer"} onClose={() => setModalOpen(false)}
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" form="customer-form" loading={saving}>{editing ? "Save Changes" : "Create Customer"}</Button></>}>
        <form id="customer-form" onSubmit={onSave} className="space-y-4">
          <Input label="Full name" required value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <Input label="Contact number" value={form.contactNumber} onChange={(e) => setForm((f) => ({ ...f, contactNumber: e.target.value }))} />
          <Textarea label="Address" rows={3} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        </form>
      </Modal>

      <Modal open={!!viewing || viewLoading} title={viewing?.fullName || "Customer"} description="Customer profile and recent purchases" onClose={() => setViewing(null)} width="lg">
        {viewLoading || !viewing ? <Spinner label="Loading customer..." /> : (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className="text-xs uppercase tracking-wide text-slate-500">Email</p><p className="mt-1 text-sm text-slate-800">{viewing.email || "—"}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-slate-500">Contact</p><p className="mt-1 text-sm text-slate-800">{viewing.contactNumber || "—"}</p></div>
              <div className="sm:col-span-2"><p className="text-xs uppercase tracking-wide text-slate-500">Address</p><p className="mt-1 text-sm text-slate-800">{viewing.address || "—"}</p></div>
            </div>
            {viewing.restrictedFinancials ? (
              <Callout tone="warning">
                Spending totals and purchase history are restricted to administrators. Contact details above
                are available for sales and service.
              </Callout>
            ) : (
              <>
                {viewing.stats && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MiniStat label="Purchases" value={viewing.stats.purchaseCount} />
                    <MiniStat label="Total Spent" value={formatCurrency(viewing.stats.totalSpent)} />
                    <MiniStat label="Last Purchase" value={viewing.stats.lastPurchaseAt ? formatDateTime(viewing.stats.lastPurchaseAt) : "—"} />
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Recent Purchases</h4>
                  {(!viewing.recentPurchases || viewing.recentPurchases.length === 0) ? <p className="mt-2 text-sm text-slate-500">No purchases yet.</p> : (
                    <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
                      <table className="data-table data-table-compact">
                        <thead><tr><th scope="col" className="px-4 py-2">Txn</th><th scope="col" className="px-4 py-2">Total</th><th scope="col" className="px-4 py-2">Status</th><th scope="col" className="px-4 py-2">Date</th></tr></thead>
                        <tbody>
                          {viewing.recentPurchases.map((p) => (<tr key={p.id}><td className="px-4 py-2 font-medium">{p.transactionNumber}</td><td className="px-4 py-2">{formatCurrency(p.totalAmount)}</td><td className="px-4 py-2"><Badge tone={p.status === "completed" ? "green" : "red"}>{p.status}</Badge></td><td className="px-4 py-2 text-slate-500">{formatDateTime(p.createdAt)}</td></tr>))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="Delete customer" message={`Delete "${deleteTarget?.fullName}"? Customers with sales history cannot be deleted.`} confirmLabel="Delete" loading={deleting} onConfirm={onDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}

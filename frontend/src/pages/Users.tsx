import { useEffect, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, Search, Shield } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Modal } from "../components/ui/Modal";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Spinner } from "../components/ui/Spinner";
import { EmptyState } from "../components/ui/EmptyState";
import { IconButton } from "../components/ui/IconButton";
import { Pagination } from "../components/ui/Pagination";
import { Badge } from "../components/ui/Badge";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { ApiRequestError } from "../services/api";
import { listUsers, createUser, updateUser, deleteUser } from "../services/data.service";
import type { User } from "../types";
import { formatDateTime } from "../utils/format";

export default function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "staff" as "admin" | "staff" });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await listUsers({ page, pageSize: 20, search: search || undefined });
      setUsers(res.data);
      setTotalPages(res.meta.totalPages);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [page, search]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", email: "", password: "", role: "staff" });
    setModalOpen(true);
  }
  function openEdit(u: User) {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: "", role: u.role });
    setModalOpen(true);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await updateUser(editing.id, { name: form.name.trim(), email: form.email.trim().toLowerCase(), role: form.role });
        toast.success("User updated.");
      } else {
        await createUser({ name: form.name.trim(), email: form.email.trim().toLowerCase(), password: form.password, role: form.role });
        toast.success("User created.");
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Unable to save user.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteUser(deleteTarget.id);
      toast.success("User deleted.");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Unable to delete user.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="User Management" subtitle="Manage administrator and staff accounts." actions={<Button onClick={openCreate}><Plus className="h-4 w-4" /> Add User</Button>} />

      <div className="card toolbar">
        <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}>
          <div className="flex-1"><Input placeholder="Search users..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} left={<Search className="h-4 w-4" />} /></div>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
      </div>

      <div className="card overflow-hidden">
        {loading ? <Spinner label="Loading users..." /> : users.length === 0 ? (
          <EmptyState title="No users found" description="No accounts match your search." icon={<Shield className="h-7 w-7" />} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Last Login</th><th scope="col" className="text-right">Actions</th></tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/60">
                      <td className="font-medium text-slate-900">{u.name} {u.id === me?.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}</td>
                      <td className="text-slate-600">{u.email}</td>
                      <td><Badge tone={u.role === "admin" ? "orange" : "blue"}>{u.role}</Badge></td>
                      <td className="text-slate-500">{formatDateTime(u.lastLoginAt)}</td>
                      <td><div className="flex justify-end gap-1">
                        <IconButton label={`Edit ${u.name}`} onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></IconButton>
                        <IconButton label={`Delete ${u.name}`} tone="danger" onClick={() => setDeleteTarget(u)} disabled={u.id === me?.id}><Trash2 className="h-4 w-4" /></IconButton>
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

      <Modal open={modalOpen} title={editing ? "Edit User" : "Add User"} onClose={() => setModalOpen(false)}
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" form="user-form" loading={saving}>{editing ? "Save Changes" : "Create User"}</Button></>}>
        <form id="user-form" onSubmit={onSave} className="space-y-4">
          <Input label="Full name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          {!editing && <Input label="Password" type="password" required minLength={8} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} hint="Min 8 chars with upper, lower, number, and special character." />}
          <Select label="Role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "admin" | "staff" }))} disabled={editing?.id === me?.id}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </Select>
          {editing?.id === me?.id && <p className="text-xs text-slate-500">You cannot change your own role.</p>}
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="Delete user" message={`Delete "${deleteTarget?.name}"? This action cannot be undone.`} confirmLabel="Delete" loading={deleting} onConfirm={onDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Pagination } from "../components/ui/Pagination";
import { useToast } from "../components/ui/Toast";
import { ApiRequestError } from "../services/api";
import { listAuditLogs } from "../services/data.service";
import type { AuditLog } from "../types";
import { formatDateTime, titleCase } from "../utils/format";

export default function AuditLogsPage() {
  const toast = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [action, setAction] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [entityType, setEntityType] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await listAuditLogs({ page, pageSize: 20, action: action || undefined, entityType: entityType || undefined });
      setLogs(res.data);
      setTotalPages(res.meta.totalPages);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [page, action, entityType]);

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Logs" subtitle="Review security-sensitive and business-critical activity." />

      <div className="card toolbar">
        <div className="grid gap-3 sm:grid-cols-3">
          <form className="flex gap-2 sm:col-span-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setAction(actionInput.trim()); }}>
            <div className="flex-1"><Input placeholder="Filter by action (e.g. LOGIN_SUCCESS, SALE_CREATE)..." value={actionInput} onChange={(e) => setActionInput(e.target.value)} left={<Search className="h-4 w-4" />} /></div>
            <Button type="submit" variant="secondary">Filter</Button>
          </form>
          <Input placeholder="Entity type (e.g. sale, user, product)" value={entityType} onChange={(e) => { setPage(1); setEntityType(e.target.value.trim()); }} />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? <Spinner label="Loading audit logs..." /> : logs.length === 0 ? (
          <EmptyState title="No audit logs found" description="Recorded actions will appear here." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr><th scope="col">Time</th><th scope="col">User</th><th scope="col">Action</th><th scope="col">Entity</th><th scope="col">Details</th></tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="align-top hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatDateTime(log.createdAt)}</td>
                      <td><p className="font-medium text-slate-800">{log.userName || "System"}</p><p className="text-xs text-slate-500">{log.userEmail || "—"}</p></td>
                      <td className="font-medium text-slate-700">{log.action}</td>
                      <td className="text-slate-600">{titleCase(log.entityType)}{log.entityId ? <span className="block text-xs text-slate-400 font-mono">{log.entityId.slice(0, 8)}…</span> : null}</td>
                      <td className="max-w-md px-5 py-3 text-xs text-slate-600"><pre className="whitespace-pre-wrap break-words font-sans">{log.details ? JSON.stringify(log.details, null, 0) : "—"}</pre></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

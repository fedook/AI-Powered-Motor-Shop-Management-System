import { useEffect, useState } from "react";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";
import { Badge } from "../components/ui/Badge";
import { Callout } from "../components/ui/Callout";
import { getHealth } from "../services/data.service";
import { useAuth } from "../context/AuthContext";

export default function SettingsPage() {
  const { user } = useAuth();
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setLoading(false));
  }, []);

  const data = (health?.data || health) as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="System status and environment information." />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="card-title">Session</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Signed in as</dt><dd className="font-medium text-slate-800">{user?.name}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Email</dt><dd className="text-slate-800">{user?.email}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Role</dt><dd><Badge tone={user?.role === "admin" ? "orange" : "blue"}>{user?.role}</Badge></dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">API base URL</dt><dd className="font-mono text-xs text-slate-700">{import.meta.env.VITE_API_URL}</dd></div>
          </dl>
        </div>

        <div className="card p-6">
          <h2 className="card-title">Backend Health</h2>
          {loading ? <Spinner label="Checking health..." className="py-8" /> : data ? (
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Status</dt><dd><Badge tone={data.status === "ok" ? "green" : "amber"}>{String(data.status)}</Badge></dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Database</dt><dd><Badge tone={data.database === "up" ? "green" : "red"}>{String(data.database)}</Badge></dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">DB latency</dt><dd className="text-slate-800">{data.databaseLatencyMs != null ? `${data.databaseLatencyMs} ms` : "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">AI configured</dt><dd><Badge tone={data.aiConfigured ? "green" : "amber"}>{data.aiConfigured ? "Yes" : "No"}</Badge></dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Environment</dt><dd className="text-slate-800">{String(data.environment ?? "—")}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Uptime</dt><dd className="text-slate-800">{data.uptimeSeconds != null ? `${data.uptimeSeconds}s` : "—"}</dd></div>
            </dl>
          ) : (
            <div className="mt-4">
              <Callout tone="error" title="Backend unreachable">
                Unable to reach the backend health endpoint.
              </Callout>
            </div>
          )}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="card-title">Security Notes</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
          <li>Authentication uses HTTP-only JWT cookies with CSRF protection for browser requests.</li>
          <li>Role-based authorization is enforced on the backend for all sensitive operations.</li>
          <li>The Groq API key (when configured) is stored and used only on the backend; the frontend never receives it.</li>
          <li>Business-critical operations (sales, inventory) run in database transactions with audit logging.</li>
          <li>See <span className="font-medium text-slate-800">docs/</span> for CIA Triad, security architecture, and test report documentation.</li>
        </ul>
      </div>
    </div>
  );
}

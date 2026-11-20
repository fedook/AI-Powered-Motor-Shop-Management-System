import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "warn" | "danger" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "bg-rose-50 text-rose-600 ring-rose-600/10"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700 ring-amber-600/10"
        : tone === "success"
          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/10"
          : "bg-brand-50 text-brand-700 ring-brand-600/10";

  return (
    <div className="card h-full p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        {icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${toneClass}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

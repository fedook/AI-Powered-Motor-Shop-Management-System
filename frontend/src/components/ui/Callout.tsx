import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";

type Tone = "info" | "warning" | "error" | "success";

const styles: Record<Tone, { wrapper: string; icon: typeof Info }> = {
  info: { wrapper: "border-sky-200 bg-sky-50 text-sky-900", icon: Info },
  warning: { wrapper: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle },
  error: { wrapper: "border-rose-200 bg-rose-50 text-rose-900", icon: AlertCircle },
  success: { wrapper: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2 },
};

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  const style = styles[tone];
  const Icon = style.icon;
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${style.wrapper}`} role={tone === "error" ? "alert" : "status"}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-1" : ""}>{children}</div>
      </div>
    </div>
  );
}

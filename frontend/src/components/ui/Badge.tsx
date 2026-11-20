import type { ReactNode } from "react";

type Tone = "gray" | "green" | "amber" | "red" | "blue" | "orange";

const tones: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-500/20",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  orange: "bg-orange-50 text-orange-700 ring-orange-600/20",
};

export function Badge({ children, tone = "gray", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  const s = status.toLowerCase().replace(/[\s-]+/g, "_");
  if (["completed", "active", "in_stock", "success", "paid", "approved"].includes(s)) return "green";
  if (["cancelled", "out_of_stock", "failed", "critical", "rejected", "overdue", "unpaid"].includes(s)) return "red";
  if (["low_stock", "pending", "warning", "review", "low"].includes(s)) return "amber";
  if (["admin"].includes(s)) return "orange";
  if (["staff", "info", "draft", "inactive"].includes(s)) return "blue";
  return "gray";
}

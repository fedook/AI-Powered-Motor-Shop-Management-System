import { Loader2 } from "lucide-react";

export function Spinner({ label = "Loading...", className = "" }: { label?: string; className?: string }) {
  return (
    <div
      className={`loading-state ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <Loader2 className="h-7 w-7 animate-spin text-brand-600" aria-hidden="true" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

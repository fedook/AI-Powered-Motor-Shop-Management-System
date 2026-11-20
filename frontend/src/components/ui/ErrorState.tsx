import { AlertCircle } from "lucide-react";
import { Button } from "./Button";

export function ErrorState({
  title = "Unable to load this section",
  message,
  actionLabel,
  onAction,
}: {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state" role="alert">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-rose-50 text-rose-600" aria-hidden="true">
        <AlertCircle className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-600">{message}</p>}
      {actionLabel && onAction && (
        <div className="mt-5">
          <Button variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

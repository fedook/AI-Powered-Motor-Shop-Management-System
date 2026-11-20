import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Button } from "./Button";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name for the icon-only control. */
  label: string;
  tone?: "default" | "danger";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tone = "default", className = "", title, ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      title={title ?? label}
      className={`px-2 ${
        tone === "danger"
          ? "text-slate-500 hover:bg-rose-50 hover:text-rose-700"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      } ${className}`}
      {...props}
    />
  );
});

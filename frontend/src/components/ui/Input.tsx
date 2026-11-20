import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  left?: ReactNode;
  right?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, left, right, className = "", id, "aria-describedby": describedByProp, ...props },
  ref,
) {
  const inputId = id || props.name;
  const errorId = error && inputId ? `${inputId}-error` : undefined;
  const hintId = !error && hint && inputId ? `${inputId}-hint` : undefined;
  const describedBy = [describedByProp, errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <label className="block">
      {label && <span className="form-label">{label}</span>}
      <div className="relative">
        {left && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400" aria-hidden="true">
            {left}
          </span>
        )}
        <input
          {...props}
          ref={ref}
          id={inputId}
          className={`form-control ${left ? "pl-9" : ""} ${right ? "pr-10" : ""} ${error ? "form-control-error" : ""} ${className}`}
          aria-invalid={error ? true : props["aria-invalid"]}
          aria-describedby={describedBy}
        />
        {right && (
          <span className="absolute inset-y-0 right-0 flex items-center pr-2">{right}</span>
        )}
      </div>
      {error ? (
        <span id={errorId} role="alert" className="form-error">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className="form-hint">
          {hint}
        </span>
      ) : null}
    </label>
  );
});

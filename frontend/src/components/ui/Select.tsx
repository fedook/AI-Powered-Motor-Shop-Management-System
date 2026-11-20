import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, className = "", id, children, "aria-describedby": describedByProp, ...props },
  ref,
) {
  const selectId = id || props.name;
  const errorId = error && selectId ? `${selectId}-error` : undefined;
  const describedBy = [describedByProp, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <label className="block">
      {label && <span className="form-label">{label}</span>}
      <select
        {...props}
        ref={ref}
        id={selectId}
        className={`form-control ${error ? "form-control-error" : ""} ${className}`}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={describedBy}
      >
        {children}
      </select>
      {error && (
        <span id={errorId} role="alert" className="form-error">
          {error}
        </span>
      )}
    </label>
  );
});

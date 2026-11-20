import { forwardRef, type TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, className = "", id, "aria-describedby": describedByProp, ...props },
  ref,
) {
  const textareaId = id || props.name;
  const errorId = error && textareaId ? `${textareaId}-error` : undefined;
  const describedBy = [describedByProp, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <label className="block">
      {label && <span className="form-label">{label}</span>}
      <textarea
        {...props}
        ref={ref}
        id={textareaId}
        className={`form-control h-auto py-2 ${error ? "form-control-error" : ""} ${className}`}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={describedBy}
      />
      {error && (
        <span id={errorId} role="alert" className="form-error">
          {error}
        </span>
      )}
    </label>
  );
});

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

/**
 * A labelled text input with an inline error, for every customer-facing form.
 *
 * Visible label (placeholders vanish the moment someone types, leaving a
 * half-filled form with no hint what each box is - WCAG 3.3.2), inline error
 * wired up via aria-describedby/aria-invalid so screen readers announce it,
 * and 16px text so iOS Safari doesn't zoom the page on focus.
 */

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "id"> & {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  error?: string;
  hint?: string;
  /** Rendered inside the right edge of the input (e.g. a show-password button). */
  trailing?: ReactNode;
  /** Keep the value out of PostHog session recordings (personal data). */
  sensitive?: boolean;
};

export const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  { id, label, value, onValueChange, error, hint, trailing, sensitive = true, className, ...rest },
  ref,
) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="min-w-0 space-y-1.5">
      <label
        htmlFor={id}
        className="block font-sans text-[0.68rem] uppercase tracking-[0.3em] text-gold-3"
      >
        {label}
      </label>
      <div className="relative">
        <input
          {...rest}
          ref={ref}
          id={id}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full min-w-0 bg-gold/[0.06] border px-4 py-4 font-sans text-base text-cream outline-none transition-colors placeholder:text-muted-warm focus:border-gold/50 ${
            error ? "border-red-400" : "border-line-strong"
          } ${trailing ? "pr-14" : ""} ${sensitive ? "ph-no-capture" : ""} ${className ?? ""}`}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center">{trailing}</div>}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="font-sans text-sm text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="font-sans text-[0.78rem] text-muted-warm">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

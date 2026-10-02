import { Eye, EyeOff } from "lucide-react";

/** Show/hide button for a password TextField's `trailing` slot. 44px square -
 * the minimum comfortable touch target. */
export function PasswordToggle({
  shown,
  onToggle,
  showLabel,
  hideLabel,
}: {
  shown: boolean;
  onToggle: () => void;
  showLabel: string;
  hideLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? hideLabel : showLabel}
      aria-pressed={shown}
      className="flex h-11 w-11 items-center justify-center text-muted-warm hover:text-cream"
    >
      {shown ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
    </button>
  );
}

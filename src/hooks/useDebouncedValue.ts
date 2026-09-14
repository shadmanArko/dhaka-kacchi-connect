import { useEffect, useState } from "react";

/** Returns `value`, but only after it's stopped changing for `delayMs` -
 * standard debounce-a-value hook, e.g. for live-as-you-type API calls that
 * shouldn't fire on every keystroke. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

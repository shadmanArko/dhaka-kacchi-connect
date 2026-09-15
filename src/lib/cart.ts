/**
 * Pure localStorage helpers for the in-progress order on /order - no React.
 * routes/order.tsx owns the restore/validate logic; nothing else should touch
 * localStorage for this directly. Same shape as session.ts.
 *
 * Its own key, never the session ones: a customer and the owner's admin login
 * can coexist in one browser (see adminSession.ts), and a cart is a third,
 * independent thing that must not collide with either.
 *
 * The stored cart is UNVALIDATED by construction. A saved SKU can vanish from
 * the menu, and a saved delivery date is a specific Saturday that goes stale
 * every week. `readCart` only guarantees the blob is well-formed and recent -
 * order.tsx re-validates the contents against the freshly-fetched menu and
 * availability before using any of it.
 */

const STORAGE_KEY = "dhaka-kacchi-cart";

/** Bump when the shape changes; an unrecognised version is treated as absent
 * rather than migrated, because a dropped cart is a far cheaper failure than a
 * half-understood one. */
const CART_VERSION = 1;

/** A cart is pinned to a Saturday that has usually passed by now. Two weeks is
 * long enough to survive "I'll finish this tomorrow" and short enough that a
 * months-old cart never resurfaces. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type StoredCart = {
  version: number;
  savedAt: number;
  quantities: Record<string, number>;
  deliveryDate: string;
  fulfillmentType: "pickup" | "delivery";
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  customerName: string;
  notes: string;
  /** Which logged-in customer the address fields were last prefilled from.
   * Persisted so order.tsx's prefill guard survives a reload and doesn't
   * re-stomp an address the customer edited before leaving. */
  prefilledForCustomerId: string | null;
};

export function readCart(): StoredCart | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCart;
    if (parsed?.version !== CART_VERSION) return null;
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    if (!parsed.quantities || typeof parsed.quantities !== "object") return null;
    return parsed;
  } catch {
    // Private browsing / storage disabled / corrupted value - start fresh.
    return null;
  }
}

export function writeCart(cart: Omit<StoredCart, "version" | "savedAt">): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...cart, version: CART_VERSION, savedAt: Date.now() }),
    );
  } catch {
    // Storage unavailable - the cart just won't survive a reload, which is
    // exactly the behaviour we had before this existed.
  }
}

export function clearCart(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See above.
  }
}

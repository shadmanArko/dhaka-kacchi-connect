/**
 * Identity for the warehouse event beacon (analytics.ts's trackWarehouseEvent,
 * POST /v1/events) - deliberately separate from every other id in this app.
 *
 * "One key, one owner, no shared blob" (see session.ts/cart.ts): PostHog
 * manages its own distinct_id internally, and this app must not read or
 * write it directly - that's a third identity space we don't own. This
 * module owns exactly two keys of its own instead.
 */

const ANON_ID_KEY = "dhaka-kacchi-anon-id";
const SESSION_ID_KEY = "dhaka-kacchi-beacon-session-id";

function newId(): string {
  return crypto.randomUUID();
}

/** A persistent per-browser id, minted once and reused on every later visit.
 * localStorage, same as session.ts/cart.ts. Never throws: storage can be
 * unavailable in private mode, and this sits on the hot path of every
 * tracked event - the beacon just omits anonymousId when that happens. */
export function getAnonymousId(): string | null {
  try {
    const existing = localStorage.getItem(ANON_ID_KEY);
    if (existing) return existing;
    const id = newId();
    localStorage.setItem(ANON_ID_KEY, id);
    return id;
  } catch {
    return null;
  }
}

/** One id per browser SESSION (sessionStorage, cleared when the tab closes)
 * - distinct from the persistent anonymous id above and from the customer
 * session in session.ts. Minted once per tab, reused for every event fired
 * from it. */
export function getBeaconSessionId(): string | null {
  try {
    const existing = sessionStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const id = newId();
    sessionStorage.setItem(SESSION_ID_KEY, id);
    return id;
  } catch {
    return null;
  }
}

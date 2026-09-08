import type { OrderRecord } from "./orders";

/**
 * The one place "an order was placed" gets announced. Anything can
 * subscribe - email, WhatsApp, and any future listener (a loyalty system,
 * an analytics ping) - by calling onOrderCreated() at import time, without
 * this file or the /orders route ever needing to change again.
 *
 * Deliberately NOT Node's built-in EventEmitter: emit() there is
 * fire-and-forget and does not wait for async listeners, but the /orders
 * route needs to know notifications were at least ATTEMPTED before it
 * responds (same guarantee the original inline Promise.all gave) - losing
 * a listener's work silently to a process restart right after the HTTP
 * response would be a real reliability regression, not a simplification.
 * This is the smallest thing that keeps the "just register a listener"
 * decoupling while still being awaitable - not a message queue, which
 * would be solving a problem this one process doesn't have.
 */

export type OrderCreatedEvent = { order: OrderRecord };
type Listener = (event: OrderCreatedEvent) => Promise<void>;

const listeners: Listener[] = [];

/** Registers a listener to run whenever an order is created. Call this once,
 * at module load time, from any file that needs to react to new orders. */
export function onOrderCreated(listener: Listener): void {
  listeners.push(listener);
}

/** Runs every registered listener, waiting for all of them. One listener's
 * failure never stops the others (Promise.allSettled) - matches the
 * per-notifier error isolation the original inline `.catch()` calls had. */
export async function emitOrderCreated(order: OrderRecord): Promise<void> {
  const event: OrderCreatedEvent = { order };
  await Promise.allSettled(listeners.map((listener) => listener(event)));
}

import * as Sentry from "@sentry/node";
import { Pool, type PoolClient } from "pg";
import { config } from "./config";

export const pool = new Pool({ connectionString: config.databaseUrl });

pool.on("error", (err) => {
  // An idle client dying in the background (e.g. Postgres restarting) must
  // not crash the whole process via an unhandled 'error' event.
  Sentry.captureException(err);
  console.error("Unexpected error on idle Postgres client:", err);
});

// Separate pool, separate database, separate role (warehouse_reader) - a
// second Postgres instance conceptually, even though it happens to share a
// host on the VPS. `pool` above must never be able to touch the warehouse
// database and vice versa - see config.ts's warehouseDatabaseUrl comment.
// Undefined (not a Pool that immediately fails) when unset, so nothing that
// doesn't use reportingRepository.ts ever notices - see that file for the
// only consumer.
export const warehousePool = config.warehouseDatabaseUrl
  ? new Pool({ connectionString: config.warehouseDatabaseUrl })
  : undefined;

warehousePool?.on("error", (err) => {
  Sentry.captureException(err);
  console.error("Unexpected error on idle warehouse Postgres client:", err);
});

// A THIRD pool, same physical database as warehousePool but connecting as
// warehouse_cockpit_writer (UPDATE-only on cockpit_alert) rather than
// warehouse_reader - powers only the admin cockpit page's acknowledge/
// resolve actions (cockpitRepository.ts). Kept as its own Pool rather than
// widening warehousePool's role: a bug in the cockpit UI must not be able
// to write anything but that one table, structurally, not by convention -
// see config.ts's warehouseCockpitDatabaseUrl comment.
export const warehouseCockpitPool = config.warehouseCockpitDatabaseUrl
  ? new Pool({ connectionString: config.warehouseCockpitDatabaseUrl })
  : undefined;

warehouseCockpitPool?.on("error", (err) => {
  Sentry.captureException(err);
  console.error("Unexpected error on idle warehouse-cockpit Postgres client:", err);
});

/**
 * Runs `fn` inside one BEGIN/COMMIT transaction, ROLLBACK on any error -
 * the Postgres equivalent of the atomicity D1's `.batch([...])` gave
 * insertOrder for free.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** True if `err` is a Postgres unique-constraint violation (SQLSTATE 23505) -
 * e.g. two near-simultaneous registrations for the same phone/email racing
 * past an app-level "does this exist?" check. The UNIQUE index is the real
 * guard; this just turns the resulting DB error into a normal, expected
 * outcome for the caller to handle instead of an unhandled exception. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

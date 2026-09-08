import { Pool, type PoolClient } from "pg";
import { config } from "./config";

export const pool = new Pool({ connectionString: config.databaseUrl });

pool.on("error", (err) => {
  // An idle client dying in the background (e.g. Postgres restarting) must
  // not crash the whole process via an unhandled 'error' event.
  console.error("Unexpected error on idle Postgres client:", err);
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

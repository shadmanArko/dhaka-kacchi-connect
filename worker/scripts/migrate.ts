/**
 * Applies schema.sql. Run manually: `npm run db:migrate`. Never wired into
 * the container's CMD or a startup hook - schema.sql contains DROP TABLE,
 * which must never run automatically on a plain container restart.
 *
 * Refuses to run against a database that already has real orders in it
 * (see the guard below) - this used to be safe by convention alone
 * ("there's no production data yet"), which stopped being true the day
 * this app took its first real order. A genuine fresh-schema reset (local
 * dev, a throwaway DB) still works with zero friction; anything else
 * needs the explicit ALLOW_DESTRUCTIVE_MIGRATE=1 opt-in below.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { config } from "../src/config";

async function hasExistingOrders(client: Client): Promise<boolean> {
  try {
    const result = await client.query("SELECT count(*) FROM orders");
    return Number(result.rows[0].count) > 0;
  } catch {
    return false; // orders doesn't exist yet - a genuinely fresh database
  }
}

async function main() {
  const sql = readFileSync(join(__dirname, "..", "schema.sql"), "utf-8");
  const client = new Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
    if ((await hasExistingOrders(client)) && process.env.ALLOW_DESTRUCTIVE_MIGRATE !== "1") {
      throw new Error(
        "Refusing to run: this database already has real orders in it, and " +
          "schema.sql DROP TABLEs orders/customers/etc. before recreating them. " +
          "Schema changes now belong in migrations-manual/ (see that directory's " +
          "own README), applied by hand with psql - never through this script. " +
          "If you genuinely mean to wipe and recreate this exact database, rerun " +
          "with ALLOW_DESTRUCTIVE_MIGRATE=1.",
      );
    }
    console.log("Applying schema.sql...");
    await client.query(sql);
    console.log("Schema applied.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

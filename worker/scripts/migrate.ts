/**
 * Applies schema.sql. Run manually: `npm run db:migrate`. Never wired into
 * the container's CMD or a startup hook - schema.sql contains DROP TABLE,
 * which must never run automatically on a plain container restart.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { config } from "../src/config";

async function main() {
  const sql = readFileSync(join(__dirname, "..", "schema.sql"), "utf-8");
  const client = new Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
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

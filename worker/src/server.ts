import { serve } from "@hono/node-server";
import app from "./index";
import { config } from "./config";
import { pool } from "./db";

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Dhaka Kacchi API listening on http://localhost:${info.port}`);
  console.log(`OpenAPI docs at http://localhost:${info.port}/v1/doc`);
});

// Cloudflare Workers never needed this - every request got a fresh isolate.
// A long-lived Node process holding an open http.Server and a Postgres pool
// does: close both cleanly on shutdown so in-flight requests finish and
// connections aren't abandoned mid-transaction.
function shutdown(signal: NodeJS.Signals) {
  console.log(`${signal} received, shutting down...`);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

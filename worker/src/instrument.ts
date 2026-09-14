/**
 * Must be the very first import in server.ts, before anything else
 * (including @hono/node-server) - Sentry's Node SDK auto-instruments
 * modules (http, pg, ...) as they're require()'d, which only works if
 * Sentry.init() runs before those modules are first loaded anywhere in the
 * app.
 *
 * Deliberately not using @sentry/hono (an alpha package as of writing) or
 * @sentry/node's own honoIntegration/setupHonoErrorHandler (deprecated in
 * favor of that alpha package) - plain @sentry/node plus Hono's native
 * app.onError() (see index.ts) gets the same error capture without
 * depending on either.
 *
 * No tracesSampleRate is set - this is deliberately scoped to error
 * tracking (catch and alert on crashes/exceptions), not full APM/tracing.
 * Sentry's default integrations already include OnUncaughtException and
 * OnUnhandledRejection, which is what actually matters here: this is a
 * long-lived Node process (see server.ts's shutdown handling), so an
 * unhandled rejection anywhere crashes the whole process - previously
 * silent apart from whatever happened to be in the console output right
 * before it, now reported to Sentry before the process exits.
 */
import * as Sentry from "@sentry/node";
import { config } from "./config";

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.sentryEnvironment,
  });
}

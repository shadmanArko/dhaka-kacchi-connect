/**
 * The single accessor for process configuration.
 *
 * Mirrors the sibling warehouse Python project's fail-fast Settings/
 * ConfigError convention, translated to idiomatic TypeScript: nothing
 * outside this module reads `process.env` directly, validation happens
 * once at import time (not lazily at first request), and required vars
 * have no silent default.
 */
import "dotenv/config"; // no-op if there's no .env file; never overrides an already-set process.env var

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export type AppConfig = {
  readonly port: number;
  readonly databaseUrl: string;
  readonly allowedOrigins: readonly string[];
  readonly orderFromEmail: string;
  // The site's own public URL, used only to build the link inside a
  // password-reset email (e.g. `${publicSiteUrl}/reset-password?token=...`).
  // Defaults to the frontend's local dev origin so this never blocks local
  // testing; set it to the real domain in every deployed environment.
  readonly publicSiteUrl: string;
  readonly hostingerSmtpHost?: string;
  readonly hostingerSmtpPort?: number;
  readonly hostingerSmtpUser?: string;
  readonly hostingerSmtpPass?: string;
  // BerlinSMS's plain SMS API key - used only for the one-time OTP text at
  // registration (see berlinSms.ts). This app generates and checks the
  // code itself; BerlinSMS just delivers whatever text is handed to it.
  readonly berlinSmsApiKey?: string;
  readonly telegramBotToken?: string;
  readonly telegramChatId?: string;
  // Verifies an inbound Telegram webhook request actually came from Telegram
  // (sent back to us as the X-Telegram-Bot-Api-Secret-Token header on every
  // webhook POST, once set via scripts/setTelegramWebhook.ts) - see
  // telegram.ts. Optional like the other Telegram vars: unset means the
  // inbound webhook route is disabled, not that the server fails to start.
  readonly telegramWebhookSecret?: string;
  // Sentry error tracking - see src/instrument.ts. Optional like the other
  // integrations: unset means Sentry.init() never runs and the app behaves
  // exactly as it did before this was added.
  readonly sentryDsn?: string;
  // Tags every captured event so Sentry's dashboard can separate a local
  // dev exception from a real production one. Defaults to "development";
  // set to "production" in deploy/.env.
  readonly sentryEnvironment: string;
  // Read-only cross-repo connection into the sibling dhaka_kacchi_ai_harness
  // warehouse database (as the warehouse_reader role - never warehouse_app),
  // the mirror image of that repo's own ORDERING_DATABASE_URL/
  // ordering_reader. Powers the admin reporting page only - see
  // reportingRepository.ts. Optional like the other integrations above:
  // unset means the reporting routes answer 503, not that the app fails to
  // start - local dev doesn't need the warehouse database running just to
  // work on orders.
  readonly warehouseDatabaseUrl?: string;
  // A THIRD, narrower cross-repo connection into the same warehouse
  // database, as the warehouse_cockpit_writer role (SELECT+UPDATE-only on
  // cockpit_alert, never SELECT-everything like warehouse_reader above) -
  // powers ONLY the admin cockpit page's acknowledge/resolve actions (see
  // cockpitRepository.ts). Deliberately not reused from
  // warehouseDatabaseUrl: a bug in the cockpit UI must not be able to
  // write anything but that one table, even by accident.
  readonly warehouseCockpitDatabaseUrl?: string;
  // Base URL of the sibling dhaka_kacchi_ai_harness repo's internal-only
  // post-engagement predictor service (see that repo's predictor/ -
  // ml/00-problem-framing through ml/05-production for how the model was
  // built and chosen). Reached over the docker-compose network in
  // deploy/docker-compose.yml, e.g. http://predictor:8000 - never a public
  // URL. Optional like the other integrations above: unset means the
  // predictor admin route answers 503, not that the app fails to start.
  readonly predictorUrl?: string;
};

/** Reads a required var; throws ConfigError with an actionable message if unset. */
function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ConfigError(
      `${name} is required and has no default. Set it in the environment, or copy .env.example to .env.`,
    );
  }
  return value;
}

/** Reads an optional var; returns undefined (not empty string) if unset. */
function optional(env: NodeJS.ProcessEnv, name: string): string | undefined {
  return env[name]?.trim() || undefined;
}

/** Builds and validates an AppConfig from a given env map. Exported (and
 * pure) so it's independently testable without touching process.env. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const databaseUrl = required(env, "DATABASE_URL");

  const allowedOrigins = required(env, "ALLOWED_ORIGINS")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (allowedOrigins.length === 0) {
    throw new ConfigError("ALLOWED_ORIGINS must list at least one origin.");
  }

  const port = Number(env.PORT ?? 8787);
  if (!Number.isInteger(port) || port <= 0) {
    throw new ConfigError(`PORT must be a positive integer; got "${env.PORT}".`);
  }

  const smtpPortRaw = optional(env, "HOSTINGER_SMTP_PORT");

  return Object.freeze({
    port,
    databaseUrl,
    allowedOrigins,
    orderFromEmail: required(env, "ORDER_FROM_EMAIL"),
    publicSiteUrl: optional(env, "PUBLIC_SITE_URL") ?? "http://localhost:8080",
    hostingerSmtpHost: optional(env, "HOSTINGER_SMTP_HOST"),
    hostingerSmtpPort: smtpPortRaw ? Number(smtpPortRaw) : undefined,
    hostingerSmtpUser: optional(env, "HOSTINGER_SMTP_USER"),
    hostingerSmtpPass: optional(env, "HOSTINGER_SMTP_PASS"),
    berlinSmsApiKey: optional(env, "BERLIN_SMS_API_KEY"),
    telegramBotToken: optional(env, "TELEGRAM_BOT_TOKEN"),
    telegramChatId: optional(env, "TELEGRAM_CHAT_ID"),
    telegramWebhookSecret: optional(env, "TELEGRAM_WEBHOOK_SECRET"),
    sentryDsn: optional(env, "SENTRY_DSN"),
    sentryEnvironment: optional(env, "SENTRY_ENVIRONMENT") ?? "development",
    warehouseDatabaseUrl: optional(env, "WAREHOUSE_DATABASE_URL"),
    warehouseCockpitDatabaseUrl: optional(env, "WAREHOUSE_COCKPIT_DATABASE_URL"),
    predictorUrl: optional(env, "PREDICTOR_URL"),
  });
}

// This service has exactly one entrypoint (the HTTP server) - unlike the
// warehouse's several independent CLI scripts - so eager validation at
// import time is the right amount of fail-fast: a missing DATABASE_URL
// crashes startup before the port is ever bound, not on the first request.
export const config = loadConfig();

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
  readonly hostingerSmtpHost?: string;
  readonly hostingerSmtpPort?: number;
  readonly hostingerSmtpUser?: string;
  readonly hostingerSmtpPass?: string;
  readonly twilioAccountSid?: string;
  readonly twilioAuthToken?: string;
  readonly twilioWhatsappFrom?: string;
  readonly arkoWhatsappTo?: string;
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
    hostingerSmtpHost: optional(env, "HOSTINGER_SMTP_HOST"),
    hostingerSmtpPort: smtpPortRaw ? Number(smtpPortRaw) : undefined,
    hostingerSmtpUser: optional(env, "HOSTINGER_SMTP_USER"),
    hostingerSmtpPass: optional(env, "HOSTINGER_SMTP_PASS"),
    twilioAccountSid: optional(env, "TWILIO_ACCOUNT_SID"),
    twilioAuthToken: optional(env, "TWILIO_AUTH_TOKEN"),
    twilioWhatsappFrom: optional(env, "TWILIO_WHATSAPP_FROM"),
    arkoWhatsappTo: optional(env, "ARKO_WHATSAPP_TO"),
  });
}

// This service has exactly one entrypoint (the HTTP server) - unlike the
// warehouse's several independent CLI scripts - so eager validation at
// import time is the right amount of fail-fast: a missing DATABASE_URL
// crashes startup before the port is ever bound, not on the first request.
export const config = loadConfig();

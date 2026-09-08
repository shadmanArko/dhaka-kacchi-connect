export type Env = {
  DB: D1Database;

  // vars (wrangler.toml [vars], non-secret)
  ALLOWED_ORIGINS: string;
  ORDER_FROM_EMAIL: string;

  // secrets (wrangler secret put ...)
  HOSTINGER_SMTP_HOST?: string;
  HOSTINGER_SMTP_PORT?: string;
  HOSTINGER_SMTP_USER?: string;
  HOSTINGER_SMTP_PASS?: string;

  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_WHATSAPP_FROM?: string;
  ARKO_WHATSAPP_TO?: string;
};

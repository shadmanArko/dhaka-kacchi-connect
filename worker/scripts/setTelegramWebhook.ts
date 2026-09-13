// One-time (idempotent to re-run) registration of this app's Telegram
// webhook URL with Telegram's servers - Telegram doesn't know where to send
// updates until this has been run at least once. Re-running it (e.g. after
// rotating TELEGRAM_WEBHOOK_SECRET) simply overwrites the prior
// registration - see worker/CLAUDE.md for when to run this.
//
// Usage: npm run telegram:set-webhook
import { config } from "../src/config";

const WEBHOOK_URL = "https://api.dhakakacchi.com/telegram/webhook";

async function main() {
  if (!config.telegramBotToken || !config.telegramWebhookSecret) {
    console.error(
      "TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must both be set to register the webhook.",
    );
    process.exitCode = 1;
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: WEBHOOK_URL,
      secret_token: config.telegramWebhookSecret,
      // Only text messages matter to this app - no reason to have Telegram
      // deliver (and this app silently ignore) every other update type.
      allowed_updates: ["message"],
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("Failed to register the Telegram webhook:", res.status, body);
    process.exitCode = 1;
    return;
  }

  console.log(`Webhook registered at ${WEBHOOK_URL}:`, body);
  console.log("Verify any time with: GET https://api.telegram.org/bot<token>/getWebhookInfo");
}

main().catch((err) => {
  console.error("setTelegramWebhook failed:", err);
  process.exitCode = 1;
});

import { config } from "../config";

/**
 * Sends a plain SMS via BerlinSMS's general-purpose SMS API - used only for
 * the one-time OTP text at registration. Deliberately NOT BerlinSMS's
 * managed "2FA" product (a separate credential and API, which generates
 * and checks the code on their own servers): that product's message
 * wording isn't customizable, and this app wants full control over what
 * the text says. Deliberately NOT wired through orderEvents.ts like
 * email.ts/telegram.ts either: this isn't a reaction to an order, it's
 * called directly from the /v1/auth/register handler, which needs to know
 * synchronously whether the text actually went out.
 *
 * Falls back to logging the code to the console when BerlinSMS isn't
 * configured, rather than failing outright - this is what lets the whole
 * registration flow be tested locally without a real BerlinSMS API key
 * (see worker/CLAUDE.md).
 */
export async function sendOtpSms(phone: string, code: string): Promise<boolean> {
  if (!config.berlinSmsApiKey) {
    console.log(`[dev] BERLIN_SMS_API_KEY not configured - OTP code for ${phone}: ${code}`);
    return true;
  }

  const text = `Your Dhaka Kacchi verification code is ${code}. It expires in 10 minutes.`;
  // Both path segments must be individually URL-encoded, per BerlinSMS's
  // API shape: POST /send/sms/{phonenumber}/{text}.
  const url = `https://api.berlinsms.de/send/sms/${encodeURIComponent(phone)}/${encodeURIComponent(text)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { apiKey: config.berlinSmsApiKey },
  });

  if (!res.ok) {
    console.error("BerlinSMS send failed:", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}

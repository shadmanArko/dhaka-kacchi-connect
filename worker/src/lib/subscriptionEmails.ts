/**
 * The two emails of the newsletter sign-up: the double opt-in confirmation and
 * the welcome that follows it. Pure functions (no SMTP, no config) so they are
 * unit-testable and previewable. Each returns a plain-text and an HTML body -
 * sent together as multipart/alternative, which mail clients and spam filters
 * both expect.
 *
 * The HTML is deliberately conservative: nested tables, inline styles, system
 * fonts, one 220px image. That is what renders the same in Gmail, Apple Mail
 * and Outlook; anything fancier (flexbox, web fonts, background images) is
 * dropped by at least one of them. The header is a dark band so the gold logo
 * reads in light and dark mode alike.
 */

export type EmailLocale = "en" | "de";
export type SubscriptionEmailKind = "confirm" | "welcome";

export type SubscriptionEmailInput = {
  kind: SubscriptionEmailKind;
  locale: EmailLocale;
  /** Confirmation link (kind "confirm") or the order page (kind "welcome"). */
  actionUrl: string;
  /** Present on the welcome email: the one-click unsubscribe page. */
  unsubscribeUrl?: string;
  logoUrl: string;
  siteUrl: string;
  contactEmail: string;
};

const GOLD = "#c8a96e";
const INK = "#1f1d1e";

const COPY = {
  en: {
    confirm: {
      subject: "Please confirm your subscription — Dhaka Kacchi Berlin",
      preheader: "One click and you're on the list for the next batch.",
      heading: "One click to join the circle",
      body: [
        "Thanks for signing up for batch news from Dhaka Kacchi Berlin.",
        "Confirm your email address and you'll hear about every batch first — Eid specials, seasonal menus and the occasional quiet Sunday cookout.",
      ],
      button: "Confirm my subscription",
      fallback: "Button not working? Copy this link into your browser:",
      note: "The link is valid for 7 days. If you didn't sign up, simply ignore this email — you won't hear from us.",
    },
    welcome: {
      subject: "You're on the list — Dhaka Kacchi Berlin",
      preheader: "You'll hear about the next batch first.",
      heading: "You're in. Welcome!",
      body: [
        "You'll be the first to hear when the next Saturday batch opens for orders.",
        "We only write when there's something worth saying — never spam, and never more than a few emails a month.",
      ],
      button: "Order for Saturday",
      fallback: "",
      note: "",
    },
    footerReason: "You're receiving this because you subscribed on dhakakacchi.com.",
    unsubscribe: "Unsubscribe",
    address: "Dhaka Kacchi Berlin · Berlin, Germany",
    questions: "Questions? Just reply to this email.",
  },
  de: {
    confirm: {
      subject: "Bitte bestätigen Sie Ihre Anmeldung — Dhaka Kacchi Berlin",
      preheader: "Ein Klick, und Sie erfahren als Erste:r von der nächsten Charge.",
      heading: "Ein Klick, und Sie sind dabei",
      body: [
        "Danke für Ihre Anmeldung zu den Neuigkeiten von Dhaka Kacchi Berlin.",
        "Bestätigen Sie Ihre E-Mail-Adresse, dann erfahren Sie von jeder Charge zuerst — Eid-Spezialitäten, saisonale Menüs und gelegentliche ruhige Sonntags-Kochtermine.",
      ],
      button: "Anmeldung bestätigen",
      fallback: "Der Button funktioniert nicht? Kopieren Sie diesen Link in Ihren Browser:",
      note: "Der Link ist 7 Tage gültig. Falls Sie sich nicht angemeldet haben, ignorieren Sie diese E-Mail einfach — Sie hören dann nichts von uns.",
    },
    welcome: {
      subject: "Sie sind dabei — Dhaka Kacchi Berlin",
      preheader: "Sie erfahren als Erste:r von der nächsten Charge.",
      heading: "Willkommen, Sie sind dabei!",
      body: [
        "Sie erfahren als Erste:r, wenn die nächste Charge am Samstag zur Bestellung öffnet.",
        "Wir schreiben nur, wenn es etwas Lohnenswertes zu sagen gibt — kein Spam und höchstens ein paar E-Mails im Monat.",
      ],
      button: "Für Samstag bestellen",
      fallback: "",
      note: "",
    },
    footerReason: "Sie erhalten diese E-Mail, weil Sie sich auf dhakakacchi.com angemeldet haben.",
    unsubscribe: "Abmelden",
    address: "Dhaka Kacchi Berlin · Berlin, Deutschland",
    questions: "Fragen? Antworten Sie einfach auf diese E-Mail.",
  },
} as const;

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildSubscriptionEmail(input: SubscriptionEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const c = COPY[input.locale];
  const part = c[input.kind];

  const text = [
    part.heading,
    "",
    ...part.body.flatMap((p) => [p, ""]),
    `${part.button}: ${input.actionUrl}`,
    ...(part.note ? ["", part.note] : []),
    "",
    "—",
    c.address,
    ...(input.unsubscribeUrl ? [`${c.unsubscribe}: ${input.unsubscribeUrl}`] : []),
    ...(input.kind === "welcome" ? [c.footerReason] : []),
    c.questions,
  ].join("\n");

  const paragraphs = part.body
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#4a4540;">${esc(p)}</p>`,
    )
    .join("");

  const fallback = part.fallback
    ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#857d70;">${esc(part.fallback)}<br><a href="${esc(input.actionUrl)}" style="color:#9e711e;word-break:break-all;">${esc(input.actionUrl)}</a></p>`
    : "";
  const note = part.note
    ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#857d70;">${esc(part.note)}</p>`
    : "";
  const unsubscribe = input.unsubscribeUrl
    ? ` · <a href="${esc(input.unsubscribeUrl)}" style="color:#857d70;text-decoration:underline;">${esc(c.unsubscribe)}</a>`
    : "";
  const reason = input.kind === "welcome" ? `${esc(c.footerReason)}<br>` : "";

  const html = `<!doctype html>
<html lang="${input.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(part.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3eee4;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(part.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3eee4;">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#fffdf8;border-radius:4px;overflow:hidden;">
      <tr><td align="center" style="background:${INK};padding:30px 24px;">
        <a href="${esc(input.siteUrl)}"><img src="${esc(input.logoUrl)}" width="220" alt="Dhaka Kacchi Berlin" style="display:block;border:0;width:220px;max-width:100%;height:auto;"></a>
      </td></tr>
      <tr><td style="padding:38px 36px 34px;font-family:Georgia,'Times New Roman',serif;">
        <h1 style="margin:0 0 20px;font-size:26px;line-height:1.25;font-weight:normal;color:${INK};">${esc(part.heading)}</h1>
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
          ${paragraphs}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 0;"><tr>
            <td style="background:${GOLD};border-radius:2px;">
              <a href="${esc(input.actionUrl)}" style="display:inline-block;padding:15px 30px;font-size:14px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;color:${INK};">${esc(part.button)}</a>
            </td>
          </tr></table>
          ${fallback}${note}
        </div>
      </td></tr>
      <tr><td style="padding:22px 36px 28px;border-top:1px solid #ece5d6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.7;color:#857d70;">
        ${reason}${esc(c.address)}${unsubscribe}<br>${esc(c.questions)}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  return { subject: part.subject, text, html };
}

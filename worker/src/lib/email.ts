import * as Sentry from "@sentry/node";
import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config";
import { KITCHEN_LOCATION } from "../data";
import { onOrderCreated } from "./orderEvents";
import { totalCents, type OrderRecord } from "./orders";
import type { OrdersRepository } from "./ordersRepository";

function fulfillmentLine(order: OrderRecord): string {
  if (order.fulfillmentType === "pickup") {
    return `Pickup: Saturday ${order.deliveryDate} at ${KITCHEN_LOCATION.label}`;
  }
  const a = order.address!;
  return (
    `Delivery: Saturday ${order.deliveryDate} to ${a.street} ${a.houseNumber}, ` +
    `${a.postalCode} ${a.city} (+€${(order.deliveryFeeCents / 100).toFixed(2)} delivery)`
  );
}

let transporter: Transporter | undefined;

/** Lazily creates and reuses one SMTP connection for the process's life -
 * Cloudflare Workers couldn't do this (every request was a fresh isolate),
 * so the old code opened a fresh connection per order; a long-lived Node
 * process can and should reuse one. */
function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: config.hostingerSmtpHost,
    port: config.hostingerSmtpPort ?? 465,
    secure: (config.hostingerSmtpPort ?? 465) === 465,
    auth: { user: config.hostingerSmtpUser, pass: config.hostingerSmtpPass },
  });
  return transporter;
}

/**
 * Sends the customer's order confirmation via the Hostinger business mailbox
 * over standard SMTP. Returns false without throwing if SMTP secrets aren't
 * configured yet, so order creation never fails on this.
 */
export async function sendConfirmationEmail(order: OrderRecord): Promise<boolean> {
  if (!config.hostingerSmtpHost || !config.hostingerSmtpUser || !config.hostingerSmtpPass) {
    console.warn("Email not sent: HOSTINGER_SMTP_* is not configured.");
    return false;
  }

  const itemLines = order.items
    .map((i) => `  - ${i.quantity}x ${i.name} (€${(i.unitPriceCents / 100).toFixed(2)} each)`)
    .join("\n");

  await getTransporter().sendMail({
    from: `"Dhaka Kacchi Berlin" <${config.orderFromEmail}>`,
    to: `"${order.customerName}" <${order.customerEmail}>`,
    subject: `Order confirmed — Saturday ${order.deliveryDate} — Dhaka Kacchi Berlin`,
    text: [
      `Hi ${order.customerName},`,
      "",
      "Your order is confirmed:",
      itemLines,
      "",
      `Total: €${(totalCents(order) / 100).toFixed(2)} (cash on delivery)`,
      fulfillmentLine(order),
      "",
      // The confirmation screen shows this reference; without it here, a
      // customer who closes the tab has nothing to quote back to us.
      `Order reference: ${order.id}`,
      "",
      "See you then!",
      "Dhaka Kacchi Berlin",
    ].join("\n"),
  });

  return true;
}

/**
 * Sends a "forgot password" reset link. Unlike sendConfirmationEmail, this
 * isn't best-effort - a customer resetting a password genuinely needs this
 * to arrive - so when SMTP isn't configured, it logs the link to the
 * console and reports success instead of silently failing, matching
 * sms.ts's identical local-dev fallback for OTP codes (see worker/CLAUDE.md).
 */
export async function sendPasswordResetEmail(
  email: string,
  name: string,
  resetUrl: string,
): Promise<boolean> {
  if (!config.hostingerSmtpHost || !config.hostingerSmtpUser || !config.hostingerSmtpPass) {
    console.log(
      `[dev] HOSTINGER_SMTP_* not configured - password reset link for ${email}: ${resetUrl}`,
    );
    return true;
  }

  await getTransporter().sendMail({
    from: `"Dhaka Kacchi Berlin" <${config.orderFromEmail}>`,
    to: `"${name}" <${email}>`,
    subject: "Reset your password — Dhaka Kacchi Berlin",
    text: [
      `Hi ${name},`,
      "",
      "We received a request to reset your password. Click the link below to set a new one:",
      resetUrl,
      "",
      "This link expires in 60 minutes. If you didn't request this, you can ignore this email.",
      "",
      "Dhaka Kacchi Berlin",
    ].join("\n"),
  });

  return true;
}

/**
 * Sent when staff apply a discount via the admin panel - sendConfirmationEmail
 * already went out once, synchronously, at order creation, with no re-notify
 * mechanism, so a discount applied afterwards (the whole point of that admin
 * feature) would otherwise leave the customer holding a confirmation email
 * with a stale, pre-discount total forever. Best-effort like
 * sendConfirmationEmail, not sendPasswordResetEmail - a customer not
 * learning about a discount is a missed nicety, not something they're
 * blocked on. Called directly from the admin discount-update handler, not
 * routed through orderEvents.ts (only one caller will ever trigger this).
 */
export async function sendDiscountAppliedEmail(order: OrderRecord): Promise<boolean> {
  if (!config.hostingerSmtpHost || !config.hostingerSmtpUser || !config.hostingerSmtpPass) {
    console.warn("Discount email not sent: HOSTINGER_SMTP_* is not configured.");
    return false;
  }

  await getTransporter().sendMail({
    from: `"Dhaka Kacchi Berlin" <${config.orderFromEmail}>`,
    to: `"${order.customerName}" <${order.customerEmail}>`,
    subject: `Your order total was updated — Dhaka Kacchi Berlin`,
    text: [
      `Hi ${order.customerName},`,
      "",
      `We've applied a discount of €${(order.discountCents / 100).toFixed(2)} to your order` +
        (order.discountReason ? ` (${order.discountReason})` : "") +
        ".",
      "",
      `New total: €${(totalCents(order) / 100).toFixed(2)} (cash on delivery)`,
      fulfillmentLine(order),
      "",
      "Dhaka Kacchi Berlin",
    ].join("\n"),
  });

  return true;
}

/** Wires email sending into the order-created event stream and records the
 * outcome on the order itself. Call once at startup. */
export function registerEmailNotifications(repository: OrdersRepository): void {
  onOrderCreated(async ({ order }) => {
    const sent = await sendConfirmationEmail(order).catch((err) => {
      Sentry.captureException(err);
      console.error("sendConfirmationEmail failed:", err);
      return false;
    });
    await repository.markEmailSent(order.id, sent);
  });
}

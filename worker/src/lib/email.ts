import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config";
import { KITCHEN_LOCATION } from "../data";
import { onOrderCreated } from "./orderEvents";
import type { OrderRecord } from "./orders";
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
      `Total: €${((order.subtotalCents + order.deliveryFeeCents) / 100).toFixed(2)} (cash on delivery)`,
      fulfillmentLine(order),
      "",
      "See you then!",
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
      console.error("sendConfirmationEmail failed:", err);
      return false;
    });
    await repository.markEmailSent(order.id, sent);
  });
}

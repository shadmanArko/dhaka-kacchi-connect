import { WorkerMailer } from "worker-mailer";
import type { Env } from "../types";
import { KITCHEN_LOCATION } from "../data";
import type { OrderRecord } from "./orders";

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

/**
 * Sends the customer's order confirmation via the Hostinger business mailbox
 * (SMTP, over Cloudflare's TCP sockets). Returns false without throwing if
 * SMTP secrets aren't configured yet, so order creation never fails on this.
 */
export async function sendConfirmationEmail(env: Env, order: OrderRecord): Promise<boolean> {
  if (!env.HOSTINGER_SMTP_HOST || !env.HOSTINGER_SMTP_USER || !env.HOSTINGER_SMTP_PASS) {
    console.warn("Email not sent: HOSTINGER_SMTP_* secrets are not configured.");
    return false;
  }

  const mailer = await WorkerMailer.connect({
    credentials: {
      username: env.HOSTINGER_SMTP_USER,
      password: env.HOSTINGER_SMTP_PASS,
    },
    host: env.HOSTINGER_SMTP_HOST,
    port: Number(env.HOSTINGER_SMTP_PORT ?? 465),
    secure: true,
  });

  const itemLines = order.items
    .map((i) => `  - ${i.quantity}x ${i.name} (€${(i.unitPriceCents / 100).toFixed(2)} each)`)
    .join("\n");

  await mailer.send({
    from: { name: "Dhaka Kacchi Berlin", email: env.ORDER_FROM_EMAIL },
    to: { email: order.customerEmail, name: order.customerName },
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

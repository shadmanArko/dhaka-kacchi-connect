import type { Env } from "../types";
import { KITCHEN_LOCATION } from "../data";
import type { OrderRecord } from "./orders";

function fulfillmentLine(order: OrderRecord): string {
  if (order.fulfillmentType === "pickup") {
    return `Pickup: Sat ${order.deliveryDate} @ ${KITCHEN_LOCATION.label}`;
  }
  const a = order.address!;
  return (
    `Delivery: Sat ${order.deliveryDate} to ${a.street} ${a.houseNumber}, ` +
    `${a.postalCode} ${a.city} (${order.distanceKm?.toFixed(1)}km, ` +
    `+€${(order.deliveryFeeCents / 100).toFixed(2)})`
  );
}

/**
 * Alerts Arko via WhatsApp (Twilio API) that a new order came in. Returns
 * false without throwing if Twilio secrets aren't configured yet, so order
 * creation never fails on this.
 */
export async function sendWhatsAppAlert(env: Env, order: OrderRecord): Promise<boolean> {
  if (
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_AUTH_TOKEN ||
    !env.TWILIO_WHATSAPP_FROM ||
    !env.ARKO_WHATSAPP_TO
  ) {
    console.warn("WhatsApp alert not sent: TWILIO_* secrets are not configured.");
    return false;
  }

  const itemSummary = order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ");
  const body =
    `New order #${order.id}\n` +
    `${itemSummary}\n` +
    `Total: €${((order.subtotalCents + order.deliveryFeeCents) / 100).toFixed(2)} (cash on delivery)\n` +
    `${fulfillmentLine(order)}\n` +
    `Customer: ${order.customerName}, ${order.customerPhone}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const form = new URLSearchParams({
    From: `whatsapp:${env.TWILIO_WHATSAPP_FROM}`,
    To: `whatsapp:${env.ARKO_WHATSAPP_TO}`,
    Body: body,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  if (!res.ok) {
    console.error("Twilio WhatsApp send failed:", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}

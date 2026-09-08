import { config } from "../config";
import { KITCHEN_LOCATION } from "../data";
import { onOrderCreated } from "./orderEvents";
import type { OrderRecord } from "./orders";
import type { OrdersRepository } from "./ordersRepository";

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
 * creation never fails on this. `fetch`/`URLSearchParams`/`btoa` are all
 * Node globals - no change needed from the Workers version here.
 */
export async function sendWhatsAppAlert(order: OrderRecord): Promise<boolean> {
  if (
    !config.twilioAccountSid ||
    !config.twilioAuthToken ||
    !config.twilioWhatsappFrom ||
    !config.arkoWhatsappTo
  ) {
    console.warn("WhatsApp alert not sent: TWILIO_* is not configured.");
    return false;
  }

  const itemSummary = order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ");
  const body =
    `New order #${order.id}\n` +
    `${itemSummary}\n` +
    `Total: €${((order.subtotalCents + order.deliveryFeeCents) / 100).toFixed(2)} (cash on delivery)\n` +
    `${fulfillmentLine(order)}\n` +
    `Customer: ${order.customerName}, ${order.customerPhone}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`;
  const form = new URLSearchParams({
    From: `whatsapp:${config.twilioWhatsappFrom}`,
    To: `whatsapp:${config.arkoWhatsappTo}`,
    Body: body,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${config.twilioAccountSid}:${config.twilioAuthToken}`)}`,
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

/** Wires the WhatsApp alert into the order-created event stream and records
 * the outcome on the order itself. Call once at startup. */
export function registerWhatsAppNotifications(repository: OrdersRepository): void {
  onOrderCreated(async ({ order }) => {
    const sent = await sendWhatsAppAlert(order).catch((err) => {
      console.error("sendWhatsAppAlert failed:", err);
      return false;
    });
    await repository.markWhatsappSent(order.id, sent);
  });
}

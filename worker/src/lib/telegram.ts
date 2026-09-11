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
 * Sends one plain-text message to the owner's Telegram chat. Low-level
 * primitive reused by both the per-order alert below and the standalone
 * weekly digest script (scripts/weeklyDigest.ts) - completely free (no
 * per-message cost, unlike the Twilio WhatsApp alert this replaces).
 * Returns false without throwing if unconfigured, matching email.ts's
 * "never fail order creation over a notification" rule.
 */
export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!config.telegramBotToken || !config.telegramChatId) {
    console.warn("Telegram message not sent: TELEGRAM_* is not configured.");
    return false;
  }

  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: config.telegramChatId, text }),
  });

  if (!res.ok) {
    console.error("Telegram send failed:", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}

/** Formats and sends the instant "a new order came in" alert. */
export function sendTelegramOrderAlert(order: OrderRecord): Promise<boolean> {
  const itemSummary = order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ");
  const text =
    `New order #${order.id}\n` +
    `${itemSummary}\n` +
    `Total: €${((order.subtotalCents + order.deliveryFeeCents) / 100).toFixed(2)} (cash on delivery)\n` +
    `${fulfillmentLine(order)}\n` +
    `Customer: ${order.customerName}, ${order.customerPhone}`;
  return sendTelegramMessage(text);
}

/** Wires the Telegram alert into the order-created event stream and records
 * the outcome on the order itself. Call once at startup. */
export function registerTelegramNotifications(repository: OrdersRepository): void {
  onOrderCreated(async ({ order }) => {
    const sent = await sendTelegramOrderAlert(order).catch((err) => {
      console.error("sendTelegramOrderAlert failed:", err);
      return false;
    });
    await repository.markTelegramSent(order.id, sent);
  });
}

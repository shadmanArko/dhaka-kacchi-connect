/**
 * Sends one Telegram message listing everyone ordering for the upcoming
 * Saturday. Run manually via `npm run digest:weekly`, or by an OS-level
 * cron job on the VPS at Friday 18:00 Europe/Berlin (the same moment the
 * order cutoff for that Saturday closes) - see worker/CLAUDE.md for the
 * exact cron line. Not an HTTP endpoint and not an orderEvents listener:
 * this is a time-based job, not a reaction to anything - see
 * ARCHITECTURE.md for why that rules out both.
 */
import { pool } from "../src/db";
import { nextSaturday } from "../src/lib/dates";
import type { OrderRecord } from "../src/lib/orders";
import { createPostgresOrdersRepository } from "../src/lib/ordersRepository";
import { sendTelegramMessage } from "../src/lib/telegram";

function formatOrderLine(order: OrderRecord): string {
  const itemSummary = order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ");
  const fulfillment =
    order.fulfillmentType === "pickup"
      ? "pickup"
      : `delivery to ${order.address?.street} ${order.address?.houseNumber}, ${order.address?.postalCode} ${order.address?.city}`;
  return `- ${order.customerName} (${order.customerPhone}) — ${itemSummary} — ${fulfillment}`;
}

async function main() {
  const ordersRepository = createPostgresOrdersRepository(pool);
  const saturday = nextSaturday(new Date());
  const orders = await ordersRepository.listOrdersForDeliveryDate(saturday);

  if (orders.length === 0) {
    await sendTelegramMessage(`No orders yet for Saturday ${saturday}.`);
    console.log(`No orders for ${saturday} - sent the empty-week message.`);
    return;
  }

  const lines = orders.map(formatOrderLine);
  const text = [`${orders.length} order(s) for Saturday ${saturday}:`, ...lines].join("\n");

  const sent = await sendTelegramMessage(text);
  if (!sent) {
    console.error("Failed to send the weekly digest to Telegram.");
    process.exitCode = 1;
    return;
  }
  console.log(`Sent the weekly digest for ${saturday} (${orders.length} order(s)).`);
}

main()
  .catch((err) => {
    console.error("Weekly digest failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { config } from "../config";
import { KITCHEN_LOCATION } from "../data";
import { todayIsoDate } from "./dates";
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

/** Low-level fetch wrapper shared by every Telegram Bot API call this app
 * makes - sendMessage today - so the URL-building/JSON-body boilerplate and
 * any future auth changes only ever need updating in one place. */
async function callTelegramApi(method: string, body: object): Promise<Response> {
  const url = `https://api.telegram.org/bot${config.telegramBotToken}/${method}`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

  const res = await callTelegramApi("sendMessage", { chat_id: config.telegramChatId, text });

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

// --- Inbound webhook: "send the bot any message, get the upcoming orders" --

/** Constant-time comparison for the webhook secret - a plain `===` would leak
 * timing information about how many leading bytes matched. `timingSafeEqual`
 * throws on a length mismatch rather than returning false, so the length
 * check must come first. */
export function secureCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

// Permissive on purpose - Telegram sends many update shapes (edited_message,
// channel_post, callback_query, non-text messages...) and every one of them
// other than "a text message" is simply ignored below, never an error.
const TelegramUpdateSchema = z.object({
  update_id: z.number(),
  message: z
    .object({
      chat: z.object({ id: z.number() }),
      text: z.string().optional(),
    })
    .optional(),
});
type TelegramUpdate = z.infer<typeof TelegramUpdateSchema>;

// Telegram update_ids are monotonically increasing per bot - tracking the
// highest one we've actually processed makes a redelivered/retried webhook
// a no-op instead of a duplicate reply. In-memory is enough: retries happen
// close in time to the original delivery, never after a process restart.
let lastProcessedUpdateId = 0;

function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").trim();
}

function shortFulfillment(order: OrderRecord): string {
  if (order.fulfillmentType === "pickup") return "pickup";
  const a = order.address!;
  return `delivery to ${a.street} ${a.houseNumber}, ${a.postalCode} ${a.city}`;
}

function formatUpcomingOrderLine(order: OrderRecord): string {
  const itemSummary = order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ");
  const noteSuffix = order.notes ? ` [note: ${oneLine(order.notes)}]` : "";
  return (
    `- ${oneLine(order.customerName)} (${order.customerPhone}) — ` +
    `${itemSummary} — ${shortFulfillment(order)}${noteSuffix}`
  );
}

// Telegram's hard cap is 4096 UTF-16 code units per message; this leaves
// margin for the header/blank-line blocks added around each chunk.
const MAX_CHUNK_CHARS = 3500;

/** Packs a list of text blocks (already-formatted lines, one block per
 * logical line) into as few chunks as possible without ever exceeding
 * `maxChars` - flushing at a block boundary whenever convenient, but never
 * relying on any block being short: a single pathologically long block (an
 * unusually long order note, say) is hard-sliced rather than silently
 * dropped, since a Telegram sendMessage call would otherwise just fail. */
function chunkBlocks(blocks: string[], maxChars: number): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  const currentText = () => current.join("\n");

  for (const block of blocks) {
    if (block.length > maxChars) {
      if (current.length > 0) {
        chunks.push(currentText());
        current = [];
      }
      for (let i = 0; i < block.length; i += maxChars) {
        chunks.push(block.slice(i, i + maxChars));
      }
      continue;
    }

    const candidate = current.length > 0 ? `${currentText()}\n${block}` : block;
    if (candidate.length > maxChars) {
      chunks.push(currentText());
      current = [block];
    } else {
      current.push(block);
    }
  }
  if (current.length > 0) {
    chunks.push(currentText());
  }

  return chunks;
}

/** Builds the reply text(s) for every non-cancelled order from `fromDate`
 * forward, grouped by delivery date. Plain text only, deliberately never
 * Telegram's MarkdownV2/HTML parse_mode - escaping arbitrary customer-typed
 * text (names, addresses, notes) for MarkdownV2 is easy to get wrong in a
 * way that breaks the entire message, which isn't worth the risk for an
 * internal report. Returns one or more chunks, each under Telegram's
 * per-message length limit - never empty (a "no orders" reply is itself one
 * chunk, since Telegram rejects an empty sendMessage body). */
export function buildUpcomingOrdersMessages(orders: OrderRecord[], fromDate: string): string[] {
  if (orders.length === 0) {
    return ["No upcoming orders."];
  }

  const blocks: string[] = [`${orders.length} upcoming order(s) from ${fromDate}:`, ""];
  let currentDate: string | null = null;
  for (const order of orders) {
    if (order.deliveryDate !== currentDate) {
      currentDate = order.deliveryDate;
      blocks.push(`Saturday ${currentDate}:`);
    }
    blocks.push(formatUpcomingOrderLine(order));
  }

  return chunkBlocks(blocks, MAX_CHUNK_CHARS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Telegram allows roughly 1 message/second per chat; a multi-chunk reply
// waits this long between sends rather than risking a 429.
const CHUNK_SEND_DELAY_MS = 1100;

async function sendOneChunkWithRetry(text: string): Promise<boolean> {
  const res = await callTelegramApi("sendMessage", { chat_id: config.telegramChatId, text });
  if (res.ok) return true;

  if (res.status === 429) {
    const body = (await res.json().catch(() => null)) as {
      parameters?: { retry_after?: number };
    } | null;
    const retryAfterSeconds = body?.parameters?.retry_after ?? 2;
    console.warn(`Telegram rate limit hit, retrying in ${retryAfterSeconds}s`);
    await sleep(retryAfterSeconds * 1000);

    const retryRes = await callTelegramApi("sendMessage", { chat_id: config.telegramChatId, text });
    if (retryRes.ok) return true;
    console.error(
      "Telegram send failed after retry:",
      retryRes.status,
      await retryRes.text().catch(() => ""),
    );
    return false;
  }

  console.error("Telegram send failed:", res.status, await res.text().catch(() => ""));
  return false;
}

/** Sends every chunk in order, spaced out to respect Telegram's rate limit.
 * Used only by the upcoming-orders reply (a single sendTelegramMessage call
 * is enough everywhere else). A failed chunk is logged, never thrown - this
 * always runs as unawaited background work (see index.ts), so there's
 * nothing left to propagate a throw to. */
export async function sendTelegramMessagesSequentially(chunks: string[]): Promise<void> {
  if (!config.telegramBotToken || !config.telegramChatId) {
    console.warn("Telegram messages not sent: TELEGRAM_* is not configured.");
    return;
  }
  for (let i = 0; i < chunks.length; i++) {
    await sendOneChunkWithRetry(chunks[i]);
    if (i < chunks.length - 1) {
      await sleep(CHUNK_SEND_DELAY_MS);
    }
  }
}

async function handleTelegramUpdate(
  update: TelegramUpdate,
  repository: OrdersRepository,
): Promise<void> {
  if (update.update_id <= lastProcessedUpdateId) return; // already handled - a Telegram retry
  lastProcessedUpdateId = update.update_id;

  const message = update.message;
  if (!message || typeof message.text !== "string") return; // not a text message - ignore

  // Not the owner's own chat - silently ignore (still nothing to reply to,
  // whether that's a stranger who found the bot or Telegram delivering some
  // other update type we don't care about).
  if (String(message.chat.id) !== config.telegramChatId) return;

  const fromDate = todayIsoDate(new Date());
  const orders = await repository.listOrdersFromDate(fromDate);
  const chunks = buildUpcomingOrdersMessages(orders, fromDate);
  await sendTelegramMessagesSequentially(chunks);
}

/** Entry point for the webhook route in index.ts - parses the raw body
 * defensively (silently ignoring anything that isn't a recognizable Telegram
 * update) and hands a validated update to handleTelegramUpdate. Kept as one
 * function so index.ts's route handler never touches Telegram's payload
 * shape directly. */
export async function handleTelegramWebhookBody(
  body: unknown,
  repository: OrdersRepository,
): Promise<void> {
  const parsed = TelegramUpdateSchema.safeParse(body);
  if (!parsed.success) return;
  await handleTelegramUpdate(parsed.data, repository);
}

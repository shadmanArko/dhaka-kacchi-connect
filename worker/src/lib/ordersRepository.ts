import type { Pool } from "pg";
import { withTransaction } from "../db";
import type { OrderRecord } from "./orders";

/**
 * Everything a route handler needs to persist an order - and nothing about
 * HOW (Postgres, a fake, a future different database). Route handlers
 * depend on this interface, never on `pg`/`Pool` directly: the database can
 * be swapped or faked (e.g. an in-memory version for a future test suite)
 * without touching a single route.
 *
 * markEmailSent/markWhatsappSent are separate methods, not one combined
 * markNotificationsSent(orderId, {emailSent, whatsappSent}) - each
 * notification listener (email.ts, whatsapp.ts) now owns recording its own
 * outcome independently, so adding a third listener never means widening
 * this interface.
 */
export interface OrdersRepository {
  insertOrder(order: OrderRecord): Promise<void>;
  markEmailSent(orderId: string, sent: boolean): Promise<void>;
  markWhatsappSent(orderId: string, sent: boolean): Promise<void>;
}

async function insertOrder(pool: Pool, order: OrderRecord): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO orders
        (id, created_at, delivery_date, fulfillment_type,
         address_street, address_house_number, address_postal_code, address_city,
         address_lat, address_lng, distance_km, delivery_fee_cents,
         customer_name, customer_email, customer_phone, notes, subtotal_cents)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        order.id,
        order.createdAt,
        order.deliveryDate,
        order.fulfillmentType,
        order.address?.street ?? null,
        order.address?.houseNumber ?? null,
        order.address?.postalCode ?? null,
        order.address?.city ?? null,
        order.addressLat,
        order.addressLng,
        order.distanceKm,
        order.deliveryFeeCents,
        order.customerName,
        order.customerEmail,
        order.customerPhone,
        order.notes,
        order.subtotalCents,
      ],
    );

    for (const item of order.items) {
      await client.query(
        `INSERT INTO order_items (order_id, sku, name, unit_price_cents, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.sku, item.name, item.unitPriceCents, item.quantity],
      );
    }
  });
}

/** Creates the real, Postgres-backed OrdersRepository. The only place in the
 * app that imports `pg` types directly for writes - everywhere else depends
 * on the OrdersRepository interface above. */
export function createPostgresOrdersRepository(pool: Pool): OrdersRepository {
  return {
    insertOrder: (order) => insertOrder(pool, order),
    markEmailSent: (orderId, sent) =>
      pool.query("UPDATE orders SET email_sent = $1, updated_at = now() WHERE id = $2", [sent, orderId]).then(() => undefined),
    markWhatsappSent: (orderId, sent) =>
      pool.query("UPDATE orders SET whatsapp_sent = $1, updated_at = now() WHERE id = $2", [sent, orderId]).then(() => undefined),
  };
}

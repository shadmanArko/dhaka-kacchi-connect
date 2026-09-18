import type { Pool } from "pg";
import { withTransaction } from "../db";
import type { DeliveryAddressFields, OrderRecord, OrderStatus } from "./orders";

/**
 * Everything a route handler needs to persist/read orders - and nothing
 * about HOW (Postgres, a fake, a future different database). Route handlers
 * depend on this interface, never on `pg`/`Pool` directly: the database can
 * be swapped or faked (e.g. an in-memory version for a future test suite)
 * without touching a single route.
 *
 * markEmailSent/markTelegramSent are separate methods, not one combined
 * markNotificationsSent(orderId, {emailSent, telegramSent}) - each
 * notification listener (email.ts, telegram.ts) now owns recording its own
 * outcome independently, so adding a third listener never means widening
 * this interface.
 */
export interface OrdersRepository {
  insertOrder(order: OrderRecord): Promise<void>;
  markEmailSent(orderId: string, sent: boolean): Promise<void>;
  markTelegramSent(orderId: string, sent: boolean): Promise<void>;
  /** Every order for a given Saturday, items included - used only by the
   * standalone weekly digest script (scripts/weeklyDigest.ts). */
  listOrdersForDeliveryDate(deliveryDate: string): Promise<OrderRecord[]>;
  /** Every non-cancelled order with a delivery date on or after `fromDate`
   * ("YYYY-MM-DD"), items included, ordered by date then creation time - used
   * by the Telegram "upcoming orders" webhook (telegram.ts). */
  listOrdersFromDate(fromDate: string): Promise<OrderRecord[]>;
  /** A customer's own order history, newest first, items included. Cancelled
   * orders are INCLUDED on purpose - a customer needs to be able to see that
   * an order was cancelled, which is the opposite of what listOrdersFromDate
   * wants for the Telegram digest. Unbounded: at one batch a week this is a
   * handful of rows per customer, so there is no pagination here yet. */
  listByCustomerId(customerId: string): Promise<OrderRecord[]>;
  /** Admin panel only, below this line. */
  /** NOTE: takes only an id and performs NO ownership check. Any
   * customer-facing caller MUST compare the returned order's customerId
   * against the session's own customer id before handing it back. */
  findById(id: string): Promise<OrderRecord | null>;
  /** Every filter is optional and ANDed together - the admin dashboard's
   * search/filter. `search` matches customer name or phone. */
  listAll(filters?: {
    deliveryDate?: string;
    status?: OrderStatus;
    search?: string;
  }): Promise<OrderRecord[]>;
  /** Replaces (never accumulates) the order's current discount - see
   * orders.ts's OrderRecord comment. Pass discountCents: 0 to clear one. */
  applyDiscount(
    orderId: string,
    discount: { discountCents: number; discountReason: string | null },
  ): Promise<void>;
  updateStatus(orderId: string, status: OrderStatus): Promise<void>;
  /** Replaces an order's items and delivery details wholesale (staff
   * correcting a mistake) - subtotalCents/deliveryFeeCents/address* must
   * already be server-recomputed by the caller (see priceOrder/
   * quoteDeliveryForAddress in index.ts), this never re-derives them.
   * discount_cents is untouched - a pre-existing discount survives an item
   * edit rather than silently resetting to zero. */
  updateOrder(
    orderId: string,
    patch: {
      deliveryDate: string;
      fulfillmentType: "pickup" | "delivery";
      address: DeliveryAddressFields | null;
      addressLat: number | null;
      addressLng: number | null;
      distanceKm: number | null;
      deliveryFeeCents: number;
      subtotalCents: number;
      items: OrderRecord["items"];
    },
  ): Promise<void>;
}

type OrderRow = {
  id: string;
  created_at: string;
  delivery_date: string;
  fulfillment_type: "pickup" | "delivery";
  address_street: string | null;
  address_house_number: string | null;
  address_postal_code: string | null;
  address_city: string | null;
  address_lat: number | null;
  address_lng: number | null;
  distance_km: number | null;
  delivery_fee_cents: number;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  notes: string | null;
  subtotal_cents: number;
  status: OrderStatus;
  discount_cents: number;
  discount_reason: string | null;
  discounted_at: string | null;
  created_by: "customer" | "staff";
};

type OrderItemRow = {
  order_id: string;
  sku: string;
  name: string;
  unit_price_cents: number;
  quantity: number;
};

function rowToOrder(row: OrderRow, items: OrderRecord["items"]): OrderRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    fulfillmentType: row.fulfillment_type,
    deliveryDate: row.delivery_date,
    address:
      row.address_street && row.address_house_number && row.address_postal_code && row.address_city
        ? {
            street: row.address_street,
            houseNumber: row.address_house_number,
            postalCode: row.address_postal_code,
            city: row.address_city,
          }
        : null,
    addressLat: row.address_lat,
    addressLng: row.address_lng,
    distanceKm: row.distance_km,
    deliveryFeeCents: row.delivery_fee_cents,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    notes: row.notes,
    subtotalCents: row.subtotal_cents,
    items,
    status: row.status,
    discountCents: row.discount_cents,
    discountReason: row.discount_reason,
    discountedAt: row.discounted_at,
    createdBy: row.created_by,
  };
}

async function insertOrder(pool: Pool, order: OrderRecord): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO orders
        (id, created_at, delivery_date, fulfillment_type,
         address_street, address_house_number, address_postal_code, address_city,
         address_lat, address_lng, distance_km, delivery_fee_cents,
         customer_id, customer_name, customer_email, customer_phone, notes, subtotal_cents,
         status, discount_cents, discount_reason, discounted_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
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
        order.customerId,
        order.customerName,
        order.customerEmail,
        order.customerPhone,
        order.notes,
        order.subtotalCents,
        order.status,
        order.discountCents,
        order.discountReason,
        order.discountedAt,
        order.createdBy,
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

/** Fetches order_items for a set of order rows and joins them on, grouped by
 * order id - shared by every "list orders" method below so the join logic
 * exists exactly once. */
async function attachItems(pool: Pool, orderRows: OrderRow[]): Promise<OrderRecord[]> {
  if (orderRows.length === 0) return [];

  const orderIds = orderRows.map((row) => row.id);
  const itemsResult = await pool.query<OrderItemRow>(
    "SELECT * FROM order_items WHERE order_id = ANY($1) ORDER BY order_id, id",
    [orderIds],
  );

  const itemsByOrderId = new Map<string, OrderRecord["items"]>();
  for (const item of itemsResult.rows) {
    const list = itemsByOrderId.get(item.order_id) ?? [];
    list.push({
      sku: item.sku,
      name: item.name,
      unitPriceCents: item.unit_price_cents,
      quantity: item.quantity,
    });
    itemsByOrderId.set(item.order_id, list);
  }

  return orderRows.map((row) => rowToOrder(row, itemsByOrderId.get(row.id) ?? []));
}

async function listOrdersForDeliveryDate(pool: Pool, deliveryDate: string): Promise<OrderRecord[]> {
  const ordersResult = await pool.query<OrderRow>(
    "SELECT * FROM orders WHERE delivery_date = $1 ORDER BY created_at",
    [deliveryDate],
  );
  return attachItems(pool, ordersResult.rows);
}

async function listOrdersFromDate(pool: Pool, fromDate: string): Promise<OrderRecord[]> {
  const ordersResult = await pool.query<OrderRow>(
    "SELECT * FROM orders WHERE delivery_date >= $1 AND status != 'cancelled' ORDER BY delivery_date, created_at",
    [fromDate],
  );
  return attachItems(pool, ordersResult.rows);
}

/** customer_id is mandatory here, so it's a plain equality rather than the
 * `$n::text IS NULL OR ...` optional-filter idiom used by listAll - this
 * query must never be able to degrade into "all orders". */
async function listByCustomerId(pool: Pool, customerId: string): Promise<OrderRecord[]> {
  const ordersResult = await pool.query<OrderRow>(
    "SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC",
    [customerId],
  );
  return attachItems(pool, ordersResult.rows);
}

async function findById(pool: Pool, id: string): Promise<OrderRecord | null> {
  const result = await pool.query<OrderRow>("SELECT * FROM orders WHERE id = $1", [id]);
  const row = result.rows[0];
  if (!row) return null;
  const [order] = await attachItems(pool, [row]);
  return order;
}

/** Every filter is optional - `$n::text IS NULL OR ...` lets one
 * parameterized query cover every combination without building SQL
 * strings by hand. */
async function listAll(
  pool: Pool,
  filters: { deliveryDate?: string; status?: OrderStatus; search?: string } = {},
): Promise<OrderRecord[]> {
  const search = filters.search?.trim() || null;
  const ordersResult = await pool.query<OrderRow>(
    `SELECT * FROM orders
     WHERE ($1::text IS NULL OR delivery_date = $1)
       AND ($2::text IS NULL OR status = $2)
       AND ($3::text IS NULL OR customer_name ILIKE '%' || $3 || '%' OR customer_phone ILIKE '%' || $3 || '%')
     ORDER BY created_at DESC`,
    [filters.deliveryDate ?? null, filters.status ?? null, search],
  );
  return attachItems(pool, ordersResult.rows);
}

async function applyDiscount(
  pool: Pool,
  orderId: string,
  discount: { discountCents: number; discountReason: string | null },
): Promise<void> {
  await pool.query(
    `UPDATE orders
     SET discount_cents = $1, discount_reason = $2, discounted_at = now(), updated_at = now()
     WHERE id = $3`,
    [discount.discountCents, discount.discountReason, orderId],
  );
}

async function updateStatus(pool: Pool, orderId: string, status: OrderStatus): Promise<void> {
  await pool.query("UPDATE orders SET status = $1, updated_at = now() WHERE id = $2", [
    status,
    orderId,
  ]);
}

async function updateOrder(
  pool: Pool,
  orderId: string,
  patch: {
    deliveryDate: string;
    fulfillmentType: "pickup" | "delivery";
    address: DeliveryAddressFields | null;
    addressLat: number | null;
    addressLng: number | null;
    distanceKm: number | null;
    deliveryFeeCents: number;
    subtotalCents: number;
    items: OrderRecord["items"];
  },
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE orders
       SET delivery_date = $1, fulfillment_type = $2,
           address_street = $3, address_house_number = $4, address_postal_code = $5, address_city = $6,
           address_lat = $7, address_lng = $8, distance_km = $9, delivery_fee_cents = $10,
           subtotal_cents = $11, updated_at = now()
       WHERE id = $12`,
      [
        patch.deliveryDate,
        patch.fulfillmentType,
        patch.address?.street ?? null,
        patch.address?.houseNumber ?? null,
        patch.address?.postalCode ?? null,
        patch.address?.city ?? null,
        patch.addressLat,
        patch.addressLng,
        patch.distanceKm,
        patch.deliveryFeeCents,
        patch.subtotalCents,
        orderId,
      ],
    );

    // Delete-then-reinsert rather than diffing rows - order_items has no
    // natural key to match old/new lines against (a staff-typed edit can
    // change quantity, add, or remove any line), and at one batch's worth of
    // items per order this is cheap.
    await client.query("DELETE FROM order_items WHERE order_id = $1", [orderId]);
    for (const item of patch.items) {
      await client.query(
        `INSERT INTO order_items (order_id, sku, name, unit_price_cents, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, item.sku, item.name, item.unitPriceCents, item.quantity],
      );
    }
  });
}

/** Creates the real, Postgres-backed OrdersRepository. The only place in the
 * app that imports `pg` types directly for orders - everywhere else depends
 * on the OrdersRepository interface above. */
export function createPostgresOrdersRepository(pool: Pool): OrdersRepository {
  return {
    insertOrder: (order) => insertOrder(pool, order),
    markEmailSent: (orderId, sent) =>
      pool
        .query("UPDATE orders SET email_sent = $1, updated_at = now() WHERE id = $2", [
          sent,
          orderId,
        ])
        .then(() => undefined),
    markTelegramSent: (orderId, sent) =>
      pool
        .query("UPDATE orders SET telegram_sent = $1, updated_at = now() WHERE id = $2", [
          sent,
          orderId,
        ])
        .then(() => undefined),
    listOrdersForDeliveryDate: (deliveryDate) => listOrdersForDeliveryDate(pool, deliveryDate),
    listOrdersFromDate: (fromDate) => listOrdersFromDate(pool, fromDate),
    listByCustomerId: (customerId) => listByCustomerId(pool, customerId),
    findById: (id) => findById(pool, id),
    listAll: (filters) => listAll(pool, filters),
    applyDiscount: (orderId, discount) => applyDiscount(pool, orderId, discount),
    updateStatus: (orderId, status) => updateStatus(pool, orderId, status),
    updateOrder: (orderId, patch) => updateOrder(pool, orderId, patch),
  };
}

import type { Env } from "../types";
import { MENU_BY_SKU } from "../data";

export type OrderItemInput = { sku: string; quantity: number };

export type DeliveryAddressFields = {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
};

export type OrderInput = {
  items: OrderItemInput[];
  deliveryDate: string; // YYYY-MM-DD, must be a valid Saturday
  fulfillmentType: "pickup" | "delivery";
  address?: DeliveryAddressFields; // required when fulfillmentType is "delivery"
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes?: string;
};

export type OrderRecord = {
  id: string;
  createdAt: string;
  deliveryDate: string;
  fulfillmentType: "pickup" | "delivery";
  address: DeliveryAddressFields | null;
  addressLat: number | null;
  addressLng: number | null;
  distanceKm: number | null;
  deliveryFeeCents: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string | null;
  subtotalCents: number;
  items: Array<{ sku: string; name: string; unitPriceCents: number; quantity: number }>;
};

export class OrderValidationError extends Error {}

export function priceOrder(items: OrderItemInput[]): OrderRecord["items"] {
  if (items.length === 0) {
    throw new OrderValidationError("Order must include at least one item.");
  }

  return items.map(({ sku, quantity }) => {
    const menuItem = MENU_BY_SKU.get(sku);
    if (!menuItem) {
      throw new OrderValidationError(`Unknown item: ${sku}`);
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new OrderValidationError(`Invalid quantity for ${sku}.`);
    }
    return {
      sku: menuItem.sku,
      name: menuItem.name,
      unitPriceCents: menuItem.priceCents,
      quantity,
    };
  });
}

export async function insertOrder(env: Env, order: OrderRecord): Promise<void> {
  const stmts = [
    env.DB.prepare(
      `INSERT INTO orders
        (id, created_at, delivery_date, fulfillment_type,
         address_street, address_house_number, address_postal_code, address_city,
         address_lat, address_lng, distance_km, delivery_fee_cents,
         customer_name, customer_email, customer_phone, notes, subtotal_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
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
    ),
    ...order.items.map((item) =>
      env.DB.prepare(
        `INSERT INTO order_items (order_id, sku, name, unit_price_cents, quantity)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(order.id, item.sku, item.name, item.unitPriceCents, item.quantity),
    ),
  ];

  await env.DB.batch(stmts);
}

export async function markNotificationsSent(
  env: Env,
  orderId: string,
  { emailSent, whatsappSent }: { emailSent: boolean; whatsappSent: boolean },
): Promise<void> {
  await env.DB.prepare(`UPDATE orders SET email_sent = ?, whatsapp_sent = ? WHERE id = ?`)
    .bind(emailSent ? 1 : 0, whatsappSent ? 1 : 0, orderId)
    .run();
}

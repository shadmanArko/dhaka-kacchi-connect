import { MENU_BY_SKU } from "../data";

/** Pure domain types and business rules for an order - no database, no HTTP.
 * Kept dependency-free on purpose: the persistence layer (ordersRepository.ts)
 * depends on these types, not the other way around. */

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
  // Editable at checkout. customerEmail/customerPhone are deliberately NOT
  // here - every order requires a logged-in account (see authMiddleware.ts),
  // and the server always takes the locked email/phone from that account,
  // never from the request body - same "never trust the client" rule the
  // delivery fee and menu prices already follow, extended to identity.
  customerName: string;
  notes?: string;
};

export type OrderRecord = {
  id: string;
  createdAt: string;
  fulfillmentType: "pickup" | "delivery";
  deliveryDate: string;
  address: DeliveryAddressFields | null;
  addressLat: number | null;
  addressLng: number | null;
  distanceKm: number | null;
  deliveryFeeCents: number;
  customerId: string;
  // A snapshot of the account's identity at order time - not a live join to
  // `customers`, so a later account edit never silently rewrites a past
  // order's record. Same convention order_items.name already uses for menu
  // items (schema.sql).
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string | null;
  subtotalCents: number;
  items: Array<{ sku: string; name: string; unitPriceCents: number; quantity: number }>;
};

export class OrderValidationError extends Error {}

/** Re-derives each line's price from the menu server-side - the client only
 * ever sends {sku, quantity}, never a price, mirroring the same
 * never-trust-the-client rule the delivery fee follows. */
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

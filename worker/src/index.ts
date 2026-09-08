import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { MENU } from "./data";
import { getAvailableDeliveryDates, isDeliveryDateStillOrderable } from "./lib/dates";
import { quoteDeliveryForAddress, type DeliveryAddressInput } from "./lib/delivery";
import {
  OrderValidationError,
  insertOrder,
  markNotificationsSent,
  priceOrder,
  type DeliveryAddressFields,
  type OrderInput,
  type OrderRecord,
} from "./lib/orders";
import { sendConfirmationEmail } from "./lib/email";
import { sendWhatsAppAlert } from "./lib/whatsapp";

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const allowedOrigins = c.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  return cors({
    origin: (origin) => (origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })(c, next);
});

app.get("/health", (c) => c.json({ ok: true }));

app.get("/menu", (c) =>
  c.json({
    items: MENU.map(({ sku, name, priceCents, description }) => ({
      sku,
      name,
      priceCents,
      description,
    })),
  }),
);

app.get("/availability", (c) => c.json({ dates: getAvailableDeliveryDates(new Date(), 4) }));

// Public, no mutation - lets the customer see the delivery fee before they
// submit an order. Deliberately re-run in full by POST /orders below, never
// trusted as-is: this endpoint is a preview, not an authorization.
app.post("/delivery-quote", async (c) => {
  let body: Partial<DeliveryAddressInput>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_input", message: "Invalid JSON body." }, 400);
  }

  const result = quoteDeliveryForAddress({
    street: body.street ?? "",
    houseNumber: body.houseNumber ?? "",
    postalCode: body.postalCode ?? "",
    city: body.city ?? "",
  });

  if (!result.ok) {
    return c.json({ error: result.reason, message: result.message }, 400);
  }
  return c.json(result, 200);
});

app.post("/orders", async (c) => {
  let body: Partial<OrderInput>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const {
    items,
    deliveryDate,
    fulfillmentType,
    address,
    customerName,
    customerEmail,
    customerPhone,
    notes,
  } = body;

  if (!deliveryDate || !isDeliveryDateStillOrderable(deliveryDate, new Date())) {
    return c.json(
      { error: "That delivery date is no longer available. Please pick a valid Saturday." },
      400,
    );
  }
  if (fulfillmentType !== "pickup" && fulfillmentType !== "delivery") {
    return c.json({ error: "Please choose pickup or delivery." }, 400);
  }
  if (!customerName?.trim() || !customerEmail?.trim() || !customerPhone?.trim()) {
    return c.json({ error: "Name, email, and phone are required." }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return c.json({ error: "Please provide a valid email address." }, 400);
  }

  // The server ALWAYS re-derives the delivery fee itself here — mirroring how
  // priceOrder() re-derives menu prices below. The client never sends a fee,
  // distance, or coordinates; a quote fetched from /delivery-quote a moment
  // earlier is only ever a preview, never a token of authorization.
  let addressFields: DeliveryAddressFields | null = null;
  let addressLat: number | null = null;
  let addressLng: number | null = null;
  let distanceKm: number | null = null;
  let deliveryFeeCents = 0;

  if (fulfillmentType === "delivery") {
    if (!address) {
      return c.json({ error: "A delivery address is required." }, 400);
    }
    const quote = quoteDeliveryForAddress(address);
    if (!quote.ok) {
      return c.json({ error: quote.reason, message: quote.message }, 400);
    }
    if (!quote.deliverable) {
      const message =
        quote.reason === "address_not_found"
          ? "We couldn't find that address. Please check it and try again."
          : quote.reason === "outside_berlin"
            ? "That address is outside Berlin — delivery isn't available there. You're welcome to pick up for free instead."
            : "That address is too far for delivery. You're welcome to pick up for free instead.";
      return c.json({ error: quote.reason, message }, 400);
    }
    addressFields = address;
    addressLat = quote.lat;
    addressLng = quote.lng;
    distanceKm = quote.distanceKm;
    deliveryFeeCents = quote.feeCents;
  }

  let pricedItems: OrderRecord["items"];
  try {
    pricedItems = priceOrder(items ?? []);
  } catch (err) {
    if (err instanceof OrderValidationError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }

  const order: OrderRecord = {
    id: `ord_${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    deliveryDate,
    fulfillmentType,
    address: addressFields,
    addressLat,
    addressLng,
    distanceKm,
    deliveryFeeCents,
    customerName: customerName.trim(),
    customerEmail: customerEmail.trim(),
    customerPhone: customerPhone.trim(),
    notes: notes?.trim() || null,
    subtotalCents: pricedItems.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0),
    items: pricedItems,
  };

  await insertOrder(c.env, order);

  const [emailSent, whatsappSent] = await Promise.all([
    sendConfirmationEmail(c.env, order).catch((err) => {
      console.error("sendConfirmationEmail failed:", err);
      return false;
    }),
    sendWhatsAppAlert(c.env, order).catch((err) => {
      console.error("sendWhatsAppAlert failed:", err);
      return false;
    }),
  ]);
  await markNotificationsSent(c.env, order.id, { emailSent, whatsappSent });

  return c.json(
    {
      orderId: order.id,
      deliveryDate: order.deliveryDate,
      fulfillmentType: order.fulfillmentType,
      distanceKm: order.distanceKm,
      subtotalCents: order.subtotalCents,
      deliveryFeeCents: order.deliveryFeeCents,
      totalCents: order.subtotalCents + order.deliveryFeeCents,
      paymentMethod: "cash_on_delivery",
    },
    201,
  );
});

export default app;

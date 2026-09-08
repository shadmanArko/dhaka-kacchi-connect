import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { config } from "./config";
import { pool } from "./db";
import { MENU } from "./data";
import { getAvailableDeliveryDates, isDeliveryDateStillOrderable } from "./lib/dates";
import { quoteDeliveryForAddress } from "./lib/delivery";
import { registerEmailNotifications } from "./lib/email";
import { emitOrderCreated } from "./lib/orderEvents";
import { OrderValidationError, priceOrder, type OrderRecord } from "./lib/orders";
import { createPostgresOrdersRepository } from "./lib/ordersRepository";
import { registerWhatsAppNotifications } from "./lib/whatsapp";
import {
  DeliveryAddressSchema,
  DeliveryQuoteResponseSchema,
  ErrorResponseSchema,
  MenuItemSchema,
  OrderInputSchema,
  OrderResultSchema,
} from "./schemas";

// Wiring, done once at startup: the concrete Postgres repository is created
// here and handed to anything that needs to persist or react to orders.
// Route handlers below only ever see the OrdersRepository interface.
const ordersRepository = createPostgresOrdersRepository(pool);
registerEmailNotifications(ordersRepository);
registerWhatsAppNotifications(ordersRepository);

const app = new OpenAPIHono({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json({ error: "invalid_input", message: result.error.issues[0]?.message ?? "Invalid request." }, 400);
    }
  },
});

app.use(
  "*",
  cors({
    origin: (origin) => (origin && config.allowedOrigins.includes(origin) ? origin : config.allowedOrigins[0]),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

// Health check stays unversioned and outside /v1 - it's for infra probes
// (Docker healthchecks, uptime monitors), not API consumers, and it should
// never break if the API's version ever changes.
app.get("/health", (c) => c.json({ ok: true }));

const v1 = new OpenAPIHono();

const menuRoute = createRoute({
  method: "get",
  path: "/menu",
  operationId: "getMenu",
  summary: "Get the current menu",
  security: [], // deliberately public - this whole API has no auth today
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ items: z.array(MenuItemSchema) }) } },
      description: "The current menu.",
    },
  },
});
v1.openapi(menuRoute, (c) =>
  c.json({
    items: MENU.map(({ sku, name, priceCents, description }) => ({ sku, name, priceCents, description })),
  }),
);

const availabilityRoute = createRoute({
  method: "get",
  path: "/availability",
  operationId: "getAvailability",
  summary: "Get upcoming orderable delivery/pickup dates",
  security: [], // deliberately public - this whole API has no auth today
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ dates: z.array(z.string()) }) } },
      description: "Upcoming orderable Saturdays (YYYY-MM-DD).",
    },
  },
});
v1.openapi(availabilityRoute, (c) => c.json({ dates: getAvailableDeliveryDates(new Date(), 4) }));

const deliveryQuoteRoute = createRoute({
  method: "post",
  path: "/delivery-quote",
  operationId: "quoteDeliveryFee",
  summary: "Preview the delivery fee for an address",
  security: [], // deliberately public - this whole API has no auth today
  request: {
    body: { content: { "application/json": { schema: DeliveryAddressSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: DeliveryQuoteResponseSchema } },
      description: "Whether the address is deliverable and, if so, at what fee.",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "The request body failed validation.",
    },
  },
});
// Public, no mutation - lets the customer see the delivery fee before they
// submit an order. Deliberately re-run in full by POST /orders below, never
// trusted as-is: this endpoint is a preview, not an authorization.
v1.openapi(deliveryQuoteRoute, (c) => {
  const address = c.req.valid("json");
  const result = quoteDeliveryForAddress(address);
  if (!result.ok) {
    return c.json({ error: result.reason, message: result.message }, 400);
  }
  return c.json(result, 200);
});

const ordersRoute = createRoute({
  method: "post",
  path: "/orders",
  operationId: "createOrder",
  summary: "Place a new order (cash on delivery)",
  security: [], // deliberately public - this whole API has no auth today
  request: {
    body: { content: { "application/json": { schema: OrderInputSchema } }, required: true },
  },
  responses: {
    201: {
      content: { "application/json": { schema: OrderResultSchema } },
      description: "The order was created.",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "The request was invalid, or the address isn't deliverable.",
    },
  },
});
v1.openapi(ordersRoute, async (c) => {
  const body = c.req.valid("json");
  const { items, deliveryDate, fulfillmentType, address, customerName, customerEmail, customerPhone, notes } = body;

  if (!isDeliveryDateStillOrderable(deliveryDate, new Date())) {
    return c.json({ error: "invalid_delivery_date", message: "That delivery date is no longer available. Please pick a valid Saturday." }, 400);
  }

  // The server ALWAYS re-derives the delivery fee itself here — mirroring
  // how priceOrder() re-derives menu prices below. The client never sends a
  // fee, distance, or coordinates; a quote fetched from /delivery-quote a
  // moment earlier is only ever a preview, never a token of authorization.
  let addressFields: OrderRecord["address"] = null;
  let addressLat: number | null = null;
  let addressLng: number | null = null;
  let distanceKm: number | null = null;
  let deliveryFeeCents = 0;

  if (fulfillmentType === "delivery") {
    if (!address) {
      return c.json({ error: "address_required", message: "A delivery address is required." }, 400);
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
    pricedItems = priceOrder(items);
  } catch (err) {
    if (err instanceof OrderValidationError) {
      return c.json({ error: "invalid_items", message: err.message }, 400);
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

  await ordersRepository.insertOrder(order);
  // Fans out to every registered listener (currently email + WhatsApp) and
  // waits for all of them - see orderEvents.ts for why a plain EventEmitter
  // isn't used here.
  await emitOrderCreated(order);

  return c.json(
    {
      orderId: order.id,
      deliveryDate: order.deliveryDate,
      fulfillmentType: order.fulfillmentType,
      distanceKm: order.distanceKm,
      subtotalCents: order.subtotalCents,
      deliveryFeeCents: order.deliveryFeeCents,
      totalCents: order.subtotalCents + order.deliveryFeeCents,
      paymentMethod: "cash_on_delivery" as const,
    },
    201,
  );
});

app.route("/v1", v1);

// The OpenAPI document a future app (or an AI coding agent building one)
// imports to generate a typed client - this IS the API reference; there is
// no separate hand-maintained document to drift from the code.
app.doc("/v1/doc", {
  openapi: "3.0.0",
  info: { title: "Dhaka Kacchi Ordering API", version: "1.0.0" },
  servers: [
    { url: "https://api.dhakakacchi.de/v1", description: "Production" },
    { url: "http://localhost:8787/v1", description: "Local development" },
  ],
});

export default app;

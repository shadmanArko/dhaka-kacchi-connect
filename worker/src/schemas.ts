/**
 * Zod schemas for every /v1 endpoint. One definition per shape, used for
 * BOTH runtime request validation and the generated OpenAPI document
 * (GET /doc) - a future app (or an AI coding agent building one) generates
 * a typed client straight from that document instead of hand-reading route
 * code, and there is no separate API reference to keep in sync by hand.
 */
import { z } from "@hono/zod-openapi";

export const MenuItemSchema = z
  .object({
    sku: z.string().openapi({ example: "kacchi_taster" }),
    name: z.string().openapi({ example: "Kacchi Biriyani — Taster Box (750ml, 1 person)" }),
    priceCents: z.number().int().openapi({ example: 999 }),
    description: z.string().openapi({ example: "1 piece of lamb, 1 whole potato, fresh salad." }),
  })
  .openapi("MenuItem");

export const DeliveryAddressSchema = z
  .object({
    street: z.string().min(1).openapi({ example: "Alexanderstraße" }),
    houseNumber: z.string().min(1).openapi({ example: "1" }),
    postalCode: z
      .string()
      .regex(/^\d{5}$/, "Postal code must be a 5-digit German PLZ.")
      .openapi({ example: "10178" }),
    city: z.string().min(1).openapi({ example: "Berlin" }),
  })
  .openapi("DeliveryAddress");

export const DeliveryQuoteDeliverableSchema = z
  .object({
    ok: z.literal(true),
    deliverable: z.literal(true),
    feeCents: z.number().int(),
    distanceKm: z.number(),
    lat: z.number(),
    lng: z.number(),
    resolvedAddress: z.string(),
  })
  .openapi("DeliveryQuoteDeliverable");

export const DeliveryQuoteNotDeliverableSchema = z
  .object({
    ok: z.literal(true),
    deliverable: z.literal(false),
    reason: z.enum(["outside_berlin", "too_far", "address_not_found"]),
    distanceKm: z.number().optional(),
  })
  .openapi("DeliveryQuoteNotDeliverable");

export const DeliveryQuoteResponseSchema = z
  .union([DeliveryQuoteDeliverableSchema, DeliveryQuoteNotDeliverableSchema])
  .openapi("DeliveryQuoteResponse");

export const OrderItemInputSchema = z
  .object({
    sku: z.string().min(1),
    quantity: z.number().int().positive(),
  })
  .openapi("OrderItemInput");

export const OrderInputSchema = z
  .object({
    items: z.array(OrderItemInputSchema).min(1),
    deliveryDate: z.string().openapi({ example: "2026-09-12", description: "YYYY-MM-DD, must be a valid Saturday" }),
    fulfillmentType: z.enum(["pickup", "delivery"]),
    address: DeliveryAddressSchema.optional().openapi({
      description: "Required when fulfillmentType is 'delivery'",
    }),
    customerName: z.string().min(1),
    customerEmail: z.string().email(),
    customerPhone: z.string().min(1),
    notes: z.string().optional(),
  })
  .openapi("OrderInput");

export const OrderResultSchema = z
  .object({
    orderId: z.string().openapi({ example: "ord_2f2db69b-a757-4f0d-9ff8-33eee670647f" }),
    deliveryDate: z.string(),
    fulfillmentType: z.enum(["pickup", "delivery"]),
    distanceKm: z.number().nullable(),
    subtotalCents: z.number().int(),
    deliveryFeeCents: z.number().int(),
    totalCents: z.number().int(),
    paymentMethod: z.literal("cash_on_delivery"),
  })
  .openapi("OrderResult");

export const ErrorResponseSchema = z
  .object({
    error: z.string().openapi({ example: "invalid_input" }),
    message: z.string().optional().openapi({ example: "Postal code must be a 5-digit German PLZ." }),
  })
  .openapi("ErrorResponse");

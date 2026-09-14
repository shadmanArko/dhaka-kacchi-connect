/**
 * Zod schemas for every /v1 endpoint. One definition per shape, used for
 * BOTH runtime request validation and the generated OpenAPI document
 * (GET /doc) - a future app (or an AI coding agent building one) generates
 * a typed client straight from that document instead of hand-reading route
 * code, and there is no separate API reference to keep in sync by hand.
 */
import { z } from "@hono/zod-openapi";
import { isE164 } from "./lib/auth";

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

// Lightweight, postal-code-only variant of the above - used by the order
// page's live-as-you-type check (no button). No lat/lng/resolvedAddress:
// those need a full street address, which this endpoint never collects.
export const PostalCodeCheckQuerySchema = z
  .object({
    postalCode: z
      .string()
      .regex(/^\d{5}$/, "Postal code must be a 5-digit German PLZ.")
      .openapi({ example: "10178" }),
  })
  .openapi("PostalCodeCheckQuery");

export const PostalCodeCheckDeliverableSchema = z
  .object({
    ok: z.literal(true),
    deliverable: z.literal(true),
    feeCents: z.number().int(),
    distanceKm: z.number(),
  })
  .openapi("PostalCodeCheckDeliverable");

export const PostalCodeCheckResponseSchema = z
  .union([PostalCodeCheckDeliverableSchema, DeliveryQuoteNotDeliverableSchema])
  .openapi("PostalCodeCheckResponse");

export const OrderItemInputSchema = z
  .object({
    sku: z.string().min(1),
    quantity: z.number().int().positive(),
  })
  .openapi("OrderItemInput");

export const OrderInputSchema = z
  .object({
    items: z.array(OrderItemInputSchema).min(1),
    deliveryDate: z
      .string()
      .openapi({ example: "2026-09-12", description: "YYYY-MM-DD, must be a valid Saturday" }),
    fulfillmentType: z.enum(["pickup", "delivery"]),
    address: DeliveryAddressSchema.optional().openapi({
      description: "Required when fulfillmentType is 'delivery'",
    }),
    // customerEmail/customerPhone are deliberately absent - every order
    // requires a logged-in account (see authMiddleware.ts), and the server
    // always takes the locked email/phone from that account, never the
    // request body.
    customerName: z.string().min(1),
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
    message: z
      .string()
      .optional()
      .openapi({ example: "Postal code must be a 5-digit German PLZ." }),
  })
  .openapi("ErrorResponse");

// --- Customer accounts ---------------------------------------------------

// E.164 only (e.g. "+491701234567") - required before a phone number is
// ever used as a Twilio `To` value or a rate-limit/uniqueness key, so
// differently-formatted input for the same real number is never silently
// treated as two different identifiers (see auth.ts's isE164).
const PhoneSchema = z
  .string()
  .refine(isE164, "Phone number must be in international format, e.g. +491701234567.")
  .openapi({ example: "+491701234567" });

const PasswordSchema = z.string().min(8, "Password must be at least 8 characters.");

export const PublicCustomerSchema = z
  .object({
    id: z.string().openapi({ example: "cust_2f2db69b-a757-4f0d-9ff8-33eee670647f" }),
    phone: PhoneSchema,
    email: z.string().email(),
    name: z.string(),
    dateOfBirth: z.string().openapi({ example: "1990-05-14" }),
    address: DeliveryAddressSchema,
  })
  .openapi("PublicCustomer");

export const RegisterInputSchema = z
  .object({
    phone: PhoneSchema,
    name: z.string().min(1),
    dateOfBirth: z.string().openapi({ example: "1990-05-14", description: "YYYY-MM-DD" }),
    address: DeliveryAddressSchema,
    email: z.string().email(),
    password: PasswordSchema,
  })
  .openapi("RegisterInput");

export const RegisterResultSchema = z
  .object({
    phone: PhoneSchema,
    expiresAt: z.string().openapi({ description: "ISO 8601 - when the OTP code expires" }),
    message: z.string(),
  })
  .openapi("RegisterResult");

export const VerifyOtpInputSchema = z
  .object({
    phone: PhoneSchema,
    code: z
      .string()
      .length(6)
      .regex(/^\d{6}$/, "Code must be 6 digits."),
  })
  .openapi("VerifyOtpInput");

export const AuthResultSchema = z
  .object({
    token: z.string(),
    customer: PublicCustomerSchema,
  })
  .openapi("AuthResult");

export const LoginInputSchema = z
  .object({
    identifier: z.string().min(1).openapi({ description: "Phone (E.164) or email" }),
    password: z.string().min(1),
  })
  .openapi("LoginInput");

export const PasswordResetRequestInputSchema = z
  .object({
    email: z.string().email(),
  })
  .openapi("PasswordResetRequestInput");

export const PasswordResetConfirmInputSchema = z
  .object({
    token: z.string().min(1),
    newPassword: PasswordSchema,
  })
  .openapi("PasswordResetConfirmInput");

export const MeResultSchema = z
  .object({
    customer: PublicCustomerSchema,
  })
  .openapi("MeResult");

export const MessageResultSchema = z
  .object({
    message: z.string(),
  })
  .openapi("MessageResult");

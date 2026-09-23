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
    // Echoed back so the confirmation screen can show the address the food is
    // actually going to - the last moment a typo is still catchable. Null for
    // pickup, which carries no address.
    address: DeliveryAddressSchema.nullable(),
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
export const PhoneSchema = z
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

// --- Marketing/behavioral events -------------------------------------------
// Fed to the sibling dhaka_kacchi_ai_harness warehouse's event_taxonomy -
// see migrations-manual/0002_events.sql. This enum is the actual gatekeeper
// on what event_name values this backend accepts; keeping it in sync with
// that repo's seeded taxonomy is a manual, cross-repo contract with nothing
// enforcing it - a known, accepted limitation.
export const EVENT_NAMES = [
  "page_view",
  "menu_view",
  "product_view",
  "add_to_cart",
  "begin_checkout",
  "purchase",
  "coupon_used",
  "social_click",
  "contact",
  "newsletter_signup",
] as const;

export const EventInputSchema = z
  .object({
    eventName: z.enum(EVENT_NAMES),
    anonymousId: z.string().max(200).optional(),
    sessionId: z.string().max(200).optional(),
    orderId: z.string().max(200).optional(),
    // Size-capped, not schema-validated per event_name: keeping this loose
    // is what lets the taxonomy (in a different repo/language) evolve
    // without a matching code change here every time. The size cap is what
    // stands in for that missing per-event-name validation, so an
    // unauthenticated caller can't post an arbitrarily large jsonb blob.
    properties: z
      .record(z.string(), z.unknown())
      .refine((v) => JSON.stringify(v).length <= 4000, "properties is too large.")
      .optional(),
  })
  .openapi("EventInput");

export const EventResultSchema = z
  .object({
    id: z.string().openapi({ example: "evt_2f2db69b-a757-4f0d-9ff8-33eee670647f" }),
  })
  .openapi("EventResult");

// --- Admin panel ----------------------------------------------------------
// A completely separate identity/schema space from the customer schemas
// above - never shares a type with PublicCustomer/AuthResult/etc., so an
// admin and a customer token/record can never be confused for one another.

const OrderStatusSchema = z.enum(["received", "confirmed", "delivered", "cancelled"]);

// A customer looking at their OWN order history. Deliberately narrower than
// AdminOrderSchema: no customerName/Email/Phone (they are the customer), no
// createdBy (an internal distinction), no address lat/lng. discountReason IS
// included - it's their own discount and they should be able to see why.
export const CustomerOrderItemSchema = z
  .object({
    sku: z.string(),
    name: z.string(),
    unitPriceCents: z.number().int(),
    quantity: z.number().int(),
  })
  .openapi("CustomerOrderItem");

export const CustomerOrderSchema = z
  .object({
    id: z.string(),
    createdAt: z.string(),
    deliveryDate: z.string(),
    fulfillmentType: z.enum(["pickup", "delivery"]),
    address: DeliveryAddressSchema.nullable(),
    distanceKm: z.number().nullable(),
    subtotalCents: z.number().int(),
    deliveryFeeCents: z.number().int(),
    discountCents: z.number().int(),
    discountReason: z.string().nullable(),
    totalCents: z.number().int(),
    status: OrderStatusSchema,
    notes: z.string().nullable(),
    items: z.array(CustomerOrderItemSchema),
  })
  .openapi("CustomerOrder");

export const CustomerOrderListResponseSchema = z
  .object({
    orders: z.array(CustomerOrderSchema),
  })
  .openapi("CustomerOrderListResponse");

export const CustomerOrderResultSchema = z
  .object({
    order: CustomerOrderSchema,
  })
  .openapi("CustomerOrderResult");

export const AdminLoginInputSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .openapi("AdminLoginInput");

export const AdminUserSchema = z
  .object({
    id: z.string().openapi({ example: "adm_2f2db69b-a757-4f0d-9ff8-33eee670647f" }),
    email: z.string().email(),
    name: z.string(),
  })
  .openapi("AdminUser");

export const AdminAuthResultSchema = z
  .object({
    token: z.string(),
    adminUser: AdminUserSchema,
  })
  .openapi("AdminAuthResult");

export const AdminMeResultSchema = z
  .object({
    adminUser: AdminUserSchema,
  })
  .openapi("AdminMeResult");

export const AdminOrderItemSchema = z
  .object({
    sku: z.string(),
    name: z.string(),
    unitPriceCents: z.number().int(),
    quantity: z.number().int(),
  })
  .openapi("AdminOrderItem");

// The admin-facing order shape - a superset of the public OrderResultSchema
// (also exposes status/discount/createdBy/full item list/customer contact
// info, none of which the public API needs to hand back to the customer
// who already knows their own details).
export const AdminOrderSchema = z
  .object({
    id: z.string(),
    createdAt: z.string(),
    deliveryDate: z.string(),
    fulfillmentType: z.enum(["pickup", "delivery"]),
    address: DeliveryAddressSchema.nullable(),
    distanceKm: z.number().nullable(),
    deliveryFeeCents: z.number().int(),
    customerId: z.string(),
    customerName: z.string(),
    customerEmail: z.string(),
    customerPhone: z.string(),
    notes: z.string().nullable(),
    subtotalCents: z.number().int(),
    discountCents: z.number().int(),
    discountReason: z.string().nullable(),
    totalCents: z.number().int(),
    status: OrderStatusSchema,
    createdBy: z.enum(["customer", "staff"]),
    items: z.array(AdminOrderItemSchema),
  })
  .openapi("AdminOrder");

export const AdminOrderListQuerySchema = z
  .object({
    deliveryDate: z.string().optional().openapi({ description: "YYYY-MM-DD, exact match" }),
    status: OrderStatusSchema.optional(),
    search: z.string().optional().openapi({ description: "Matches customer name or phone" }),
  })
  .openapi("AdminOrderListQuery");

export const AdminOrderListResponseSchema = z
  .object({
    orders: z.array(AdminOrderSchema),
  })
  .openapi("AdminOrderListResponse");

export const AdminOrderResultSchema = z
  .object({
    order: AdminOrderSchema,
  })
  .openapi("AdminOrderResult");

export const AdminCustomerSearchQuerySchema = z
  .object({
    identifier: z.string().min(1).openapi({ description: "Phone (E.164) or email, exact match" }),
  })
  .openapi("AdminCustomerSearchQuery");

export const AdminCustomerSearchResultSchema = z
  .object({
    customer: PublicCustomerSchema.nullable(),
  })
  .openapi("AdminCustomerSearchResult");

// Only required when the order isn't for an existing customer - staff
// realistically may not have a phone-order customer's email/DOB on hand,
// so both are optional here (a placeholder value fills the gap server-side
// - see customersRepository usage in index.ts).
export const AdminNewCustomerInputSchema = z
  .object({
    phone: PhoneSchema,
    name: z.string().min(1),
    email: z.string().email().optional(),
    dateOfBirth: z
      .string()
      .optional()
      .openapi({ example: "1990-05-14", description: "YYYY-MM-DD" }),
    address: DeliveryAddressSchema.optional(),
  })
  .openapi("AdminNewCustomerInput");

export const AdminOrderInputSchema = z
  .object({
    items: z.array(OrderItemInputSchema).min(1),
    deliveryDate: z
      .string()
      .openapi({ example: "2026-09-12", description: "YYYY-MM-DD, must be a valid Saturday" }),
    fulfillmentType: z.enum(["pickup", "delivery"]),
    address: DeliveryAddressSchema.optional().openapi({
      description: "Required when fulfillmentType is 'delivery'",
    }),
    customerName: z.string().min(1),
    notes: z.string().optional(),
    // Exactly one of these two must be provided - validated in the route
    // handler, not here, since a cross-field "exactly one of" rule reads
    // more clearly as an explicit check than a zod .refine on a large object.
    existingCustomerId: z.string().optional(),
    newCustomer: AdminNewCustomerInputSchema.optional(),
  })
  .openapi("AdminOrderInput");

export const AdminDiscountInputSchema = z
  .object({
    discountCents: z.number().int().min(0),
    discountReason: z.string().optional(),
  })
  .openapi("AdminDiscountInput");

export const AdminStatusInputSchema = z
  .object({
    status: OrderStatusSchema,
  })
  .openapi("AdminStatusInput");

// Staff correcting an already-placed order - items and delivery details only.
// Deliberately excludes customerName/existingCustomerId/newCustomer: this
// endpoint never changes which customer an order belongs to, only what/when/
// where it's for (see adminUpdateOrderRoute in index.ts for the "locked once
// delivered/cancelled" rule this pairs with).
export const AdminOrderUpdateInputSchema = z
  .object({
    items: z.array(OrderItemInputSchema).min(1),
    deliveryDate: z
      .string()
      .openapi({ example: "2026-09-12", description: "YYYY-MM-DD, must be a valid Saturday" }),
    fulfillmentType: z.enum(["pickup", "delivery"]),
    address: DeliveryAddressSchema.optional().openapi({
      description: "Required when fulfillmentType is 'delivery'",
    }),
  })
  .openapi("AdminOrderUpdateInput");

// --- Reporting (read-only view over the sibling warehouse database - see
// worker/src/lib/reportingRepository.ts) ---

export const SocialPlatformSummarySchema = z
  .object({
    platform: z.string(),
    postCount: z.number().int(),
    totalLikes: z.number().int(),
    totalComments: z.number().int(),
    totalShares: z.number().int(),
    totalImpressions: z.number().int(),
    totalReach: z.number().int(),
  })
  .openapi("SocialPlatformSummary");

export const RecentSocialPostSchema = z
  .object({
    platform: z.string(),
    externalId: z.string(),
    postedAt: z.string(),
    permalink: z.string().nullable(),
    contentType: z.string().nullable(),
    caption: z.string().nullable(),
    likes: z.number().int(),
    comments: z.number().int(),
    shares: z.number().int(),
    impressions: z.number().int(),
    reach: z.number().int(),
  })
  .openapi("RecentSocialPost");

export const ChannelFunnelRowSchema = z
  .object({
    channel: z.string(),
    campaign: z.string(),
    eventName: z.string(),
    eventCount: z.number().int(),
  })
  .openapi("ChannelFunnelRow");

export const ChannelRevenueRowSchema = z
  .object({
    channel: z.string(),
    campaign: z.string(),
    purchaseEvents: z.number().int(),
    matchedOrders: z.number().int(),
    // A warehouse numeric(12,2) - passed through as a number, same
    // precision loss tradeoff as every other money value already crossing
    // this JSON boundary in this codebase (see AdminOrder's own *Cents
    // fields for the integer-cents alternative used on the app's own
    // money; this is genuinely a different repo's numeric type, not this
    // one's, so it's read as-is rather than reinvented here).
    grossRevenue: z.number(),
  })
  .openapi("ChannelRevenueRow");

export const AttributionCoverageSchema = z
  .object({
    attributed: z.number().int(),
    unattributed: z.number().int(),
  })
  .openapi("AttributionCoverage");

export const AdminReportingResultSchema = z
  .object({
    socialPlatformSummary: z.array(SocialPlatformSummarySchema),
    recentSocialPosts: z.array(RecentSocialPostSchema),
    channelFunnel: z.array(ChannelFunnelRowSchema),
    channelRevenue: z.array(ChannelRevenueRowSchema),
    attributionCoverage: AttributionCoverageSchema,
  })
  .openapi("AdminReportingResult");

// --- CEO cockpit (ARCHITECTURE.md section 4 - reads the sibling warehouse's
// cockpit_alert table, see worker/src/lib/cockpitRepository.ts) ---

export const AlertSeveritySchema = z.enum(["info", "warn", "critical"]);

export const CockpitAlertSchema = z
  .object({
    id: z.string(),
    agent: z.string(),
    alertKey: z.string(),
    severity: AlertSeveritySchema,
    title: z.string(),
    detail: z.string().nullable(),
    detectedAt: z.string(),
    acknowledgedAt: z.string().nullable(),
  })
  .openapi("CockpitAlert");

export const YesterdayHealthSchema = z
  .object({
    orderCount: z.number().int(),
    revenue: z.number(),
    avgOrderValue: z.number(),
    marginRatio: z.number().nullable(),
  })
  .openapi("YesterdayHealth");

export const AdminCockpitResultSchema = z
  .object({
    health: YesterdayHealthSchema,
    alerts: z.array(CockpitAlertSchema),
  })
  .openapi("AdminCockpitResult");

export const AdminAlertResolveInputSchema = z
  .object({
    resolution: z.string().min(1).max(500).optional().openapi({
      description: "Free-text note on how this was resolved. Defaults to 'manual'.",
    }),
  })
  .openapi("AdminAlertResolveInput");

// --- Post-engagement predictor (sibling dhaka_kacchi_ai_harness repo's
// predictor/ service - ml/00-problem-framing through ml/05-production for
// how the model was built, chosen, and evaluated. See
// worker/src/lib/predictorClient.ts.) ---

export const PredictPostInputSchema = z
  .object({
    platform: z.enum(["facebook", "instagram"]),
    contentType: z.string().max(50).optional().openapi({
      description: "e.g. 'video', 'reel', 'image', 'carousel'. Omit if undecided yet.",
    }),
    caption: z.string().max(5000).default(""),
    plannedPostedAt: z.string().datetime({ offset: true }).openapi({
      description: "ISO 8601 timestamp for when the post is planned to go live.",
    }),
  })
  .openapi("PredictPostInput");

export const PredictReasonSchema = z
  .object({
    feature: z.string(),
    contribution: z.number(),
  })
  .openapi("PredictReason");

export const PredictPostResultSchema = z
  .object({
    label: z.enum(["likely_below_typical", "likely_at_or_above_typical"]),
    probability: z.number(),
    threshold: z.number(),
    modelVersion: z.string(),
    topReasons: z.array(PredictReasonSchema),
  })
  .openapi("PredictPostResult");

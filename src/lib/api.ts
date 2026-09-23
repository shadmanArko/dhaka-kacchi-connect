/**
 * Single fetch seam for calling your backend (built separately, e.g. with Claude Code).
 *
 * Configure via `.env`:
 *   VITE_API_BASE_URL=https://your-backend.example.com
 *
 * All frontend HTTP calls should go through this file so swapping backends
 * (or later moving endpoints into TanStack `createServerFn`) is a one-file change.
 */

import i18n from "@/lib/i18n";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

/** Plain DB reads. Long enough for a cold backend, short enough that a dead
 * connection doesn't hang a button forever. Endpoints that wait on outbound
 * side effects (email/SMS/Telegram) override this - see the wrappers below. */
const DEFAULT_TIMEOUT_MS = 20_000;
const MESSAGE_MAX = 300;
const DETAIL_MAX = 500;

export type ApiErrorKind = "config" | "timeout" | "network" | "http";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Why this failed. Distinguishes a timeout/offline from a real HTTP
     * error - `status` can't, because 0 already means "never reached the
     * network". Callers that must react differently (order submission) branch
     * on this; everything else just renders `message`. */
    public readonly kind: ApiErrorKind = "http",
    /** Truncated raw response body. For logs/error reporting only - never
     * render this, it's exactly the untrusted text `message` exists to keep
     * out of the UI. */
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiFetchOptions = {
  timeoutMs?: number;
};

function statusMessage(status: number): string {
  if (status === 401) return i18n.t("api.error.401");
  if (status === 403) return i18n.t("api.error.403");
  if (status === 404) return i18n.t("api.error.404");
  if (status === 409) return i18n.t("api.error.409");
  if (status === 429) return i18n.t("api.error.429");
  if (status >= 400 && status < 500) return i18n.t("api.error.4xx");
  return i18n.t("api.error.generic");
}

/** The worker answers every error as { error: <machine_code>, message: <human
 * string> }. Only `message` is ever safe to show: `error` is a code like
 * "unauthorized" or "invalid_items". Anything that isn't a short, markup-free
 * string is rejected in favour of a generic message - a proxy's HTML error
 * page, a gateway interstitial or a stack trace must never reach the UI, and
 * order.tsx previously forwarded this same string to PostHog too. */
function isDisplayableMessage(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MESSAGE_MAX &&
    !value.includes("<")
  );
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  options?: ApiFetchOptions,
): Promise<T> {
  if (!API_BASE) {
    throw new ApiError(0, "VITE_API_BASE_URL is not configured", "config");
  }

  // A manual AbortController rather than AbortSignal.timeout/any: those need
  // Safari 17.4+, and this site's traffic is heavily mobile Safari.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  init?.signal?.addEventListener("abort", onExternalAbort);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    if (timedOut) {
      throw new ApiError(0, i18n.t("api.error.timeout"), "timeout");
    }
    // A caller-initiated cancel is not an error condition - propagate as-is.
    if (init?.signal?.aborted) throw err;
    throw new ApiError(
      0,
      i18n.t("api.error.network"),
      "network",
      err instanceof Error ? err.message : undefined,
    );
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener("abort", onExternalAbort);
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let friendly = statusMessage(res.status);
    try {
      const body = JSON.parse(raw) as { message?: unknown };
      if (isDisplayableMessage(body.message)) friendly = body.message.trim();
    } catch {
      // Not JSON at all (proxy HTML page, gateway text) - keep the generic
      // message rather than echoing the body.
    }
    throw new ApiError(res.status, friendly, "http", raw.slice(0, DETAIL_MAX));
  }

  return (await res.json()) as T;
}

export type MenuItem = { sku: string; name: string; priceCents: number; description: string };
export type OrderItemInput = { sku: string; quantity: number };

export type DeliveryAddressInput = {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
};

// A 200 response either way — "not deliverable" is a normal checkout outcome
// (typo, too far, outside Berlin), not an HTTP error. Only a genuinely broken
// request (invalid_input) throws ApiError, via apiFetch's normal !res.ok
// handling. Delivery pricing is a bundled local dataset (see
// worker/src/lib/plzLookup.ts), not a live API, so there is no "provider
// outage" case to handle here at all.
export type DeliveryQuote =
  | {
      ok: true;
      deliverable: true;
      feeCents: number;
      distanceKm: number;
      lat: number;
      lng: number;
      resolvedAddress: string;
    }
  | { ok: true; deliverable: false; reason: "outside_berlin" | "too_far"; distanceKm: number }
  | { ok: true; deliverable: false; reason: "address_not_found" };

// Lightweight, postal-code-only variant of DeliveryQuote - no
// lat/lng/resolvedAddress, since checkPostalCode below never collects a
// full street address. Used for the order page's live-as-you-type check.
export type PostalCodeCheckResult =
  | { ok: true; deliverable: true; feeCents: number; distanceKm: number }
  | { ok: true; deliverable: false; reason: "outside_berlin" | "too_far"; distanceKm: number }
  | { ok: true; deliverable: false; reason: "address_not_found" };

export type OrderInput = {
  items: OrderItemInput[];
  deliveryDate: string;
  fulfillmentType: "pickup" | "delivery";
  address?: DeliveryAddressInput;
  // customerEmail/customerPhone are deliberately absent - every order now
  // requires a logged-in account, and the server always takes the locked
  // email/phone from that account (see submitOrder's token param below).
  customerName: string;
  notes?: string;
};
export type OrderResult = {
  orderId: string;
  deliveryDate: string;
  fulfillmentType: "pickup" | "delivery";
  /** Optional rather than required on purpose: the frontend and the worker
   * deploy through separate pipelines, so a build of this app can be live
   * against a backend that doesn't send `address` yet. The confirmation
   * screen renders it only when present, which means the two deploys can
   * land in either order without a broken window. */
  address?: DeliveryAddressInput | null;
  distanceKm: number | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  paymentMethod: "cash_on_delivery";
};

export type PublicCustomer = {
  id: string;
  phone: string;
  email: string;
  name: string;
  dateOfBirth: string;
  address: DeliveryAddressInput;
};

export type RegisterInput = {
  phone: string;
  name: string;
  dateOfBirth: string;
  address: DeliveryAddressInput;
  email: string;
  password: string;
};

export type AuthResult = { token: string; customer: PublicCustomer };

function authHeader(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

// --- Marketing/behavioral events ---
// Mirrors worker/src/schemas.ts's EventInputSchema exactly - see that
// file's own comment on why this list is a manual, cross-repo contract with
// the warehouse's event_taxonomy seed (dhaka_kacchi_ai_harness's
// ARCHITECTURE.md section 4.7), nothing enforcing sync.
export type WarehouseEventName =
  | "page_view"
  | "menu_view"
  | "product_view"
  | "add_to_cart"
  | "begin_checkout"
  | "purchase"
  | "coupon_used"
  | "social_click"
  | "contact"
  | "newsletter_signup";

export type EventInput = {
  eventName: WarehouseEventName;
  anonymousId?: string;
  sessionId?: string;
  orderId?: string;
  properties?: Record<string, unknown>;
};

// --- Admin panel ---
// A separate type/identity space from the customer types above - an admin
// token and a customer token (and their user records) are never
// interchangeable, mirroring the backend's own separate admin_users/
// admin_sessions tables and adminBearerAuth security scheme.

export type OrderStatus = "received" | "confirmed" | "delivered" | "cancelled";

export type AdminUser = { id: string; email: string; name: string };
export type AdminAuthResult = { token: string; adminUser: AdminUser };

export type AdminOrderItem = {
  sku: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
};

/** An order as its own customer sees it - narrower than AdminOrder, which
 * also carries the customer's own contact details and internal fields. */
export type CustomerOrder = {
  id: string;
  createdAt: string;
  deliveryDate: string;
  fulfillmentType: "pickup" | "delivery";
  address: DeliveryAddressInput | null;
  distanceKm: number | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  discountReason: string | null;
  totalCents: number;
  status: OrderStatus;
  notes: string | null;
  items: { sku: string; name: string; unitPriceCents: number; quantity: number }[];
};

export type AdminOrder = {
  id: string;
  createdAt: string;
  deliveryDate: string;
  fulfillmentType: "pickup" | "delivery";
  address: DeliveryAddressInput | null;
  distanceKm: number | null;
  deliveryFeeCents: number;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string | null;
  subtotalCents: number;
  discountCents: number;
  discountReason: string | null;
  totalCents: number;
  status: OrderStatus;
  createdBy: "customer" | "staff";
  items: AdminOrderItem[];
};

export type AdminOrderListFilters = {
  deliveryDate?: string;
  status?: OrderStatus;
  search?: string;
};

// --- Admin reporting (reads the sibling dhaka_kacchi_ai_harness warehouse -
// see worker/src/lib/reportingRepository.ts. May be entirely absent
// (WAREHOUSE_DATABASE_URL unset) - the getReporting() call below surfaces
// that as an ordinary 503 apiFetch error, not a special case here. ---

export type SocialPlatformSummary = {
  platform: string;
  postCount: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalImpressions: number;
  totalReach: number;
};

export type RecentSocialPost = {
  platform: string;
  externalId: string;
  postedAt: string;
  permalink: string | null;
  contentType: string | null;
  caption: string | null;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
};

export type ChannelFunnelRow = {
  channel: string;
  campaign: string;
  eventName: string;
  eventCount: number;
};

export type ChannelRevenueRow = {
  channel: string;
  campaign: string;
  purchaseEvents: number;
  matchedOrders: number;
  grossRevenue: number;
};

export type AdminReportingResult = {
  socialPlatformSummary: SocialPlatformSummary[];
  recentSocialPosts: RecentSocialPost[];
  channelFunnel: ChannelFunnelRow[];
  channelRevenue: ChannelRevenueRow[];
  attributionCoverage: { attributed: number; unattributed: number };
};

// Only required when the order isn't for an existing customer - a phone/
// WhatsApp order realistically may not come with an email or DOB, so both
// are optional here (the backend fills in a placeholder - see
// worker/src/index.ts's adminCreateOrderRoute).
export type AdminNewCustomerInput = {
  phone: string;
  name: string;
  email?: string;
  dateOfBirth?: string;
  address?: DeliveryAddressInput;
};

export type AdminOrderInput = {
  items: OrderItemInput[];
  deliveryDate: string;
  fulfillmentType: "pickup" | "delivery";
  address?: DeliveryAddressInput;
  customerName: string;
  notes?: string;
  // Exactly one of these two - the admin order-creation form enforces this
  // in its own flow (search first, only show "create new" once a search
  // comes up empty), same "exactly one of" contract as the backend route.
  existingCustomerId?: string;
  newCustomer?: AdminNewCustomerInput;
};

export type AdminDiscountInput = { discountCents: number; discountReason?: string };

// Staff correcting an already-placed order - items and delivery details
// only, mirroring AdminOrderUpdateInputSchema on the backend. No
// customerName/existingCustomerId/newCustomer: this call never changes which
// customer an order belongs to.
export type AdminOrderUpdateInput = {
  items: OrderItemInput[];
  deliveryDate: string;
  fulfillmentType: "pickup" | "delivery";
  address?: DeliveryAddressInput;
};

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

// Endpoints whose handler awaits an outbound side effect (SMTP, SMS,
// Telegram) BEFORE responding get a much longer timeout than a plain read.
// worker/src/index.ts commits the order and then awaits emitOrderCreated(),
// which fans out to email + Telegram and waits for all of them, so a short
// timeout here would abort after the order already exists and the customer's
// confirmation email has already gone out - and the customer would re-submit.
const SIDE_EFFECT_TIMEOUT_MS = 45_000;
const ORDER_TIMEOUT_MS = 60_000;

export const api = {
  subscribe: (email: string) =>
    apiFetch<{ ok: true }>("/subscribe", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  // Every ordering endpoint lives under /v1 on the backend (see
  // worker/src/index.ts) - versioned from day one so a future breaking
  // change never has to retrofit a prefix onto paths a real client (or
  // this frontend) already depends on. /subscribe is unrelated - it isn't
  // implemented in worker/ yet (see BACKEND.md), so it stays unprefixed.
  getMenu: () => apiFetch<{ items: MenuItem[] }>("/v1/menu"),
  getAvailability: () => apiFetch<{ dates: string[] }>("/v1/availability"),
  quoteDelivery: (address: DeliveryAddressInput) =>
    apiFetch<DeliveryQuote>("/v1/delivery-quote", {
      method: "POST",
      body: JSON.stringify(address),
    }),
  checkPostalCode: (postalCode: string) =>
    apiFetch<PostalCodeCheckResult>(
      `/v1/postal-code-check?postalCode=${encodeURIComponent(postalCode)}`,
    ),
  submitOrder: (order: OrderInput, token: string) =>
    apiFetch<OrderResult>(
      "/v1/orders",
      {
        method: "POST",
        headers: authHeader(token),
        body: JSON.stringify(order),
      },
      { timeoutMs: ORDER_TIMEOUT_MS },
    ),

  // --- Customer accounts ---
  register: (input: RegisterInput) =>
    apiFetch<{ phone: string; expiresAt: string; message: string }>(
      "/v1/auth/register",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      { timeoutMs: SIDE_EFFECT_TIMEOUT_MS }, // awaits sendOtpSms
    ),
  verifyOtp: (input: { phone: string; code: string }) =>
    apiFetch<AuthResult>("/v1/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  login: (input: { identifier: string; password: string }) =>
    apiFetch<AuthResult>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  logout: (token: string) =>
    apiFetch<void>("/v1/auth/logout", { method: "POST", headers: authHeader(token) }),
  getMe: (token: string) =>
    apiFetch<{ customer: PublicCustomer }>("/v1/me", { headers: authHeader(token) }),
  // The customer's own order history. The backend scopes both of these to the
  // session's customer id - getMyOrder returns 404 (never 403) for someone
  // else's order, so an id can't be used to probe for existence.
  listMyOrders: (token: string) =>
    apiFetch<{ orders: CustomerOrder[] }>("/v1/orders", { headers: authHeader(token) }),
  getMyOrder: (token: string, orderId: string) =>
    apiFetch<{ order: CustomerOrder }>(`/v1/orders/${encodeURIComponent(orderId)}`, {
      headers: authHeader(token),
    }),
  requestPasswordReset: (email: string) =>
    apiFetch<{ message: string }>(
      "/v1/auth/password-reset/request",
      {
        method: "POST",
        body: JSON.stringify({ email }),
      },
      { timeoutMs: SIDE_EFFECT_TIMEOUT_MS }, // awaits sendPasswordResetEmail
    ),
  confirmPasswordReset: (token: string, newPassword: string) =>
    apiFetch<{ message: string }>("/v1/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    }),

  // Deliberately no timeoutMs override (short DEFAULT_TIMEOUT_MS is fine -
  // and no caller should ever wait on this) and no auth header - the worker
  // route is public (fired from anonymous, logged-out page loads). Called
  // through analytics.ts's trackWarehouseEvent, never directly.
  trackEvent: (input: EventInput) =>
    apiFetch<{ id: string }>("/v1/events", { method: "POST", body: JSON.stringify(input) }),
};

export const adminApi = {
  login: (input: { email: string; password: string }) =>
    apiFetch<AdminAuthResult>("/v1/admin/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  logout: (token: string) =>
    apiFetch<void>("/v1/admin/logout", { method: "POST", headers: authHeader(token) }),
  getMe: (token: string) =>
    apiFetch<{ adminUser: AdminUser }>("/v1/admin/me", { headers: authHeader(token) }),
  listOrders: (token: string, filters: AdminOrderListFilters = {}) =>
    apiFetch<{ orders: AdminOrder[] }>(`/v1/admin/orders${buildQuery(filters)}`, {
      headers: authHeader(token),
    }),
  getOrder: (token: string, orderId: string) =>
    apiFetch<{ order: AdminOrder }>(`/v1/admin/orders/${encodeURIComponent(orderId)}`, {
      headers: authHeader(token),
    }),
  searchCustomer: (token: string, identifier: string) =>
    apiFetch<{ customer: PublicCustomer | null }>(
      `/v1/admin/customers/search${buildQuery({ identifier })}`,
      { headers: authHeader(token) },
    ),
  getReporting: (token: string) =>
    apiFetch<AdminReportingResult>("/v1/admin/reporting", { headers: authHeader(token) }),
  createOrder: (token: string, input: AdminOrderInput) =>
    apiFetch<{ order: AdminOrder }>(
      "/v1/admin/orders",
      {
        method: "POST",
        headers: authHeader(token),
        body: JSON.stringify(input),
      },
      { timeoutMs: ORDER_TIMEOUT_MS }, // awaits emitOrderCreated, same as the public route
    ),
  applyDiscount: (token: string, orderId: string, input: AdminDiscountInput) =>
    apiFetch<{ order: AdminOrder }>(
      `/v1/admin/orders/${encodeURIComponent(orderId)}/discount`,
      {
        method: "PATCH",
        headers: authHeader(token),
        body: JSON.stringify(input),
      },
      { timeoutMs: SIDE_EFFECT_TIMEOUT_MS }, // awaits discount email + Telegram
    ),
  updateStatus: (token: string, orderId: string, status: OrderStatus) =>
    apiFetch<{ order: AdminOrder }>(
      `/v1/admin/orders/${encodeURIComponent(orderId)}/status`,
      {
        method: "PATCH",
        headers: authHeader(token),
        body: JSON.stringify({ status }),
      },
      { timeoutMs: SIDE_EFFECT_TIMEOUT_MS }, // may fan out to email + Telegram
    ),
  updateOrder: (token: string, orderId: string, input: AdminOrderUpdateInput) =>
    apiFetch<{ order: AdminOrder }>(
      `/v1/admin/orders/${encodeURIComponent(orderId)}`,
      {
        method: "PATCH",
        headers: authHeader(token),
        body: JSON.stringify(input),
      },
      { timeoutMs: SIDE_EFFECT_TIMEOUT_MS }, // awaits update email + Telegram
    ),
};

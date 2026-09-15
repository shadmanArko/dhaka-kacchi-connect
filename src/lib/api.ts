/**
 * Single fetch seam for calling your backend (built separately, e.g. with Claude Code).
 *
 * Configure via `.env`:
 *   VITE_API_BASE_URL=https://your-backend.example.com
 *
 * All frontend HTTP calls should go through this file so swapping backends
 * (or later moving endpoints into TanStack `createServerFn`) is a one-file change.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) {
    throw new ApiError(0, "VITE_API_BASE_URL is not configured");
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    // The worker's error responses are JSON, e.g. { error: "..." } or
    // { error: "...", message: "..." } — surface the human-readable field,
    // not the raw response body. Falls back to the raw text only if the body
    // isn't the JSON shape we expect, so a non-JSON error (a proxy's HTML
    // error page, say) still shows something rather than throwing again.
    const raw = await res.text().catch(() => res.statusText);
    let friendly = raw;
    try {
      const body = JSON.parse(raw) as { message?: unknown; error?: unknown };
      if (typeof body.message === "string") friendly = body.message;
      else if (typeof body.error === "string") friendly = body.error;
    } catch {
      // not JSON — keep the raw text
    }
    throw new ApiError(res.status, friendly);
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

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

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
    apiFetch<OrderResult>("/v1/orders", {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify(order),
    }),

  // --- Customer accounts ---
  register: (input: RegisterInput) =>
    apiFetch<{ phone: string; expiresAt: string; message: string }>("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),
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
  requestPasswordReset: (email: string) =>
    apiFetch<{ message: string }>("/v1/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  confirmPasswordReset: (token: string, newPassword: string) =>
    apiFetch<{ message: string }>("/v1/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    }),
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
  createOrder: (token: string, input: AdminOrderInput) =>
    apiFetch<{ order: AdminOrder }>("/v1/admin/orders", {
      method: "POST",
      headers: authHeader(token),
      body: JSON.stringify(input),
    }),
  applyDiscount: (token: string, orderId: string, input: AdminDiscountInput) =>
    apiFetch<{ order: AdminOrder }>(`/v1/admin/orders/${encodeURIComponent(orderId)}/discount`, {
      method: "PATCH",
      headers: authHeader(token),
      body: JSON.stringify(input),
    }),
  updateStatus: (token: string, orderId: string, status: OrderStatus) =>
    apiFetch<{ order: AdminOrder }>(`/v1/admin/orders/${encodeURIComponent(orderId)}/status`, {
      method: "PATCH",
      headers: authHeader(token),
      body: JSON.stringify({ status }),
    }),
};

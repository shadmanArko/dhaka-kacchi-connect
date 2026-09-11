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

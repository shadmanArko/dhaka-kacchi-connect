import { DELIVERY_FEE_TIERS, KITCHEN_LOCATION } from "../data";
import { haversineKm } from "./geo";
import { lookupPostalCode } from "./plzLookup";

export type DeliveryAddressInput = {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
};

export type DeliveryQuoteResult =
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
  | { ok: true; deliverable: false; reason: "address_not_found" }
  | { ok: false; reason: "invalid_input"; message: string };

const GERMAN_POSTAL_CODE = /^\d{5}$/;

function validateInput(a: DeliveryAddressInput): string | null {
  if (!a.street?.trim()) return "Street is required.";
  if (!a.houseNumber?.trim()) return "House number is required.";
  if (!GERMAN_POSTAL_CODE.test(a.postalCode?.trim() ?? "")) {
    return "Postal code must be a 5-digit German PLZ.";
  }
  if (!a.city?.trim()) return "City is required.";
  return null;
}

/** feeCents for a given distance, per the ordered, contiguous DELIVERY_FEE_TIERS
 * table - the first tier whose maxKm is not exceeded. null beyond the last tier. */
function feeForDistance(distanceKm: number): number | null {
  const tier = DELIVERY_FEE_TIERS.find((t) => distanceKm <= t.maxKm);
  return tier ? tier.feeCents : null;
}

type PostalCodeLookupResult =
  | {
      ok: true;
      deliverable: true;
      feeCents: number;
      distanceKm: number;
      lat: number;
      lng: number;
    }
  | { ok: true; deliverable: false; reason: "outside_berlin" | "too_far"; distanceKm: number }
  | { ok: true; deliverable: false; reason: "address_not_found" }
  | { ok: false; reason: "invalid_input"; message: string };

/** Shared by both quoteDeliveryForAddress and checkPostalCode below - the
 * postal code lookup, Berlin check, and fee-tier lookup are identical either
 * way; only whether a full address (and therefore lat/lng/resolvedAddress)
 * is available differs. */
function lookupAndPriceByPostalCode(postalCodeRaw: string): PostalCodeLookupResult {
  const postalCode = postalCodeRaw?.trim() ?? "";
  if (!GERMAN_POSTAL_CODE.test(postalCode)) {
    return {
      ok: false,
      reason: "invalid_input",
      message: "Postal code must be a 5-digit German PLZ.",
    };
  }

  const lookup = lookupPostalCode(postalCode);
  if (!lookup.ok) {
    return { ok: true, deliverable: false, reason: "address_not_found" };
  }

  const distanceKm = haversineKm(
    KITCHEN_LOCATION.lat,
    KITCHEN_LOCATION.lng,
    lookup.lat,
    lookup.lng,
  );

  if (!lookup.isBerlin) {
    return { ok: true, deliverable: false, reason: "outside_berlin", distanceKm };
  }

  const feeCents = feeForDistance(distanceKm);
  if (feeCents === null) {
    return { ok: true, deliverable: false, reason: "too_far", distanceKm };
  }

  return { ok: true, deliverable: true, feeCents, distanceKm, lat: lookup.lat, lng: lookup.lng };
}

export type PostalCodeCheckResult =
  | { ok: true; deliverable: true; feeCents: number; distanceKm: number }
  | { ok: true; deliverable: false; reason: "outside_berlin" | "too_far"; distanceKm: number }
  | { ok: true; deliverable: false; reason: "address_not_found" }
  | { ok: false; reason: "invalid_input"; message: string };

/**
 * Lightweight, postal-code-only deliverability + fee check - used by
 * GET /v1/postal-code-check for the order page's live-as-you-type
 * validation (no button, no full address needed). Deliberately a separate
 * function/response shape from quoteDeliveryForAddress below rather than
 * loosening that one's required fields: DeliveryAddressSchema (its request
 * shape) is shared with POST /orders's embedded address, so relaxing it
 * there would also loosen real order validation.
 */
export function checkPostalCode(postalCode: string): PostalCodeCheckResult {
  const result = lookupAndPriceByPostalCode(postalCode);
  if (result.ok && result.deliverable) {
    const { feeCents, distanceKm } = result;
    return { ok: true, deliverable: true, feeCents, distanceKm };
  }
  return result;
}

/**
 * The one shared pipeline behind both POST /delivery-quote and POST /orders.
 * Calling it twice for the same order (once for the customer-facing quote,
 * once as the server's own authoritative re-check at order time) is
 * deliberate - see index.ts. Never trust a client-supplied fee/distance.
 *
 * Fully self-contained: postal code lookup (plzLookup.ts) is a synchronous
 * read from a dataset bundled with the Worker - no external API, no account,
 * no cost, no network round-trip, no rate limit, nothing that can be "down."
 * A tier or price change only ever means editing DELIVERY_FEE_TIERS in
 * data.ts.
 */
export function quoteDeliveryForAddress(address: DeliveryAddressInput): DeliveryQuoteResult {
  const validationError = validateInput(address);
  if (validationError) {
    return { ok: false, reason: "invalid_input", message: validationError };
  }

  const postalCode = address.postalCode.trim();
  const result = lookupAndPriceByPostalCode(postalCode);
  if (!result.ok || !result.deliverable) {
    return result;
  }

  const resolvedAddress = `${address.street.trim()} ${address.houseNumber.trim()}, ${postalCode} ${address.city.trim()}`;
  return {
    ok: true,
    deliverable: true,
    feeCents: result.feeCents,
    distanceKm: result.distanceKm,
    lat: result.lat,
    lng: result.lng,
    resolvedAddress,
  };
}

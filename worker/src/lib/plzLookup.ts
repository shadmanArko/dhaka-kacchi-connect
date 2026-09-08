import postalCodeCoordinates from "../data/postal-code-coordinates.json";
import berlinPostalCodes from "../data/berlin-postal-codes.json";

/*
 * Data provenance (both bundled, no live dependency, no cost, no account):
 *
 * postal-code-coordinates.json — every German postal code (PLZ) and its
 *   geographic center, from WZBSocialScienceCenter/plz_geocoord (Apache
 *   License 2.0), itself derived from Destatis (Germany's Federal
 *   Statistical Office) municipal registry data. 8298 entries, ~240KB -
 *   trivial to bundle into the Worker.
 *
 * berlin-postal-codes.json — the 190 postal codes whose Bundesland is
 *   Berlin (Berlin is a city-state, so this is exact and unambiguous -
 *   there is no "mostly Berlin" postal code the way there can be for an
 *   ordinary city district).
 *
 * Verified against 10 real-world coordinates before this replaced the
 * geocoding-API approach: correctly excludes Brandenburg border towns
 * (Falkensee, Teltow, Hohen Neuendorf, Potsdam) that sit within a few km of
 * Berlin's edge, and correctly includes far Berlin districts (Kladow,
 * Lichtenrade, Köpenick) and the Steinstücken exclave.
 */

// The JSON's array literals are inferred as number[], not the tuple
// [number, number] - cast once here rather than typing every one of the
// 8298 entries by hand.
const COORDS = postalCodeCoordinates as unknown as Record<string, [number, number]>;
const BERLIN_PLZ: ReadonlySet<string> = new Set(berlinPostalCodes);

export type PlzLookupResult =
  | { ok: true; lat: number; lng: number; isBerlin: boolean }
  | { ok: false; reason: "not_found" };

/**
 * Looks up a German postal code against the bundled dataset. Synchronous, no
 * network call, no cost, no account, no rate limit - the "geocoding" is just
 * reading a value out of a table shipped with the Worker.
 *
 * Deliberately keyed on the postal code the customer typed, not a full
 * geocoded street address: the delivery fee tiers are 5km bands, so a
 * postal code's centroid is precise enough to pick the right tier in all but
 * the rare case of an address sitting right at a tier boundary. Street and
 * house number are still collected and stored for the courier to actually
 * find the address - they just aren't needed for pricing.
 */
export function lookupPostalCode(postalCode: string): PlzLookupResult {
  const coords = COORDS[postalCode];
  if (!coords) {
    return { ok: false, reason: "not_found" };
  }
  const [lat, lng] = coords;
  return { ok: true, lat, lng, isBerlin: BERLIN_PLZ.has(postalCode) };
}

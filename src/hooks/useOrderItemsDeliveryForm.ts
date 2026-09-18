import { useEffect, useMemo, useState } from "react";
import { api, type MenuItem, type PostalCodeCheckResult } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export type LoadState = "loading" | "ready" | "error";

// Mirrors worker/src/lib/dates.ts's isValidSaturday - the backend is the
// real authority (this is a client-side convenience check only, to catch a
// mis-picked date before a round trip), and deliberately doesn't replicate
// the Friday-18:00 cutoff check at all: skipping that cutoff is the entire
// point of both the admin "new order" form and the "edit order" panel.
export function isSaturday(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 6;
}

export type OrderItemsDeliveryInitial = {
  quantities?: Record<string, number>;
  deliveryDate?: string;
  fulfillmentType?: "pickup" | "delivery";
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  /** The delivery fee/distance already committed for this order (edit mode
   * only, absent for the empty "new order" form). Shown as-is until the
   * staff member edits an address field, at which point a fresh live quote
   * takes over - so opening "edit" on a delivery order doesn't make its fee
   * look unknown/blocked just because nothing has been retyped yet. */
  knownDeliveryFeeCents?: number;
  knownDistanceKm?: number | null;
};

/**
 * Item selection + delivery-details state shared by the admin "new order"
 * form and the "edit order" panel: menu loading, per-SKU quantities,
 * Saturday-date validation, and the live postal-code-based delivery-fee
 * quote (mirrors the public order page's own postal-code check). Neither
 * caller talks to api.getMenu()/api.checkPostalCode() directly - this hook
 * is the one place that logic lives, so both forms stay in lockstep with
 * whatever the backend actually validates.
 */
export function useOrderItemsDeliveryForm(initial?: OrderItemsDeliveryInitial) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [menuState, setMenuState] = useState<LoadState>("loading");
  const [menuRetryCount, setMenuRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setMenuState("loading");
    api
      .getMenu()
      .then((res) => {
        if (cancelled) return;
        setMenu(res.items);
        setMenuState("ready");
      })
      .catch(() => {
        if (!cancelled) setMenuState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [menuRetryCount]);
  function retryMenu() {
    setMenuRetryCount((n) => n + 1);
  }

  // --- Items --------------------------------------------------------------
  const [quantities, setQuantities] = useState<Record<string, number>>(initial?.quantities ?? {});
  const itemCount = useMemo(
    () => Object.values(quantities).reduce((sum, q) => sum + q, 0),
    [quantities],
  );
  const subtotalCents = useMemo(
    () => menu.reduce((sum, item) => sum + (quantities[item.sku] ?? 0) * item.priceCents, 0),
    [menu, quantities],
  );
  function setQty(sku: string, qty: number) {
    setQuantities((prev) => ({ ...prev, [sku]: Math.max(0, qty) }));
  }

  // --- Delivery date + fulfillment ----------------------------------------
  const [deliveryDate, setDeliveryDate] = useState(initial?.deliveryDate ?? "");
  const [fulfillmentType, setFulfillmentType] = useState<"pickup" | "delivery">(
    initial?.fulfillmentType ?? "pickup",
  );
  const [street, setStreet] = useState(initial?.street ?? "");
  const [houseNumber, setHouseNumber] = useState(initial?.houseNumber ?? "");
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? "");
  const [city, setCity] = useState(initial?.city ?? "Berlin");

  const hasKnownQuote =
    initial?.fulfillmentType === "delivery" && initial.knownDeliveryFeeCents !== undefined;
  const [usingKnownQuote, setUsingKnownQuote] = useState(hasKnownQuote);

  const [quoteState, setQuoteState] = useState<"idle" | "checking" | "ready" | "error">(
    hasKnownQuote ? "ready" : "idle",
  );
  const [liveQuote, setLiveQuote] = useState<PostalCodeCheckResult | null>(null);
  const [quoteError, setQuoteError] = useState("");

  function resetQuote() {
    setUsingKnownQuote(false);
    setQuoteState("idle");
    setLiveQuote(null);
    setQuoteError("");
  }

  function changeFulfillmentType(next: "pickup" | "delivery") {
    setFulfillmentType(next);
    resetQuote();
  }

  // Same live, no-button postal-code check as the public order page (see
  // routes/order.tsx) - deliverability/fee is entirely postal-code-derived
  // server-side, so this works identically here. Skipped while a known,
  // already-committed quote is still showing (see resetQuote/usingKnownQuote
  // above) - editing an address field turns this back on.
  const debouncedPostalCode = useDebouncedValue(postalCode.trim(), 400);
  useEffect(() => {
    if (fulfillmentType !== "delivery" || usingKnownQuote) return;
    if (!/^\d{5}$/.test(debouncedPostalCode)) {
      setQuoteState("idle");
      setLiveQuote(null);
      setQuoteError("");
      return;
    }
    let cancelled = false;
    setQuoteState("checking");
    setQuoteError("");
    api
      .checkPostalCode(debouncedPostalCode)
      .then((q) => {
        if (cancelled) return;
        setLiveQuote(q);
        if (q.deliverable) setQuoteState("ready");
        else {
          setQuoteState("error");
          setQuoteError(
            q.reason === "address_not_found"
              ? "We couldn't find that postal code."
              : "That address is outside Berlin or too far for delivery.",
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQuoteState("error");
          setQuoteError("Couldn't check that postal code right now.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedPostalCode, fulfillmentType, usingKnownQuote]);

  // The quote consumers see - either the live postal-code check, or (edit
  // mode, address untouched) a synthetic deliverable quote built from the
  // order's already-committed fee/distance. Keeping both in the same shape
  // means rendering code never has to know which one it's looking at.
  const quote: PostalCodeCheckResult | null = usingKnownQuote
    ? {
        ok: true,
        deliverable: true,
        feeCents: initial!.knownDeliveryFeeCents!,
        distanceKm: initial?.knownDistanceKm ?? 0,
      }
    : liveQuote;

  const deliveryFeeCents = quote?.deliverable ? quote.feeCents : 0;
  const subtotalTotalCents = subtotalCents + deliveryFeeCents;
  const fulfillmentReady =
    fulfillmentType === "pickup" || (quoteState === "ready" && quote?.deliverable === true);
  const dateValid = isSaturday(deliveryDate);

  function itemsPayload() {
    return Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([sku, quantity]) => ({ sku, quantity }));
  }

  function addressPayload() {
    return fulfillmentType === "delivery"
      ? {
          street: street.trim(),
          houseNumber: houseNumber.trim(),
          postalCode: postalCode.trim(),
          city: city.trim(),
        }
      : undefined;
  }

  return {
    menu,
    menuState,
    retryMenu,
    quantities,
    setQty,
    itemCount,
    subtotalCents,
    deliveryDate,
    setDeliveryDate,
    dateValid,
    fulfillmentType,
    setFulfillmentType: changeFulfillmentType,
    street,
    setStreet: (v: string) => {
      setStreet(v);
      resetQuote();
    },
    houseNumber,
    setHouseNumber: (v: string) => {
      setHouseNumber(v);
      resetQuote();
    },
    postalCode,
    setPostalCode: (v: string) => {
      setPostalCode(v);
      resetQuote();
    },
    city,
    setCity,
    quoteState,
    quote,
    quoteError,
    deliveryFeeCents,
    totalCents: subtotalTotalCents,
    fulfillmentReady,
    itemsPayload,
    addressPayload,
  };
}

import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  adminApi,
  api,
  ApiError,
  type MenuItem,
  type PostalCodeCheckResult,
  type PublicCustomer,
} from "@/lib/api";
import { useAdminSession } from "@/hooks/useAdminSession";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/_layout/orders/new")({
  head: () => ({ meta: [{ title: "New order — Dhaka Kacchi Admin" }] }),
  component: AdminNewOrderPage,
});

type LoadState = "loading" | "ready" | "error";

function formatEuro(cents: number) {
  return `€${(cents / 100).toFixed(2)}`;
}

// Mirrors worker/src/lib/dates.ts's isValidSaturday - the backend is the
// real authority (this is a client-side convenience check only, to catch a
// mis-picked date before a round trip), and deliberately doesn't replicate
// the Friday-18:00 cutoff check at all: skipping that cutoff is the entire
// point of this admin form.
function isSaturday(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 6;
}

function AdminNewOrderPage() {
  const session = useAdminSession();
  const navigate = useNavigate();

  // Same load/retry shape as the admin order list (_layout.index.tsx), minus
  // its session-token guard - api.getMenu() is public and takes no token. The
  // state matters for more than a spinner: with an empty menu the form still
  // renders and submits, producing a EUR 0 order with no items, so the submit
  // button is gated on "ready" below.
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

  // --- Customer resolution -------------------------------------------
  const [searchIdentifier, setSearchIdentifier] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState<PublicCustomer | null>(null);
  const [useExisting, setUseExisting] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newDateOfBirth, setNewDateOfBirth] = useState("");
  const [customerName, setCustomerName] = useState("");

  const customerResolved = useExisting || creatingNew;

  async function runSearch() {
    if (!searchIdentifier.trim() || !session.token) return;
    setSearching(true);
    setUseExisting(false);
    setCreatingNew(false);
    try {
      const { customer } = await adminApi.searchCustomer(session.token, searchIdentifier.trim());
      setFoundCustomer(customer);
      setSearchedOnce(true);
      if (!customer) {
        // Nothing found - jump straight into "create new," pre-filled with
        // whatever they searched (a phone number, most likely).
        setNewPhone(searchIdentifier.trim());
        setCreatingNew(true);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't search right now.");
    } finally {
      setSearching(false);
    }
  }

  function useFoundCustomer() {
    if (!foundCustomer) return;
    setUseExisting(true);
    setCustomerName(foundCustomer.name);
  }

  function startOver() {
    setSearchedOnce(false);
    setFoundCustomer(null);
    setUseExisting(false);
    setCreatingNew(false);
    setSearchIdentifier("");
    setCustomerName("");
  }

  // --- Items ------------------------------------------------------------
  const [quantities, setQuantities] = useState<Record<string, number>>({});
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

  // --- Delivery date + fulfillment ---------------------------------------
  const [deliveryDate, setDeliveryDate] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<"pickup" | "delivery">("pickup");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("Berlin");
  const [notes, setNotes] = useState("");

  const [quoteState, setQuoteState] = useState<"idle" | "checking" | "ready" | "error">("idle");
  const [quote, setQuote] = useState<PostalCodeCheckResult | null>(null);
  const [quoteError, setQuoteError] = useState("");

  function resetQuote() {
    setQuoteState("idle");
    setQuote(null);
    setQuoteError("");
  }

  // Same live, no-button postal-code check as the public order page (see
  // routes/order.tsx) - deliverability/fee is entirely postal-code-derived
  // server-side, so this works identically here.
  const debouncedPostalCode = useDebouncedValue(postalCode.trim(), 400);
  useEffect(() => {
    if (fulfillmentType !== "delivery") return;
    if (!/^\d{5}$/.test(debouncedPostalCode)) {
      resetQuote();
      return;
    }
    let cancelled = false;
    setQuoteState("checking");
    setQuoteError("");
    api
      .checkPostalCode(debouncedPostalCode)
      .then((q) => {
        if (cancelled) return;
        setQuote(q);
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
  }, [debouncedPostalCode, fulfillmentType]);

  const deliveryFeeCents = quote?.deliverable ? quote.feeCents : 0;
  const totalCents = subtotalCents + deliveryFeeCents;
  const fulfillmentReady =
    fulfillmentType === "pickup" || (quoteState === "ready" && quote?.deliverable === true);
  const dateValid = isSaturday(deliveryDate);
  const canSubmit =
    // Without this a failed menu load leaves a form that looks usable but can
    // only produce an empty EUR 0 order.
    menuState === "ready" &&
    customerResolved &&
    itemCount > 0 &&
    dateValid &&
    fulfillmentReady &&
    customerName.trim().length > 0 &&
    (fulfillmentType === "pickup" || !!newPhone || useExisting); // phone always required for a new customer

  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !session.token) return;
    setSubmitting(true);
    try {
      const items = Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([sku, quantity]) => ({ sku, quantity }));

      const address =
        fulfillmentType === "delivery"
          ? {
              street: street.trim(),
              houseNumber: houseNumber.trim(),
              postalCode: postalCode.trim(),
              city: city.trim(),
            }
          : undefined;

      const result = await adminApi.createOrder(session.token, {
        items,
        deliveryDate,
        fulfillmentType,
        address,
        customerName: customerName.trim(),
        notes: notes.trim() || undefined,
        existingCustomerId: useExisting ? (foundCustomer?.id ?? undefined) : undefined,
        newCustomer: creatingNew
          ? {
              phone: newPhone.trim(),
              name: customerName.trim(),
              email: newEmail.trim() || undefined,
              dateOfBirth: newDateOfBirth || undefined,
              address,
            }
          : undefined,
      });

      toast.success(`Order created — ${formatEuro(result.order.totalCents)}`);
      navigate({ to: "/admin", search: { order: result.order.id } });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create the order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-sans text-xl font-medium">Record a phone/WhatsApp order</h1>

      <Card>
        <CardHeader>
          <CardTitle className="font-sans text-base">Customer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!searchedOnce && (
            <div className="flex gap-2">
              <Input
                placeholder="Phone (+491…) or email"
                value={searchIdentifier}
                onChange={(e) => setSearchIdentifier(e.target.value)}
              />
              <Button type="button" onClick={runSearch} disabled={searching}>
                {searching ? "Searching…" : "Search"}
              </Button>
            </div>
          )}

          {searchedOnce && foundCustomer && !useExisting && (
            <div className="space-y-2 rounded-md border border-border p-3 font-sans text-sm">
              <p>
                Found: <strong>{foundCustomer.name}</strong> · {foundCustomer.phone} ·{" "}
                {foundCustomer.email}
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={useFoundCustomer}>
                  Use this customer
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={startOver}>
                  Search again
                </Button>
              </div>
            </div>
          )}

          {useExisting && foundCustomer && (
            <div className="flex items-center justify-between rounded-md border border-border p-3 font-sans text-sm">
              <span>
                Using <strong>{foundCustomer.name}</strong> · {foundCustomer.phone}
              </span>
              <Button type="button" size="sm" variant="outline" onClick={startOver}>
                Change
              </Button>
            </div>
          )}

          {creatingNew && (
            <div className="space-y-3">
              {searchedOnce && (
                <div className="flex items-center justify-between font-sans text-sm text-muted-foreground">
                  <span>No existing customer found — creating a new one.</span>
                  <Button type="button" size="sm" variant="outline" onClick={startOver}>
                    Search again
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="new-phone">Phone</Label>
                  <Input
                    id="new-phone"
                    required
                    placeholder="+491701234567"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-name">Full name</Label>
                  <Input
                    id="new-name"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-email">Email (optional)</Label>
                  <Input
                    id="new-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-dob">Date of birth (optional)</Label>
                  <Input
                    id="new-dob"
                    type="date"
                    value={newDateOfBirth}
                    onChange={(e) => setNewDateOfBirth(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {customerResolved && (
        <form onSubmit={onSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-sans text-base">Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {menuState === "loading" && (
                <p className="font-sans text-sm text-muted-foreground">Loading menu…</p>
              )}
              {menuState === "error" && (
                <div className="py-4 text-center">
                  <p className="mb-3 font-sans text-sm text-muted-foreground">
                    Couldn't load the menu.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setMenuRetryCount((n) => n + 1)}
                  >
                    Retry
                  </Button>
                </div>
              )}
              {menuState === "ready" &&
                menu.map((item) => (
                  <div key={item.sku} className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-sans text-sm font-medium">{item.name}</p>
                      <p className="font-sans text-xs text-muted-foreground">
                        {formatEuro(item.priceCents)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setQty(item.sku, (quantities[item.sku] ?? 0) - 1)}
                      >
                        −
                      </Button>
                      <span className="w-6 text-center">{quantities[item.sku] ?? 0}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setQty(item.sku, (quantities[item.sku] ?? 0) + 1)}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-sans text-base">Delivery Saturday</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
              {deliveryDate && !dateValid && (
                <p className="font-sans text-sm text-destructive">
                  Must be a Saturday — the Friday-6pm cutoff doesn't apply here, but the date still
                  has to be a real Saturday.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-sans text-base">Pickup or delivery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={fulfillmentType === "pickup" ? "default" : "outline"}
                  onClick={() => {
                    setFulfillmentType("pickup");
                    resetQuote();
                  }}
                >
                  Pickup
                </Button>
                <Button
                  type="button"
                  variant={fulfillmentType === "delivery" ? "default" : "outline"}
                  onClick={() => {
                    setFulfillmentType("delivery");
                    resetQuote();
                  }}
                >
                  Delivery
                </Button>
              </div>

              {fulfillmentType === "delivery" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                    <Input
                      placeholder="Street"
                      value={street}
                      onChange={(e) => {
                        setStreet(e.target.value);
                        resetQuote();
                      }}
                    />
                    <Input
                      placeholder="No."
                      className="sm:w-20"
                      value={houseNumber}
                      onChange={(e) => {
                        setHouseNumber(e.target.value);
                        resetQuote();
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Postal code"
                      inputMode="numeric"
                      maxLength={5}
                      value={postalCode}
                      onChange={(e) => {
                        setPostalCode(e.target.value);
                        resetQuote();
                      }}
                    />
                    <Input
                      placeholder="City"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  {quoteState === "checking" && (
                    <p className="font-sans text-sm text-muted-foreground">Checking postal code…</p>
                  )}
                  {quoteState === "ready" && quote?.deliverable && (
                    <p className="font-sans text-sm">
                      {quote.distanceKm.toFixed(1)}km — delivery fee {formatEuro(quote.feeCents)}
                    </p>
                  )}
                  {quoteState === "error" && (
                    <p className="font-sans text-sm text-destructive">{quoteError}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <Textarea
                placeholder="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <div className="flex items-center justify-between border-t border-border pt-4">
                <span className="font-sans text-sm text-muted-foreground">
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
                <strong className="font-sans text-lg">{formatEuro(totalCents)}</strong>
              </div>
              <Button type="submit" className="w-full" disabled={!canSubmit || submitting}>
                {submitting ? "Creating…" : "Create order"}
              </Button>
            </CardContent>
          </Card>
        </form>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { PageHero } from "@/components/sections/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { CheckoutAuthModal } from "@/components/auth/CheckoutAuthModal";
import { useSession } from "@/hooks/useSession";
import { buildWaLink } from "@/lib/whatsapp";
import { api, ApiError, type DeliveryQuote, type MenuItem, type OrderResult } from "@/lib/api";

export const Route = createFileRoute("/order")({
  head: () => ({
    meta: [
      { title: "Order — Dhaka Kacchi Berlin" },
      {
        name: "description",
        content:
          "Order authentic Kacchi Biriyani & Borhani in Berlin. Saturday delivery, cash on delivery, order by Friday 6pm.",
      },
      { property: "og:title", content: "Order — Dhaka Kacchi Berlin" },
      {
        property: "og:description",
        content: "Pick your kacchi, your Saturday, and free pickup or doorstep delivery.",
      },
    ],
  }),
  component: OrderPage,
});

type LoadState = "loading" | "ready" | "error";
type SubmitState = "idle" | "submitting" | "success" | "error";
type QuoteState = "idle" | "checking" | "ready" | "error";
type FulfillmentType = "pickup" | "delivery";

const PICKUP_LABEL = "Leopoldplatz, Wedding — in front of Lidl";

function formatEuro(cents: number) {
  return `€${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function quoteErrorMessage(quote: DeliveryQuote): string {
  if (quote.deliverable) return "";
  switch (quote.reason) {
    case "address_not_found":
      return "We couldn't find that address. Please double-check it.";
    case "outside_berlin":
      return "That address is outside Berlin — delivery isn't available there. Free pickup is always an option.";
    case "too_far":
      return "That address is too far for delivery right now. Free pickup is always an option.";
  }
}

const inputClass =
  "px-4 py-4 bg-gold/[0.06] border border-line text-cream placeholder:text-muted-warm font-sans text-[0.88rem] outline-none focus:border-gold/50 transition-colors";
const lockedInputClass =
  "px-4 py-4 bg-gold/[0.02] border border-line text-muted-warm font-sans text-[0.88rem] outline-none cursor-not-allowed";

function OrderPage() {
  const session = useSession();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [dates, setDates] = useState<string[]>([]);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [deliveryDate, setDeliveryDate] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>("pickup");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("Berlin");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");

  const [quoteState, setQuoteState] = useState<QuoteState>("idle");
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");

  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<OrderResult | null>(null);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  // Tracks which logged-in customer the form fields were last prefilled
  // from, so a fresh login/registration (or restoring a stored session on
  // page load) prefills exactly once, without re-stomping later edits.
  const [prefilledForCustomerId, setPrefilledForCustomerId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getMenu(), api.getAvailability()])
      .then(([menuRes, datesRes]) => {
        setMenu(menuRes.items);
        setDates(datesRes.dates);
        setDeliveryDate(datesRes.dates[0] ?? "");
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, []);

  // Fills in name/address from the account the moment a session exists -
  // whether that's a fresh login/registration just now, or a stored session
  // restored on page load. Editable afterwards; see checkAddress's own
  // invalidation below for why editing an address doesn't re-run this.
  useEffect(() => {
    if (session.customer && session.customer.id !== prefilledForCustomerId) {
      setCustomerName(session.customer.name);
      setStreet(session.customer.address.street);
      setHouseNumber(session.customer.address.houseNumber);
      setPostalCode(session.customer.address.postalCode);
      setCity(session.customer.address.city);
      resetQuote();
      setPrefilledForCustomerId(session.customer.id);
    }
  }, [session.customer, prefilledForCustomerId]);

  const subtotalCents = useMemo(
    () => menu.reduce((sum, item) => sum + (quantities[item.sku] ?? 0) * item.priceCents, 0),
    [menu, quantities],
  );
  const itemCount = useMemo(
    () => Object.values(quantities).reduce((sum, q) => sum + q, 0),
    [quantities],
  );
  const deliveryFeeCents = quote?.deliverable ? quote.feeCents : 0;
  const totalCents = subtotalCents + deliveryFeeCents;

  function setQty(sku: string, qty: number) {
    setQuantities((prev) => ({ ...prev, [sku]: Math.max(0, qty) }));
  }

  // Any address edit after a quote was fetched invalidates it — never let a
  // stale quote for a different address silently carry over to submission.
  function resetQuote() {
    setQuoteState("idle");
    setQuote(null);
    setQuoteError("");
  }

  function selectFulfillment(type: FulfillmentType) {
    setFulfillmentType(type);
    resetQuote();
  }

  async function checkAddress() {
    if (!street.trim() || !houseNumber.trim() || !postalCode.trim() || !city.trim()) {
      setQuoteState("error");
      setQuoteError("Please fill in street, house number, postal code, and city.");
      return;
    }
    setQuoteState("checking");
    setQuoteError("");
    try {
      const q = await api.quoteDelivery({
        street: street.trim(),
        houseNumber: houseNumber.trim(),
        postalCode: postalCode.trim(),
        city: city.trim(),
      });
      setQuote(q);
      if (q.deliverable) {
        setQuoteState("ready");
      } else {
        setQuoteState("error");
        setQuoteError(quoteErrorMessage(q));
      }
    } catch (err) {
      setQuoteState("error");
      setQuoteError(
        err instanceof ApiError
          ? err.message
          : "Couldn't check that address right now. Please try again.",
      );
    }
  }

  // Everything needed before an account is involved - items, a date, and
  // (for delivery) a confirmed quote. Checkout requires all of this to open
  // the login/register pop-up at all.
  const canCheckout =
    itemCount > 0 &&
    !!deliveryDate &&
    (fulfillmentType === "pickup" || (quoteState === "ready" && quote?.deliverable === true));
  const canSubmit =
    canCheckout && !!session.customer && customerName.trim().length > 0 && !session.isLoading;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canCheckout || session.isLoading) return;

    if (!session.token || !session.customer) {
      setAuthModalOpen(true);
      return;
    }
    if (!customerName.trim()) return;

    setSubmitState("submitting");
    setSubmitError("");
    try {
      const items = Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([sku, quantity]) => ({ sku, quantity }));
      const res = await api.submitOrder(
        {
          items,
          deliveryDate,
          fulfillmentType,
          address:
            fulfillmentType === "delivery"
              ? {
                  street: street.trim(),
                  houseNumber: houseNumber.trim(),
                  postalCode: postalCode.trim(),
                  city: city.trim(),
                }
              : undefined,
          customerName: customerName.trim(),
          notes: notes.trim() || undefined,
        },
        session.token,
      );
      setResult(res);
      setSubmitState("success");
    } catch (err) {
      setSubmitState("error");
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : "Couldn't place your order right now. Please try again, or order via WhatsApp below.",
      );
    }
  }

  if (submitState === "success" && result) {
    return (
      <section className="bg-black-ink py-32 md:py-40 px-6 md:px-14 text-center min-h-screen flex items-center justify-center">
        <div className="max-w-[560px]">
          <h1 className="font-serif font-light text-cream text-[clamp(2.2rem,5vw,3.4rem)] mb-4">
            Order <em className="not-italic italic text-gold">confirmed</em>
          </h1>
          <div className="mx-auto my-7 h-px w-[50px] bg-gold" />
          <p className="font-sans text-[0.96rem] leading-[1.95] text-muted-warm mb-8">
            {result.fulfillmentType === "pickup" ? (
              <>
                Pickup on <strong className="text-cream">{formatDate(result.deliveryDate)}</strong>{" "}
                at <strong className="text-cream">{PICKUP_LABEL}</strong>.
              </>
            ) : (
              <>
                Doorstep delivery on{" "}
                <strong className="text-cream">{formatDate(result.deliveryDate)}</strong>.
              </>
            )}
            <br />
            Total: <strong className="text-cream">{formatEuro(result.totalCents)}</strong> — cash on
            delivery.
          </p>
          <p className="font-sans text-[0.8rem] text-muted-warm mb-8">
            Order reference: {result.orderId}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-4 font-sans text-[0.8rem] tracking-[0.25em] uppercase font-normal transition-all duration-300 no-underline border border-gold/40 text-cream px-9 py-[18px] hover:border-gold hover:text-gold hover:-translate-y-0.5"
          >
            <span>Back to Home</span>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <PageHero
        eyebrow="Order in Berlin"
        title={
          <>
            Choose your kacchi,
            <br />
            <em>choose your Saturday.</em>
          </>
        }
        body="We cook every Saturday. Free pickup at our Wedding kitchen, or doorstep delivery anywhere in Berlin. Cash on delivery — order by Friday 6pm for that week's batch."
      />

      <section className="bg-deep border-t border-line py-20 md:py-28 px-6 md:px-14">
        <Reveal className="max-w-[720px] mx-auto">
          {loadState === "loading" && (
            <p className="text-center font-sans text-muted-warm">Loading menu…</p>
          )}

          {loadState === "error" && (
            <div className="text-center">
              <p className="font-sans text-[0.96rem] text-muted-warm mb-8">
                The online order form isn't available right now. Order via WhatsApp instead — we'll
                confirm your Saturday pickup or delivery manually.
              </p>
              <a
                href={buildWaLink("Hi Dhaka Kacchi — I'd like to order.")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-4 bg-[#25D366] text-white px-16 py-6 font-sans text-[0.8rem] uppercase tracking-[0.25em] transition-all hover:-translate-y-0.5 hover:bg-[#1da851]"
              >
                <MessageCircle size={20} />
                <span>Order on WhatsApp</span>
              </a>
            </div>
          )}

          {loadState === "ready" && (
            <form onSubmit={onSubmit} className="space-y-10">
              {session.customer && (
                <div className="flex items-center justify-between font-sans text-[0.78rem] text-muted-warm">
                  <span>
                    Logged in as <span className="text-cream">{session.customer.name}</span> (
                    {session.customer.email})
                  </span>
                  <button
                    type="button"
                    onClick={session.logout}
                    className="text-gold hover:text-gold-2 underline underline-offset-4"
                  >
                    Log out
                  </button>
                </div>
              )}

              <fieldset className="space-y-4">
                <legend className="font-sans text-[0.68rem] uppercase tracking-[0.3em] text-gold-3 mb-2">
                  Your Items
                </legend>
                {menu.map((item) => (
                  <div
                    key={item.sku}
                    className="flex items-center justify-between gap-4 bg-surface border border-line px-6 py-5"
                  >
                    <div className="text-left">
                      <strong className="block font-serif font-normal text-cream text-lg">
                        {item.name}
                      </strong>
                      <span className="block font-sans text-[0.82rem] text-muted-warm mt-1">
                        {item.description}
                      </span>
                      <span className="block font-sans text-[0.82rem] text-gold mt-1">
                        {formatEuro(item.priceCents)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => setQty(item.sku, (quantities[item.sku] ?? 0) - 1)}
                        className="w-9 h-9 border border-line text-cream hover:border-gold/50 transition-colors"
                        aria-label={`Decrease ${item.name}`}
                      >
                        −
                      </button>
                      <span className="w-6 text-center font-sans text-cream">
                        {quantities[item.sku] ?? 0}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQty(item.sku, (quantities[item.sku] ?? 0) + 1)}
                        className="w-9 h-9 border border-line text-cream hover:border-gold/50 transition-colors"
                        aria-label={`Increase ${item.name}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="font-sans text-[0.68rem] uppercase tracking-[0.3em] text-gold-3 mb-2">
                  Delivery Saturday
                </legend>
                <select
                  id="deliveryDate"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className={`w-full ${inputClass}`}
                >
                  {dates.map((d) => (
                    <option key={d} value={d} className="bg-black-ink">
                      {formatDate(d)}
                    </option>
                  ))}
                </select>
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="font-sans text-[0.68rem] uppercase tracking-[0.3em] text-gold-3 mb-2">
                  Pickup or Delivery
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    aria-pressed={fulfillmentType === "pickup"}
                    onClick={() => selectFulfillment("pickup")}
                    className={`text-left px-6 py-5 border transition-colors ${
                      fulfillmentType === "pickup"
                        ? "border-gold bg-gold/10"
                        : "border-line hover:border-gold/40"
                    }`}
                  >
                    <strong className="block font-serif font-normal text-cream text-lg">
                      Free Pickup
                    </strong>
                    <span className="block font-sans text-[0.82rem] text-muted-warm mt-1">
                      {PICKUP_LABEL}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={fulfillmentType === "delivery"}
                    onClick={() => selectFulfillment("delivery")}
                    className={`text-left px-6 py-5 border transition-colors ${
                      fulfillmentType === "delivery"
                        ? "border-gold bg-gold/10"
                        : "border-line hover:border-gold/40"
                    }`}
                  >
                    <strong className="block font-serif font-normal text-cream text-lg">
                      Home Delivery
                    </strong>
                    <span className="block font-sans text-[0.82rem] text-muted-warm mt-1">
                      Berlin only, from €5
                    </span>
                  </button>
                </div>

                {fulfillmentType === "delivery" && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
                      <input
                        type="text"
                        placeholder="Street"
                        value={street}
                        onChange={(e) => {
                          setStreet(e.target.value);
                          resetQuote();
                        }}
                        className={inputClass}
                      />
                      <input
                        type="text"
                        placeholder="No."
                        value={houseNumber}
                        onChange={(e) => {
                          setHouseNumber(e.target.value);
                          resetQuote();
                        }}
                        className={`sm:w-24 ${inputClass}`}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <input
                        type="text"
                        placeholder="Postal code"
                        value={postalCode}
                        onChange={(e) => {
                          setPostalCode(e.target.value);
                          resetQuote();
                        }}
                        className={inputClass}
                      />
                      <input
                        type="text"
                        placeholder="City"
                        value={city}
                        onChange={(e) => {
                          setCity(e.target.value);
                          resetQuote();
                        }}
                        className={inputClass}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={checkAddress}
                      disabled={quoteState === "checking"}
                      className="w-full sm:w-auto px-9 py-4 border border-gold/40 text-cream font-sans text-[0.8rem] uppercase tracking-[0.25em] hover:border-gold hover:text-gold transition-colors disabled:opacity-50"
                    >
                      {quoteState === "checking" ? "Checking…" : "Check address & delivery fee"}
                    </button>

                    {quoteState === "ready" && quote?.deliverable && (
                      <p className="font-sans text-[0.85rem] text-gold">
                        {quote.distanceKm.toFixed(1)}km away — delivery fee{" "}
                        {formatEuro(quote.feeCents)}
                      </p>
                    )}
                    {quoteState === "error" && (
                      <p className="font-sans text-[0.85rem] text-red-400">{quoteError}</p>
                    )}
                  </div>
                )}
              </fieldset>

              {session.customer ? (
                <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="text"
                    required
                    placeholder="Full name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="tel"
                    disabled
                    readOnly
                    value={session.customer.phone}
                    title="Phone is locked to your account"
                    className={lockedInputClass}
                  />
                  <input
                    type="email"
                    disabled
                    readOnly
                    value={session.customer.email}
                    title="Email is locked to your account"
                    className={`sm:col-span-2 ${lockedInputClass}`}
                  />
                  <textarea
                    placeholder="Notes (optional)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className={`sm:col-span-2 resize-none ${inputClass}`}
                  />
                </fieldset>
              ) : (
                <p className="font-sans text-[0.85rem] text-muted-warm">
                  You'll log in or create an account at checkout to finish your order.
                </p>
              )}

              <div className="flex items-center justify-between border-t border-line pt-6">
                <span className="font-sans text-[0.82rem] text-muted-warm">
                  {itemCount} {itemCount === 1 ? "item" : "items"} · Cash on delivery
                  {deliveryFeeCents > 0 && ` · +${formatEuro(deliveryFeeCents)} delivery`}
                  {fulfillmentType === "pickup" && " · Free pickup"}
                </span>
                <strong className="font-serif text-cream text-2xl">{formatEuro(totalCents)}</strong>
              </div>

              {submitState === "error" && (
                <p className="font-sans text-sm text-red-400">{submitError}</p>
              )}

              <button
                type="submit"
                disabled={
                  session.customer ? !canSubmit || submitState === "submitting" : !canCheckout
                }
                className="w-full bg-gold text-black-ink px-9 py-5 font-sans text-[0.8rem] uppercase tracking-[0.25em] hover:bg-gold-2 transition-colors disabled:opacity-50"
              >
                {session.customer
                  ? submitState === "submitting"
                    ? "Placing order…"
                    : "Place Order — Cash on Delivery"
                  : "Checkout"}
              </button>
            </form>
          )}
        </Reveal>
      </section>

      <CheckoutAuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        prefillAddress={
          fulfillmentType === "delivery" ? { street, houseNumber, postalCode, city } : undefined
        }
      />
    </>
  );
}

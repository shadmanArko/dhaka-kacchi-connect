import { useEffect, useMemo, useState } from "react";
import { formatEuro, formatDate } from "@/lib/format";
import { useTranslation } from "react-i18next";
import { MessageCircle, RefreshCw } from "lucide-react";
import * as Sentry from "@sentry/react";
import { PageHero } from "@/components/sections/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { CheckoutAuthModal } from "@/components/auth/CheckoutAuthModal";
import { LocaleLink } from "@/components/layout/LocaleLink";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSession } from "@/hooks/useSession";
import { buildWaLink } from "@/lib/whatsapp";
import { readCart, writeCart, clearCart } from "@/lib/cart";
import { site } from "@/content/site";
import { trackEvent, trackWarehouseEvent } from "@/lib/analytics";
import {
  api,
  ApiError,
  type MenuItem,
  type OrderResult,
  type PostalCodeCheckResult,
} from "@/lib/api";

type LoadState = "loading" | "ready" | "error";
type SubmitState = "idle" | "submitting" | "success" | "error";
type QuoteState = "idle" | "checking" | "ready" | "error";
type FulfillmentType = "pickup" | "delivery";

const inputClass =
  "px-4 py-4 bg-gold/[0.06] border border-line-strong text-cream placeholder:text-muted-warm font-sans text-base outline-none focus:border-gold/50 transition-colors";
const lockedInputClass =
  "px-4 py-4 bg-gold/[0.02] border border-line-strong text-muted-warm font-sans text-base outline-none cursor-not-allowed";

export function OrderPage() {
  const { t } = useTranslation();
  const PICKUP_LABEL = t("order.pickupLabel");

  function quoteErrorMessage(quote: PostalCodeCheckResult): string {
    if (quote.deliverable) return "";
    switch (quote.reason) {
      case "address_not_found":
        return t("order.error.addressNotFound");
      case "outside_berlin":
        return t("order.error.outsideBerlin");
      case "too_far":
        return t("order.error.tooFar");
    }
  }

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
  const [quote, setQuote] = useState<PostalCodeCheckResult | null>(null);
  const [quoteError, setQuoteError] = useState("");

  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState("");
  // A timeout is the one failure where re-submitting is actively dangerous:
  // the backend commits the order BEFORE it awaits the confirmation email and
  // Telegram fan-out, so a slow notification can time us out after the order
  // already exists. We tell the customer not to re-submit - this is what makes
  // the button agree with that advice instead of contradicting it.
  const [submitTimedOut, setSubmitTimedOut] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);
  // Captured at submit time so the confirmation screen can list what was
  // ordered - the API response has no line items, and the cart is cleared the
  // moment the order succeeds.
  const [submittedItems, setSubmittedItems] = useState<
    { name: string; quantity: number; lineCents: number }[]
  >([]);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  // Tracks which logged-in customer the form fields were last prefilled
  // from, so a fresh login/registration (or restoring a stored session on
  // page load) prefills exactly once, without re-stomping later edits.
  const [prefilledForCustomerId, setPrefilledForCustomerId] = useState<string | null>(null);
  // Fires once per visit, the moment the cart goes from empty to non-empty -
  // the top of the order funnel.
  const [cartStartTracked, setCartStartTracked] = useState(false);
  // Set only when a restored cart had to be changed on the customer's behalf
  // (currently: its Saturday is no longer offered).
  const [cartNotice, setCartNotice] = useState("");
  // Bumped by the "Try again" button below. The whole load effect is keyed on
  // it, so a retry re-runs the fetch AND the cart restore that depends on it -
  // correct here precisely because the restore never ran on a failed attempt,
  // so there is no restored state to clobber.
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    setLoadState("loading");
    Promise.all([api.getMenu(), api.getAvailability()])
      .then(([menuRes, datesRes]) => {
        setMenu(menuRes.items);
        setDates(datesRes.dates);

        // The saved cart is restored HERE, inside this resolution, rather than
        // in its own mount effect. Two reasons, both load-bearing: validating
        // it needs the menu and the availability list, which only exist at
        // this point; and this effect used to unconditionally overwrite
        // deliveryDate, so restoring anywhere else would be racing it rather
        // than replacing it.
        const saved = readCart();
        const menuSkus = new Set(menuRes.items.map((item) => item.sku));
        // Drop anything no longer on the menu. itemCount counts `quantities`
        // directly while subtotalCents sums over `menu`, so a stale SKU would
        // otherwise show up in the item count while contributing EUR 0.
        const restoredQuantities = saved
          ? Object.fromEntries(
              Object.entries(saved.quantities).filter(
                ([sku, qty]) => menuSkus.has(sku) && Number.isFinite(qty) && qty > 0,
              ),
            )
          : {};
        const hasRestoredItems = Object.keys(restoredQuantities).length > 0;

        if (saved && hasRestoredItems) {
          setQuantities(restoredQuantities);
          setFulfillmentType(saved.fulfillmentType === "delivery" ? "delivery" : "pickup");
          setStreet(saved.street);
          setHouseNumber(saved.houseNumber);
          setPostalCode(saved.postalCode);
          setCity(saved.city);
          setCustomerName(saved.customerName);
          setNotes(saved.notes);
          // Restores the prefill guard too, so the session-prefill effect
          // below doesn't re-stomp an address the customer edited before they
          // left. (A cart saved while logged out carries null here, so logging
          // in afterwards still prefills from the account - unchanged.)
          setPrefilledForCustomerId(saved.prefilledForCustomerId);
          // Not a new cart: don't re-fire the funnel-top event on every reload.
          setCartStartTracked(true);
        } else if (saved) {
          clearCart();
        }

        // A saved cart is pinned to one specific Saturday, which goes stale
        // every week. Silently sliding someone to a different week is how a
        // customer ends up expecting food on the wrong day, so say so.
        const savedDateStillOffered = !!saved && datesRes.dates.includes(saved.deliveryDate);
        setDeliveryDate(savedDateStillOffered ? saved.deliveryDate : (datesRes.dates[0] ?? ""));
        if (saved && hasRestoredItems && !savedDateStillOffered) {
          setCartNotice(t("order.cartDateChanged"));
        }

        setLoadState("ready");
      })
      // This catch sits downstream of the whole `.then()` body, not just the
      // two fetches, so a bug in the restore/validation code above lands here
      // too and shows the customer "the server is unavailable" - a diagnosis
      // that is both wrong and unfalsifiable from the outside. Report it.
      .catch((err) => {
        Sentry.captureException(err, { tags: { area: "order-page-load" } });
        setLoadState("error");
      });
  }, [loadAttempt]);

  // Mirror of the restore above. Deliberately gated on loadState: before the
  // restore has run the form is still empty, and saving that would wipe the
  // very cart we're about to read.
  useEffect(() => {
    if (loadState !== "ready" || submitState === "success") return;
    if (!Object.values(quantities).some((qty) => qty > 0)) {
      clearCart();
      return;
    }
    writeCart({
      quantities,
      deliveryDate,
      fulfillmentType,
      street,
      houseNumber,
      postalCode,
      city,
      customerName,
      notes,
      prefilledForCustomerId,
    });
  }, [
    loadState,
    submitState,
    quantities,
    deliveryDate,
    fulfillmentType,
    street,
    houseNumber,
    postalCode,
    city,
    customerName,
    notes,
    prefilledForCustomerId,
  ]);

  // Fills in name/address from the account the moment a session exists -
  // whether that's a fresh login/registration just now, or a stored session
  // restored on page load. Editable afterwards; the live postal-code check
  // below re-validates independently as soon as it's edited, so this effect
  // never needs to re-run just because the address changed.
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

  useEffect(() => {
    if (!cartStartTracked && itemCount > 0) {
      trackEvent("order_cart_started");
      setCartStartTracked(true);
    }
  }, [itemCount, cartStartTracked]);

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
    trackEvent("order_fulfillment_selected", { fulfillmentType: type });
  }

  // Live, as-you-type postal code check - no button. Only fires once the
  // (debounced) value is a complete 5-digit PLZ; anything shorter just goes
  // back to idle rather than showing a premature "not deliverable" error.
  // Deliverability/fee is entirely postal-code-derived server-side (see
  // worker/src/lib/delivery.ts), so this never needs street/house number/
  // city to give a real answer - those are only required at final submit,
  // for the courier.
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
        if (q.deliverable) {
          setQuoteState("ready");
          trackEvent("order_delivery_fee_quoted", {
            feeCents: q.feeCents,
            distanceKm: q.distanceKm,
          });
        } else {
          setQuoteState("error");
          setQuoteError(quoteErrorMessage(q));
          trackEvent("order_delivery_not_available", { reason: q.reason });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setQuoteState("error");
        setQuoteError(err instanceof ApiError ? err.message : t("order.postalCheckError"));
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedPostalCode, fulfillmentType]);

  // Everything needed before an account is involved - just items and a
  // date. Fulfillment/address only exist once logged in (see the JSX
  // below), so they can't gate opening the login/register pop-up.
  const canCheckout = itemCount > 0 && !!deliveryDate;
  const fulfillmentReady =
    fulfillmentType === "pickup" || (quoteState === "ready" && quote?.deliverable === true);
  const canSubmit =
    canCheckout &&
    fulfillmentReady &&
    !!session.customer &&
    customerName.trim().length > 0 &&
    !session.isLoading;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (session.isLoading) return;

    if (!session.token || !session.customer) {
      if (!canCheckout) return;
      trackEvent("order_checkout_clicked");
      trackWarehouseEvent("begin_checkout", { itemCount, totalCents });
      setAuthModalOpen(true);
      return;
    }
    if (!canSubmit) return;

    setSubmitState("submitting");
    setSubmitError("");
    setSubmitTimedOut(false);
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
      // Snapshot what was ordered BEFORE the cart is cleared below. The API
      // response carries no line items, and this costs no backend change -
      // it just has to happen while `quantities` is still populated.
      setSubmittedItems(
        menu
          .filter((item) => (quantities[item.sku] ?? 0) > 0)
          .map((item) => ({
            name: item.name,
            quantity: quantities[item.sku] ?? 0,
            lineCents: (quantities[item.sku] ?? 0) * item.priceCents,
          })),
      );
      setSubmitState("success");
      // The order exists now - a restored basket on the next visit would be a
      // duplicate waiting to happen.
      clearCart();
      trackEvent("order_submitted", { fulfillmentType, totalCents, itemCount });
      trackWarehouseEvent("purchase", { fulfillmentType, totalCents, itemCount }, res.orderId);
    } catch (err) {
      setSubmitState("error");
      // A timeout here does NOT mean the order failed. worker/src/index.ts
      // commits the order and only then awaits the email + Telegram fan-out,
      // so a slow notification can time us out after the order already exists
      // and the customer's confirmation email has already been sent. Telling
      // them to "try again" would produce a duplicate order on the one day of
      // the week this business takes orders.
      const timedOut = err instanceof ApiError && err.kind === "timeout";
      const message = timedOut
        ? t("order.timeoutMessage")
        : err instanceof ApiError
          ? err.message
          : t("order.genericSubmitError");
      setSubmitError(message);
      setSubmitTimedOut(timedOut);
      // Deliberately no free-text `error` property: it could echo the
      // customer's own input back into PostHog. Status + kind aggregate
      // better in a funnel anyway.
      trackEvent("order_submission_failed", {
        status: err instanceof ApiError ? err.status : null,
        kind: err instanceof ApiError ? err.kind : "unknown",
      });
    }
  }

  if (submitState === "success" && result) {
    return (
      <section className="bg-black-ink py-32 md:py-40 px-6 md:px-14 text-center min-h-screen flex items-center justify-center">
        <div className="max-w-[560px]">
          <h1 className="font-serif font-light text-cream text-[clamp(2.2rem,5vw,3.4rem)] mb-4">
            {t("order.confirmed.titlePre")}{" "}
            <em className="not-italic italic text-gold">{t("order.confirmed.titleEm")}</em>
          </h1>
          <div className="mx-auto my-7 h-px w-[50px] bg-gold" />
          <p className="font-sans text-[0.96rem] leading-[1.95] text-muted-warm mb-8">
            {result.fulfillmentType === "pickup"
              ? t("order.confirmed.pickupLine", {
                  date: formatDate(result.deliveryDate),
                  place: PICKUP_LABEL,
                })
              : t("order.confirmed.deliveryLine", { date: formatDate(result.deliveryDate) })}
            <br />
            {t("order.confirmed.total", { amount: formatEuro(result.totalCents) })}
          </p>
          {/* The address the food is actually going to. Rendered only when the
              backend sends it, so this build works against a worker that
              hasn't deployed the field yet - the two ship separately. */}
          {result.fulfillmentType === "delivery" && result.address && (
            <p className="font-sans text-[0.9rem] leading-[1.9] text-muted-warm mb-8">
              {t("order.confirmed.deliveringTo")}
              <br />
              <strong className="text-cream">
                {result.address.street} {result.address.houseNumber}
              </strong>
              <br />
              <strong className="text-cream">
                {result.address.postalCode} {result.address.city}
              </strong>
            </p>
          )}

          {submittedItems.length > 0 && (
            <ul className="mx-auto mb-8 max-w-[360px] border-y border-line divide-y divide-line">
              {submittedItems.map((item) => (
                <li
                  key={item.name}
                  className="flex items-center justify-between gap-4 py-3 font-sans text-[0.85rem]"
                >
                  <span className="text-muted-warm">
                    {item.quantity}× {item.name}
                  </span>
                  <span className="text-cream">{formatEuro(item.lineCents)}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="font-sans text-[0.85rem] leading-[1.9] text-muted-warm mb-8">
            {t("order.confirmed.emailNotice", {
              email: session.customer?.email,
              action: t(
                result.fulfillmentType === "pickup"
                  ? "order.confirmed.collect"
                  : "order.confirmed.receive",
              ),
            })}
          </p>

          <p className="font-sans text-[0.8rem] text-muted-warm mb-8">
            {t("order.confirmed.orderReference")}{" "}
            <span className="text-cream">{result.orderId}</span>
          </p>

          {/* The failure path has always offered a way to reach a human; the
              success path offered none, which is backwards - this is the
              screen a customer is on when they spot a wrong address. */}
          <div className="flex flex-col items-center gap-4">
            <a
              href={buildWaLink(
                `Hi Dhaka Kacchi — about my order ${result.orderId} for ${formatDate(result.deliveryDate)}.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 bg-[#25D366] text-white px-8 py-4 font-sans text-[0.78rem] uppercase tracking-[0.2em] transition-all hover:-translate-y-0.5 hover:bg-[#1da851]"
            >
              <MessageCircle size={18} />
              <span>{t("order.confirmed.whatsappMessage")}</span>
            </a>
            <a
              href={`mailto:${site.email}?subject=${encodeURIComponent(`Order ${result.orderId}`)}`}
              className="font-sans text-[0.8rem] text-muted-warm underline underline-offset-4 hover:text-cream transition-colors"
            >
              {t("order.confirmed.emailFallback", { email: site.email })}
            </a>
            <LocaleLink
              to="/orders"
              search={{ order: result.orderId }}
              className="mt-2 inline-flex items-center gap-4 font-sans text-[0.8rem] tracking-[0.25em] uppercase font-normal transition-all duration-300 no-underline border border-gold/40 text-cream px-9 py-[18px] hover:border-gold hover:text-gold hover:-translate-y-0.5"
            >
              <span>{t("order.confirmed.viewOrders")}</span>
            </LocaleLink>
            <LocaleLink
              to="/"
              className="font-sans text-[0.8rem] text-muted-warm underline underline-offset-4 hover:text-cream transition-colors"
            >
              {t("order.confirmed.backHome")}
            </LocaleLink>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <PageHero
        eyebrow={t("order.hero.eyebrow")}
        title={
          <>
            {t("order.hero.titleLine1")}
            <br />
            <em>{t("order.hero.titleEm")}</em>
          </>
        }
        body={t("order.hero.body")}
      />

      <section className="bg-deep border-t border-line py-20 md:py-28 px-6 md:px-14">
        <Reveal className="max-w-[720px] mx-auto">
          {loadState === "loading" && (
            <p className="text-center font-sans text-muted-warm">{t("order.loadingMenu")}</p>
          )}

          {loadState === "error" && (
            <div className="text-center">
              <p className="font-sans text-[0.96rem] text-muted-warm mb-8">
                {t("order.loadError.body")}
              </p>
              {/* Retry comes FIRST, and is the primary action. The only escape
                  used to be WhatsApp, which meant a one-second network blip
                  pushed a customer off the online form for good unless they
                  thought to reload the page themselves. */}
              <button
                type="button"
                onClick={() => setLoadAttempt((n) => n + 1)}
                className="inline-flex items-center gap-3 border border-gold px-12 py-5 font-sans text-[0.8rem] uppercase tracking-[0.25em] text-gold transition-colors hover:bg-gold hover:text-black-ink"
              >
                <RefreshCw size={18} aria-hidden="true" />
                <span>{t("order.tryAgain")}</span>
              </button>
              <p className="mt-10 mb-5 font-sans text-[0.8rem] text-muted-warm">
                {t("order.stillNotWorking")}
              </p>
              <a
                href={buildWaLink("Hi Dhaka Kacchi — I'd like to order.")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-4 bg-[#25D366] text-white px-16 py-6 font-sans text-[0.8rem] uppercase tracking-[0.25em] transition-all hover:-translate-y-0.5 hover:bg-[#1da851]"
              >
                <MessageCircle size={20} />
                <span>{t("order.orderOnWhatsapp")}</span>
              </a>
            </div>
          )}

          {loadState === "ready" && (
            <form onSubmit={onSubmit} className="space-y-10">
              {cartNotice && (
                <p className="border border-gold/40 bg-gold/[0.06] px-5 py-4 font-sans text-[0.85rem] leading-relaxed text-cream">
                  {cartNotice}
                </p>
              )}
              {session.customer && (
                <div className="flex items-center justify-between font-sans text-[0.78rem] text-muted-warm">
                  <span>
                    {t("order.loggedInAs")}{" "}
                    <span className="text-cream">{session.customer.name}</span> (
                    {session.customer.email})
                  </span>
                  <button
                    type="button"
                    onClick={session.logout}
                    className="text-gold hover:text-gold-2 underline underline-offset-4"
                  >
                    {t("order.logout")}
                  </button>
                </div>
              )}

              <fieldset className="space-y-4">
                <legend className="font-sans text-[0.68rem] uppercase tracking-[0.3em] text-gold-3 mb-2">
                  {t("order.yourItems")}
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
                        className="w-11 h-11 border border-line-strong text-cream hover:border-gold/50 active:bg-gold/20 active:border-gold transition-colors"
                        aria-label={t("order.decrease", { name: item.name })}
                      >
                        −
                      </button>
                      <span className="w-6 text-center font-sans text-cream">
                        {quantities[item.sku] ?? 0}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setQty(item.sku, (quantities[item.sku] ?? 0) + 1);
                          trackWarehouseEvent("add_to_cart", {
                            sku: item.sku,
                            priceCents: item.priceCents,
                          });
                        }}
                        className="w-11 h-11 border border-line-strong text-cream hover:border-gold/50 active:bg-gold/20 active:border-gold transition-colors"
                        aria-label={t("order.increase", { name: item.name })}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="font-sans text-[0.68rem] uppercase tracking-[0.3em] text-gold-3 mb-2">
                  {t("order.deliverySaturday")}
                </legend>
                <select
                  id="deliveryDate"
                  aria-label={t("order.deliverySaturday")}
                  value={deliveryDate}
                  onChange={(e) => {
                    setDeliveryDate(e.target.value);
                    trackEvent("order_delivery_date_selected", { date: e.target.value });
                  }}
                  className={`w-full ${inputClass}`}
                >
                  {dates.map((d) => (
                    <option key={d} value={d} className="bg-black-ink">
                      {formatDate(d)}
                    </option>
                  ))}
                </select>
              </fieldset>

              {session.customer ? (
                <>
                  <fieldset className="space-y-4">
                    <legend className="font-sans text-[0.68rem] uppercase tracking-[0.3em] text-gold-3 mb-2">
                      {t("order.pickupOrDelivery")}
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
                          {t("order.freePickup")}
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
                          {t("order.homeDelivery")}
                        </strong>
                        <span className="block font-sans text-[0.82rem] text-muted-warm mt-1">
                          {t("order.homeDeliverySubtitle")}
                        </span>
                      </button>
                    </div>

                    {fulfillmentType === "delivery" && (
                      <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
                          <input
                            type="text"
                            placeholder={t("order.streetPlaceholder")}
                            aria-label={t("order.streetPlaceholder")}
                            autoComplete="address-line1"
                            value={street}
                            onChange={(e) => {
                              setStreet(e.target.value);
                              resetQuote();
                            }}
                            className={`ph-no-capture ${inputClass}`}
                          />
                          <input
                            type="text"
                            placeholder={t("order.houseNumberPlaceholder")}
                            aria-label="House number"
                            autoComplete="address-line2"
                            value={houseNumber}
                            onChange={(e) => {
                              setHouseNumber(e.target.value);
                              resetQuote();
                            }}
                            className={`ph-no-capture sm:w-24 ${inputClass}`}
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={5}
                            placeholder={t("order.postalCodePlaceholder")}
                            aria-label={t("order.postalCodePlaceholder")}
                            autoComplete="postal-code"
                            value={postalCode}
                            onChange={(e) => {
                              // Invalidate any stale quote immediately, not
                              // just once the debounced re-check fires below
                              // - otherwise a "ready" quote for the OLD
                              // postal code could still gate the submit
                              // button for the ~400ms before it settles.
                              setPostalCode(e.target.value);
                              resetQuote();
                            }}
                            className={`ph-no-capture ${inputClass}`}
                          />
                          <input
                            type="text"
                            placeholder={t("order.cityPlaceholder")}
                            aria-label={t("order.cityPlaceholder")}
                            autoComplete="address-level2"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            className={`ph-no-capture ${inputClass}`}
                          />
                        </div>

                        {quoteState === "checking" && (
                          <p className="font-sans text-[0.85rem] text-muted-warm">
                            {t("order.checkingPostalCode")}
                          </p>
                        )}
                        {quoteState === "ready" && quote?.deliverable && (
                          <p className="font-sans text-[0.85rem] text-gold">
                            {t("order.distanceAway", {
                              km: quote.distanceKm.toFixed(1),
                              fee: formatEuro(quote.feeCents),
                            })}
                          </p>
                        )}
                        {quoteState === "error" && (
                          <p role="alert" className="font-sans text-[0.85rem] text-red-400">
                            {quoteError}
                          </p>
                        )}
                      </div>
                    )}
                  </fieldset>

                  <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input
                      type="text"
                      required
                      placeholder={t("order.fullNamePlaceholder")}
                      aria-label={t("order.fullNamePlaceholder")}
                      autoComplete="name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className={`ph-no-capture ${inputClass}`}
                    />
                    <input
                      type="tel"
                      disabled
                      readOnly
                      value={session.customer.phone}
                      title={t("order.phoneLockedTitle")}
                      aria-label={t("order.phoneLockedTitle")}
                      className={`ph-no-capture ${lockedInputClass}`}
                    />
                    <input
                      type="email"
                      disabled
                      readOnly
                      value={session.customer.email}
                      title={t("order.emailLockedTitle")}
                      aria-label={t("order.emailLockedTitle")}
                      className={`ph-no-capture sm:col-span-2 ${lockedInputClass}`}
                    />
                    <textarea
                      placeholder={t("order.notesPlaceholder")}
                      aria-label={t("order.notesPlaceholder")}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className={`ph-no-capture sm:col-span-2 resize-none ${inputClass}`}
                    />
                  </fieldset>
                </>
              ) : (
                <p className="font-sans text-[0.85rem] text-muted-warm">{t("order.loginPrompt")}</p>
              )}

              <div className="flex items-center justify-between border-t border-line pt-6">
                <span className="font-sans text-[0.82rem] text-muted-warm">
                  {itemCount}{" "}
                  {t(itemCount === 1 ? "order.itemsCountSingular" : "order.itemsCountPlural")} ·{" "}
                  {t("order.cashOnDelivery")}
                  {deliveryFeeCents > 0 &&
                    ` · ${t("order.deliveryFeeSuffix", { fee: formatEuro(deliveryFeeCents) })}`}
                  {fulfillmentType === "pickup" && ` · ${t("order.freePickupSuffix")}`}
                </span>
                <strong className="font-serif text-cream text-2xl">{formatEuro(totalCents)}</strong>
              </div>

              {submitState === "error" && (
                <div className="space-y-4">
                  <p role="alert" className="font-sans text-sm text-red-400">
                    {submitError}
                  </p>
                  {/* The copy above promises WhatsApp "below" - this is it.
                      Previously the only buildWaLink call on this page lived in
                      the loadState === "error" branch, which is mutually
                      exclusive with this form, so the promise was unkeepable. */}
                  <a
                    href={buildWaLink(
                      submitTimedOut
                        ? `Hi Dhaka Kacchi — I placed an order for ${formatDate(deliveryDate)} (${formatEuro(totalCents)}) but didn't get a confirmation. Can you check whether it came through?`
                        : `Hi Dhaka Kacchi — I'd like to order for ${formatDate(deliveryDate)} (${formatEuro(totalCents)}). The website couldn't place it.`,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-3 bg-[#25D366] text-white px-8 py-4 font-sans text-[0.78rem] uppercase tracking-[0.2em] transition-all hover:-translate-y-0.5 hover:bg-[#1da851]"
                  >
                    <MessageCircle size={18} />
                    <span>
                      {submitTimedOut ? t("order.checkWhatsapp") : t("order.orderOnWhatsapp")}
                    </span>
                  </a>
                  {submitTimedOut && (
                    // An escape hatch, deliberately opt-in and deliberately not
                    // a button that looks like the primary action: if the order
                    // genuinely failed the customer must not be permanently
                    // stuck, but re-submitting after a timeout is the one path
                    // that can produce a duplicate.
                    <button
                      type="button"
                      onClick={() => {
                        setSubmitTimedOut(false);
                        setSubmitError("");
                        setSubmitState("idle");
                      }}
                      className="block font-sans text-[0.78rem] text-muted-warm underline underline-offset-4 hover:text-cream transition-colors"
                    >
                      {t("order.tryAgainAfterTimeout")}
                    </button>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  session.customer
                    ? !canSubmit || submitState === "submitting" || submitTimedOut
                    : !canCheckout
                }
                className="w-full bg-gold text-black-ink px-9 py-5 font-sans text-[0.8rem] uppercase tracking-[0.25em] hover:bg-gold-2 active:bg-gold-3 active:text-cream transition-colors disabled:opacity-50"
              >
                {session.customer
                  ? submitState === "submitting"
                    ? t("order.placingOrder")
                    : t("order.placeOrder")
                  : t("order.checkout")}
              </button>
            </form>
          )}
        </Reveal>
      </section>

      <CheckoutAuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </>
  );
}

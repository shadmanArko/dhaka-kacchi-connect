import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatEuro, formatDate } from "@/lib/format";
import { PageHero } from "@/components/sections/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { LocaleLink } from "@/components/layout/LocaleLink";
import { useSession } from "@/hooks/useSession";
import { api, ApiError, type CustomerOrder } from "@/lib/api";
import { isSupportedLocale, localizePath, DEFAULT_LOCALE } from "@/lib/i18n";
import { site } from "@/content/site";
import { buildWaLink } from "@/lib/whatsapp";

type LoadState = "loading" | "ready" | "error";

/** `focusedId` is the `?order=` search param, read by the route (English or
 * /de) and passed in so this page doesn't care which of the two it is. */
export function OrdersPage({ focusedId }: { focusedId?: string }) {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const navigate = useNavigate();
  const locale = isSupportedLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;

  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [retryCount, setRetryCount] = useState(0);

  // Client-only gate, never beforeLoad/loader: those also run during the Node
  // prerender pass that build-static.mjs relies on, where there is no
  // localStorage, and a wrong redirect would be baked into the static HTML.
  // Same pattern as routes/admin/_layout.tsx.
  useEffect(() => {
    if (!session.isLoading && !session.token) {
      void navigate({ to: localizePath(locale, "/order") as never, replace: true });
    }
  }, [session.isLoading, session.token, navigate, locale]);

  useEffect(() => {
    if (!session.token) return;
    let cancelled = false;
    setLoadState("loading");
    api
      .listMyOrders(session.token)
      .then((res) => {
        if (cancelled) return;
        setOrders(res.orders);
        setLoadState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        // An expired login can never be fixed by "Try again" - sign out so the
        // gate above sends them to log in instead of a retry loop.
        if (err instanceof ApiError && err.status === 401) {
          session.logout();
          return;
        }
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
    // session.logout is recreated each render; only the token matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token, retryCount]);

  // A focused order is re-fetched rather than read out of the list above:
  // status and discounts are changed by staff after an order is placed (see
  // the admin panel), so the list can legitimately be stale by the time
  // someone opens one.
  const [focused, setFocused] = useState<CustomerOrder | null>(null);
  useEffect(() => {
    if (!session.token || !focusedId) {
      setFocused(null);
      return;
    }
    let cancelled = false;
    api
      .getMyOrder(session.token, focusedId)
      .then((res) => {
        if (!cancelled) setFocused(res.order);
      })
      .catch(() => {
        // A bad or someone else's id comes back 404 - fall back to whatever
        // the list has, which for a stranger's id is nothing.
        if (!cancelled) setFocused(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session.token, focusedId]);

  const visible = orders.map((order) => (focused && focused.id === order.id ? focused : order));

  return (
    <>
      <PageHero
        eyebrow={t("orders.hero.eyebrow")}
        title={
          <>
            {t("orders.hero.titlePre")}{" "}
            <em className="not-italic italic text-gold">{t("orders.hero.titleEm")}</em>
          </>
        }
        body={t("orders.hero.body")}
      />

      <section className="bg-deep border-t border-line py-20 md:py-28 px-6 md:px-14">
        <Reveal className="max-w-[720px] mx-auto">
          {loadState === "loading" && (
            <p role="status" className="font-sans text-[0.9rem] text-muted-warm text-center py-12">
              {t("orders.loading")}
            </p>
          )}

          {loadState === "error" && (
            <div className="text-center py-12">
              <p className="font-sans text-[0.9rem] text-muted-warm mb-6">
                {t("orders.loadError")}
              </p>
              <button
                type="button"
                onClick={() => setRetryCount((n) => n + 1)}
                className="min-h-11 border border-gold/40 text-cream px-8 py-4 font-sans text-[0.78rem] uppercase tracking-[0.2em] hover:border-gold hover:text-gold transition-colors"
              >
                {t("orders.tryAgain")}
              </button>
            </div>
          )}

          {loadState === "ready" && visible.length === 0 && (
            <div className="text-center py-12">
              <p className="font-sans text-[0.9rem] text-muted-warm mb-6">{t("orders.empty")}</p>
              <LocaleLink
                to="/order"
                className="inline-flex items-center gap-4 border border-gold/40 text-cream px-9 py-[18px] font-sans text-[0.8rem] uppercase tracking-[0.25em] no-underline hover:border-gold hover:text-gold transition-colors"
              >
                <span>{t("orders.orderCta")}</span>
              </LocaleLink>
            </div>
          )}

          {loadState === "ready" && visible.length > 0 && (
            <ul className="space-y-6">
              {visible.map((order) => {
                const isFocused = order.id === focusedId;
                return (
                  <li
                    key={order.id}
                    className={`border px-6 py-6 transition-colors ${
                      isFocused ? "border-gold bg-gold/[0.04]" : "border-line"
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
                      <h2 className="font-serif font-light text-cream text-xl">
                        {formatDate(order.deliveryDate)}
                      </h2>
                      <span
                        className={`font-sans text-[0.7rem] uppercase tracking-[0.2em] ${
                          order.status === "cancelled" ? "text-red-400" : "text-gold"
                        }`}
                      >
                        {t(`orders.status.${order.status}`)}
                      </span>
                    </div>

                    <ul className="border-y border-line divide-y divide-line mb-4">
                      {order.items.map((item) => (
                        <li
                          key={item.sku}
                          className="flex items-center justify-between gap-4 py-2.5 font-sans text-[0.85rem]"
                        >
                          <span className="text-muted-warm">
                            {item.quantity}× {item.name}
                          </span>
                          <span className="text-cream">
                            {formatEuro(item.quantity * item.unitPriceCents)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="font-sans text-[0.85rem] leading-[1.9] text-muted-warm">
                      {order.fulfillmentType === "pickup" ? (
                        <p>{t("orders.pickupFree")}</p>
                      ) : (
                        <p>
                          {t("orders.delivery")}
                          {order.deliveryFeeCents > 0 && ` — ${formatEuro(order.deliveryFeeCents)}`}
                          {order.address && (
                            <>
                              <br />
                              <span className="text-cream">
                                {order.address.street} {order.address.houseNumber},{" "}
                                {order.address.postalCode} {order.address.city}
                              </span>
                            </>
                          )}
                        </p>
                      )}
                      {order.discountCents > 0 && (
                        <p className="text-gold">
                          {t("orders.discount", { amount: formatEuro(order.discountCents) })}
                          {order.discountReason && ` (${order.discountReason})`}
                        </p>
                      )}
                      <p className="mt-2">
                        {t("orders.total")}{" "}
                        <strong className="text-cream">{formatEuro(order.totalCents)}</strong> —{" "}
                        {order.fulfillmentType === "pickup"
                          ? t("orders.cashOnCollection")
                          : t("orders.cashOnDelivery")}
                      </p>
                      <p className="mt-2 text-[0.78rem]">
                        {t("orders.reference", { id: order.id })}
                      </p>
                    </div>

                    {!isFocused && (
                      <button
                        type="button"
                        onClick={() =>
                          void navigate({
                            to: localizePath(locale, "/orders") as never,
                            search: { order: order.id } as never,
                          })
                        }
                        className="mt-4 inline-flex min-h-11 items-center font-sans text-[0.78rem] text-muted-warm underline underline-offset-4 hover:text-cream transition-colors"
                      >
                        {t("orders.refresh")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-12 text-center font-sans text-[0.85rem] leading-[1.9] text-muted-warm">
            {t("orders.help.pre")}{" "}
            <a
              href={buildWaLink("Hi Dhaka Kacchi — a question about one of my orders.")}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold underline underline-offset-4"
            >
              {t("orders.help.whatsapp")}
            </a>{" "}
            {t("orders.help.or")}{" "}
            <a href={`mailto:${site.email}`} className="text-gold underline underline-offset-4">
              {site.email}
            </a>
            .
          </p>
        </Reveal>
      </section>
    </>
  );
}

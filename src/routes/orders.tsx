import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHero } from "@/components/sections/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { useSession } from "@/hooks/useSession";
import { api, type CustomerOrder } from "@/lib/api";
import { canonical } from "@/lib/seo";
import { site } from "@/content/site";
import { buildWaLink } from "@/lib/whatsapp";

export const Route = createFileRoute("/orders")({
  // `?order=<id>` rather than a /orders/$id path segment: this app ships as a
  // static export with no SPA fallback, so a dynamic path segment can't be
  // deep-linked or hard-refreshed. Same reasoning as the admin dashboard.
  validateSearch: (search: Record<string, unknown>) => ({
    order: typeof search.order === "string" ? search.order : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Your orders — Dhaka Kacchi Berlin" },
      {
        name: "description",
        content: "Your past and upcoming Dhaka Kacchi orders.",
      },
      // Signed-in-only, and thin content for a crawler either way.
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:url", content: canonical("/orders") },
    ],
    links: [{ rel: "canonical", href: canonical("/orders") }],
  }),
  component: OrdersPage,
});

type LoadState = "loading" | "ready" | "error";

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

const STATUS_COPY: Record<CustomerOrder["status"], string> = {
  received: "Received",
  confirmed: "Confirmed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function OrdersPage() {
  const session = useSession();
  const navigate = useNavigate();
  const { order: focusedId } = Route.useSearch();

  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [retryCount, setRetryCount] = useState(0);

  // Client-only gate, never beforeLoad/loader: those also run during the Node
  // prerender pass that build-static.mjs relies on, where there is no
  // localStorage, and a wrong redirect would be baked into the static HTML.
  // Same pattern as routes/admin/_layout.tsx.
  useEffect(() => {
    if (!session.isLoading && !session.token) {
      navigate({ to: "/order", replace: true });
    }
  }, [session.isLoading, session.token, navigate]);

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
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
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
        eyebrow="Your account"
        title={
          <>
            Your <em className="not-italic italic text-gold">orders</em>
          </>
        }
        body="Everything you've ordered, newest first. Cash on delivery — we'll confirm each batch on the Saturday."
      />

      <section className="bg-deep border-t border-line py-20 md:py-28 px-6 md:px-14">
        <Reveal className="max-w-[720px] mx-auto">
          {loadState === "loading" && (
            <p className="font-sans text-[0.9rem] text-muted-warm text-center py-12">
              Loading your orders…
            </p>
          )}

          {loadState === "error" && (
            <div className="text-center py-12">
              <p className="font-sans text-[0.9rem] text-muted-warm mb-6">
                We couldn't load your orders just now.
              </p>
              <button
                type="button"
                onClick={() => setRetryCount((n) => n + 1)}
                className="border border-gold/40 text-cream px-8 py-4 font-sans text-[0.78rem] uppercase tracking-[0.2em] hover:border-gold hover:text-gold transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {loadState === "ready" && visible.length === 0 && (
            <div className="text-center py-12">
              <p className="font-sans text-[0.9rem] text-muted-warm mb-6">
                You haven't ordered yet.
              </p>
              <Link
                to="/order"
                className="inline-flex items-center gap-4 border border-gold/40 text-cream px-9 py-[18px] font-sans text-[0.8rem] uppercase tracking-[0.25em] no-underline hover:border-gold hover:text-gold transition-colors"
              >
                <span>Order for a Saturday</span>
              </Link>
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
                        {STATUS_COPY[order.status]}
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
                        <p>Pickup — free</p>
                      ) : (
                        <p>
                          Delivery
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
                          Discount −{formatEuro(order.discountCents)}
                          {order.discountReason && ` (${order.discountReason})`}
                        </p>
                      )}
                      <p className="mt-2">
                        Total <strong className="text-cream">{formatEuro(order.totalCents)}</strong>{" "}
                        — cash on {order.fulfillmentType === "pickup" ? "collection" : "delivery"}
                      </p>
                      <p className="mt-2 text-[0.78rem]">Reference: {order.id}</p>
                    </div>

                    {!isFocused && (
                      <button
                        type="button"
                        onClick={() => navigate({ to: "/orders", search: { order: order.id } })}
                        className="mt-4 font-sans text-[0.78rem] text-muted-warm underline underline-offset-4 hover:text-cream transition-colors"
                      >
                        Refresh this order's status
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-12 text-center font-sans text-[0.85rem] leading-[1.9] text-muted-warm">
            Something not right?{" "}
            <a
              href={buildWaLink("Hi Dhaka Kacchi — a question about one of my orders.")}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold underline underline-offset-4"
            >
              Message us on WhatsApp
            </a>{" "}
            or email{" "}
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

import { createFileRoute } from "@tanstack/react-router";
import { OrdersPage } from "@/pages/OrdersPage";
import type { Locale } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/$locale/_layout/orders")({
  validateSearch: (search: Record<string, unknown>) => ({
    order: typeof search.order === "string" ? search.order : undefined,
  }),
  head: ({ params }) => {
    const head = pageHead("/orders", params.locale as Locale, "seo.orders");
    return { ...head, meta: [...head.meta, { name: "robots", content: "noindex, nofollow" }] };
  },
  component: OrdersRoute,
});

function OrdersRoute() {
  return <OrdersPage focusedId={Route.useSearch().order} />;
}

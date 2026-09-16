import { createFileRoute } from "@tanstack/react-router";
import { OrderPage } from "@/pages/OrderPage";
import type { Locale } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/$locale/_layout/order")({
  head: ({ params }) => pageHead("/order", params.locale as Locale, "seo.order"),
  component: OrderPage,
});

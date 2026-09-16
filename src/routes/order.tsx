import { createFileRoute } from "@tanstack/react-router";
import { OrderPage } from "@/pages/OrderPage";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/order")({
  head: () => pageHead("/order", DEFAULT_LOCALE, "seo.order"),
  component: OrderPage,
});

import { createFileRoute } from "@tanstack/react-router";
import { SubscribePage } from "@/pages/SubscribePage";
import type { Locale } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/$locale/_layout/subscribe")({
  head: ({ params }) => pageHead("/subscribe", params.locale as Locale, "seo.subscribe"),
  component: SubscribePage,
});

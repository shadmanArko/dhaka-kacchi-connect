import { createFileRoute } from "@tanstack/react-router";
import { SubscribePage } from "@/pages/SubscribePage";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/subscribe")({
  head: () => pageHead("/subscribe", DEFAULT_LOCALE, "seo.subscribe"),
  component: SubscribePage,
});

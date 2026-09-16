import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage } from "@/pages/HistoryPage";
import type { Locale } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/$locale/_layout/history")({
  head: ({ params }) => pageHead("/history", params.locale as Locale, "seo.history"),
  component: HistoryPage,
});

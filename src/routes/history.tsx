import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage } from "@/pages/HistoryPage";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/history")({
  head: () => pageHead("/history", DEFAULT_LOCALE, "seo.history"),
  component: HistoryPage,
});

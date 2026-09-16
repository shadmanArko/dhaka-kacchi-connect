import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/pages/PrivacyPage";
import type { Locale } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/$locale/_layout/privacy")({
  head: ({ params }) => pageHead("/privacy", params.locale as Locale, "seo.privacy"),
  component: PrivacyPage,
});

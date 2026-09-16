import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/pages/PrivacyPage";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
  head: () => pageHead("/privacy", DEFAULT_LOCALE, "seo.privacy"),
  component: PrivacyPage,
});

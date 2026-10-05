import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/pages/TermsPage";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/terms")({
  head: () => pageHead("/terms", DEFAULT_LOCALE, "seo.terms"),
  component: TermsPage,
});

import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/pages/TermsPage";
import type { Locale } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/$locale/_layout/terms")({
  head: ({ params }) => pageHead("/terms", params.locale as Locale, "seo.terms"),
  component: TermsPage,
});

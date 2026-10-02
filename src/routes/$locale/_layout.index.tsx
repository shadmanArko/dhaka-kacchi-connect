import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/pages/HomePage";
import type { Locale } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";
import { homeJsonLd } from "@/lib/structuredData";

// `params.locale` is already validated against SUPPORTED_LOCALES by the
// parent _layout's beforeLoad (throws notFound() otherwise), so casting to
// Locale here is safe - see src/routes/$locale/_layout.tsx.
export const Route = createFileRoute("/$locale/_layout/")({
  head: ({ params }) =>
    pageHead("/", params.locale as Locale, "seo.home", {
      jsonLd: homeJsonLd(params.locale as Locale),
    }),
  component: HomePage,
});

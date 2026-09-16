import { createFileRoute } from "@tanstack/react-router";
import { AboutPage } from "@/pages/AboutPage";
import type { Locale } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/$locale/_layout/about")({
  head: ({ params }) => pageHead("/about", params.locale as Locale, "seo.about"),
  component: AboutPage,
});

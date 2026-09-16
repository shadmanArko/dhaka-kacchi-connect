import { createFileRoute } from "@tanstack/react-router";
import { AboutPage } from "@/pages/AboutPage";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/about")({
  head: () => pageHead("/about", DEFAULT_LOCALE, "seo.about"),
  component: AboutPage,
});

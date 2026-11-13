import { createFileRoute } from "@tanstack/react-router";
import { SubscribePage } from "@/pages/SubscribePage";
import type { Locale } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/$locale/_layout/subscribe")({
  validateSearch: (search: Record<string, unknown>) => ({
    confirm: typeof search.confirm === "string" ? search.confirm : undefined,
    unsubscribe: typeof search.unsubscribe === "string" ? search.unsubscribe : undefined,
  }),
  head: ({ params }) => pageHead("/subscribe", params.locale as Locale, "seo.subscribe"),
  component: SubscribeRoute,
});

function SubscribeRoute() {
  const { confirm, unsubscribe } = Route.useSearch();
  return <SubscribePage confirmToken={confirm} unsubscribeToken={unsubscribe} />;
}

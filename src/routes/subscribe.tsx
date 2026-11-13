import { createFileRoute } from "@tanstack/react-router";
import { SubscribePage } from "@/pages/SubscribePage";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/subscribe")({
  // `?confirm=` carries the double-opt-in token from the confirmation email;
  // `?unsubscribe=` the opt-out token from every later email.
  validateSearch: (search: Record<string, unknown>) => ({
    confirm: typeof search.confirm === "string" ? search.confirm : undefined,
    unsubscribe: typeof search.unsubscribe === "string" ? search.unsubscribe : undefined,
  }),
  head: () => pageHead("/subscribe", DEFAULT_LOCALE, "seo.subscribe"),
  component: SubscribeRoute,
});

function SubscribeRoute() {
  const { confirm, unsubscribe } = Route.useSearch();
  return <SubscribePage confirmToken={confirm} unsubscribeToken={unsubscribe} />;
}

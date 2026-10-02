import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import type { Locale } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/$locale/_layout/reset-password")({
  validateSearch: searchSchema,
  head: ({ params }) => {
    const head = pageHead("/reset-password", params.locale as Locale, "seo.resetPassword");
    return { ...head, meta: [...head.meta, { name: "robots", content: "noindex, nofollow" }] };
  },
  component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
  return <ResetPasswordPage token={Route.useSearch().token} />;
}

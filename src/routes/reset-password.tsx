import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";

const searchSchema = z.object({
  token: z.string().optional(),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: searchSchema,
  head: () => {
    const head = pageHead("/reset-password", DEFAULT_LOCALE, "seo.resetPassword");
    return {
      ...head,
      // Reachable only from an emailed token link. Indexed it's thin content
      // that advertises the auth flow, so it's noindexed here and excluded
      // from the sitemap in scripts/build-static.mjs.
      meta: [...head.meta, { name: "robots", content: "noindex, nofollow" }],
    };
  },
  component: EnglishResetPassword,
});

// The emailed link always points at this English path (the server doesn't know
// the customer's language), so hand German-language browsers over to the
// translated page instead of making them read English.
function EnglishResetPassword() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (navigator.language?.toLowerCase().startsWith("de")) {
      void navigate({
        to: "/$locale/reset-password",
        params: { locale: "de" },
        search: { token },
        replace: true,
      });
    }
  }, [navigate, token]);
  return <ResetPasswordPage token={token} />;
}

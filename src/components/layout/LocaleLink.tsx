import type { ComponentProps } from "react";
import { Link, type LinkComponentProps } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ButtonLink } from "@/components/ui/DkButton";
import { isSupportedLocale, localizePath, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

/**
 * Every internal nav link in the app goes through one of these two instead
 * of TanStack's own `Link`/`ButtonLink` directly, so a German visitor stays
 * on `/de/...` when clicking "About" instead of being bounced back to the
 * English root. `to` is still typed against the real (English, unprefixed)
 * route tree - only the locale prefix is added at render time, from the
 * current URL via react-i18next's language state (kept in sync with the URL
 * in __root.tsx's beforeLoad).
 *
 * `as any` on the computed path is deliberate and contained to these two
 * components: `to` is a member of the router's typed path union, and
 * `locale` is constrained to a fixed literal set, so localizePath's return
 * value is always itself a real, valid route path - the router's generated
 * types just have no way to express "one of two known unions, chosen at
 * runtime" without duplicating every call site's JSX per locale.
 */
function useCurrentLocale(): Locale {
  const { i18n } = useTranslation();
  return isSupportedLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;
}

export function LocaleLink({ to, ...rest }: LinkComponentProps<"a">) {
  const locale = useCurrentLocale();
  const target = localizePath(locale, String(to));
  return <Link to={target as never} {...rest} />;
}

export function LocaleButtonLink({ to, ...rest }: ComponentProps<typeof ButtonLink>) {
  const locale = useCurrentLocale();
  const target = localizePath(locale, String(to));
  return <ButtonLink to={target as never} {...rest} />;
}

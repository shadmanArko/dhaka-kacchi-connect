import { useTranslation } from "react-i18next";
import { site } from "@/content/site";
import { LocaleLink } from "@/components/layout/LocaleLink";
import { buildWaLink } from "@/lib/whatsapp";
import { trackWarehouseEvent } from "@/lib/analytics";
import logo from "@/assets/photos/logo.webp";

export function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer
      data-menu-inert
      className="grid grid-cols-1 md:grid-cols-3 items-center gap-6 border-t border-line bg-deep px-6 md:px-14 py-14 text-center md:text-left"
    >
      <div className="flex justify-center md:justify-start">
        <LocaleLink to="/" aria-label={t("a11y.homeLink", { name: site.name })}>
          <img
            src={logo}
            alt={site.name}
            width={640}
            height={396}
            className="h-20 w-auto object-contain opacity-90 hover:opacity-100 transition-opacity"
          />
        </LocaleLink>
      </div>

      <div className="font-sans text-[0.76rem] leading-[1.8] text-muted-warm text-center">
        {t("footer.tagline", { location: t("footer.location") })}
        <br />
        <span className="text-muted-warm">
          © {new Date().getFullYear()} {site.name} · {t("footer.rights")}
        </span>
      </div>

      <div className="font-sans text-[0.76rem] leading-[1.8] text-muted-warm md:text-right text-center">
        <a
          href={`mailto:${site.email}`}
          onClick={() => trackWarehouseEvent("contact", { channel: "email" })}
          className="text-gold no-underline hover:underline"
        >
          {site.email}
        </a>
        <br />
        {/* The only contact channel reachable from every page. FloatingSocial
            is desktop-only and carries no WhatsApp, so before this the footer
            offered a mobile customer nothing but an email address. */}
        <a
          href={buildWaLink()}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackWarehouseEvent("contact", { channel: "whatsapp" })}
          className="text-gold no-underline hover:underline"
        >
          {t("footer.whatsapp")}
        </a>
        <br />
        <span>
          {site.website} · {t("footer.berlin")}
        </span>
        <br />
        <LocaleLink to="/privacy" className="text-muted-warm no-underline hover:underline">
          {t("footer.privacy")}
        </LocaleLink>
        <span aria-hidden="true"> · </span>
        <LocaleLink to="/terms" className="text-muted-warm no-underline hover:underline">
          {t("footer.terms")}
        </LocaleLink>
      </div>
    </footer>
  );
}

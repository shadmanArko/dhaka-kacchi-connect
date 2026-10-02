import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Menu, X } from "lucide-react";
import { nav, orderCTA, site } from "@/content/site";
import { LocaleLink } from "@/components/layout/LocaleLink";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useScrolled } from "@/hooks/useScrolled";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";
import logo from "@/assets/photos/logo-nav.webp";

export function SiteHeader() {
  const { t } = useTranslation();
  const scrolled = useScrolled();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const session = useSession();
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Closing from inside the menu (Escape, backdrop tap) must hand focus back
  // to the button that opened it - otherwise it falls to <body> and a
  // keyboard user has lost their place. A link click navigates, so focus
  // there is the new page's business, not ours.
  const closeMenu = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) menuButtonRef.current?.focus();
  }, []);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // While the menu is open it is modal in effect (it covers the whole
  // screen), so it has to be modal for the keyboard and screen readers too:
  //  - Escape closes it.
  //  - Everything behind it is made `inert` (unfocusable, unclickable, hidden
  //    from the accessibility tree). That IS the focus trap: Tab can only
  //    reach the header (logo, menu button) and the menu's own links, instead
  //    of walking off into the page underneath. It is simpler and more robust
  //    than a hand-rolled trap, and needs no extra tab-stop sentinels. Pages
  //    opt their regions in with data-menu-inert (<main>, footer, skip link).
  //    The cookie banner is deliberately NOT opted in: it sits above the menu
  //    and a visitor must still be able to answer it.
  //  - If the viewport grows past the menu's breakpoint while it is open (a
  //    phone rotated to landscape/tablet), the overlay disappears via CSS but
  //    the state would not - leaving the page inert behind nothing - so close.
  useEffect(() => {
    if (!open) return;
    const behind = Array.from(document.querySelectorAll<HTMLElement>("[data-menu-inert]"));
    for (const el of behind) el.inert = true;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu(true);
    };
    const desktop = window.matchMedia("(min-width: 768px)");
    const onBreakpoint = (event: MediaQueryListEvent) => {
      if (event.matches) closeMenu(false);
    };
    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onBreakpoint);
    return () => {
      for (const el of behind) el.inert = false;
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onBreakpoint);
    };
  }, [open, closeMenu]);

  return (
    <>
      <header
        className={cn(
          "fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 md:px-12",
          "transition-[background,border-color,height] duration-300",
          scrolled
            ? "h-[60px] bg-black-ink/95 border-b border-line backdrop-blur-md"
            : "h-[72px] bg-transparent border-b border-transparent",
        )}
      >
        <LocaleLink
          to="/"
          aria-label={t("a11y.homeLink", { name: site.name })}
          className="flex items-center shrink-0"
        >
          <img
            src={logo}
            alt={site.name}
            width={216}
            height={144}
            className="h-12 w-auto object-contain"
            style={{ filter: "invert(1) sepia(1) saturate(2) hue-rotate(5deg) brightness(1.1)" }}
          />
        </LocaleLink>

        <nav aria-label={t("a11y.primaryNav")} className="hidden md:flex items-center gap-8">
          {nav.map((item) => (
            <LocaleLink
              key={item.to}
              to={item.to}
              activeOptions={{ exact: true }}
              activeProps={{ className: "text-gold" }}
              inactiveProps={{ className: "text-muted-warm hover:text-gold" }}
              className="font-sans text-[0.72rem] uppercase tracking-[0.15em] transition-colors whitespace-nowrap"
            >
              {t(item.labelKey)}
            </LocaleLink>
          ))}
          {/* Signed-in customers only. The page redirects anyone else away, so
              showing this to a logged-out visitor would just be a dead end.
              `nav` in content/site.ts stays static - it's shared with the
              mobile menu and has no notion of a session. Not locale-prefixed:
              a signed-in customer's own order history isn't translated (see
              scripts/build-static.mjs ROUTES). */}
          {session.customer && (
            <Link
              to="/orders"
              search={{ order: undefined }}
              activeProps={{ className: "text-gold" }}
              inactiveProps={{ className: "text-muted-warm hover:text-gold" }}
              className="font-sans text-[0.72rem] uppercase tracking-[0.15em] transition-colors whitespace-nowrap"
            >
              {t("nav.myOrders")}
            </Link>
          )}
          <LocaleLink
            to={orderCTA.to}
            className="inline-flex items-center gap-2 border border-gold text-gold px-6 py-2.5 font-sans text-[0.72rem] uppercase tracking-[0.15em] transition-colors hover:bg-gold hover:text-black-ink"
          >
            {t(orderCTA.labelKey)}
          </LocaleLink>
          <LanguageSwitcher />
        </nav>

        <button
          ref={menuButtonRef}
          className="md:hidden text-gold p-2"
          aria-label={open ? t("common.closeMenu") : t("common.openMenu")}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Mobile menu. `inert` when closed is load-bearing, not decoration:
          opacity-0 + pointer-events-none hides it from sight and the mouse but
          leaves its 5 links in the tab order and the accessibility tree, so a
          keyboard or screen-reader user on a phone tabbed through five
          invisible links on every page. */}
      <div
        id="mobile-menu"
        inert={!open}
        aria-hidden={!open}
        className={cn(
          "fixed inset-0 z-40 md:hidden bg-black-ink/95 backdrop-blur-lg transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={() => closeMenu(true)}
      >
        <nav
          aria-label={t("a11y.mobileNav")}
          className="flex flex-col items-center justify-center h-full gap-8"
          onClick={(e) => e.stopPropagation()}
        >
          {nav.map((item) => (
            <LocaleLink
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="font-serif text-3xl text-cream hover:text-gold"
            >
              {t(item.labelKey)}
            </LocaleLink>
          ))}
          <LocaleLink
            to={orderCTA.to}
            onClick={() => setOpen(false)}
            className="mt-4 border border-gold text-gold px-8 py-3 font-sans text-sm uppercase tracking-[0.2em] hover:bg-gold hover:text-black-ink"
          >
            {t(orderCTA.labelKey)}
          </LocaleLink>
          <LanguageSwitcher />
        </nav>
      </div>
    </>
  );
}

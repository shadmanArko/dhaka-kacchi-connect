import { useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { nav, orderCTA, site } from "@/content/site";
import { useScrolled } from "@/hooks/useScrolled";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo-nav.png.asset.json";

export function SiteHeader() {
  const scrolled = useScrolled();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

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
        <Link to="/" aria-label={`${site.name} — Home`} className="flex items-center shrink-0">
          <img
            src={logo.url}
            alt={site.name}
            className="h-12 w-auto object-contain"
            style={{ filter: "invert(1) sepia(1) saturate(2) hue-rotate(5deg) brightness(1.1)" }}
          />
        </Link>

        <nav aria-label="Primary" className="hidden md:flex items-center gap-8">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: true }}
              activeProps={{ className: "text-gold" }}
              inactiveProps={{ className: "text-muted-warm hover:text-gold" }}
              className="font-sans text-[0.72rem] uppercase tracking-[0.15em] transition-colors whitespace-nowrap"
            >
              {item.label}
            </Link>
          ))}
          <Link
            to={orderCTA.to}
            className="inline-flex items-center gap-2 border border-gold text-gold px-6 py-2.5 font-sans text-[0.72rem] uppercase tracking-[0.15em] transition-colors hover:bg-gold hover:text-black-ink"
          >
            {orderCTA.label}
          </Link>
        </nav>

        <button
          className="md:hidden text-gold p-2"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Mobile menu */}
      <div
        className={cn(
          "fixed inset-0 z-40 md:hidden bg-black-ink/95 backdrop-blur-lg transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={() => setOpen(false)}
      >
        <nav
          aria-label="Mobile"
          className="flex flex-col items-center justify-center h-full gap-8"
          onClick={(e) => e.stopPropagation()}
        >
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="font-serif text-3xl text-cream hover:text-gold"
            >
              {item.label}
            </Link>
          ))}
          <Link
            to={orderCTA.to}
            onClick={() => setOpen(false)}
            className="mt-4 border border-gold text-gold px-8 py-3 font-sans text-sm uppercase tracking-[0.2em] hover:bg-gold hover:text-black-ink"
          >
            {orderCTA.label}
          </Link>
        </nav>
      </div>
    </>
  );
}

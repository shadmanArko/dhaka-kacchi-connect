import { Link } from "@tanstack/react-router";
import { site } from "@/content/site";
import logo from "@/assets/logo-nav.png";

export function SiteFooter() {
  return (
    <footer className="grid grid-cols-1 md:grid-cols-3 items-center gap-6 border-t border-line bg-deep px-6 md:px-14 py-14 text-center md:text-left">
      <div className="flex justify-center md:justify-start">
        <Link to="/" aria-label={`${site.name} — Home`}>
          <img
            src={logo}
            alt={site.name}
            className="h-14 w-auto object-contain opacity-85 hover:opacity-100 transition-opacity"
            style={{ filter: "invert(1) sepia(1) saturate(2) hue-rotate(5deg) brightness(1.1)" }}
          />
        </Link>
      </div>

      <div className="font-sans text-[0.76rem] leading-[1.8] text-muted-warm text-center">
        Authentic Kacchi &amp; Borhani — {site.location}
        <br />
        <span className="text-surface-foreground/60">
          © {new Date().getFullYear()} {site.name} · All rights reserved
        </span>
      </div>

      <div className="font-sans text-[0.76rem] leading-[1.8] text-muted-warm md:text-right text-center">
        <a href={`mailto:${site.email}`} className="text-gold no-underline hover:underline">
          {site.email}
        </a>
        <br />
        <span>{site.website} · Berlin</span>
      </div>
    </footer>
  );
}

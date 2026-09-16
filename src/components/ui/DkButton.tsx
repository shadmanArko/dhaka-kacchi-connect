import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createLink } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const base =
  "inline-flex items-center gap-4 font-sans text-[0.8rem] tracking-[0.25em] uppercase font-normal transition-all duration-300 no-underline";

const gold =
  "bg-gold text-black-ink px-16 py-[22px] hover:-translate-y-0.5 hover:bg-gold-2 hover:shadow-[0_24px_60px_rgba(200,169,110,.35)] active:translate-y-0 active:bg-gold-3 active:text-cream";
const ghost =
  "border border-gold/40 text-cream px-9 py-[18px] hover:border-gold hover:text-gold hover:-translate-y-0.5 active:translate-y-0 active:bg-gold/15";
const goldSmall =
  "bg-gold text-black-ink px-12 py-4 hover:-translate-y-0.5 hover:bg-gold-2 active:translate-y-0 active:bg-gold-3 active:text-cream";

type Variant = "gold" | "ghost" | "goldSmall";
const variants: Record<Variant, string> = { gold, ghost, goldSmall };

type CommonProps = { variant?: Variant; children: ReactNode; className?: string };

type LinkProps = CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
type BtnProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

export const AnchorButton = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ variant = "gold", className, children, ...rest }, ref) => (
    <a ref={ref} className={cn(base, variants[variant], className)} {...rest}>
      {children}
    </a>
  ),
);
AnchorButton.displayName = "AnchorButton";

/**
 * AnchorButton with client-side routing - use this for INTERNAL destinations
 * and plain AnchorButton for external ones (WhatsApp, Instagram, mailto).
 *
 * It exists because the obvious composition is invalid HTML. Wrapping
 * `<AnchorButton href="/order">` in `<Link to="/order">` renders an `<a>`
 * inside an `<a>`, which no browser will parse as written: the parser closes
 * the outer anchor early, so the DOM built from our prerendered HTML does not
 * match the tree React expects and hydration fails outright (React #418 -
 * "Hydration failed because the server rendered HTML didn't match the
 * client"). That fired on every homepage load, and React's recovery is to
 * throw away the server markup for that subtree and re-render it on the
 * client, which quietly gives back part of what prerendering is for.
 *
 * createLink is TanStack Router's supported way to make an existing
 * anchor-like component routable. AnchorButton already forwards its ref and
 * spreads the rest onto the `<a>`, which is exactly the contract createLink
 * needs, so the result is ONE anchor carrying both the styling and the
 * router's navigation handlers.
 *
 * Takes `to` (typed against the route tree), not `href`.
 */
export const ButtonLink = createLink(AnchorButton);

export const Button = forwardRef<HTMLButtonElement, BtnProps>(
  ({ variant = "gold", className, children, ...rest }, ref) => (
    <button ref={ref} className={cn(base, variants[variant], className)} {...rest}>
      {children}
    </button>
  ),
);
Button.displayName = "Button";

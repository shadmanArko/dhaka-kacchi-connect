import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "@/components/ui/Typography";
import { AnchorButton } from "@/components/ui/DkButton";

type Props = {
  eyebrow: string;
  title: ReactNode;
  body: string;
  ctaLabel: string;
  ctaTo: "/subscribe" | "/order" | "/about";
  footnote?: string;
};

export function CTASection({ eyebrow, title, body, ctaLabel, ctaTo, footnote }: Props) {
  return (
    <section className="border-t border-line bg-black-ink py-24 md:py-32 px-6 md:px-14 text-center">
      <Reveal className="max-w-[720px] mx-auto">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="font-serif font-light text-cream leading-[1.1] text-[clamp(2.5rem,5.5vw,4.2rem)] mb-4 [&_em]:not-italic [&_em]:italic [&_em]:text-gold">
          {title}
        </h2>
        <p className="font-sans text-[0.95rem] leading-[1.85] text-muted-warm mb-12">{body}</p>
        <Link to={ctaTo} className="contents">
          <AnchorButton href={ctaTo} variant="gold">
            <span>{ctaLabel}</span>
            <span aria-hidden>→</span>
          </AnchorButton>
        </Link>
        {footnote && (
          <p className="mt-9 font-sans text-[0.7rem] uppercase tracking-[0.3em] text-muted-warm">
            {footnote}
          </p>
        )}
      </Reveal>
    </section>
  );
}

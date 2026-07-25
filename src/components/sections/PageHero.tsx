import { type ReactNode } from "react";
import { GoldRule } from "@/components/ui/Typography";

type Props = { eyebrow: string; title: ReactNode; body?: string };

export function PageHero({ eyebrow, title, body }: Props) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-black-ink to-deep min-h-[52vh] flex flex-col items-center justify-center text-center px-6 md:px-14 pt-36 pb-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center 40%, rgba(200,169,110,0.07) 0%, transparent 70%)",
        }}
      />
      <div className="relative z-10 max-w-[800px]">
        <span className="block mb-6 font-sans text-[0.68rem] uppercase tracking-[0.4em] text-gold">
          {eyebrow}
        </span>
        <h1 className="font-serif font-light text-cream leading-[1.05] text-[clamp(2.6rem,5vw,4.8rem)] [&_em]:not-italic [&_em]:italic [&_em]:text-gold">
          {title}
        </h1>
        {body && (
          <>
            <GoldRule className="mx-auto" />
            <p className="max-w-[520px] mx-auto font-sans text-[0.96rem] leading-[1.95] text-muted-warm">
              {body}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

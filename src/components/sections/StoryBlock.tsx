import { type ReactNode } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow, PullQuote, SectionTitle, Tag } from "@/components/ui/Typography";
import { cn } from "@/lib/utils";

type Props = {
  eyebrow: string;
  title: ReactNode;
  paragraphs: string[];
  quote?: string;
  tags?: string[];
  image: { url: string; alt: string };
  badge?: { value: string; label: string };
  reverse?: boolean;
  background?: "black" | "deep";
  children?: ReactNode;
};

export function StoryBlock({
  eyebrow,
  title,
  paragraphs,
  quote,
  tags,
  image,
  badge,
  reverse,
  background = "black",
  children,
}: Props) {
  return (
    <section
      className={cn(
        "border-t border-line py-24 md:py-32 px-6 md:px-14",
        background === "deep" ? "bg-deep" : "bg-black-ink",
      )}
    >
      <div
        className={cn(
          "max-w-[1200px] mx-auto grid gap-16 md:gap-24 items-center",
          "md:grid-cols-2",
          reverse && "md:[&>*:first-child]:order-2",
        )}
      >
        <Reveal className="relative">
          <img
            src={image.url}
            alt={image.alt}
            loading="lazy"
            decoding="async"
            className="block w-full aspect-[4/3] object-cover border border-line rounded-[2px]"
          />
          {badge && (
            <div className="absolute -bottom-6 -right-6 bg-surface border border-gold px-7 py-5 text-center z-[2]">
              <span className="block font-serif text-[2.2rem] text-gold leading-none">
                {badge.value}
              </span>
              <small className="font-sans text-[0.62rem] uppercase tracking-[0.15em] text-muted-warm">
                {badge.label}
              </small>
            </div>
          )}
        </Reveal>

        <Reveal>
          <Eyebrow>{eyebrow}</Eyebrow>
          <SectionTitle className="mb-6">{title}</SectionTitle>
          {paragraphs.map((p, i) => (
            <p key={i} className="font-sans text-[0.95rem] leading-[2] text-muted-warm mb-5">
              {p}
            </p>
          ))}
          {quote && <PullQuote>{quote}</PullQuote>}
          {tags && (
            <div className="flex flex-wrap gap-2.5 mt-7">
              {tags.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>
          )}
          {children}
        </Reveal>
      </div>
    </section>
  );
}

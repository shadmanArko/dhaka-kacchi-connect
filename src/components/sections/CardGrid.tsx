import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow, SectionTitle } from "@/components/ui/Typography";
import type { WhyCard } from "@/content/whyUs";

type Props = {
  eyebrow: string;
  title: React.ReactNode;
  cards: WhyCard[];
};

export function CardGrid({ eyebrow, title, cards }: Props) {
  const cols = cards.length >= 6 ? 3 : cards.length >= 3 ? 3 : 2;
  return (
    <section className="border-t border-line bg-deep py-24 md:py-32 px-6 md:px-14">
      <Reveal className="max-w-[1200px] mx-auto mb-14 md:mb-16">
        <Eyebrow>{eyebrow}</Eyebrow>
        <SectionTitle>{title}</SectionTitle>
      </Reveal>

      <div
        className={`max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${cols} border border-line`}
      >
        {cards.map((c, i) => (
          <Reveal
            key={c.title}
            delayMs={i * 90}
            className="group relative p-10 md:p-12 border-b border-line last:border-b-0 md:[&:nth-last-child(-n+2)]:border-b-0 lg:[&:nth-last-child(-n+3)]:border-b-0 md:border-r md:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-child(2n)]:border-r transition-colors hover:bg-gold/[0.04]"
          >
            <span
              aria-hidden
              className="absolute top-0 left-0 h-0.5 w-0 bg-gold transition-[width] duration-500 group-hover:w-full"
            />
            <span className="block font-serif text-[0.85rem] tracking-[0.15em] text-gold-3 mb-5">
              {c.number} —
            </span>
            <span className="block text-[1.9rem] leading-none mb-4">{c.icon}</span>
            <h3 className="font-serif font-normal text-cream text-[1.5rem] leading-[1.2] mb-3.5">
              {c.title}
            </h3>
            <p className="font-sans text-[0.88rem] leading-[1.85] text-muted-warm">{c.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
